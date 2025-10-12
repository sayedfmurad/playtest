from playwright.sync_api import sync_playwright
from pathlib import Path

EXT_DIR = str(Path("quick-ext").resolve())

with sync_playwright() as p:
    # Use a persistent context to allow extensions
    user_data_dir = "user-data"
    context = p.chromium.launch_persistent_context(
        user_data_dir,
        headless=False,
        args=[
            f"--disable-extensions-except={EXT_DIR}",
            f"--load-extension={EXT_DIR}"
        ],
    )

    page = context.new_page()

    # Print console logs (so you can see the extension's fetch result)
    def on_console(msg):
        print("PAGE CONSOLE:", msg.text)
    page.on("console", on_console)

    page.goto("https://example.com", wait_until="domcontentloaded")

    print("WebSocket API server should be running on ws://127.0.0.1:8000/ws")
    print("Extension will connect via WebSocket and send page information.")
    print("Navigate around; content script should establish WebSocket connection and send page data.")
    page.wait_for_timeout(50000)  # keep browser open briefly for the test
    context.close()
