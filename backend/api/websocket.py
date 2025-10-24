from fastapi import WebSocket, WebSocketDisconnect
from connection_manager import ConnectionManager
from message_processor import process_message
import asyncio
import logging

logger = logging.getLogger("uvicorn.error")


async def handle_websocket(websocket: WebSocket, manager: ConnectionManager):
    """Handle WebSocket connection"""
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
