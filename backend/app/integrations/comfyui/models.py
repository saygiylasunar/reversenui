from pydantic import BaseModel, Field


class ComfyMatchRequest(BaseModel):
    base_url: str = "http://127.0.0.1:8188"
    required_nodes: list[str] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)
    loras: list[str] = Field(default_factory=list)
    vaes: list[str] = Field(default_factory=list)
    text_encoders: list[str] = Field(default_factory=list)


class MatchGroup(BaseModel):
    found: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)


class ComfyMatchResponse(BaseModel):
    connected: bool = False
    base_url: str
    node_count: int = 0
    nodes: MatchGroup = Field(default_factory=MatchGroup)
    models: MatchGroup = Field(default_factory=MatchGroup)
    loras: MatchGroup = Field(default_factory=MatchGroup)
    vaes: MatchGroup = Field(default_factory=MatchGroup)
    text_encoders: MatchGroup = Field(default_factory=MatchGroup)
    error: str | None = None
