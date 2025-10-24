from fastapi import FastAPI, WebSocket
from connection_manager import ConnectionManager
from playwright_manager import playwright_lifespan
from api import test, scripts, websocket

# Initialize connection manager
manager = ConnectionManager()

app = FastAPI(lifespan=playwright_lifespan)

# Include routers
app.include_router(test.router)
app.include_router(scripts.router)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    """WebSocket endpoint"""
    await websocket.handle_websocket(ws, manager)
