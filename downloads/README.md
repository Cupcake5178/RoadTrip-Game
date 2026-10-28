# Play Road Trip

[Download the playable ZIP](https://github.com/Cupcake5178/RoadTrip-Game/raw/refs/heads/main/downloads/RoadTrip-playable.zip)

1. Download and extract the ZIP.
2. Open **RoadTrip.html** in a recent desktop Chrome, Edge, or Firefox browser.
3. Click **Let's hit the road**.

No terminal, Node.js, or npm is needed to play. Use a keyboard and mouse; **WASD** moves/drives, **E** interacts, and **P** pauses. See **How to Play** on the title screen for the full controls.

All game code, styles, physics, art, and audio are self-contained. Saves stay in your browser; moving the HTML file may change where your browser looks for its save. The game warns if local storage is unavailable. Managed browsers may block local HTML; the source development server is the fallback.

The standalone bundle is browser-tested over HTTP with no external resource requests. The cloud's managed browser blocks `file:` navigation, so direct file opening cannot be tested in this environment.

To regenerate this ZIP as a developer, install Node.js 22.12+ and Python 3, then run `npm ci` and `npm run package` from the repository root.
