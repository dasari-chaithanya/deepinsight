import json
import logging
import asyncio
from typing import Callable, Awaitable
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger(__name__)

# ─── Schemas ─────────────────────────────────────────────────────────────────

TIMELINE_SCHEMA = {
    "type": "object",
    "properties": {
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "timestamp": {
                        "type": "string",
                        "description": "Start timestamp of the section in MM:SS format",
                    },
                    "title": {
                        "type": "string",
                        "description": "Semantic title for this section",
                    },
                    "explanation": {
                        "type": "string",
                        "description": "Brief explanation of what is discussed",
                    },
                    "speaker": {
                        "type": "string",
                        "description": "Identify the speaker if possible (e.g. Host, Guest Name)",
                    },
                },
                "required": ["timestamp", "title", "explanation"],
            },
        }
    },
    "required": ["sections"],
}

KNOWLEDGE_NOTES_SCHEMA = {
    "type": "object",
    "properties": {
        "main_topic": {"type": "string"},
        "core_concepts": {"type": "array", "items": {"type": "string"}},
        "key_insights": {"type": "array", "items": {"type": "string"}},
        "important_examples": {"type": "array", "items": {"type": "string"}},
        "actionable_takeaways": {"type": "array", "items": {"type": "string"}},
        "important_quotes": {"type": "array", "items": {"type": "string"}},
        "technical_terms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "term": {"type": "string"},
                    "definition": {"type": "string"},
                },
                "required": ["term", "definition"],
            },
        },
        "common_mistakes": {"type": "array", "items": {"type": "string"}},
        "final_summary": {"type": "string"},
    },
    "required": [
        "main_topic",
        "core_concepts",
        "key_insights",
        "important_examples",
        "actionable_takeaways",
        "important_quotes",
        "technical_terms",
        "common_mistakes",
        "final_summary",
    ],
}

QUICK_REVISION_SCHEMA = {
    "type": "object",
    "properties": {
        "bullets": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Exactly 10 ultra-condensed bullet points for quick skim-friendly revision",
        }
    },
    "required": ["bullets"],
}

DETAILED_SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "detailed_summary": {
            "type": "string",
            "description": "A grammatically well-organized, structured description of the video with respect to the timestamp transcription.",
        }
    },
    "required": ["detailed_summary"],
}


# ─── Utilities ───────────────────────────────────────────────────────────────

def chunk_transcript(transcript: str, max_chars: int = 150_000) -> list[str]:
    """
    Split a very long transcript into chunks.
    Default max_chars is ~150k to stay well within token limits and allow safe processing.
    """
    if len(transcript) <= max_chars:
        return [transcript]

    chunks = []
    current_pos = 0

    while current_pos < len(transcript):
        end_pos = current_pos + max_chars
        if end_pos >= len(transcript):
            chunks.append(transcript[current_pos:])
            break

        # Try to break at a newline to preserve timestamp lines like [12:34 - 12:40]
        search_start = max(end_pos - 5000, current_pos)
        last_newline = transcript.rfind("\n[", search_start, end_pos)
        
        if last_newline > current_pos:
            end_pos = last_newline
        else:
            last_period = transcript.rfind(". ", search_start, end_pos)
            if last_period > current_pos:
                end_pos = last_period + 2
                
        chunks.append(transcript[current_pos:end_pos])
        current_pos = end_pos

    logger.info(f"Split transcript into {len(chunks)} chunks")
    return chunks


def _extract_json_from_text(text: str) -> dict | list | None:
    """Extract JSON object or array from AI response text."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    import re
    pattern = r"```(?:json)?\s*\n?(.*?)\n?\s*```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find a JSON object
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        try:
            return json.loads(text[first_brace : last_brace + 1])
        except json.JSONDecodeError:
            pass

    # Try to find a JSON array
    first_bracket = text.find("[")
    last_bracket = text.rfind("]")
    if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
        try:
            return json.loads(text[first_bracket : last_bracket + 1])
        except json.JSONDecodeError:
            pass

    return None


async def _call_gemini_with_retry(
    client, prompt: str, schema: dict, max_retries: int = 3
) -> dict:
    """Helper to call Gemini and enforce JSON schema parsing."""
    last_error = ""
    for attempt in range(1, max_retries + 1):
        try:
            retry_hint = ""
            if attempt > 1 and last_error:
                retry_hint = f"\n\nPREVIOUS ERROR: {last_error}\nPlease return ONLY valid JSON matching the exact schema."

            response = await asyncio.to_thread(
                client.models.generate_content,
                model=settings.GEMINI_MODEL,
                contents=prompt + retry_hint,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=8192,
                ),
            )
            
            if not response.text:
                raise ValueError("Empty response")

            parsed = _extract_json_from_text(response.text)
            if parsed is None:
                raise ValueError("Could not parse JSON")
                
            return parsed
        except Exception as e:
            last_error = str(e)
            logger.warning(f"Gemini API attempt {attempt} failed: {e}")
            if attempt < max_retries:
                await asyncio.sleep(1.5 * attempt)

    raise ValueError(f"Failed to generate valid output after {max_retries} attempts. Last error: {last_error}")


# ─── Stages ──────────────────────────────────────────────────────────────────

async def _stage_clean_transcript(client, chunk: str) -> str:
    """Stage 1: Clean transcript punctuation without rewriting words or losing timestamps."""
    prompt = f"""You are an expert audio transcription editor. 
Please clean up the following raw transcript.
RULES:
1. Preserve semantic accuracy and transcript alignment.
2. Do NOT aggressively rewrite spoken content.
3. Fix punctuation and capitalization.
4. Remove excessive stutters or filler words (um, ah) ONLY if it improves readability without altering meaning.
5. You MUST preserve the exact timestamp markers (e.g., [00:12 - 00:15]). Do not remove or alter timestamps.

RAW TRANSCRIPT:
{chunk}

Return the cleaned transcript text directly, without markdown or preamble."""
    
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=8192),
    )
    return response.text.strip()


async def _stage_extract_timeline(client, chunk: str, duration: float = 0, chunk_index: int = 0, total_chunks: int = 1) -> list[dict]:
    """Stage 2: Hybrid semantic timeline segmentation."""
    # Detect if the transcript contains timestamp markers
    import re
    has_timestamps = bool(re.search(r'\[\d{1,2}:\d{2}', chunk))
    
    if has_timestamps:
        prompt = f"""Analyze the following timestamped transcript chunk and extract a meaningful timeline of topics discussed.
Use the timestamp markers present in the text (e.g. [00:12], [01:30 - 01:45]).
If a single topic spans multiple timestamp blocks, group them into one section using the start timestamp.
Include speaker attribution if possible (e.g. Host, Guest).

TRANSCRIPT CHUNK:
{chunk}

Return a JSON object matching the requested schema."""
    else:
        # No timestamps — estimate based on video duration
        duration_mins = int(duration / 60) if duration > 0 else 5
        chunk_start_mins = int((chunk_index / max(total_chunks, 1)) * duration_mins)
        chunk_end_mins = int(((chunk_index + 1) / max(total_chunks, 1)) * duration_mins)
        
        prompt = f"""Analyze the following transcript chunk and break it into a meaningful timeline of major topics discussed.
This transcript does NOT contain timestamp markers.
The video is approximately {duration_mins} minutes long.
This chunk covers approximately {chunk_start_mins}:00 to {chunk_end_mins}:00 in the video.

INSTRUCTIONS:
1. Divide the content into 4-8 logical sections based on topic changes.
2. Estimate approximate timestamps in MM:SS format based on position in the text.
3. Give each section a clear, descriptive title.
4. Include a 1-2 sentence explanation of what is discussed.
5. Include speaker names if you can identify them.

TRANSCRIPT CHUNK:
{chunk}

Return a JSON object matching the requested schema."""

    result = await _call_gemini_with_retry(client, prompt, TIMELINE_SCHEMA)
    if isinstance(result, list):
        return result
    return result.get("sections", [])


async def _stage_extract_knowledge(client, chunk: str) -> dict:
    """Stage 3: Extract highly structured study notes."""
    prompt = f"""Extract structured educational knowledge notes from the following transcript chunk.
Identify the main topic, core concepts, key insights, important examples, actionable takeaways, quotes, technical terms, and common mistakes.

TRANSCRIPT CHUNK:
{chunk}

Return a JSON object matching the requested schema."""
    return await _call_gemini_with_retry(client, prompt, KNOWLEDGE_NOTES_SCHEMA)


async def _merge_knowledge_notes(client, partial_notes: list[dict]) -> dict:
    """Deduplicate and merge knowledge notes from multiple chunks."""
    if len(partial_notes) == 1:
        return partial_notes[0]

    prompt = f"""I have extracted structured knowledge notes from several chunks of a long video. 
Please merge them into a single, unified, coherent set of educational notes.
CRITICAL: You MUST implement semantic deduplication. Do NOT repeat insights, concepts, or examples. Merge overlapping concepts intelligently.

PARTIAL NOTES:
{json.dumps(partial_notes, indent=2)}

Return a unified JSON object matching the requested schema."""
    return await _call_gemini_with_retry(client, prompt, KNOWLEDGE_NOTES_SCHEMA)


async def _stage_extract_revision_notes(client, knowledge_notes: dict) -> list[str]:
    """Stage 4: Quick revision notes (study mode)."""
    prompt = f"""Based on these structured notes, generate EXACTLY 10 ultra-condensed, skim-friendly bullet points for quick revision.

NOTES:
{json.dumps(knowledge_notes)}

Return a JSON object matching the requested schema."""
    result = await _call_gemini_with_retry(client, prompt, QUICK_REVISION_SCHEMA)
    if isinstance(result, list):
        return result
    return result.get("bullets", [])


async def _stage_extract_detailed_summary(client, knowledge_notes: dict) -> str:
    """Stage 5: Detailed Structured Summary."""
    prompt = f"""Based on these structured notes, write a grammatically correct, well-organized, and structured detailed description of the video. 
Reference the flow of the video intelligently.

NOTES:
{json.dumps(knowledge_notes)}

Return a JSON object matching the requested schema."""
    result = await _call_gemini_with_retry(client, prompt, DETAILED_SUMMARY_SCHEMA)
    if isinstance(result, str):
        return result
    return result.get("detailed_summary", "")


# ─── Main Pipeline Orchestrator ─────────────────────────────────────────────

async def run_full_analysis_pipeline(
    transcript: str,
    title: str = "",
    channel: str = "",
    duration: float = 0,
    progress_callback: Callable[[int, str], Awaitable[None]] = None,
) -> dict:
    """
    Executes the multi-stage AI analysis pipeline.
    Implements map-reduce for long transcripts.
    """
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    async def report(pct: int, msg: str):
        if progress_callback:
            await progress_callback(pct, msg)

    # 1. Chunking
    await report(65, "Chunking transcript for safe processing...")
    chunks = chunk_transcript(transcript)
    
    # 2. Stage 1: Clean Transcript
    await report(68, "Stage 1/5: Cleaning transcript formatting...")
    # Clean concurrently
    clean_tasks = [_stage_clean_transcript(client, c) for c in chunks]
    cleaned_chunks = await asyncio.gather(*clean_tasks)
    
    # We won't return the full giant cleaned transcript to the DB to save space,
    # but we will use the cleaned chunks for subsequent stages.

    # 3. Stage 2: Timeline Segmentation
    await report(73, "Stage 2/5: Extracting semantic timeline...")
    num_chunks = len(cleaned_chunks)
    timeline_tasks = [
        _stage_extract_timeline(client, c, duration=duration, chunk_index=i, total_chunks=num_chunks)
        for i, c in enumerate(cleaned_chunks)
    ]
    partial_timelines = await asyncio.gather(*timeline_tasks)
    
    # Flatten timelines
    final_timeline = []
    for pt in partial_timelines:
        final_timeline.extend(pt)
        
    # (Optional) If there are many chunks, we could do a secondary pass to merge 
    # adjacent timeline blocks with the exact same topic, but flattening is usually 
    # fine since chunk boundaries are small.

    # 4. Stage 3: Knowledge Extraction
    await report(80, "Stage 3/5: Extracting structured knowledge notes...")
    knowledge_tasks = [_stage_extract_knowledge(client, c) for c in cleaned_chunks]
    partial_notes = await asyncio.gather(*knowledge_tasks)
    
    await report(88, "Deduplicating and merging insights...")
    final_knowledge = await _merge_knowledge_notes(client, partial_notes)

    # 5. Stage 4 & 5: Revision Notes & Detailed Summary
    await report(92, "Stage 4/5: Generating quick revision study notes...")
    revision_notes = await _stage_extract_revision_notes(client, final_knowledge)

    await report(96, "Stage 5/5: Generating detailed summary...")
    detailed_summary = await _stage_extract_detailed_summary(client, final_knowledge)

    await report(99, "Finalizing analysis schema...")
    
    # Build the final deterministic AnalysisResult schema
    return {
        "timeline": final_timeline,
        "knowledge_notes": final_knowledge,
        "quick_revision_notes": revision_notes,
        "detailed_summary": detailed_summary,
    }
