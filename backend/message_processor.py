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
        logger.info("Processing incoming message: " + str(message))


        # Send processing status
        response1 = {
            "type": "processing",
            "message": "Processing your request with Playwright..."
        }
        await manager.send_personal_message(json.dumps(response1), websocket)

        # Use Playwright to interact with the page
        playwright_data = {}
        current_page = get_current_page()
        if current_page:
            try:
                if message.get("type") == "ping":
                    # Handle ping message
                    playwright_data = {"status": "pong sent"}
                # If the message asks for page content
                if message.get("action") == "get_content":
                    page_content = await current_page.content()
                    playwright_data["content_length"] = len(page_content)

            except Exception as e:
                logger.exception("Playwright operation failed")
                playwright_data = {
                    "error": f"Playwright operation failed: {str(e)}"
                }
        else:
            logger.warning("Playwright not ready when processing message")
            playwright_data = {
                "error": "Playwright not ready",
            }

        # Send result with Playwright data
        response3 = {
            "type": "result",
            "message": "Processing completed",
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
