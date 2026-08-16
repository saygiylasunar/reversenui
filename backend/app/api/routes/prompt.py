from fastapi import APIRouter, HTTPException

from app.core.prompt.engine import compose_prompt, load_profiles
from app.core.prompt.models import ComposeRequest, ComposeResponse, PromptProfile

router = APIRouter(prefix="/prompt", tags=["prompt"])


@router.get("/profiles", response_model=list[PromptProfile])
def profiles() -> list[PromptProfile]:
    return load_profiles()


@router.post("/compose", response_model=ComposeResponse)
def compose(request: ComposeRequest) -> ComposeResponse:
    try:
        return compose_prompt(request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
