# ReversenUI

**Inspect. Understand. Compose. Process.**

ReversenUI is a local-first AI engineering workbench for reverse-engineering generative-image artifacts, composing model-aware prompts, processing image outputs, and hosting local AI tools inside a desktop workspace shell.

## Current flight · v0.3

### Inspector
- Reads Pillow-supported image artifacts.
- Detects embedded ComfyUI `workflow` and API `prompt` metadata.
- Recovers node types and, when present, model/checkpoint names, LoRAs, VAEs, text encoders, samplers, schedulers and text prompts.
- Shows raw metadata and detects A1111-compatible `parameters` metadata.
- Can compare recovered requirements against a running local ComfyUI instance.

### Prompt Architect
- Profile-driven rather than hard-coded to one model family.
- Ships with FLUX.1 + T5XXL/CLIP-L and SDXL + CLIP-G/CLIP-L ComfyUI profiles.
- Ordered semantic drawers with separate priority and numeric emphasis.
- Produces a master prompt and, where supported, a separate negative prompt.

### Output
One **Process & Export** action executes: EXIF auto-orientation → crop → resize → metadata sanitation → ICC handling → format encoding.

Current outputs: PNG (compression/alpha), JPEG (quality/progressive/background), WebP (quality/lossless). Metadata modes: Preserve, Privacy Clean, AI Metadata Clean, Strip Everything. ICC preservation is controlled separately.

### Desktop workbench
The Electron shell treats ReversenUI and local tools as independent workspace tabs rather than merging external applications into ReversenUI's core.

- Chromium/Electron desktop window.
- `WebContentsView` workspaces with Node integration disabled and renderer sandboxing enabled.
- Single, vertical split, horizontal split and grid layouts.
- Vivaldi-inspired Memory Saver profiles: Never, Minimum, Balanced and Maximum.
- Background workspace hibernation: inactive views are destroyed and later recreated using persistent sessions, reducing renderer memory rather than merely hiding tabs.
- Per-tab / total Electron process memory display.
- Tool process start/stop/open controls.
- Built-in provider templates for ComfyUI, Ostris AI Toolkit, Jupyter and TensorBoard.
- Custom localhost web-tool registry.
- Vault / Secure Notes with OS-backed Electron `safeStorage` encryption plus a cryptographic password generator.

## Start on Windows
Prerequisites: **Python 3.11+** and **Node.js/npm**.

### Desktop app
```powershell
powershell -ExecutionPolicy Bypass -File .\start-desktop.ps1
```

The launcher creates/reuses the Python venv, installs the backend, builds the React UI, prepares Electron and opens the ReversenUI desktop workbench. The Electron main process owns the local Python core lifecycle.

### Browser-only mode
```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

This starts `127.0.0.1:8765` and opens the normal system browser.

## Tool registry
Default tools are defined in `desktop/default-tools.json`. Per-machine overrides are stored in Electron's user-data directory and are not committed to the repository.

For Ostris AI Toolkit, point `cwd` to the toolkit's `ui` directory; the default provider uses `npm run build_and_start` and opens `http://127.0.0.1:8675`.

For ComfyUI, set the start command / working directory for your local installation if you want ReversenUI to launch it. If ComfyUI is already running at `http://127.0.0.1:8188`, no start command is required to open it as a workspace.

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

Desktop shell:
```powershell
cd desktop
npm install
npm run check
npm start
```

## Smoke tests
```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```

## Principles
- **Local-first** — localhost by default.
- **KISS** — simple UI over explicit processing steps.
- **Non-destructive** — exports never overwrite sources by default.
- **Extensible** — ComfyUI and Ostris are providers, not architecture boundaries.
- **Transparent** — normalized views coexist with raw metadata.
- **Resource-aware** — inactive embedded tools can be hibernated instead of keeping every Chromium renderer alive.

## Next targets
- offline ComfyUI folder scanner (`custom_nodes`, models, `extra_model_paths.yaml`)
- deeper graph reconstruction and conditioning tracing
- persistent workspace/session restore and tab stacks
- batch Output recipes/presets
- workflow diff and model-library tooling
- packaged Windows portable / installer builds
