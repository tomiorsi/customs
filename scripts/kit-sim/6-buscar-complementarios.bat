@echo off
REM Busca los codigos de complementarios en todas las tablas. Solo lectura. LENTO.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0buscar-complementarios.ps1"
pause
