@echo off
title Chess AI
echo ===== Chess AI =====
echo Starting Backend...
start "Chess Backend" cmd /c "cd /d "%~dp0backend" && .venv\Scripts\python run.py"
timeout /t 3 /nobreak >nul
echo Starting Frontend...
start "Chess Frontend" cmd /c "cd /d "%~dp0frontend" && npx vite --host"
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo.
echo Close this window to stop all services.
pause
