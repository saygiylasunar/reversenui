from fastapi import APIRouter, HTTPException

from app.core.prompt.engine import compose_prompt, load_libraries, load_profiles, roll_libraries
from app.core.prompt.models import (
    ComposeRequest,
    ComposeResponse,
    PromptLibrary,
    PromptProfile,
    RollRequest,
    RollResponse,
)

router = APIRouter(prefix="/prompt", tags=["prompt"])


@router.get("/profiles", response_model=list[PromptProfile])
def profiles() -> list[PromptProfile]:
    return load_profiles()


@router.get("/libraries", response_model=list[PromptLibrary])
def libraries() -> list[PromptLibrary]:
    return load_libraries()


@router.post("/roll", response_model=RollResponse)
def roll(request: RollRequest) -> RollResponse:
    return roll_libraries(request)


@router.post("/compose", response_model=ComposeResponse)
def compose(request: ComposeRequest) -> ComposeResponse:
    try:
        return compose_prompt(request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
