---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/Sidebar.tsx","src/components/MapView.tsx","src/styles.css"]
---

# Planen-Oberfläche (App-Shell)

Scope: gesamte App-Shell (Navigation, Seitenleiste, Karte, Streckenband). Mode: Operate. Build: code-led.

Aufgabe: Route vor der Fahrt am Rechner planen und prüfen, Stücke gezielt umfahren, exportieren. Wichtigster Zustand: unsichere Belagsstücke und lokale Änderungen.

Verlauf: Gewürfelte Richtung „Zustandsplan“ (hell, Bauamts-Plan) wurde gebaut und vom Nutzer verworfen: zu eigenwillig, Menü gefiel nicht. Nutzer wählt den vertrauten Weg (Standing exit / Kanon), gezielt Google Maps im Dunkelmodus. Funktionen und Streckenband bleiben.

## Direction contract

THESIS: Veloterra fühlt sich an wie Google Maps bei Nacht – vertraut, ruhig, dunkel – und zeigt darin, was Google Maps nicht kann: Belag und Straßenart jedes Stücks. Verweigert die weiße Komoot-Karte und jede themenhafte Verkleidung.

OWN-WORLD: Dunkle Flächen #202124 / #2d2e31 / #303134, Trennlinien #3c4043, Text #e8eaed / #9aa0a6, Primärblau #8ab4f8 (Text auf Blau #202124), ausgewählte Container #394457. Runde Formen: Pillen-Knöpfe und -Suchfeld, Karten mit 12 px Radius, Kartenbedienung als schwebende dunkle Chips mit weichem Schatten. Belag als Klassen-Rampe 1–5 in leuchtenden Tönen (#81c995, #c0d97c, #fdd663, #fcad70, #ee675c), Unbekannt schraffiert; eigene Änderungen in Violett #c58af9. Roboto, tabellarische Ziffern.

STORY: Der Fahrer findet sich sofort zurecht wie in Google Maps, sieht Belag und Straßenart im Band unter der Karte, fährt es mit dem Cursor ab, umfährt ein Stück, sieht die Revision und exportiert.

FIRST VIEWPORT: Links eine Material-Navigationsleiste (Logo, vier Ziele als Icon in Pille + Label, aktive Pille in #394457). Daneben dunkles Panel: Titel und Radtyp-Chip, Pillen-Suchfeld, Wegpunktliste mit km, Kennzahlen, Belag-/Straßenart-Mix, Belags-Check-Hinweis, Aktionen, „GPX exportieren“ als blaue Pille. Karte (Luftbild) füllt den Rest, Werkzeug-Chips oben links, Legende darunter, Zoom rechts. Unter der Karte das dunkle Streckenband.

FORM: Kanon „Google Maps Dark“ auf Wunsch des Nutzers; Signatur bleibt das Streckenband (km-Lineal, Belag/Straßenart/Steigung, Cursor synchron, Revisionen violett, rechnende Etappen gestrichelt). seed:ba906fcb8e6f8d1a

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
