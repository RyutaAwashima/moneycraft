# Moneycraft

Moneycraft is a small, original first-person 3D block-building game that runs
in a web browser. It uses WebGL with plain HTML, CSS, and JavaScript, so it can
be hosted as a static site on GitHub Pages without a build step or external
libraries.

World generation, block access, and versioned world snapshots are isolated in
`world-model.js`; rendering and input are handled by `game.js`.

## Project status and work history

Start with [PROGRESS.md](./PROGRESS.md) before continuing development; it records
the current implementation state, constraints, and next steps.
[WORK_LOG.md](./WORK_LOG.md) is the append-only work history, and
[ROADMAP.md](./ROADMAP.md) tracks multiplayer phases and completion criteria.

## Play locally

Open `index.html` in a modern browser, or serve this folder with any static
file server.

## Controls

- Click the game to capture the mouse; move the mouse to look around
- `W` / `A` / `S` / `D`: move; `Space`: jump
- Aim at a nearby block and left-click: mine it
- Right-click an adjacent empty space: place the selected block
- `1`–`9` or click a hotbar slot: select a block
- `I`: toggle the world-coordinate and movement indicator
- `Esc`: release the mouse
- On touch devices, drag the left half to move and the right half to look;
  use the on-screen buttons to mine, place, and jump

All nine blocks have small procedural pixel textures. Planks, bricks, a white
wall, and an opaque glass-style window are available alongside the original
five materials. Window blocks are solid, not transparent. Stairs are not yet
implemented.

Solo worlds are saved in the current browser using local storage. Joining a
room temporarily switches to its shared world without overwriting the solo
save. Leaving, disconnecting, or closing a room restores the original solo
world. The reset button is disabled while joining or participating in a room.

## Multiplayer development

See [ROADMAP.md](./ROADMAP.md) for the selected MVP requirements, proposed
multiplayer architecture, phases, and completion criteria.
The multiplayer prototype supports up to eight participants and sends player
position and facing direction 10 times per second. Room worlds are generated
from a common seed and stored in Durable Object storage. Joining or rejoining
loads the latest full snapshot; mining and placement are persisted before
being broadcast to everyone, including the editor. Conflicting edits use
server processing order and compare the expected block before applying.
Clients request a fresh snapshot on revision gaps, conflicts, or edit timeouts.
Only edited chunks and their affected neighbors are rebuilt.

The server validates block IDs, coordinates, reach, and placements overlapping
participants. Edits are limited to 10 per second per participant; position
messages to 20 per second; snapshot requests to two per second. The fixed
40 × 40 × 20 world bounds storage size. Worlds survive disconnects and Worker
restarts until the owner closes the room, which deletes the shared world.
Keep the room code to resume; no export, reopening of closed rooms, or
automatic room expiry is implemented.

Run the focused tests with
`node --test world-model.test.js game.test.js multiplayer.test.js src/protocol.test.js src/room.test.js`.

Run `wrangler dev --ip 127.0.0.1 --port 49180` and `node dev-server.js` in separate terminals
to test the room service and game locally. The page is available at
`http://127.0.0.1:49179`; the room API health check is
`http://127.0.0.1:49180/api/health`. The local page is intentionally served
separately from the Worker to keep development state out of the published
static assets. When publishing the client on GitHub Pages, set
`MONEYCRAFT_CONFIG.apiBaseUrl` in `config.js` to the deployed Worker URL. The
`ALLOWED_ORIGINS` Worker variable must include the Pages site origin.

The published client currently connects to
`https://moneycraft-realtime.pitagoramin-shizuoka.workers.dev`. The Worker uses
Cloudflare Durable Objects for room state; local Durable Object storage is for
development only. The client and Worker are deployed separately.

This implementation uses protocol **v2** and requires both the updated Worker
and client. Deploy the Worker first (`wrangler deploy`), publish the updated
static client, then reload all participating browsers. A v1 client cannot
exchange gameplay messages with a v2 Worker. No new dependencies, bindings,
or configuration changes are required. Local validation is not a production
deployment; verify two-browser building and normal movement on the published
site before using it in class.

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select the branch to publish and the
   `/(root)` folder, then save.
4. Open the Pages URL shown in the settings after deployment completes.

Because the game is a static site with relative asset paths, it works from a
GitHub Pages project URL as well as from the repository root.
