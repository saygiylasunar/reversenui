import json
from io import BytesIO
from typing import Any

from PIL import Image, UnidentifiedImageError

from app.core.artifacts.models import ArtifactInspection, ComfyMetadata, WorkflowSummary

MODEL_KEYS = {"ckpt_name", "unet_name", "model_name", "diffusion_model"}
LORA_KEYS = {"lora_name", "lora"}
VAE_KEYS = {"vae_name", "vae"}
ENCODER_KEYS = {"clip_name", "clip_name1", "clip_name2", "clip_name3", "text_encoder", "text_encoder_name", "t5_name"}


def _json_or_text(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return value


def _safe_metadata(value: Any) -> Any:
    if isinstance(value, bytes):
        return f"<bytes:{len(value)}>"
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): _safe_metadata(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_safe_metadata(v) for v in value]
    return repr(value)


def _add_string(target: set[str], value: Any) -> None:
    if isinstance(value, str) and value.strip():
        target.add(value.strip())


def _summarize_api_prompt(prompt: dict[str, Any]) -> WorkflowSummary:
    node_types: set[str] = set()
    models: set[str] = set()
    loras: set[str] = set()
    vaes: set[str] = set()
    encoders: set[str] = set()
    samplers: set[str] = set()
    schedulers: set[str] = set()
    text_prompts: list[str] = []

    for node in prompt.values():
        if not isinstance(node, dict):
            continue
        class_type = node.get("class_type") or node.get("type")
        if isinstance(class_type, str):
            node_types.add(class_type)
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key, value in inputs.items():
            key_lower = str(key).lower()
            if key_lower in MODEL_KEYS:
                _add_string(models, value)
            elif key_lower in LORA_KEYS or "lora_name" in key_lower:
                _add_string(loras, value)
            elif key_lower in VAE_KEYS or key_lower.endswith("vae_name"):
                _add_string(vaes, value)
            elif key_lower in ENCODER_KEYS or "clip_name" in key_lower or "encoder_name" in key_lower:
                _add_string(encoders, value)
            elif key_lower == "sampler_name":
                _add_string(samplers, value)
            elif key_lower == "scheduler":
                _add_string(schedulers, value)
        if isinstance(class_type, str) and "textencode" in class_type.lower():
            text = inputs.get("text")
            if isinstance(text, str) and text.strip() and text not in text_prompts:
                text_prompts.append(text.strip())

    return WorkflowSummary(node_count=len([node for node in prompt.values() if isinstance(node, dict)]), node_types=sorted(node_types), models=sorted(models), loras=sorted(loras), vaes=sorted(vaes), text_encoders=sorted(encoders), samplers=sorted(samplers), schedulers=sorted(schedulers), text_prompts=text_prompts)


def _summarize_ui_workflow(workflow: dict[str, Any]) -> WorkflowSummary:
    nodes = workflow.get("nodes")
    if not isinstance(nodes, list):
        return WorkflowSummary()
    node_types: set[str] = set()
    for node in nodes:
        if isinstance(node, dict):
            node_type = node.get("type") or node.get("class_type")
            if isinstance(node_type, str):
                node_types.add(node_type)
    return WorkflowSummary(node_count=len(nodes), node_types=sorted(node_types))


def _workflow_summary(workflow: Any, prompt: Any) -> WorkflowSummary:
    if isinstance(prompt, dict) and any(isinstance(v, dict) and "class_type" in v for v in prompt.values()):
        return _summarize_api_prompt(prompt)
    if isinstance(workflow, dict):
        return _summarize_ui_workflow(workflow)
    return WorkflowSummary()


def inspect_artifact(filename: str, mime_type: str | None, content: bytes) -> ArtifactInspection:
    try:
        with Image.open(BytesIO(content)) as image:
            info = dict(image.info)
            workflow = _json_or_text(info.get("workflow"))
            prompt = _json_or_text(info.get("prompt"))
            comfy = ComfyMetadata(workflow_found="workflow" in info, prompt_found="prompt" in info, workflow=workflow, prompt=prompt, summary=_workflow_summary(workflow, prompt))
            generator = "comfyui" if comfy.workflow_found or comfy.prompt_found else "unknown"
            if generator == "unknown" and "parameters" in info:
                generator = "a1111-compatible"
            raw = {str(key): _safe_metadata(value) for key, value in info.items()}
            try:
                exif_orientation = image.getexif().get(274)
            except Exception:
                exif_orientation = None
            return ArtifactInspection(filename=filename, mime_type=mime_type, format=image.format, size_bytes=len(content), width=image.width, height=image.height, mode=image.mode, generator=generator, exif_orientation=exif_orientation, has_icc_profile=bool(info.get("icc_profile")), metadata_keys=sorted(raw.keys()), comfyui=comfy, raw_metadata=raw)
    except UnidentifiedImageError as exc:
        raise ValueError("Unsupported or unreadable image artifact") from exc
