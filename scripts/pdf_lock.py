"""Candado global: un solo script PDF (OCR/render) a la vez en el servidor."""
from __future__ import annotations

import fcntl
from contextlib import contextmanager
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
LOCK_PATH = RAIZ / "data" / ".pdf-python.lock"


@contextmanager
def candado_pdf():
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK_PATH, "w", encoding="utf-8") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
