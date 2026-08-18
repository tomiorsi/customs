# ============================================================
#  COMPLETAR SINTIA  (SOLO LEE)  ·  base ALPHA2000
#
#  Ultimo. Trae lo que falto en la corrida anterior:
#    - la clave para unir cada clasificacion con su operacion
#    - el subregimen, la aduana, la via y el incoterm de cada despacho
#    - el AÑO (solo el año, no la fecha) para validar vigencias
#
#  A diferencia del anterior, NO usa patrones: las columnas
#  estan nombradas una por una, abajo. Lo que no esta en esta
#  lista no sale, punto.
#
#  NO se piden (siguen sin salir):
#    cuitcliente · cuitdespaduana · idvendedor · DATOCOMPRADOR
#    CUITTRANSPORT · DJAI_TERCEROCUIT · idempresa
#    fob/flete/seguro/divisas/cambio · facturas · fechas exactas
# ============================================================
$ErrorActionPreference = "Stop"

# tabla -> columnas exactas a traer
$PEDIDO = @{
  "caratula" = @(
    "interno",                  # clave para unir con item/subitems
    "idsubreg",                 # subregimen usado  <-- lo que faltaba
    "idaduana", "idaduanasal",
    "via", "idcondiciondeventa",
    "motivodestsuspensiva", "autorizdestsuspensiva", "plazoautorizacion",
    "idpaisdestino", "puertoemb"
  )
  "item"     = @("interno", "id", "IdArticulo", "ncm")
  "subitems" = @("interno", "id", "id2", "IDARTICULO", "ncm")
}

$destino = Join-Path $PSScriptRoot "sintia2"
New-Item -ItemType Directory -Force -Path $destino | Out-Null
$informe = Join-Path $destino "COLUMNAS-USADAS.txt"
"Informe - $(Get-Date)" | Out-File $informe -Encoding utf8

$cn = New-Object System.Data.SqlClient.SqlConnection
$cn.ConnectionString = "Server=.\ALPHA2000;Database=ALPHA2000;Integrated Security=True;Connect Timeout=15"
$cn.Open()
Write-Host "Conectado a ALPHA2000." -ForegroundColor Green
Write-Host ""

function ColsDe($t) {
  $c = $cn.CreateCommand()
  $c.CommandText = "SELECT c.name FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id WHERE t.name=@t"
  [void]$c.Parameters.AddWithValue("@t", $t)
  $r = $c.ExecuteReader(); $l = @{}
  while ($r.Read()) { $l[$r.GetString(0).ToLower()] = $r.GetString(0) }
  $r.Close(); return $l
}

foreach ($t in $PEDIDO.Keys) {
  $reales = ColsDe $t
  if ($reales.Count -eq 0) { Write-Host "  $t no existe"; continue }

  $sel = @(); $hay = @(); $falta = @()
  foreach ($c in $PEDIDO[$t]) {
    if ($reales.ContainsKey($c.ToLower())) { $r = $reales[$c.ToLower()]; $sel += "[$r]"; $hay += $r }
    else { $falta += $c }
  }
  # El AÑO solamente, nunca la fecha completa
  if ($t -eq "caratula" -and $reales.ContainsKey("fecha")) {
    $sel += "CASE WHEN ISDATE(fecha)=1 THEN YEAR(CAST(fecha AS datetime)) END AS anio"
    $hay += "anio (solo el año de 'fecha')"
  }
  if ($sel.Count -eq 0) { Write-Host "  $t : nada para traer"; continue }

  "" | Out-File $informe -Append -Encoding utf8
  "=== $t ===" | Out-File $informe -Append -Encoding utf8
  ("  SE LLEVA : " + ($hay -join ", ")) | Out-File $informe -Append -Encoding utf8
  if ($falta.Count) { ("  no existen: " + ($falta -join ", ")) | Out-File $informe -Append -Encoding utf8 }

  $c = $cn.CreateCommand()
  $c.CommandText = "SELECT " + ($sel -join ", ") + " FROM [dbo].[$t]"
  $c.CommandTimeout = 900
  $da = New-Object System.Data.SqlClient.SqlDataAdapter $c
  $dt = New-Object System.Data.DataTable
  [void]$da.Fill($dt)
  $dt | Export-Csv -Path (Join-Path $destino "link_$t.csv") -NoTypeInformation -Encoding UTF8
  Write-Host ("  {0,-12} {1,8} filas · {2} columnas" -f $t, $dt.Rows.Count, $hay.Count)
}

# DESPACHO_RESUMEN: solo los NOMBRES de campo, sin un solo valor
try {
  $c = $cn.CreateCommand()
  $c.CommandText = "SELECT CAMPO, COUNT(*) AS veces FROM [dbo].[DESPACHO_RESUMEN] GROUP BY CAMPO ORDER BY CAMPO"
  $c.CommandTimeout = 300
  $da = New-Object System.Data.SqlClient.SqlDataAdapter $c
  $dt = New-Object System.Data.DataTable
  [void]$da.Fill($dt)
  $dt | Export-Csv -Path (Join-Path $destino "campos_DESPACHO_RESUMEN.csv") -NoTypeInformation -Encoding UTF8
  Write-Host ("  {0,-12} {1,8} nombres de campo (sin valores)" -f "DESP_RESUMEN", $dt.Rows.Count)
  "" | Out-File $informe -Append -Encoding utf8
  "=== DESPACHO_RESUMEN ===" | Out-File $informe -Append -Encoding utf8
  "  SE LLEVA : solo los nombres de campo y cuantas veces aparecen. Ningun valor." | Out-File $informe -Append -Encoding utf8
} catch { Write-Host "  DESPACHO_RESUMEN: $($_.Exception.Message)" -ForegroundColor Yellow }

$cn.Close()
$zip = Join-Path $PSScriptRoot "sintia2.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path "$destino\*" -DestinationPath $zip
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " LISTO. Enviar: sintia2.zip"
Write-Host "============================================" -ForegroundColor Green
