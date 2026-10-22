@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo   Starting Local Image Generation Web Service (Windows)
echo =======================================================

:: Check for .env file; create from example if missing
if not exist ".env" (
    echo [.env] not found. Creating default configuration from .env.example...
    copy .env.example .env >nul
)

:: Activate virtual environment if present
if exist "venv_gpu\Scripts\activate.bat" (
    echo Activating GPU virtual environment (venv_gpu)...
    call venv_gpu\Scripts\activate.bat
) else if exist "venv\Scripts\activate.bat" (
    echo Activating virtual environment (venv)...
    call venv\Scripts\activate.bat
) else if exist ".venv\Scripts\activate.bat" (
    echo Activating virtual environment (.venv)...
    call .venv\Scripts\activate.bat
) else (
    echo [Notice] No virtual environment detected in venv_gpu\, venv\ or .venv\.
    echo Running with system Python interpreter...
)

:: Launch the FastAPI service
python -m app.main %*
pause
