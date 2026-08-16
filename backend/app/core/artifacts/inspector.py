import json
from io import BytesIO
from typing import Any

from PIL import Image, UnidentifiedImageError

from app.core.artifacts.models import ArtifactInspection, ComfyMetadata


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


def inspect_artifact(filename: str, mime_type: str | None, content: bytes) -> ArtifactInspection:
    try:
        with Image.open(BytesIO(content)) as image:
            info = dict(image.info)
            workflow = _json_or_text(info.get("workflow"))
            prompt = _json_or_text(info.get("prompt"))
            comfy = ComfyMetadata(
                workflow_found="workflow" in info,
                prompt_found="prompt" in info,
                workflow=workflow,
                prompt=prompt,
            )

            generator = "comfyui" if comfy.workflow_found or comfy.prompt_found else "unknown"
            raw = {str(key): _safe_metadata(value) for key, value in info.items()}

            return ArtifactInspection(
                filename=filename,
                mime_type=mime_type,
                format=image.format,
                size_bytes=len(content),
                width=image.width,
                height=image.height,
                mode=image.mode,
                generator=generator,
                metadata_keys=sorted(raw.keys()),
                comfyui=comfy,
                raw_metadata=raw,
            )
    except UnidentifiedImageError as exc:
        raise ValueError("Unsupported or unreadable image artifact") from exc
