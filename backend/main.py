from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from connection_manager import ConnectionManager
import json
import asyncio
from typing import List

app = FastAPI()

# Allow your extension to call localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://127.0.0.1", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize connection manager
manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Wait for message from client
            data = await websocket.receive_text()
            
            # Parse the incoming message
            try:
                message = json.loads(data)
                print(f"Received from extension: {message}")
                response = {
                    "type": "test",
                    "message": "test"
                }
                await manager.send_personal_message(json.dumps(response), websocket)
                
            except json.JSONDecodeError:
                error_response = {
                    "type": "error",
                    "message": "Invalid JSON format"
                }
                await manager.send_personal_message(json.dumps(error_response), websocket)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
