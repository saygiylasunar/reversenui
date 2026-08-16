import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes.comfy import router as comfy_router
from app.api.routes.health import router as health_router
from app.api.routes.inspect import router as inspect_router
from app.api.routes.output import router as output_router
from app.api.routes.prompt import router as prompt_router

app = FastAPI(title="ReversenUI API", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"], allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["*"])
app.include_router(health_router, prefix="/api")
app.include_router(comfy_router, prefix="/api")
app.include_router(inspect_router, prefix="/api")
app.include_router(prompt_router, prefix="/api")
app.include_router(output_router, prefix="/api")

frontend_override = os.environ.get("REVERSENUI_FRONTEND_DIST")
frontend_dist = Path(frontend_override) if frontend_override else Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
