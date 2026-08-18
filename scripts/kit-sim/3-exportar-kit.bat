@echo off
REM Exporta las tablas codificadoras del Kit Malvina. Solo lee.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0exportar-kitsql.ps1"
pause
