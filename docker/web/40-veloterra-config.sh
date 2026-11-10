#!/bin/sh
# Erzeugt beim Containerstart die Laufzeit-Konfiguration der Web-App und
# richtet bei Bedarf die Weiterleitung zum eigenen BRouter-Server ein.
set -eu

CONF_DIR=/etc/nginx/veloterra
mkdir -p "$CONF_DIR"
rm -f "$CONF_DIR"/*.conf

url="${BROUTER_URL:-}"
upstream="${BROUTER_UPSTREAM:-}"
api="${API_UPSTREAM:-}"

# Veloterra-Server (Admin, GPS-Spuren für alle) unter /api
if [ -n "$api" ]; then
  api="${api%/}"
  cat > "$CONF_DIR/api.conf" <<NGINX
location /api/ {
    proxy_pass ${api};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
    proxy_read_timeout 60s;
    # Sync von Routen und Heatmap braucht größere Anfragen
    client_max_body_size 16m;
}
NGINX
  echo "veloterra: Admin und GPS-Spuren über /api an ${api}"
else
  echo "veloterra: ohne Veloterra-Server (Admin-Bereich nicht verfügbar)"
fi

if [ -n "$upstream" ]; then
  upstream="${upstream%/}"
  cat > "$CONF_DIR/brouter.conf" <<NGINX
location /brouter {
    proxy_pass ${upstream};
    proxy_set_header Host \$host;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    client_max_body_size 2m;
}
NGINX
  url="/brouter"
  echo "veloterra: BRouter-Anfragen gehen über /brouter an ${upstream}"
elif [ -n "$url" ]; then
  echo "veloterra: Browser nutzt BRouter unter ${url}"
else
  echo "veloterra: öffentlicher BRouter-Server (brouter.de)"
fi

# JSON-sicher: nur einfache URL-Zeichen zulassen
case "$url" in
  *[\"\\\<\>]*) echo "veloterra: ungültige BROUTER_URL" >&2; exit 1 ;;
esac

if [ -n "$url" ]; then
  printf 'window.__VELOTERRA__ = { brouterUrl: "%s" };\n' "$url" > /usr/share/nginx/html/config.js
else
  printf 'window.__VELOTERRA__ = {};\n' > /usr/share/nginx/html/config.js
fi
