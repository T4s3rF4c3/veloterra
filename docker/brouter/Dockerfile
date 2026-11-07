# BRouter-Server für Veloterra – mit automatischem Download der Kartendaten
#
#   docker build -t veloterra-brouter docker/brouter
#   docker run -p 17777:17777 -v /pfad/segments4:/segments4 veloterra-brouter
#
# Umgebungsvariablen:
#   SEGMENTS         Kacheln (5°×5°), Standard: Deutschland + Nachbarn
#                    „E5_N45 E5_N50 E10_N45 E10_N50“ (~1 GB)
#   UPDATE_DAYS      Kacheln nach so vielen Tagen neu laden (0 = nie), Std. 7
#   JAVA_XMX         Java-Speicher, Standard 1024m
#   MAXTHREADS       gleichzeitige Routing-Anfragen, Standard 4
#   PUID / PGID      Besitzer der Dateien in den Volumes (Unraid: 99 / 100)

FROM eclipse-temurin:17-jre-jammy

ARG BROUTER_VERSION=1.7.10

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL -o /tmp/brouter.zip \
       "https://github.com/abrensch/brouter/releases/download/v${BROUTER_VERSION}/brouter-${BROUTER_VERSION}.zip" \
    && mkdir -p /app /segments4 /customprofiles \
    && unzip -q /tmp/brouter.zip -d /tmp/brouter \
    && cp /tmp/brouter/brouter-${BROUTER_VERSION}/brouter-${BROUTER_VERSION}-all.jar /app/brouter.jar \
    && cp -r /tmp/brouter/brouter-${BROUTER_VERSION}/profiles2 /profiles2 \
    && rm -rf /tmp/brouter /tmp/brouter.zip \
    # BRouter sucht hochgeladene Profile relativ zum Profilordner
    && ln -s /customprofiles /profiles2/customprofiles

COPY --chmod=755 entrypoint.sh /app/entrypoint.sh

ENV SEGMENTS="E5_N45 E5_N50 E10_N45 E10_N50" \
    SEGMENTS_URL="https://brouter.de/brouter/segments4" \
    UPDATE_DAYS=7 \
    JAVA_XMX=1024m \
    MAXTHREADS=4 \
    PORT=17777 \
    PUID=99 \
    PGID=100

VOLUME ["/segments4", "/customprofiles"]
EXPOSE 17777
# Server antwortet (Port offen) – Kacheln können beim ersten Start einige Minuten laden
HEALTHCHECK --interval=60s --timeout=5s --start-period=15m \
  CMD curl -s -o /dev/null "http://127.0.0.1:${PORT}/" || exit 1

CMD ["/app/entrypoint.sh"]
