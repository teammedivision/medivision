@echo off
REM ============================================================
REM  MediVision - share the app with anyone, anywhere, for free
REM  Uses ngrok to tunnel your local server to a public https URL.
REM
REM  ONE-TIME PREP:
REM    1) Run run_backend.bat once first (creates the Python venv).
REM    2) Sign up free at https://ngrok.com and copy your authtoken.
REM    3) Download ngrok for Windows: https://ngrok.com/download
REM       Unzip it and either add the folder to PATH, or drop
REM       ngrok.exe directly into this MediVision_GUI folder.
REM    4) Run once:  ngrok config add-authtoken YOUR_TOKEN
REM ============================================================
setlocal
cd /d "%~dp0"

where ngrok >nul 2>&1
if errorlevel 1 (
  if exist ngrok.exe (
    set PATH=%~dp0;%PATH%
  ) else (
    echo.
    echo  [!] ngrok was not found on PATH or in this folder.
    echo      See the comments at the top of this file for setup steps.
    echo.
    pause
    exit /b 1
  )
)

if not exist api\venv312\Scripts\python.exe (
  echo.
  echo  [!] Backend hasn't been set up yet.
  echo      Run run_backend.bat once first, let it finish loading,
  echo      close it, then re-run this file.
  echo.
  pause
  exit /b 1
)

echo.
echo  Starting the MediVision server (API + frontend, one port: 5000)...
start "MediVision Server" cmd /k "cd /d "%~dp0api" && call venv312\Scripts\activate.bat && python serve.py"

echo  Waiting ~60s for the 4 models to load into memory...
timeout /t 60 /nobreak >nul

echo  Starting the public ngrok tunnel...
start "MediVision Public URL" cmd /k "ngrok http 5000"

echo.
echo  In the "MediVision Public URL" window, look for a line like:
echo    Forwarding   https://xxxx-xx-xx-xxx-xx.ngrok-free.app -^> http://localhost:5000
echo.
echo  Share that https://... link with anyone, anywhere in the world.
echo  Keep BOTH new windows open the whole time people are using it -
echo  closing either one, or sleeping/shutting down this PC, ends the demo.
echo.
echo  Note: on ngrok's free plan the link changes each time you restart
echo  the tunnel, and first-time visitors may see a one-click ngrok
echo  interstitial page before reaching the app.
echo.
pause
