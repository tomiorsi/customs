@echo off
REM ============================================================
REM  PASO 1 - DIAGNOSTICO (solo lee, no modifica nada)
REM
REM  Que hace: averigua como se llama la base del Kit Malvina y
REM  que tablas tiene. NO exporta datos todavia.
REM
REM  Como usarlo: doble click. Cuando termine se crea el archivo
REM  diagnostico-kit.txt en esta misma carpeta. Enviar ese archivo.
REM ============================================================
setlocal enabledelayedexpansion
set SALIDA=%~dp0diagnostico-kit.txt
echo Diagnostico Kit Malvina - %date% %time% > "%SALIDA%"

echo Buscando el motor de base de datos...
echo. >> "%SALIDA%"
echo === SERVICIOS SQL SERVER INSTALADOS === >> "%SALIDA%"
sc query type= service state= all | findstr /i "MSSQL SQLSERVER" >> "%SALIDA%" 2>&1

echo. >> "%SALIDA%"
echo === INSTANCIAS QUE RESPONDEN === >> "%SALIDA%"
for %%I in ("(local)" ".\SQLEXPRESS" ".\MSSQLSERVER" ".\SQLSERVER" "." "localhost") do (
  sqlcmd -S %%~I -E -l 5 -Q "SELECT @@SERVERNAME, @@VERSION" -h -1 -W >nul 2>&1
  if !errorlevel! equ 0 (
    echo. >> "%SALIDA%"
    echo --- RESPONDE: %%~I --- >> "%SALIDA%"
    sqlcmd -S %%~I -E -l 5 -Q "SELECT @@SERVERNAME AS servidor, @@VERSION AS version" -W >> "%SALIDA%" 2>&1
    echo. >> "%SALIDA%"
    echo    BASES DE DATOS: >> "%SALIDA%"
    sqlcmd -S %%~I -E -Q "SET NOCOUNT ON; SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name" -h -1 -W >> "%SALIDA%" 2>&1
    echo. >> "%SALIDA%"
    echo    TABLAS POR BASE (nombre y cantidad de filas): >> "%SALIDA%"
    sqlcmd -S %%~I -E -Q "SET NOCOUNT ON; DECLARE @s NVARCHAR(MAX)=N''; SELECT @s = @s + 'USE [' + name + ']; SELECT ''' + name + ''' AS base, t.name AS tabla, SUM(p.rows) AS filas FROM sys.tables t JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) GROUP BY t.name ORDER BY t.name;' FROM sys.databases WHERE database_id > 4; EXEC sp_executesql @s" -W -s "|" >> "%SALIDA%" 2>&1
  )
)

echo. >> "%SALIDA%"
echo === CARPETA C:\backup === >> "%SALIDA%"
if exist C:\backup ( dir C:\backup >> "%SALIDA%" 2>&1 ) else ( echo no existe >> "%SALIDA%" )

echo. >> "%SALIDA%"
echo === CARPETA DEL KIT === >> "%SALIDA%"
if exist "C:\Program Files (x86)\KitMalvina" ( dir "C:\Program Files (x86)\KitMalvina" >> "%SALIDA%" 2>&1 ) else ( echo no esta en la ruta por defecto >> "%SALIDA%" )

echo.
echo ============================================
echo  LISTO. Se creo: diagnostico-kit.txt
echo  Enviar ese archivo.
echo ============================================
pause
