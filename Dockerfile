# Veloterra – Web-App (statische Dateien über nginx)
#
#   docker build -t veloterra .
#   docker run -p 8088:80 veloterra
#
# Umgebungsvariablen (zur Laufzeit, kein Neubau nötig):
#   BROUTER_UPSTREAM  interne Adresse eines eigenen BRouter-Servers, z. B.
#                     http://192.168.1.10:17777 – nginx leitet /brouter dorthin
#                     weiter (empfohlen, keine CORS-Probleme)
#   BROUTER_URL       alternativ: öffentliche URL, die der Browser direkt nutzt
#                     (Standard: https://brouter.de/brouter)
#   API_UPSTREAM      interne Adresse des Veloterra-Servers (docker/api), z. B.
#                     http://veloterra-api:8787 – nginx leitet /api dorthin weiter

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx tsc -b && npx vite build

FROM nginx:1.27-alpine
LABEL org.opencontainers.image.title="Veloterra" \
      org.opencontainers.image.description="Routenplaner für Rennrad, Gravel, MTB und Trekking nach Belag und Straßenart"

RUN mkdir -p /etc/nginx/veloterra

COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/web/40-veloterra-config.sh /docker-entrypoint.d/40-veloterra-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

ENV BROUTER_URL="" \
    BROUTER_UPSTREAM="" \
    API_UPSTREAM=""

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
