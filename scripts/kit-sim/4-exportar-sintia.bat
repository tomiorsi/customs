@echo off
REM Sintia: tablas de codigos + despachos anonimos. Solo lectura.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0exportar-sintia.ps1"
pause
