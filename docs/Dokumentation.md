//To remember for the exam
Das Projekt orientierte sich an der klassischen Phasenstruktur des Wasserfallmodells, wurde jedoch iterativ umgesetzt, um flexible Anpassungen während der Entwicklung zu ermöglichen.


"يتم تحميل مكونات React مباشرة من خلال الـ UMD-Builds، لذلك لا تكون هناك حاجة لأدوات بناء إضافية مثل Webpack أو Vite."

الآن نشرح كلمة UMD Build 👇

🔹 معنى UMD (Universal Module Definition)


///Todo 
""Zur Versionsverwaltung wurde GitHub genutzt, während die Diagramme mit diagrams.net erstellt wurden.""
check what app you will use then wright here
„Anhang A.1: Detaillierte Zeitplanung”.


anhang Aktivitätsdiagramm - Geschäftslogik
anhang Pflichtenheft
anhang 5.1 Implementierung der Datenstrukturen
anhang 5.2 Implementierung der Geschäftslogik
anhang 5.3 Implementierung der Schnittstellen
anhang 5.4 Verwendete Bibliotheken

Anhang A7: JSON-Datenstruktur """
{
  "name": "checkout_flow",
  "steps": [
    {
      "action": "goto",
      "value": "https://shop.example.com",
      "options": { "waitUntil": "load", "timeout": 30000 }
    },
    {
      "action": "fill",
      "target": { "selector": "#email" },
      "value": "user@example.com",
      "enabled": true
    },
    {
      "action": "press",
      "target": { "selector": "#email" },
      "value": "Enter"
    },
    {
      "action": "click",
      "target": { "selector": ".buy-button" },
      "retries": 1,
      "retryDelayMs": 200
    },
    {
      "action": "expectUrlMatches",
      "value": "checkout"
    },
    {
      "action": "expectTextContains",
      "target": { "selector": "h1" },
      "value": "Checkout"
    }
  ]
}

"""

## Inhaltsverzeichnis

1. Einleitung
   1.1. Projektumfeld
   1.2. Projektziel
   1.3. Projektbegründung
   1.4. Projektschnittstellen
   1.5. Projektabgrenzung
2. Projektplanung
   2.1. Projektphasen
   2.2. Ressourcenplanung
   2.3. Entwicklungsprozess
3. Analysephase
   3.1. Ist-Analyse
   3.2. Soll‑Konzept / Anforderungen
   3.3. Use‑Cases / Testfälle
4. Entwurfsphase
   4.1. Architekturdesign
   4.2. Benutzeroberfläche (Chrome Extension)
   4.3. API‑Design (FastAPI / WebSocket)
   4.4. Datenstruktur (JSON)
5. Implementierungsphase
   5.1. Backend‑Implementierung (Python API + Playwright)
   5.2. Frontend‑Implementierung (React‑basierte Extension)
   5.3. Kommunikation & Testlauf‑Logik
   5.4. Fehlerbehandlung und Logging
6. Abnahme‑ und Testphase
   6.1. Testdurchführung
   6.2. Testergebnisse und Optimierung
7. Dokumentation
   7.1. Technische Dokumentation
   7.2. Benutzerdokumentation
   7.3. Fazit / Lessons Learned / Ausblick
8. Fazit
   8.1. Soll‑/Ist‑Vergleich
   8.2. Lessons Learned
   8.3. Ausblick

---

## 1. Einleitung

### 1.1. Projektumfeld
Der Ausbildungsbetrieb ist die Nextlevels GmbH mit Sitz in Mönchengladbach. Nextlevels ist ein Software- und E-Commerce-Dienstleister, der sich auf die Entwicklung und Betreuung von Online-Shops auf Basis des Frameworks Shopware spezialisiert hat. Das Unternehmen unterstützt seine Kunden bei der Planung, Umsetzung und Optimierung individueller E-Commerce-Lösungen und betreut sowohl kleine als auch mittelständische Unternehmen aus verschiedenen Branchen.

### 1.2. Projektziel
- Schnelles Erstellen von UI‑Tests ohne lokale Node‑/Build‑Kette
- Direkte Ausführung gegen einen kontrollierten Browser‑Kontext
- Speicherung der Schrittfolgen als JSON plus automatische Erzeugung einer Playwright‑`*.spec.js`‑Datei

### 1.3. Projektbegründung
UI‑Tests per Hand sind fehleranfällig und langsam. Mit Playtest lassen sich Testfälle klickbar zusammenstellen, wiederverwenden und versionieren. Die Architektur minimiert Setup‑Aufwand und ist lokal sofort nutzbar.

### 1.4. Projektschnittstellen
- Chrome‑Extension (Manifest V3) als UI
- FastAPI Backend (`/backend`) mit HTTP‑API und WebSocket
- Playwright (Chromium) für die eigentliche Browserautomation

### 1.5. Projektabgrenzung
- Kein Cloud‑/CI‑Betrieb im Scope (lokale Ausführung)
- Kein Recorder/Code‑Generator im Browser; Selektor‑/Positions‑Picker ist enthalten, komplexe Strategien (XPath/Heuristik) sind bewusst minimal
- Dateiupload wird in dieser Version nicht unterstützt

## 2. Projektplanung

### 2.1. Projektphasen
1) Analyse, 2) Entwurf, 3) Implementierung, 4) Tests, 5) Dokumentation & Fazit.

### 2.2. Ressourcenplanung
- Python 3.12, FastAPI, Playwright
- Chrome/Chromium mit Entwickler‑Modus für „Unpacked Extension“
- Zeitbedarf: 2–3 PT für MVP, plus 1 PT für Härtung/Docs

### 2.3. Entwicklungsprozess
Kleines Iterationsmodell (Kanban): kurze Zyklen, manuelles Testing, Logging‑gestütztes Debugging.

## 3. Analysephase

### 3.1. Ist‑Analyse
Typische Hürden: komplizierter Projekt‑Setup, fragile Selektoren, fehlendes unmittelbares Feedback. Playtest adressiert das mit einem stets laufenden Browser‑Kontext, einem simplen Schrittmodell und unmittelbaren Rückmeldungen in der UI.

### 3.2. Soll‑Konzept / Anforderungen
- Tests als Liste von Schritten mit Aktion, Ziel, Wert und Optionen
- Ergebnis je Schritt (ok/Fehler, Meldung), optional Variablen‑Speicherung (`storeAs`)
- Persistenz als JSON mit paralleler Generierung einer `*.spec.js`
- Selektor‑ und Positions‑Picker im Content‑Script

### 3.3. Use‑Cases / Testfälle
- Navigation zu URL, Klicks, Texteingaben
- Warten auf Sichtbarkeit/Unsichtbarkeit/Navigation
- Assertions auf Text, Titel, URL
- Daten abfragen (`getText`, `getValue`, `getAttribute`), Screenshot erstellen

## 4. Entwurfsphase

### 4.1. Architekturdesign
- Backend: FastAPI (`backend/main.py`) mit Lebenszyklus‑Management für Playwright in `playwright_lifespan`. Ein WebSocket‑Endpoint `/ws` delegiert an `api/websocket.py`, der je Nachricht `message_processor.process_message` aufruft. `ConnectionManager` verwaltet Clients.
- Frontend: Ungebaute React‑Komponenten (per CDN) in der Extension; `StepsBuilder` ist der zentrale Editor/Runner.
- Kommunikation: REST für Skripte (`/scripts`, `/scripts/{name}`), WebSocket für Aktionsausführung.

### 4.2. Benutzeroberfläche (Chrome Extension)
- `popup.html` lädt React, UI‑Komponenten und verbindet sich per `content.js` mit der aktuellen Seite
- Selektor‑/Positions‑Picker hebt Elemente hervor und liefert CSS‑Selektor bzw. Seitenkoordinaten zurück

### 4.3. API‑Design (FastAPI / WebSocket)
HTTP (JSON):
- GET `/scripts` → `{ items: [{ name, mtime }] }`
- GET `/scripts/{name}` → `{ name, steps: [...] }`
- POST `/scripts` (Body: `{ name, steps }`) → `{ ok, name }` und erzeugt zusätzlich `backend/scripts/{name}.spec.js`

WebSocket `/ws` (JSON‑Nachrichten):
```json
{ "id": "<client-id>", "action": "click", "target": { "selector": "#btn" }, "value": "...", "options": { "timeout": 10000 } }
```
Antwort:
```json
{ "type": "result", "id": "<client-id>", "status": "ok", "details": { "elapsedMs": 12 } }
```
Bei Fehlern enthält `status: "error"` und ein `error`‑Objekt.

### 4.4. Datenstruktur (JSON)
Ein Schritt im gespeicherten Skript:
```json
{
  "action": "click",
  "target": { "selector": "#login" },
  "value": "optional",
  "options": { "timeout": 10000 },
  "storeAs": "optionalVar",
  "enabled": true
}
```
Unterstützte Aktionen (Auszug): `goto`, `click`, `clickPosition`, `dblclick`, `hover`, `fill`, `type`, `press`, `selectOption`, `waitForVisible`, `waitForHidden`, `waitTimeout`, `expectExists`, `expectNotExists`, `expectTextContains`, `expectUrlMatches`, `expectTitle`, `getText`, `getAttribute`, `getValue`, `screenshot`, `setViewport`, `setDefaultTimeout`, `switchFrame`, `evalJs`.

## 5. Implementierungsphase

### 5.1. Backend‑Implementierung (Python API + Playwright)
- Lebenszyklus: `playwright_lifespan` startet einen persistenten Chromium‑Kontext mit geladener Extension und setzt eine definierte Viewport‑Größe. `start_server.py` startet Uvicorn im Reload‑Modus.
- WebSocket‑Verarbeitung: `message_processor.py` parst die Nachricht, wählt den passenden Aktions‑Handler und sendet standardisierte Antworten zurück. Fehler führen zu `status: "error"` inkl. Stacktrace.

### 5.2. Frontend‑Implementierung (React Extension)
- `StepsBuilder.js` verwaltet die Schritteliste, Status/Fehler je Schritt und speichert/lädt über die REST‑API
- `content.js` vermittelt Befehle an den WebSocket, interpoliert Variablen (`${name}`) und sendet Ergebnis‑Events zurück an die UI
- `ExtensionWebSocket.js` kapselt Reconnect‑Logik, Request‑IDs und Zeitüberschreitung

### 5.3. Kommunikation & Testlauf‑Logik
- UI → Content‑Script → WebSocket (Befehle)
- Backend → Content‑Script → UI (Ergebnisse je Schritt per `chrome.runtime.sendMessage`)
- Option „Stop on error“ beendet „Run all“ frühzeitig

### 5.4. Fehlerbehandlung und Logging
- Einheitliche Fehlerantworten über `_build_error`
- Uvicorn‑Logger für farbige Serverlogs
- Client‑seitig konsistente Fehlermeldungen pro Schritt

## 6. Abnahme‑ und Testphase

### 6.1. Testdurchführung
1. Backend starten (siehe Benutzerdokumentation)
2. Extension als „Unpacked“ laden
3. Beispiel‑Test: `goto` → `expectTitle` → `click` → `waitForVisible`
4. Speicherung unter einem Namen, erneutes Laden und Ausführen

### 6.2. Testergebnisse und Optimierung
- Stabil: Navigation, Interaktionen, Assertions
- Verbesserungen: robustere Selektor‑Strategien, Streaming‑Logs während der Ausführung, optionaler Headless‑Modus

## 7. Dokumentation

### 7.1. Technische Dokumentation
Quellcode‑Einstieg:
- Backend: `backend/main.py`, `backend/api/*`, `backend/message_processor.py`, `backend/playwright_manager.py`
- Frontend: `extension/components/*`, `extension/content.js`, `extension/ExtensionWebSocket.js`

### 7.2. Benutzerdokumentation
Siehe „Setup & Nutzung“ unten für eine kompakte Schritt‑für‑Schritt‑Anleitung.

### 7.3. Fazit / Lessons Learned / Ausblick
Siehe Kapitel 8.

## 8. Fazit

### 8.1. Soll‑/Ist‑Vergleich
- Soll: Einfaches, lokales E2E‑Testing mit geringer Einstiegshürde
- Ist: Ziel erreicht; CRUD der Skripte, zuverlässige Aktionsausführung, klare Rückmeldungen

### 8.2. Lessons Learned
- Persistenter Browser‑Kontext reduziert Flakiness spürbar
- Einheitliches Antwortschema vereinfacht die UI‑Fehlerbehandlung

### 8.3. Ausblick
- Headless‑Option und CI‑Integration
- Export/Import von Projekten, Generierung vollständiger Test‑Suiten
- Verbesserte Selektor‑Erkennung und visuelle Reports

---

## Setup & Nutzung (Kurzfassung)

1) Abhängigkeiten installieren
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m playwright install chromium
```

2) Server starten
```
python backend/start_server.py
```

3) Extension laden
- Chrome öffnen → chrome://extensions → „Developer mode“ aktivieren → „Load unpacked“ → Ordner `extension/` wählen

4) Tests erstellen/ausführen
- Toolbar‑Icon klicken → Fenster öffnet sich → Schritte hinzufügen → „Run“ bzw. „Run all“
- Speichern unter Namen, später über „Load“ erneut laden


