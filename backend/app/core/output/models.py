from enum import Enum

from pydantic import BaseModel, Field


class MetadataMode(str, Enum):
    preserve = "preserve"
    privacy_clean = "privacy-clean"
    ai_clean = "ai-clean"
    strip_all = "strip-all"


class CropStep(BaseModel):
    enabled: bool = False
    ratio: str | None = None
    region: tuple[float, float, float, float] | None = None


class ResizeStep(BaseModel):
    enabled: bool = False
    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)
    mode: str = "fit"


class OutputRecipe(BaseModel):
    auto_orient: bool = True
    crop: CropStep = Field(default_factory=CropStep)
    resize: ResizeStep = Field(default_factory=ResizeStep)
    metadata: MetadataMode = MetadataMode.ai_clean
    preserve_icc: bool = True
    format: str = "png"
