@echo off
REM ============================================================
REM  PASO 2 - EXPORTAR LAS TABLAS (solo lee, no modifica nada)
REM
REM  Correr DESPUES del paso 1, con los datos que salieron de ahi.
REM
REM  Uso:  2-exportar-tablas.bat  <INSTANCIA>  <BASE>
REM  Ej:   2-exportar-tablas.bat  .\SQLEXPRESS  KITMALVINA
REM
REM  Deja un CSV por tabla en la carpeta  tablas-kit\
REM  Despues: comprimir esa carpeta en un .zip y enviarla.
REM ============================================================
setlocal enabledelayedexpansion
if "%~2"=="" (
  echo Faltan datos. Uso: %~nx0 ^<INSTANCIA^> ^<BASE^>
  echo Ejemplo: %~nx0 .\SQLEXPRESS KITMALVINA
  pause
  exit /b 1
)
set INSTANCIA=%~1
set BASE=%~2
set DESTINO=%~dp0tablas-kit
if not exist "%DESTINO%" mkdir "%DESTINO%"

echo Exportando tablas de [%BASE%] en %INSTANCIA% ...
echo.

REM Lista de tablas -> archivo temporal
sqlcmd -S %INSTANCIA% -E -d %BASE% -h -1 -W -Q "SET NOCOUNT ON; SELECT name FROM sys.tables ORDER BY name" > "%TEMP%\tablas.txt" 2>nul

for /f "usebackq delims=" %%T in ("%TEMP%\tablas.txt") do (
  set TABLA=%%T
  set TABLA=!TABLA: =!
  if not "!TABLA!"=="" if not "!TABLA:~0,1!"=="(" (
    echo   - !TABLA!
    REM -c texto  -t","  separador  -T conexion confiable
    bcp "[%BASE%].[dbo].[!TABLA!]" out "%DESTINO%\!TABLA!.csv" -S %INSTANCIA% -T -c -t"," -C 65001 >nul 2>&1
  )
)

del "%TEMP%\tablas.txt" >nul 2>&1
echo.
echo ============================================
echo  LISTO. Carpeta: tablas-kit
echo  Comprimirla en .zip y enviarla.
echo ============================================
pause
