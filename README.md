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

## Status

Early development / v0.1 scaffold.
