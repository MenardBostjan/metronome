from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import json
import os
app = FastAPI(title="Web Metronome API")

# Mount the static directory to serve index.html, style.css, app.js
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    # Redirect root to the static index.html
    return RedirectResponse(url="/static/index.html")

SETTINGS_FILE = "settings.json"
DEFAULT_SETTINGS = {
    "firstBeat": {
        "type": "triangle",
        "frequency": 800,
        "volume": 1.0,
        "percussiveDrop": True
    },
    "mainBeat": {
        "type": "sine",
        "frequency": 1000,
        "volume": 1.0,
        "percussiveDrop": False
    },
    "subBeat": {
        "type": "sine",
        "frequency": 600,
        "volume": 0.3,
        "percussiveDrop": False
    }
}

@app.get("/api/settings")
async def get_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return DEFAULT_SETTINGS
    return DEFAULT_SETTINGS

@app.post("/api/settings")
async def save_settings(request: Request):
    settings = await request.json()
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=4)
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    # When run directly, start uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
