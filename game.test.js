"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function createGame({
  legacySave = false, roomOptions = { width: 40, depth: 40, height: 20 },
  fullscreen = "unsupported", audioAvailable = true, audioSettings = null,
  recordUvs = false, recordGeometry = false, recordRendering = false, soloWorld = null,
  selectionSettings = null, selectionReadFailure = false, selectionWriteFailure = false,
  expectedInitializationErrors = 0,
} = {}) {
  const uploads = [];
  const errors = [];
  const soundEvents = [];
  const texturePixels = [];
  const previews = [];
  const textureUploads = [];
  const uvUploads = [];
  const positionUploads = [];
  const outlineUploads = [];
  const renderEvents = [];
  const heldRenderEvents = [];
  const viewMatrices = [];
  let heldPass = false;
  let viewMatrix;
  const bufferContents = new Map();
  const attributes = new Map();
  let boundBuffer;
  let blending = false;
  let depthWrite = true;
  let textured = false;
  let blendFactors;
  const context2d = {
    fillRect: (x, y) => texturePixels.push({ x, y, color: context2d.fillStyle }),
    drawImage: (...args) => previews.push(args),
  };
  const drawCalls = [];
  const gl = new Proxy({
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    createTexture: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: (_, name) => ["aPosition", "aColor", "aUv"].indexOf(name),
    getUniformLocation: (_, name) => name,
    uniform1i: (name, value) => { if (name === "uTextured") textured = Boolean(value); },
    clear: (mask) => { heldPass = mask === 256; },
    uniformMatrix4fv: (_, transpose, matrix) => {
      viewMatrix = Array.from(matrix);
      if (recordRendering && !heldPass) viewMatrices.push(viewMatrix);
    },
    bindBuffer: (_, buffer) => { boundBuffer = buffer; },
    vertexAttribPointer: (attribute) => attributes.set(attribute, boundBuffer),
    enable: (capability) => { if (capability === 3042) blending = true; },
    disable: (capability) => { if (capability === 3042) blending = false; },
    depthMask: (value) => { depthWrite = value; },
    blendFuncSeparate: (...factors) => { blendFactors = factors; },
    bufferData: (_, data, usage) => {
      uploads.push(data.length);
      if (recordRendering) bufferContents.set(boundBuffer, Array.from(data));
      if (recordUvs && uploads.length % 3 === 0) uvUploads.push(data);
      if (recordGeometry && usage === 35044 && uploads.length % 3 === 1) positionUploads.push(data);
      if (recordGeometry && usage === 35048 && data.length === 72) outlineUploads.push(data);
    },
    texImage2D: (...args) => textureUploads.push(args.at(-1)),
    drawArrays: (...args) => {
      drawCalls.push(args);
      if (recordRendering) (heldPass ? heldRenderEvents : renderEvents).push({
        mode: args[0], count: args[2], blending, depthWrite, textured, blendFactors,
        positions: bufferContents.get(attributes.get(0)),
        uvs: bufferContents.get(attributes.get(2)), matrix: viewMatrix,
      });
    },
    TRIANGLES: 4,
    LINES: 1,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,
    BLEND: 3042,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    ONE: 1,
    DEPTH_BUFFER_BIT: 256,
    COLOR_BUFFER_BIT: 16384,
  }, { get: (target, name) => target[name] ?? (() => {}) });
  class Element extends EventTarget {
    children = [];
    dataset = {};
    attributes = new Map();
    textContent = "";
    disabled = false;
    hidden = false;
    width = 960;
    height = 540;
    clientWidth = 960;
    clientHeight = 540;
    classes = new Set();
    classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
    style = { setProperty(name, value) { this[name] = value; } };
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; }
    setPointerCapture() {}
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    contains(element) { return this === element || this.children.some((child) => child.contains(element)); }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
    getContext(type) { return type === "webgl" ? gl : context2d; }
    remove() {}
  }
  const elements = new Map();
  const document = new EventTarget();
  document.querySelector = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  document.querySelector("#debug-indicator").hidden = true;
  document.querySelector("#block-picker").append(document.querySelector("#block-options"),
    document.querySelector("#confirm-block-picker"), document.querySelector("#cancel-block-picker"));
  document.createElement = () => new Element();
  document.body = new Element();
  if (fullscreen !== "unsupported") {
    document.querySelector(".game-card").requestFullscreen = async () => {
      if (fullscreen === "rejected") throw new Error("Fullscreen denied");
      document.fullscreenElement = document.querySelector(".game-card");
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    document.exitFullscreen = async () => {
      document.fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
  }
  const window = new EventTarget();
  const timers = new Map();
  let nextTimer = 0;
  let frame;
  let time = 0;
  const intervals = [];
  Object.assign(window, {
    setTimeout: (callback, delay = 0) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback) => intervals.push(callback),
    requestAnimationFrame: (callback) => { frame = callback; },
    confirm: () => true,
  });
  const saved = new Map();
  if (selectionSettings !== null) saved.set("moneycraft-block-selection-v1",
    typeof selectionSettings === "string" ? selectionSettings : JSON.stringify(selectionSettings));
  if (audioSettings) saved.set("moneycraft-audio-settings-v1", JSON.stringify(audioSettings));
  class AudioContextMock {
    state = "suspended";
    currentTime = 0;
    destination = {};
    createOscillator() {
      return {
        frequency: {
          setValueAtTime: (value) => soundEvents.push(["frequency", value]),
          exponentialRampToValueAtTime: (value) => soundEvents.push(["frequency-ramp", value]),
        },
        connect() {},
        start: () => soundEvents.push(["start"]),
        stop: () => soundEvents.push(["stop"]),
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: (value) => soundEvents.push(["gain", value]),
          exponentialRampToValueAtTime: (value) => soundEvents.push(["gain-ramp", value]),
        },
        connect() {},
      };
    }
    resume() { soundEvents.push(["resume"]); this.state = "running"; return Promise.resolve(); }
  }
  const context = {
    window, document, CustomEvent, Event, HTMLInputElement: class {}, HTMLTextAreaElement: class {},
    crypto: webcrypto, performance: { now: () => time }, console: { error: (...args) => errors.push(args), warn() {} },
    AudioContext: audioAvailable ? AudioContextMock : undefined,
    localStorage: {
      getItem: (key) => {
        if (selectionReadFailure && key === "moneycraft-block-selection-v1") throw new Error("Storage read denied");
        return saved.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (selectionWriteFailure && key === "moneycraft-block-selection-v1") throw new Error("Storage write denied");
        saved.set(key, value);
      },
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "world-model.js"), "utf8"), context);
  const worldApi = context.MoneycraftWorld;
  if (soloWorld) saved.set("moneycraft-3d-world-v2", JSON.stringify({
    world: soloWorld, x: 20.5, z: 20.5, yaw: 0,
  }));
  let originalSave;
  if (legacySave) {
    const old = worldApi.createModel({ ...worldApi.legacyOptions, seed: 123 });
    old.setBlock(38, 16, 38, 9);
    originalSave = { world: legacySave === "array" ? old.serialize().blocks : old.serialize(), x: 20.5, z: 20.5, yaw: 0 };
    saved.set("moneycraft-3d-world-v2", JSON.stringify(originalSave));
  }
  let model;
  context.MoneycraftWorld = {
    ...worldApi, createModel: (options) => { model = worldApi.createModel(options); return model; },
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "game.js"), "utf8"), context);
  assert.equal(errors.length, expectedInitializationErrors);
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(`moneycraft:${type}`, { detail }));
  const roomWorld = worldApi.createModel({ ...roomOptions, seed: 123 }).serialize();
  roomWorld.blocks.fill(0);
  for (let i = 0; i < roomWorld.width * roomWorld.depth; i += 1) roomWorld.blocks[i] = 3;
  function join(players = []) {
    emit("room-connecting", { code: "ABCD23" });
    emit("room-joined", {
      roomCode: "ABCD23", player: { id: "self" }, players, world: roomWorld, revision: 0,
    });
  }
  const change = (revision, x, y, z, block = 7, expectedBlock = 0, requestId = `edit-${revision}`, orientation = 0) => emit("block-changed", {
    revision, x, y, z, block, orientation, expectedBlock, requestId, playerId: "self",
  });
  const runTimeout = (delay) => {
    const timer = [...timers.entries()].find(([, value]) => value.delay === delay);
    if (!timer) return false;
    timers.delete(timer[0]);
    timer[1].callback();
    return true;
  };
  const selectBlock = (id) => {
    const categories = [[1, 2, 3, 4, 5], [6, 7, 8], [17], [16], [9], [10, 11, 12, 13, 14, 15]];
    input(window, "keydown", { code: `Digit${categories.findIndex((ids) => ids.includes(id)) + 1}` });
    input(window, "keydown", { code: "KeyR" });
    input(elements.get("#block-options").children[id - 1], "click");
  };
  let state;
  window.addEventListener("moneycraft:send-player-state", (event) => { state = event.detail; });
  return { get model() { return model; }, worldApi, originalSave, elements, uploads, drawCalls, saved, soundEvents,
    texturePixels, previews, textureUploads, uvUploads, positionUploads, outlineUploads, renderEvents, heldRenderEvents, viewMatrices,
    emit, join, change, selectBlock, roomWorld, window, document, timers,
    frame: (count = 1, interval = 1000 / 30) => {
      for (let i = 0; i < count; i += 1) { time += interval; frame(time); }
    },
    advance: (ms) => { time += ms; },
    runTimeout,
    state: () => { for (const callback of intervals) callback(); return state; },
    errors };
}

function input(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
  return event;
}

function pressJump(game) {
  input(game.window, "keydown", { code: "Space", repeat: false });
  input(game.window, "keyup", { code: "Space" });
}

test("main hand renders all materials with shared shapes, cropped UVs and glass blending", () => {
  const game = createGame({ recordRendering: true });
  game.join();
  for (const block of game.worldApi.blocks) {
    game.selectBlock(block.id);
    game.frame();
    const draw = game.heldRenderEvents.at(-1);
    assert.equal(draw.mode, 4);
    assert.equal(draw.textured, true);
    assert.equal(draw.blending, block.id === 9);
    assert.equal(draw.depthWrite, block.id !== 9);
    assert.ok(draw.count > 0);
    let area = 0;
    for (let offset = 0; offset < draw.positions.length; offset += 9) {
      const points = [0, 3, 6].map((start) => draw.positions.slice(offset + start, offset + start + 3));
      const a = points[1].map((value, axis) => value - points[0][axis]);
      const b = points[2].map((value, axis) => value - points[0][axis]);
      area += Math.hypot(a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
    }
    assert.equal(area, block.id === 16 ? 4 : block.id === 17 ? 5.5 : 6);
    for (let index = 0; index < draw.uvs.length; index += 2) {
      const tile = Math.floor(draw.uvs[index] * 512 / 16);
      assert.ok(block.id === 1 ? [0, 1, 17].includes(tile)
        : block.id === 4 ? [3, 18].includes(tile) : tile === block.id - 1);
      assert.ok(draw.uvs[index + 1] >= 0 && draw.uvs[index + 1] <= 1);
    }
  }
  const before = game.uploads.length;
  game.frame(2);
  assert.ok(game.uploads.length - before <= 4, "held meshes are reused, not uploaded every frame");
  assert.equal(game.renderEvents.at(-1).depthWrite, true);
  assert.equal(game.renderEvents.at(-1).blending, false);
});

test("main hand stays below and right of the crosshair within portrait and landscape viewports", () => {
  const game = createGame({ recordRendering: true });
  game.join();
  for (const [width, height] of [[960, 540], [390, 600], [768, 390]]) {
    const canvas = game.elements.get("#game");
    canvas.clientWidth = width;
    canvas.clientHeight = height;
    game.frame();
    const { positions, matrix } = game.heldRenderEvents.at(-1);
    for (let index = 0; index < positions.length; index += 3) {
      const point = positions.slice(index, index + 3);
      const clip = [0, 1, 2, 3].map((row) => matrix[12 + row]
        + point.reduce((sum, value, axis) => sum + matrix[axis * 4 + row] * value, 0));
      assert.ok(clip[0] / clip[3] > 0.2 && clip[0] / clip[3] < 1);
      assert.ok(clip[1] / clip[3] < -0.2 && clip[1] / clip[3] > -1);
      assert.ok(Math.abs(clip[2] / clip[3]) < 1);
    }
  }
  const matrix = game.heldRenderEvents.at(-1).matrix;
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 250, movementY: -200 });
  input(game.window, "keydown", { code: "KeyW" });
  game.frame(3);
  assert.deepEqual(game.heldRenderEvents.at(-1).matrix, matrix);
});

test("main hand follows confirmed selection only and restores saved category selection", () => {
  const game = createGame({ recordRendering: true });
  game.selectBlock(7);
  game.frame();
  const brick = game.heldRenderEvents.at(-1);
  input(game.window, "keydown", { code: "KeyR" });
  input(game.window, "keydown", { code: "ArrowDown" });
  game.frame();
  assert.deepEqual(game.heldRenderEvents.at(-1).uvs, brick.uvs);
  input(game.window, "keydown", { code: "Escape" });
  game.frame();
  assert.deepEqual(game.heldRenderEvents.at(-1).uvs, brick.uvs);
  input(game.window, "keydown", { code: "KeyR" });
  input(game.window, "keydown", { code: "ArrowDown" });
  input(game.window, "keydown", { code: "Enter" });
  game.frame();
  assert.notDeepEqual(game.heldRenderEvents.at(-1).uvs, brick.uvs);
  const restored = createGame({
    recordRendering: true, selectionSettings: game.saved.get("moneycraft-block-selection-v1"),
  });
  restored.frame();
  assert.deepEqual(restored.heldRenderEvents.at(-1).uvs, game.heldRenderEvents.at(-1).uvs);
});

test("eyedropper selects every material, recalls its category and never sends block edits", () => {
  for (let block = 1; block <= 17; block += 1) {
    const game = createGame({ recordRendering: true });
    const index = (2 * game.roomWorld.depth + 18) * game.roomWorld.width + 20;
    game.roomWorld.blocks[index] = block;
    game.join();
    const edits = [];
    game.window.addEventListener("moneycraft:send-block-edit", (event) => edits.push(event.detail));
    input(game.window, "keydown", { code: "KeyQ" });
    assert.equal(game.elements.get("#selected-block-name").textContent, game.worldApi.blocks[block - 1].name);
    assert.match(game.elements.get("#game-message").textContent, /スポイト/);
    const settings = JSON.parse(game.saved.get("moneycraft-block-selection-v1"));
    assert.equal(settings.selections[settings.category], block);
    input(game.window, "keydown", { code: "Digit6" });
    input(game.window, "keydown", { code: `Digit${["nature", "building", "stairs", "slabs", "glass", "colors"].indexOf(settings.category) + 1}` });
    assert.equal(game.elements.get("#selected-block-name").textContent, game.worldApi.blocks[block - 1].name);
    assert.equal(edits.length, 0);
    assert.equal(game.model.getBlock(20, 2, 18), block);
  }
});

test("middle mouse and touch eyedroppers pick only once and obey picker and pointer-lock guards", () => {
  const game = createGame();
  game.roomWorld.blocks[(2 * game.roomWorld.depth + 18) * game.roomWorld.width + 20] = 7;
  game.join();
  const canvas = game.elements.get("#game");
  input(canvas, "mousedown", { button: 1 });
  assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
  game.document.pointerLockElement = canvas;
  assert.equal(input(canvas, "mousedown", { button: 1 }).defaultPrevented, true);
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  assert.equal(input(canvas, "auxclick", { button: 1 }).defaultPrevented, true);
  game.selectBlock(3);
  input(game.elements.get("#touch-pick"), "pointerdown", { pointerId: 91, pointerType: "touch" });
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  assert.equal(game.elements.get(".game-card").classList.contains("touch-enabled"), true);
  game.selectBlock(3);
  input(game.elements.get("#touch-pick"), "click", { detail: 0 });
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  game.selectBlock(3);
  input(game.window, "keydown", { code: "KeyR" });
  for (const action of [
    () => input(game.window, "keydown", { code: "KeyQ" }),
    () => input(canvas, "mousedown", { button: 1 }),
    () => input(game.elements.get("#touch-pick"), "pointerdown", { pointerId: 92, pointerType: "touch" }),
  ]) action();
  assert.equal(game.elements.get("#selected-block-name").textContent, "石ブロック");
});

test("eyedropper ignores autorepeat and text inputs, reports misses, and stops held construction", () => {
  const game = createGame();
  game.roomWorld.blocks[(2 * game.roomWorld.depth + 18) * game.roomWorld.width + 20] = 7;
  game.join();
  input(game.window, "keydown", { code: "KeyQ", repeat: true });
  assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperties(event, {
    code: { value: "KeyQ" }, target: { value: { tagName: "SELECT" } },
  });
  game.window.dispatchEvent(event);
  assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.elements.get("#game"), "mousedown", { button: 0 });
  input(game.window, "keydown", { code: "KeyQ" });
  assert.equal(game.runTimeout(200), false);
  input(game.window, "mousemove", { movementX: 0, movementY: -500 });
  input(game.window, "keydown", { code: "KeyQ" });
  assert.match(game.elements.get("#game-message").textContent, /照準/);
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
});

test("eyedropper respects empty slab space and glass occlusion instead of selecting hidden blocks", () => {
  for (const [front, selected] of [[16, 7], [9, 9]]) {
    const game = createGame();
    const index = (2 * game.roomWorld.depth + 18) * game.roomWorld.width + 20;
    game.roomWorld.blocks[index] = front;
    game.roomWorld.blocks[index - game.roomWorld.width] = 7;
    game.join();
    game.document.pointerLockElement = game.elements.get("#game");
    input(game.window, "mousemove", { movementX: 0, movementY: (-0.12 - 0.1) / 0.0025 });
    input(game.window, "keydown", { code: "KeyQ" });
    assert.equal(game.elements.get("#selected-block-name").textContent, game.worldApi.blocks[selected - 1].name);
  }
});

test("eyedropper copies material but placement still derives log axes and slab or stair half from the new hit", () => {
  for (const block of [4, 16, 17]) {
    const game = createGame();
    const index = (2 * game.roomWorld.depth + 18) * game.roomWorld.width + 20;
    const original = block === 4 ? game.model.orientationFromNormal([1, 0, 0]) : 20;
    game.roomWorld.blocks[index] = block;
    game.roomWorld.orientations[index] = original;
    game.join();
    const canvas = game.elements.get("#game");
    game.document.pointerLockElement = canvas;
    input(game.window, "mousemove", { movementX: 0, movementY: (-0.12 - 0.2) / 0.0025 });
    input(game.window, "keydown", { code: "KeyQ" });
    assert.equal(game.elements.get("#selected-block-name").textContent, game.worldApi.blocks[block - 1].name);
    game.change(1, 20, 2, 18, 3, block);
    input(game.window, "mousemove", { movementX: 0, movementY: (0.2 + 0.2) / 0.0025 });
    let edit;
    game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
    input(canvas, "mousedown", { button: 2 });
    assert.ok(edit);
    assert.equal(edit.block, block);
    const direction = [0, Math.sin(-0.2), -Math.cos(-0.2)];
    assert.equal(edit.orientation, block === 4 ? game.model.orientationFromNormal([0, 0, 1])
      : block === 16 ? 0 : game.worldApi.orientationFromFacing(direction));
    assert.notEqual(edit.orientation, original);
  }
});

test("jump acceleration includes two successive five-percent increases while launch speed stays unchanged", () => {
  const game = createGame();
  game.join();
  game.frame(2);
  const startY = game.state().y;
  pressJump(game);
  for (let tick = 1; tick <= 5; tick += 1) {
    game.frame();
    const expectedY = startY + tick * 7.8 / 30 - 20.9475 * tick * (tick + 1) / (2 * 30 * 30);
    assert.ok(Math.abs(game.state().y - expectedY) < 0.000001);
  }
  game.frame(40);
  assert.equal(game.state().y, startY);
});

function startFlying(game) {
  pressJump(game);
  game.advance(150);
  pressJump(game);
  assert.equal(game.elements.get("#flight-status").hidden, false);
}

test("horizontal movement speed and direction ignore pitch for walking, flight and touch", () => {
  for (const flying of [false, true]) {
    for (const pitch of [-1.48, 0, 1.48]) {
      const game = createGame();
      game.join();
      if (flying) startFlying(game);
      game.document.pointerLockElement = game.elements.get("#game");
      const yaw = 0.7;
      input(game.window, "mousemove", { movementX: yaw / 0.0025, movementY: (-0.12 - pitch) / 0.0025 });
      game.frame();
      for (const [codes, forward, side] of [
        [["KeyW"], 1, 0], [["KeyS"], -1, 0], [["KeyD"], 0, 1],
        [["KeyW", "KeyD"], 1 / Math.SQRT2, 1 / Math.SQRT2],
      ]) {
        game.advance(301);
        const before = game.state();
        for (const code of codes) input(game.window, "keydown", { code });
        game.frame(10);
        for (const code of codes) input(game.window, "keyup", { code });
        const after = game.state();
        assert.ok(Math.abs(after.x - before.x - (Math.sin(yaw) * forward + Math.cos(yaw) * side) * 1.5) < 0.000001);
        assert.ok(Math.abs(after.z - before.z - (-Math.cos(yaw) * forward + Math.sin(yaw) * side) * 1.5) < 0.000001);
      }
      const before = game.state();
      const canvas = game.elements.get("#game");
      const touch = { pointerType: "touch", pointerId: 99, clientX: 70, clientY: 470 };
      input(canvas, "pointerdown", touch);
      input(canvas, "pointermove", { ...touch, clientY: 426 });
      game.frame(10);
      input(canvas, "pointerup", touch);
      assert.ok(Math.abs(game.state().x - before.x - Math.sin(yaw) * 1.5) < 0.000001);
      assert.ok(Math.abs(game.state().z - before.z + Math.cos(yaw) * 1.5) < 0.000001);
    }
  }
});

test("double-tap W sprints at 1.5x for walking and flight until W is released", () => {
  for (const flying of [false, true]) {
    const game = createGame();
    game.join();
    if (flying) startFlying(game);
    game.frame();
    input(game.window, "keydown", { code: "KeyW" });
    input(game.window, "keyup", { code: "KeyW" });
    game.advance(300);
    input(game.window, "keydown", { code: "KeyW" });
    const before = game.state();
    game.frame(10);
    assert.ok(Math.abs(before.z - game.state().z - 2.25) < 0.000001);
    input(game.window, "keyup", { code: "KeyW" });
    const stopped = game.state();
    game.frame(3);
    assert.equal(game.state().z, stopped.z);
    game.advance(301);
    input(game.window, "keydown", { code: "KeyW" });
    game.frame(10);
    assert.ok(Math.abs(stopped.z - game.state().z - 1.5) < 0.000001);
  }
});

test("holding F and W sprints in either press order, normalizes diagonals and stops on F release", () => {
  for (const order of [["KeyF", "KeyW"], ["KeyW", "KeyF"]]) {
    const game = createGame();
    game.join();
    game.frame();
    for (const code of order) input(game.window, "keydown", { code });
    input(game.window, "keydown", { code: "KeyD" });
    const start = game.state();
    game.frame(10);
    assert.ok(Math.abs(Math.hypot(game.state().x - start.x, game.state().z - start.z) - 2.25) < 0.000001);
    input(game.window, "keyup", { code: "KeyF" });
    input(game.window, "keyup", { code: "KeyD" });
    const released = game.state();
    game.frame(10);
    assert.ok(Math.abs(released.z - game.state().z - 1.5) < 0.000001);
    input(game.window, "keyup", { code: "KeyW" });
    input(game.window, "keydown", { code: "KeyF" });
    input(game.window, "keydown", { code: "KeyS" });
    const backward = game.state();
    game.frame(10);
    assert.ok(Math.abs(game.state().z - backward.z - 1.5) < 0.000001);
  }
});

test("sprint ignores late taps and autorepeat and clears with input cancellation", () => {
  for (const cancel of ["blur", "visibility", "pointerlock", "room"]) {
    const game = createGame();
    game.join();
    game.frame();
    input(game.window, "keydown", { code: "KeyW" });
    input(game.window, "keyup", { code: "KeyW" });
    game.advance(301);
    input(game.window, "keydown", { code: "KeyW" });
    input(game.window, "keydown", { code: "KeyW", repeat: true });
    const walking = game.state();
    game.frame(2);
    assert.ok(Math.abs(walking.z - game.state().z - 0.3) < 0.000001);
    input(game.window, "keyup", { code: "KeyW" });
    input(game.window, "keydown", { code: "KeyW" });
    if (cancel === "blur") input(game.window, "blur");
    if (cancel === "visibility") {
      game.document.hidden = true;
      input(game.document, "visibilitychange");
      game.document.hidden = false;
    }
    if (cancel === "pointerlock") input(game.document, "pointerlockchange");
    if (cancel === "room") { game.emit("room-left", {}); game.join(); }
    const stopped = game.state();
    game.frame();
    assert.equal(game.state().z, stopped.z);
    input(game.window, "keydown", { code: "KeyW" });
    game.frame(2);
    assert.ok(Math.abs(stopped.z - game.state().z - 0.3) < 0.000001);
  }
});

test("six remembered categories expose seventeen materials and only edited chunks are uploaded", () => {
  const game = createGame();
  assert.equal(game.elements.get("#hotbar").children.length, 6);
  assert.equal(game.elements.get("#block-options").children.length, 17);
  assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
  game.selectBlock(7);
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  assert.equal(game.elements.get("#hotbar").children[1].attributes.get("aria-pressed"), "true");
  input(game.window, "keydown", { code: "Digit5" });
  assert.equal(game.elements.get("#selected-block-name").textContent, "窓ブロック");
  game.join();
  game.uploads.length = 0;
  game.change(1, 22, 1, 20);
  assert.equal(game.model.getBlock(22, 1, 20), 7);
  assert.equal(game.uploads.length, 3);
  game.uploads.length = 0;
  game.change(2, 23, 7, 23, 9);
  assert.equal(game.uploads.length, 12);
  game.frame();
  assert.deepEqual(game.errors, []);
});

test("colored walls retain textured previews and correct atlas UVs under the color category", () => {
  const game = createGame({ recordUvs: true });
  const atlas = game.textureUploads[0];
  assert.equal(atlas.width, 512);
  assert.equal(atlas.height, 16);
  assert.equal(game.texturePixels.length, 19 * 16 * 16);
  assert.equal(game.previews.length, 18);
  for (let tile = 0; tile < 16; tile += 1) {
    assert.equal(game.previews[tile][0], atlas);
    assert.equal(game.previews[tile][1], tile * 16);
  }
  const names = ["赤い壁ブロック", "青い壁ブロック", "黄色い壁ブロック",
    "緑の壁ブロック", "紫の壁ブロック", "黒い壁ブロック"];
  game.join();
  for (let index = 0; index < names.length; index += 1) {
    const id = 10 + index;
    const button = game.elements.get("#block-options").children[id - 1];
    game.selectBlock(id);
    assert.equal(button.attributes.get("aria-label"), names[index]);
    assert.equal(button.children[1].textContent, names[index]);
    assert.equal(game.elements.get("#selected-block-name").textContent, names[index]);
    assert.equal(button.attributes.get("aria-pressed"), "true");
    game.uvUploads.length = 0;
    game.change(index * 2 + 1, 22, 12, 23, id);
    assert.equal(game.model.getBlock(22, 12, 23), id);
    const uvs = game.uvUploads.flatMap((data) => Array.from(data));
    assert.equal(uvs.length, 6 * 6 * 2);
    for (let offset = 0; offset < uvs.length; offset += 2) {
      assert.ok(uvs[offset] >= ((id - 1) * 16 + 0.5) / atlas.width);
      assert.ok(uvs[offset] <= ((id - 1) * 16 + 15.5) / atlas.width);
      assert.ok(uvs[offset + 1] > 0 && uvs[offset + 1] < 1);
    }
    game.change(index * 2 + 2, 22, 12, 23, 0, id);
  }
  assert.equal(new Set(game.texturePixels.filter(({ x, y }) =>
    x >= 9 * 16 && x < 15 * 16 && x % 16 === 0 && y === 0).map(({ color }) => color)).size, 6);
  input(game.window, "keydown", { code: "Digit1" });
  assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
});

test("category numbers remember each confirmed block and unused numbers do not select materials", () => {
  const game = createGame();
  const hotbar = game.elements.get("#hotbar");
  assert.deepEqual(hotbar.children.map((button) => button.children[1].textContent),
    ["自然・地形", "基本建材", "階段", "ハーフ", "窓・ガラス", "色付き"]);
  const allOptions = game.elements.get("#block-options").children;
  for (const [digit, name, ids] of [
    [1, "草ブロック", [1, 2, 3, 4, 5]], [2, "板材ブロック", [6, 7, 8]],
    [3, "板材の階段", [17]], [4, "板材ハーフブロック", [16]],
    [5, "窓ブロック", [9]], [6, "赤い壁ブロック", [10, 11, 12, 13, 14, 15]],
  ]) {
    input(game.window, "keydown", { code: `Digit${digit}` });
    assert.equal(game.elements.get("#selected-block-name").textContent, name);
    input(game.window, "keydown", { code: "KeyR" });
    assert.deepEqual(allOptions.flatMap((button, index) => button.hidden ? [] : [index + 1]), ids);
    input(game.window, "keydown", { code: "Escape" });
  }
  game.selectBlock(7);
  game.selectBlock(14);
  input(game.window, "keydown", { code: "Digit2" });
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  input(game.window, "keydown", { code: "Digit6" });
  for (const code of ["Digit7", "Digit8", "Digit9"]) input(game.window, "keydown", { code });
  assert.equal(game.elements.get("#selected-block-name").textContent, "紫の壁ブロック");
  assert.match(hotbar.children[1].attributes.get("aria-label"), /2: 基本建材 · レンガ/);
});

test("R selection previews, wraps and cancels without changing the held block or remembered history", () => {
  const game = createGame();
  const panel = game.elements.get("#block-picker");
  const name = game.elements.get("#selected-block-name");
  input(game.window, "keydown", { code: "KeyR" });
  assert.equal(panel.hidden, false);
  assert.equal(game.elements.get("#choose-block").attributes.get("aria-expanded"), "true");
  input(game.window, "keydown", { code: "KeyR", repeat: true });
  assert.equal(panel.hidden, false);
  input(game.window, "keydown", { code: "ArrowUp" });
  assert.match(game.elements.get("#block-candidate").textContent, /葉っぱ.*5 \/ 5/);
  assert.equal(name.textContent, "草ブロック");
  assert.equal(game.document.activeElement, game.elements.get("#block-options").children[4]);
  input(game.window, "keydown", { code: "Escape" });
  assert.equal(panel.hidden, true);
  assert.equal(name.textContent, "草ブロック");
  assert.equal(game.saved.has("moneycraft-block-selection-v1"), false);
  assert.equal(game.document.activeElement, game.elements.get("#hotbar").children[0]);
  input(game.window, "keydown", { code: "KeyR" });
  input(game.window, "keydown", { code: "ArrowDown" });
  input(game.window, "keydown", { code: "KeyR" });
  assert.equal(name.textContent, "土ブロック");
  input(game.window, "keydown", { code: "KeyR" });
  input(game.window, "keydown", { code: "ArrowUp" });
  input(game.window, "keydown", { code: "Enter" });
  assert.equal(name.textContent, "草ブロック");
});

test("wheel switches categories normally and candidates while open without double-stepping trackpad bursts", () => {
  const game = createGame();
  const canvas = game.elements.get("#game");
  assert.equal(input(canvas, "wheel", { deltaY: 100 }).defaultPrevented, false);
  game.document.pointerLockElement = canvas;
  assert.equal(input(canvas, "wheel", { deltaY: 100 }).defaultPrevented, true);
  assert.equal(game.elements.get("#selected-block-name").textContent, "板材ブロック");
  input(canvas, "wheel", { deltaY: 100 });
  assert.equal(game.elements.get("#selected-block-name").textContent, "板材ブロック");
  input(game.window, "keydown", { code: "KeyR" });
  game.advance(100);
  input(game.elements.get(".game-footer"), "wheel", { deltaY: 1 });
  assert.match(game.elements.get("#block-candidate").textContent, /レンガ/);
  assert.equal(game.elements.get("#selected-block-name").textContent, "板材ブロック");
  input(game.elements.get("#confirm-block-picker"), "click");
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  game.advance(100);
  input(canvas, "wheel", { deltaY: -120, deltaMode: 1 });
  assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
  game.advance(100);
  input(canvas, "wheel", { deltaY: -120 });
  assert.equal(game.elements.get("#selected-block-name").textContent, "赤い壁ブロック");
});

test("category re-tap opens touch-friendly selection and explicit buttons confirm or cancel", () => {
  const game = createGame();
  const category = game.elements.get("#hotbar").children[1];
  input(category, "click");
  assert.equal(game.elements.get("#block-picker").hidden, true);
  input(category, "click");
  assert.equal(game.elements.get("#block-picker").hidden, false);
  assert.equal(category.attributes.get("aria-expanded"), "true");
  input(game.elements.get("#block-options").children[6], "click");
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  input(game.elements.get("#choose-block"), "click");
  input(game.window, "keydown", { code: "ArrowDown" });
  input(game.elements.get("#cancel-block-picker"), "click");
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  input(category, "click");
  input(category, "click");
  assert.equal(game.elements.get("#block-picker").hidden, true);
});

test("selection clears held actions and suppresses movement, look, jumping, mining and placement until closed", () => {
  const game = createGame();
  game.join();
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementY: 400, movementX: 0 });
  game.frame(2);
  const edits = [];
  game.window.addEventListener("moneycraft:send-block-edit", (event) => edits.push(event.detail));
  input(game.elements.get("#game"), "mousedown", { button: 0 });
  assert.equal(edits.length, 1);
  input(game.window, "keydown", { code: "KeyW" });
  input(game.window, "keydown", { code: "KeyR" });
  assert.equal(game.runTimeout(200), false);
  const before = game.state();
  input(game.window, "keydown", { code: "KeyW" });
  input(game.window, "keydown", { code: "Space" });
  input(game.window, "mousemove", { movementX: 100, movementY: 100 });
  for (const selector of ["#touch-mine", "#touch-place", "#touch-jump"]) {
    input(game.elements.get(selector), "pointerdown", { pointerId: 300, pointerType: "touch" });
  }
  input(game.elements.get("#game"), "mousedown", { button: 2 });
  input(game.elements.get("#game"), "pointerdown",
    { pointerId: 301, pointerType: "touch", clientX: 70, clientY: 470 });
  game.frame(5);
  const after = game.state();
  assert.deepEqual([after.x, after.z, after.yaw, after.pitch], [before.x, before.z, before.yaw, before.pitch]);
  assert.equal(edits.length, 1);
  assert.equal(game.elements.get("#flight-status").hidden, true);
  input(game.window, "keydown", { code: "Enter" });
  const stopped = game.state();
  game.frame(5);
  assert.equal(game.state().z, stopped.z);
});

test("selection cancels on focus loss, room transitions and fullscreen changes; Escape first closes the panel", async () => {
  for (const cancel of ["blur", "hidden", "pointer", "room", "fullscreen"]) {
    const game = createGame();
    input(game.window, "keydown", { code: "KeyR" });
    input(game.window, "keydown", { code: "ArrowDown" });
    if (cancel === "blur") input(game.window, "blur");
    if (cancel === "hidden") { game.document.hidden = true; input(game.document, "visibilitychange"); }
    if (cancel === "pointer") input(game.document, "pointerlockchange");
    if (cancel === "room") game.join();
    if (cancel === "fullscreen") { input(game.elements.get("#fullscreen-game"), "click"); await Promise.resolve(); }
    assert.equal(game.elements.get("#block-picker").hidden, true);
    assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
  }
  const game = createGame();
  input(game.elements.get("#fullscreen-game"), "click");
  await Promise.resolve();
  input(game.window, "keydown", { code: "KeyR" });
  input(game.window, "keydown", { code: "Escape" });
  assert.equal(game.elements.get(".game-card").classList.contains("is-expanded"), true);
});

test("confirmed category history persists independently of shared worlds and reloads in a new game", () => {
  const game = createGame();
  game.selectBlock(7);
  game.selectBlock(13);
  game.join();
  const soloSave = game.saved.get("moneycraft-3d-world-v2");
  let edits = 0;
  game.window.addEventListener("moneycraft:send-block-edit", () => { edits += 1; });
  input(game.window, "keydown", { code: "Digit2" });
  game.emit("room-left", {});
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  assert.equal(game.saved.get("moneycraft-3d-world-v2"), soloSave);
  assert.equal(edits, 0);
  const restored = createGame({ selectionSettings: game.saved.get("moneycraft-block-selection-v1") });
  assert.equal(restored.elements.get("#selected-block-name").textContent, "レンガブロック");
  input(restored.window, "keydown", { code: "Digit6" });
  assert.equal(restored.elements.get("#selected-block-name").textContent, "緑の壁ブロック");
});

test("invalid or inaccessible selection history is reported explicitly without breaking building controls", () => {
  for (const selectionSettings of ["{", { category: "unknown", selections: {} },
    { category: "stairs", selections: { stairs: 6 } }]) {
    const game = createGame({ selectionSettings, expectedInitializationErrors: 1 });
    assert.match(game.elements.get("#block-selection-status").textContent, /読み込めません/);
    assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
    game.selectBlock(17);
    assert.equal(game.elements.get("#selected-block-name").textContent, "板材の階段");
  }
  const denied = createGame({ selectionReadFailure: true, expectedInitializationErrors: 1 });
  assert.match(denied.elements.get("#block-selection-status").textContent, /読み込めません/);
  const unsaved = createGame({ selectionWriteFailure: true });
  input(unsaved.window, "keydown", { code: "Digit3" });
  assert.match(unsaved.elements.get("#block-selection-status").textContent, /保存できません/);
  assert.equal(unsaved.elements.get("#selected-block-name").textContent, "板材の階段");
  assert.equal(unsaved.errors.length, 1);
});

test("horizontal logs render their end-grain textures on the oriented axis", () => {
  const game = createGame({ recordUvs: true });
  const world = game.roomWorld;
  world.blocks.fill(0);
  world.orientations.fill(0);
  const x = 22;
  const y = 4;
  const z = 20;
  const index = (y * world.depth + z) * world.width + x;
  world.blocks[index] = 4;
  world.orientations[index] = game.worldApi.createModel(world).orientationFromNormal([1, 0, 0]);
  game.uvUploads.length = 0;
  game.join();

  const meshUvs = game.uvUploads.find((uvs) => uvs.length > 0);
  assert.ok(meshUvs);
  const faceTiles = Array.from({ length: 6 }, (_, face) =>
    Math.floor(meshUvs[face * 12] * game.textureUploads[0].width / 16));
  assert.deepEqual(faceTiles, [18, 18, 3, 3, 3, 3]);
});

test("slab meshes are half-height, crop side textures and show half-height hotbar previews", () => {
  const game = createGame({ recordUvs: true, recordGeometry: true });
  game.roomWorld.blocks.fill(0);
  const { width, depth } = game.roomWorld;
  game.roomWorld.blocks[(4 * depth + 20) * width + 22] = 16;
  game.positionUploads.length = 0;
  game.uvUploads.length = 0;
  game.join();
  const vertices = game.positionUploads.flatMap((data) => Array.from(data));
  assert.equal(vertices.length, 6 * 6 * 3);
  const heights = vertices.filter((_, index) => index % 3 === 1);
  assert.equal(Math.min(...heights), 4);
  assert.equal(Math.max(...heights), 4.5);
  const sideUvs = game.uvUploads.find((data) => data.length > 0).slice(0, 12);
  const v = Array.from(sideUvs).filter((_, index) => index % 2 === 1);
  assert.equal(Math.min(...v), 8 / 16);
  assert.equal(Math.max(...v), 15.5 / 16);
  assert.deepEqual(game.previews[15].slice(1), [240, 8, 16, 8, 0, 8, 16, 8]);
});

test("slabs select upper or lower placement from side height and face normal", () => {
  for (const [pitch, targetY, expected] of [[0.2, 2, 20], [-0.2, 2, 0], [-1.2, 0, 0], [0.7, 4, 20]]) {
    const game = createGame();
    const world = game.roomWorld;
    if (targetY !== 0) world.blocks[(targetY * world.depth + 18) * world.width + 20] = 3;
    game.join();
    game.document.pointerLockElement = game.elements.get("#game");
    input(game.window, "mousemove", { movementX: 0, movementY: (-0.12 - pitch) / 0.0025 });
    game.selectBlock(16);
    let edit;
    game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
    input(game.elements.get("#touch-place"), "pointerdown", { pointerId: 101, pointerType: "touch" });
    input(game.elements.get("#touch-place"), "pointerup", { pointerId: 101 });
    assert.ok(edit, `no placement for pitch ${pitch}`);
    assert.equal(edit.block, 16);
    assert.equal(edit.orientation, expected);
  }
});

test("slabs merge in the targeted or neighboring half-cell and wait for shared confirmation", () => {
  for (const shared of [false, true]) {
    for (const [orientation, pitch, y, neighbor] of [[0, -0.5, 1, false], [20, 0.4, 3, false],
      [20, -0.15, 2, true], [0, 0.15, 2, true]]) {
      let game = createGame();
      const world = game.roomWorld;
      const z = neighbor ? 19 : 18;
      const index = (y * world.depth + z) * world.width + 20;
      world.blocks[index] = 16;
      world.orientations[index] = orientation;
      if (neighbor) world.blocks[(y * world.depth + 18) * world.width + 20] = 3;
      if (shared) game.join();
      else game = createGame({ soloWorld: world });
      game.document.pointerLockElement = game.elements.get("#game");
      input(game.window, "mousemove", { movementX: 0, movementY: (-0.12 - pitch) / 0.0025 });
      game.selectBlock(16);
      let edit;
      game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
      input(game.elements.get("#touch-place"), "pointerdown", { pointerId: 102, pointerType: "touch" });
      input(game.elements.get("#touch-place"), "pointerup", { pointerId: 102 });
      if (shared) {
        assert.ok(edit, `no merge for ${orientation}/${pitch}`);
        assert.deepEqual([edit.x, edit.y, edit.z, edit.block, edit.expectedBlock, edit.expectedOrientation],
          [20, y, z, 6, 16, orientation]);
        assert.equal(game.model.getBlock(20, y, z), 16);
        game.emit("block-changed", { ...edit, revision: 1, playerId: "self" });
      }
      assert.equal(game.model.getBlock(20, y, z), 6);
      assert.equal(game.model.getOrientation(20, y, z), 0);
      if (!shared) {
        const saved = JSON.parse(game.saved.get("moneycraft-3d-world-v2"));
        assert.equal(saved.world.blocks[index], 6);
      }
    }
  }
});

test("upper slab meshes, outlines and ceilings use their solid upper half", () => {
  const game = createGame({ recordGeometry: true, recordRendering: true });
  const world = game.roomWorld;
  const index = (3 * world.depth + 19) * world.width + 20;
  world.blocks[index] = 16;
  world.orientations[index] = 20;
  game.positionUploads.length = 0;
  game.join();
  const vertices = game.positionUploads.flatMap((data) => Array.from(data));
  const slabHeights = vertices.filter((_, offset) => offset % 3 === 1).filter((height) => height > 1);
  assert.equal(Math.min(...slabHeights), 3.5);
  assert.equal(Math.max(...slabHeights), 4);
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 0, movementY: (-0.12 - 1.0) / 0.0025 });
  game.frame();
  const outline = game.renderEvents.findLast((event) => event.mode === 1);
  assert.ok(outline);
  const heights = outline.positions.filter((_, offset) => offset % 3 === 1);
  assert.ok(Math.abs(Math.min(...heights) - 3.497) < 0.00001);
  game.model.setBlock(20, 3, 20, 16, 20);
  startFlying(game);
  input(game.window, "keydown", { code: "Space" });
  game.frame(20);
  input(game.window, "keyup", { code: "Space" });
  assert.ok(Math.abs(game.state().y - 1.8) < 0.00001);
  game.frame(5);
  assert.ok(Math.abs(game.state().y - 1.8) < 0.00001);
});

test("slab merge rejects player overlap and mismatched shared orientation requests resync", () => {
  const game = createGame();
  const world = game.roomWorld;
  const index = (world.depth + 20) * world.width + 20;
  world.blocks[index] = 16;
  game.join();
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 0, movementY: 500 });
  game.selectBlock(16);
  let edit;
  game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
  input(game.elements.get("#touch-place"), "pointerdown", { pointerId: 103, pointerType: "touch" });
  input(game.elements.get("#touch-place"), "pointerup", { pointerId: 103 });
  assert.equal(edit, undefined);
  assert.equal(game.model.getBlock(20, 1, 20), 16);
  let resync = false;
  game.window.addEventListener("moneycraft:request-world", () => { resync = true; });
  game.emit("block-changed", { x: 20, y: 1, z: 20, block: 6, orientation: 0, expectedBlock: 16,
    expectedOrientation: 20, requestId: "stale-merge", playerId: "other", revision: 1 });
  assert.equal(resync, true);
  assert.equal(game.model.getBlock(20, 1, 20), 16);
});

test("stair meshes contain only union surfaces, crop plank UVs and show a stepped preview", () => {
  for (const orientation of [0, 1, 2, 3, 20, 21, 22, 23]) {
    const game = createGame({ recordGeometry: true, recordUvs: true });
    const world = game.roomWorld;
    world.blocks.fill(0);
    const index = (4 * world.depth + 20) * world.width + 22;
    world.blocks[index] = 17;
    world.orientations[index] = orientation;
    game.positionUploads.length = 0;
    game.uvUploads.length = 0;
    game.join();
    const vertices = game.positionUploads.flatMap((data) => Array.from(data));
    let area = 0;
    for (let offset = 0; offset < vertices.length; offset += 9) {
      const a = vertices.slice(offset + 3, offset + 6).map((value, axis) => value - vertices[offset + axis]);
      const b = vertices.slice(offset + 6, offset + 9).map((value, axis) => value - vertices[offset + axis]);
      area += Math.hypot(a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
      const triangle = [0, 3, 6].map((start) => vertices.slice(offset + start, offset + start + 3));
      if (triangle.every((point) => point[1] === 4.5)) {
        const upper = game.worldApi.getBlockBoxes(17, orientation)[1];
        const center = [0, 1, 2].map((axis) => triangle.reduce((sum, point) => sum + point[axis], 0) / 3);
        assert.ok(center[0] - 22 < upper.min[0] || center[0] - 22 > upper.max[0]
          || center[2] - 20 < upper.min[2] || center[2] - 20 > upper.max[2]);
      }
    }
    assert.equal(area, 5.5);
    const uv = game.uvUploads.flatMap((data) => Array.from(data));
    for (let index = 0; index < uv.length; index += 2) {
      assert.ok(uv[index] >= (16 * 16 + 0.5) / 512 && uv[index] <= (16 * 16 + 15.5) / 512);
    }
    assert.deepEqual(game.previews.at(-2).slice(1), [256, 8, 16, 8, 0, 8, 16, 8]);
    assert.deepEqual(game.previews.at(-1).slice(1), [264, 0, 8, 8, 8, 0, 8, 8]);
  }
});

test("stair placement follows horizontal facing in shared edits and solo saves", () => {
  for (const shared of [false, true]) {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const game = createGame();
      if (shared) game.join();
      game.document.pointerLockElement = game.elements.get("#game");
      input(game.window, "mousemove", { movementX: yaw / 0.0025, movementY: 400 });
      game.selectBlock(17);
      let edit;
      game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
      input(game.elements.get("#touch-place"), "pointerdown", { pointerId: 90, pointerType: "touch" });
      input(game.elements.get("#touch-place"), "pointerup", { pointerId: 90 });
      const expected = game.worldApi.orientationFromFacing([Math.sin(yaw), 0, -Math.cos(yaw)]);
      if (shared) {
        assert.ok(edit);
        assert.equal(edit.block, 17);
        assert.equal(edit.orientation, expected);
        game.change(1, edit.x, edit.y, edit.z, 17, 0, edit.requestId, edit.orientation);
        assert.equal(game.model.getOrientation(edit.x, edit.y, edit.z), expected);
      } else {
        const saved = JSON.parse(game.saved.get("moneycraft-3d-world-v2"));
        const index = saved.world.blocks.findIndex((block) => block === 17);
        assert.ok(index >= 0);
        assert.equal(saved.world.orientations[index], expected);
      }
    }
  }
});

test("stairs select upright or inverted placement from hit face and height in all four directions", () => {
  for (const shared of [false, true]) {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const [pitch, targetY, inverted] of [[0.2, 2, true], [-0.2, 2, false],
        [-1.2, 0, false], [0.7, 4, true]]) {
        let game = createGame();
        const world = game.roomWorld;
        if (targetY !== 0) {
          const x = 20 + Math.round(Math.sin(yaw) * 2);
          const z = 20 - Math.round(Math.cos(yaw) * 2);
          world.blocks[(targetY * world.depth + z) * world.width + x] = 3;
        }
        if (shared) game.join();
        else game = createGame({ soloWorld: world });
        game.document.pointerLockElement = game.elements.get("#game");
        input(game.window, "mousemove", { movementX: yaw / 0.0025, movementY: (-0.12 - pitch) / 0.0025 });
        game.selectBlock(17);
        let edit;
        game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
        input(game.elements.get("#touch-place"), "pointerdown", { pointerId: 104, pointerType: "touch" });
        input(game.elements.get("#touch-place"), "pointerup", { pointerId: 104 });
        const expected = game.worldApi.orientationFromFacing([Math.sin(yaw), 0, -Math.cos(yaw)], inverted);
        if (shared) {
          assert.ok(edit, `no stair for ${yaw}/${pitch}`);
          assert.equal(edit.block, 17);
          assert.equal(edit.orientation, expected);
          assert.equal(game.model.getBlock(edit.x, edit.y, edit.z), 0);
          game.change(1, edit.x, edit.y, edit.z, 17, 0, edit.requestId, edit.orientation);
          assert.equal(game.model.getOrientation(edit.x, edit.y, edit.z), expected);
        } else {
          const saved = JSON.parse(game.saved.get("moneycraft-3d-world-v2"));
          const index = saved.world.blocks.findIndex((block) => block === 17);
          assert.ok(index >= 0, `no solo stair for ${yaw}/${pitch}`);
          assert.equal(saved.world.orientations[index], expected);
        }
      }
    }
  }
});

test("inverted stair ceilings use the half-height recess and full-height lower step", () => {
  for (const recessed of [false, true]) {
    const game = createGame();
    game.join();
    game.model.setBlock(20, 3, 20, 17, game.worldApi.orientationFromFacing([0, 0, -1], true));
    game.frame();
    const code = recessed ? "KeyS" : "KeyW";
    input(game.window, "keydown", { code });
    game.frame(2);
    input(game.window, "keyup", { code });
    startFlying(game);
    input(game.window, "keydown", { code: "Space" });
    game.frame(20);
    input(game.window, "keyup", { code: "Space" });
    assert.ok(Math.abs(game.state().y - (recessed ? 1.8 : 1.3)) < 0.00001);
    game.frame(5);
    assert.ok(Math.abs(game.state().y - (recessed ? 1.8 : 1.3)) < 0.00001);
  }
});

test("grounded players climb connected stairs by half steps in all four directions and descend normally", () => {
  for (const direction of [[0, 0, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0]]) {
    const game = createGame();
    const world = game.roomWorld;
    const orientation = game.worldApi.orientationFromFacing(direction);
    for (let step = 1; step <= 3; step += 1) {
      const x = 20 + direction[0] * step;
      const z = 20 + direction[2] * step;
      const index = (step * world.depth + z) * world.width + x;
      world.blocks[index] = 17;
      world.orientations[index] = orientation;
    }
    game.join();
    game.document.pointerLockElement = game.elements.get("#game");
    const yaw = Math.atan2(direction[0], -direction[2]);
    input(game.window, "mousemove", { movementX: yaw / 0.0025, movementY: -48 });
    game.frame();
    input(game.window, "keydown", { code: "KeyW" });
    const heights = new Set();
    for (let frame = 0; frame < 24; frame += 1) {
      game.frame();
      heights.add(game.state().y);
    }
    input(game.window, "keyup", { code: "KeyW" });
    for (const height of [1.5, 2, 2.5, 3, 3.5, 4]) assert.ok(heights.has(height), `missing tread ${height}`);
    assert.equal(game.state().y, 4);
    input(game.window, "keydown", { code: "KeyS" });
    game.frame(30);
    input(game.window, "keyup", { code: "KeyS" });
    assert.equal(game.state().y, 1);
  }
});

test("half-step climbing handles slabs but cannot climb full walls, low ceilings or while flying", () => {
  for (const scenario of ["slab", "wall", "ceiling", "flying"]) {
    const game = createGame();
    const world = game.roomWorld;
    const set = (x, y, z, block) => { world.blocks[(y * world.depth + z) * world.width + x] = block; };
    set(20, 1, 19, scenario === "slab" ? 16 : scenario === "wall" ? 3 : 17);
    world.orientations[(world.depth + 19) * world.width + 20] = scenario === "ceiling" || scenario === "flying"
      ? game.worldApi.orientationFromFacing([0, 0, -1]) : 0;
    if (scenario === "ceiling") set(20, 3, 19, 3);
    game.join();
    if (scenario === "flying") startFlying(game);
    game.frame();
    input(game.window, "keydown", { code: "KeyW" });
    game.frame(scenario === "slab" ? 5 : 15);
    input(game.window, "keyup", { code: "KeyW" });
    if (scenario === "slab") {
      assert.equal(game.state().y, 1.5);
      assert.ok(game.state().z < 20);
    } else {
      assert.equal(game.state().y, 1);
      assert.ok(game.state().z >= 20.28);
    }
  }
});

function createStepViewGame() {
  const game = createGame({ recordRendering: true });
  const world = game.roomWorld;
  const index = (world.depth + 19) * world.width + 20;
  world.blocks[index] = 17;
  world.orientations[index] = game.worldApi.orientationFromFacing([0, 0, -1]);
  game.join();
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 0, movementY: -48 });
  game.frame();
  input(game.window, "keydown", { code: "KeyW" });
  for (let frame = 0; frame < 5 && game.state().y === 1; frame += 1) game.frame();
  input(game.window, "keyup", { code: "KeyW" });
  assert.equal(game.state().y, 1.5);
  return game;
}

function renderedEyeY(game) {
  const matrix = game.viewMatrices.at(-1);
  return -matrix[13] / matrix[5];
}

test("step view smoothly follows the physical half-step without changing position or network state", () => {
  const game = createStepViewGame();
  const initialEye = 1 + 1.7 * 0.88;
  const finalEye = 1.5 + 1.7 * 0.88;
  assert.ok(Math.abs(renderedEyeY(game) - initialEye) < 0.00001);
  const before = game.state();
  game.frame(1, 1000 / 60);
  const intermediate = renderedEyeY(game);
  assert.ok(intermediate > initialEye && intermediate < finalEye);
  assert.deepEqual(game.state(), before);
  game.frame(11, 1000 / 60);
  assert.ok(Math.abs(renderedEyeY(game) - finalEye) < 0.01);
  assert.deepEqual(game.state(), before);
});

test("step view response is frame-rate independent and is reset on flight and room transitions", () => {
  const eyes = [];
  for (const fps of [30, 60, 120]) {
    const game = createStepViewGame();
    game.frame(fps / 5, 1000 / fps);
    eyes.push(renderedEyeY(game));
    game.emit("room-left", {});
    game.join();
    input(game.window, "mousemove", { movementX: 0, movementY: -48 });
    game.frame();
    assert.ok(Math.abs(renderedEyeY(game) - (game.state().y + 1.7 * 0.88)) < 0.00001);
  }
  assert.ok(Math.max(...eyes) - Math.min(...eyes) < 0.00001);
  const game = createStepViewGame();
  startFlying(game);
  game.frame();
  assert.ok(Math.abs(renderedEyeY(game) - (game.state().y + 1.7 * 0.88)) < 0.00001);
});

test("mining during a step uses the smoothed camera ray rather than the physical eye", () => {
  const game = createStepViewGame();
  game.change(1, 20, 2, 17, 16);
  let edit;
  game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
  input(game.elements.get("#touch-mine"), "pointerdown", { pointerId: 95, pointerType: "touch" });
  input(game.elements.get("#touch-mine"), "pointerup", { pointerId: 95 });
  assert.ok(edit);
  assert.deepEqual([edit.x, edit.y, edit.z, edit.expectedBlock], [20, 2, 17, 16]);
});

test("stair targeting outlines the stepped contour rather than its enclosing cube", () => {
  for (const inverted of [false, true]) {
    const game = createGame({ recordRendering: true });
    const world = game.roomWorld;
    const index = (world.depth + 18) * world.width + 20;
    world.blocks[index] = 17;
    world.orientations[index] = game.worldApi.orientationFromFacing([0, 0, -1], inverted);
    game.join();
    game.document.pointerLockElement = game.elements.get("#game");
    input(game.window, "mousemove", { movementX: 0, movementY: 150 });
    game.frame();
    const outline = game.renderEvents.findLast((event) => event.mode === 1);
    assert.ok(outline);
    assert.equal(outline.count, 36);
    assert.ok(outline.positions.filter((_, index) => index % 3 === 1).includes(1.5));
    assert.ok(outline.positions.filter((_, index) => index % 3 === 2).includes(18.5));
    assert.deepEqual(outline.positions, Array.from(game.worldApi.getStairOutline(world.orientations[index]))
      .flatMap((edge) => Array.from(edge).flatMap((point) =>
        Array.from(point, (value, axis) => value + [20, 1, 18][axis]))));
  }
});

test("corner stair meshes expose only union surfaces and targeting uses the derived contour", () => {
  for (const inverted of [false, true]) for (const shape of ["outer-left", "outer-right", "inner-left", "inner-right"]) {
    const game = createGame({ recordGeometry: true, recordRendering: true });
    const world = game.roomWorld;
    world.blocks.fill(0);
    const orientation = game.worldApi.orientationFromFacing([0, 0, -1], inverted);
    const axes = game.model.getOrientationAxes(orientation);
    const sign = shape.startsWith("outer") ? 1 : -1;
    const side = shape.endsWith("left") ? -1 : 1;
    const set = (x, y, z, value) => {
      const index = (y * world.depth + z) * world.width + x;
      world.blocks[index] = 17;
      world.orientations[index] = value;
    };
    set(20, 1, 18, orientation);
    set(20, 1, 18 - sign, game.worldApi.orientationFromFacing(Array.from(axes.x, (value) => value * side), inverted));
    game.positionUploads.length = 0;
    game.join();
    assert.equal(game.model.getStairShape(20, 1, 18), shape);
    const vertices = game.positionUploads.flatMap((data) => Array.from(data));
    let area = 0;
    for (let offset = 0; offset < vertices.length; offset += 9) {
      const a = vertices.slice(offset + 3, offset + 6).map((value, axis) => value - vertices[offset + axis]);
      const b = vertices.slice(offset + 6, offset + 9).map((value, axis) => value - vertices[offset + axis]);
      const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      area += Math.hypot(...normal) / 2;
    }
    let exposedArea = 0;
    const occupied = new Set();
    for (let x = 40; x < 42; x += 1) for (let y = 2; y < 4; y += 1) {
      for (let z = 32; z < 40; z += 1) {
        const point = [x, y, z].map((value) => value / 2 + 0.25);
        if (game.model.intersectsBox(...point.map(Math.floor),
          point.map((value) => value - 0.01), point.map((value) => value + 0.01))) occupied.add([x, y, z].join(","));
      }
    }
    for (const key of occupied) {
      const point = key.split(",").map(Number);
      for (let axis = 0; axis < 3; axis += 1) for (const sign of [-1, 1]) {
        const neighbor = point.slice();
        neighbor[axis] += sign;
        if (!occupied.has(neighbor.join(","))) exposedArea += 0.25;
      }
    }
    assert.equal(area, exposedArea);
    game.document.pointerLockElement = game.elements.get("#game");
    input(game.window, "mousemove", { movementX: 0, movementY: 150 });
    game.frame();
    const outline = game.renderEvents.findLast((event) => event.mode === 1);
    assert.ok(outline);
    const origin = [20.5, 2.496, 20.5];
    const direction = [0, Math.sin(-0.495), -Math.cos(-0.495)];
    const hits = [18, 18 - sign].map((z) => ({ z, hit: game.model.raycastBlock(20, 1, z, origin, direction, 6) }))
      .filter(({ hit }) => hit).sort((a, b) => a.hit.distance - b.hit.distance);
    assert.ok(hits.length);
    assert.equal(outline.count, game.worldApi.getStairOutline(orientation,
      game.model.getStairShape(20, 1, hits[0].z)).length * 2);
  }
});

test("corner removal updates two-cell occlusion across diagonal chunk boundaries and snapshot reloads", () => {
  const game = createGame({ recordGeometry: true, recordRendering: true });
  const world = game.roomWorld;
  const set = (x, y, z, block, orientation = 0) => {
    const index = (y * world.depth + z) * world.width + x;
    world.blocks[index] = block;
    world.orientations[index] = orientation;
  };
  const forward = game.worldApi.orientationFromFacing([0, 0, 1]);
  const turn = game.worldApi.orientationFromFacing([-1, 0, 0]);
  set(7, 4, 7, 17, forward);
  set(7, 4, 8, 17, turn);
  set(8, 4, 7, 3);
  game.join();
  const seamArea = () => {
    game.renderEvents.length = 0;
    game.frame();
    let area = 0;
    for (const event of game.renderEvents.filter((value) => value.mode === 4 && value.textured && !value.blending)) {
      const positions = event.positions ?? [];
      for (let offset = 0; offset < positions.length; offset += 9) {
        const triangle = [0, 3, 6].map((start) => positions.slice(offset + start, offset + start + 3));
        if (!triangle.every((point) => point[0] === 8 && point[1] >= 4.5 && point[1] <= 5
          && point[2] >= 7 && point[2] <= 8)) continue;
        const a = triangle[1].map((value, axis) => value - triangle[0][axis]);
        const b = triangle[2].map((value, axis) => value - triangle[0][axis]);
        area += Math.abs(a[1] * b[2] - a[2] * b[1]) / 2;
      }
    }
    return area;
  };
  assert.equal(seamArea(), 0.5);
  game.change(1, 7, 4, 8, 0, 17);
  assert.equal(game.model.getStairShape(7, 4, 7), "straight");
  assert.equal(seamArea(), 0.25);
  game.change(2, 7, 4, 8, 17, 0, "replace-turn", turn);
  assert.equal(seamArea(), 0.5);
  game.emit("world-snapshot", { world: game.model.serialize(), revision: 2 });
  assert.equal(seamArea(), 0.5);
});

test("solo and shared mining refuse stair removal that would fill the player's corner recess", () => {
  for (const shared of [false, true]) {
    let game = createGame();
    if (shared) game.join();
    else game = createGame({ soloWorld: game.roomWorld });
    game.document.pointerLockElement = game.elements.get("#game");
    game.frame(2);
    input(game.window, "keydown", { code: "KeyA" });
    input(game.window, "keydown", { code: "KeyS" });
    game.frame(3);
    input(game.window, "keyup", { code: "KeyA" });
    input(game.window, "keyup", { code: "KeyS" });
    startFlying(game);
    input(game.window, "keydown", { code: "Space" });
    game.frame(4);
    input(game.window, "keyup", { code: "Space" });
    game.model.setBlock(20, 3, 20, 17, game.worldApi.orientationFromFacing([0, 0, 1], true));
    game.model.setBlock(20, 3, 21, 17, game.worldApi.orientationFromFacing([1, 0, 0], true));
    input(game.window, "mousemove", { movementX: Math.PI / 0.0025, movementY: (-0.12 - 0.7) / 0.0025 });
    let edit;
    game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
    input(game.elements.get("#touch-mine"), "pointerdown", { pointerId: 105, pointerType: "touch" });
    input(game.elements.get("#touch-mine"), "pointerup", { pointerId: 105 });
    assert.equal(edit, undefined);
    assert.equal(game.model.getBlock(20, 3, 21), 17);
    assert.match(game.elements.get("#game-message").textContent, /形が変わる場所/);
  }
});

test("solo and shared placement allows an inverted outer corner whose missing quarter contains the player", () => {
  for (const shared of [false, true]) {
    let game = createGame();
    if (shared) game.join();
    else game = createGame({ soloWorld: game.roomWorld });
    game.document.pointerLockElement = game.elements.get("#game");
    game.frame(2);
    input(game.window, "keydown", { code: "KeyA" });
    input(game.window, "keydown", { code: "KeyS" });
    game.frame(3);
    input(game.window, "keyup", { code: "KeyA" });
    input(game.window, "keyup", { code: "KeyS" });
    startFlying(game);
    input(game.window, "keydown", { code: "Space" });
    game.frame(4);
    input(game.window, "keyup", { code: "Space" });
    game.model.setBlock(20, 3, 21, 17, game.worldApi.orientationFromFacing([1, 0, 0], true));
    input(game.window, "mousemove", { movementX: Math.PI / 0.0025, movementY: (-0.12 - 1.3) / 0.0025 });
    game.selectBlock(17);
    let edit;
    game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
    input(game.elements.get("#touch-place"), "pointerdown", { pointerId: 106, pointerType: "touch" });
    input(game.elements.get("#touch-place"), "pointerup", { pointerId: 106 });
    if (shared) {
      assert.ok(edit);
      assert.deepEqual([edit.x, edit.y, edit.z, edit.block], [20, 3, 20, 17]);
      game.change(1, edit.x, edit.y, edit.z, 17, 0, edit.requestId, edit.orientation);
    }
    assert.equal(game.model.getBlock(20, 3, 20), 17);
    assert.match(game.model.getStairShape(20, 3, 20), /^outer/);
    if (!shared) {
      const saved = JSON.parse(game.saved.get("moneycraft-3d-world-v2"));
      assert.equal(saved.world.blocks[(3 * 40 + 20) * 40 + 20], 17);
    }
  }
});

test("corner support and inverted ceilings follow the missing or filled quarter during movement", () => {
  for (const inverted of [false, true]) for (const inner of [false, true]) {
    const game = createGame();
    game.join();
    game.document.pointerLockElement = game.elements.get("#game");
    game.frame(2);
    input(game.window, "keydown", { code: "KeyA" });
    input(game.window, "keydown", { code: "KeyS" });
    game.frame(3);
    input(game.window, "keyup", { code: "KeyA" });
    input(game.window, "keyup", { code: "KeyS" });
    startFlying(game);
    if (!inverted) {
      input(game.window, "keydown", { code: "Space" });
      game.frame(10);
      input(game.window, "keyup", { code: "Space" });
    }
    const y = inverted ? 3 : 1;
    game.model.setBlock(20, y, 20, 17, game.worldApi.orientationFromFacing([0, 0, 1], inverted));
    game.model.setBlock(20, y, inner ? 19 : 21, 17, game.worldApi.orientationFromFacing([1, 0, 0], inverted));
    if (inverted) {
      input(game.window, "keydown", { code: "Space" });
      game.frame(20);
      input(game.window, "keyup", { code: "Space" });
    } else {
      pressJump(game);
      game.advance(150);
      pressJump(game);
      game.frame(30);
    }
    const expected = inverted ? inner ? 1.3 : 1.8 : inner ? 2 : 1.5;
    assert.ok(Math.abs(game.state().y - expected) < 0.00001);
  }
});

test("window textures keep opaque frames and translucent glass without changing solid bounds", () => {
  const game = createGame();
  const pixel = (x, y) => game.texturePixels.find((pixel) => pixel.x === 8 * 16 + x && pixel.y === y);
  assert.match(pixel(0, 3).color, /,1\)$/);
  assert.match(pixel(7, 3).color, /,1\)$/);
  assert.match(pixel(3, 7).color, /,1\)$/);
  assert.match(pixel(3, 3).color, /,0\.22\)$/);
  assert.equal(game.worldApi.blocks[8].renderLayer, "translucent");
  assert.ok(game.worldApi.blocks.filter((block) => block.id !== 9)
    .every((block) => block.renderLayer === "opaque"));
  assert.equal(game.worldApi.getBlockBounds(9), game.worldApi.getBlockBounds(3));
  assert.equal(game.worldApi.blockIntersectsBox(9, 0, 0, 0, [0.2, 0.2, 0.2], [0.8, 0.8, 0.8]), true);
});

test("transparent faces sort globally, draw after avatars and restore depth writes for the next frame", () => {
  const game = createGame({ recordRendering: true });
  const world = game.roomWorld;
  for (const z of [12, 18]) world.blocks[(2 * world.depth + z) * world.width + 20] = 9;
  game.advance(1);
  game.join([{ id: "other", displayName: "Builder",
    state: { x: 20.5, y: 1, z: 15.5, yaw: 0, pitch: 0 } }]);
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 0, movementY: -48 });
  game.renderEvents.length = 0;
  game.frame();
  const transparent = game.renderEvents.at(-1);
  assert.equal(transparent.blending, true);
  assert.equal(transparent.depthWrite, false);
  assert.equal(transparent.textured, true);
  assert.deepEqual(transparent.blendFactors, [770, 771, 1, 771]);
  assert.equal(transparent.count, 72);
  assert.ok(game.renderEvents.slice(0, -1).every((event) => !event.blending && event.depthWrite));
  assert.ok(game.renderEvents.some((event) => !event.textured && event.mode === 4 && event.count > 24));
  const centers = (draw) => Array.from({ length: draw.count / 6 }, (_, index) =>
    [0, 1, 2].map((axis) => draw.positions.slice(index * 18, index * 18 + 18)
      .filter((_, offset) => offset % 3 === axis).reduce((sum, value) => sum + value, 0) / 6));
  const forwardZ = centers(transparent).map((center) => center[2]);
  assert.deepEqual(forwardZ, [...forwardZ].sort((a, b) => a - b));

  const uploadCount = game.uploads.length;
  game.frame();
  // Avatar and outline uploads continue, but the three transparent buffers are reused.
  assert.equal(game.uploads.length - uploadCount, 4);
  assert.equal(game.renderEvents.at(-1).blending, true);
  const secondFrame = game.renderEvents.slice(game.renderEvents.indexOf(transparent) + 1);
  assert.equal(secondFrame[0].depthWrite, true);
  assert.equal(secondFrame[0].blending, false);

  input(game.window, "mousemove", { movementX: Math.PI / 0.0025, movementY: 0 });
  game.frame();
  const reverseZ = centers(game.renderEvents.at(-1)).map((center) => center[2]);
  assert.deepEqual(reverseZ, [...reverseZ].sort((a, b) => b - a));
  game.change(1, 20, 2, 12, 0, 9);
  game.frame();
  assert.equal(game.renderEvents.at(-1).count, 36);
  game.change(2, 20, 2, 18, 0, 9);
  game.renderEvents.length = 0;
  game.frame();
  assert.ok(game.renderEvents.every((event) => !event.blending && event.depthWrite));
  game.emit("room-left", {});
  game.renderEvents.length = 0;
  game.frame();
  assert.ok(game.renderEvents.every((event) => !event.blending));
});

test("glass adjacency preserves opaque faces, removes shared glass and clips against slabs across chunks", () => {
  for (const [neighbor, opaqueVertices, transparentVertices] of [
    [9, 0, 60], [3, 36, 30], [16, 36, 36], [17, 66, 36],
  ]) {
    const game = createGame({ recordRendering: true });
    const world = game.roomWorld;
    const set = (x, id) => { world.blocks[(4 * world.depth + 20) * world.width + x] = id; };
    set(23, 9);
    set(24, neighbor);
    game.join();
    game.renderEvents.length = 0;
    game.frame();
    const transparent = game.renderEvents.at(-1);
    assert.equal(transparent.count, transparentVertices);
    const opaque = game.renderEvents.filter((event) => event.textured && !event.blending)
      .flatMap((event) => event.positions)
      .filter((_, index) => index % 3 === 1).filter((height) => height >= 4);
    assert.equal(opaque.length, opaqueVertices);
    const boundaryHeights = [];
    for (let offset = 0; offset < transparent.positions.length; offset += 9) {
      const triangle = transparent.positions.slice(offset, offset + 9);
      if ([0, 3, 6].every((index) => triangle[index] === 24)) {
        boundaryHeights.push(triangle[1], triangle[4], triangle[7]);
      }
    }
    if (neighbor === 16 || neighbor === 17) {
      assert.equal(Math.min(...boundaryHeights), 4.5);
      assert.equal(Math.max(...boundaryHeights), 5);
    } else assert.equal(boundaryHeights.length, 0);
    game.change(1, 24, 4, 20, 0, neighbor);
    game.frame();
    assert.equal(game.renderEvents.at(-1).count, 36);
  }
});

test("transparent windows remain mineable and snapshots replace cached faces without changing solo saves", () => {
  const game = createGame({ recordRendering: true });
  const world = game.roomWorld;
  const cellIndex = (z) => (2 * world.depth + z) * world.width + 20;
  world.blocks[cellIndex(18)] = 9;
  world.blocks[cellIndex(16)] = 7;
  game.join();
  const soloSave = game.saved.get("moneycraft-3d-world-v2");
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 0, movementY: -48 });
  game.frame();
  const outline = game.renderEvents.findLast((event) => event.mode === 1);
  assert.ok(outline.positions.filter((_, index) => index % 3 === 2)
    .every((z) => z > 17.99 && z < 19.01));
  let edit;
  game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
  input(game.elements.get("#touch-mine"), "pointerdown", { pointerId: 71, pointerType: "touch" });
  input(game.elements.get("#touch-mine"), "pointerup", { pointerId: 71 });
  assert.equal(edit.expectedBlock, 9);
  assert.equal(edit.z, 18);
  game.change(1, edit.x, edit.y, edit.z, 0, 9, edit.requestId);
  game.frame();
  assert.equal(game.renderEvents.at(-1).blending, false);

  const snapshot = { ...world, blocks: [...world.blocks] };
  snapshot.blocks[cellIndex(18)] = 0;
  snapshot.blocks[cellIndex(12)] = 9;
  game.emit("world-snapshot", { revision: 2, world: snapshot });
  game.frame();
  const transparent = game.renderEvents.at(-1);
  assert.equal(transparent.count, 36);
  assert.ok(transparent.positions.filter((_, index) => index % 3 === 2)
    .every((z) => z >= 12 && z <= 13));
  game.emit("room-left", {});
  assert.equal(game.saved.get("moneycraft-3d-world-v2"), soloSave);
  assert.deepEqual(game.errors, []);
});

test("cube/slab boundaries expose only uncovered faces, including across chunk boundaries", () => {
  const sharedFaceArea = (positions, axis, plane) => {
    let area = 0;
    for (let offset = 0; offset < positions.length; offset += 9) {
      const points = [0, 3, 6].map((start) => positions.slice(offset + start, offset + start + 3));
      if (!points.every((point) => point[axis] === plane)) continue;
      const a = points[1].map((value, index) => value - points[0][index]);
      const b = points[2].map((value, index) => value - points[0][index]);
      area += Math.hypot(a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
    }
    return area;
  };
  for (const [first, second, delta, axis, expected] of [
    [6, 16, [1, 0, 0], 0, 0.5],
    [16, 16, [1, 0, 0], 0, 0],
    [16, 6, [0, 1, 0], 1, 1],
    [6, 16, [0, 1, 0], 1, 0],
    [17, 6, [1, 0, 0], 0, 0.25],
    [6, 17, [1, 0, 0], 0, 0.25],
    [17, 17, [1, 0, 0], 0, 0],
    [17, 16, [1, 0, 0], 0, 0.25],
  ]) {
    const game = createGame({ recordGeometry: true });
    const world = game.roomWorld;
    world.blocks.fill(0);
    const cell = [23, 7, 23];
    const next = cell.map((value, index) => value + delta[index]);
    world.blocks[(cell[1] * world.depth + cell[2]) * world.width + cell[0]] = first;
    world.blocks[(next[1] * world.depth + next[2]) * world.width + next[0]] = second;
    game.positionUploads.length = 0;
    game.join();
    const positions = game.positionUploads.flatMap((data) => Array.from(data));
    assert.equal(sharedFaceArea(positions, axis, next[axis]), expected);
    game.positionUploads.length = 0;
    game.change(1, ...next, 0, second);
    assert.ok(game.positionUploads.length >= 2);
    assert.equal(sharedFaceArea(game.positionUploads.flatMap((data) => Array.from(data)),
      axis, next[axis]), first === 16 && axis === 1 ? 0 : first === 16 ? 0.5 : first === 17 ? 0.75 : 1);
  }
});

test("colored walls and slabs can be placed through touch controls in solo saves and shared edits", () => {
  for (const shared of [false, true]) {
    for (let id = 10; id <= 17; id += 1) {
      const game = createGame();
      if (shared) game.join();
      game.selectBlock(id);
      game.document.pointerLockElement = game.elements.get("#game");
      input(game.window, "mousemove", { movementX: 0, movementY: 300 });
      let edit;
      game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
      input(game.elements.get("#touch-place"), "pointerdown", { pointerId: 1, pointerType: "touch" });
      input(game.elements.get("#touch-place"), "pointerup", { pointerId: 1 });
      if (shared) {
        assert.ok(edit);
        assert.equal(edit.block, id);
        assert.equal(game.model.getBlock(edit.x, edit.y, edit.z), 0);
        game.change(1, edit.x, edit.y, edit.z, id, 0, edit.requestId);
        assert.equal(game.model.getBlock(edit.x, edit.y, edit.z), id);
      } else {
        const saved = JSON.parse(game.saved.get("moneycraft-3d-world-v2"));
        assert.equal(saved.world.blocks.filter((block) => block === id).length, 1);
        const restored = game.worldApi.createModel(saved.world);
        assert.equal(restored.load(saved.world), true);
        assert.deepEqual(Array.from(restored.serialize().blocks), saved.world.blocks);
      }
      assert.deepEqual(game.errors, []);
    }
  }
});

test("I displays frame pacing and rendering workload without changing world coordinates", () => {
  const game = createGame();
  const indicator = game.elements.get("#debug-indicator");
  assert.equal(indicator.hidden, true);

  input(game.window, "keydown", { code: "KeyI", repeat: false });
  assert.equal(indicator.hidden, false);
  game.frame(6);

  assert.match(indicator.textContent, /Performance\s+30 FPS · frame p95 33\.3 ms/);
  assert.match(indicator.textContent, /Render submit \d+\.\d ms · \d+ chunks · \d+ calls · [\d.]+k tris/);
  assert.match(indicator.textContent, /World\s+X/);
  assert.deepEqual(game.errors, []);
});

test("sound starts muted, saves volume and only plays after an accepted shared edit", async () => {
  const game = createGame();
  const toggle = game.elements.get("#sound-toggle");
  const volume = game.elements.get("#sound-volume");
  assert.equal(toggle.textContent, "音声：OFF");
  assert.equal(toggle.attributes.get("aria-pressed"), "false");

  volume.value = "0.7";
  input(volume, "input");
  assert.deepEqual(JSON.parse(game.saved.get("moneycraft-audio-settings-v1")), { muted: true, volume: 0.7 });
  toggle.dispatchEvent(new Event("click"));
  await new Promise(setImmediate);
  assert.equal(toggle.textContent, "音声：ON");
  assert.equal(JSON.parse(game.saved.get("moneycraft-audio-settings-v1")).muted, false);

  game.join();
  const edits = [];
  game.window.addEventListener("moneycraft:send-block-edit", (event) => edits.push(event.detail));
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 0, movementY: 300 });
  input(game.elements.get("#touch-mine"), "pointerdown", { pointerId: 20, pointerType: "touch" });
  input(game.elements.get("#touch-mine"), "pointerup", { pointerId: 20 });
  assert.equal(edits.length, 1);
  assert.equal(game.soundEvents.some(([type]) => type === "start"), false);

  const edit = edits[0];
  game.emit("block-changed", {
    ...edit, revision: 1, block: 0, expectedBlock: edit.expectedBlock, playerId: "self",
  });
  assert.ok(game.soundEvents.some(([type]) => type === "start"));
  assert.ok(game.soundEvents.some(([type, value]) => type === "gain" && value > 0));
  game.emit("room-left", {});
});

test("saved enabled sound initializes on a shared edit and only plays after confirmation", async () => {
  const game = createGame({ audioSettings: { muted: false, volume: 0.4 } });
  assert.equal(game.elements.get("#sound-toggle").textContent, "音声：ON");
  assert.equal(game.elements.get("#sound-volume").value, "0.4");
  game.join();
  const edits = [];
  game.window.addEventListener("moneycraft:send-block-edit", (event) => edits.push(event.detail));
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 0, movementY: 300 });
  input(game.elements.get("#touch-mine"), "pointerdown", { pointerId: 22, pointerType: "touch" });
  input(game.elements.get("#touch-mine"), "pointerup", { pointerId: 22 });
  await new Promise(setImmediate);
  assert.equal(edits.length, 1);
  assert.ok(game.soundEvents.some(([type]) => type === "resume"));
  assert.equal(game.soundEvents.some(([type]) => type === "start"), false);
  game.emit("block-changed", {
    ...edits[0], revision: 1, block: 0, playerId: "self",
  });
  assert.ok(game.soundEvents.some(([type]) => type === "start"));
  game.emit("room-left", {});
});

test("rejected edits stay silent and browsers without Web Audio remain muted", async () => {
  const game = createGame({ audioAvailable: false });
  game.elements.get("#sound-toggle").dispatchEvent(new Event("click"));
  await new Promise(setImmediate);
  assert.equal(game.elements.get("#sound-toggle").attributes.get("aria-pressed"), "false");
  assert.match(game.elements.get("#sound-status").textContent, /利用できません/);

  const supported = createGame();
  supported.elements.get("#sound-toggle").dispatchEvent(new Event("click"));
  await new Promise(setImmediate);
  supported.join();
  const edits = [];
  supported.window.addEventListener("moneycraft:send-block-edit", (event) => edits.push(event.detail));
  supported.document.pointerLockElement = supported.elements.get("#game");
  input(supported.window, "mousemove", { movementX: 0, movementY: 300 });
  input(supported.elements.get("#touch-mine"), "pointerdown", { pointerId: 21, pointerType: "touch" });
  input(supported.elements.get("#touch-mine"), "pointerup", { pointerId: 21 });
  supported.emit("edit-rejected", { requestId: edits[0].requestId, code: "out_of_reach" });
  assert.equal(supported.soundEvents.some(([type]) => type === "start"), false);
  supported.emit("room-left", {});
});

test("ambient bird chirps stay muted by default and stop when audio is muted", async () => {
  const game = createGame();
  const toggle = game.elements.get("#sound-toggle");
  assert.equal(toggle.textContent, "音声：OFF");
  assert.equal(game.soundEvents.some(([type]) => type === "start"), false);

  toggle.dispatchEvent(new Event("click"));
  await new Promise(setImmediate);
  assert.equal(game.soundEvents.some(([type]) => type === "start"), false);
  assert.equal(game.runTimeout(15000), true);
  assert.ok(game.soundEvents.some(([type]) => type === "start"));
  assert.ok(game.soundEvents.some(([type, value]) => type === "gain" && value > 0 && value <= 0.0063));

  toggle.dispatchEvent(new Event("click"));
  assert.equal(toggle.textContent, "音声：OFF");
  assert.equal(game.runTimeout(15000), false);
});

test("the block under the crosshair receives a visible outline", () => {
  const game = createGame();
  game.roomWorld.blocks.fill(0);
  for (let index = 0; index < game.roomWorld.width * game.roomWorld.depth; index += 1) {
    game.roomWorld.blocks[index] = 3;
  }
  const spawn = game.worldApi.createModel({ width: 40, depth: 40, height: 20 }).spawnCenter;
  const x = Math.floor(spawn.x);
  const z = Math.floor(spawn.z) - 4;
  game.roomWorld.blocks[(1 * game.roomWorld.depth + z) * game.roomWorld.width + x] = 7;
  game.join();
  game.drawCalls.length = 0;

  game.frame();

  assert.ok(game.drawCalls.some(([mode, first, count]) => mode === 1 && first === 0 && count === 24));
});

test("rays pass through a slab's empty upper half and hit its actual top when aimed down", () => {
  for (const aimDown of [false, true]) {
    const game = createGame({ recordGeometry: true });
    const world = game.roomWorld;
    for (let index = 0; index < world.width * world.depth; index += 1) world.blocks[index] = 16;
    world.blocks[(world.depth + 18) * world.width + 20] = 16;
    world.blocks[(world.depth + 16) * world.width + 20] = 3;
    game.join();
    assert.equal(game.state().y, 0.5);
    game.document.pointerLockElement = game.elements.get("#game");
    input(game.window, "mousemove", { movementX: 0, movementY: aimDown ? 52 : -48 });
    game.frame();
    const outline = game.outlineUploads.at(-2);
    assert.ok(outline);
    const heights = Array.from(outline).filter((_, index) => index % 3 === 1);
    assert.ok(Math.abs(Math.max(...heights) - (aimDown ? 1.503 : 2.003)) < 0.00001);
    let edit;
    game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
    input(game.elements.get("#touch-mine"), "pointerdown", { pointerId: 61, pointerType: "touch" });
    input(game.elements.get("#touch-mine"), "pointerup", { pointerId: 61 });
    assert.ok(edit);
    assert.deepEqual([edit.x, edit.y, edit.z], [20, 1, aimDown ? 18 : 16]);
    assert.equal(edit.expectedBlock, aimDown ? 16 : 3);
    game.emit("room-left", {});
  }
});

test("players spawn and land on slabs, step onto a half-step-high cube and fall from edges", () => {
  const game = createGame();
  const world = game.roomWorld;
  for (const z of [20, 19]) world.blocks[(world.depth + z) * world.width + 20] = 16;
  world.blocks[(world.depth + 18) * world.width + 20] = 3;
  game.join();
  assert.equal(game.state().y, 1.5);
  pressJump(game);
  game.frame(60);
  assert.equal(game.state().y, 1.5);
  input(game.window, "keydown", { code: "KeyW" });
  game.frame(10);
  input(game.window, "keyup", { code: "KeyW" });
  const state = game.state();
  assert.equal(state.y, 2);
  assert.ok(state.z < 19.28 && state.z >= 18.28);
  input(game.window, "keydown", { code: "KeyD" });
  game.frame(15);
  input(game.window, "keyup", { code: "KeyD" });
  game.frame(20);
  assert.equal(game.state().y, 1);
  game.emit("room-left", {});
});

test("placing a slab below a hovering player uses half-height rather than whole-cell collision", () => {
  for (const block of [6, 16]) {
    const game = createGame();
    game.join();
    startFlying(game);
    game.frame();
    input(game.window, "keydown", { code: "Space", repeat: false });
    game.frame(4);
    input(game.window, "keyup", { code: "Space" });
    assert.ok(Math.abs(game.state().y - 1.6) < 0.00001);
    game.selectBlock(block);
    game.document.pointerLockElement = game.elements.get("#game");
    input(game.window, "mousemove", { movementX: 0, movementY: 600 });
    const edits = [];
    game.window.addEventListener("moneycraft:send-block-edit", (event) => edits.push(event.detail));
    input(game.elements.get("#touch-place"), "pointerdown", { pointerId: 62, pointerType: "touch" });
    input(game.elements.get("#touch-place"), "pointerup", { pointerId: 62 });
    assert.equal(edits.length, block === 16 ? 1 : 0);
    if (block === 16) assert.deepEqual([edits[0].x, edits[0].y, edits[0].z], [20, 1, 20]);
    game.emit("room-left", {});
  }
});

test("new solo worlds have a clear plains spawn and legacy saves remain intact", () => {
  const fresh = createGame();
  assert.equal(fresh.model.dimensions.width, 64);
  assert.equal(fresh.model.terrain, "forest-plains");
  const spawn = fresh.model.spawnCenter;
  assert.ok(spawn.x < 38);
  assert.equal(fresh.model.findSurface(spawn.x, spawn.z), 6);
  const legacy = createGame({ legacySave: true });
  assert.equal(legacy.model.dimensions.width, 40);
  assert.deepEqual(legacy.model.serialize(), legacy.originalSave.world);
  assert.equal(legacy.model.getBlock(38, 16, 38), 9);
  legacy.elements.get("#reset-world").dispatchEvent(new Event("click"));
  assert.equal(legacy.model.dimensions.width, 64);
  assert.equal(legacy.model.terrain, "forest-plains");
});

test("the oldest array-only solo save still loads as a 40-square world", () => {
  const game = createGame({ legacySave: "array" });
  assert.equal(game.model.dimensions.width, 40);
  assert.equal(game.model.terrain, "legacy");
  assert.equal(game.model.getBlock(38, 16, 38), 9);
  assert.deepEqual(Array.from(game.model.serialize().blocks), Array.from(game.originalSave.world));
  game.join();
  game.emit("room-left", {});
  assert.equal(game.model.getBlock(38, 16, 38), 9);
});

test("switching between old and new rooms updates dimensions and restores the solo buildings", () => {
  const game = createGame({ legacySave: true, roomOptions: { width: 64, depth: 64, height: 20, terrain: "forest-plains" } });
  game.join();
  assert.equal(game.model.dimensions.width, 64);
  game.uploads.length = 0;
  game.change(1, 63, 16, 63, 9);
  assert.equal(game.model.getBlock(63, 16, 63), 9);
  assert.equal(game.uploads.length, 6);
  game.emit("room-left", {});
  assert.equal(game.model.dimensions.width, 40);
  assert.deepEqual(game.model.serialize(), game.originalSave.world);
});

test("shared edits never overwrite solo saves and leaving restores the original world", () => {
  const game = createGame();
  const solo = game.model.serialize();
  game.join();
  const saved = game.saved.get("moneycraft-3d-world-v2");
  assert.equal(game.elements.get("#reset-world").disabled, true);
  game.change(1, 22, 1, 20, 8);
  game.frame();
  assert.equal(game.saved.get("moneycraft-3d-world-v2"), saved);
  game.emit("room-left", {});
  assert.deepEqual(game.model.serialize(), solo);
  assert.equal(game.elements.get("#reset-world").disabled, false);
  assert.equal(game.saved.get("moneycraft-3d-world-v2"), saved);
});

test("missing revisions trigger one snapshot request and block edits until resynchronized", () => {
  const game = createGame();
  let requests = 0;
  game.window.addEventListener("moneycraft:request-world", () => { requests += 1; });
  game.join();
  game.change(2, 22, 1, 20);
  game.change(3, 22, 1, 20);
  assert.equal(requests, 1);
  assert.equal(game.model.getBlock(22, 1, 20), 0);
  assert.equal(game.timers.size, 1);
  game.emit("world-snapshot", { world: game.roomWorld, revision: 3 });
  assert.equal(game.timers.size, 0);
  game.change(4, 22, 1, 20);
  assert.equal(game.model.getBlock(22, 1, 20), 7);
  game.emit("room-left", {});
});

test("mining waits for server confirmation and rejected edits do not mutate blocks", () => {
  const game = createGame();
  game.join();
  let edit;
  game.window.addEventListener("moneycraft:send-block-edit", (event) => { edit = event.detail; });
  game.document.pointerLockElement = game.elements.get("#game");
  const move = new Event("mousemove");
  Object.assign(move, { movementX: 0, movementY: 300 });
  game.window.dispatchEvent(move);
  input(game.elements.get("#touch-mine"), "pointerdown", { pointerId: 1, pointerType: "touch" });
  input(game.elements.get("#touch-mine"), "pointerup", { pointerId: 1 });
  assert.ok(edit);
  assert.equal(edit.block, 0);
  assert.equal(edit.expectedBlock, 3);
  assert.equal(game.model.getBlock(edit.x, edit.y, edit.z), 3);
  game.emit("edit-rejected", { requestId: edit.requestId, code: "out_of_reach" });
  assert.equal(game.model.getBlock(edit.x, edit.y, edit.z), 3);
  assert.equal(game.timers.size, 0);
  input(game.elements.get("#touch-mine"), "pointerdown", { pointerId: 2, pointerType: "touch" });
  input(game.elements.get("#touch-mine"), "pointerup", { pointerId: 2 });
  game.change(1, edit.x, edit.y, edit.z, 0, 3, edit.requestId);
  assert.equal(game.model.getBlock(edit.x, edit.y, edit.z), 0);
  assert.equal(game.timers.size, 0);
  game.emit("room-left", {});
});

test("shared log edits preserve their orientation until the server confirms the change", () => {
  const game = createGame();
  game.join();
  const orientation = game.worldApi.createModel(game.roomWorld).orientationFromNormal([0, 0, -1]);
  game.change(1, 22, 4, 20, 4, 0, "oriented-log", orientation);
  assert.equal(game.model.getBlock(22, 4, 20), 4);
  assert.equal(game.model.getOrientation(22, 4, 20), orientation);
  game.emit("room-left", {});
  assert.equal(game.model.getOrientation(22, 4, 20), 0);
});

test("placing a log against a side face chooses the horizontal axis from the raycast", () => {
  const game = createGame();
  const world = game.roomWorld;
  world.blocks.fill(0);
  world.orientations.fill(0);
  world.blocks[(2 * world.depth + 18) * world.width + 20] = 3;
  game.join();
  game.selectBlock(4);
  const edits = [];
  game.window.addEventListener("moneycraft:send-block-edit", (event) => edits.push(event.detail));
  input(game.elements.get("#touch-place"), "pointerdown", { pointerId: 31, pointerType: "touch" });
  input(game.elements.get("#touch-place"), "pointerup", { pointerId: 31 });

  assert.equal(edits.length, 1);
  assert.deepEqual([edits[0].x, edits[0].y, edits[0].z], [20, 2, 19]);
  assert.deepEqual(Array.from(game.worldApi.createModel(world)
    .getOrientationAxes(edits[0].orientation).y), [0, 0, 1]);
  game.change(1, edits[0].x, edits[0].y, edits[0].z, 4, 0, edits[0].requestId, edits[0].orientation);
  assert.equal(game.model.getOrientation(20, 2, 19), edits[0].orientation);
  game.emit("room-left", {});
});

test("held mining repeats below the server edit limit and stops on release or rejection", () => {
  const game = createGame();
  game.join();
  const edits = [];
  game.window.addEventListener("moneycraft:send-block-edit", (event) => edits.push(event.detail));
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 0, movementY: 300 });
  input(game.elements.get("#game"), "mousedown", { button: 0 });
  assert.equal(edits.length, 1);

  assert.equal(game.runTimeout(200), true);
  assert.equal(edits.length, 1);
  const first = edits[0];
  game.change(1, first.x, first.y, first.z, 0, first.expectedBlock, first.requestId);
  assert.equal(game.runTimeout(50), true);
  assert.equal(edits.length, 2);

  const second = edits[1];
  game.emit("edit-rejected", { requestId: second.requestId, code: "rate_limited" });
  assert.equal(game.runTimeout(200), false);
  input(game.window, "mouseup");
  game.emit("room-left", {});
});

test("held touch mining stops on pointer cancellation and room disconnect", () => {
  const game = createGame();
  game.join();
  let edits = 0;
  game.window.addEventListener("moneycraft:send-block-edit", () => { edits += 1; });
  game.document.pointerLockElement = game.elements.get("#game");
  input(game.window, "mousemove", { movementX: 0, movementY: 300 });
  const button = game.elements.get("#touch-mine");
  input(button, "pointerdown", { pointerId: 7, pointerType: "touch" });
  assert.equal(edits, 1);
  input(button, "pointercancel", { pointerId: 7 });
  assert.equal(game.runTimeout(200), false);
  assert.equal(game.timers.size, 1);

  input(button, "pointerdown", { pointerId: 8, pointerType: "touch" });
  assert.equal(edits, 1);
  game.emit("room-left", {});
  assert.equal(game.runTimeout(200), false);
});

test("invalid snapshots preserve the current world and surface a protocol error", () => {
  const game = createGame();
  game.join();
  const before = game.model.serialize();
  let failed = false;
  game.window.addEventListener("moneycraft:world-protocol-error", () => { failed = true; });
  game.emit("world-snapshot", { revision: 1, world: { ...game.roomWorld, blocks: [9] } });
  assert.equal(failed, true);
  assert.deepEqual(game.model.serialize(), before);
  game.emit("room-left", {});
});

test("joining avoids occupied spawn positions and sends the new position immediately", () => {
  const game = createGame();
  let state;
  game.window.addEventListener("moneycraft:send-player-state", (event) => { state = event.detail; });
  game.join([{ id: "other", displayName: "Builder", state: { x: 20.5, y: 1, z: 20.5, yaw: 0, pitch: 0 } }]);
  assert.ok(state);
  assert.ok(Math.hypot(state.x - 20.5, state.z - 20.5) >= 1);
  game.frame();
  assert.deepEqual(game.errors, []);
  game.emit("room-left", {});
});

test("double jump toggles flight, hovers, ascends, descends and resumes gravity", () => {
  const game = createGame();
  game.join();
  startFlying(game);
  const hoverY = game.state().y;
  game.frame(15);
  assert.equal(game.state().y, hoverY);
  input(game.window, "keydown", { code: "Space", repeat: false });
  game.frame(10);
  input(game.window, "keyup", { code: "Space" });
  assert.ok(Math.abs(game.state().y - hoverY - 1.5) < 0.001);
  game.frame(10);
  const upperY = game.state().y;
  input(game.window, "keydown", { code: "ShiftLeft" });
  game.frame(5);
  input(game.window, "keyup", { code: "ShiftLeft" });
  assert.ok(Math.abs(game.state().y - upperY + 0.75) < 0.001);
  pressJump(game);
  game.advance(150);
  pressJump(game);
  assert.equal(game.elements.get("#flight-status").hidden, true);
  const fallingY = game.state().y;
  game.frame(3);
  assert.ok(game.state().y < fallingY);
  game.frame(60);
  assert.equal(game.state().y, 1);
});

test("flight requires separate presses within 300ms, not keyboard auto-repeat", () => {
  for (const interval of [299, 300, 301]) {
    const game = createGame();
    game.join();
    pressJump(game);
    game.advance(interval);
    pressJump(game);
    assert.equal(game.elements.get("#flight-status").hidden, interval > 300);
  }
  const game = createGame();
  game.join();
  input(game.window, "keydown", { code: "Space", repeat: false });
  game.advance(100);
  input(game.window, "keydown", { code: "Space", repeat: true });
  assert.equal(game.elements.get("#flight-status").hidden, true);
});

test("flight respects floor, ceiling, walls and network height limit; resync preserves altitude", () => {
  const game = createGame();
  game.join();
  startFlying(game);
  const { x, z } = game.state();
  game.model.setBlock(Math.floor(x), 4, Math.floor(z), 3);
  input(game.window, "keydown", { code: "Space", repeat: false });
  game.frame(40);
  assert.ok(game.state().y + 1.7 <= 4.001);
  game.model.setBlock(Math.floor(x), 4, Math.floor(z), 0);
  game.frame(250);
  assert.equal(game.state().y, 30);
  input(game.window, "keyup", { code: "Space" });
  game.emit("world-snapshot", { world: game.roomWorld, revision: 0 });
  assert.equal(game.state().y, 30);
  input(game.window, "keydown", { code: "ShiftRight" });
  game.frame(250);
  input(game.window, "keyup", { code: "ShiftRight" });
  assert.equal(game.state().y, 1);
  game.model.setBlock(Math.floor(x), 1, Math.floor(z) - 1, 3);
  input(game.window, "keydown", { code: "KeyW" });
  game.frame(20);
  assert.ok(game.state().z >= Math.floor(z) + 0.28);
});

test("touch movement/look and held flight buttons work together and cancel cleanly", () => {
  const game = createGame();
  game.join();
  const canvas = game.elements.get("#game");
  const jump = game.elements.get("#touch-jump");
  const down = game.elements.get("#touch-descend");
  const touch = { pointerType: "touch", pointerId: 1, clientX: 70, clientY: 470 };
  input(canvas, "pointerdown", touch);
  input(canvas, "pointermove", { ...touch, clientY: 426 });
  input(canvas, "pointerdown", { ...touch, pointerId: 2, clientX: 700 });
  input(canvas, "pointermove", { ...touch, pointerId: 2, clientX: 730 });
  const start = game.state();
  game.frame(5);
  assert.notEqual(game.state().z, start.z);
  assert.notEqual(game.state().yaw, 0);
  assert.equal(game.elements.get(".game-card").classList.contains("touch-enabled"), true);
  input(canvas, "pointercancel", touch);
  const stopped = game.state();
  game.frame(5);
  assert.equal(game.state().z, stopped.z);
  input(jump, "pointerdown", { ...touch, pointerId: 3 });
  input(jump, "pointerup", { ...touch, pointerId: 3 });
  game.advance(150);
  input(jump, "pointerdown", { ...touch, pointerId: 3 });
  game.frame(5);
  input(jump, "lostpointercapture", { ...touch, pointerId: 3 });
  const altitude = game.state().y;
  game.frame(5);
  assert.equal(game.state().y, altitude);
  input(down, "pointerdown", { ...touch, pointerId: 4 });
  game.frame(3);
  assert.ok(game.state().y < altitude);
  input(game.window, "blur");
  const blurred = game.state();
  game.frame(5);
  assert.equal(game.state().y, blurred.y);
  input(jump, "pointerdown", { ...touch, pointerId: 3 });
  game.document.hidden = true;
  input(game.document, "visibilitychange");
  const hidden = game.state().y;
  game.frame(5);
  assert.equal(game.state().y, hidden);
});

test("changing worlds resets held input and restores solo flight independently", () => {
  const game = createGame();
  startFlying(game);
  input(game.window, "keydown", { code: "Space", repeat: false });
  game.join();
  assert.equal(game.elements.get("#flight-status").hidden, true);
  game.emit("room-left", {});
  assert.equal(game.elements.get("#flight-status").hidden, false);
  const y = game.state().y;
  game.frame(10);
  assert.equal(game.state().y, y);
});

test("fullscreen supports native exit and page-filling fallback without hiding the hotbar", async () => {
  for (const fullscreen of ["unsupported", "native"]) {
    const game = createGame({ fullscreen });
    const button = game.elements.get("#fullscreen-game");
    const card = game.elements.get(".game-card");
    input(button, "click");
    await Promise.resolve();
    assert.equal(button.attributes.get("aria-pressed"), "true");
    assert.equal(card.classList.contains("is-expanded"), true);
    assert.equal(game.elements.get("#hotbar").children.length, 6);
    if (fullscreen === "native") await game.document.exitFullscreen();
    else input(game.window, "keydown", { code: "Escape" });
    assert.equal(button.attributes.get("aria-pressed"), "false");
    assert.equal(game.document.body.classList.contains("game-expanded"), false);
  }
});

test("fullscreen denial is reported and leaves the normal layout intact", async () => {
  const game = createGame({ fullscreen: "rejected" });
  input(game.elements.get("#fullscreen-game"), "click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(game.errors.length, 1);
  assert.equal(game.elements.get("#fullscreen-game").attributes.get("aria-pressed"), "false");
  assert.match(game.elements.get("#game-message").textContent, /切り替えられません/);
});
