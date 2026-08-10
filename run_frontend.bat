@echo off
REM ============================================================
REM  MediVision - serve the frontend and open it in a browser
REM  Run run_backend.bat FIRST (in its own window), then this.
REM ============================================================
setlocal
cd /d "%~dp0frontend"

echo.
echo  MediVision frontend
echo  -------------------
echo  Serving at http://localhost:8080
echo  A browser tab will open. Keep this window open while using the app.
echo.

REM Open the browser, then start a simple static server.
start "" http://localhost:8080

py -3.12 -m http.server 8080 2>nul || python -m http.server 8080

pause
