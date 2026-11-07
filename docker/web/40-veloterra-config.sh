#!/bin/sh
# Erzeugt beim Containerstart die Laufzeit-Konfiguration der Web-App und
# richtet bei Bedarf die Weiterleitung zum eigenen BRouter-Server ein.
set -eu

CONF_DIR=/etc/nginx/veloterra
mkdir -p "$CONF_DIR"
rm -f "$CONF_DIR"/*.conf

url="${BROUTER_URL:-}"
upstream="${BROUTER_UPSTREAM:-}"

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
