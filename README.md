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

## Terrain and world sizes

New solo worlds and newly created rooms are **64 × 64 × 20**. The western
38 × 64 columns (about 60% of the area) are level grassland: grass at block
height 5, with no trees or leaves above it. The remaining eastern area is
forest with hills and denser trees. A six-column transition eases the terrain
from the plain into the hills. Players spawn in the grassland.

Existing **40 × 40 × 20** local saves and rooms keep their dimensions, terrain,
and buildings. The oldest array-only local saves are also supported. Simply
reloading or rejoining does not regenerate or enlarge an existing world.
Creating a new room gives the new terrain. Resetting a solo world explicitly
replaces it with a fresh 64-square world, after confirmation; this deletes its
existing buildings. To keep an old solo world, use a new room instead of reset.
The game header shows the current world's size and terrain.

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
messages to 20 per second; snapshot requests to two per second. Coordinates
are checked against each room's actual size, not a global 40-square limit.
New room snapshots are stored as metadata plus 8,192-cell binary parts, each
well below the per-value storage limit. Block edits atomically update one part
and its revision; older single-value snapshots migrate without altering their
buildings on the next accepted edit. Missing or corrupt parts fail explicitly
instead of regenerating the terrain. Worlds survive disconnects and Worker
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

The cooperative-building release is published on GitHub Pages and the Worker
as of 2026-11-01. Production checks confirmed shared edits, conflict rejection,
late-join snapshots, and owner closure. Browser checks used direct gameplay
events, not a full normal mouse-input session. Before class, verify normal
movement, aiming, mining, and placement from two actual devices.

The expanded forest/grassland release uses protocol **v3**. Its Worker was
deployed on 2026-11-01; publish the matching static client and reload browser
tabs to use it. New rooms use 64-square worlds; existing rooms remain 40-square.

This implementation requires both the updated Worker
and client. Deploy the Worker first (`wrangler deploy`), publish the updated
static client, then reload all participating browsers. A v1/v2 client cannot
exchange gameplay messages with a v3 Worker, but a v3 client can still join
existing 40-square rooms. No new dependencies, bindings,
or configuration changes are required. Reload existing browser tabs to receive
the updated client.

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select the branch to publish and the
   `/(root)` folder, then save.
4. Open the Pages URL shown in the settings after deployment completes.

Because the game is a static site with relative asset paths, it works from a
GitHub Pages project URL as well as from the repository root.
