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

:: Select Python interpreter
if exist "venv_gpu\Scripts\python.exe" (
    echo Using GPU virtual environment: venv_gpu
    set "PYTHON_EXE=venv_gpu\Scripts\python.exe"
) else if exist "venv\Scripts\python.exe" (
    echo Using virtual environment: venv
    set "PYTHON_EXE=venv\Scripts\python.exe"
) else if exist ".venv\Scripts\python.exe" (
    echo Using virtual environment: .venv
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else (
    echo Using system Python interpreter
    set "PYTHON_EXE=python"
)

:: Launch the FastAPI service
"%PYTHON_EXE%" -m app.main %*
pause
