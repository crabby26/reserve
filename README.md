# Reserve

Zwei Rostlauben, eine endlose Wüstenstraße, zu wenig Sprit für beide. **Reserve** ist ein 3D-Roadtrip-Rennen für zwei iPads im Browser, gefahren aus der Verfolgerperspektive. Wer zuerst Kilometer 100 erreicht, gewinnt. Eine Partie dauert etwa 10 bis 15 Minuten.

Ohne Installation, ohne Konto, ohne IP-Adressen: Einer erstellt einen Raum, der andere gibt den Code ein.

**Spielen:** https://crabby26.github.io/reserve/

**Server:** https://reserve-server.onrender.com

## Spielen auf zwei iPads

1. iPads quer halten und das Spiel in Safari öffnen.
2. Spieler 1 tippt auf **Raum erstellen** und bekommt einen vierstelligen Code und einen Link.
3. Spieler 2 tippt den Code ein und drückt **Beitreten**, oder öffnet den Link.
4. Die Partie startet automatisch nach einem Countdown.

Die Seite muss im Vordergrund bleiben, weil iOS Tabs im Hintergrund pausiert. Bricht die Verbindung ab, versucht das Spiel 30 Sekunden lang, wieder hineinzukommen. Der eigene Wagen wartet so lange. Wer länger weg ist, verliert die Partie.

Der kostenlose Server schläft nach 15 Minuten ohne Betrieb. Der erste Raum kann dann bis zu einer Minute dauern, das Spiel zeigt dabei einen Hinweis.

**Allein gegen Onkel Horst** ist der Übungsmodus. Er läuft ohne Server.

## Steuerung

| Was | Touch | Tastatur (zum Testen) |
|---|---|---|
| Lenken | Linker Daumen: im linken Bereich ziehen | ← → oder A D |
| Gas | Rechter Daumen auf GAS: oben Vollgas, unten sparsam | ↑ oder W |
| Bremsen, rückwärts | Rechter Daumen auf BREMSE | ↓ oder S |
| Hupe | Knopf links | H |
| Stoß (kostet 3 Liter) | Knopf rechts | B |
| Schlauch | Knopf rechts, leuchtet in Reichweite | E |
| Item | Knopf rechts | Q |
| Ausschlachten, reparieren | Großen Knopf gedrückt halten, erscheint bei Bedarf | F |

**Neigen** oben rechts schaltet auf Neigungssteuerung um. iOS fragt dabei einmal nach der Erlaubnis. **Ton** schaltet den Sound. Er startet erst nach der ersten Berührung.

## Was im Spiel passiert

- **Sprit:** Eine Füllung reicht bei Vollgas für etwa 17 km, bei leichtem Fuß für über 20. Tankstellen liegen 13 bis 20 km auseinander und haben begrenzten Vorrat, den sich beide teilen. Auf dem Vorplatz langsam fahren, dann läuft es von selbst.
- **Leer:** Der Wagen rollt aus und du schiebst, sehr langsam. Voraus liegt immer ein Kanister mit 25 Litern. Der Gegner kann ihn klauen, dann erscheint ein neuer.
- **Schlauch:** Dicht neben dem Gegner auf Schlauch tippen. Nach einer kurzen Warnung fließen bis zu 35 Liter in deinen Tank.
  - Das Opfer entkommt mit Stoß oder Abbiegen. Ab etwa zwei Wagenbreiten Abstand reißt der Schlauch.
  - Dreimal hupen dreht den Fluss um, und dann trinkt das Opfer.
- **Wracks und Hütten:** Am Straßenrand anhalten und den großen Knopf halten. Beute sind Restsprit, Reifen, Öl, Blech und manchmal ein Item. Jedes Wrack gibt es nur einmal.
- **Zustand:** Wenig Blech, Reifen oder Öl kosten Tempo und Grip. Es gibt keinen Totalschaden.
- **Items** aus Kisten auf der Straße:
  - **Ölspur:** Wird hinter den Wagen geworfen und lässt rutschen, auch dich selbst.
  - **Bertha:** Eine Kuh quert vor dem Gegner die Fahrbahn.
  - **Platten-Gag:** Quietscheentchen im Radkasten des Gegners, kostet Tempo und lässt den Wagen wackeln.
  - **Fata Morgana:** Zeigt nur dem Gegner eine Tankstelle, die es nicht gibt.
- **Zufallsereignisse**, auf beiden Bildschirmen gleich:
  - **Sandsturm:** Sicht weg, dazu Seitenwind.
  - **Panne:** Trifft oft den Führenden, Reparatur durch Halten.
  - **Radarfalle:** Ein Schild warnt vorher. Wer schneller als 110 km/h fährt, steht kurz.

## Was aus der Recherche ins Design floss

Die vollständigen Notizen mit Quellen stehen in [`docs/recherche.md`](docs/recherche.md). Das Spiel ist von Roadtrip-Spielen wie The Long Drive inspiriert, aber eigenständig umgesetzt.

- **Fehlende Ziele und Einsätze** gehören zu den häufigen Kritikpunkten an der Vorlage. Darum gibt es hier ein festes Ziel, kurze Partien und einen Gegner, der einem den Sprit wegtrinkt.
- **Hakelige Steuerung und unfaire Physik** werden oft beklagt. Darum wird sofort losgefahren, die Lenkung reagiert direkt, eine Spurhilfe greift bei losgelassenem Daumen, und ein Crash kostet nur Tempo.
- **Mehrspieler nur über Umwege** ist dort ein Ärgernis. Hier ist er der Kern und braucht nur einen Code.
- **Schrott sammeln und absurde Geschichten** lieben die Spieler. Darum gibt es Wracks mit einer einfachen Geste, Sprüche und eine Kuh.

**Kernmechanik ist der Schlauch.** Er macht den knappen Sprit zum direkten Streitpunkt zwischen beiden Spielern und zwingt sie dicht nebeneinander. Der ergänzte Rückstoß macht daraus ein Duell, in dem auch das Opfer etwas tun kann.

## Technik

- `index.html`, `js/`, `css/`, `shared/`, `vendor/`: Client ohne Build-Schritt, läuft auf GitHub Pages. Die 3D-Darstellung nutzt three.js (MIT) und braucht WebGL.
- Die Höhe existiert nur in der Darstellung (`js/render3d.js`). Physik und Regeln rechnen weiter in der Ebene, damit die Steuerung vorhersehbar bleibt.
- `shared/`: Weltgenerator, Fahrphysik und Spielregeln. Client und Server nutzen dieselben Dateien.
- `server/`: Node.js mit `ws`. Der Server verwaltet die Räume und entscheidet über Sprit, Items, Kollisionen und Sieg.
- Die Welt entsteht aus einem Seed, den der Server vergibt. Übertragen werden nur Autos und Items, 20-mal pro Sekunde.
- Der eigene Wagen wird lokal vorausberechnet und mit dem Server abgeglichen, der Gegner wird interpoliert.
- `config.js` enthält die Server-URL.

## Lokal starten

Node.js 20 oder neuer wird gebraucht.

```bash
cd server && npm install && npm start
```

Danach http://localhost:8787 öffnen. Das Spiel verbindet sich auf localhost automatisch mit dem lokalen Server.

- Tests: `npm test` im Ordner `server/`.
- Zwei Clients nebeneinander: http://localhost:8787/dev/duo.html. In der Konsole startet `runAll()` den automatischen Durchlauf.

## Server deployen (Render, kostenloser Tarif)

1. Auf https://render.com anmelden.
2. [Blueprint starten](https://render.com/deploy?repo=https://github.com/crabby26/reserve) oder **New > Blueprint** wählen und das Repo verbinden. Render liest `render.yaml` und legt den Dienst `reserve-server` an.
3. Die vergebene Adresse notieren, zum Beispiel `https://reserve-server-xxxx.onrender.com`.
4. In `config.js` eintragen, mit `wss://` statt `https://`, committen und pushen.
5. `render.yaml` setzt `ALLOWED_ORIGINS` auf `https://crabby26.github.io`. Der Server akzeptiert also nur Verbindungen von dort. Wer das Repo forkt, muss den Wert anpassen.

Prüfen: `https://…onrender.com/health` muss `{"ok":true}` zeigen.

Andere Dienste funktionieren genauso, wenn sie WebSockets erlauben: Build `cd server && npm ci`, Start `node server/index.js`. Der Server liest den Port aus `PORT`.

## GitHub Pages

Unter **Settings > Pages** als Quelle **Deploy from a branch**, Branch `main`, Ordner `/ (root)` wählen.

## Lizenz

Code unter [MIT](LICENSE). Herkunft aller Bestandteile in [CREDITS.md](CREDITS.md).

Hinweis zum Titel: „Reserve“ wurde nur per Websuche geprüft, nicht markenrechtlich. Vor einer kommerziellen Nutzung müsste das nachgeholt werden.
