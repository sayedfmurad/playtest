from fastapi import WebSocket
from connection_manager import ConnectionManager
from playwright_manager import get_current_page
import json
import logging

# Use Uvicorn's logger for colorized output
logger = logging.getLogger("uvicorn.error")


async def process_message(data: str, manager: ConnectionManager, websocket: WebSocket):
    try:
        message = json.loads(data)
        logger.info("Processing incoming message")

        # Send acknowledgment
        response1 = {
            "type": "acknowledgment",
            "message": "Message received"
        }
        await manager.send_personal_message(json.dumps(response1), websocket)

        # Send processing status
        response2 = {
            "type": "processing",
            "message": "Processing your request with Playwright..."
        }
        await manager.send_personal_message(json.dumps(response2), websocket)

        # Use Playwright to interact with the page
        playwright_data = {}
        current_page = get_current_page()
        if current_page:
            try:
                # Get current page information using Playwright
                page_title = await current_page.title()
                page_url = current_page.url

                # You can add more Playwright operations here based on the message content
                # For example, if the message contains a URL to navigate to:
                if message.get("action") == "navigate" and message.get("url"):
                    await current_page.goto(message["url"], wait_until="domcontentloaded")
                    page_title = await current_page.title()
                    page_url = current_page.url

                # If the message asks for page content
                elif message.get("action") == "get_content":
                    page_content = await current_page.content()
                    playwright_data["content_length"] = len(page_content)

                # If the message asks for a screenshot
                elif message.get("action") == "screenshot":
                    screenshot = await current_page.screenshot()
                    playwright_data["screenshot_size"] = len(screenshot)

                playwright_data.update({
                    "title": page_title,
                    "url": page_url,
                    "ready": True
                })

            except Exception as e:
                logger.exception("Playwright operation failed")
                playwright_data = {
                    "error": f"Playwright operation failed: {str(e)}",
                    "ready": False
                }
        else:
            logger.warning("Playwright not ready when processing message")
            playwright_data = {
                "error": "Playwright not ready",
                "ready": False
            }

        # Send result with Playwright data
        response3 = {
            "type": "result",
            "message": "Processing completed",
            "original_data": message,
            "playwright_data": playwright_data
        }
        await manager.send_personal_message(json.dumps(response3), websocket)

    except json.JSONDecodeError:
        logger.error("Received invalid JSON format from client")
        error_response = {
            "type": "error",
            "message": "Invalid JSON format"
        }
        await manager.send_personal_message(json.dumps(error_response), websocket)
