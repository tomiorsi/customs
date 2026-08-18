# ============================================================
#  DIAGNOSTICO 2 - Kit Malvina  (SOLO LEE, no modifica nada)
#  Usa PowerShell + .NET: no necesita sqlcmd ni instalar nada.
# ============================================================
$ErrorActionPreference = "SilentlyContinue"
$salida = Join-Path $PSScriptRoot "diagnostico-kit-2.txt"
"Diagnostico Kit Malvina v2 - $(Get-Date)" | Out-File $salida -Encoding utf8

function Log($t) { $t | Out-File $salida -Append -Encoding utf8 }

# --- 1. Instancias segun el registro (fuente confiable) ---
Log ""
Log "=== INSTANCIAS SEGUN EL REGISTRO ==="
$reg = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server"
$inst = (Get-ItemProperty "$reg\Instance Names\SQL" -EA SilentlyContinue)
$nombres = @()
if ($inst) {
  $inst.PSObject.Properties | Where-Object { $_.Name -notlike "PS*" } | ForEach-Object {
    Log ("  {0}  ->  {1}" -f $_.Name, $_.Value)
    $nombres += $_.Name
  }
} else { Log "  (no se pudo leer el registro)" }

# --- 2. Probar cada instancia ---
$servidores = @()
foreach ($n in $nombres) {
  if ($n -eq "MSSQLSERVER") { $servidores += "." } else { $servidores += ".\$n" }
}
$servidores += @(".", ".\SQLEXPRESS", ".\ALPHA2000")
$servidores = $servidores | Select-Object -Unique

foreach ($srv in $servidores) {
  $cn = New-Object System.Data.SqlClient.SqlConnection
  $cn.ConnectionString = "Server=$srv;Integrated Security=True;Connect Timeout=5"
  try { $cn.Open() } catch {
    Log ""
    Log "--- $srv : NO responde ($($_.Exception.Message.Split([Environment]::NewLine)[0]))"
    continue
  }

  Log ""
  Log "=========================================================="
  Log "--- $srv : RESPONDE"

  function Q($sql) {
    $cmd = $cn.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 30
    $r = $cmd.ExecuteReader(); $filas = @()
    while ($r.Read()) {
      $c = @(); for ($i=0; $i -lt $r.FieldCount; $i++) { $c += [string]$r.GetValue($i) }
      $filas += ,($c -join " | ")
    }
    $r.Close(); return $filas
  }

  Log ("    version: " + (Q "SELECT @@VERSION")[0])
  Log ""
  Log "    BASES DE DATOS:"
  $bases = Q "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name"
  foreach ($b in $bases) { Log "      - $b" }

  foreach ($b in $bases) {
    Log ""
    Log "    TABLAS DE [$b]  (tabla | filas):"
    $t = Q "USE [$b]; SELECT t.name, SUM(p.rows) FROM sys.tables t JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) GROUP BY t.name HAVING SUM(p.rows) > 0 ORDER BY t.name"
    if ($t.Count -eq 0) { Log "      (sin tablas con datos)" }
    foreach ($x in $t) { Log "      $x" }
  }
  $cn.Close()
}

# --- 3. Carpetas ---
Log ""
Log "=== CARPETA C:\backup ==="
if (Test-Path C:\backup) { Get-ChildItem C:\backup | ForEach-Object { Log ("  " + $_.Name + "   " + $_.Length) } }
else { Log "  no existe" }

Log ""
Log "=== ARCHIVOS .BAK / .MDF EN EL DISCO C ==="
Get-ChildItem C:\ -Include *.bak,*.mdf -Recurse -EA SilentlyContinue |
  Select-Object -First 40 | ForEach-Object { Log ("  " + $_.FullName + "   " + [math]::Round($_.Length/1MB,1) + " MB") }

Log ""
Log "=== CARPETA DEL KIT ==="
foreach ($p in @("C:\Program Files (x86)\KitMalvina","C:\Program Files\KitMalvina","C:\KitMalvina")) {
  if (Test-Path $p) { Log "  $p :"; Get-ChildItem $p | ForEach-Object { Log ("    " + $_.Name) } }
}

Write-Host ""
Write-Host "============================================"
Write-Host " LISTO. Se creo: diagnostico-kit-2.txt"
Write-Host " Enviar ese archivo."
Write-Host "============================================"
