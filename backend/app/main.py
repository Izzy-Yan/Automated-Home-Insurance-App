
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.properties import router as properties_router
from app.api.vision import router as vision_router
from app.api.reviews import router as reviews_router
from app.api.inspections import router as inspections_router
from app.api.demo import router as demo_router

app = FastAPI(
    title="Home Insurance Capture API",
    version="0.4.0",
)

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Development only: replace with authenticated file access
# before handling real homeowner data.
app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIR)),
    name="uploads",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(properties_router)
app.include_router(vision_router)
app.include_router(reviews_router)
app.include_router(inspections_router)

if os.getenv("ENABLE_DEMO_DATA") == "true":
    app.include_router(demo_router)


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "home-insurance-capture-api",
    }
