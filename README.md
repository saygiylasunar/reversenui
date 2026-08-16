# ReversenUI

**Inspect. Understand. Compose. Process.**

ReversenUI is a local-first AI engineering workbench for reverse-engineering generative-image artifacts, composing model-aware prompts, and producing clean image outputs through an ordered processing pipeline.

## Current flight · v0.2

### Inspector
- Reads Pillow-supported image artifacts.
- Detects embedded ComfyUI `workflow` and API `prompt` metadata.
- Recovers node types and, when present, model/checkpoint names, LoRAs, VAEs, text encoders, samplers, schedulers and text prompts.
- Shows raw metadata and detects A1111-compatible `parameters` metadata.

### Prompt Architect
- Profile-driven rather than hard-coded to one model family.
- Ships with FLUX.1 + T5XXL/CLIP-L and SDXL + CLIP-G/CLIP-L ComfyUI profiles.
- Ordered semantic drawers with separate priority and numeric emphasis.
- Produces a master prompt and, where supported, a separate negative prompt.

### Output
One **Process & Export** action executes: EXIF auto-orientation → crop → resize → metadata sanitation → ICC handling → format encoding.

Current outputs: PNG (compression/alpha), JPEG (quality/progressive/background), WebP (quality/lossless). Metadata modes: Preserve, Privacy Clean, AI Metadata Clean, Strip Everything. ICC preservation is controlled separately.

## Start on Windows
Prerequisites: **Python 3.11+** and **Node.js/npm**.

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

First run creates a local Python venv, installs frontend dependencies, builds the UI, starts `127.0.0.1:8765`, and opens the browser. Subsequent runs reuse local dependencies.

## Development
Backend:
```powershell
python -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
pip install -e backend
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8765 --reload
```
Frontend:
```powershell
cd frontend
npm install
npm run dev
```
Vite proxies `/api` to port `8765`.

## Smoke tests
```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```

## Principles
- **Local-first** — localhost by default.
- **KISS** — simple UI over explicit processing steps.
- **Non-destructive** — exports never overwrite sources by default.
- **Extensible** — ComfyUI is the first integration, not the architecture boundary.
- **Transparent** — normalized views coexist with raw metadata.

## Next targets
- ComfyUI environment matcher (`/object_info`, model inventory, missing-node/model report)
- deeper graph reconstruction and conditioning tracing
- batch Output recipes/presets
- more metadata adapters
- workflow diff and model-library tooling
