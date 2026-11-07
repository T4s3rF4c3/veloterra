# Veloterra

Routenplaner für **Rennrad, Gravel, MTB und Trekking** mit feiner Steuerung nach **Untergrund** und **Straßenart** – und der Möglichkeit, einzelne Abschnitte nachträglich gezielt umzuplanen.

Routing: [BRouter](https://brouter.de) mit einem aus den Einstellungen generierten Profil · Daten: OpenStreetMap (Overpass, Photon) · Karte: OpenFreeMap · Luftbild: Esri World Imagery und amtliche Luftbilder (RLP, NRW, Hessen, Bayern) · Wind: Open-Meteo · Fotos: Panoramax, optional Mapillary

## Starten

```bash
npm install
npm run dev
```

Dann <http://localhost:5173> öffnen.

## Bedienung

| Aktion | So geht's |
|---|---|
| Start / Ziel / Etappen | Auf die Karte klicken |
| Wegpunkt verschieben | Marker ziehen |
| Wegpunkt löschen | Doppelklick oder Rechtsklick auf Marker |
| Wegpunkt in Route einfügen | Auf die Route klicken → „Wegpunkt einfügen“ |
| Abschnitt markieren | Auf die Route klicken → „Abschnitt ab hier markieren“ → Ende anklicken, **oder** im Höhenprofil ziehen |
| Abschnitt **umgehen** | Sperrt den Abschnitt für die betroffene Etappe und rechnet sie neu |
| Abschnitt **anders planen** | Setzt Wegpunkte an Anfang/Ende und gibt dem Teil eigene Einstellungen (z. B. „hier Schotter ok“) |
| **Alternative** | Schaltet für die Etappe durch bis zu 4 BRouter-Alternativen |
| **Immer meiden** | Speichert den Abschnitt dauerhaft als Sperre für alle Routen |
| Luftbild | Oben „Satellit“ (Esri, weltweit) oder **„Luftbild DE“** (amtliche Luftbilder 20–40 cm für RLP, NRW, Hessen, Bayern – schärfer und aktueller) wählen, oder auf die Route klicken → „Im Luftbild ansehen“ |
| Einfärbung | Oben: Untergrund · Straßenart · **Steigung** · **Wind** (Gegen-/Rückenwind zur Abfahrtszeit) · Einfarbig |
| Anstiege | Liste in der Seitenleiste (Länge, Ø- und Max-Steigung, Höhenmeter); Klick markiert den Anstieg. Im Höhenprofil rot hinterlegt |
| Wind | Abfahrtszeit wählen → Windrichtung/-stärke, Anteil Gegen-/Rückenwind, Hinweis „heimwärts Rückenwind“ |
| Belags-Check | Karte „Belags-Check“: Abschnitte, deren Belag in OSM fehlt oder nur geschätzt ist (Wirtschafts-, Rad- und Feldwege ohne `surface`), auf der Karte weiß gepunktet. Klick → Luftbild DE, Route ausgeblendet, Straßenfoto falls vorhanden. „✓ Passt“ blendet den Abschnitt dauerhaft aus, „⤳ Umgehen“ plant drumherum, „In OpenStreetMap eintragen“ öffnet den Editor an der Stelle |
| Stopps unterwegs | Oben „☕ Stopps“: Cafés & Bäcker, Trinkwasser, Rad-Service, Aussichtspunkte, WC bis 300 m neben der Route – mit km-Angabe; „Als Wegpunkt einfügen“ |
| Fotos der Strecke | Oben „📷 Fotos“: Straßenfotos entlang der Route (Panoramax; mit eigenem Mapillary-Token deutlich mehr), Großansicht mit ← → |
| Route kurz ausblenden | Taste **H** oder „Route ausblenden“ – um die Straße darunter zu sehen |
| Fotos der Strecke | Auf die Route klicken → „Google Street View“ (Blick in Fahrtrichtung), „Straßenfotos (Mapillary)“ oder „In Komoot öffnen“ (Highlights mit Fotos) – jeweils in neuem Tab |
| Rückgängig | ↶ ↷ oben links oder **⌘/Strg+Z**, Wiederholen mit **⌘⇧Z / Strg+Y** – für Wegpunkte, Umgehen, Anders planen, Sperren, Einstellungen, Import, Leeren (letzte 50 Schritte). Nach „Leeren“ oder dem Ersetzen der Route erscheint kurz ein Hinweis mit „Rückgängig“ |
| Export | **GPX** mit Abbiegehinweisen (Wegpunkte „Rechts abbiegen“ …) · **TCX** mit CoursePoints für Garmin Edge · GPX „ohne Hinweise“ |
| Import | „GPX importieren“ oder Datei auf die Karte ziehen (z. B. Komoot-/Strava-Export). Der Track wird mit dichten Stützpunkten nachgerechnet, damit Belag und Straßenart bekannt sind, und bleibt bis zur Bearbeitung exakt. „Mit meinem Profil planen“ rechnet ihn nach deinen Einstellungen neu |
| Meine Routen | Route benennen und speichern, später laden, umbenennen, löschen (inkl. berechneter Etappen) |

Alles (Route, Einstellungen, Sperren, gespeicherte Routen, berechnete Etappen) wird im Browser gespeichert – nach dem Neuladen ist die Route ohne neue Server-Anfrage da.

## Ziele entdecken

Im Tab **„Ziele“** Startpunkt setzen, Umkreis (bis 5–80 km Luftlinie) und Art der Ziele wählen: Aussichtspunkte, Gipfel & Pässe, Burgen & Schlösser, Seen & Talsperren, Ausflugscafés & Biergärten, Radler-Treffs. Gezeigt werden alle Ziele im Umkreis (max. 60 auf einmal), sortierbar nach **Sehenswert** (bekannte Orte mit Wikipedia, hohe Gipfel zuerst, Kategorien gemischt), **Nah** oder **Weit** – Umsortieren braucht keine neue Abfrage.

- **Runde über dieses Ziel**: Start → Ziel → seitlich versetzter Punkt → Start, damit der Rückweg nicht dieselbe Straße ist.
- **Route hierher**: einfache Strecke zum Ziel.

Die öffentlichen Overpass-Server sind oft ausgelastet. Antwortet keiner innerhalb von 10 s, zeigt die App vorläufige Treffer aus der Photon-Suche (nur benannte Orte, ohne Details) und ersetzt sie, sobald Overpass antwortet.

## Rundtour finden

Im Tab **„Rundtour finden“** Startpunkt per Klick setzen (oder Ort suchen → ＋), Länge (20–200 km) und Richtung wählen (Kompass; ✱ = beliebig) und „Rundtouren vorschlagen“ klicken.

- Es werden mehrere Richtungen über BRouters Rundtour-Modus berechnet (`engineMode=4`, beliebig = 6 Richtungen, sonst Wunschrichtung ±35°). Weicht die Länge um mehr als 12 % ab, wird der Suchradius einmal nachkorrigiert.
- Jeder Vorschlag bekommt eine **Bewertung 0–100**: wie gut Belag und Straßenart zu deinem Profil passen, abzüglich doppelt gefahrener Strecken und Abweichung von der Wunschlänge. Sortierbar nach „Beste Straßen“, „Flach“ oder „Hügelig“.
- **Übernehmen** zerlegt die Runde in Etappen (etwa alle 10 km ein Wegpunkt). Danach lässt sie sich wie jede Route bearbeiten – ohne erneute Server-Anfragen, weil die Etappen exakte Teilstücke der Runde sind.
- Dauerhafte Sperren („Immer meiden“) gelten auch für die Rundtour-Suche.
- **Wind**: Abfahrtszeit wählen; „Gegen den Wind starten“ legt die Runde in die Richtung, aus der der Wind kommt – heimwärts Rückenwind. Sortierung „Rückenwind heim“ und Hinweis je Vorschlag.

## Einstellungen

Oben im Routing-Profil den **Radtyp** wählen – jeder bringt passende Voreinstellungen und ein eigenes Tempo-Modell für die Fahrzeit mit:

| Radtyp | Profile |
|---|---|
| 🚴 Rennrad | Rennrad · Rennrad ruhig · Schnell & direkt |
| 🪨 Gravel | Allroad (Asphalt + feiner Schotter) · Gravel (Schotter- und Wirtschaftswege) |
| 🚵 MTB | MTB Tour (Forstwege, Trails bis S1) · MTB Trail (möglichst viele Trails bis S2) |
| 🚲 Trekking | Trekking (Radwege, Belag gemischt) · Alltag (direkt, Asphalt, wenig Steigung) |

**Trails bis Schwierigkeit** (S0–S3) sperrt schwerere Wege nach der MTB-Skala in OpenStreetMap (`mtb:scale`; fehlt sie, zählt die Wanderskala `sac_scale`).

Jede Belags- und Straßenkategorie hat vier Stufen: **★ Bevorzugen · ○ Neutral · ↓ Meiden · ✕ Sperren**. Daraus wird ein BRouter-Profil erzeugt (`src/domain/profile.ts`): Kosten = Straßenfaktor × Belagsfaktor × Fahrbahnqualität + Verkehrs-/Tempo-Zuschläge.

Fehlt in OSM das `surface`-Tag, wird abgeleitet: Straßen (inkl. Radwege) → Asphalt, `tracktype=grade1` → Asphalt, `grade2` → feiner Schotter usw., sonst „Unbekannt“.

## Struktur

```
src/
  domain/      Einstellungen, Klassifizierung, Profil-Generator, Routenmodell, GPX/TCX,
               Abbiegehinweise, Anstiege, Wind, POIs (mit Tests)
  api/         BRouter-Client, Overpass (mit Ausweich-Servern), Photon-Ersatzsuche, Fotos
  hooks/       Routing (cacht Etappen), Rundtour, Import, Einfärbung, Wind, Stopps, Fotos
  components/  Karte, Seitenleiste, Einstellungen, Höhenprofil, Ziele, Fotos, Bibliothek …
docker/        nginx-Konfiguration der Web-App, BRouter-Container
unraid/        Unraid-Vorlagen
```

## Installation auf Unraid (Docker)

Veloterra gibt es als zwei Container-Images, die GitHub bei jedem Push auf `main` automatisch baut (`.github/workflows/docker.yml`):

| Image | Inhalt |
|---|---|
| `ghcr.io/t4s3rf4c3/veloterra` | Die Web-App (nginx, ~80 MB) |
| `ghcr.io/t4s3rf4c3/veloterra-brouter` | Optional: eigener BRouter-Routing-Server inkl. automatischem Download der Kartendaten |

> Nach dem ersten Build sind die Pakete auf GitHub privat. Unter *GitHub → Profil → Packages → veloterra → Package settings* auf **Public** stellen (für beide Images), dann kann Unraid sie ohne Anmeldung laden.

### Variante A: Unraid-Vorlagen (Docker-Tab)

1. Vorlagen auf den USB-Stick kopieren (Unraid-Terminal):
   ```bash
   wget -P /boot/config/plugins/dockerMan/templates-user https://raw.githubusercontent.com/T4s3rF4c3/veloterra/main/unraid/veloterra.xml https://raw.githubusercontent.com/T4s3rF4c3/veloterra/main/unraid/veloterra-brouter.xml
   ```
2. *Docker → Add Container → Template:* **Veloterra-BRouter** wählen, Kacheln prüfen (Standard: Deutschland + Nachbarn, ca. 1 GB in `/mnt/user/appdata/veloterra-brouter`) → *Apply*. Der erste Start lädt die Kartendaten, das dauert einige Minuten (siehe Log).
3. *Add Container → Template:* **Veloterra** wählen, **Eigener BRouter (intern)** auf `http://<IP-des-Unraid-Servers>:17777` setzen → *Apply*.
4. Öffnen: `http://<IP-des-Unraid-Servers>:8088` (oder über das WebUI-Symbol).

Ohne den BRouter-Container funktioniert Veloterra auch – dann einfach Schritt 2 weglassen und das Feld in Schritt 3 leer lassen; geroutet wird dann über brouter.de.

### Variante B: Docker Compose (Plugin „Docker Compose Manager“ oder jeder Docker-Host)

```bash
git clone https://github.com/T4s3rF4c3/veloterra.git && cd veloterra
```

```bash
APPDATA=/mnt/user/appdata/veloterra docker compose up -d
```

Die Datei `docker-compose.yml` startet beide Container; Veloterra erreicht BRouter intern unter `http://brouter:17777`. Mit `build:` lässt sich auch lokal bauen (`docker compose up -d --build`), falls keine fertigen Images genutzt werden sollen.

### Einstellungen der Container

**Veloterra**

| Variable | Bedeutung |
|---|---|
| `BROUTER_UPSTREAM` | Interne Adresse eines eigenen BRouter-Servers. nginx leitet `/brouter` dorthin weiter – der Browser braucht keinen direkten Zugriff, keine CORS-Probleme |
| `BROUTER_URL` | Alternativ: URL, die der Browser direkt anspricht. Leer = brouter.de |

**Veloterra-BRouter**

| Variable | Standard | Bedeutung |
|---|---|---|
| `SEGMENTS` | `E5_N45 E5_N50 E10_N45 E10_N50` | Kartendaten-Kacheln à 5°×5°, benannt nach der Südwest-Ecke (`E5_N50` = 5–10° Ost, 50–55° Nord). [Übersicht](https://brouter.de/brouter/segments4/) |
| `UPDATE_DAYS` | `7` | Kacheln beim Neustart neu laden, wenn älter (0 = nie) |
| `JAVA_XMX` | `1024m` | Arbeitsspeicher |
| `MAXTHREADS` | `4` | Gleichzeitige Routing-Anfragen |
| `PUID` / `PGID` | `99` / `100` | Besitzer der Dateien in appdata (Unraid-Standard) |

Mit eigenem Server stellt die App bis zu 4 Anfragen gleichzeitig – Rundtour-Suche und GPX-Import sind dann deutlich schneller.

### Lokal entwickeln mit eigenem BRouter

```bash
VITE_BROUTER_URL=http://localhost:17777/brouter npm run dev
```

## Skripte

- `npm test` – Unit-Tests (Vitest)
- `npm run build` – Produktions-Build
- `npx tsx scripts/dump-profile.ts road` – generiertes Profil eines Presets ausgeben
