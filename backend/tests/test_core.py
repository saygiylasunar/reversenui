import json
import unittest
from io import BytesIO

from PIL import Image, PngImagePlugin

from app.core.artifacts.inspector import inspect_artifact
from app.core.output.models import OutputRecipe
from app.core.output.processor import process_image
from app.core.prompt.engine import compose_prompt
from app.core.prompt.models import ComposeRequest


class CoreSmokeTests(unittest.TestCase):
    def comfy_png(self) -> bytes:
        info = PngImagePlugin.PngInfo()
        prompt = {"1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "model.safetensors"}}, "2": {"class_type": "LoraLoader", "inputs": {"lora_name": "face.safetensors"}}, "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "portrait, golden hour"}}, "4": {"class_type": "KSampler", "inputs": {"sampler_name": "euler", "scheduler": "normal"}}}
        info.add_text("prompt", json.dumps(prompt))
        info.add_text("workflow", json.dumps({"nodes": [{"type": "KSampler"}]}))
        image = Image.new("RGBA", (1200, 800), (255, 0, 0, 128))
        buffer = BytesIO()
        image.save(buffer, "PNG", pnginfo=info)
        return buffer.getvalue()

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
        with Image.open(BytesIO(data)) as image:
            self.assertEqual(image.size, (512, 512))

    def test_prompt_composer(self):
        request = ComposeRequest.model_validate({"profile_id": "sdxl-comfy", "drawers": [{"key": "subject", "text": "woman", "priority": 100}, {"key": "lighting", "text": "golden hour", "emphasis": 1.2}, {"key": "negative", "text": "blurry"}]})
        result = compose_prompt(request)
        self.assertEqual(result.master_prompt, "woman, (golden hour:1.20)")
        self.assertEqual(result.negative_prompt, "blurry")


if __name__ == "__main__":
    unittest.main()
