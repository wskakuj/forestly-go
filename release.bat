@echo off
REM ==========================================
REM Forestly GO - wydanie nowej wersji (2x klik)
REM ==========================================
cd /d "%~dp0"
python release.py
echo.
pause
