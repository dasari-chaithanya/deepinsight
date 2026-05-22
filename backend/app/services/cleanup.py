import os
import time
import asyncio
import logging
from pathlib import Path
from app.config import settings

logger = logging.getLogger(__name__)

_cleanup_task: asyncio.Task | None = None


async def start_cleanup_scheduler():
    """Start the periodic cleanup background task."""
    global _cleanup_task
    _cleanup_task = asyncio.create_task(_cleanup_loop())
    logger.info(
        f"Cleanup scheduler started "
        f"(interval={settings.CLEANUP_INTERVAL_SECONDS}s, "
        f"max_age={settings.TEMP_FILE_MAX_AGE_SECONDS}s)"
    )


async def stop_cleanup_scheduler():
    """Stop the cleanup scheduler."""
    global _cleanup_task
    if _cleanup_task:
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
        _cleanup_task = None
        logger.info("Cleanup scheduler stopped")


async def _cleanup_loop():
    """Periodically clean up old temp files."""
    while True:
        try:
            await asyncio.sleep(settings.CLEANUP_INTERVAL_SECONDS)
            await cleanup_temp_files()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Cleanup error: {e}", exc_info=True)


async def cleanup_temp_files():
    """
    Remove temp audio files older than TEMP_FILE_MAX_AGE_SECONDS.
    Runs in a thread to avoid blocking the event loop.
    """

    def _cleanup():
        temp_dir = Path(settings.TEMP_DIR)
        if not temp_dir.exists():
            return 0

        now = time.time()
        removed = 0
        max_age = settings.TEMP_FILE_MAX_AGE_SECONDS

        for file_path in temp_dir.iterdir():
            if file_path.is_file():
                try:
                    file_age = now - file_path.stat().st_mtime
                    if file_age > max_age:
                        file_path.unlink()
                        removed += 1
                        logger.debug(f"Cleaned up old temp file: {file_path.name}")
                except OSError as e:
                    logger.warning(f"Failed to remove {file_path}: {e}")

        if removed > 0:
            logger.info(f"Cleaned up {removed} old temp file(s)")
        return removed

    return await asyncio.to_thread(_cleanup)
