from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.artifacts.inspector import inspect_artifact
from app.core.artifacts.models import ArtifactInspection

router = APIRouter(tags=["inspector"])
MAX_UPLOAD_BYTES = 64 * 1024 * 1024


@router.post("/inspect", response_model=ArtifactInspection)
async def inspect_file(file: UploadFile = File(...)) -> ArtifactInspection:
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Artifact exceeds 64 MiB limit")

    try:
        return inspect_artifact(file.filename or "artifact", file.content_type, content)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
