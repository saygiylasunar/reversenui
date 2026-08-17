import json
import unittest
from io import BytesIO

from PIL import Image, PngImagePlugin

from app.core.artifacts.inspector import inspect_artifact
from app.core.output.models import OutputRecipe
from app.core.output.processor import process_image
from app.core.prompt.engine import compose_prompt, load_libraries, roll_libraries
from app.core.prompt.models import ComposeRequest, RollRequest
from app.integrations.comfyui.client import _match, _normalize_base_url


class CoreSmokeTests(unittest.TestCase):
    def comfy_png(self) -> bytes:
        info = PngImagePlugin.PngInfo()
        prompt = {"1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "model.safetensors"}}, "2": {"class_type": "LoraLoader", "inputs": {"lora_name": "face.safetensors"}}, "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "portrait, golden hour"}}, "4": {"class_type": "KSampler", "inputs": {"sampler_name": "euler", "scheduler": "normal"}}}
        info.add_text("prompt", json.dumps(prompt))
        info.add_text("workflow", json.dumps({"nodes": [{"type": "KSampler"}]}))
        image = Image.new("RGBA", (1200, 800), (255, 0, 0, 128))
        buffer = BytesIO(); image.save(buffer, "PNG", pnginfo=info); return buffer.getvalue()

    def test_inspector_recovers_comfy_recipe(self):
        result = inspect_artifact("test.png", "image/png", self.comfy_png())
        self.assertTrue(result.comfyui.prompt_found)
        self.assertEqual(result.comfyui.summary.models, ["model.safetensors"])
        self.assertEqual(result.comfyui.summary.loras, ["face.safetensors"])
        self.assertEqual(result.comfyui.summary.samplers, ["euler"])

    def test_output_pipeline_processes_image(self):
        recipe = OutputRecipe.model_validate({"crop": {"enabled": True, "ratio": "1:1"}, "resize": {"enabled": True, "width": 512, "height": 512, "mode": "fill"}, "metadata": "ai-clean", "format": "jpeg", "options": {"quality": 90, "background": "#ffffff"}})
        data, mime, extension, width, height = process_image(self.comfy_png(), recipe)
        self.assertEqual((mime, extension, width, height), ("image/jpeg", ".jpg", 512, 512))
        with Image.open(BytesIO(data)) as image: self.assertEqual(image.size, (512, 512))

    def test_comfy_matching_helpers(self):
        self.assertEqual(_normalize_base_url("http://127.0.0.1:8188/"), "http://127.0.0.1:8188")
        group = _match(["folder/model.safetensors", "missing.safetensors"], ["model.safetensors"])
        self.assertEqual(group.found, ["folder/model.safetensors"])
        self.assertEqual(group.missing, ["missing.safetensors"])
        with self.assertRaises(ValueError): _normalize_base_url("https://example.com")

    def test_prompt_composer(self):
        request = ComposeRequest.model_validate({"profile_id": "sdxl-comfy", "drawers": [{"key": "subject", "text": "woman", "priority": 100}, {"key": "lighting", "text": "golden hour", "emphasis": 1.2}, {"key": "negative", "text": "blurry"}]})
        result = compose_prompt(request)
        self.assertEqual(result.master_prompt, "woman, (golden hour:1.20)")
        self.assertEqual(result.negative_prompt, "blurry")

    def test_prompt_roller_is_seeded_and_preserves_locks(self):
        self.assertGreater(len(load_libraries()), 10)
        request = RollRequest(seed=42, library_keys=["intent", "environment", "camera"], locked={"environment": "my locked room"})
        first = roll_libraries(request)
        second = roll_libraries(request)
        self.assertEqual(first.values, second.values)
        self.assertEqual(first.values["environment"], "my locked room")

    def test_qwen_master_uses_a_to_f_structure(self):
        request = ComposeRequest.model_validate({"profile_id": "qwen3-vl-4b-instruct", "drawers": [
            {"key": "intent", "text": "a cinematic portrait"},
            {"key": "subject", "text": "one adult woman"},
            {"key": "environment", "text": "a rainy balcony"},
            {"key": "primary_prop", "text": "a ceramic mug"},
            {"key": "camera", "text": "50mm eye-level"},
            {"key": "style", "text": "natural photographic realism"},
        ]})
        result = compose_prompt(request)
        for section in ["A — Scene & Intent", "B — Person / Subject", "C — Environment", "D — Objects & Scene Detail", "E — Composition & Capture", "F — Finish & Constraints"]:
            self.assertIn(section, result.master_prompt)
        self.assertIn("Return only the finished image-generation prompt", result.master_prompt)


if __name__ == "__main__": unittest.main()
