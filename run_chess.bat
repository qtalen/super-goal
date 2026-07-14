@echo off
title Chess AI
echo ===== Chess AI =====

REM --- 自动安装后端依赖 ---
if not exist "%~dp0backend\.venv" (
    echo Installing Backend dependencies...
    cd /d "%~dp0backend" && uv sync
    cd /d "%~dp0"
)

REM --- 自动安装前端依赖 ---
if not exist "%~dp0frontend\node_modules" (
    echo Installing Frontend dependencies...
    cd /d "%~dp0frontend" && call pnpm install
    cd /d "%~dp0"
)

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
