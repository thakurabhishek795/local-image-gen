@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   Stopping Local Image Generation Web Service (Port 7860)
echo ========================================================

set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":7860" ^| findstr "LISTENING"') do (
    set PID=%%a
    if not "!PID!"=="0" (
        echo Terminating process PID !PID!...
        taskkill /F /PID !PID! >nul 2>&1
        set FOUND=1
    )
)

if "!FOUND!"=="1" (
    echo [SUCCESS] Server process terminated successfully.
) else (
    echo [NOTICE] No active server process was found listening on port 7860.
)

echo.
pause
