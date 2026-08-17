import json
import random
import secrets
from functools import lru_cache
from pathlib import Path

from app.core.prompt.models import (
    ComposeRequest,
    ComposeResponse,
    PromptLibrary,
    PromptProfile,
    RollRequest,
    RollResponse,
)

DEFAULT_PROFILES = [
    PromptProfile(id="flux1-comfy", label="FLUX.1 · ComfyUI", model_family="flux1", encoder_family=["t5xxl", "clip_l"], environment="comfyui", style="natural-language", separator=", ", ordering=["intent", "subject", "identity", "physical", "expression", "pose", "wardrobe", "environment", "composition", "camera", "lighting", "texture", "mood", "color", "style", "technical", "constraints", "negative"], capabilities={"negative_prompt": False, "numeric_weights": False}),
    PromptProfile(id="sdxl-comfy", label="SDXL · ComfyUI", model_family="sdxl", encoder_family=["clip_g", "clip_l"], environment="comfyui", style="tag-hybrid", separator=", ", ordering=["quality", "subject", "identity", "physical", "expression", "pose", "wardrobe", "environment", "composition", "camera", "lighting", "texture", "mood", "style", "technical", "constraints", "negative"], capabilities={"negative_prompt": True, "numeric_weights": True}),
    PromptProfile(id="qwen3-vl-4b-instruct", label="Qwen3-VL 4B Instruct · Prompt Planner", model_family="qwen3-vl", encoder_family=[], environment="local-vlm", style="structured-natural-language", separator="\n", ordering=["intent", "activity", "narrative", "subject", "identity", "physical", "expression", "pose", "wardrobe", "environment", "background", "weather_time", "primary_prop", "secondary_prop", "foreground", "framing", "camera", "composition", "lighting", "texture", "mood", "color", "style", "technical", "constraints"], capabilities={"negative_prompt": False, "numeric_weights": False}),
]

QWEN_SECTIONS = [
    ("A", "Scene & Intent", ["intent", "activity", "narrative"]),
    ("B", "Person / Subject", ["subject", "identity", "physical", "expression", "pose", "wardrobe"]),
    ("C", "Environment", ["environment", "background", "weather_time"]),
    ("D", "Objects & Scene Detail", ["primary_prop", "secondary_prop", "foreground"]),
    ("E", "Composition & Capture", ["framing", "camera", "composition", "lighting"]),
    ("F", "Finish & Constraints", ["texture", "mood", "color", "style", "technical", "constraints"]),
]


def _profiles_directory() -> Path:
    return Path(__file__).resolve().parents[4] / "profiles" / "prompt"


def _libraries_directory() -> Path:
    return _profiles_directory() / "libraries"


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


@lru_cache(maxsize=1)
def load_libraries() -> list[PromptLibrary]:
    libraries: dict[str, PromptLibrary] = {}
    directory = _libraries_directory()
    if directory.exists():
        for path in directory.glob("*.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                rows = payload if isinstance(payload, list) else payload.get("libraries", [])
                for raw in rows:
                    library = PromptLibrary.model_validate(raw)
                    libraries[library.key] = library
            except Exception:
                continue
    return sorted(libraries.values(), key=lambda item: (-item.priority, item.group, item.label.lower()))


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


def _compose_qwen(profile: PromptProfile, request: ComposeRequest) -> ComposeResponse:
    values = {drawer.key: drawer.text.strip() for drawer in request.drawers if drawer.enabled and drawer.text.strip()}
    lines = [
        "You are a visual prompt architect. Convert the structured scene specification below into one coherent image-generation prompt.",
        "Respect the priority order A → F. Preserve explicit facts and spatial relationships. Do not add contradictory people, objects, locations, camera choices, or lighting.",
        "Use concrete natural language rather than tag soup or numeric weighting syntax.",
        "",
    ]
    ordered: list[str] = []
    for code, label, keys in QWEN_SECTIONS:
        section = []
        for key in keys:
            if key in values:
                section.append(values[key])
                ordered.append(key)
        if section:
            lines.append(f"{code} — {label}")
            lines.append("; ".join(section))
            lines.append("")
    lines.extend([
        "OUTPUT RULE",
        "Return only the finished image-generation prompt as one polished paragraph. Do not include analysis, headings, bullet points, alternatives, or commentary.",
    ])
    return ComposeResponse(profile_id=profile.id, master_prompt="\n".join(lines).strip(), negative_prompt="", ordered_drawers=ordered)


def compose_prompt(request: ComposeRequest) -> ComposeResponse:
    profile = get_profile(request.profile_id)
    if profile.style == "structured-natural-language" and profile.model_family == "qwen3-vl":
        return _compose_qwen(profile, request)

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


def _weighted_pick(rng: random.Random, library: PromptLibrary) -> str:
    if not library.options:
        return ""
    options = [item.value for item in library.options]
    weights = [item.weight for item in library.options]
    return rng.choices(options, weights=weights, k=1)[0]


def roll_libraries(request: RollRequest) -> RollResponse:
    seed = request.seed if request.seed is not None else secrets.randbits(63)
    rng = random.Random(seed)
    available = {library.key: library for library in load_libraries()}
    keys = request.library_keys or list(available)
    values: dict[str, str] = {}
    for key in keys:
        if key in request.locked and request.locked[key].strip():
            values[key] = request.locked[key].strip()
            continue
        library = available.get(key)
        if library:
            values[key] = _weighted_pick(rng, library)
    return RollResponse(seed=seed, values=values)
