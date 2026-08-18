# ============================================================
#  EXPORTAR DE SINTIA  (SOLO LEE)   ·  base ALPHA2000
#
#  Hace dos cosas:
#
#  A) TABLAS DE CODIGOS  -> lista blanca de tablas, completas.
#     Nomenclatura y codificadores. No hay datos de terceros.
#
#  B) DESPACHOS ANONIMOS -> de las tablas de operaciones saca
#     SOLO las columnas de mercaderia (descripcion, NCM, unidad,
#     sufijo, subregimen, origen). Filtro a nivel COLUMNA con
#     lista negra que gana siempre: si el nombre de una columna
#     huele a cliente, CUIT, proveedor, valor, factura o fecha,
#     no sale, aunque haya pasado la lista blanca.
#
#     Ademas escribe COLUMNAS-USADAS.txt con el detalle de que
#     se llevo y que se descarto, tabla por tabla, para poder
#     revisarlo.
# ============================================================
$ErrorActionPreference = "Stop"

# ---------- A) tablas de codigos, completas ----------
$TABLAS_CODIGOS = @(
  "ncm", "SUFIDOS", "subregimen",
  "NCM_BienDeCapital", "NCM_ImpuestoPais", "NCM_PYME_EXC_IVAGAN",
  "impuestos_internos", "seguridad_electrica_posiciones",
  "LNAPosiciones", "LNAPosicionesRes5", "LNAPIPosicionesAfectadas",
  "LNAPIAclaraciones", "LNAPIMarcaDeLetras", "LNAGruposPosiciones",
  "LNAANEXOORDEN", "LNAPIFECHADEDATOS", "NCM_DUMPING_FechaDeDatos",
  "Valores_criterio", "Valores_Criterio_Norma", "Valores_Criterio_Pais",
  "Valores_Criterio_Posiciones", "Valores_Criterio_Rel_Pais",
  "aduana", "PAIS", "mapeo_pais", "divisas", "via", "TRANSPORTE",
  "condiciondeventa", "estadomercaderia", "codemb", "tipoemb",
  "unidades", "UNIDREL", "dest", "MOTIVOS", "ventajas", "VentajasRel",
  "TAX", "STA", "catalogo", "LISTA", "TipoDocumento", "JRD",
  "DEPOSITO_MAG", "bancos", "codigos_tram",
  "CODIGOS_BK", "CODIGOS_IP", "CODIGOS_RANCHO",
  "CODIGOS_CHAS_CAPE", "CODIGOS_SOLICITUDPARTICULAR", "version"
)

# ---------- B) despachos, SOLO columnas de mercaderia ----------
$TABLAS_DESPACHOS = @("item", "DESPACHO_RESUMEN", "subitems", "iteminfo", "itemventaja", "caratula")

# Lo que se puede llevar (tiene que coincidir con alguno)
$COL_PERMITIDAS = @(
  "descrip","merc","articulo","product","detalle","texto","denomin",
  "ncm","posicion","partida","nomenclad",
  "unidad","umm","medida","cantidad",
  "sufi","subregimen","srg","destinacion","regimen",
  "origen","procedencia","pais",
  "estado","embalaje","emb","marca","modelo","tipo"
)

# Lo que NUNCA sale. Gana sobre la lista de arriba.
$COL_PROHIBIDAS = @(
  "client","cuit","cuil","razon","nombre","apellido","domicili","direccion",
  "telefono","mail","contacto",
  "importad","exportad","proveedor","vendedor","comprador","consignat",
  "remitente","destinatar","despachante",
  "valor","importe","precio","monto","fob","cif","cfr","flete","seguro","total",
  "factura","comprobante","remito",
  "caratula","despacho","expediente","nrodesp","numdesp",
  "fecha","usuario","operador","legajo","cuenta"
)

function Permitida($nombre) {
  $n = $nombre.ToLower()
  foreach ($p in $COL_PROHIBIDAS) { if ($n -like "*$p*") { return $false } }
  foreach ($p in $COL_PERMITIDAS) { if ($n -like "*$p*") { return $true } }
  return $false
}

$destino = Join-Path $PSScriptRoot "sintia"
New-Item -ItemType Directory -Force -Path $destino | Out-Null
$informe = Join-Path $destino "COLUMNAS-USADAS.txt"
"Informe de columnas - $(Get-Date)" | Out-File $informe -Encoding utf8

$cn = New-Object System.Data.SqlClient.SqlConnection
$cn.ConnectionString = "Server=.\ALPHA2000;Database=ALPHA2000;Integrated Security=True;Connect Timeout=15"
$cn.Open()
Write-Host "Conectado a ALPHA2000." -ForegroundColor Green

function Existe($t) {
  $c = $cn.CreateCommand()
  $c.CommandText = "SELECT name FROM sys.tables WHERE LOWER(name)=LOWER(@t)"
  [void]$c.Parameters.AddWithValue("@t", $t)
  $r = $c.ExecuteReader(); $n = $null
  if ($r.Read()) { $n = $r.GetString(0) }
  $r.Close(); return $n
}
function Columnas($t) {
  $c = $cn.CreateCommand()
  $c.CommandText = "SELECT c.name FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id WHERE t.name=@t ORDER BY c.column_id"
  [void]$c.Parameters.AddWithValue("@t", $t)
  $r = $c.ExecuteReader(); $l = @()
  while ($r.Read()) { $l += $r.GetString(0) }
  $r.Close(); return $l
}
function Exportar($sql, $archivo, $timeout = 900) {
  $c = $cn.CreateCommand(); $c.CommandText = $sql; $c.CommandTimeout = $timeout
  $da = New-Object System.Data.SqlClient.SqlDataAdapter $c
  $dt = New-Object System.Data.DataTable
  [void]$da.Fill($dt)
  $dt | Export-Csv -Path $archivo -NoTypeInformation -Encoding UTF8
  return $dt.Rows.Count
}

# ================= A =================
Write-Host ""
Write-Host "--- A) TABLAS DE CODIGOS ---" -ForegroundColor Cyan
foreach ($t in $TABLAS_CODIGOS) {
  $real = Existe $t
  if (-not $real) { continue }
  try {
    $n = Exportar "SELECT * FROM [dbo].[$real]" (Join-Path $destino "cod_$real.csv")
    Write-Host ("  {0,-32} {1,8} filas" -f $real, $n)
  } catch { Write-Host ("  {0,-32} ERROR {1}" -f $real, $_.Exception.Message) -ForegroundColor Yellow }
}

# ================= B =================
Write-Host ""
Write-Host "--- B) DESPACHOS (solo columnas de mercaderia) ---" -ForegroundColor Cyan
foreach ($t in $TABLAS_DESPACHOS) {
  $real = Existe $t
  if (-not $real) { continue }
  $todas = Columnas $real
  $si = @($todas | Where-Object { Permitida $_ })
  $no = @($todas | Where-Object { -not (Permitida $_) })

  "" | Out-File $informe -Append -Encoding utf8
  "=== $real ===" | Out-File $informe -Append -Encoding utf8
  ("  SE LLEVA  : " + ($(if ($si.Count) { $si -join ", " } else { "(ninguna)" }))) | Out-File $informe -Append -Encoding utf8
  ("  SE DESCARTA: " + ($no -join ", ")) | Out-File $informe -Append -Encoding utf8

  if ($si.Count -eq 0) {
    Write-Host ("  {0,-22} sin columnas permitidas, se saltea" -f $real) -ForegroundColor DarkGray
    continue
  }
  $lista = ($si | ForEach-Object { "[$_]" }) -join ", "
  try {
    $n = Exportar "SELECT $lista FROM [dbo].[$real]" (Join-Path $destino "desp_$real.csv")
    Write-Host ("  {0,-22} {1,8} filas · {2} de {3} columnas" -f $real, $n, $si.Count, $todas.Count)
  } catch { Write-Host ("  {0,-22} ERROR {1}" -f $real, $_.Exception.Message) -ForegroundColor Yellow }
}
$cn.Close()

$zip = Join-Path $PSScriptRoot "sintia.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path "$destino\*" -DestinationPath $zip

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " LISTO. Enviar: sintia.zip"
Write-Host " Adentro va COLUMNAS-USADAS.txt con el detalle"
Write-Host " de que se llevo y que no, tabla por tabla."
Write-Host "============================================" -ForegroundColor Green
