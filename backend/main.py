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


def _generate_playwright_code(name: str, steps: list) -> str:
    """Generate Playwright test code from steps"""
    lines = [
        "import { test, expect } from '@playwright/test';",
        "",
        f"test('{name}', async ({{ page }}) => {{",
    ]
    
    indent = "  "
    
    for step in steps:
        if not isinstance(step, dict):
            continue
            
        action = step.get("action", "")
        target = step.get("target") or {}
        selector = target.get("selector") if isinstance(target, dict) else ""
        value = step.get("value", "")
        store_as = step.get("storeAs", "")
        
        # Skip disabled steps
        if step.get("enabled") is False:
            lines.append(f"{indent}// Skipped: {action} {selector}")
            continue
        
        # Generate code based on action
        if action == "goto":
            lines.append(f"{indent}await page.goto('{value}');")
        elif action == "click":
            lines.append(f"{indent}await page.locator('{selector}').click();")
        elif action == "clickPosition":
            try:
                pos = json.loads(value) if isinstance(value, str) else value
                x, y = pos.get("x", 0), pos.get("y", 0)
                lines.append(f"{indent}await page.mouse.click({x}, {y});")
            except:
                lines.append(f"{indent}// Invalid position: {value}")
        elif action == "dblclick":
            lines.append(f"{indent}await page.locator('{selector}').dblclick();")
        elif action == "hover":
            lines.append(f"{indent}await page.locator('{selector}').hover();")
        elif action == "fill":
            lines.append(f"{indent}await page.locator('{selector}').fill('{value}');")
        elif action == "type":
            lines.append(f"{indent}await page.locator('{selector}').type('{value}');")
        elif action == "press":
            lines.append(f"{indent}await page.locator('{selector}').press('{value}');")
        elif action == "selectOption":
            lines.append(f"{indent}await page.locator('{selector}').selectOption('{value}');")
        elif action == "uploadFile":
            lines.append(f"{indent}await page.locator('{selector}').setInputFiles('{value}');")
        elif action == "waitForVisible":
            lines.append(f"{indent}await page.locator('{selector}').waitFor({{ state: 'visible' }});")
        elif action == "waitForHidden":
            lines.append(f"{indent}await page.locator('{selector}').waitFor({{ state: 'hidden' }});")
        elif action == "waitTimeout":
            lines.append(f"{indent}await page.waitForTimeout({value});")
        elif action == "expectExists":
            lines.append(f"{indent}await expect(page.locator('{selector}')).toBeVisible();")
        elif action == "expectNotExists":
            lines.append(f"{indent}await expect(page.locator('{selector}')).not.toBeVisible();")
        elif action == "expectTextContains":
            lines.append(f"{indent}await expect(page.locator('{selector}')).toContainText('{value}');")
        elif action == "expectUrlMatches":
            lines.append(f"{indent}await expect(page).toHaveURL(/{value}/);")
        elif action == "expectTitle":
            lines.append(f"{indent}await expect(page).toHaveTitle('{value}');")
        elif action == "getText":
            var_name = store_as if store_as else "textContent"
            lines.append(f"{indent}const {var_name} = await page.locator('{selector}').textContent();")
        elif action == "getAttribute":
            var_name = store_as if store_as else "attrValue"
            lines.append(f"{indent}const {var_name} = await page.locator('{selector}').getAttribute('{value}');")
        elif action == "getValue":
            var_name = store_as if store_as else "inputValue"
            lines.append(f"{indent}const {var_name} = await page.locator('{selector}').inputValue();")
        elif action == "screenshot":
            lines.append(f"{indent}await page.screenshot({{ path: 'screenshot.png' }});")
        else:
            lines.append(f"{indent}// Unknown action: {action}")
    
    lines.append("});")
    lines.append("")
    
    return "\n".join(lines)


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
        # Save JSON file
        fp.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
        
        # Also save as Playwright test file
        playwright_fp = SCRIPTS_DIR / f"{safe}.spec.js"
        playwright_code = _generate_playwright_code(safe, cleaned)
        playwright_fp.write_text(playwright_code, "utf-8")
        
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
