@echo off
echo ========================================================
echo   Configuring Laptop Server Power & Clamshell Settings
echo ========================================================
echo.

:: 1. Never sleep while plugged into power (AC)
powercfg -change -standby-timeout-ac 0
echo [OK] Sleep timeout set to NEVER when plugged in.

:: 2. Never hibernate while plugged into power (AC)
powercfg -change -hibernate-timeout-ac 0
echo [OK] Hibernate timeout set to NEVER when plugged in.

:: 3. Do nothing when laptop lid/screen is closed while plugged in (Clamshell mode)
powercfg -setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0
powercfg -setactive SCHEME_CURRENT
echo [OK] Lid close action set to DO NOTHING when plugged in.

echo.
echo ========================================================
echo [SUCCESS] Your laptop is now configured as a 24/7 Server!
echo You can close the lid and keep power plugged in.
echo ========================================================
echo.
pause
