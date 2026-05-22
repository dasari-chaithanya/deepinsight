import re
import os
import asyncio
import logging
from pathlib import Path
from app.config import settings

logger = logging.getLogger(__name__)

# YouTube URL patterns
YOUTUBE_PATTERNS = [
    re.compile(
        r"(?:https?://)?(?:www\.)?youtube\.com/watch\?v=(?P<id>[a-zA-Z0-9_-]{11})"
    ),
    re.compile(
        r"(?:https?://)?(?:www\.)?youtube\.com/embed/(?P<id>[a-zA-Z0-9_-]{11})"
    ),
    re.compile(
        r"(?:https?://)?(?:www\.)?youtube\.com/v/(?P<id>[a-zA-Z0-9_-]{11})"
    ),
    re.compile(
        r"(?:https?://)?(?:www\.)?youtube\.com/shorts/(?P<id>[a-zA-Z0-9_-]{11})"
    ),
    re.compile(
        r"(?:https?://)?youtu\.be/(?P<id>[a-zA-Z0-9_-]{11})"
    ),
    re.compile(
        r"(?:https?://)?(?:www\.)?youtube\.com/live/(?P<id>[a-zA-Z0-9_-]{11})"
    ),
]


def extract_video_id(url: str) -> str | None:
    """Extract the YouTube video ID from various URL formats."""
    url = url.strip()
    for pattern in YOUTUBE_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group("id")
    return None


def validate_youtube_url(url: str) -> tuple[bool, str | None, str]:
    """
    Validate a YouTube URL and extract the video ID.
    Returns (is_valid, video_id, error_message).
    """
    if not url or not url.strip():
        return False, None, "URL is required"

    video_id = extract_video_id(url)
    if not video_id:
        return False, None, "Invalid YouTube URL. Please provide a valid YouTube video link."

    return True, video_id, ""


async def get_video_metadata(url: str) -> dict:
    """
    Extract video metadata using yt-dlp without downloading.
    Runs yt-dlp in a thread to avoid blocking the event loop.
    """
    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "no_color": True,
    }

    def _extract():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except yt_dlp.utils.DownloadError as e:
                error_msg = str(e).lower()
                if "private" in error_msg:
                    raise ValueError("This video is private and cannot be accessed.")
                elif "unavailable" in error_msg or "not available" in error_msg:
                    raise ValueError("This video is unavailable.")
                elif "removed" in error_msg:
                    raise ValueError("This video has been removed.")
                elif "age" in error_msg:
                    raise ValueError(
                        "This video is age-restricted and cannot be processed."
                    )
                elif "live" in error_msg and "not" not in error_msg:
                    raise ValueError("Live streams cannot be processed.")
                elif "copyright" in error_msg:
                    raise ValueError(
                        "This video is blocked due to copyright restrictions."
                    )
                elif "geo" in error_msg or "region" in error_msg:
                    raise ValueError(
                        "This video is not available in the server's region."
                    )
                else:
                    raise ValueError(f"Failed to access video: {e}")
            except Exception as e:
                raise ValueError(f"Error extracting video info: {e}")

            if info is None:
                raise ValueError("Could not extract video information.")

            return {
                "title": info.get("title", "Unknown"),
                "channel": info.get("uploader") or info.get("channel", "Unknown"),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail", ""),
                "view_count": info.get("view_count"),
                "upload_date": info.get("upload_date", ""),
                "description": info.get("description", ""),
                "subtitles": info.get("subtitles", {}),
                "automatic_captions": info.get("automatic_captions", {}),
            }

    return await asyncio.to_thread(_extract)


async def download_audio(url: str, video_id: str) -> str:
    """
    Download audio from a YouTube video as MP3 at 128kbps.
    Returns the path to the downloaded audio file.
    """
    import yt_dlp

    output_path = os.path.join(settings.TEMP_DIR, f"{video_id}.%(ext)s")
    final_path = os.path.join(settings.TEMP_DIR, f"{video_id}.mp3")

    # If file already exists from a previous attempt, return it
    if os.path.exists(final_path) and os.path.getsize(final_path) > 0:
        logger.info(f"Audio file already exists: {final_path}")
        return final_path

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_path,
        "quiet": True,
        "no_warnings": True,
        "no_color": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }
        ],
    }

    def _download():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                ydl.download([url])
            except yt_dlp.utils.DownloadError as e:
                raise ValueError(f"Failed to download audio: {e}")
            except Exception as e:
                raise ValueError(f"Audio download error: {e}")

        if not os.path.exists(final_path):
            raise ValueError(
                "Audio file was not created. ffmpeg may not be installed or accessible."
            )

        return final_path

    return await asyncio.to_thread(_download)


async def get_youtube_captions(url: str) -> str | None:
    """
    Try to extract YouTube captions/subtitles as a fallback.
    Returns transcript text or None.
    """
    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-US", "en-GB"],
        "subtitlesformat": "json3",
        "no_color": True,
    }

    def _get_captions():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception:
                return None

            if info is None:
                return None

            # Try manual captions first, then auto-generated
            for caption_source in [
                info.get("subtitles", {}),
                info.get("automatic_captions", {}),
            ]:
                for lang in ["en", "en-US", "en-GB"]:
                    if lang in caption_source:
                        formats = caption_source[lang]
                        # Look for json3 or vtt format
                        for fmt in formats:
                            if fmt.get("ext") in ("json3", "vtt", "srv1"):
                                caption_url = fmt.get("url")
                                if caption_url:
                                    import httpx

                                    try:
                                        resp = httpx.get(caption_url, timeout=30)
                                        if resp.status_code == 200:
                                            return _parse_caption_response(
                                                resp.text, fmt.get("ext", "")
                                            )
                                    except Exception:
                                        continue
            return None

    return await asyncio.to_thread(_get_captions)


def _parse_caption_response(text: str, ext: str) -> str | None:
    """Parse caption data from different formats."""
    import json as json_module

    if ext == "json3":
        try:
            data = json_module.loads(text)
            events = data.get("events", [])
            segments = []
            for event in events:
                segs = event.get("segs", [])
                for seg in segs:
                    utf8 = seg.get("utf8", "").strip()
                    if utf8 and utf8 != "\n":
                        segments.append(utf8)
            result = " ".join(segments)
            return result if result.strip() else None
        except Exception:
            return None
    else:
        # For VTT/SRV, strip timing lines and return text
        lines = text.strip().split("\n")
        text_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if "-->" in line:
                continue
            if line.startswith("WEBVTT") or line.startswith("Kind:") or line.startswith("Language:"):
                continue
            if re.match(r"^\d+$", line):
                continue
            # Remove HTML tags
            clean = re.sub(r"<[^>]+>", "", line)
            if clean.strip():
                text_lines.append(clean.strip())
        result = " ".join(text_lines)
        return result if result.strip() else None
