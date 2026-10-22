@echo off
setlocal

echo ========================================================
echo   Configure Auto-Start on Windows Boot (Background Service)
echo ========================================================
echo.
echo Choose an option:
echo [1] Enable Auto-Start on Windows Login (Silent background server)
echo [2] Disable Auto-Start on Windows Login
echo.
set /p CHOICE="Enter 1 or 2: "

set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_FOLDER%\LocalImageGenStudio.vbs
set TARGET_VBS=%~dp0start_server_background.vbs

if "%CHOICE%"=="1" (
    echo.
    echo Copying background launcher to Windows Startup folder...
    copy /Y "%TARGET_VBS%" "%SHORTCUT_PATH%" >nul
    if exist "%SHORTCUT_PATH%" (
        echo [SUCCESS] Auto-start enabled! The server will start silently whenever you log into Windows.
    ) else (
        echo [ERROR] Failed to install startup shortcut.
    )
) else if "%CHOICE%"=="2" (
    echo.
    if exist "%SHORTCUT_PATH%" (
        del /F "%SHORTCUT_PATH%" >nul
        echo [SUCCESS] Auto-start disabled!
    ) else (
        echo [NOTICE] Auto-start is not currently configured.
    )
) else (
    echo Invalid choice.
)

echo.
pause
