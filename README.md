# Moneycraft

Moneycraft is a small, original first-person 3D block-building game that runs
in a web browser. It uses WebGL with plain HTML, CSS, and JavaScript, so it can
be hosted as a static site on GitHub Pages without a build step or external
libraries.

World generation, block access, and versioned world snapshots are isolated in
`world-model.js`; rendering and input are handled by `game.js`.

## Product direction

Moneycraft is planned around educational multiplayer that strengthens
collaborative building and sharing, an adventure mode shaped as a roguelike
dungeon RPG with a stronger combat focus, and a separate camera-based
interactive warmup. See
[ROADMAP.md](./ROADMAP.md) for the current plan.

## Project status and work history

Start with [PROGRESS.md](./PROGRESS.md) before continuing development; it records
the current implementation state, constraints, and next steps.
[WORK_LOG.md](./WORK_LOG.md) is the append-only work history, and
[ROADMAP.md](./ROADMAP.md) tracks multiplayer phases and completion criteria.

## Play locally

Open `index.html` in a modern browser, or serve this folder with any static
file server.

Use the **建築** and **部屋管理** tabs to switch between the game and
multiplayer room controls. Invitation links open the room-management tab.
The main page groups the mob workshop, boss test arena, pose run, and camera
tests under **試作・開発ツール**. These experimental pages are publicly
accessible when the site is published; their behavior may change.

## Motion sensing and pose run

Run `node dev-server.js` and open `http://127.0.0.1:49179/motion-run.html` to try
the standalone [pose-run experience](./motion-run.html), independent of the
building and adventure game modes. HTTPS or localhost is required for camera
access. Its dedicated block course, “ひだまりの森,” follows a curving
route through grassland, a wooden bridge, a stone grove and a flower hill. The
3D course is separate from the building world's saved data. Repeated side-to-side
wrist swings move the runner forward; the detected cadence in hertz is also the
course speed multiplier, so faster swings cover the route sooner. Five gates
are spaced across the course for longer walking stretches. They use both arms
raised, either arm raised alone, and either arm horizontal with the other
raised; the T-pose is omitted from this run. Hold the requested pose for 0.7
seconds within the five-second gate window while
continuing forward. A visible success effect confirms a cleared pose. A missed
gate adds one second to the score. At 1 Hz, missing every gate takes about
1:50 including penalties; completion time varies with walking cadence.
The gate card shows an avatar demonstrating the current pose, or the next pose
while approaching a gate.
Use “全画面表示” above the course for an immersive view; the camera preview
stays in a compact panel at the lower-right of the game.
After the camera detects an upper body in the marked area, it shows “カメラ判定
OK！” and counts down 3, 2, 1, and “スタート！” before the run timer begins.
If tracking is lost during the countdown, the player must return to the frame
and the countdown starts again.
Before the countdown, the game samples a neutral standing posture for about
1.4 seconds. During the run, detected jumps animate the avatar; this upper-body
estimate is experimental and may vary with camera placement. Four low block
barriers are placed on the route; a detected jump within 0.9 seconds before
reaching a barrier clears it, otherwise the runner records a bump. The run
summary reports the number avoided and hit; hits do not add a time penalty.
At the finish, the record shows elapsed run time and estimated calories using
a 25 kg reference weight and a 3.5 MET activity assumption. This is a rough
estimate for the child-focused prototype, not a medical measurement.
Left and right refer to the player's anatomical sides, not the mirrored preview.
Pose detection uses only the centered, portrait 3:4 camera area marked in the
preview; keep one person inside this area to avoid tracking people at the sides.
The avatar preview also mirrors a limited amount of left/right body lean; it
does not estimate forward/backward lean. Jump is used experimentally for the
obstacle mechanic; sneak is not used. Browsers without WebGL use the simplified
Canvas fallback.

The first course is a built-in level made from Moneycraft's block materials.
Selecting or authoring a course from a normal or shared building world remains
a separate future feature.

The separate [motion sensor test page](./motion-test.html) is for comparing
camera setups and tuning upper-body estimates. It displays the same six arm
pose classifications as the run game, plus experimental jump and sneak
detection; those estimates are not used by the pose-run MVP. Left and right
refer to the player's anatomical sides. On both pages, camera use starts only
after an explicit button press; frames are processed in the browser and are not
stored or uploaded. The MediaPipe runtime and model are downloaded from jsDelivr
and Google Cloud Storage, so an internet connection is needed. The game and
camera test are independent of building and adventure mode.

Use the [arm-swing test](./motion-arm-swing.html) to check whether repeated
side-to-side wrist movement can act as a walking input. The live chart shows
the normalized horizontal movement of each wrist, the detector reports swing
cadence, and the avatar walks while a steady rhythm is detected. The pose-run
uses the same detector for course movement; it is not connected to building
controls.

## Avatar editor prototype

The standalone prototype is complete. The game now displays each remote player's
saved appearance using the soft-doll model. Feet placement, movement-facing
direction and overhead names follow the existing player state; collision and
first-person building controls are unchanged. Your own third-person avatar now
walks and runs with actual ground travel, eases to rest on stopping or pushing
against a wall, and tilts its head with vertical look direction.
Backward travel reverses the gait; sideways and diagonal travel keep the body's
existing facing direction. Sprint increases cadence and swing.
Jump ascent draws the legs forward slightly; falling releases the legs and
spreads the arms. Flight uses a wider, stable arm spread with a modest backward
arm sweep while travelling; hover, ascent and descent all retain the flight
pose. Air poses blend smoothly with the fading ground gait and ease back into
walking or rest on landing, without camera bob or a physical crouch.
Walking up slabs or stairs does not trigger a jump pose.
Head tilt is smoothed and limited to 0.65 radians in either direction;
hair, face and head accessories follow the same joint.
The same animation rules now apply to other players. Protocol v12 adds one
`locomotion` field (`grounded`, `rising`, `falling`, or `flying`) to the existing
100ms position packets; joint angles, vertices and gait phase are not sent.
Remote ground gait follows interpolated travel, capped at sprint speed.
Stationary packets stop the gait even while position interpolation settles.
After 500ms without a state update, movement and air poses ease toward neutral;
the existing five-second player timeout still removes the model.
Resuming after a gap or a correction over two blocks resets the motion and
snaps the position rather than playing a fast walk. Animation does not change
collision, camera or save formats.
Foot planting/terrain IK, independent head yaw, gestures and first-person
held-block animation remain future work.
Soft-doll is the selected standard for the game. Voxel remains an atelier-only
comparison, not a saved or shared game style. See the staged integration plan in
[ROADMAP.md](./ROADMAP.md).

Open [avatar.html](./avatar.html), or follow **アバターのアトリエ**
from the game. `node dev-server.js` serves the editor at
`http://127.0.0.1:49179/avatar.html` alongside the game.

- A fixed, clothed block-style body and face; no body-size or facial editing.
- **ボクセル風 / ソフトドール風** switches the comparison preview between
  the original box model and a bevelled low-poly doll with slimmer limbs,
  mitten-like hands and a gently tapered torso. Hair, colors, clothing and
  accessories share the same choices and six-joint animation structure.
  Soft-doll arms and shoulder pivots sit closer to the torso, without separate
  projecting shoulder blocks; voxel proportions and pivots remain unchanged.
  The comparison style is not saved and resets to voxel on reload; changing it
  does not alter appearance choices or mark a saved appearance as edited.
- Eight hair choices (including none): short, bob, crop, long, ponytail, twintails
  and buns, with eleven hair colors. All hairstyles are available to everyone.
  Three clothing patterns and four accessory
  choices (including none), with finite palettes for skin, hair, clothing and accents.
  Accessories occupy one slot. There are no text, image-upload, free-paint or
  arbitrary-geometry inputs.
- Drag the WebGL preview to rotate it, or use keyboard-accessible rotation,
  elevation and zoom sliders. **正面から見る** resets the view only.
- **動きをためす** offers in-place walking, a one-arm greeting wave and
  left/right/up/down head movement. Pause/resume freezes the current pose;
  **静止姿勢に戻す** resets it. Motions start only when selected, are not saved
  with appearance, and pause when the page becomes hidden (resume explicitly).
  Hair, eyes, glasses and caps follow the head; scarves follow the torso.
  These are rigid-joint previews in either style, not hair physics or collision-aware animation.
- **この姿を保存** explicitly writes validated, versioned choices to
  `moneycraft-avatar-prototype-v1` in this browser. Changes are not autosaved.
  **保存した姿に戻す** discards the draft; **初期の組合せに戻す** changes
  the draft without overwriting the saved appearance.
- The game reads only explicitly saved choices on entry and refreshes them on
  focus, page return or a cross-tab storage change. Unsaved drafts and comparison
  styles are never shared. Missing saves use the default; invalid or unavailable
  storage reports default use without overwriting the old data.
  The same saved choices are available to your own third-person avatar offline,
  without joining a room.
- Protocol **v12** sends `player-appearance` on entry or a saved change, not with
  every position packet. The Worker uses the same finite-ID, exact-key v1
  validator as the editor. Accepted appearances live in connection attachments,
  appear in welcome/roster messages for late joiners, and survive Worker
  hibernation. Rejoining sends the browser's saved choices again. They are not
  stored in world snapshots or backups. Appearance updates share the existing
  20-per-second player-message limit with positions; malformed data is rejected.
  Custom meshes rebuild only when choices change and are released with their
  remote-player state. Names follow the chosen hair/headwear height.
  Cosmetic-unlock permissions remain future work.
  Additional accessories are planned as in-game unlocks; the basic skin editor
  remains bounded rather than adding arbitrary customization.

The bounded appearance schema and model geometry live in `avatar-model.js`;
`avatar-editor.js` owns the independent UI, local persistence and preview renderer.
Run its focused checks with `node --test avatar.test.js`.

## Mob editor development tool

For entity/combat integration, see the Japanese
[mob handoff document](./MOB_HANDOFF.md), including API contracts, animation/root-motion
boundaries, the fixed test arena, gameplay intent and next implementation steps.

Open [mob.html](./mob.html), or follow **モブ工房（開発ツール）** from the game.
The default is a quadruped dragon. Its torso, hips, four legs, neck, head, jaw
and tail use shared skeleton anchors. Each wing starts behind the forelegs and
has two connected arm segments with an elbow joint; a large diamond-shaped
panel spans from the back to the elbow and wing tip on each side. The biped
remains an alternate prototype.
The wing-arm segments are 50% longer than the previous preview; the tail-side
length of each membrane is reduced by 30%, with the panel joints following the
extended arms. The wing roots are shifted 30% of the way from their former
position toward the neck along the body axis.
Use **歩行をためす** to preview a simple gait, gentle head-and-neck nod timed
to the steps, wing flap, and tail sway, or **威嚇をためす** for a slow jaw-opening
and head-lifting display; pause holds the current pose, and **静止姿勢に戻す**
resets it. Animation is preview only and is not included in exported definitions
or connected to game behavior.
In enemy mode, **ブレス姿勢（敵のみ）** previews a three-second, one-shot motion:
spread the front feet while keeping their soles planted, lean the body forward/down,
lower the neck into a deeper stance while keeping the face level and aimed forward,
absorb small backward recoil pulses during
the hold, then return to rest. Legs blend into the body lean while ankles/soles remain
planted. Biped prototypes spread their arms while keeping both feet still.
Only the dragon's articulated jaw opens; other face packages retain their fixed mouths.
Pause/resume and resetting work as before; switching to pet/baby cancels this attack.
This is motion only: no emitted breath, hitboxes, damage, or game combat integration.
**踏みつけ（敵のみ）** is another three-second, one-shot preview: rear up on
planted back feet, hold briefly, swing both front feet down faster, absorb the landing
with a body dip, then return to rest. Supporting legs blend into the body motion while
their feet stay fixed. Wings lift slightly and the tail balances without tipping into
the ground. Biped prototypes raise and slam their arms while both feet stay planted.
The neck and head counter the body's tilt at their joints, keeping the face aimed
slightly down toward the forward strike rather than up during rearing. The neck's
share of the bend is reduced for short necks or large heads; the head joint supplies
the remaining pitch to maintain clearance from the body.
During the downswing, the gaze lowers toward the feet, stays down through contact
and compression, then returns forward as the body recovers.
It shares pause/resume, reset, enemy-only restrictions, and the same motion-only boundary.
**尻尾薙ぎ払い（敵のみ）** previews a three-second charge → full turn → recovery.
The mob lowers its body and spreads the front feet, winds up slightly opposite the
turn, then pivots through 360 degrees around the front support line. Feet turn with
the body while staying at ground height (this prototype does not use footstep IK).
The gaze leads the turn at the neck/head joints, and the tail bends from windup
to follow-through before returning to rest. The same pause/reset and enemy-only
motion-only boundary applies; no attack hitboxes or damage are added.
**翼で後退・着地** and **翼で後退・滞空** are three-second enemy previews requiring
wings. The wings lift in a large windup, fan forward, then the mob lifts its feet
and retreats backward. The landing variant settles at the rear position and holds;
the hover variant smoothly transitions into a 1.5-second looping flight posture.
The body tilts about 45 degrees, the neck bends forward and the head looks firmly down
toward the ground. Large wing beats drive body bobbing and tail movement;
rear legs tilt toward the tail at their roots in proportion to body pitch;
front legs and biped arms retain their earlier angle relative to the body.
Reset returns to the original
position; replay starts the same motion again. Other existing attacks start from
their original grounded pose, not from the hover endpoint.
Changing to pet/baby or removing wings cancels the retreat. Shape edits preserve
a paused/held endpoint if wings remain. Enemy framing reserves room for the flight
path, keeping the camera stable during movement. No collision, hitboxes, or flight
physics are simulated. Hover supports pause/resume and is static with reduced-motion
preferences. Editing the shape preserves the current flight phase. The endpoint at
`createMesh(definition, 1, "wing-retreat-hover", "enemy")` exactly matches
`createMesh(definition, 0, "hover", "enemy")`; hover phase 0 and 1 also match.
**空中突進・着地（大技）** connects hover to a 3.6-second windup → folded-wing
forward dive → landing → low, decelerating ground slide → recovery. The gaze follows the forward/downward
strike, then returns ahead after absorbing the landing. Selecting it on the ground
first plays the wing retreat; selecting it while hovering captures the current wing
beat so the first vertex positions match without a jump. The landed position is held
1.2 model units plus half the torso length ahead of the original position.
After contact, the feet and claws drag along the ground while the body stays compressed;
the mob rises only after sliding stops. Slide distance follows the configured torso length.
Pause/resume, reset, shape edits and
enemy/wing restrictions also apply. This remains motion only, without attack effects,
collision, hitboxes, damage or flight physics.
`createMesh(definition, phase, "aerial-charge", "enemy", startHoverPhase = 0)` accepts
the captured hover phase (0–1) as its optional fifth argument.
### Fixed boss test arena (development tool)

Open `./index.html?boss-test=1` from **試作・開発ツール** on the game page.
The existing game renderer and player controls show one enemy-size mob in an
enclosed 64×64 test area with a half-block step and a trench. The mob follows
the player, walks over the step and stops at unsupported terrain or walls. It
also telegraphs a stomp that can be dodged; a hit causes no damage. Use
**モブを1体配置／再配置** or **モブを取り除く** to check its lifecycle and
rendering; **観察位置へ戻る** resets only the observer. Block placement and
destruction are disabled. The arena never loads or saves the normal solo world
and does not connect to rooms, even with a room invitation URL. Return to the
normal game to resume building. This remains an integration prototype: health,
damage, foot IK, mob-player collision, aura and persistence are not implemented.

Face families are separate sculpting packages with their own controls. The
dragon keeps its hinged jaw, teeth, side-facing eyes, horns, and head styles.
The griffin has a feather-covered head and neck, with only its angled eyes and
tapered raptor-style hooked beak exposed. Its feathers use the belly palette;
cheek tufts or a crest can be added over the basic plumage. The lion/chimera has forward-facing
eyes, a taller face, round/pointed/long ears, a voluminous mane, and exposed
saber-style fangs; the horse has an elongated, tapered face ending in a short
muzzle, a non-articulated jaw, and ears. Its mane runs from the back of the head
down the neck to the start of the back, with short, standard, and long lengths
(the existing JSON IDs `short`, `crest`, and `flowing` are retained).
The horse muzzle is fixed rather than configurable. The standard mane is unchanged;
the long mane is 60% longer and the short mane is 50% shorter in protruding length.
The deep-sea creature has large solid-color eyes without white pupils or sockets.
Its mouth options include two rows of pointed fish-inspired teeth and an octopus
face with a raised mantle and six curling tentacles. Mouths combine independently
with eye stalks, multiple eyes, regular gills, or giant fan-shaped gills colored
with the body, belly, and accent palettes. These are playful fantasy designs,
not anatomical reproductions. Only the dragon uses the jaw-opening threat animation.
Bounded size sliders, palettes, a WebGL preview, and versioned JSON
import/export are included. **ランダムに造形** samples the face family, all part
choices, palettes, and sizes (60%–140% in 10% steps), updating the preview,
editing controls, and JSON together without changing the camera or animation.
Version 1 through 6 definitions are upgraded to version 7 on import,
discarding the retired horse muzzle choice after validation. The
editor also previews adult pets, babies (50% body, 70% head, 85% eyes), and giant enemies
(1.5 square blocks of contact area per foot) next to a same-scale avatar.
Enemy mode emits 3D black-flame particles with purple edges from the mob's body,
head, limbs, tail, and wing arms (no additional libraries or textures).
Emission points follow the animated mesh. Particles rise, shrink, and fade;
depth testing hides particles behind the body, while nearer particles overlap it.
The aura continues when the pose is paused, stops rendering while the page is hidden,
and becomes static with reduced-motion preferences. Stage selection is preview-only and
does not change the exported definition. Enemies returning to eggs, hatching,
and raising pets are planned lifecycle mechanics, not implemented gameplay.
**輪郭線・グロー** provides independent toggles, colors, outline width/opacity,
and glow radius/strength for every stage. Dark, fire, lightning, and ice presets
change the outline, glow, and particle colors together. Particles have their own
toggle, body/rim colors, and opacity; the workshop still shows them only for enemies.
Settings are preview-only
and are not included in model JSON. The same screen-space silhouette mask follows
the camera and animated pose, excludes the comparison avatar and internal part edges,
and measures widths in CSS pixels rather than world units.
The reusable `MoneycraftModelEffects` API combines all three layers. Load
`silhouette-effect.js` before `model-effects.js`. It has no dependency on mob/avatar
definitions, DOM controls, animation loops, or lifecycle stages.

```js
const effects = MoneycraftModelEffects;
const settings = { ...effects.defaults, ...effects.presets.fire };
const emitters = effects.createEmitters(mesh, 320); // non-indexed XYZ triangles
const renderer = effects.createRenderer(gl);
// Every frame, after clearing the default framebuffer:
renderer.draw({
  width, height, pixelRatio, settings,
  mesh: animatedMesh, emitters, seconds, sizeScale: 1,
  viewProjection, pixelsPerUnit,
  drawMask,   // bind your model shader/attributes; draw only the target with opaque alpha
  drawOpaque, // rebind your shader/attributes; draw the target and other opaque geometry
});
// When the renderer is no longer needed:
renderer.dispose();
```

`createEmitters(mesh, count, selectTriangle)` samples surfaces by triangle area.
The optional selector receives `(firstVertexIndex, mesh)`; parts are not required.
Keep vertex order/topology stable during animation, rebuilding emitters after geometry
changes. `createParticles(mesh, emitters, seconds, sizeScale)` is deterministic and
follows the current animated surface, rather than retaining historical launch positions.
The mesh must contain finite `positions` as an Array or Float32Array in world space.
`viewProjection` is a column-major world-to-clip 4×4 matrix (OpenGL depth convention).
`pixelsPerUnit` is the projected particle diameter in framebuffer pixels per world unit
at clip W=1; perspective scales it by 1/W. `pixelRatio` keeps outline/glow widths in CSS px.

The renderer handles silhouette → opaque geometry → depth-tested, back-to-front
particles. It returns to the default framebuffer with depth test/write enabled and
blending disabled; rebind program/attributes before subsequent draws. Settings are
validated with `validate(settings)`; each layer can be disabled independently.
The caller owns scheduling, reduced-motion timing, clearing, and stage restrictions.
The workshop retains the mob-specific emitter selector through its existing aura helpers.
The lower-level silhouette helper remains available. Particle shape/motion is currently
a rising flame; lightning/ice presets change colors, not discharge/snow behavior.
The
editor does not save to the avatar profile or connect mob definitions to world
spawning, behavior, persistence, or multiplayer yet.
`node dev-server.js` serves the page at `http://127.0.0.1:49179/mob.html`.
Run its schema and geometry checks with `node --test mob.test.js`.
Include effect checks with `node --test mob.test.js silhouette-effect.test.js model-effects.test.js`.

## Controls

- `V` or the **視点** button cycles first person, rear third person and front
  third person (selfie view). Third person is **view-only**: movement, looking,
  jumping and flight work, but mining, placement and eyedropper do not.
  Switching stops held building actions; the crosshair, target outline, held
  block and touch building buttons are hidden. Movement remains body-relative
  even in front view. The camera mode is local-only, starts in first person on
  reload, and is not included in saves or network state.
  Third-person cameras follow at up to four blocks from the eye-height anchor.
  A padded sweep against actual block boxes (including glass, slabs and stairs)
  brings the camera inward at obstructions and world edges; very close cameras
  temporarily hide your model. Your avatar uses the same soft-doll geometry as
  other players and renders before translucent terrain.
- Click the game to capture the mouse; move the mouse to look around
- `W` / `A` / `S` / `D`: move; `Space`: jump
- Double-tap `W` within 300 ms to sprint until releasing `W`, or hold `F` + `W`.
  Sprint is 1.5x horizontal speed, including in flight; vertical flight speed is
  unchanged. Releasing `F` ends modifier-based sprint. Touch-only sprint is not
  implemented.
- Horizontal movement follows yaw only: looking up or down does not reduce
  walking or flight speed, including touch movement.
- Press jump twice within 300 ms to toggle flight. While flying, hold
  `Space` to ascend or `Shift` to descend; release to hover. Walls and
  ceilings still block movement, and feet cannot rise above world height + 10.
- Aim at a nearby block and left-click: mine it
- Right-click an adjacent empty space: place the selected block
- The main hand shows the confirmed block at the lower right, using its actual
  texture and shape (including slabs, stairs and translucent windows). Picker
  candidates do not change it until confirmed. The display is local only.
- Middle-click while the mouse is captured, press `Q`, or use the touch
  **スポイト** button to select the block under the crosshair within building
  reach. This switches to its category and remembers the selection without
  editing the world. It copies material only, not orientation, slab half or stair
  corner shape; placement still derives those from the new hit and neighbors.
  The picker disables eyedropping, and empty space leaves the selection unchanged.
- Wood logs align their long axis with the face you place them against.
- Hold the left or right mouse button while the pointer is locked to repeat mining or placement; on touch devices, hold the on-screen mine or place button
- A thin gold outline marks the block currently under the crosshair
- `1`–`6` select categories: nature/terrain, basic building materials, stairs,
  slabs, windows/glass and colored blocks. Each category recalls its last
  confirmed block. `7`–`9` are currently unassigned, rather than material shortcuts.
- Press `R` to open the current category's block picker. Use the wheel or
  up/down arrows to preview candidates; `R` or `Enter` confirms, and `Esc`
  cancels. Clicking/tapping a candidate confirms it immediately. Explicit
  confirm/cancel buttons are also available.
- Click/tap a category to recall its block; tap the active category again, or
  use **建材を選ぶ · R**, to open the picker. The category bar shows the category
  names and their remembered blocks and wraps on narrow screens.
- While the picker is closed, the wheel cycles categories over the selector,
  or over the game when the mouse is captured. While open, it cycles candidates.
  Movement/look, jumping and building inputs stop during selection; gravity and
  shared-world updates continue. Leaving the page, releasing mouse capture or
  changing rooms cancels unconfirmed selection and clears held input.
- Confirmed category choices are stored separately from worlds in this browser,
  including across room changes and page reloads. Storage errors are displayed;
  block IDs, world saves and the shared protocol are unchanged by this UI.
- Block mining, placement, and ambient bird sounds are muted by default. Use the sound toggle and volume slider in the game toolbar to opt in; settings are saved in this browser.
- `I`: toggle the world-coordinate and movement indicator, including FPS, frame-time p95, render submission time, chunk count, draw calls, and triangles. These diagnostics stay in this browser and are not uploaded. Render submission time measures JavaScript/WebGL command submission, not GPU execution.
- `Esc`: cancel an open picker; otherwise release the mouse. The browser may
  also release captured input or leave native fullscreen when handling `Esc`.
- On touch devices, drag the left half to move and the right half to look;
  a virtual pad stays visible while idle. Use the on-screen buttons to mine,
  place, and jump. Double-tap jump to toggle flight; hold the ascent or descent
  button to change height. Releasing a touch or leaving the page clears held input.
- Use the fullscreen button to show just the game, controls, and hotbar.
  Exit with the same button or `Esc`. Browsers without element fullscreen
  support use a page-filling layout instead (browser chrome may remain).

All seventeen blocks have small procedural pixel textures. Planks, bricks, a white
wall, and a translucent window are available alongside the original
five materials. Six solid colored walls (red, blue, yellow, green, purple, and
black) provide decoration without changing cube collision. Window frames are
opaque and the glass is translucent, but the whole window remains a solid,
targetable cube. Existing windows gain this appearance when loaded; their ID,
orientation, collision and saved data do not change.

Opaque terrain and players render before translucent faces. Window faces are
sorted back-to-front across chunks using face-center view depth, with depth
testing enabled and depth writes disabled. Shared window faces are removed;
opaque surfaces visible through glass are retained. Stationary views reuse
the sorted buffers. This is conventional face sorting, not order-independent
transparency; complex overlapping arrangements may still expose sorting
artifacts. Water, reflection, refraction, tinted glass and cutout leaves are
outside this first implementation.

Plank slabs occupy either half of a cell. Select category `4` for slabs.
Placing on a top face
creates a lower slab, and placing underneath creates an upper slab. On a side
face, aiming at its upper half selects an upper slab (the midpoint counts as
upper); aiming below the midpoint selects a lower slab.
Its visible surfaces, targeting outline, collision and landing height use the
same oriented box bounds. Rays pass through the empty half, and adjoining blocks
only hide the surface area they actually cover.

With the slab selected, placing on a lower slab's exposed top or an upper slab's
exposed bottom fills the same cell. A complementary slab in the adjacent target
cell also merges. Two halves become a normal plank block (ID 6), mined as one
block; they cannot be split afterward. Matching halves do not overwrite each
other. Merges are rejected if the completed cube would overlap a player.
Shared merges compare both the original slab ID and its orientation, and wait
for server confirmation before changing the local world.

Straight plank stairs (ID 17) combine a lower half-block with a half-depth upper
step. Select category `3`; the ascending direction follows your horizontal
facing when placing them, in four cardinal directions. Like slabs, stairs placed
underneath a block or against the upper half of a side face are upside-down;
top faces and the lower half of a side face produce upright stairs.
Upside-down stairs have a full upper half and a half-depth lower step, keeping
the same horizontal facing. Their mesh, targeting,
outline, support height and client/server collision use the oriented solid
shape, not its enclosing cube. Hidden internal surfaces are removed.

Stairs automatically form inner and outer corners when perpendicular stairs of
the same upright/upside-down type meet at the same cell height. A perpendicular
stair ahead creates an outer corner; one behind creates an inner corner.
A same-facing side continuation preserves a straight run, and an eligible outer
corner takes precedence over an inner corner. Upright and upside-down stairs do
not join each other.

Corner shapes are derived from neighboring IDs and orientations, not saved as
extra state or sent as secondary edits. Placement order does not affect the
result. Placement, mining, loading and shared updates immediately recompute the
shape, including across chunk boundaries. Existing connected stairs also gain
corners when loaded. Rendering, the targeting contour, rays, support, ceilings
and collision use the same derived boxes.
An edit is rejected if its new solid volume would overlap a player, including
when mining one stair would expand a neighboring corner. Shared edits check all
players before committing; the solo client checks its own player.

While grounded, walking automatically climbs steps up to half a block high,
including slabs and the half-height rise from a slab onto a full cube. The body
must have clearance both while lifting and at the destination. Full-block-high
walls still require jumping; step-up is disabled while airborne or flying.
Descending uses normal gravity. This intentionally replaces the previous
jump-required slab behavior.

Step-up keeps physical collision and network positions immediate, while the
local camera follows the rise smoothly (about 0.15-0.2 seconds to settle most
of a half-step). This uses time-based interpolation, not blur. Targeting and
transparent-face sorting use the same camera position. Spawn, room transitions
and flight toggles clear the visual offset; normal descent still uses gravity.

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
The multiplayer prototype supports up to sixteen participants and sends player
position and facing direction 10 times per second. Room worlds are generated
from a common seed and stored in Durable Object storage. Joining or rejoining
loads the latest full snapshot; mining and placement are persisted before
being broadcast to everyone, including the editor. Conflicting edits use
server processing order and compare the expected block before applying.
Clients request a fresh snapshot on revision gaps, conflicts, or edit timeouts.
Only edited chunks and their affected neighbors are rebuilt.

Each room is a persistent work. Owners can give it a name, create up to ten
named backups, and restore one after confirming that participants' worlds will
be replaced. A restore first saves the current live world as a recovery backup
and broadcasts the restored snapshot to connected participants. At the ten
backup limit, the UI warns before the oldest backup is removed. **End class**
disconnects everyone but preserves the room, work, and backups for later use
with the same room code. **Permanently delete** is a separate owner-only action
that requires typing the work name and removes the live work and every backup.
Leaving a room still exits only the current participant.

The sixteen-player Worker and matching client were published on 2026-11-02.
Reload participating browsers to receive the updated client;
the protocol version and existing worlds remain unchanged.
Server tests cover sixteen admissions, rejection of a
seventeenth, position/edit broadcasts, and replacement after a disconnect.
Real-device performance with sixteen simultaneous players remains unverified.

Room details include an invitation QR code and a link. Scan the QR with a
tablet's standard camera to open the game with the room code filled in, then
press Join. No automatic connection is made. Invitation URLs contain only
`?room=ABCDEF`, never owner credentials or other query parameters. QR images
are generated locally; no external QR service receives the room code.
Anyone with the invitation can join while the room remains open.
The QR is outside the game's fullscreen view; exit fullscreen to show it.
Local development URLs refer to localhost and cannot invite another device.

Touch controls, fullscreen, flight, and QR invitations were published on
2026-11-02. Reload participating browsers to receive the updated client;
no Worker or protocol update is required for these features. Tablet camera
and normal gameplay checks on actual devices remain recommended.

The server validates block IDs, coordinates, reach, and placements overlapping
participants. Edits are limited to 10 per second per participant; position
messages to 20 per second; snapshot requests to two per second. Coordinates
are checked against each room's actual size, not a global 40-square limit.
New room snapshots are stored as metadata plus 8,192-cell binary parts, each
well below the per-value storage limit. Block edits atomically update one part
and its revision; older single-value snapshots migrate without altering their
buildings on the next accepted edit. Missing or corrupt parts fail explicitly
instead of regenerating the terrain. Works and backups survive disconnects,
class end, and Worker restarts until the owner permanently deletes the work.
Keep the room code to resume; no export or automatic room expiry is implemented.

## Teacher recovery email

The local implementation supports verified teacher email registration and
one-time owner recovery links. Recovery tokens are stored as hashes in the
room Durable Object and expire after 15 minutes. A room can request one
verification or recovery email per minute. Cross-room limits cap requests at
10 per source per hour and 3 per recipient per hour; only keyed hashes, not
the raw source IP or email address, are stored in the rate-limit object. Room
codes alone do not grant owner privileges.

The production Worker forwards signed email requests to Google Apps Script.
To configure a new environment:

1. Create or open the Apps Script project and add the source from
   [`gas/recovery-mailer.gs`](./gas/recovery-mailer.gs).
2. In **Project Settings → Script properties**, add
   `RECOVERY_HMAC_SECRET` with a randomly generated secret of at least 32
   characters. Do not put it in source control or send it in chat.
3. Deploy as a web app that executes as the owner. If the deployment must
   accept requests from anyone, the HMAC verification in `doPost` is mandatory;
   the URL alone is not authorization. Authorize only the mail-sending scope.
4. Add the web app `/exec` URL and the exact same secret to the Cloudflare
   Worker secrets `RECOVERY_MAILER_URL` and `RECOVERY_MAILER_HMAC_SECRET`.
   Set Worker secrets through Wrangler's interactive secret prompts, never in
   `wrangler.jsonc`.
5. Test the deployment and mail delivery only after reviewing the recipient,
   sender identity, Google sending limits, and deployment access settings.

The Worker signs each request with HMAC-SHA-256. GAS checks a five-minute
timestamp window, a one-time nonce, and an idempotency request ID; Worker retries
once with a new nonce and the same request ID. In case the mail service accepts
an email but GAS stops before saving the result, the same link may arrive twice.
Opening a link does not consume it automatically; the page asks the user to
confirm first to avoid mail-security scanners consuming one-time links.
No DNS or MX change is required. This repository does not contain deployment
secrets, and no mail is sent by the test suite.

Run the focused tests with
`node --test world-model.test.js game.test.js avatar.test.js multiplayer.test.js src/protocol.test.js src/room.test.js src/worker.test.js src/recovery-mailer.test.js`.

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

The 2026-11-04 third-person and animation-sharing release uses protocol **v12**.
It replaces the earlier v11 avatar-sharing release. The v12 Worker is deployed
before the matching GitHub Pages client; reload all participants to use it.
Protocol v11 and v12 clients cannot share a session. World snapshot format v2
and atelier appearance v1 remain unchanged.
Publish the matching Worker before the static client, then reload all
participants; v11 and v12 clients cannot share a session. Do not publish just
one side of the change. Older attached position states are explicitly discarded
with a Worker warning and appear as unknown until a valid v12 update arrives.
World snapshot format v2 and the existing atelier appearance v1 remain unchanged.

The cooperative-building release is published on GitHub Pages and the Worker
as of 2026-11-01. Production checks confirmed shared edits, conflict rejection,
late-join snapshots, and owner closure. Browser checks used direct gameplay
events, not a full normal mouse-input session. Before class, verify normal
movement, aiming, mining, and placement from two actual devices.

The expanded forest/grassland release uses protocol **v3** and was published
to both the Worker and GitHub Pages on 2026-11-01. Reload browser tabs to use
it. New rooms use 64-square worlds; existing rooms remain 40-square.
Production checks verified the flat/tree-free grassland, editing at the new
edge, late-join restoration, and preservation of an existing local 40-square
save when entering and leaving a new 64-square room.

Colored walls and the matching protocol **v4** client and Worker were published
on 2026-11-03. The protocol **v10** release adds a common set of 24
orthogonal block rotations, stores orientation in world snapshot format v2,
and synchronizes it with protocol **v10**, including upper/lower plank slabs
(block ID 16) and straight plank stairs (ID 17). Existing version-one saves and rooms
load with their original default orientation. Logs choose a vertical or
horizontal axis from the face being placed against; lower slabs use orientation
zero and upper slabs use orientation 20. Old lower slabs remain unchanged.
Stairs accept four upright orientations (0-3) and four upside-down orientations
(20-23); sideways stairs remain invalid. Existing upright stairs are unchanged. The world
format stays at v2, including the orientation, slab and automatic stair-corner updates. These
updates, translucent windows, smoother stepping, sprint and the category-based
block picker were published on 2026-11-03 with the matching v10 Worker and
GitHub Pages client (release commit `50defd5`). Production asset hashes and the
Pages deployment were verified, along with category selection and Worker health
from the production browser.
Deploy the Worker first, then the matching static client, and reload all
participating browsers. Older protocol clients cannot exchange gameplay
messages with the new Worker.

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select the branch to publish and the
   `/(root)` folder, then save.
4. Open the Pages URL shown in the settings after deployment completes.

Because the game is a static site with relative asset paths, it works from a
GitHub Pages project URL as well as from the repository root.

## Third-party code

QR generation uses the unmodified `qrcode-generator` 2.0.4 distribution in
[`vendor/qrcode.js`](./vendor/qrcode.js), by Kazuhiko Arase, under the
[MIT license](./vendor/qrcode.LICENSE).
Source: <https://github.com/kazuhikoarase/qrcode-generator>.
No runtime CDN or package installation is required to play.
