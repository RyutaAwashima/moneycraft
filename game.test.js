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
  recordUvs = false,
} = {}) {
  const uploads = [];
  const errors = [];
  const soundEvents = [];
  const texturePixels = [];
  const previews = [];
  const textureUploads = [];
  const uvUploads = [];
  const context2d = {
    fillRect: (x, y) => texturePixels.push({ x, y, color: context2d.fillStyle }),
    drawImage: (...args) => previews.push(args),
  };
  const drawCalls = [];
  const gl = new Proxy({
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    createTexture: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: (_, name) => ["aPosition", "aColor", "aUv"].indexOf(name),
    bufferData: (_, data) => {
      uploads.push(data.length);
      if (recordUvs && uploads.length % 3 === 0) uvUploads.push(data);
    },
    texImage2D: (...args) => textureUploads.push(args.at(-1)),
    drawArrays: (...args) => drawCalls.push(args),
    TRIANGLES: 4,
    LINES: 1,
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
  document.querySelector("#debug-indicator").hidden = true;
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
  const runTimeout = (delay) => {
    const timer = [...timers.entries()].find(([, value]) => value.delay === delay);
    if (!timer) return false;
    timers.delete(timer[0]);
    timer[1].callback();
    return true;
  };
  let state;
  window.addEventListener("moneycraft:send-player-state", (event) => { state = event.detail; });
  return { get model() { return model; }, worldApi, originalSave, elements, uploads, drawCalls, saved, soundEvents,
    texturePixels, previews, textureUploads, uvUploads, emit, join, change, roomWorld, window, document, timers,
    frame: (count = 1) => { for (let i = 0; i < count; i += 1) { time += 1000 / 30; frame(time); } },
    advance: (ms) => { time += ms; },
    runTimeout,
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

test("fifteen materials render previews and only edited chunks are uploaded", () => {
  const game = createGame();
  assert.equal(game.elements.get("#hotbar").children.length, 15);
  assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
  game.elements.get("#hotbar").children[6].dispatchEvent(new Event("click"));
  assert.equal(game.elements.get("#selected-block-name").textContent, "レンガブロック");
  assert.equal(game.elements.get("#hotbar").children[6].attributes.get("aria-pressed"), "true");
  input(game.window, "keydown", { code: "Digit9" });
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

test("colored walls have textured previews, correct atlas UVs and no fictitious number shortcuts", () => {
  const game = createGame({ recordUvs: true });
  const atlas = game.textureUploads[0];
  assert.equal(atlas.width, 512);
  assert.equal(atlas.height, 16);
  assert.equal(game.texturePixels.length, 17 * 16 * 16);
  assert.equal(game.previews.length, 15);
  for (let tile = 0; tile < 15; tile += 1) {
    assert.equal(game.previews[tile][0], atlas);
    assert.equal(game.previews[tile][1], tile * 16);
  }
  const names = ["赤い壁ブロック", "青い壁ブロック", "黄色い壁ブロック",
    "緑の壁ブロック", "紫の壁ブロック", "黒い壁ブロック"];
  game.join();
  for (let index = 0; index < names.length; index += 1) {
    const id = 10 + index;
    const button = game.elements.get("#hotbar").children[id - 1];
    input(button, "click");
    assert.equal(button.attributes.get("aria-label"), names[index]);
    assert.equal(button.children[0].textContent, "");
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
    x >= 9 * 16 && x % 16 === 0 && y === 0).map(({ color }) => color)).size, 8);
  input(game.window, "keydown", { code: "Digit1" });
  assert.equal(game.elements.get("#selected-block-name").textContent, "草ブロック");
});

test("colored walls can be placed through touch controls in solo saves and shared edits", () => {
  for (const shared of [false, true]) {
    for (let id = 10; id <= 15; id += 1) {
      const game = createGame();
      if (shared) game.join();
      input(game.elements.get("#hotbar").children[id - 1], "click");
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
    assert.equal(game.elements.get("#hotbar").children.length, 15);
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
