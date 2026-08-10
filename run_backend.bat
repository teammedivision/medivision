@echo off
REM ============================================================
REM  MediVision - start the Flask API (backend)
REM  Double-click this file. It sets up Python 3.12, installs
REM  dependencies the first time, then starts the API.
REM ============================================================
setlocal
cd /d "%~dp0api"

echo.
echo  MediVision backend launcher
echo  ---------------------------

REM --- Check for Python 3.12 (TensorFlow needs 3.10-3.13, not 3.14) ---
py -3.12 --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [!] Python 3.12 was not found.
  echo      TensorFlow does not support Python 3.14, so this project needs 3.12.
  echo      1^) Install Python 3.12 from https://www.python.org/downloads/
  echo      2^) Tick "Add python.exe to PATH" during install
  echo      3^) Re-run this file.
  echo.
  pause
  exit /b 1
)

REM --- Create the virtual environment once ---
if not exist venv312\Scripts\python.exe (
  echo  Creating virtual environment ^(first run only^)...
  py -3.12 -m venv venv312
)

call venv312\Scripts\activate.bat

REM --- Install dependencies ---
echo  Installing / verifying dependencies ^(first run can take a few minutes^)...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo  [!] Dependency install failed. Check the messages above.
  pause
  exit /b 1
)

echo.
echo  Starting MediVision on http://localhost:5000
echo  This one address now serves both the API and the web page -
echo  just open http://localhost:5000 in your browser (run_frontend.bat
echo  is no longer required for local use).
echo  Loading the 4 models takes 30-60 seconds the first time. Keep this window open.
echo.
python app.py

pause
