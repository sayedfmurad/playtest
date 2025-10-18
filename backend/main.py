from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from connection_manager import ConnectionManager
from playwright_manager import playwright_lifespan, get_current_page, get_browser_context
import json
import asyncio
from typing import List
from message_processor import process_message
import logging
from pathlib import Path
import re
from pydantic import BaseModel

# Initialize connection manager
manager = ConnectionManager()

# Use Uvicorn's logger for colorized output
logger = logging.getLogger("uvicorn.error")

app = FastAPI(lifespan=playwright_lifespan)

# Allow requests from the extension and any local pages
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Scripts storage directory
SCRIPTS_DIR = Path(__file__).parent / "scripts"
SCRIPTS_DIR.mkdir(exist_ok=True)


def _sanitize_name(name: str) -> str:
    name = (name or "").strip()
    # Allow letters, numbers, dashes, underscores and spaces; convert spaces to underscores
    name = re.sub(r"[^A-Za-z0-9_\- ]+", "", name)
    name = re.sub(r"\s+", "_", name)
    if not name:
        raise HTTPException(status_code=400, detail="Invalid script name")
    return name[:128]


class ScriptPayload(BaseModel):
    name: str
    steps: list


@app.get("/scripts")
async def list_scripts():
    items = []
    for p in SCRIPTS_DIR.glob("*.json"):
        try:
            stat = p.stat()
            items.append({"name": p.stem, "mtime": stat.st_mtime})
        except Exception:
            continue
    items.sort(key=lambda x: x["name"].lower())
    return {"items": items}


@app.get("/scripts/{name}")
async def get_script(name: str):
    safe = _sanitize_name(name)
    fp = SCRIPTS_DIR / f"{safe}.json"
    if not fp.exists():
        raise HTTPException(status_code=404, detail="Not found")
    try:
        data = json.loads(fp.read_text("utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read script")
    return data


@app.post("/scripts")
async def save_script(payload: ScriptPayload):
    safe = _sanitize_name(payload.name)
    fp = SCRIPTS_DIR / f"{safe}.json"

    # Clean steps to store only relevant fields
    cleaned = []
    for s in (payload.steps or []):
        if isinstance(s, dict):
            d = {}
            # normalize target/selector
            target = s.get("target") or {}
            sel = s.get("selector") or (target.get("selector") if isinstance(target, dict) else None)
            if sel:
                d["target"] = {"selector": sel}
            # copy known fields
            for k in [
                "action", "value", "options", "optionsText", "storeAs",
                "enabled", "retries", "retryDelayMs", "nextOnOk", "nextOnError"
            ]:
                if k in s and s[k] is not None:
                    d[k] = s[k]
            cleaned.append(d)
        else:
            cleaned.append(s)

    data = {"name": safe, "steps": cleaned}
    try:
        fp.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save: {e}")
    return {"ok": True, "name": safe}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)

    try:
        while True:
            # Wait for message from client
            data = await websocket.receive_text()
            # Process message asynchronously without waiting
            asyncio.create_task(process_message(data, manager, websocket))

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
        manager.disconnect(websocket)
