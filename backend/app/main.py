import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.routes.analyze import router as analyze_router
from app.services.pipeline import init_workers, shutdown_workers
from app.services.cleanup import start_cleanup_scheduler, stop_cleanup_scheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    # ── Startup ──
    logger.info("Deep Insight AI backend starting up...")

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Start worker pool
    await init_workers()
    logger.info(f"Worker pool started ({settings.MAX_CONCURRENT_JOBS} workers)")

    # Start cleanup scheduler
    await start_cleanup_scheduler()
    logger.info("Cleanup scheduler started")

    logger.info("Deep Insight AI backend ready!")

    yield

    # ── Shutdown ──
    logger.info("Deep Insight AI backend shutting down...")
    await shutdown_workers()
    await stop_cleanup_scheduler()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Deep Insight AI",
    description="YouTube video analysis API powered by AI",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(analyze_router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "Deep Insight AI",
        "version": "1.0.0",
    }
