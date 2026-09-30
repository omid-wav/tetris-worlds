# 🟦 Tetris Worlds

**Mein erstes Spiel, das ich hochlade!** 🎉

Hi, ich bin Omid, und das hier ist **Tetris Worlds**: ein Tetris im Browser mit bunten Welten, knackigem Sound, Medaillen und einem geheimen Retro-Modus. Es ist das erste Spiel, das ich veröffentliche! Ich würde mich riesig freuen, wenn du es ausprobierst und mir sagst, wie weit du gekommen bist!

> Kannst du meinen Highscore knacken? 😉

---

## ✨ Features

- **3 Spielmodi**
  - **Marathon**: endlos, alle 10 Lines steigt das Level, und es wird immer schneller
  - **Sprint**: 40 Lines, so schnell wie möglich
  - **Ultra**: so viele Punkte wie möglich in 2 Minuten
- **8 Welten**: mit jedem Level wechselt die Welt (Terra, Aqua, Ignis, Nebula …) samt Farben und Hintergrund
- **Moderne Tetris-Regeln**: Hold, Ghost Piece, 5er-Vorschau, T-Spins, Back-to-Back, Combos und Perfect Clears
- **🏅 Medaillen-System**: 12 Meilensteine mit Bronze, Silber, Gold und Platin
- **🎮 Game-Boy-Skin**: schalte ihn mit über **100.000 Punkten** frei und spiele im Look von 1989, mit 8-Bit-Musik und Sounds
- **Präzise Steuerung**: Sensitivität per Regler einstellbar, dazu DAS/ARR für Profis
- **Gamepad-Support** mit Vibration
- **Chiptune-Musik und Effekte**, alle live im Browser erzeugt
- **Online-Highscore-Liste** über den eingebauten Server

---

## 🚀 Ausprobieren

Du brauchst nur **Java 17 oder neuer**. Alles andere bringt das Projekt mit.

```bash
git clone https://github.com/omid-wav/tetris-worlds.git
cd tetris-worlds
./gradlew run
```

Unter Windows startest du stattdessen `gradlew.bat run`.

Der Browser öffnet sich automatisch unter **http://localhost:8080**. Falls nicht, öffne die Adresse einfach selbst. Einen anderen Port wählst du mit `./gradlew run --args="9090"`.

---

## 🎹 Steuerung

| Taste | Aktion |
|---|---|
| ← → | Bewegen |
| ↓ | Soft Drop |
| Leertaste | Hard Drop |
| ↑ / X | Rechts drehen |
| Z / Y | Links drehen |
| A | 180° drehen |
| C / Shift | Hold |
| Esc / P | Pause |
| R | Neustart |

Alle Tasten lassen sich in den **Einstellungen** ändern. Ein Gamepad funktioniert direkt nach dem Einstecken.

**Tipp:** Wenn sich die Steuerung zu schnell oder zu langsam anfühlt, stell sie in den Einstellungen mit dem Regler **„Sensitivität“** auf dich ein.

---

## 🛠️ Technik

- **Backend:** Java mit dem eingebauten `HttpServer`, ohne Frameworks. Er liefert das Spiel aus und speichert die Highscores.
- **Frontend:** reines HTML, CSS und JavaScript, gezeichnet mit Canvas. Die Sounds kommen aus der Web Audio API.
- **Build:** Gradle

```
src/main/java/org/example/     Server und Highscore-Speicher
src/main/resources/web/        Das Spiel (index.html, style.css, js/)
```

---

## 💬 Feedback

Das ist mein erstes veröffentlichtes Projekt, deshalb freue ich mich über jedes Feedback! Wenn dir etwas auffällt, du eine Idee hast oder einfach deinen Highscore zeigen willst, erstelle gern ein **Issue**. Und wenn dir das Spiel gefällt, gib dem Projekt gern einen ⭐, das motiviert mich sehr für das nächste Spiel.

**Viel Spaß beim Spielen!** 🧱

*made by Omid*
