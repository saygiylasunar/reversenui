from fastapi import APIRouter, HTTPException

from app.integrations.comfyui.client import match_environment
from app.integrations.comfyui.models import ComfyMatchRequest, ComfyMatchResponse

router = APIRouter(prefix="/comfy", tags=["comfyui"])


@router.post("/match", response_model=ComfyMatchResponse)
def match(request: ComfyMatchRequest) -> ComfyMatchResponse:
    try:
        return match_environment(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
