"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function createGame({ legacySave = false, roomOptions = { width: 40, depth: 40, height: 20 }, fullscreen = "unsupported" } = {}) {
  const uploads = [];
  const errors = [];
  const context2d = { fillRect() {}, drawImage() {} };
  const gl = new Proxy({
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    createTexture: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: (_, name) => ["aPosition", "aColor", "aUv"].indexOf(name),
    bufferData: (_, data) => uploads.push(data.length),
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
    getContext(type) { return type === "webgl" ? gl : context2d; }
    remove() {}
  }
  const elements = new Map();
  const document = new EventTarget();
  document.querySelector = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
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
    setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback) => intervals.push(callback),
    requestAnimationFrame: (callback) => { frame = callback; },
    confirm: () => true,
  });
  const saved = new Map();
  const context = {
    window, document, CustomEvent, Event, HTMLInputElement: class {}, HTMLTextAreaElement: class {},
    crypto: webcrypto, performance: { now: () => time }, console: { error: (...args) => errors.push(args), warn() {} },
    localStorage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "world-model.js"), "utf8"), context);
  const worldApi = context.MoneycraftWorld;
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
  assert.deepEqual(errors, []);
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
  const change = (revision, x, y, z, block = 7, expectedBlock = 0, requestId = `edit-${revision}`) => emit("block-changed", {
    revision, x, y, z, block, expectedBlock, requestId, playerId: "self",
  });
  let state;
  window.addEventListener("moneycraft:send-player-state", (event) => { state = event.detail; });
  return { get model() { return model; }, worldApi, originalSave, elements, uploads, saved, emit, join, change, roomWorld, window, document, timers,
    frame: (count = 1) => { for (let i = 0; i < count; i += 1) { time += 1000 / 30; frame(time); } },
    advance: (ms) => { time += ms; },
    state: () => { for (const callback of intervals) callback(); return state; },
    errors };
}

function input(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
}

function pressJump(game) {
  input(game.window, "keydown", { code: "Space", repeat: false });
  input(game.window, "keyup", { code: "Space" });
}

function startFlying(game) {
  pressJump(game);
  game.advance(150);
  pressJump(game);
  assert.equal(game.elements.get("#flight-status").hidden, false);
}

test("nine materials render previews and only edited chunks are uploaded", () => {
  const game = createGame();
  assert.equal(game.elements.get("#hotbar").children.length, 9);
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
  game.elements.get("#touch-mine").dispatchEvent(new Event("pointerdown", { cancelable: true }));
  assert.ok(edit);
  assert.equal(edit.block, 0);
  assert.equal(edit.expectedBlock, 3);
  assert.equal(game.model.getBlock(edit.x, edit.y, edit.z), 3);
  game.emit("edit-rejected", { requestId: edit.requestId, code: "out_of_reach" });
  assert.equal(game.model.getBlock(edit.x, edit.y, edit.z), 3);
  assert.equal(game.timers.size, 0);
  game.elements.get("#touch-mine").dispatchEvent(new Event("pointerdown", { cancelable: true }));
  game.change(1, edit.x, edit.y, edit.z, 0, 3, edit.requestId);
  assert.equal(game.model.getBlock(edit.x, edit.y, edit.z), 0);
  assert.equal(game.timers.size, 0);
  game.emit("room-left", {});
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
    assert.equal(game.elements.get("#hotbar").children.length, 9);
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
