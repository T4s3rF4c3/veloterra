---
name: Veloterra
description: Routenplaner nach Belag und Straßenart, im Gewand von Google Maps bei Nacht
colors:
  bg: "#18191b"
  panel: "#202124"
  panel-tint: "#26272a"
  soft: "#2d2e31"
  sunk: "#303134"
  asphalt: "#303134"
  hairline: "#303134"
  line: "#3c4043"
  track: "#5f6368"
  faint: "#80868b"
  muted: "#9aa0a6"
  text: "#e8eaed"
  accent: "#8ab4f8"
  accent-strong: "#aecbfa"
  accent-ink: "#d2e3fc"
  accent-soft: "#394457"
  accent-tint: "#2a2f38"
  on-accent: "#202124"
  prefer: "#81c995"
  avoid: "#fcad70"
  forbid: "#f28b82"
  dest: "#d93025"
  revision: "#c58af9"
  ok-ink: "#81c995"
  ok-soft: "#1f3327"
  ok-line: "#2f5a3c"
  warn-ink: "#fdd663"
  warn-soft: "#3a3320"
  warn-line: "#6b5a1e"
  danger-ink: "#f28b82"
  danger-soft: "#3c2523"
  import: "#e58cf0"
  import-soft: "#3a2540"
  glass: "rgb(32 33 36 / 0.94)"
  scrim: "rgb(0 0 0 / 0.75)"
  surface-class-1: "#4dabf7"
  surface-class-2: "#66d9e8"
  surface-class-3: "#ffd43b"
  surface-class-4: "#ff922b"
  surface-class-5: "#ff6b6b"
  surface-unknown: "#adb5bd"
  road-primary: "#ff6b6b"
  road-secondary: "#ff922b"
  road-tertiary: "#ffd43b"
  road-minor: "#dee2e6"
  road-residential: "#a5b4c4"
  road-cycleway: "#63e6be"
  road-track: "#c9a27e"
  road-path: "#f783ac"
typography:
  headline:
    fontFamily: "Roboto, system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    letterSpacing: "-0.005em"
  stat:
    fontFamily: "Roboto, system-ui, -apple-system, sans-serif"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "tnum"
  title:
    fontFamily: "Roboto, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body-strong:
    fontFamily: "Roboto, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  body:
    fontFamily: "Roboto, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "tnum"
  body-small:
    fontFamily: "Roboto, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Roboto, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.01em"
  caption:
    fontFamily: "Roboto, system-ui, -apple-system, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
rounded:
  inner: "6px"
  row: "8px"
  menu: "10px"
  radius: "12px"
  pill: "999px"
spacing:
  gap-sm: "6px"
  gap-md: "10px"
  map-inset: "12px"
  card-padding: "14px"
  pane-gap: "16px"
  pane-padding: "18px"
components:
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
  button-hover:
    backgroundColor: "{colors.soft}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
  input-search:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
  chip-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
  tool-chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "7px 12px"
  tool-chip-on:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
  rail-pill:
    backgroundColor: "transparent"
    rounded: "{rounded.pill}"
    width: "56px"
    height: "32px"
  rail-pill-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
  card-pane:
    backgroundColor: "{colors.soft}"
    rounded: "{rounded.radius}"
    padding: "{spacing.card-padding}"
  panel-group:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.radius}"
  panel-group-open:
    backgroundColor: "{colors.panel-tint}"
  overlay-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.radius}"
    padding: "{spacing.card-padding}"
  toast:
    backgroundColor: "{colors.asphalt}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  streckenband:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    padding: "10px 16px 4px"
---

# Design System: Veloterra

## Overview

**Creative North Star: "Google Maps bei Nacht"**

Veloterra soll sich anfühlen wie Google Maps im Dunkelmodus: vertraut, ruhig, dunkel. Wer Google Maps kennt, findet Navigation, Suchfeld, Knöpfe und Kartenbedienung dort, wo er sie erwartet. Das System erfindet keine eigene Bildsprache; es übernimmt bewusst den Material-Kanon (Navigationsleiste mit Icon in Pille und Label, Pillen-Knöpfe, schwebende Kartenchips) und legt darüber nur das, was Google Maps nicht kann: Belag und Straßenart jedes Streckenstücks.

Die Oberfläche ist dicht, aber geordnet: ein dunkles Arbeitspanel links (Navigationsleiste 80 px plus Inhaltsbereich, zusammen 448 px), die Karte als Hauptfläche, darunter das Streckenband. Farbe ist knapp und bedeutungstragend. Das eine Blau steht für Bedienung und Auswahl; Blau bis Rot erzählen den Belag: glatt ist blau wie eine Google-Route, je rauer, desto wärmer. Violett gehört allein den eigenen Änderungen. Die Karte startet mit dem amtlichen Luftbild, und die dunkle Oberfläche ist so gestimmt, dass sie neben dem Luftbild zurücktritt.

Abgelehnt sind die weiße Komoot-Karte, jede helle „Plan“- oder Bauamts-Optik (ein solcher Entwurf wurde gebaut und verworfen) und themenhafte Verkleidung jeder Art.

**Key Characteristics:**
- Dunkle Flächen in vier eng gestaffelten Grautönen statt Schatten im Panel
- Genau ein interaktives Blau (#8ab4f8), Text darauf dunkel
- Belag als Klassen-Rampe 1–5 in leuchtenden Tönen, Unbekannt schraffiert
- Runde Formensprache: Pillen für Aktionen, 12 px für Container
- Roboto mit tabellarischen Ziffern überall
- Signatur: das Streckenband unter der Karte

## Colors

Dunkles Material-Grau mit einem kühlen Blau als einziger Bedienfarbe und einer leuchtenden Bedeutungsskala für den Untergrund. Auf der Karte ist glatter Belag blau wie eine Google-Route; je rauer, desto wärmer (Gelb → Orange → Rot).

### Primary
- **Nachtblau-Hell** (`accent`): Primäraktion („GPX exportieren“), Fokusring, aktive Schalter, Bereichs-Cursor im Streckenband, Links, Fortschrittsbalken. Text auf Blau ist immer `on-accent` (das Panel-Grau), nie Weiß.
- **Blau-Hover** (`accent-strong`): Hover der Primäraktion.
- **Blau-Tinte** (`accent-ink`): Text und Icon auf ausgewählten Containern.
- **Gewählter Container** (`accent-soft`): aktive Pille in der Navigationsleiste, aktive Kartenchips und Filterchips, gewählte Voreinstellung, Hover der Werkzeugleiste, Textauswahl.
- **Blauer Hauch** (`accent-tint`): Hover- und Auswahlfläche ganzer Listenzeilen (Vorschläge, Stopps, Anstiege, Belags-Check).

### Secondary: Belagsklassen-Rampe
- **Klasse 1 Glatt** (`surface-class-1`, Routenblau): Asphalt, Beton.
- **Klasse 2 Pflaster glatt** (`surface-class-2`, Cyan).
- **Klasse 3 Feiner Schotter** (`surface-class-3`, Gelb, mit Strich-Textur).
- **Klasse 4 Rau** (`surface-class-4`, Orange, mit Strich-Textur): Kopfsteinpflaster, Schotter.
- **Klasse 5 Unbefestigt** (`surface-class-5`, Rot, mit Strich-Textur).
- **Strich-Textur:** Klassen 3–5 tragen auf Karte (dunkle Strichelung auf der Linie), im Band und in Legenden dieselbe Textur – rauer Belag ist so auch ohne Farbsehen erkennbar.
- **Unbekannt** (`surface-unknown`): nie als Vollfläche, immer schraffiert (2 px `faint` auf `sunk`, 45°).

Die Rampe ist an `SURFACE_CLASS` in `src/domain/settings.ts` gebunden; jede Belagskategorie bekommt die Farbe ihrer Klasse, nicht eine eigene.

### Tertiary: Straßenart-Skala
- **Verkehr warm** (`road-primary` Rot, `road-secondary` Orange, `road-tertiary` Gelb): je mehr Autoverkehr, desto wärmer – dieselbe Logik „warm = ungünstig“ wie beim Belag.
- **Ruhige Straßen grau** (`road-minor` hell, `road-residential` blaugrau).
- **Radweg** (`road-cycleway`, Mint): hebt sich vom Routenblau des Belags ab.
- **Wirtschaftsweg** (`road-track`, Erdbraun, im Band gestreift) und **Pfad / Trail** (`road-path`, Rosa).
- Belag und Straßenart werden nie gleichzeitig auf der Karte gezeigt; im Streckenband stehen sie in beschrifteten Zeilen übereinander.

### Bedeutungsfarben
- **Bevorzugen / Meiden / Sperren** (`prefer`, `avoid`, `forbid`): Präferenz-Segmentschalter, Windbalken (Rückenwind, Gegenwind), Warntexte. Dieselben Töne wie die Rampe, damit „gut“ überall gleich aussieht.
- **Ziel** (`dest`): Ziel-Marker B auf Karte, Wegpunktliste und Band, wie die rote Google-Nadel.
- **Revision** (`revision`): eigene Änderungen auf Karte (gestrichelt), im Band (gestrichelter Rahmen) und im Band-Kopf.
- **Status** (`ok-*`, `warn-*`, `danger-*`): gedämpfte Fläche plus dunkle Linie plus helle Tinte; z. B. Belags-Check-Hinweis in `warn-soft` mit `warn-line`.
- **Import** (`import`, `import-soft`): Hinweis zu importierten Spuren.

### Neutral
- **Seitengrund** (`bg`): hinter allem, Seitenleiste.
- **Panel** (`panel`): Navigationsleiste, Inhaltsbereich, schwebende Chips, Menüs, Streckenband.
- **Panel aufgeklappt** (`panel-tint`): geöffneter Bereich in einer Panel-Gruppe.
- **Weich** (`soft`): Karten im Inhaltsbereich, Segment-Hintergründe, Badges, Button-Hover.
- **Versenkt** (`sunk`): Suchfeld, Segment-Tabs.
- **Asphalt** (`asphalt`): Hinweise und Toasts über der Karte.
- **Trennlinie** (`line`) und **Haarlinie** (`hairline`): Rahmen und Zeilentrenner.
- **Spur** (`track`): Schalter aus, Scrollbalken, Seitenwind.
- **Text** (`text`), **Gedämpft** (`muted`), **Blass** (`faint`).
- **Glas** (`glass`): Attribution, Maßstab, Fotostreifen, Dichte-Legende direkt auf dem Luftbild.

### Named Rules
**Die Ein-Blau-Regel.** Bedienung und Auswahl sprechen nur Blau (`accent` und seine Container). Keine zweite Akzentfarbe für Knöpfe, Tabs oder Fokus.

**Die Rampen-Regel.** Blau-Cyan-Gelb-Orange-Rot auf der Route bedeutet Belag (bzw. Straßenart in deren Modus), Warm heißt immer „ungünstiger“. Wer diese Farben dekorativ einsetzt, entwertet die Klassen.

**Die Violett-Regel.** `revision` markiert ausschließlich eigene Änderungen an der Route.

## Typography

**Display Font:** Roboto (mit system-ui, -apple-system, sans-serif)
**Body Font:** Roboto (gleiche Familie)

**Character:** Eine einzige, neutrale Material-Schrift wie in Google Maps; Hierarchie entsteht über Größe und Gewicht, nie über Schriftwechsel. Geladen sind 400, 500 und 700.

### Hierarchy
- **Headline** (500, 22px, auf dem Handy 19px): Bereichstitel im Inhaltsbereich („Route planen“).
- **Stat** (400, 26px, Zeilenhöhe 1): Kennzahlen Distanz, Anstieg, Fahrzeit; Einheit klein in 14px/500 `muted` daneben.
- **Title** (fett, 15px): Titel schwebender Karten (Abschnitt-Editor, POI-Karte), große Primäraktion.
- **Body Strong** (600, 14px): Titel aufklappbarer Bereiche, Akkordeonköpfe.
- **Body** (400, 14px): Grundgröße der App.
- **Body Small** (400, 13px): Listen, Hinweise, Legenden, Kartenchips.
- **Label** (500, 12px, 0.01em): Feldlabels („Belag“, „Straßenart“), Navigationslabels, Chips; Satzschreibung, nie Versalien.
- **Caption** (400, 11.5px, `muted`): Untertitel in Menüs, Zeilen und Kartenchips; 11px für Achsen und Fußzeile.

### Named Rules
**Die Tabellenziffern-Regel.** Ziffern sind überall tabellarisch (`font-variant-numeric: tabular-nums` auf `:root`), damit km-Stände, Prozente und Höhen in Spalten stehen.

**Die Satzschreibungs-Regel.** Labels und Überschriften stehen in normaler Groß-/Kleinschreibung; Versal-Labels gehören nicht zu diesem System.

## Layout

Desktop: eine Zeile aus Seitenleiste (448 px: Navigationsleiste 80 px plus Inhaltsbereich mit 18px Innenabstand und 16px Abstand zwischen Blöcken) und Kartenbereich. Die Seitenleiste lässt sich nach links wegschieben (0.2s). Unter der Karte liegt das Streckenband über die volle Breite des Kartenbereichs.

Über der Karte schweben Bedienelemente mit 12px Abstand zum Rand: Panel-Schalter oben links, Werkzeugchips daneben (ab 56px), Legende als Pille darunter, Zoom oben rechts, Abschnitt-Editor und POI-Karte oben rechts (360 bzw. 320 px breit), Auswahlleiste und Fotostreifen unten.

Rhythmus: Abstände in 4, 6, 8, 10, 12, 14, 16 und 18px; 6px zwischen Knöpfen, 10px zwischen Zeilenelementen, 14px Innenabstand in Karten.

Handy (unter 760px): Die Seitenleiste wird zum unteren Blatt (50 % Höhe), die Navigationsleiste zur Zeile darunter, das Logo entfällt; Kartenchips rücken zusammen, Untertitel und Legende entfallen; schwebende Karten gehen über die volle Breite. Unter 560px verschwinden die Chip-Labels, und das Streckenband zeigt nur Belag und Steigung.

## Elevation & Depth

Hybrid mit klarer Grenze: Im Panel ist alles flach, Tiefe entsteht durch die Grautreppe `bg` → `panel` → `panel-tint` → `soft` → `sunk`. Über der Karte schwebt alles mit weichem Material-Schatten.

### Shadow Vocabulary
- **Schweben** (`--shadow`: `0 1px 3px rgb(0 0 0 / 0.5), 0 4px 10px 2px rgb(0 0 0 / 0.25)`): Kartenchips, Legende, Menüs, schwebende Karten, Toasts, Panel-Schalter, Zoom.
- **Angehoben** (`--shadow-sm`: `0 1px 3px rgb(0 0 0 / 0.45)`): das gewählte Segment in Segmentschaltern und Tabs.
- **Marker** (`--shadow-marker`: `0 1px 4px rgb(0 0 0 / 0.6)`): Wegpunkt- und POI-Marker auf der Karte.
- **Fokus im Suchfeld** (`0 0 0 3px` in `accent-soft`), sonst Fokus als 2px-Umriss in `accent` mit 2px Abstand.

### Named Rules
**Die Schwebe-Regel.** Was über der Karte liegt, schwebt mit Schatten; was im Panel liegt, ist flach und wird nur über Grautöne und Linien gestaffelt.

## Shapes

Durchgehend rund, nie scharfkantig. Aktionen sind Pillen (999px): Knöpfe, Suchfeld, Chips, Kartenchips, Legende, Toasts, Navigations-Pillen. Container haben 12px (`radius`): Karten, Panel-Gruppen, schwebende Karten, Werkzeugleiste. Menüs und Tooltips 10px. Zeilen über die volle Breite (Menüeinträge, Listen, Ebenen-Schalter) bekommen 8px, damit der Hover als Fläche statt als Kapsel erscheint. Innere Segmente 6px. Marker sind Kreise mit weißem oder dunklem Ring.

Icons sind Linien-Symbole aus `src/components/Icon.tsx`: 24er-Raster, Strichstärke 1.8, runde Enden und Ecken, `currentColor`, Standardgröße 16px (20px in der Navigationsleiste).

## Components

### Buttons
Vertraut und ruhig, wie Google-Knöpfe.
- **Shape:** Pille (999px), Rahmen 1px `line`.
- **Standard:** `panel` mit `text`, 7px 14px; Hover `soft` (0.12s).
- **Primary:** `accent` mit `on-accent`, Gewicht 500; Hover `accent-strong`. Die Export-Aktion ist eine geteilte Pille (Hauptteil plus Pfeil für weitere Formate).
- **Ghost:** transparent ohne Rahmen. **Mini:** 28px hoch, 4px 9px, 12px. **Link:** `accent`, ohne Fläche, Hover unterstrichen.
- **Disabled:** 45 % Deckkraft.

### Chips
- **Filterchips:** Pille, `muted` auf `panel`; aktiv `accent-soft` mit `accent-ink`, Rahmen `accent`, Gewicht 600.
- **Kartenchips:** schwebend, ohne Rahmen, mit `--shadow`, 13px/500, Icon plus Label plus gedämpfter Untertitel; aktiv `accent-soft`.
- **Radtyp-Chip:** Pille mit Rahmen, Rad-Icon, Name fett und Profil darunter; Hover und offen mit `accent`-Rahmen.

### Cards / Containers
- **Panel-Gruppe:** zusammengehörige Bereiche (Belags-Check, Wind, Stopps …) als eine Liste mit 1px-Trennlinien in einem 12px-Container; aufgeklappt `panel-tint`. Kopf: Icon 22px `muted`, Titel 14px/600 mit Untertitel, Zähl-Badge als Pille, Chevron dreht 90°.
- **Karte im Inhaltsbereich:** `soft`, ohne Rahmen und Schatten, 12px, 14px Innenabstand.
- **Schwebende Karte:** `panel`, Rahmen `line`, `--shadow`, 12px, erscheint mit „rise“ (6px hoch, 0.15s ease-out).
- **Hinweiskarte:** Statusfläche (`warn-soft` plus `warn-line`, Icon und Badge in `warn-ink`).

### Inputs / Fields
- **Suchfeld:** Pille in `sunk`, ohne sichtbaren Rahmen, 11px 18px; Fokus mit `accent`-Rahmen und 3px `accent-soft`-Ring.
- **Kleine Felder:** 8px Radius, Rahmen `line`, `panel`, 13px.
- **Schalter:** 32×18 Pille in `track`, an `accent` mit Knopf in `on-accent`. Checkbox und Regler in `accent-color: accent`.
- **Segmentschalter / Tabs:** Fläche `soft` oder `sunk`, 2–3px Innenabstand; gewähltes Segment `panel` mit `--shadow-sm`, Text `text`/600. Präferenz-Segmente füllen sich mit `prefer`, `muted`, `avoid` oder `forbid`.

### Navigation
- **Navigationsleiste (Material Rail):** 80px, `panel`, Logo oben, vier Bereiche (Planen, Entdecken, Meine, Profil) als Icon in 56×32-Pille mit Label 12px/500 darunter. Ruhe `muted`, Hover Pille `on-dark-hover`, aktiv Pille `accent-soft` mit `accent-ink`, Label `text`. Auf dem Handy eine Zeile unter dem Blatt.

### Kartenmarker
Wegpunkte als Kreise 26px mit 2.5px Ring und `--shadow-marker`: Start weiß mit dunklem Ring, Zwischenpunkte nummeriert, Ziel in `dest`, Rundtour-Start in `prefer`. Die Wegpunktliste im Panel spiegelt dieselben Marker als 20px-Ringe.

### Streckenband (Signatur)
Die Route gerade gezogen über die volle Kartenbreite, in `panel` mit Linie oben. Kopf: Label „Streckenband“, km-Spanne, beim Überfahren km-Stand plus Belag plus Straßenart, rechts die Revisionszahl in `revision`. Darunter ein km-Lineal mit Wegpunkten (A, Zahlen, B in `dest`) und drei Zeilen: **Belag** (16px hoch, Farben der Klassen-Rampe, Unbekannt schraffiert), **Straßenart** (Verkehr warm, ruhige Straßen grau, Radweg mint, Wirtschaftsweg gestreift, beschriftet wo Platz ist), **Steigung** (Fläche `line`, Linie `text` 1.5px, Anstiege leicht aufgehellt). Der Cursor ist eine helle `text`-Linie mit km-Marke, synchron zur Karte; Ziehen markiert einen Abschnitt (blauer Hauch, gestrichelter Rahmen). Noch rechnende Etappen sind gestrichelt, eigene Änderungen haben einen gestrichelten Rahmen in `revision`. Zeilenbeschriftung links 12.5px/600, Achsen 11px `muted`.

## Do's and Don'ts

### Do:
- **Do** Bedienung und Auswahl nur in `accent` und seinen Containern (`accent-soft`, `accent-tint`) ausdrücken, Text auf Blau in `on-accent`.
- **Do** Belagsfarben immer über `SURFACE_CLASS` aus der Klassen-Rampe 1–5 nehmen und Unbekannt schraffieren.
- **Do** neue Bedienelemente über der Karte als schwebende `panel`-Pille oder -Karte mit `--shadow` bauen, mit 12px Randabstand.
- **Do** Inhalte im Panel flach halten und zusammengehörige Bereiche in einer Panel-Gruppe mit Trennlinien bündeln statt viele Karten zu stapeln.
- **Do** Icons aus `Icon.tsx` nehmen (24er-Raster, Strich 1.8, runde Enden); fehlt eines, im selben Raster ergänzen.
- **Do** Zahlen mit tabellarischen Ziffern und Komma als Dezimaltrenner zeigen („40,9 km“).

### Don't:
- **Don't** eine helle Oberfläche, eine weiße Komoot-artige Karte oder eine „Plan“-/Bauamts-Optik einführen; Veloterra ist dunkel wie Google Maps bei Nacht.
- **Don't** Cyan, Gelb, Orange oder Rot dekorativ verwenden; sie gehören dem Belag, der Straßenart und den Präferenzen.
- **Don't** `revision`-Violett für etwas anderes als eigene Routenänderungen nutzen.
- **Don't** Emoji oder Unicode-Zeichen als Icons verwenden.
- **Don't** Schatten auf Karten im Inhaltsbereich legen; Schatten gehören nur zu dem, was über der Karte schwebt.
- **Don't** Versal-Labels oder Überzeilen über Überschriften setzen.
- **Don't** eine zweite Schriftfamilie einführen.
