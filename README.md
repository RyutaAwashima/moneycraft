# Moneycraft

Moneycraft is a small, original first-person 3D block-building game that runs
in a web browser. It uses WebGL with plain HTML, CSS, and JavaScript, so it can
be hosted as a static site on GitHub Pages without a build step or external
libraries.

## Play locally

Open `index.html` in a modern browser, or serve this folder with any static
file server.

## Controls

- Click the game to capture the mouse; move the mouse to look around
- `W` / `A` / `S` / `D`: move; `Space`: jump
- Aim at a nearby block and left-click: mine it
- Right-click an adjacent empty space: place the selected block
- `1`–`5` or click a hotbar slot: select a block
- `I`: toggle the world-coordinate and movement indicator
- `Esc`: release the mouse
- On touch devices, drag the left half to move and the right half to look;
  use the on-screen buttons to mine, place, and jump
- On touch devices, drag the left half to move and the right half to look;
  use the on-screen buttons to mine, place, and jump

The game saves the world in the current browser using local storage. That save
is local to the device and browser; it is not shared or synchronized between
students.

## Multiplayer development

See [ROADMAP.md](./ROADMAP.md) for the proposed multiplayer architecture,
phases, and completion criteria.

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select the branch to publish and the
   `/(root)` folder, then save.
4. Open the Pages URL shown in the settings after deployment completes.

Because the game is a static site with relative asset paths, it works from a
GitHub Pages project URL as well as from the repository root.
