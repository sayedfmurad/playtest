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
    
    async def process_message(data: str):
        try:
            message = json.loads(data)
            print(f"Received from extension: {message}")
            
            # Send multiple messages as responses
            response1 = {
                "type": "acknowledgment",
                "message": "Message received"
            }
            await manager.send_personal_message(json.dumps(response1), websocket)
            
            response2 = {
                "type": "processing",
                "message": "Processing your request..."
            }
            await manager.send_personal_message(json.dumps(response2), websocket)
            
            # Simulate some processing time
            await asyncio.sleep(0.1)
            
            response3 = {
                "type": "result",
                "message": "Processing completed",
                "data": message  # Echo back the original message
            }
            await manager.send_personal_message(json.dumps(response3), websocket)
            
        except json.JSONDecodeError:
            error_response = {
                "type": "error",
                "message": "Invalid JSON format"
            }
            await manager.send_personal_message(json.dumps(error_response), websocket)
    
    try:
        while True:
            # Wait for message from client
            data = await websocket.receive_text()
            # Process message asynchronously without waiting
            asyncio.create_task(process_message(data))
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
