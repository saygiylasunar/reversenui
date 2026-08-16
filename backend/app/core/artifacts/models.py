from typing import Any

from pydantic import BaseModel, Field


class WorkflowSummary(BaseModel):
    node_count: int = 0
    node_types: list[str] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)
    loras: list[str] = Field(default_factory=list)
    vaes: list[str] = Field(default_factory=list)
    text_encoders: list[str] = Field(default_factory=list)
    samplers: list[str] = Field(default_factory=list)
    schedulers: list[str] = Field(default_factory=list)
    text_prompts: list[str] = Field(default_factory=list)


class ComfyMetadata(BaseModel):
    workflow_found: bool = False
    prompt_found: bool = False
    workflow: Any | None = None
    prompt: Any | None = None
    summary: WorkflowSummary = Field(default_factory=WorkflowSummary)


class ArtifactInspection(BaseModel):
    filename: str
    mime_type: str | None = None
    format: str | None = None
    size_bytes: int
    width: int | None = None
    height: int | None = None
    mode: str | None = None
    generator: str = "unknown"
    exif_orientation: int | None = None
    has_icc_profile: bool = False
    metadata_keys: list[str] = Field(default_factory=list)
    comfyui: ComfyMetadata = Field(default_factory=ComfyMetadata)
    raw_metadata: dict[str, Any] = Field(default_factory=dict)
