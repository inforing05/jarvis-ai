@echo off
title J.A.R.V.I.S — System Launch
color 0B
echo.
echo  ============================================
echo    J.A.R.V.I.S  --  INITIALIZING SYSTEMS
echo  ============================================
echo.

REM Install Python dependencies
echo [1/3] Checking Python dependencies...
pip install -r requirements.txt --quiet
echo       Done.

REM Start the Python backend in a new window
echo [2/3] Starting System Control Backend on port 5501...
start "JARVIS Backend" cmd /k "python server.py"
timeout /t 2 /nobreak >nul

REM Start the frontend server in another window
echo [3/3] Starting Frontend Server on port 5500...
start "JARVIS Frontend" cmd /k "python -m http.server 5500"
timeout /t 2 /nobreak >nul

REM Open browser
echo.
echo  All systems online. Opening JARVIS...
start http://127.0.0.1:5500
echo.
echo  ============================================
echo    JARVIS IS ONLINE  --  http://127.0.0.1:5500
echo  ============================================
echo.
pause
