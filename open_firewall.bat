@echo off
echo ========================================================
echo   Configuring Windows Firewall for Remote Server Access
echo ========================================================

:: Check for Administrator privileges; auto-elevate if needed
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to add firewall rule...
    powershell -Command "Start-Process cmd -ArgumentList '/c netsh advfirewall firewall add rule name=\"Local Image Gen Studio 7860\" dir=in action=allow protocol=TCP localport=7860 && echo. && echo Firewall rule added successfully! You can now close this window. && pause' -Verb RunAs"
    exit /b
)

:: Already elevated, add rule directly
netsh advfirewall firewall add rule name="Local Image Gen Studio 7860" dir=in action=allow protocol=TCP localport=7860
echo.
echo [SUCCESS] Inbound TCP Port 7860 is now OPEN in Windows Firewall!
echo Remote devices on Tailscale and Local Wi-Fi can now connect.
echo.
pause
