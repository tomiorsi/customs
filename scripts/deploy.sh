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
# npm ci borra node_modules antes de instalar y a veces falla con ENOTEMPTY si
# quedó un directorio a medias de una corrida anterior. Reintentamos una vez
# con el árbol limpio en lugar de dejar el deploy trabado.
if ! npm ci; then
  echo "  npm ci falló; limpiando node_modules y reintentando"
  rm -rf node_modules
  npm ci
fi

echo "▸ Instalando dependencias de Python"
# El servidor lee PDF escaneados y planillas de Excel con Python, así que las
# dependencias de requirements.txt tienen que llegar igual que las de Node.
# Faltaba: el venv del servidor solo se tocaba a mano, y una librería nueva
# —como las de Excel— quedaba sin instalar y la lectura fallaba en silencio.
if [ -f requirements.txt ]; then
  [ -d .venv ] || python3 -m venv .venv
  # `python3 -m pip` y no `.venv/bin/pip`: si el venv se creó en otra ruta, su
  # pip queda con el shebang viejo y no arranca. El módulo siempre funciona.
  ./.venv/bin/python3 -m pip install --quiet --upgrade pip
  ./.venv/bin/python3 -m pip install --quiet -r requirements.txt
fi

echo "▸ Compilando"
npm run build

echo "▸ Actualizando las tareas de refresco de fuentes"
# Las unidades viven en el repo: así un cambio de horario viaja con el código.
if [ -d scripts/systemd ]; then
  cp scripts/systemd/customs-*.service scripts/systemd/customs-*.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now customs-fuentes.timer
  systemctl enable --now customs-buques.timer
fi

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
