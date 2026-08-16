from pydantic import BaseModel, Field


class PromptCapabilities(BaseModel):
    negative_prompt: bool = True
    numeric_weights: bool = False


class PromptProfile(BaseModel):
    id: str
    label: str
    model_family: str
    encoder_family: list[str] = Field(default_factory=list)
    environment: str = "comfyui"
    style: str = "natural-language"
    separator: str = ", "
    ordering: list[str] = Field(default_factory=list)
    capabilities: PromptCapabilities = Field(default_factory=PromptCapabilities)


class PromptDrawer(BaseModel):
    key: str
    text: str = ""
    enabled: bool = True
    priority: int = Field(default=50, ge=0, le=100)
    emphasis: float = Field(default=1.0, ge=0.0, le=3.0)


class ComposeRequest(BaseModel):
    profile_id: str
    drawers: list[PromptDrawer] = Field(default_factory=list)


class ComposeResponse(BaseModel):
    profile_id: str
    master_prompt: str
    negative_prompt: str
    ordered_drawers: list[str] = Field(default_factory=list)
