import os
import math
import asyncio
import logging
from pathlib import Path
from app.config import settings

logger = logging.getLogger(__name__)


async def chunk_audio_if_needed(audio_path: str) -> list[str]:
    """
    Check if the audio file exceeds the max chunk size (20MB).
    If so, split it into 10-minute chunks using pydub.
    Returns a list of file paths (either the original or the chunks).
    """
    file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)

    if file_size_mb <= settings.MAX_AUDIO_CHUNK_SIZE_MB:
        logger.info(
            f"Audio file is {file_size_mb:.1f}MB, no chunking needed"
        )
        return [audio_path]

    logger.info(
        f"Audio file is {file_size_mb:.1f}MB, chunking into "
        f"{settings.AUDIO_CHUNK_DURATION_MINUTES}-minute segments"
    )

    def _split():
        from pydub import AudioSegment

        audio = AudioSegment.from_mp3(audio_path)
        chunk_duration_ms = settings.AUDIO_CHUNK_DURATION_MINUTES * 60 * 1000
        total_duration_ms = len(audio)
        num_chunks = math.ceil(total_duration_ms / chunk_duration_ms)

        chunk_paths = []
        base_path = Path(audio_path)
        stem = base_path.stem

        for i in range(num_chunks):
            start_ms = i * chunk_duration_ms
            end_ms = min((i + 1) * chunk_duration_ms, total_duration_ms)
            chunk = audio[start_ms:end_ms]

            chunk_path = str(base_path.parent / f"{stem}_chunk_{i:03d}.mp3")
            chunk.export(chunk_path, format="mp3", bitrate="128k")
            chunk_paths.append(chunk_path)
            logger.info(
                f"Created chunk {i + 1}/{num_chunks}: {chunk_path} "
                f"({(end_ms - start_ms) / 1000:.0f}s)"
            )

        return chunk_paths

    return await asyncio.to_thread(_split)


async def transcribe_audio(audio_path: str) -> dict:
    """
    Transcribe a single audio file using Groq Whisper API.
    Returns dict with 'text' and 'segments' (timestamped).
    """
    from groq import Groq

    client = Groq(api_key=settings.GROQ_API_KEY)

    def _transcribe():
        with open(audio_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model=settings.GROQ_WHISPER_MODEL,
                file=audio_file,
                response_format="verbose_json",
                language="en",
            )

        # response is a Transcription object
        result = {
            "text": response.text or "",
            "segments": [],
        }

        # Extract segments with timestamps if available
        if hasattr(response, "segments") and response.segments:
            for seg in response.segments:
                result["segments"].append(
                    {
                        "start": getattr(seg, "start", 0),
                        "end": getattr(seg, "end", 0),
                        "text": getattr(seg, "text", ""),
                    }
                )

        return result

    return await asyncio.to_thread(_transcribe)


async def transcribe_with_chunks(audio_path: str) -> dict:
    """
    Full transcription pipeline:
    1. Chunk audio if needed
    2. Transcribe each chunk
    3. Merge results with adjusted timestamps
    Returns combined transcript dict with 'text' and 'segments'.
    """
    chunk_paths = await chunk_audio_if_needed(audio_path)

    all_text_parts: list[str] = []
    all_segments: list[dict] = []
    time_offset: float = 0.0

    for i, chunk_path in enumerate(chunk_paths):
        logger.info(f"Transcribing chunk {i + 1}/{len(chunk_paths)}: {chunk_path}")

        try:
            result = await transcribe_audio(chunk_path)
        except Exception as e:
            logger.error(f"Failed to transcribe chunk {i + 1}: {e}")
            raise ValueError(
                f"Transcription failed on chunk {i + 1}/{len(chunk_paths)}: {e}"
            )

        all_text_parts.append(result["text"])

        # Adjust segment timestamps by the cumulative offset
        for seg in result.get("segments", []):
            adjusted_seg = {
                "start": seg["start"] + time_offset,
                "end": seg["end"] + time_offset,
                "text": seg["text"],
            }
            all_segments.append(adjusted_seg)

        # Calculate offset for the next chunk
        # Use the actual audio duration of this chunk
        if result.get("segments"):
            last_end = max(s["end"] for s in result["segments"])
            time_offset += last_end
        else:
            # Fallback: estimate from chunk duration setting
            time_offset += settings.AUDIO_CHUNK_DURATION_MINUTES * 60

        # Clean up chunk file (but not the original)
        if chunk_path != audio_path and os.path.exists(chunk_path):
            try:
                os.remove(chunk_path)
            except OSError:
                pass

    combined = {
        "text": " ".join(all_text_parts),
        "segments": all_segments,
    }

    logger.info(
        f"Transcription complete: {len(combined['text'])} chars, "
        f"{len(combined['segments'])} segments"
    )

    return combined


def format_transcript_with_timestamps(segments: list[dict]) -> str:
    """Format transcript segments with timestamps for analysis context."""
    if not segments:
        return ""

    lines = []
    for seg in segments:
        start_sec = seg.get("start", 0)
        minutes = int(start_sec // 60)
        seconds = int(start_sec % 60)
        timestamp = f"[{minutes:02d}:{seconds:02d}]"
        text = seg.get("text", "").strip()
        if text:
            lines.append(f"{timestamp} {text}")

    return "\n".join(lines)
