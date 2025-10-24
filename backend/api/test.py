from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pathlib import Path

router = APIRouter()


@router.get("/test", response_class=HTMLResponse)
async def test_page():
    """Serve the test page for testing extension functionality"""
    test_page_path = Path(__file__).parent.parent / "test_page.html"
    if not test_page_path.exists():
        raise HTTPException(status_code=404, detail="Test page not found")
    return HTMLResponse(content=test_page_path.read_text("utf-8"))
