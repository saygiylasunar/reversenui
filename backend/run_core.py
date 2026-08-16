import os
import sys
from pathlib import Path


def _frontend_dist() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "frontend" / "dist"
    return Path(__file__).resolve().parents[1] / "frontend" / "dist"


os.environ.setdefault("REVERSENUI_FRONTEND_DIST", str(_frontend_dist()))

import uvicorn  # noqa: E402

from app.main import app  # noqa: E402


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")
