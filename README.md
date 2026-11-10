# Veloterra

Routenplaner für **Rennrad, Gravel, MTB und Trekking** mit feiner Steuerung nach **Untergrund** und **Straßenart** – und der Möglichkeit, einzelne Abschnitte nachträglich gezielt umzuplanen.

Routing: [BRouter](https://brouter.de) mit einem aus den Einstellungen generierten Profil · Daten: OpenStreetMap (Overpass, Photon) · Karte: OpenFreeMap · Luftbild: Esri World Imagery und amtliche Luftbilder (RLP, NRW, Hessen, Bayern) · Wetter & Wind: Open-Meteo · Regenradar: RainViewer · Fotos: Panoramax, optional Mapillary

## Starten

```bash
npm install
npm run dev
```

Dann <http://localhost:5173> öffnen.

## Bedienung

Die Seitenleiste hat fünf Bereiche (Leiste links, auf dem Handy oben):

| Bereich | Inhalt |
|---|---|
| **Planen** | Route setzen und bearbeiten, Übersicht (Distanz, Anstieg, Belag, Straßenart), Export/Import; darunter Wetter & Wind, Belags-Check, Anstiege, Stopps und angepasste Etappen als aufklappbare Liste |
| **Entdecken** | Rundtour vorschlagen lassen, Ziele in der Umgebung, beschilderte Radwege |
| **Profil** | Radtyp (Rennrad, Gravel, MTB, Trekking), Voreinstellungen, Belag/Straßenart im Detail, dauerhafte Sperren |
| **Meine** (unten) | Gespeicherte Routen, eigene Heatmap und dein Tempo, „Als App installieren“ |
| **Login** (unten) | Anmelden für alle (Veloterra-Server); angemeldet heißt der Knopf **Konto**: Sync-Status, Passwort ändern, Abmelden. Admins sehen darunter die **Verwaltung**: Konten, Mapillary-Token und BRouter-/Overpass-Server für alle Besucher, GPS-Spuren einer Region für alle. Angemeldet außerdem die Datensicherung als Datei (ohne Anmeldung kein Export) |

Der aktuelle Radtyp steht oben rechts immer sichtbar; ein Klick öffnet das Profil. Die Karte startet immer mit **Luftbild DE**. Oben links auf der Karte: **↶ ↷** (Rückgängig/Wiederholen), **Ebenen** (Kartenstil, Einfärbung, Stopps, Fotos, Radrouten-Netz, Heatmaps) und **Route ausblenden**.

| Aktion | So geht's |
|---|---|
| Start / Ziel / Etappen | Auf die Karte klicken |
| Wegpunkt verschieben | Marker ziehen (auch per Finger) |
| Wegpunkt löschen | Marker antippen/anklicken → „Wegpunkt entfernen“ (oder Doppel-/Rechtsklick) |
| Wegpunkt in Route einfügen | Auf die Route klicken → „Wegpunkt einfügen“ |
| **Route umleiten** | Route mit der Maus packen (am Handy: lange auf die Route drücken) und auf eine andere Straße ziehen – dort entsteht ein neuer Wegpunkt. Davor und dahinter setzt die App automatisch Ankerpunkte auf die bisherige Route: Nur das Stück dazwischen wird neu geplant, der Rest bleibt exakt gleich (auch beim Verschieben von Wegpunkten und beim Umfahren) |
| **Was ist das für ein Weg?** | Maus über die Route halten: Belag, Straßenart, Wegeklasse/Fahrbahn, Steigung und Länge des Stücks |
| **Stück umfahren** | Route anklicken/antippen → „Dieses Stück umfahren“ (das ganze Stück gleicher Art, z. B. 850 m Schotter-Wirtschaftsweg) oder „Stück markieren“. Unter „Mehr …“: Abschnitt frei markieren, dauerhafte Regeln („Stück immer meiden“, eine Art wie Schotter generell meiden) und Luftbild/Street View/Mapillary/Komoot |
| Abschnitt markieren | Auf die Route klicken → „Abschnitt ab hier markieren“ → Ende anklicken, **oder** im Höhenprofil ziehen |
| Abschnitt **umfahren** | Sperrt den Abschnitt für die betroffene Etappe und rechnet sie neu |
| Abschnitt **anders planen** | Setzt Wegpunkte an Anfang/Ende und gibt dem Teil eigene Einstellungen (z. B. „hier Schotter ok“) |
| **Alternative** | Schaltet für die Etappe durch bis zu 4 BRouter-Alternativen |
| **Immer meiden** | Speichert den Abschnitt dauerhaft als Sperre für alle Routen |
| Luftbild | Ebenen → „Satellit“ (Esri, weltweit) oder **„Luftbild DE“** (amtliche Luftbilder 20–40 cm für RLP, NRW, Hessen, Bayern – schärfer und aktueller) wählen, oder auf die Route klicken → „Im Luftbild ansehen“ |
| Einfärbung | Ebenen → Untergrund · Straßenart · **Steigung** · **Wind** (Gegen-/Rückenwind zur Abfahrtszeit) · Einfarbig |
| Anstiege | Liste in der Seitenleiste (Länge, Ø- und Max-Steigung, Höhenmeter); Klick markiert den Anstieg. Im Höhenprofil rot hinterlegt |
| Wetter & Wind | Abfahrtszeit wählen → **Sonnenauf- und -untergang** am Start (mit „dunkel ab“ und Hinweis, wenn Start oder Ankunft im Dunkeln liegen – Licht mitnehmen), Windrichtung/-stärke, Anteil Gegen-/Rückenwind; darunter das Wetter entlang der Route zur jeweiligen Ankunftszeit (Temperatur, Wetterlage, Regenwahrscheinlichkeit). Im **Streckenband** zeigt eine eigene Zeile **Regen** alle ~2,5 km den Niederschlag zur Ankunftszeit (15-Minuten-Vorhersage von Open-Meteo; Farben wie das Regenradar, gestreift = Regen möglich ab 40 %). Ebenen → „Regenradar“ zeigt den Niederschlag vom Deutschen Wetterdienst: jetzt (gemessen), zur geplanten Abfahrt oder – während die Maus über das Streckenband oder die Route fährt – zur **Ankunftszeit an dieser Stelle**. Bis ca. 2 Stunden voraus Radar-Vorhersage in 5-Minuten-Schritten, danach die stündliche Modellvorhersage ICON-EU (ca. 3 Tage). Eine Farbskala für beides: Blau = leicht bis kräftig, Gelb/Orange/Rot = stark |
| Belags-Check | Karte „Belags-Check“: Abschnitte, deren Belag in OSM fehlt oder nur geschätzt ist (Wirtschafts-, Rad- und Feldwege ohne `surface`), auf der Karte weiß gepunktet. Klick → Luftbild DE, der Abschnitt wird gelb auf der Route hervorgehoben (Taste H blendet die Route aus, um die Straße zu sehen), Straßenfoto falls vorhanden. „Passt“ blendet den Abschnitt dauerhaft aus, „Umfahren“ plant drumherum, „In OpenStreetMap eintragen“ öffnet den Editor an der Stelle |
| Stopps unterwegs | Ebenen → „Stopps unterwegs“: Cafés & Bäcker, Trinkwasser, Rad-Service, Aussichtspunkte, WC bis 300 m neben der Route – mit km-Angabe; „Als Wegpunkt einfügen“ |
| Fotos der Strecke | Ebenen → „Fotos der Strecke“: Straßenfotos entlang der Route (Panoramax; mit eigenem Mapillary-Token deutlich mehr), Großansicht mit ← → |
| Route kurz ausblenden | Taste **H** oder „Route ausblenden“ – um die Straße darunter zu sehen |
| Fotos der Strecke | Auf die Route klicken → „Google Street View“ (Blick in Fahrtrichtung), „Straßenfotos (Mapillary)“ oder „In Komoot öffnen“ (Highlights mit Fotos) – jeweils in neuem Tab |
| Rückgängig | Pfeile oben links oder **⌘/Strg+Z**, Wiederholen mit **⌘⇧Z / Strg+Y** – für Wegpunkte, Umfahren, Anders planen, Sperren, Einstellungen, Import, Leeren (letzte 50 Schritte). Nach „Leeren“ oder dem Ersetzen der Route erscheint kurz ein Hinweis mit „Rückgängig“ |
| Export | „GPX exportieren“ bzw. ▾ für weitere Formate: **GPX** mit Abbiegehinweisen (Wegpunkte „Rechts abbiegen“ …) · **TCX** mit CoursePoints für Garmin Edge · GPX „ohne Hinweise“ |
| Import | „GPX importieren“ oder Datei auf die Karte ziehen (z. B. Komoot-/Strava-Export). Der Track wird mit dichten Stützpunkten nachgerechnet, damit Belag und Straßenart bekannt sind, und bleibt bis zur Bearbeitung exakt. „Mit meinem Profil planen“ rechnet ihn nach deinen Einstellungen neu |
| Meine Routen | Route benennen und speichern – direkt über „GPX exportieren“ (Punkt = ungespeicherte Änderungen) oder unter **Meine** –, später laden, umbenennen, löschen (inkl. berechneter Etappen) |
| **Teilen** | „Teilen“ neben dem Export: Link zum Kopieren, QR-Code fürs Handy und „Über eine App teilen“. Angemeldet entsteht ein kurzer Link über den Veloterra-Server (Route kommt exakt so an); ohne Konto steckt die Route komprimiert im `#`-Teil des Links und wird beim Empfänger mit deinen Einstellungen neu berechnet |
| Fahrzeit | Nach **deinem Tempo**, sobald unter **Meine → Meine Heatmap** Fahrten mit Zeit und Höhe importiert sind (sonst die Schätzung von BRouter). Gilt auch für Wind, Wetter unterwegs, Rundtour-Vorschläge und die Zeiten im GPX |

Alles (Route, Einstellungen, Sperren, gespeicherte Routen, berechnete Etappen) wird im Browser gespeichert – nach dem Neuladen ist die Route ohne neue Server-Anfrage da. Mit **Konto** auf dem Veloterra-Server werden gespeicherte Routen und Heatmap zusätzlich synchronisiert (siehe unten).

## Konto und Sync

Mit dem optionalen Veloterra-Server (Dienst `veloterra-api`) gibt es Benutzerkonten mit Name und Passwort. Konten legt ein Admin unter **Konto → Verwaltung → Konten** an; angemeldet wird sich über **Login** unten in der Leiste.

- **Meine Routen** (mit berechneten Etappen) und die **Fahrten der Heatmap** samt Tempo-Daten liegen dann im Konto – auf allen Geräten, auf denen du angemeldet bist. Abgleich nach jeder Änderung, beim Anmelden und wenn die Seite wieder in den Vordergrund kommt; „Jetzt abgleichen“ erzwingt ihn.
- Neuerer Stand gewinnt; gelöschte Routen verschwinden auch auf den anderen Geräten.
- Ohne Anmeldung bleibt alles wie bisher nur im Browser. Meldet sich in einem Browser ein **anderes** Konto an, ersetzt es Routen und Heatmap dort durch seine eigenen (nichts wird vermischt).
- Passwort ändern unter **Konto** (andere Geräte werden dabei abgemeldet); Admins können Passwörter zurücksetzen, Admin-Rechte vergeben und Konten löschen.

## Als App (PWA)

Veloterra lässt sich installieren (Chrome/Edge: Symbol in der Adressleiste oder **Meine → Als App installieren**; iPhone: Safari → Teilen → „Zum Home-Bildschirm“). Ein Service Worker hält die App und bereits angesehene Kartenkacheln (bis ca. 4000, auch Luftbild DE) vor: Die App startet schneller und zeigt die **zuletzt geplante Route auch ohne Netz**. Routing, Wetter und Sync brauchen weiterhin Netz – oben auf der Karte erscheint dann „Offline“.

## Heatmap

- **Meine Heatmap** (Seitenleiste): eigene Fahrten importieren – den kompletten **Strava-Datenexport** (ZIP; Strava → Einstellungen → Mein Konto → „Konto herunterladen oder löschen“) oder einzelne **GPX/TCX/FIT**-Dateien (auch `.gz`), z. B. aus Komoot oder Garmin. Aus dem Strava-Export werden nur Radfahrten im Freien übernommen (keine Läufe, keine virtuellen Fahrten). Die Fahrten werden vereinfacht im Browser gespeichert (IndexedDB) – hochgeladen nur, wenn du mit einem Konto angemeldet bist.
- **Dein Tempo**: Aus Zeit und Höhe der importierten Fahrten ermittelt Veloterra deine Geschwindigkeit je Steigung (steil bergab, bergab, flach, 2–5 %, 5–8 %, über 8 %) – ohne Pausen und GPS-Sprünge, aus den letzten 60 Fahrten. Gibt es mindestens 5 Fahrten passend zum gewählten Radtyp (Strava-Typ „Gravel Ride“, „Mountain Bike Ride“ …), zählen nur diese; E-Bike-Fahrten nie. Klassen mit zu wenig Daten werden aus deinem Flach-Tempo abgeleitet (grau). Schon früher importierte Fahrten einfach erneut importieren, um das Tempo zu ergänzen. Abschaltbar mit „Fahrzeit nach meinem Tempo berechnen“.
- Ebenen → **Meine Fahrten** zeigt sie als Heatmap; Einfärbung **„Neu für mich“** markiert, welche Teile der Route du noch nie gefahren bist. Die Routenübersicht zeigt den Anteil („71 % neu für dich“), Rundtour-Vorschläge ebenso – mit Sortierung **„Neue Straßen“**.
- Ebenen → **Öffentliche GPS-Spuren**: zu OpenStreetMap hochgeladene Tracks.
  - **Dichte (viel/wenig)**: „Bereich laden“ holt die GPS-Punkte des sichtbaren Bereichs in festen Kacheln (0,1° × 0,1°, ca. 7 × 11 km; höchstens 20 Kacheln auf einmal) und zeigt sie als Heatmap – blau = wenig, rot = viel befahren. Die Kacheln bleiben dauerhaft im Browser gespeichert (IndexedDB, auf der Karte gestrichelt umrandet): Zoomen, Verschieben und Neustarts laden nichts nach. „Alle löschen“ entfernt sie. Neu laden lässt sich ein Bereich nur noch im Admin-Bereich auf dem Server (für alle Besucher). In sehr dichten Gebieten lädt die App eine Kachel in Vierteln. Jede Spur wird gleichmäßig gezählt, egal wie oft das Gerät eine Position gespeichert hat.
  - **Nur Rad-Spuren**: Die Art wird aus dem Tempo geschätzt (Median der Bewegung unter 7,5 km/h = zu Fuß; ab 38 km/h oder 10 % der Zeit über 50 km/h = Auto). Gespeichert und gezeigt werden nur Radfahrten, Filter **Alle Rad-Spuren / Rennrad-Tempo** (Median ab 23 km/h). Spuren ohne Zeitstempel fallen weg.
  - **Bereinigt**: Spuren werden nur verbunden, wo die Punkte dicht aufeinander folgen (≤ 20 s, ≤ 120 m, < 70 km/h) – Lücken (Spur verlässt die Kachel), Pausen und GPS-Sprünge erzeugen keine Linien quer durchs Feld; Bruchstücke unter 150 m fallen weg. Pro Rasterzelle zählt jede Spur nur einmal; **„Nur mehrfach befahrene Wege“** blendet einzelne Zufallsspuren aus.
  - **Linien**: alle Spuren weltweit als Kacheln; die Farbe zeigt dort nur die Fahrtrichtung.
  - Auf dem Land sind es oft nur wenige Dutzend Spuren, in Städten deutlich mehr.

Die globalen Heatmaps von Strava und Komoot sind nur mit Login bzw. gar nicht abrufbar und dürfen außerhalb der Apps nicht genutzt werden – daher diese freien Alternativen.

## Radwege

Im Tab **„Radwege“** zeigt die Karte das Netz beschilderter Routen (Daten: [Waymarked Trails](https://waymarkedtrails.org) / OpenStreetMap) – umschaltbar zwischen **Radrouten** und **MTB-Routen**. Die Liste folgt dem Kartenausschnitt und lässt sich nach Ebene filtern (International, National, Regional, Lokal); ein Klick auf eine Route auf der Karte oder in der Liste zeigt Verlauf, Beschreibung und Links.

- **Sichtbaren Abschnitt übernehmen**: nur das Stück im Kartenausschnitt wird zur bearbeitbaren Route.
- **Ganze Route**: der komplette Verlauf.

Übernommene Routen werden wie ein GPX-Import nachgerechnet (Belag und Straßenart bekannt, folgt dem Original). Das Netz lässt sich auch in den anderen Modi über **Ebenen** einblenden.

## Ziele entdecken

Im Tab **„Ziele“** Startpunkt setzen, Umkreis (bis 5–80 km Luftlinie) und Art der Ziele wählen: Aussichtspunkte, Gipfel & Pässe, Burgen & Schlösser, Seen & Talsperren, Ausflugscafés & Biergärten, Radler-Treffs. Gezeigt werden alle Ziele im Umkreis (max. 60 auf einmal), sortierbar nach **Sehenswert** (bekannte Orte mit Wikipedia, hohe Gipfel zuerst, Kategorien gemischt), **Nah** oder **Weit** – Umsortieren braucht keine neue Abfrage.

- **Runde über dieses Ziel**: Start → Ziel → seitlich versetzter Punkt → Start, damit der Rückweg nicht dieselbe Straße ist.
- **Route hierher**: einfache Strecke zum Ziel.

Die öffentlichen Overpass-Server sind oft ausgelastet. Antwortet keiner innerhalb von 10 s, zeigt die App vorläufige Treffer aus der Photon-Suche (nur benannte Orte, ohne Details) und ersetzt sie, sobald Overpass antwortet.

## Rundtour finden

Im Tab **„Rundtour finden“** Startpunkt per Klick setzen (oder Ort suchen → Plus), Länge (20–200 km) und Richtung wählen (Kompass; ✱ = beliebig) und „Rundtouren vorschlagen“ klicken.

- Es werden mehrere Richtungen über BRouters Rundtour-Modus berechnet (`engineMode=4`, beliebig = 6 Richtungen, sonst Wunschrichtung ±35°). Weicht die Länge um mehr als 12 % ab, wird der Suchradius bis zu zweimal nachkorrigiert.
- **Stichstraßen werden entfernt**: Fährt eine Runde ein Stück und auf derselben Straße wieder zurück (direkt gewendet oder über eine kurze Wendeschleife wie einen Kreisverkehr), wird dieses Stück herausgeschnitten. Dafür ist zusätzlich BRouters Korrektur für schlecht liegende Hilfspunkte eingeschaltet. Gemessen an 9 Testrunden: doppelt gefahrene Strecke von 16,5 % auf 1,4 %.
- Jeder Vorschlag bekommt eine **Bewertung 0–100**: wie gut Belag und Straßenart zu deinem Profil passen, abzüglich doppelt gefahrener Strecken und Abweichung von der Wunschlänge. Sortierbar nach „Beste Straßen“, „Flach“ oder „Hügelig“.
- **Übernehmen** zerlegt die Runde in Etappen (etwa alle 10 km ein Wegpunkt). Danach lässt sie sich wie jede Route bearbeiten – ohne erneute Server-Anfragen, weil die Etappen exakte Teilstücke der Runde sind.
- Dauerhafte Sperren („Immer meiden“) gelten auch für die Rundtour-Suche.
- **Wind**: Abfahrtszeit wählen; „Gegen den Wind starten“ legt die Runde in die Richtung, aus der der Wind kommt – heimwärts Rückenwind. Sortierung „Rückenwind heim“ und Hinweis je Vorschlag.

## Einstellungen

Oben im Routing-Profil den **Radtyp** wählen – jeder bringt passende Voreinstellungen und ein eigenes Tempo-Modell für die Fahrzeit mit:

| Radtyp | Profile |
|---|---|
| Rennrad | Rennrad · Rennrad ruhig · Schnell & direkt |
| Gravel | Allroad (Asphalt + feiner Schotter) · Gravel (Schotter- und Wirtschaftswege) |
| MTB | MTB Tour (Forstwege, Trails bis S1) · MTB Trail (möglichst viele Trails bis S2) |
| Trekking | Trekking (Radwege, Belag gemischt) · Alltag (direkt, Asphalt, wenig Steigung) |

**Trails bis Schwierigkeit** (S0–S3) sperrt schwerere Wege nach der MTB-Skala in OpenStreetMap (`mtb:scale`; fehlt sie, zählt die Wanderskala `sac_scale`).

Jede Belags- und Straßenkategorie hat vier Stufen: **Bevorzugen (Stern) · Neutral (Kreis) · Meiden (Pfeil) · Sperren (Kreuz)**. Daraus wird ein BRouter-Profil erzeugt (`src/domain/profile.ts`): Kosten = Straßenfaktor × Belagsfaktor × Fahrbahnqualität + Verkehrs-/Tempo-Zuschläge.

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
   cd /boot/config/plugins/dockerMan/templates-user
   for f in veloterra veloterra-brouter veloterra-api; do
     wget -q -O "$f.xml" "https://raw.githubusercontent.com/T4s3rF4c3/veloterra/main/unraid/$f.xml"
   done
   ```
   Derselbe Befehl aktualisiert die Vorlagen später (`-O` überschreibt die alten Dateien; `wget -P` würde stattdessen `veloterra.xml.1` daneben legen).

   **Bereits installierte Container** nutzen ihre gespeicherte Kopie `my-<Name>.xml` – neue Felder einer aktualisierten Vorlage erscheinen dort nicht. Entweder das Feld beim Container unter *Edit → Add another Path, Port, Variable…* von Hand ergänzen (z. B. Variable `API_UPSTREAM`) oder den Container entfernen, `my-<Name>.xml` löschen und neu aus der Vorlage anlegen.
2. *Docker → Add Container → Template:* **Veloterra-BRouter** wählen, Kacheln prüfen (Standard: Deutschland + Nachbarn, ca. 1 GB in `/mnt/user/appdata/veloterra-brouter`) → *Apply*. Der erste Start lädt die Kartendaten, das dauert einige Minuten (siehe Log).
3. Optional für Konten mit Sync und den Admin-Bereich: *Add Container → Template:* **Veloterra-API** wählen, ein **Admin-Passwort** setzen (Daten landen in `/mnt/user/appdata/veloterra-api`) → *Apply*. Anmelden in Veloterra mit Benutzername `admin`; weitere Konten unter **Konto → Verwaltung → Konten**.
4. *Add Container → Template:* **Veloterra** wählen, **Eigener BRouter (intern)** auf `http://<IP-des-Unraid-Servers>:17777` setzen, für Konten und Admin-Bereich außerdem **Veloterra-API (intern)** auf `http://<IP-des-Unraid-Servers>:8787` → *Apply*.
5. Öffnen: `http://<IP-des-Unraid-Servers>:8088` (oder über das WebUI-Symbol).

Ohne den BRouter-Container funktioniert Veloterra auch – dann einfach Schritt 2 weglassen und das Feld in Schritt 4 leer lassen; geroutet wird dann über brouter.de. Ohne Veloterra-API (Schritt 3) läuft die App nur im Browser, ohne Konten und Admin-Bereich.

Der API-Port 8787 ist im Heimnetz erreichbar, damit Veloterra ihn ansprechen kann. Er sollte nicht ins Internet freigegeben werden – von außen läuft alles über Veloterra (Port 8088).

### Variante B: Docker Compose (Plugin „Docker Compose Manager“ oder jeder Docker-Host)

```bash
git clone https://github.com/T4s3rF4c3/veloterra.git && cd veloterra
```

```bash
APPDATA=/mnt/user/appdata/veloterra VELOTERRA_ADMIN_PASSWORD='ein-langes-passwort' docker compose up -d
```

Die Datei `docker-compose.yml` startet drei Container; Veloterra erreicht BRouter intern unter `http://brouter:17777` und den Veloterra-Server unter `http://veloterra-api:8787`. Mit `build:` lässt sich auch lokal bauen (`docker compose up -d --build`), falls keine fertigen Images genutzt werden sollen.

### Einstellungen der Container

**Veloterra**

| Variable | Bedeutung |
|---|---|
| `BROUTER_UPSTREAM` | Interne Adresse eines eigenen BRouter-Servers. nginx leitet `/brouter` dorthin weiter – der Browser braucht keinen direkten Zugriff, keine CORS-Probleme |
| `BROUTER_URL` | Alternativ: URL, die der Browser direkt anspricht. Leer = brouter.de |
| `API_UPSTREAM` | Interne Adresse des Veloterra-Servers. nginx leitet `/api` dorthin weiter. Leer = keine Konten und kein Admin-Bereich, die App läuft nur im Browser |

**Veloterra-API** (Konten, Sync, Admin-Bereich – optional)

| Variable | Standard | Bedeutung |
|---|---|---|
| `ADMIN_PASSWORD` | – | Passwort des Admin-Kontos. Ohne Passwort gibt es keinen Admin aus der Umgebung (angelegte Konten mit Admin-Rechten funktionieren weiter) |
| `ADMIN_USER` | `admin` | Benutzername des Admin-Kontos |
| `DATA_DIR` | `/data` | Einstellungen (`config.json`), Konten (`users.json`, `sessions.json`), Daten je Konto (`users/`), geteilte Routen (`shares/`) und GPS-Kacheln (`traces/`); als Volume nach appdata einbinden |

In der Verwaltung (Login unten in der Leiste, als Admin angemeldet) gelten Mapillary-Token, BRouter- und Overpass-Server **für alle Besucher**. Unter **„GPS-Spuren für alle“** lädt der Server die öffentlichen GPS-Spuren einer Region – z. B. ganz Rheinland-Pfalz (~480 Kacheln, ca. 1–1,5 Std.) – einmal bei OpenStreetMap, nacheinander und mit Pause, um die Schnittstelle zu schonen. Der Ladevorgang läuft auch weiter, wenn der Browser geschlossen ist. Danach bekommen alle Besucher die Kacheln direkt vom Server; nur was dort fehlt, lädt der Browser noch selbst.

Anmeldung: Benutzername und Passwort (Passwörter als scrypt-Hash mit Salt), Sitzungs-Cookie (30 Tage, HttpOnly, SameSite=Strict; auf dem Server nur als Hash gespeichert, übersteht Neustarts), höchstens 8 Fehlversuche je Adresse und 40 insgesamt in 15 Minuten. Der Admin aus `ADMIN_PASSWORD` meldet sich mit `admin` (bzw. `ADMIN_USER`) an; sein Passwort ändert man nur über die Variable. Hinter einem HTTPS-Reverse-Proxy (`X-Forwarded-Proto: https`) wird das Cookie zusätzlich als `Secure` markiert.

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

### Lokal entwickeln mit Veloterra-Server (Konten, Admin)

```bash
ADMIN_PASSWORD=test npm run dev:server   # Port 8787, Daten in ./data-api
npm run dev                              # leitet /api dorthin weiter
```

## Skripte

- `npm test` – Unit-Tests (Vitest)
- `npm run build` – Produktions-Build (Web-App und Veloterra-Server)
- `npm run build:server` – nur den Veloterra-Server bündeln (`dist-server/server.mjs`)
- `npx tsx scripts/dump-profile.ts road` – generiertes Profil eines Presets ausgeben
