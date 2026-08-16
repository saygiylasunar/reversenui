import json
from functools import lru_cache
from pathlib import Path

from app.core.prompt.models import ComposeRequest, ComposeResponse, PromptProfile

DEFAULT_PROFILES = [
    PromptProfile(id="flux1-comfy", label="FLUX.1 · ComfyUI", model_family="flux1", encoder_family=["t5xxl", "clip_l"], environment="comfyui", style="natural-language", separator=", ", ordering=["intent", "subject", "identity", "physical", "expression", "pose", "wardrobe", "environment", "composition", "camera", "lighting", "texture", "mood", "color", "style", "technical", "constraints", "negative"], capabilities={"negative_prompt": False, "numeric_weights": False}),
    PromptProfile(id="sdxl-comfy", label="SDXL · ComfyUI", model_family="sdxl", encoder_family=["clip_g", "clip_l"], environment="comfyui", style="tag-hybrid", separator=", ", ordering=["quality", "subject", "identity", "physical", "expression", "pose", "wardrobe", "environment", "composition", "camera", "lighting", "texture", "mood", "style", "technical", "constraints", "negative"], capabilities={"negative_prompt": True, "numeric_weights": True}),
]


def _profiles_directory() -> Path:
    return Path(__file__).resolve().parents[4] / "profiles" / "prompt"


@lru_cache(maxsize=1)
def load_profiles() -> list[PromptProfile]:
    profiles = {profile.id: profile for profile in DEFAULT_PROFILES}
    directory = _profiles_directory()
    if directory.exists():
        for path in directory.glob("*.json"):
            try:
                profile = PromptProfile.model_validate(json.loads(path.read_text(encoding="utf-8")))
                profiles[profile.id] = profile
            except Exception:
                continue
    return sorted(profiles.values(), key=lambda profile: profile.label.lower())


def get_profile(profile_id: str) -> PromptProfile:
    for profile in load_profiles():
        if profile.id == profile_id:
            return profile
    raise ValueError(f"Unknown prompt profile: {profile_id}")


def _render(text: str, emphasis: float, supports_weights: bool) -> str:
    clean = text.strip()
    if not clean:
        return ""
    if supports_weights and abs(emphasis - 1.0) >= 0.01:
        return f"({clean}:{emphasis:.2f})"
    return clean


def compose_prompt(request: ComposeRequest) -> ComposeResponse:
    profile = get_profile(request.profile_id)
    order_index = {key: index for index, key in enumerate(profile.ordering)}
    enabled = [drawer for drawer in request.drawers if drawer.enabled and drawer.text.strip()]
    enabled.sort(key=lambda drawer: (order_index.get(drawer.key, 10_000), -drawer.priority))
    positive: list[str] = []
    negative: list[str] = []
    ordered: list[str] = []
    for drawer in enabled:
        rendered = _render(drawer.text, drawer.emphasis, profile.capabilities.numeric_weights)
        if not rendered:
            continue
        ordered.append(drawer.key)
        if drawer.key == "negative":
            if profile.capabilities.negative_prompt:
                negative.append(rendered)
            continue
        positive.append(rendered)
    return ComposeResponse(profile_id=profile.id, master_prompt=profile.separator.join(positive), negative_prompt=profile.separator.join(negative), ordered_drawers=ordered)
