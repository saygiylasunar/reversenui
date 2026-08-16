from __future__ import annotations

import math
from io import BytesIO
from typing import Any

from PIL import Image, ImageOps, PngImagePlugin

from app.core.output.models import AlphaMode, MetadataMode, OutputRecipe, ResizeMode

AI_METADATA_KEYS = {"workflow", "prompt", "parameters", "generation_data", "extra_pnginfo", "invokeai_metadata"}
PRIVACY_METADATA_KEYS = {"exif", "xmp", "xml", "comment", "comments", "author", "artist", "copyright", "creation_time", "date", "datetime", "software"}
FORMAT_MAP = {"png": ("PNG", "image/png", ".png"), "jpeg": ("JPEG", "image/jpeg", ".jpg"), "jpg": ("JPEG", "image/jpeg", ".jpg"), "webp": ("WEBP", "image/webp", ".webp")}


def _parse_ratio(value: str | None) -> float | None:
    if not value:
        return None
    normalized = value.strip().lower().replace(" ", "")
    for separator in (":", "/", "x"):
        if separator in normalized:
            left, right = normalized.split(separator, 1)
            try:
                a, b = float(left), float(right)
            except ValueError:
                return None
            if a > 0 and b > 0:
                return a / b
    try:
        result = float(normalized)
        return result if result > 0 else None
    except ValueError:
        return None


def _crop(image: Image.Image, recipe: OutputRecipe) -> Image.Image:
    step = recipe.crop
    if not step.enabled:
        return image
    if step.region is not None:
        left, top, right, bottom = step.region
        return image.crop((round(left * image.width), round(top * image.height), round(right * image.width), round(bottom * image.height)))
    ratio = _parse_ratio(step.ratio)
    if ratio is None:
        return image
    current = image.width / image.height
    if math.isclose(current, ratio, rel_tol=1e-5):
        return image
    if current > ratio:
        target_width = round(image.height * ratio)
        left = max(0, (image.width - target_width) // 2)
        return image.crop((left, 0, left + target_width, image.height))
    target_height = round(image.width / ratio)
    top = max(0, (image.height - target_height) // 2)
    return image.crop((0, top, image.width, top + target_height))


def _resize(image: Image.Image, recipe: OutputRecipe) -> Image.Image:
    step = recipe.resize
    if not step.enabled:
        return image
    resample = Image.Resampling.LANCZOS
    width, height = step.width, step.height
    if step.mode == ResizeMode.percentage:
        scale = step.percentage / 100.0
        return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), resample)
    if step.mode == ResizeMode.long_edge:
        target = width or height
        if not target:
            return image
        scale = target / max(image.width, image.height)
        return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), resample)
    if step.mode == ResizeMode.short_edge:
        target = width or height
        if not target:
            return image
        scale = target / min(image.width, image.height)
        return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), resample)
    if not width or not height:
        return image
    if step.mode == ResizeMode.exact:
        return image.resize((width, height), resample)
    if step.mode == ResizeMode.fill:
        return ImageOps.fit(image, (width, height), method=resample, centering=(0.5, 0.5))
    result = image.copy()
    result.thumbnail((width, height), resample)
    return result


def _hex_color(value: str) -> tuple[int, int, int]:
    text = value.strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        return (255, 255, 255)
    try:
        return tuple(int(text[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return (255, 255, 255)


def _flatten_alpha(image: Image.Image, background: str) -> Image.Image:
    if "A" not in image.getbands():
        return image.convert("RGB")
    rgba = image.convert("RGBA")
    base = Image.new("RGBA", rgba.size, _hex_color(background) + (255,))
    base.alpha_composite(rgba)
    return base.convert("RGB")


def _prepare_mode(image: Image.Image, fmt: str, recipe: OutputRecipe) -> Image.Image:
    if fmt == "JPEG":
        return _flatten_alpha(image, recipe.options.background)
    if recipe.options.alpha in {AlphaMode.remove, AlphaMode.flatten}:
        return _flatten_alpha(image, recipe.options.background)
    if image.mode == "P" and "transparency" in image.info:
        return image.convert("RGBA")
    return image


def _metadata_kwargs(original_info: dict[str, Any], fmt: str, recipe: OutputRecipe) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if recipe.preserve_icc and isinstance(original_info.get("icc_profile"), bytes):
        kwargs["icc_profile"] = original_info["icc_profile"]
    if recipe.metadata == MetadataMode.strip_all:
        return kwargs
    if recipe.metadata == MetadataMode.preserve and isinstance(original_info.get("exif"), bytes) and fmt in {"JPEG", "WEBP"}:
        if recipe.auto_orient:
            try:
                normalized_exif = Image.Exif()
                normalized_exif.load(original_info["exif"])
                normalized_exif[274] = 1
                kwargs["exif"] = normalized_exif.tobytes()
            except Exception:
                pass
        else:
            kwargs["exif"] = original_info["exif"]
    if fmt == "PNG":
        pnginfo = PngImagePlugin.PngInfo()
        for key, value in original_info.items():
            key_lower = str(key).lower()
            if not isinstance(value, str):
                continue
            if recipe.metadata == MetadataMode.ai_clean and key_lower in AI_METADATA_KEYS:
                continue
            if recipe.metadata == MetadataMode.privacy_clean and (key_lower in AI_METADATA_KEYS or key_lower in PRIVACY_METADATA_KEYS):
                continue
            pnginfo.add_text(str(key), value)
        kwargs["pnginfo"] = pnginfo
    return kwargs


def process_image(content: bytes, recipe: OutputRecipe) -> tuple[bytes, str, str, int, int]:
    fmt_key = recipe.format.lower()
    if fmt_key not in FORMAT_MAP:
        raise ValueError("Output format must be PNG, JPEG or WebP")
    fmt, mime_type, extension = FORMAT_MAP[fmt_key]
    with Image.open(BytesIO(content)) as source:
        original_info = dict(source.info)
        image = source.copy()
    if recipe.auto_orient:
        with Image.open(BytesIO(content)) as orientation_source:
            image = ImageOps.exif_transpose(orientation_source).copy()
    image = _crop(image, recipe)
    image = _resize(image, recipe)
    image = _prepare_mode(image, fmt, recipe)
    kwargs = _metadata_kwargs(original_info, fmt, recipe)
    if fmt == "PNG":
        kwargs.update(compress_level=recipe.options.png_compress_level, optimize=recipe.options.optimize)
    elif fmt == "JPEG":
        kwargs.update(quality=recipe.options.quality, progressive=recipe.options.progressive, optimize=recipe.options.optimize)
    elif fmt == "WEBP":
        kwargs.update(quality=recipe.options.quality, lossless=recipe.options.lossless, method=recipe.options.webp_method)
    buffer = BytesIO()
    image.save(buffer, format=fmt, **kwargs)
    return buffer.getvalue(), mime_type, extension, image.width, image.height
