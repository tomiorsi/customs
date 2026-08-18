# ============================================================
#  EXPORTAR LAS TABLAS DEL KIT MALVINA  (SOLO LEE)
#
#  Base: KitSql, en la instancia default (.)
#  Son las tablas codificadoras del SIM: puertos, aduanas,
#  paises, documentos, ventajas, unidades, etc.
#  NO contiene datos de clientes ni despachos.
#
#  Deja un CSV por tabla en la carpeta  tablas-kit\
# ============================================================
$ErrorActionPreference = "Stop"
$destino = Join-Path $PSScriptRoot "tablas-kit"
New-Item -ItemType Directory -Force -Path $destino | Out-Null

$cn = New-Object System.Data.SqlClient.SqlConnection
$cn.ConnectionString = "Server=.;Database=KitSql;Integrated Security=True;Connect Timeout=10"
$cn.Open()
Write-Host "Conectado a KitSql." -ForegroundColor Green

$cmd = $cn.CreateCommand()
$cmd.CommandText = "SELECT name FROM sys.tables ORDER BY name"
$r = $cmd.ExecuteReader()
$tablas = @(); while ($r.Read()) { $tablas += $r.GetString(0) }; $r.Close()

Write-Host "$($tablas.Count) tablas. Exportando..."
foreach ($t in $tablas) {
  try {
    $c = $cn.CreateCommand(); $c.CommandText = "SELECT * FROM [dbo].[$t]"; $c.CommandTimeout = 120
    $da = New-Object System.Data.SqlClient.SqlDataAdapter $c
    $dt = New-Object System.Data.DataTable
    [void]$da.Fill($dt)
    $dt | Export-Csv -Path (Join-Path $destino "$t.csv") -NoTypeInformation -Encoding UTF8
    Write-Host ("  {0,-10} {1,8} filas" -f $t, $dt.Rows.Count)
  } catch {
    Write-Host ("  {0,-10} ERROR: {1}" -f $t, $_.Exception.Message) -ForegroundColor Yellow
  }
}
$cn.Close()

# Comprimir para que sea un solo archivo
$zip = Join-Path $PSScriptRoot "tablas-kit.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path "$destino\*" -DestinationPath $zip
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " LISTO. Enviar el archivo: tablas-kit.zip"
Write-Host "============================================" -ForegroundColor Green
