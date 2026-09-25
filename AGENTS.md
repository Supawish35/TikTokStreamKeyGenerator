# Agent Instructions

## Package Manager
- **Backend (Python):** `pip install -r requirements.txt` — no lock file, no pyproject.toml
- **Frontend (npm):** `cd frontend && npm install` — React 18 + Vite 5 + Tailwind 3

## Run
| Mode | Command |
|------|---------|
| Desktop GUI (PySide6) | `python TiktokStreamKeyGenerator.py` |
| Web UI (Flask + Vite) | `./run_web.sh` — starts Flask on `:5000`, Vite on `:5173` |
| Flask backend only | `python app.py` |
| Frontend dev only | `cd frontend && npm run dev` |

## Test
```
python -m unittest test_app.py
python -m unittest test_comprehensive.py
python -m unittest test_edge_cases.py
```
No test runner config. Tests use `unittest` + `unittest.mock`. No pytest.

## Build / Release
- Nuitka standalone builds via `.github/workflows/release.yml` (manual `workflow_dispatch`)
- Targets: Windows, macOS (x86_64 + arm64), Linux
- FFmpeg is bundled into `bin/` at build time
- Version set by CI writing `_version.py`

## Commit Attribution
AI commits MUST include:
```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

## Project Layout
```
TiktokStreamKeyGenerator.py   # ~6000-line PySide6 desktop GUI + Stream class (core logic)
app.py                         # Flask REST backend wrapping Stream for the web UI
frontend/                      # React SPA (Vite + Tailwind)
  src/api.js                   #   API client — all endpoints under /api/*
  src/App.jsx                  #   Root component
  src/components/              #   UI components (Layout, StreamSetup, Controls, etc.)
  src/hooks/useSSE.js          #   SSE hook for real-time updates
Libs/                          # Internal libraries
  signers.py                   #   RapidAPI signer integration (XArgus, XLadon, XFrameSign)
  ffmpeg_sei_proxy.py          #   FFmpeg RTMP proxy with SEI metadata injection
  domain_routing.py            #   TikTok TNC domain resolution + NTP sync
  device_gen.py                #   Device/install ID registration
  rapidapi_quota.py            #   RapidAPI quota tracking (persisted to logs/)
  app_paths.py                 #   Cross-platform data directory resolution
  log_encrypt_codec.py         #   AES log encryption (TikTok protocol)
  XArgus.py, XLadon.py, XFrameSign.py  # Thin wrappers delegating to signers.py
Updater.py                     # GitHub release version checker
_version.py                    # Single source of truth for app version
```

## Key Conventions
- `TiktokStreamKeyGenerator.py` is the monolith: `Stream` class owns all TikTok API interaction; the GUI is in the same file
- `app.py` imports `Stream` from the GUI module, mocking PySide6 to avoid a Qt dependency at web runtime
- Cookies stored as JSON array of `{name, value, domain, …}` objects at `cookies.json`
- Config stored at `config.json` (keys: `rapidapi_key`, `cookies_path`, `device_id`, `install_id`, `hashtag_id`, `priority_region`, etc.)
- Both files are `.gitignore`d — never commit credentials
- `Libs/` modules use `try/except` import fallbacks for standalone Nuitka-packaged sub-processes (`from Libs.X` → `from X`)
- macOS `.app` bundles store user data in `~/Library/Application Support/TiktokStreamKeyGenerator/`, not inside the bundle
- Frontend proxies `/api` to Flask via Vite config — no CORS needed in dev
- SSE endpoint `GET /api/events` pushes real-time stats, violations, heartbeats, quota

## Sensitive Paths
- `cookies.json`, `config.json`, `*.pem`, `.env`, `logs/` — all gitignored, contain credentials or runtime state
- Never log or expose `sessionid`, `sessionid_ss`, or `rapidapi_key` values

