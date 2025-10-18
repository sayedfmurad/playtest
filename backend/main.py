from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from connection_manager import ConnectionManager
from playwright_manager import playwright_lifespan, get_current_page, get_browser_context
import json
import asyncio
from typing import List
from message_processor import process_message
import logging

# Initialize connection manager
manager = ConnectionManager()

# Use Uvicorn's logger for colorized output
logger = logging.getLogger("uvicorn.error")

app = FastAPI(lifespan=playwright_lifespan)

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
