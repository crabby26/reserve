# Credits

## Grafik, Sound, Texte

Alles für dieses Spiel neu erstellt, es gibt keine eingebundenen Asset-Dateien:

- **Grafik:** Modelle und Texturen werden zur Laufzeit im Code erzeugt (`js/render3d.js`).
- **Sound:** wird zur Laufzeit per Web Audio erzeugt (`js/audio.js`). Es gibt keine Sample-Dateien.
- **Texte:** selbst geschrieben (`js/texts.js`).
- **Fahrzeuge und Namen:** erfunden, zum Beispiel „Kombi Wüstenfuchs“ und „Pritsche Trockenpflaume“.

## Schriften

Es wird keine Schriftdatei ausgeliefert. Das Spiel nutzt, was auf dem Gerät installiert ist (auf dem iPad „Avenir Next Condensed“), und fällt sonst auf die Systemschrift zurück.

## Bibliotheken

| Name | Einsatz | Lizenz | Quelle |
|---|---|---|---|
| ws | WebSocket-Server, nur auf dem Server | MIT | https://github.com/websockets/ws |
| three.js r149 | 3D-Darstellung im Client, liegt unter `vendor/` | MIT, Text in `vendor/three.LICENSE.txt` | https://github.com/mrdoob/three.js |

## Inspiration und Recherche

Die Spielidee ist von Roadtrip-Spielen wie The Long Drive und A Dusty Trip (Roblox) inspiriert. Von dort wurden weder Code noch Grafik, Sound, Texte, Fahrzeuge oder Namen übernommen. Quellen der Recherche stehen in [`docs/recherche.md`](docs/recherche.md).
