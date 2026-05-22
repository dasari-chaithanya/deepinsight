import uuid
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from app.database import async_session
from app.models import AnalysisJob
from app.services.youtube import validate_youtube_url
from app.services.pipeline import check_cache, enqueue_job

logger = logging.getLogger(__name__)

router = APIRouter()


class AnalyzeRequest(BaseModel):
    url: str


class AnalyzeResponse(BaseModel):
    job_id: str
    status: str
    message: str
    cached: bool = False


@router.post("/analyze", response_model=AnalyzeResponse)
async def create_analysis(request: AnalyzeRequest):
    """
    Submit a YouTube video for analysis.
    Validates the URL, checks cache, creates a job, and enqueues it.
    """
    # Validate URL
    is_valid, video_id, error_msg = validate_youtube_url(request.url)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    # Check cache
    cached_result = await check_cache(video_id)
    if cached_result:
        logger.info(f"Cache hit for video {video_id}")
        return AnalyzeResponse(
            job_id=cached_result["job_id"],
            status="completed",
            message="Analysis already available (cached).",
            cached=True,
        )

    # Check if there's already an in-progress job for this video
    async with async_session() as session:
        stmt = (
            select(AnalysisJob)
            .where(AnalysisJob.video_id == video_id)
            .where(AnalysisJob.status.in_(["queued", "processing"]))
            .limit(1)
        )
        db_result = await session.execute(stmt)
        existing_job = db_result.scalar_one_or_none()

        if existing_job:
            logger.info(f"Job already in progress for video {video_id}")
            return AnalyzeResponse(
                job_id=existing_job.id,
                status=existing_job.status,
                message="Analysis is already in progress for this video.",
            )

    # Create new job
    job_id = str(uuid.uuid4())

    async with async_session() as session:
        job = AnalysisJob(
            id=job_id,
            video_id=video_id,
            video_url=request.url.strip(),
            status="queued",
            progress=0,
            progress_message="Waiting in queue...",
        )
        session.add(job)
        await session.commit()

    # Enqueue for processing
    await enqueue_job(job_id)

    logger.info(f"Created job {job_id} for video {video_id}")

    return AnalyzeResponse(
        job_id=job_id,
        status="queued",
        message="Analysis started. Poll the status endpoint for updates.",
    )


@router.get("/analysis/{job_id}")
async def get_analysis(job_id: str):
    """
    Get the status and result of an analysis job.
    """
    async with async_session() as session:
        stmt = select(AnalysisJob).where(AnalysisJob.id == job_id)
        db_result = await session.execute(stmt)
        job = db_result.scalar_one_or_none()

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    return job.to_dict()
