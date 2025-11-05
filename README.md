# Playtest

Ein leichtgewichtiges E2E‑Testwerkzeug bestehend aus einer Chrome‑Extension (UI) und einem Python‑Backend mit FastAPI und Playwright.

- Ausführliche Projektdokumentation: `docs/Dokumentation.md`

## Schnellstart

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m playwright install chromium
python backend/start_server.py
```

Chrome öffnen → `chrome://extensions` → Developer Mode → „Load unpacked“ → Ordner `extension/` wählen → Toolbar‑Icon klicken → Tests im UI erstellen und ausführen.

## Ordnerstruktur

- `backend/` FastAPI‑Server, WebSocket, Playwright‑Lifecycle
- `extension/` Chrome‑Extension mit React‑UI (ohne Build‑Schritt)
- `docs/` Projektdokumentation


