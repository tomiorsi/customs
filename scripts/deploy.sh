#!/usr/bin/env bash
#
# Despliegue en el VPS. Lo ejecuta el workflow de GitHub por SSH en cada push a
# main, y también sirve para correr a mano:
#
#   bash /var/www/customs/scripts/deploy.sh
#
# No toca .env ni data/: los dos están fuera de git y son propios del servidor.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/customs}"
SERVICIO="${SERVICIO:-customs}"
PUERTO="${PUERTO:-3001}"

cd "$APP_DIR"

echo "▸ Trayendo la última versión de main"
git fetch origin main
# reset --hard en vez de pull: el servidor es un destino de despliegue, nunca
# se edita ahí, y así un conflicto de merge no puede dejar el deploy a medias.
git reset --hard origin/main

echo "▸ Instalando dependencias de Node"
npm ci

echo "▸ Compilando"
npm run build

echo "▸ Reiniciando el servicio"
systemctl restart "$SERVICIO"

echo "▸ Verificando que responda"
for intento in $(seq 1 15); do
  codigo="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PUERTO}" || true)"
  if [ "$codigo" = "200" ] || [ "$codigo" = "307" ]; then
    echo "✓ Desplegado: $(git rev-parse --short HEAD) responde $codigo"
    exit 0
  fi
  sleep 2
done

echo "✗ El servicio no respondió después de reiniciar. Últimos logs:"
journalctl -u "$SERVICIO" -n 40 --no-pager
exit 1
