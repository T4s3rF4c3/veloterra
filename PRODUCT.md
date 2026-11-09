# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primär der Entwickler selbst: ein deutschsprachiger Rennradfahrer, der seine Touren vor der Fahrt in Ruhe am Rechner plant. Handy ist Nebensache (kurzer Blick, kleine Korrekturen). Die Planung muss trotzdem für Rennrad, Gravel, MTB und Trekking taugen.

## Product Purpose

Routen planen, die nach **Untergrund** und **Straßenart** fein steuerbar sind, und einzelne Abschnitte nachträglich gezielt umplanen, ohne den Rest der Route zu verändern. Erfolg: eine Route, der man vor der Fahrt vertraut (kein Schotter-Überraschungsstück, keine Bundesstraße) und die als GPX/TCX auf den Radcomputer geht.

## Positioning

Lokales Umplanen: Route ziehen oder ein Stück „umfahren“, und nur dieser Abschnitt wird neu berechnet; Belag, Straßenart und Steigung sind für jedes Stück sichtbar. Dazu ein Belags-Check, der unsichere Abschnitte mit Fotos prüfen lässt.

## Operating Context

- Desktop-Browser, Karte als Hauptfläche; Start immer mit amtlichem Luftbild (DE), weitere Kartenstile wählbar.
- Ablauf: Start/Ziel klicken → Übersicht (Distanz, Anstieg, Belag-/Straßenart-Mix) → Stücke prüfen, umfahren, markieren → Export (GPX mit Abbiegehinweisen, TCX-Kurs).
- Daten: BRouter (Routing), OpenStreetMap/Overpass/Photon, OpenFreeMap, Esri und Landes-Luftbilder, Open-Meteo (Wind), Panoramax/Mapillary (Fotos), Waymarked Trails.
- Selbst gehostet (Docker/Unraid).

## Capabilities and Constraints

- Bereiche: Planen, Entdecken (Rundtour, Ziele, beschilderte Radwege), Meine (gespeicherte Routen, eigene Heatmap), Profil (Radtyp, Voreinstellungen, Belag/Straßenart-Präferenzen, dauerhafte Sperren).
- Undo/Redo, Höhenprofil mit Abschnittsauswahl, Wind entlang der Route, Stopps, Straßenfotos.
- React 19 + MapLibre + zustand, Vite. Oberfläche komplett auf Deutsch.
- Daten liegen im Browser (localStorage/IndexedDB), kein Konto.

## Brand Commitments

Name „Veloterra“ und Logo bleiben; Asphalt-Motiv ist aufgegeben.

Bindende Gestaltungsvorgabe des Nutzers (2026-11-09): **dunkle Oberfläche, angelehnt an Google Maps im Dunkelmodus** – vertraute Bedienmuster (Navigation mit Icon + Label, runde Knöpfe, Suchfeld oben), keine eigenwillige „Plan“-Optik. Die Karte startet weiterhin mit dem Luftbild DE. Wunsch: modern, schlicht, intuitiv.

## Evidence on Hand

Echte Routen-, Belags- und Höhendaten aus den Diensten oben. Keine Nutzerzahlen, Testimonials oder Vergleiche – nichts davon erfinden.

## Product Principles

1. Vertrauen vor der Fahrt: Belag und Straßenart jedes Stücks sind sichtbar, bevor man losfährt.
2. Lokal ändern, nie alles neu: Eingriffe betreffen nur das gewählte Stück.
3. Die Karte ist die Arbeitsfläche; Bedienelemente halten sie frei.
4. Ein Radtyp-Profil, viele Radtypen: gleiche Bedienung für Rennrad, Gravel, MTB, Trekking.
