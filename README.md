# ReversenUI

**Inspect. Understand. Compose. Process.**

ReversenUI is a local-first engineering workbench for inspecting generative-AI artifacts, understanding embedded workflows and metadata, composing model-aware prompts, and processing image outputs through reusable pipelines.

## Core modules

- **Inspector** — metadata, prompt, workflow, node and dependency inspection with an initial focus on ComfyUI artifacts.
- **Prompt Architect** — model / text-encoder aware prompt composition using ordered semantic drawers and reusable profiles.
- **Output** — non-destructive crop, resize, metadata sanitization and format conversion through a single ordered processing pipeline.

## Principles

- Local-first: services bind to `127.0.0.1` by default.
- KISS: simple UI over explicit, inspectable processing steps.
- Non-destructive: source files are never overwritten by default.
- Extensible: ComfyUI is the first integration, not the architecture boundary.
- Transparent: normalized views never hide raw metadata from advanced inspection.

## v0.1 scaffold

The first vertical slice can already inspect Pillow-readable image artifacts and detect embedded ComfyUI `workflow` and `prompt` fields. Prompt Architect and Output have their initial profile / recipe domain models ready for UI wiring.

## Run locally

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Health check: `http://127.0.0.1:8000/api/health`

### Frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Repository layout

```text
backend/
  app/
    api/routes/        HTTP surface
    core/artifacts/    artifact inspection
    core/output/       output-pipeline domain
frontend/
  src/                 React workbench shell
profiles/
  prompt/              model / encoder / environment prompt profiles
```

## Status

Early development / v0.1.
