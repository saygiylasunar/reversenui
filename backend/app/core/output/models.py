from enum import Enum

from pydantic import BaseModel, Field, model_validator


class MetadataMode(str, Enum):
    preserve = "preserve"
    privacy_clean = "privacy-clean"
    ai_clean = "ai-clean"
    strip_all = "strip-all"


class ResizeMode(str, Enum):
    exact = "exact"
    fit = "fit"
    fill = "fill"
    long_edge = "long-edge"
    short_edge = "short-edge"
    percentage = "percentage"


class AlphaMode(str, Enum):
    preserve = "preserve"
    remove = "remove"
    flatten = "flatten"


class CropStep(BaseModel):
    enabled: bool = False
    ratio: str | None = None
    region: tuple[float, float, float, float] | None = None

    @model_validator(mode="after")
    def validate_region(self):
        if self.region is not None:
            left, top, right, bottom = self.region
            if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
                raise ValueError("crop region must be normalized left,top,right,bottom values in [0,1]")
        return self


class ResizeStep(BaseModel):
    enabled: bool = False
    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)
    mode: ResizeMode = ResizeMode.fit
    percentage: float = Field(default=100.0, gt=0, le=1000)


class FormatOptions(BaseModel):
    quality: int = Field(default=92, ge=1, le=100)
    png_compress_level: int = Field(default=6, ge=0, le=9)
    progressive: bool = True
    optimize: bool = True
    lossless: bool = False
    webp_method: int = Field(default=4, ge=0, le=6)
    alpha: AlphaMode = AlphaMode.preserve
    background: str = "#ffffff"


class OutputRecipe(BaseModel):
    auto_orient: bool = True
    crop: CropStep = Field(default_factory=CropStep)
    resize: ResizeStep = Field(default_factory=ResizeStep)
    metadata: MetadataMode = MetadataMode.ai_clean
    preserve_icc: bool = True
    format: str = "png"
    options: FormatOptions = Field(default_factory=FormatOptions)
