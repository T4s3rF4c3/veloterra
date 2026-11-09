# Veloterra-Server (Admin-Login, seitenweite Einstellungen, GPS-Spuren für alle)
#
#   docker build -f docker/api/Dockerfile -t veloterra-api .
#   docker run -e ADMIN_PASSWORD=… -v ./data/api:/data veloterra-api
#
# Umgebungsvariablen:
#   ADMIN_PASSWORD  Passwort für den Admin-Bereich (ohne: Anmeldung gesperrt)
#   DATA_DIR        Ablage für Einstellungen und Kacheln (Standard /data)

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:server

FROM node:22-alpine
LABEL org.opencontainers.image.title="Veloterra API" \
      org.opencontainers.image.description="Admin-Login und vorab geladene GPS-Spuren für Veloterra"
WORKDIR /app
COPY --from=build /app/dist-server/server.mjs ./server.mjs
ENV DATA_DIR=/data \
    PORT=8787 \
    ADMIN_PASSWORD=""
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8787/api/session || exit 1
CMD ["node", "server.mjs"]
