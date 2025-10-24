from fastapi import HTTPException
import re


def _sanitize_name(name: str) -> str:
    name = (name or "").strip()
    # Allow letters, numbers, dashes, underscaces and spaces; convert spaces to underscores
    name = re.sub(r"[^A-Za-z0-9_\- ]+", "", name)
    name = re.sub(r"\s+", "_", name)
    if not name:
        raise HTTPException(status_code=400, detail="Invalid script name")
    return name[:128]
