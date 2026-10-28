# ROAD TRIP

**A little wagon. A long weekend. Take the long way.**

![Road Trip — The Mountain Weekend](docs/title.png)

An original, family-friendly first-person 3D road-trip adventure. This repository contains a playable single-player vertical slice, **The Mountain Weekend**, built with TypeScript, Three.js, Vite, and Rapier. All art is generated from original compound geometry; sound effects and the quiet road-trip radio are synthesized locally. No remote art, music, game server, API key, or account is required.

## Download and play

[Download the playable game](https://github.com/Cupcake5178/RoadTrip-Game/raw/refs/heads/main/downloads/RoadTrip-playable.zip), extract the ZIP, and open **RoadTrip.html** in a recent desktop Chrome, Edge, or Firefox browser. Click **Let's hit the road**. You do not need Node.js or terminal commands to play this version. Use a keyboard and mouse.

The download embeds the game, styles, physics, and generated art/audio into one HTML file. Browser saves stay on your device. See [download notes](downloads/README.md) for local-file restrictions and the development-server fallback.

## Run from source

Use Node.js 22.12+ (validated with Node.js 24) and npm:

```sh
npm ci
npm run dev
```

Open the address printed by Vite in a desktop browser with WebGL2, a keyboard, and a mouse. Click the game world to capture the mouse. Escape releases it; P opens the pause menu. Low graphics quality is available for slower machines and software rendering.

```sh
npm run build      # Type checking and a production build in dist/
npm run preview    # Serve the production build
npm test           # Simulation and persistence tests
npm run test:e2e   # Real Chromium gameplay tests
```

The browser tests use `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` to use another installed Chromium. On a machine without Chromium, install it or run `npx playwright install chromium` and configure the executable path. No browser installation is needed to play the game in your usual browser.

## Your weekend

Start in Maple Hollow. Walk around the wagon, inspect the supplies, carry them to the trunk, and choose what fits into eleven cargo slots. Bring what matters: a tent, snacks, water, a spare, tools, a camera, fuel, or a weekend bag. Secure the roof straps, open the driver's door, and hop in.

The 7.2 km route passes through farmland, forests, a lake district, mountain country, and Little Spruce. A leisurely first trip with packing, exploration, repairs, and camping is designed around a 20–30 minute visit; this duration has not been validated with human playtests.

- **Last Chance Gas:** park at a pump, get out, and hold E to refuel. The convenience store has a walk-through entrance, shelves, supplies, snacks, water, and wagon servicing.
- **Mirror Lake:** explore the timber deck and take a real photograph for the journal. A packed camera earns scenic bonuses.
- **The Fork:** choose smooth highway or the bumpy Pinecone dirt loop. Your passengers have opinions about both.
- **Roadside surprises:** fix flats with packed tools and a spare, cool an overheating engine with water, or secure loose roof cargo. Missing equipment has a paid or patient alternative. There are four distance-triggered event opportunities, with seeded variation on replay.
- **Pinecone Camp:** pitch or rent a tent, light the contained fire, cook supper, meet a small campsite supervisor, and sleep until morning.
- **Little Spruce:** find the Big Little Teapot, stop at the diner, or rest at the motel.
- **Sunrise Ridge:** park and walk to the final overlook. Interact to receive a trip journal, photo album, rating, and travel rewards.

June (the planner) and Milo (the happy camper) have lightweight hunger, energy, and mood needs. Share snacks through the cargo panel. Weather changes between sun, cloud, rain, and fog; time advances through sunset, night, and sunrise. Headlights help in the dark.

Travel rewards purchase a bigger rack, better tires, and a tune-up. Paint colors are free. Rewards, upgrades, journals, and settings persist across new weekends. Finishing unlocks a golden-hour replay with a fresh event seed. The current vehicle is the Wander Wagon; additional vehicles and destinations are future work.

## Controls

| Key           | Action                                         |
| ------------- | ---------------------------------------------- |
| WASD / arrows | Walk or accelerate, reverse, and steer         |
| Mouse         | Look around                                    |
| E             | Interact; open door / enter; exit when stopped |
| Hold E        | Fuel, strap cargo, and perform repair steps    |
| Shift         | Sprint on foot                                 |
| Space         | Jump on foot / handbrake while driving         |
| Q             | Put down a carried item with physical motion   |
| F             | Toggle headlights                              |
| V             | Switch cockpit / chase driving camera          |
| C             | Frame a photo; press again to keep it          |
| M             | Route and discoveries                          |
| Tab           | Cargo, snacks, water, and emergency fuel       |
| P / Escape    | Pause / release mouse                          |
| R             | Friendly roadside assistance, up to $8         |

Look toward an item or interaction to reveal its prompt. Open the trunk before packing. For a flat, retrieve the packed spare and tool kit, hold E to jack up the wagon, then hold E again to fit the spare. With no supplies, the same wheel prompt offers roadside service. Assistance and rental fallbacks keep an empty wallet from ending the weekend.

## Saving

The trip saves automatically every twelve active seconds, at significant actions, when pausing, and when returning to the title screen. Continue resumes resources, vehicle position, decisions, discoveries, photographs, and progression. New Trip replaces the active trip while keeping earned progression; Reset Save removes all progress and settings after confirmation.

Saves live in this browser's local storage. There are eight photographs per trip and three retained completed journals. Unpacked loose items are session-only; keep important items packed before leaving. If storage is blocked or full, the game warns that progress is in memory only. There is no cloud sync.

## Architecture

- `src/game.ts`: game loop, player movement, interaction dispatch, repair steps, trip flow, and camera.
- `src/vehicle.ts`: accessible arcade driving, terrain alignment, scenery contacts, fuel, cockpit/chase views, visual suspension/sway, roof cargo, and vehicle problems.
- `src/world.ts`: road ribbons, colored terrain, instanced vegetation, spatially batched scenery, detailed stops, lighting, weather, and campsite.
- `src/models.ts`: recognizable compound models, shared materials, signs, the wagon interior, characters, supplies, and an asset registry with a GLTF loader.
- `src/physics.ts`: Rapier terrain collision and dynamic dropped/carried supplies.
- `src/state.ts`: serializable state, inventory, budget, rewards, seeded event choices, persistence, and progression.
- `src/route.ts`: continuous road geometry, stop data, terrain sampling, and seeded randomness.
- `src/ui.ts` and `src/style.css`: game HUD, menus, map, settings, shops, and journal.
- `src/audio.ts`: procedural music, engine, rain, footstep, interaction, repair, and photo sounds.

Vehicle handling intentionally uses a forgiving arcade terrain-following controller with scenery contact resolution. Rapier handles loose supplies; this is not a full rigid-body suspension or ragdoll simulation. Passenger reactions are light procedural animations rather than a full character animation rig.

The asset registry exposes `loadAsset()` for original `.glb` / `.gltf` replacements. Preserve the model's scale, forward direction (-Z), interaction root, and anchor positions when replacing its visual children. The gameplay data and interactions are independent of a specific mesh. New vehicles should implement the existing vehicle anchors and use separate stat definitions; multiplayer is not implemented.

## Validation

Unit tests cover cargo capacity, repacking exploits, fuel pricing, budgets, passenger resources, discovery uniqueness, deterministic events, reward idempotency, replay progression, save round-trips, corrupt/unavailable storage, and continuous road/stop geometry.

Browser tests use actual keyboard interactions to pick up and pack supplies, enter and drive the wagon, solve a triggered vehicle problem, pay for fuel, buy supplies, take WebGL photographs, choose a route, pitch/light/cook/sleep at camp, visit an attraction, complete the trip, reload saved progress, and replay. A second scenario checks settings, dropped Rapier cargo, the map, assistance, title navigation, and reset. The development-only `?test` travel harness shortens long drives and aims the camera; it does not grant supplies, fix problems, or complete trips. It is excluded from production builds. These are functional tests, not a full-duration human playtest or a guarantee of frame rate on every device.

The production build's largest chunk contains Rapier's embedded WebAssembly. It is self-contained and needs no separate WASM host. Vite's default large-chunk warning is expected for this dependency.

## Current scope

This is one complete single-player trip, with an original procedural art and sound direction. Online co-op, additional vehicles, a larger world, full character/ragdoll animation, detailed mechanical simulation, and touch/controller controls are not included. The architecture separates input, simulation, world, assets, and presentation so later work can build on the slice.
