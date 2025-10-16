from contextlib import asynccontextmanager
from playwright.async_api import async_playwright
from pathlib import Path
from fastapi import FastAPI

# Global variables to store Playwright instances
playwright_instance = None
browser_context = None
current_page = None

@asynccontextmanager
async def playwright_lifespan(app: FastAPI):
    """
    Manages Playwright browser lifecycle for the FastAPI application.
    Handles startup (browser initialization) and shutdown (cleanup) automatically.
    """
    # Startup: Initialize Playwright
    global playwright_instance, browser_context, current_page
    
    print("Starting Playwright instance...")
    playwright_instance = await async_playwright().start()
    
    # Set up extension directory with absolute path
    EXT_DIR = str(Path(__file__).parent.parent / "extension")
    print(f"Extension directory: {EXT_DIR}")
    
    # Verify extension directory exists
    if not Path(EXT_DIR).exists():
        print(f"ERROR: Extension directory not found: {EXT_DIR}")
        raise FileNotFoundError(f"Extension directory not found: {EXT_DIR}")
    
    # Verify manifest.json exists
    manifest_path = Path(EXT_DIR) / "manifest.json"
    if not manifest_path.exists():
        print(f"ERROR: Manifest file not found: {manifest_path}")
        raise FileNotFoundError(f"Manifest file not found: {manifest_path}")
    
    print(f"Loading extension from: {EXT_DIR}")
    
    # Launch browser with persistent context for extensions
    import tempfile

    user_data_dir = f"user-data"
    browser_context = await playwright_instance.chromium.launch_persistent_context(
        user_data_dir,
        headless=False,
        args=[
            f"--disable-extensions-except={EXT_DIR}",
            f"--load-extension={EXT_DIR}"
        ],
    )
    
    # Reuse the existing page (tab) to avoid opening a new one
    pages = browser_context.pages
    if pages and len(pages) > 0:
        current_page = pages[0]
    else:
        # If no page exists yet, wait for the first one instead of creating a new tab
        current_page = await browser_context.wait_for_event("page")
    
    # Set up console logging
    def on_console(msg):
        print("PAGE CONSOLE:", msg.text)
    current_page.on("console", on_console)
    
    # Navigate to initial page
    await current_page.goto("https://example.com", wait_until="domcontentloaded")
    
    print("Playwright instance started and ready!")
    print("WebSocket API server running on ws://127.0.0.1:8000/ws")
    print("Extension should connect via WebSocket and send page information.")
    
    yield  # Server is running
    
    # Shutdown: Clean up Playwright
    print("Shutting down Playwright instance...")
    if browser_context:
        await browser_context.close()
    if playwright_instance:
        await playwright_instance.stop()
    print("Playwright instance stopped.")

def get_current_page():
    """Get the current Playwright page instance."""
    return current_page

def get_browser_context():
    """Get the current Playwright browser context."""
    return browser_context

def get_playwright_instance():
    """Get the current Playwright instance."""
    return playwright_instance
