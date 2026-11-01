"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function createGame() {
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
    classList = { add() {}, remove() {} };
    style = { setProperty() {} };
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
  const window = new EventTarget();
  const timers = new Map();
  let nextTimer = 0;
  let frame;
  Object.assign(window, {
    setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    setInterval() {},
    requestAnimationFrame: (callback) => { frame = callback; },
    confirm: () => true,
  });
  const saved = new Map();
  const context = {
    window, document, CustomEvent, Event, HTMLInputElement: class {}, HTMLTextAreaElement: class {},
    crypto: webcrypto, performance, console: { error: (...args) => errors.push(args), warn() {} },
    localStorage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "world-model.js"), "utf8"), context);
  const worldApi = context.MoneycraftWorld;
  let model;
  context.MoneycraftWorld = {
    ...worldApi, createModel: (options) => { model = worldApi.createModel(options); return model; },
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "game.js"), "utf8"), context);
  assert.deepEqual(errors, []);
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(`moneycraft:${type}`, { detail }));
  const roomWorld = worldApi.createModel({ width: 40, depth: 40, height: 20, seed: 123 }).serialize();
  roomWorld.blocks.fill(0);
  for (let i = 0; i < 40 * 40; i += 1) roomWorld.blocks[i] = 3;
  function join(players = []) {
    emit("room-connecting", { code: "ABCD23" });
    emit("room-joined", {
      roomCode: "ABCD23", player: { id: "self" }, players, world: roomWorld, revision: 0,
    });
  }
  const change = (revision, x, y, z, block = 7, expectedBlock = 0, requestId = `edit-${revision}`) => emit("block-changed", {
    revision, x, y, z, block, expectedBlock, requestId, playerId: "self",
  });
  return { model, elements, uploads, saved, emit, join, change, roomWorld, window, document, timers,
    frame: () => frame(100), errors };
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
