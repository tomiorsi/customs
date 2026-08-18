@echo off
REM Lanza el diagnostico v2. Solo lee, no modifica nada.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnostico2.ps1"
pause
