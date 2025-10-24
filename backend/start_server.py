import uvicorn
import logging

logger = logging.getLogger("uvicorn.error")

if __name__ == "__main__":
    logger.info("Starting FastAPI server with Playwright integration...")
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True, 
        log_level="info"
    )
