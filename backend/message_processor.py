from fastapi import WebSocket
from connection_manager import ConnectionManager
from playwright_manager import get_current_page, get_browser_context
import json
import logging
import asyncio
import time
import base64
import traceback
import re
from typing import Any, Dict, Callable, Awaitable, Optional

# Use Uvicorn's logger for colorized output
logger = logging.getLogger("uvicorn.error")


# Helpers
async def _screenshot_base64(page, full_page: bool = False) -> Optional[str]:
    try:
        data = await page.screenshot(full_page=full_page)
        return base64.b64encode(data).decode("utf-8")
    except Exception:
        logger.exception("Failed to capture screenshot")
        return None


def _build_ok(message_id: Any, details: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "type": "result",
        "id": message_id,
        "status": "ok",
        "details": details,
    }


def _build_error(message_id: Any, action: str, err: Exception, elapsed_ms: int, screenshot_b64: Optional[str]) -> Dict[str, Any]:
    return {
        "type": "result",
        "id": message_id,
        "status": "error",
        "error": {
            "name": err.__class__.__name__,
            "message": f"{action}: {str(err)}",
            "stack": traceback.format_exc(),
        },
        "details": {"elapsedMs": elapsed_ms},
        "screenshot": screenshot_b64,
    }


def _get_timeout(options: Dict[str, Any], default_ms: int = 10000) -> int:
    if not options:
        return default_ms
    # Support both timeout and ms
    return int(options.get("timeout", options.get("ms", default_ms)))


# Action handlers
async def _act_goto(page, message: Dict[str, Any]) -> Dict[str, Any]:
    url = message.get("value") or (message.get("options") or {}).get("url")
    if not url:
        raise ValueError("goto: 'value' or options.url is required")
    timeout = _get_timeout(message.get("options"), 30000)
    wait_until = (message.get("options") or {}).get("waitUntil", "load")
    resp = await page.goto(url, timeout=timeout, wait_until=wait_until)
    return {"url": page.url, "status": getattr(resp, "status", None)}


async def _act_reload(page, message: Dict[str, Any]) -> Dict[str, Any]:
    timeout = _get_timeout(message.get("options"), 30000)
    wait_until = (message.get("options") or {}).get("waitUntil", "load")
    await page.reload(timeout=timeout, wait_until=wait_until)
    return {"url": page.url}


async def _act_goBack(page, message: Dict[str, Any]) -> Dict[str, Any]:
    timeout = _get_timeout(message.get("options"), 30000)
    await page.go_back(timeout=timeout)
    return {"url": page.url}


async def _act_goForward(page, message: Dict[str, Any]) -> Dict[str, Any]:
    timeout = _get_timeout(message.get("options"), 30000)
    await page.go_forward(timeout=timeout)
    return {"url": page.url}


async def _act_waitForSelector(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    if not selector:
        raise ValueError("waitForSelector: 'target.selector' is required")
    timeout = _get_timeout(message.get("options"))
    state = (message.get("options") or {}).get("state", "attached")
    await page.wait_for_selector(selector, timeout=timeout, state=state)
    return {"selector": selector, "state": state}


async def _act_waitForVisible(page, message: Dict[str, Any]) -> Dict[str, Any]:
    message = {**message, "options": {**(message.get("options") or {}), "state": "visible"}}
    return await _act_waitForSelector(page, message)


async def _act_waitForHidden(page, message: Dict[str, Any]) -> Dict[str, Any]:
    message = {**message, "options": {**(message.get("options") or {}), "state": "hidden"}}
    return await _act_waitForSelector(page, message)


async def _act_waitForNavigation(page, message: Dict[str, Any]) -> Dict[str, Any]:
    timeout = _get_timeout(message.get("options"), 30000)
    url = (message.get("options") or {}).get("url")
    wait_until = (message.get("options") or {}).get("waitUntil")
    async with page.expect_navigation(url=url, wait_until=wait_until, timeout=timeout):
        # No action here; this is best used surrounding a click/fill etc. from the client
        pass
    return {"url": page.url}


async def _act_waitForNetworkIdle(page, message: Dict[str, Any]) -> Dict[str, Any]:
    timeout = _get_timeout(message.get("options"), 30000)
    await page.wait_for_load_state("networkidle", timeout=timeout)
    return {"state": "networkidle"}


async def _act_waitTimeout(page, message: Dict[str, Any]) -> Dict[str, Any]:
    ms = (message.get("options") or {}).get("ms") or message.get("value")
    if ms is None:
        raise ValueError("waitTimeout: 'options.ms' or 'value' (ms) is required")
    await asyncio.sleep(int(ms) / 1000.0)
    return {"sleptMs": int(ms)}


async def _act_click(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    if not selector:
        raise ValueError("click: 'target.selector' is required")
    opts = message.get("options") or {}
    timeout = _get_timeout(opts)
    await page.click(selector, timeout=timeout)
    return {"clicked": selector}


async def _act_dblclick(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    if not selector:
        raise ValueError("dblclick: 'target.selector' is required")
    timeout = _get_timeout(message.get("options"))
    await page.dblclick(selector, timeout=timeout)
    return {"dblclicked": selector}


async def _act_hover(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    if not selector:
        raise ValueError("hover: 'target.selector' is required")
    timeout = _get_timeout(message.get("options"))
    await page.hover(selector, timeout=timeout)
    return {"hovered": selector}


async def _act_fill(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    value = message.get("value")
    if not selector:
        raise ValueError("fill: 'target.selector' is required")
    if value is None:
        raise ValueError("fill: 'value' is required")
    timeout = _get_timeout(message.get("options"))
    await page.fill(selector, str(value), timeout=timeout)
    return {"filled": selector, "valueLength": len(str(value))}


async def _act_type(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    text = message.get("value")
    if not selector:
        raise ValueError("type: 'target.selector' is required")
    if text is None:
        raise ValueError("type: 'value' is required")
    timeout = _get_timeout(message.get("options"))
    await page.type(selector, str(text), timeout=timeout)
    return {"typed": selector, "textLength": len(str(text))}


async def _act_press(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    key = message.get("value") or (message.get("options") or {}).get("key")
    if not selector:
        raise ValueError("press: 'target.selector' is required")
    if not key:
        raise ValueError("press: 'value' or options.key is required (e.g., 'Enter')")
    timeout = _get_timeout(message.get("options"))
    await page.press(selector, key, timeout=timeout)
    return {"pressed": key, "on": selector}


async def _act_selectOption(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    value = message.get("value") or (message.get("options") or {}).get("value")
    if not selector:
        raise ValueError("selectOption: 'target.selector' is required")
    if value is None:
        raise ValueError("selectOption: 'value' is required (string | list | dict)")
    timeout = _get_timeout(message.get("options"))
    selected = await page.select_option(selector, value, timeout=timeout)
    return {"selected": selected}


async def _act_uploadFile(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    files = message.get("value") or (message.get("options") or {}).get("files")
    if not selector:
        raise ValueError("uploadFile: 'target.selector' is required")
    if not files:
        raise ValueError("uploadFile: 'value' or options.files is required (string | list)")
    await page.set_input_files(selector, files)
    return {"uploaded": files if isinstance(files, list) else [files]}


async def _expect_exists(page, selector: str, timeout: int, state: str = "attached"):
    await page.wait_for_selector(selector, state=state, timeout=timeout)


async def _expect_not_exists(page, selector: str, timeout: int):
    # If not present immediately, pass; otherwise wait until detached
    el = await page.query_selector(selector)
    if el is None:
        return
    await page.wait_for_selector(selector, state="detached", timeout=timeout)


async def _act_expectExists(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    if not selector:
        raise ValueError("expectExists: 'target.selector' is required")
    timeout = _get_timeout(message.get("options"))
    await _expect_exists(page, selector, timeout)
    return {"exists": True, "selector": selector}


async def _act_expectNotExists(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    if not selector:
        raise ValueError("expectNotExists: 'target.selector' is required")
    timeout = _get_timeout(message.get("options"))
    await _expect_not_exists(page, selector, timeout)
    return {"exists": False, "selector": selector}


async def _act_expectVisible(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    if not selector:
        raise ValueError("expectVisible: 'target.selector' is required")
    timeout = _get_timeout(message.get("options"))
    await page.wait_for_selector(selector, state="visible", timeout=timeout)
    return {"visible": True, "selector": selector}


async def _act_expectTextContains(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    needle = message.get("value")
    if not selector:
        raise ValueError("expectTextContains: 'target.selector' is required")
    if needle is None:
        raise ValueError("expectTextContains: 'value' is required")
    timeout = _get_timeout(message.get("options"))
    deadline = time.monotonic() + (timeout / 1000.0)
    last_text = None
    while time.monotonic() < deadline:
        try:
            last_text = await page.locator(selector).inner_text(timeout=500)
            if needle in last_text:
                return {"contains": True, "selector": selector}
        except Exception:
            await asyncio.sleep(0.05)
        await asyncio.sleep(0.05)
    raise TimeoutError(f"Text did not contain '{needle}' within {timeout}ms. Last text: {last_text}")


async def _act_expectUrlMatches(page, message: Dict[str, Any]) -> Dict[str, Any]:
    pattern = message.get("value") or (message.get("options") or {}).get("pattern")
    if not pattern:
        raise ValueError("expectUrlMatches: 'value' or options.pattern is required")
    flags = re.IGNORECASE if (message.get("options") or {}).get("ignoreCase") else 0
    url = page.url
    if re.search(pattern, url, flags):
        return {"url": url, "matches": True}
    raise AssertionError(f"URL '{url}' does not match pattern '{pattern}'")


async def _act_expectTitle(page, message: Dict[str, Any]) -> Dict[str, Any]:
    expected = message.get("value")
    mode = (message.get("options") or {}).get("mode", "equals")  # equals | contains | regex
    title = await page.title()
    if expected is None:
        raise ValueError("expectTitle: 'value' is required")
    if mode == "equals" and title == expected:
        return {"title": title, "matches": True}
    if mode == "contains" and expected in title:
        return {"title": title, "matches": True}
    if mode == "regex" and re.search(expected, title):
        return {"title": title, "matches": True}
    raise AssertionError(f"Title '{title}' did not match ({mode}) '{expected}'")


async def _act_getText(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    if not selector:
        raise ValueError("getText: 'target.selector' is required")
    timeout = _get_timeout(message.get("options"))
    value = await page.locator(selector).inner_text(timeout=timeout)
    return {"value": value}


async def _act_getAttribute(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    name = message.get("value") or (message.get("options") or {}).get("name")
    if not selector:
        raise ValueError("getAttribute: 'target.selector' is required")
    if not name:
        raise ValueError("getAttribute: 'value' or options.name is required")
    timeout = _get_timeout(message.get("options"))
    value = await page.locator(selector).get_attribute(name, timeout=timeout)
    return {"name": name, "value": value}


async def _act_getValue(page, message: Dict[str, Any]) -> Dict[str, Any]:
    target = message.get("target") or {}
    selector = target.get("selector") if isinstance(target, dict) else target
    if not selector:
        raise ValueError("getValue: 'target.selector' is required")
    timeout = _get_timeout(message.get("options"))
    value = await page.locator(selector).input_value(timeout=timeout)
    return {"value": value}


async def _act_getContent(page, message: Dict[str, Any]) -> Dict[str, Any]:
    html = await page.content()
    return {"content_length": len(html)}


async def _act_getUrl(page, message: Dict[str, Any]) -> Dict[str, Any]:
    return {"url": page.url}


async def _act_screenshot(page, message: Dict[str, Any]) -> Dict[str, Any]:
    full_page = bool((message.get("options") or {}).get("fullPage"))
    b64 = await _screenshot_base64(page, full_page=full_page)
    return {"screenshot": b64, "fullPage": full_page}


async def _act_setViewport(page, message: Dict[str, Any]) -> Dict[str, Any]:
    ctx = get_browser_context()
    opts = message.get("options") or {}
    width = opts.get("width")
    height = opts.get("height")
    if not (width and height):
        raise ValueError("setViewport: options.width and options.height are required")
    await ctx.set_viewport_size({"width": int(width), "height": int(height)})
    return {"width": int(width), "height": int(height)}


async def _act_setDefaultTimeout(page, message: Dict[str, Any]) -> Dict[str, Any]:
    ms = (message.get("options") or {}).get("timeout") or message.get("value")
    if ms is None:
        raise ValueError("setDefaultTimeout: 'options.timeout' or 'value' (ms) is required")
    page.set_default_timeout(int(ms))
    return {"timeout": int(ms)}


async def _act_switchFrame(page, message: Dict[str, Any]) -> Dict[str, Any]:
    opts = message.get("options") or {}
    name = opts.get("name")
    url = opts.get("url")
    if not (name or url):
        raise ValueError("switchFrame: options.name or options.url is required")
    frame = None
    if name:
        frame = page.frame(name=name)
    if frame is None and url:
        frame = page.frame(url=re.compile(url))
    if not frame:
        raise ValueError("switchFrame: frame not found")
    # Note: We return frame info; actions should specify frame selectors directly using frame locators in future
    return {"frameName": frame.name, "url": frame.url}


async def _act_evalJs(page, message: Dict[str, Any]) -> Dict[str, Any]:
    expr = message.get("value")
    if not expr:
        raise ValueError("evalJs: 'value' JavaScript expression is required")
    result = await page.evaluate(expr)
    # Ensure result is JSON-serializable
    try:
        json.dumps(result)
    except TypeError:
        result = str(result)
    return {"value": result}


# Dispatcher map
ACTION_HANDLERS: Dict[str, Callable[[Any, Dict[str, Any]], Awaitable[Dict[str, Any]]]] = {
    # Navigation
    "goto": _act_goto,
    "reload": _act_reload,
    "goBack": _act_goBack,
    "goForward": _act_goForward,
    # Waits
    "waitForSelector": _act_waitForSelector,
    "waitForVisible": _act_waitForVisible,
    "waitForHidden": _act_waitForHidden,
    "waitForNavigation": _act_waitForNavigation,
    "waitForNetworkIdle": _act_waitForNetworkIdle,
    "waitTimeout": _act_waitTimeout,
    # Interactions
    "click": _act_click,
    "dblclick": _act_dblclick,
    "fill": _act_fill,
    "type": _act_type,
    "press": _act_press,
    "hover": _act_hover,
    "selectOption": _act_selectOption,
    "uploadFile": _act_uploadFile,
    # Assertions
    "expectExists": _act_expectExists,
    "expectNotExists": _act_expectNotExists,
    "expectVisible": _act_expectVisible,
    "expectTextContains": _act_expectTextContains,
    "expectUrlMatches": _act_expectUrlMatches,
    "expectTitle": _act_expectTitle,
    # Data
    "getText": _act_getText,
    "getAttribute": _act_getAttribute,
    "getValue": _act_getValue,
    "getContent": _act_getContent,
    "getUrl": _act_getUrl,
    "screenshot": _act_screenshot,
    # Context
    "setViewport": _act_setViewport,
    "setDefaultTimeout": _act_setDefaultTimeout,
    "switchFrame": _act_switchFrame,
    # Utilities
    "evalJs": _act_evalJs,
}


async def process_message(data: str, manager: ConnectionManager, websocket: WebSocket):
    try:
        message = json.loads(data)
        logger.info("Processing incoming message: %s", message)

        # Send processing status as early feedback
        await manager.send_personal_message(json.dumps({
            "type": "processing",
            "id": message.get("id"),
            "message": "Processing your request with Playwright..."
        }), websocket)

        # Use Playwright to interact with the page
        current_page = get_current_page()
        if not current_page:
            logger.warning("Playwright not ready when processing message")
            await manager.send_personal_message(json.dumps({
                "type": "result",
                "id": message.get("id"),
                "status": "error",
                "error": {"name": "PlaywrightNotReady", "message": "Playwright not ready"},
                "details": {"elapsedMs": 0}
            }), websocket)
            return

        # Special ping handler for keepalive
        if message.get("type") == "ping":
            await manager.send_personal_message(json.dumps(_build_ok(message.get("id"), {"status": "pong"})), websocket)
            return

        action = message.get("action")
        handler = ACTION_HANDLERS.get(action)
        if not handler:
            raise ValueError(f"Unknown action: {action}")

        started = time.monotonic()
        try:
            details = await handler(current_page, message)
            elapsed_ms = int((time.monotonic() - started) * 1000)
            details = {**(details or {}), "elapsedMs": elapsed_ms}

            # Include screenshot only for explicit screenshot action
            response = _build_ok(message.get("id"), details)
            await manager.send_personal_message(json.dumps(response), websocket)
        except Exception as e:
            elapsed_ms = int((time.monotonic() - started) * 1000)
            shot = await _screenshot_base64(current_page, full_page=False)
            response = _build_error(message.get("id"), action or "<none>", e, elapsed_ms, shot)
            await manager.send_personal_message(json.dumps(response), websocket)

    except json.JSONDecodeError:
        logger.error("Received invalid JSON format from client")
        error_response = {
            "type": "error",
            "message": "Invalid JSON format"
        }
        await manager.send_personal_message(json.dumps(error_response), websocket)
