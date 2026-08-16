import json
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError

from app.core.output.models import OutputRecipe
from app.core.output.processor import process_image

router = APIRouter(prefix="/output", tags=["output"])
MAX_UPLOAD_BYTES = 128 * 1024 * 1024


@router.post("/process")
async def process_output(file: UploadFile = File(...), recipe: str = Form(...)) -> Response:
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Artifact exceeds 128 MiB limit")
    try:
        parsed = OutputRecipe.model_validate(json.loads(recipe))
        result, mime_type, extension, width, height = process_image(content, parsed)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    stem = Path(file.filename or "image").stem
    filename = f"{stem}_reversenui{extension}"
    return Response(content=result, media_type=mime_type, headers={"Content-Disposition": f'attachment; filename="{filename}"', "X-ReversenUI-Width": str(width), "X-ReversenUI-Height": str(height)})
