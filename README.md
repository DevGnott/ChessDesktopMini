# Chess Desktop Mini

Ein kleines, rahmenloses Desktop-Fenster für Chess.com. Während einer Partie wird nur das Schachbrett angezeigt. Das Fenster bleibt frei verschiebbar und skalierbar, der Chess.com-Login wird lokal in einem eigenen, dauerhaften App-Profil gespeichert.

## Starten

```bash
npm install
npm start
```

Beim ersten Start erscheint die normale Chess.com-Spielseite, damit Anmeldung und Partieauswahl funktionieren. Sobald eine Partie läuft, wechselt die App automatisch in den Brettmodus.

## Bedienung

- Maus ganz an den oberen Fensterrand bewegen: Mini-Leiste einblenden
- `•••`: Fenster verschieben
- `▦`: zwischen Brettmodus und kompletter Chess.com-Seite wechseln
- `⌖`: Fenster immer im Vordergrund halten
- `⚙`: Tastenkombinationen konfigurieren
- `＋`: zurück zur Auswahl für eine neue Partie
- Fensterrand ziehen: Größe ändern
- `Strg+Umschalt+M`: Brettmodus umschalten

Die Aktionskürzel funktionieren, solange das Mini-Fenster den Fokus hat. Standardmäßig gelten:

- Revanche: `Strg+Alt+R`
- Neue Partie: `Strg+Alt+N`
- Remis anbieten: `Strg+Alt+D`
- Aufgeben: `Strg+Alt+Q`

Über `⚙` lässt sich jede Kombination ändern. Nach dem Anklicken eines Kürzels einfach die gewünschte neue Tastenkombination drücken; sie wird sofort dauerhaft gespeichert. Bei Remis und Aufgeben bleibt eine eventuelle Sicherheitsabfrage von Chess.com erhalten.

## AppImage bauen

```bash
npm run dist
```

Das fertige AppImage liegt danach im Ordner `dist/`.

Chess.com ist eine Marke der Chess.com LLC. Dieses unabhängige Desktop-Fenster lädt die originale Chess.com-Webseite und speichert keine Zugangsdaten selbst.
