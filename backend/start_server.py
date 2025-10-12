#!/usr/bin/env python3
"""
Startup script for the FastAPI server with integrated Playwright.
This replaces the old run.py for production use.
"""
import uvicorn

if __name__ == "__main__":
    print("Starting FastAPI server with Playwright integration...")
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,  # Set to False in production
        log_level="info"
    )
