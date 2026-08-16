from typing import Any

from pydantic import BaseModel, Field


class ComfyMetadata(BaseModel):
    workflow_found: bool = False
    prompt_found: bool = False
    workflow: Any | None = None
    prompt: Any | None = None


class ArtifactInspection(BaseModel):
    filename: str
    mime_type: str | None = None
    format: str | None = None
    size_bytes: int
    width: int | None = None
    height: int | None = None
    mode: str | None = None
    generator: str = "unknown"
    metadata_keys: list[str] = Field(default_factory=list)
    comfyui: ComfyMetadata = Field(default_factory=ComfyMetadata)
    raw_metadata: dict[str, Any] = Field(default_factory=dict)
