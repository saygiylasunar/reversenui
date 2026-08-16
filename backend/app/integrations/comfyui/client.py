import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.integrations.comfyui.models import ComfyMatchRequest, ComfyMatchResponse, MatchGroup

ALLOWED_HOSTS = {"127.0.0.1", "localhost", "::1"}
MODEL_FOLDERS = {"models": ["checkpoints", "diffusion_models", "unet"], "loras": ["loras"], "vaes": ["vae"], "text_encoders": ["text_encoders", "clip"]}


def _normalize_base_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("ComfyUI URL must point to localhost (127.0.0.1, localhost or ::1)")
    if parsed.username or parsed.password:
        raise ValueError("Credentials are not allowed in the ComfyUI URL")
    return value.rstrip("/")


def _get_json(base_url: str, path: str, timeout: float = 3.0):
    request = Request(f"{base_url}{path}", headers={"Accept": "application/json", "User-Agent": "ReversenUI/0.2"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _inventory(base_url: str, folders: list[str]) -> list[str]:
    values: list[str] = []
    for folder in folders:
        try:
            payload = _get_json(base_url, f"/models/{folder}")
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            continue
        if isinstance(payload, list):
            values.extend(str(item) for item in payload if isinstance(item, str))
    return sorted(set(values))


def _key(value: str) -> str:
    return value.replace("\\", "/").lower().strip()


def _basename(value: str) -> str:
    return _key(value).rsplit("/", 1)[-1]


def _match(required: list[str], available: list[str]) -> MatchGroup:
    available_keys = {_key(item) for item in available}
    available_basenames = {_basename(item) for item in available}
    found: list[str] = []
    missing: list[str] = []
    for item in sorted(set(required)):
        if _key(item) in available_keys or _basename(item) in available_basenames:
            found.append(item)
        else:
            missing.append(item)
    return MatchGroup(found=found, missing=missing)


def match_environment(request: ComfyMatchRequest) -> ComfyMatchResponse:
    base_url = _normalize_base_url(request.base_url)
    try:
        object_info = _get_json(base_url, "/object_info")
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        return ComfyMatchResponse(connected=False, base_url=base_url, error=f"Could not connect to ComfyUI: {exc}")
    available_nodes = sorted(object_info.keys()) if isinstance(object_info, dict) else []
    inventories = {group: _inventory(base_url, folders) for group, folders in MODEL_FOLDERS.items()}
    return ComfyMatchResponse(connected=True, base_url=base_url, node_count=len(available_nodes), nodes=_match(request.required_nodes, available_nodes), models=_match(request.models, inventories["models"]), loras=_match(request.loras, inventories["loras"]), vaes=_match(request.vaes, inventories["vaes"]), text_encoders=_match(request.text_encoders, inventories["text_encoders"]))
