#!/bin/sh
# Lädt fehlende oder veraltete Kartendaten (rd5-Kacheln) und startet BRouter.
set -eu

cd /segments4
for tile in $SEGMENTS; do
  file="${tile}.rd5"
  if [ -f "$file" ] && [ "${UPDATE_DAYS:-0}" -gt 0 ] && [ -n "$(find "$file" -mtime +"$UPDATE_DAYS" 2>/dev/null)" ]; then
    echo "brouter: $file ist älter als $UPDATE_DAYS Tage – wird aktualisiert"
    stale=1
  else
    stale=0
  fi
  if [ ! -s "$file" ] || [ "$stale" = 1 ]; then
    echo "brouter: lade $file …"
    if curl -fL -sS --retry 3 -o "$file.part" "$SEGMENTS_URL/$file"; then
      mv "$file.part" "$file"
    else
      rm -f "$file.part"
      echo "brouter: Download von $file fehlgeschlagen" >&2
      [ -s "$file" ] || exit 1
    fi
  fi
done

# Dateien gehören dem Benutzer des Hosts (Unraid: nobody/users), Server läuft ohne root
chown -R "$PUID:$PGID" /segments4 /customprofiles

echo "brouter: starte Server auf Port $PORT (Kacheln: $SEGMENTS)"
exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups java -Xmx"$JAVA_XMX" -Xms128m -DmaxRunningTime=300 -DuseRFCMimeType=false \
  -cp /app/brouter.jar btools.server.RouteServer \
  /segments4 /profiles2 customprofiles "$PORT" "$MAXTHREADS" 0.0.0.0
