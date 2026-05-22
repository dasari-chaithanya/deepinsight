import os
import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from app.config import settings
from app.database import async_session
from app.models import AnalysisJob
from app.services.youtube import (
    get_video_metadata,
    download_audio,
    get_youtube_captions,
)
from app.services.transcription import (
    transcribe_with_chunks,
    format_transcript_with_timestamps,
)

logger = logging.getLogger(__name__)

# Global job queue and worker control
job_queue: asyncio.Queue | None = None
_workers: list[asyncio.Task] = []


async def init_workers():
    """Initialize the job queue and worker pool."""
    global job_queue
    job_queue = asyncio.Queue()

    for i in range(settings.MAX_CONCURRENT_JOBS):
        task = asyncio.create_task(_worker(i))
        _workers.append(task)
        logger.info(f"Started worker {i}")


async def shutdown_workers():
    """Gracefully stop all workers."""
    global job_queue
    if job_queue is None:
        return

    # Send poison pills
    for _ in _workers:
        await job_queue.put(None)

    # Wait for workers to finish
    for task in _workers:
        try:
            await asyncio.wait_for(task, timeout=30)
        except asyncio.TimeoutError:
            task.cancel()

    _workers.clear()
    logger.info("All workers shut down")


async def enqueue_job(job_id: str):
    """Add a job to the processing queue."""
    if job_queue is None:
        raise RuntimeError("Job queue not initialized")
    await job_queue.put(job_id)
    logger.info(f"Job {job_id} enqueued")


async def _worker(worker_id: int):
    """Worker coroutine that processes jobs from the queue."""
    logger.info(f"Worker {worker_id} started")

    while True:
        job_id = await job_queue.get()

        # Poison pill check
        if job_id is None:
            logger.info(f"Worker {worker_id} received shutdown signal")
            break

        try:
            logger.info(f"Worker {worker_id} processing job {job_id}")
            await process_job(job_id)
        except Exception as e:
            logger.error(
                f"Worker {worker_id} unhandled error on job {job_id}: {e}",
                exc_info=True,
            )
        finally:
            job_queue.task_done()


async def _update_job(
    job_id: str,
    *,
    status: str | None = None,
    progress: int | None = None,
    progress_message: str | None = None,
    title: str | None = None,
    channel: str | None = None,
    duration: float | None = None,
    thumbnail: str | None = None,
    view_count: int | None = None,
    upload_date: str | None = None,
    transcript: str | None = None,
    result: dict | None = None,
    error: str | None = None,
    completed_at: datetime | None = None,
):
    """Update job fields in the database."""
    async with async_session() as session:
        stmt = select(AnalysisJob).where(AnalysisJob.id == job_id)
        db_result = await session.execute(stmt)
        job = db_result.scalar_one_or_none()

        if job is None:
            logger.error(f"Job {job_id} not found in database")
            return

        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = progress
        if progress_message is not None:
            job.progress_message = progress_message
        if title is not None:
            job.title = title
        if channel is not None:
            job.channel = channel
        if duration is not None:
            job.duration = duration
        if thumbnail is not None:
            job.thumbnail = thumbnail
        if view_count is not None:
            job.view_count = view_count
        if upload_date is not None:
            job.upload_date = upload_date
        if transcript is not None:
            job.transcript = transcript
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error
        if completed_at is not None:
            job.completed_at = completed_at

        await session.commit()


async def check_cache(video_id: str) -> dict | None:
    """
    Check if a video has already been analyzed.
    Returns the cached result dict if found, otherwise None.
    """
    async with async_session() as session:
        stmt = (
            select(AnalysisJob)
            .where(AnalysisJob.video_id == video_id)
            .where(AnalysisJob.status == "completed")
            .order_by(AnalysisJob.completed_at.desc())
            .limit(1)
        )
        db_result = await session.execute(stmt)
        job = db_result.scalar_one_or_none()

        if job and job.result:
            # Only return cache if the new schema is present AND timeline has actual data
            tl = job.result.get("timeline")
            kn = job.result.get("knowledge_notes")
            if isinstance(tl, list) and len(tl) > 0 and isinstance(kn, dict):
                return job.to_dict()

    return None


async def process_job(job_id: str):
    """
    Main processing pipeline for a video analysis job.
    Steps:
    1. Extract metadata
    2. Download audio
    3. Transcribe (Groq Whisper with fallback to YouTube captions)
    4. Analyze with Gemini
    5. Store results
    6. Cleanup temp files
    """
    audio_path: str | None = None

    try:
        # Get the job from the database
        async with async_session() as session:
            stmt = select(AnalysisJob).where(AnalysisJob.id == job_id)
            db_result = await session.execute(stmt)
            job = db_result.scalar_one_or_none()

        if job is None:
            logger.error(f"Job {job_id} not found")
            return

        video_url = job.video_url
        video_id = job.video_id

        # ── Step 1: Extract metadata ──────────────────────────────────
        await _update_job(
            job_id,
            status="processing",
            progress=10,
            progress_message="Extracting video metadata...",
        )

        try:
            metadata = await get_video_metadata(video_url)
        except ValueError as e:
            await _update_job(
                job_id,
                status="failed",
                progress=0,
                progress_message="Failed",
                error=str(e),
                completed_at=datetime.now(timezone.utc),
            )
            return

        # Check video duration
        video_duration = metadata.get("duration", 0)
        if video_duration and video_duration > settings.MAX_VIDEO_DURATION:
            minutes = int(video_duration / 60)
            max_minutes = int(settings.MAX_VIDEO_DURATION / 60)
            await _update_job(
                job_id,
                status="failed",
                progress=0,
                progress_message="Failed",
                error=(
                    f"Video is too long ({minutes} minutes). "
                    f"Maximum supported duration is {max_minutes} minutes."
                ),
                completed_at=datetime.now(timezone.utc),
            )
            return

        await _update_job(
            job_id,
            progress=20,
            progress_message="Metadata extracted. Downloading audio...",
            title=metadata.get("title"),
            channel=metadata.get("channel"),
            duration=metadata.get("duration"),
            thumbnail=metadata.get("thumbnail"),
            view_count=metadata.get("view_count"),
            upload_date=metadata.get("upload_date"),
        )

        # ── Step 2: Check for existing transcript (reuse) ─────────────
        existing_transcript: str | None = None
        async with async_session() as session:
            stmt = (
                select(AnalysisJob)
                .where(AnalysisJob.video_id == video_id)
                .where(AnalysisJob.transcript.isnot(None))
                .where(AnalysisJob.transcript != "")
                .order_by(AnalysisJob.created_at.desc())
                .limit(1)
            )
            db_result = await session.execute(stmt)
            prev_job = db_result.scalar_one_or_none()
            if prev_job and prev_job.transcript:
                existing_transcript = prev_job.transcript
                logger.info(f"Reusing existing transcript for video {video_id}")

        if existing_transcript:
            transcript_text = existing_transcript
            await _update_job(
                job_id,
                progress=60,
                progress_message="Reusing existing transcript. Analyzing content...",
                transcript=transcript_text,
            )
        else:
            # ── Step 3: Download audio ────────────────────────────────
            try:
                audio_path = await download_audio(video_url, video_id)
            except ValueError as e:
                await _update_job(
                    job_id,
                    status="failed",
                    progress=0,
                    progress_message="Failed",
                    error=str(e),
                    completed_at=datetime.now(timezone.utc),
                )
                return

            await _update_job(
                job_id,
                progress=35,
                progress_message="Audio downloaded. Transcribing...",
            )

            # ── Step 4: Transcribe ────────────────────────────────────
            transcript_text = ""
            try:
                transcription_result = await transcribe_with_chunks(audio_path)
                transcript_text = transcription_result.get("text", "")
                segments = transcription_result.get("segments", [])

                # Create timestamped version if segments exist
                if segments:
                    timestamped = format_transcript_with_timestamps(segments)
                    if timestamped:
                        transcript_text = timestamped

            except Exception as e:
                logger.warning(f"Whisper transcription failed: {e}")

                # Fallback to YouTube captions
                await _update_job(
                    job_id,
                    progress=45,
                    progress_message="Whisper failed, trying YouTube captions...",
                )

                try:
                    captions = await get_youtube_captions(video_url)
                    if captions:
                        transcript_text = captions
                        logger.info("Using YouTube captions as fallback")
                    else:
                        raise ValueError("No captions available")
                except Exception as caption_error:
                    await _update_job(
                        job_id,
                        status="failed",
                        progress=0,
                        progress_message="Failed",
                        error=(
                            f"Transcription failed and no captions available. "
                            f"Whisper error: {e}. Caption error: {caption_error}"
                        ),
                        completed_at=datetime.now(timezone.utc),
                    )
                    return

            if not transcript_text or not transcript_text.strip():
                await _update_job(
                    job_id,
                    status="failed",
                    progress=0,
                    progress_message="Failed",
                    error="Could not obtain any transcript for this video.",
                    completed_at=datetime.now(timezone.utc),
                )
                return

            await _update_job(
                job_id,
                progress=55,
                progress_message="Transcription complete. Analyzing content...",
                transcript=transcript_text,
            )

        # ── Step 5: Analyze with Gemini ───────────────────────────────
        from app.services.analysis import run_full_analysis_pipeline
        
        async def analysis_progress_callback(pct: int, msg: str):
            # Scale the 65-100% range of the overall pipeline correctly
            # Actually, the pipeline stages themselves map 65 to 99 inside analysis.py
            # So we can just use the returned pct directly if we assume it's absolute,
            # but wait, let's just pass pct directly as it represents overall progress.
            await _update_job(
                job_id,
                progress=pct,
                progress_message=msg,
            )

        try:
            analysis_result = await run_full_analysis_pipeline(
                transcript=transcript_text,
                title=metadata.get("title", ""),
                channel=metadata.get("channel", ""),
                duration=metadata.get("duration", 0),
                progress_callback=analysis_progress_callback,
            )
        except ValueError as e:
            await _update_job(
                job_id,
                status="failed",
                progress=0,
                progress_message="Failed",
                error=str(e),
                completed_at=datetime.now(timezone.utc),
            )
            return

        # ── Step 6: Store results ─────────────────────────────────────
        await _update_job(
            job_id,
            status="completed",
            progress=100,
            progress_message="Analysis complete!",
            result=analysis_result,
            completed_at=datetime.now(timezone.utc),
        )

        logger.info(f"Job {job_id} completed successfully")

    except Exception as e:
        logger.error(f"Job {job_id} failed with unexpected error: {e}", exc_info=True)
        await _update_job(
            job_id,
            status="failed",
            progress=0,
            progress_message="Failed",
            error=f"An unexpected error occurred: {str(e)}",
            completed_at=datetime.now(timezone.utc),
        )

    finally:
        # ── Step 7: Cleanup audio file ────────────────────────────────
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                logger.info(f"Cleaned up audio file: {audio_path}")
            except OSError as e:
                logger.warning(f"Failed to cleanup audio file: {e}")
