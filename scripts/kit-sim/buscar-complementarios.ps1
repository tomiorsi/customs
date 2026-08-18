# ============================================================
#  BUSQUEDA FINAL  (SOLO LEE)
#
#  Busca 4 codigos de "datos complementarios" en TODAS las
#  tablas y TODAS las columnas de texto de las dos bases
#  (KitSql y ALPHA2000).
#
#  Si aparecen en alguna tabla que no exportamos, la encuentra.
#  Si no aparecen, quedamos seguros de que no estan guardados.
#
#  Es lento: recorre todo. Dejalo trabajando.
# ============================================================
$ErrorActionPreference = "SilentlyContinue"
$BUSCAR = @("IVAADICIONAL1", "LEY26184ART6", "ARN-TXT", "PAISEMIT-FACTCOM")
$salida = Join-Path $PSScriptRoot "donde-estan-los-complementarios.txt"
"Busqueda - $(Get-Date)" | Out-File $salida -Encoding utf8
"Buscando: $($BUSCAR -join ', ')" | Out-File $salida -Append -Encoding utf8

$SERVIDORES = @(@{s=".";           d="KitSql"},
                @{s=".\ALPHA2000"; d="ALPHA2000"})

foreach ($srv in $SERVIDORES) {
  Write-Host ""
  Write-Host "=== $($srv.d) en $($srv.s) ===" -ForegroundColor Cyan
  "" | Out-File $salida -Append -Encoding utf8
  "=== $($srv.d) ===" | Out-File $salida -Append -Encoding utf8

  $cn = New-Object System.Data.SqlClient.SqlConnection
  $cn.ConnectionString = "Server=$($srv.s);Database=$($srv.d);Integrated Security=True;Connect Timeout=15"
  try { $cn.Open() } catch { Write-Host "  no conecta"; continue }

  # tabla + columna de texto
  $c = $cn.CreateCommand()
  $c.CommandText = @"
SELECT t.name AS tabla, c.name AS col
FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE ty.name IN ('char','varchar','nchar','nvarchar','text','ntext')
ORDER BY t.name, c.name
"@
  $r = $c.ExecuteReader(); $pares = @()
  while ($r.Read()) { $pares += @{t=$r.GetString(0); c=$r.GetString(1)} }
  $r.Close()
  Write-Host "  $($pares.Count) columnas de texto para revisar..."

  $n = 0
  foreach ($p in $pares) {
    $n++
    if ($n % 200 -eq 0) { Write-Host "    $n / $($pares.Count)" -ForegroundColor DarkGray }
    $cond = ($BUSCAR | ForEach-Object { "[$($p.c)] LIKE '%$_%'" }) -join " OR "
    $q = $cn.CreateCommand()
    $q.CommandText = "SELECT TOP 1 COUNT(*) FROM [dbo].[$($p.t)] WHERE $cond"
    $q.CommandTimeout = 60
    try {
      $cant = $q.ExecuteScalar()
      if ($cant -gt 0) {
        $msg = "  ENCONTRADO  $($srv.d).$($p.t).$($p.c)  ->  $cant filas"
        Write-Host $msg -ForegroundColor Green
        $msg | Out-File $salida -Append -Encoding utf8
      }
    } catch { }
  }
  $cn.Close()
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " LISTO. Enviar: donde-estan-los-complementarios.txt"
Write-Host "============================================" -ForegroundColor Green
