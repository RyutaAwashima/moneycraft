"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const modelSource = fs.readFileSync(path.join(__dirname, "avatar-model.js"), "utf8");
const editorSource = fs.readFileSync(path.join(__dirname, "avatar-editor.js"), "utf8");
const context = {};
vm.runInNewContext(modelSource, context);
const api = context.MoneycraftAvatar;
const { defaults, options, isAppearance, createBoxes, createMesh, storageKey, createPose, posePositions } = api;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("avatar schema accepts only versioned finite choices, not arbitrary geometry, text or images", () => {
  assert.equal(isAppearance(defaults), true);
  for (const [key, entries] of Object.entries(options)) {
    assert.ok(Object.isFrozen(entries));
    for (const entry of entries) {
      assert.equal(isAppearance({ ...defaults, [key]: entry.id }), true);
      if (entry.color) assert.match(entry.color, /^#[0-9a-f]{6}$/);
    }
    assert.equal(isAppearance({ ...defaults, [key]: "custom" }), false);
    const missing = { ...defaults };
    delete missing[key];
    assert.equal(isAppearance(missing), false);
  }
  for (const value of [
    null, [], "skin", 1, { ...defaults, version: 2 },
    { ...defaults, image: "data:image/png;base64,abc" },
    { ...defaults, skin: "#ffffff" }, { ...defaults, hair: "<script>" },
    { ...defaults, scale: 3 }, { ...defaults, accessory: ["cap", "scarf"] },
  ]) {
    assert.equal(isAppearance(value), false);
    assert.throws(() => createMesh(value), /Invalid avatar/);
  }
});

test("all allowed shape combinations preserve clothed fixed proportions and bounded geometry", () => {
  const fixed = new Set(["head", "torso", "sleeve", "hand", "trousers", "shoe", "eye", "smile"]);
  const base = plain(createBoxes(defaults).filter((box) => fixed.has(box.part)));
  for (const hair of options.hair) for (const outfit of options.outfit) for (const accessory of options.accessory) {
    const appearance = { ...defaults, hair: hair.id, outfit: outfit.id, accessory: accessory.id };
    const boxes = createBoxes(appearance);
    assert.deepEqual(plain(boxes.filter((box) => fixed.has(box.part))), base);
    assert.ok(boxes.length <= 40);
    for (const box of boxes) for (let axis = 0; axis < 3; axis += 1) {
      assert.ok(Number.isFinite(box.min[axis]) && Number.isFinite(box.max[axis]));
      assert.ok(box.min[axis] < box.max[axis]);
      assert.ok(box.min[axis] >= (axis === 1 ? 0 : -0.5));
      assert.ok(box.max[axis] <= (axis === 1 ? 1.8 : 0.5));
    }
    const mesh = createMesh(appearance);
    assert.equal(mesh.positions.length, boxes.length * 36 * 3);
    assert.equal(mesh.positions.length, mesh.colors.length);
    assert.ok(Array.from(mesh.positions).every(Number.isFinite));
    assert.ok(Array.from(mesh.colors).every((channel) => channel >= 0 && channel <= 1));
    assert.deepEqual(mesh, createMesh(appearance));
  }
});

test("every hairstyle stays inside the preview at supported extreme rotations and zoom", () => {
  for (const hair of options.hair) {
    const mesh = createMesh({ ...defaults, hair: hair.id, accessory: "cap" });
    for (const aspect of [0.7, 1, 1.7]) for (const yaw of [-180, -90, 0, 90, 180]) {
      for (const pitch of [-20, 35]) {
        const y = yaw * Math.PI / 180;
        const p = pitch * Math.PI / 180;
        for (let index = 0; index < mesh.positions.length; index += 3) {
          const [px, py, pz] = Array.from(mesh.positions.slice(index, index + 3));
          const x = px * Math.cos(y) + pz * Math.sin(y);
          const z = -px * Math.sin(y) + pz * Math.cos(y);
          const height = (py - 0.9) * Math.cos(p) - z * Math.sin(p);
          assert.ok(Math.abs(x * 0.96 / Math.max(1, aspect)) < 0.98);
          assert.ok(Math.abs(height * 0.96 / Math.max(1, 1 / aspect)) < 0.98);
          assert.ok(Math.abs(((py - 0.9) * Math.sin(p) + z * Math.cos(p)) * 0.3) < 1);
        }
      }
    }
  }
});

test("new hairstyles have distinct silhouettes and every hair color covers all hair parts only", () => {
  const silhouettes = new Set();
  for (const hair of options.hair) {
    const boxes = createBoxes({ ...defaults, hair: hair.id });
    silhouettes.add(JSON.stringify(boxes.map(({ part, min, max }) => ({ part, min, max }))));
    for (const color of options.hairColor) {
      const recolored = createBoxes({ ...defaults, hair: hair.id, hairColor: color.id });
      assert.deepEqual(plain(recolored.map(({ part, min, max }) => ({ part, min, max }))),
        plain(boxes.map(({ part, min, max }) => ({ part, min, max }))));
      for (let index = 0; index < boxes.length; index += 1) {
        assert.equal(recolored[index].color,
          boxes[index].color === options.hairColor.find((entry) => entry.id === defaults.hairColor).color
            ? color.color : boxes[index].color);
      }
    }
  }
  assert.equal(silhouettes.size, 8);
  assert.equal(options.hairColor.length, 11);
});

function createEditor({
  savedAppearance = null, readFailure = false, writeFailure = false,
  webgl = true, shaderFailure = false, drawError = 0,
} = {}) {
  const storage = new Map([
    ["moneycraft-3d-world-v2", "untouched world"], ["moneycraft-block-selection-v1", "untouched selection"],
  ]);
  if (savedAppearance !== null) storage.set(storageKey,
    typeof savedAppearance === "string" ? savedAppearance : JSON.stringify(savedAppearance));
  const errors = [];
  const writes = [];
  const uploads = [];
  const poseUploads = [];
  const draws = [];
  const uniforms = new Map();
  const gl = new Proxy({
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    getShaderParameter: () => !shaderFailure, getProgramParameter: () => true,
    getShaderInfoLog: () => "Test shader failure",
    getAttribLocation: (_, name) => name,
    getUniformLocation: (_, name) => name,
    uniform4f: (name, ...values) => uniforms.set(name, values),
    uniform2f: (name, ...values) => uniforms.set(name, values),
    bufferData: (_, data) => uploads.push(Array.from(data)),
    bufferSubData: (_, offset, data) => poseUploads.push(Array.from(data)),
    drawArrays: (_, start, count) => draws.push({ count, view: uniforms.get("uView"), scale: uniforms.get("uScale") }),
    getError: () => drawError,
    NO_ERROR: 0,
  }, { get: (target, key) => target[key] ?? (() => {}) });
  class Element extends EventTarget {
    children = [];
    dataset = {};
    style = {};
    attributes = new Map();
    textContent = "";
    value = "";
    disabled = false;
    clientWidth = 480;
    clientHeight = 460;
    width = 600;
    height = 640;
    append(...items) { this.children.push(...items); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    setPointerCapture() {}
    getContext() { return webgl ? gl : null; }
  }
  const elements = new Map();
  const document = new EventTarget();
  Object.assign(document, {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement() { return new Element(); },
  });
  for (const [key, value] of [["yaw", "20"], ["pitch", "10"], ["zoom", "100"]]) {
    document.querySelector(`#avatar-${key}`).value = value;
  }
  const frames = [];
  const window = new EventTarget();
  window.requestAnimationFrame = (callback) => frames.push(callback);
  const sandbox = { document, window, Event, console: { error: (...args) => errors.push(args) },
    localStorage: {
      getItem(key) { if (readFailure) throw new Error("Read denied"); return storage.get(key) ?? null; },
      setItem(key, value) {
        if (writeFailure) throw new Error("Write denied");
        writes.push(key);
        storage.set(key, value);
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(modelSource, sandbox);
  vm.runInContext(editorSource, sandbox);
  const node = (selector) => document.querySelector(selector);
  const buttons = node("#avatar-controls").children.flatMap((field) => field.children[1].children);
  const event = (target, type, properties = {}) => {
    const e = new Event(type, { cancelable: true });
    if (type === "beforeunload") Object.defineProperty(e, "returnValue", { writable: true, value: "" });
    Object.assign(e, properties);
    target.dispatchEvent(e);
    return e;
  };
  const click = (element) => { if (!element.disabled) event(element, "click"); };
  const choose = (key, value) => click(buttons.find((button) => button.dataset.field === key && button.dataset.value === value));
  let time = 0;
  const flush = (ms = 1000 / 60) => {
    time += ms;
    const pending = frames.splice(0);
    pending.forEach((callback) => callback(time));
  };
  return { node, buttons, event, click, choose, flush, frames, window, document,
    storage, errors, writes, uploads, poseUploads, draws };
}

test("motion poses start neutral, use opposing walk limbs, and reject invalid input", () => {
  for (const motion of api.motions) {
    assert.ok(createPose(motion, 0).flat().every((angle) => angle === 0));
    assert.deepEqual(createPose(motion, 1), createPose(motion, 1));
  }
  const walk = createPose("walk", 0.6);
  assert.ok(Math.abs(walk[4][0]) > 0.1);
  assert.equal(walk[4][0], -walk[5][0]);
  assert.equal(walk[2][0], -walk[3][0]);
  assert.ok(walk[2][0] * walk[4][0] < 0);
  const wave = createPose("wave", 1);
  assert.ok(wave[2][2] < -2);
  assert.ok(wave.filter((_, joint) => joint !== 2).flat().every((angle) => angle === 0));
  const look = createPose("look", 1);
  assert.ok(Math.abs(look[1][0]) > 0 && Math.abs(look[1][1]) > 0);
  assert.ok(look.filter((_, joint) => joint !== 1).flat().every((angle) => angle === 0));
  for (const [mode, seconds] of [["bad", 1], ["walk", -1], ["wave", NaN], ["look", Infinity]]) {
    assert.throws(() => createPose(mode, seconds), /Invalid avatar/);
  }
  assert.throws(() => posePositions(createMesh(defaults), []), /Invalid avatar pose/);
});

test("soft-doll uses bevelled surfaces and slimmer limbs while preserving voxel geometry by default", () => {
  const voxel = createMesh(defaults);
  const soft = createMesh(defaults, "soft-doll");
  assert.deepEqual(voxel, createMesh(defaults, "voxel"));
  assert.notDeepEqual(soft.positions, voxel.positions);
  assert.ok(soft.positions.length > voxel.positions.length);
  assert.throws(() => createMesh(defaults, "unknown"), /Invalid avatar style/);
  for (const mesh of [voxel, soft]) {
    assert.equal(mesh.positions.length, mesh.colors.length);
    assert.equal(mesh.joints.length * 3, mesh.positions.length);
    assert.ok(Array.from(mesh.positions).every(Number.isFinite));
    assert.ok(Array.from(mesh.colors).every((value) => value >= 0 && value <= 1));
  }
  const extent = (mesh, joint, axis) => Array.from(mesh.positions)
    .filter((_, index) => index % 3 === axis && mesh.joints[Math.floor(index / 3)] === joint);
  for (const joint of [2, 3, 4, 5]) {
    const a = extent(voxel, joint, 0);
    const b = extent(soft, joint, 0);
    assert.ok(Math.max(...b) - Math.min(...b) < Math.max(...a) - Math.min(...a));
  }
  let diagonalFaces = 0;
  for (let index = 0; index < soft.positions.length; index += 9) {
    const a = Array.from(soft.positions.slice(index, index + 3));
    const b = Array.from(soft.positions.slice(index + 3, index + 6), (value, axis) => value - a[axis]);
    const c = Array.from(soft.positions.slice(index + 6, index + 9), (value, axis) => value - a[axis]);
    const n = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
    assert.ok(Math.hypot(...n) > 0.000000001);
    if (n.filter((value) => Math.abs(value) > 0.00000001).length > 1) diagonalFaces += 1;
  }
  assert.ok(diagonalFaces > 100, "softness must change the mesh silhouette, not only colors");
});

test("soft-doll shoulders follow the torso contour and arms rotate about their inset attachments", () => {
  const mesh = createMesh(defaults, "soft-doll");
  const boxes = createBoxes(defaults);
  const torso = boxes.findIndex((box) => box.part === "torso");
  const torsoVertices = mesh.positions.slice(torso * 180 * 3, (torso + 1) * 180 * 3);
  const torsoWidth = Math.max(...Array.from(torsoVertices).filter((_, index) => index % 3 === 0));
  assert.ok(torsoWidth < 0.2);
  for (const joint of [2, 3]) {
    const side = joint === 2 ? -1 : 1;
    const vertices = [];
    for (let vertex = 0; vertex < mesh.joints.length; vertex += 1) {
      if (mesh.joints[vertex] === joint) vertices.push(vertex * 3);
    }
    const xs = vertices.filter((offset) => mesh.positions[offset + 1] > 0.9)
      .map((offset) => mesh.positions[offset] * side);
    assert.ok(Math.max(...xs) <= 0.312, "shoulder silhouette must not extend to the former wide-arm position");
    assert.ok(Math.abs(Math.min(...xs) - torsoWidth) < 0.015, "sleeve must meet the torso contour");
    assert.equal(mesh.pivots[joint][0], side * 0.25);
    for (const motion of ["walk", "wave"]) for (const seconds of [0.2, 0.6, 1, 2, 3]) {
      const pose = createPose(motion, seconds);
      const posed = posePositions(mesh, pose);
      const pivot = mesh.pivots[joint];
      for (const offset of vertices) {
        const radius = (points) => Math.hypot(...Array.from(points.slice(offset, offset + 3),
          (value, axis) => value - pivot[axis]));
        assert.ok(Math.abs(radius(posed) - radius(mesh.positions)) < 0.000001);
      }
      const attachment = { ...mesh, positions: new Float32Array(pivot), joints: new Uint8Array([joint]) };
      const posedAttachment = posePositions(attachment, pose);
      assert.ok(Array.from(posedAttachment).every((value, axis) =>
        Math.abs(value - attachment.positions[axis]) < 0.000001));
    }
  }
  assert.equal(mesh.positions.length / 540, boxes.length + 1, "no separate projecting shoulder blocks");
  assert.equal(createMesh(defaults, "voxel").pivots, undefined, "voxel keeps its original rig");
});

test("all soft-doll appearances and motions remain finite, bounded and rig-compatible", () => {
  for (const hair of options.hair) for (const outfit of options.outfit) for (const accessory of options.accessory) {
    const appearance = { ...defaults, hair: hair.id, outfit: outfit.id, accessory: accessory.id };
    const mesh = createMesh(appearance, "soft-doll");
    assert.ok(mesh.positions.length / 9 < 3000);
    assert.deepEqual(posePositions(mesh, createPose("still", 0)), mesh.positions);
    for (const motion of api.motions) {
      const positions = posePositions(mesh, createPose(motion, 1));
      assert.ok(Array.from(positions).every(Number.isFinite));
      for (const yaw of [0, 45, 90, 180]) for (const pitch of [-20, 35]) {
        const y = yaw * Math.PI / 180;
        const p = pitch * Math.PI / 180;
        for (let index = 0; index < positions.length; index += 3) {
          const x = positions[index] * Math.cos(y) + positions[index + 2] * Math.sin(y);
          const z = -positions[index] * Math.sin(y) + positions[index + 2] * Math.cos(y);
          const height = (positions[index + 1] - 0.9) * Math.cos(p) - z * Math.sin(p);
          assert.ok(Math.abs(x * 0.96) < 0.98 && Math.abs(height * 0.96) < 0.98,
            `${hair.id}/${outfit.id}/${accessory.id}/${motion}`);
        }
      }
    }
  }
});

test("comparison style preserves appearance, saved data and paused animation phase", () => {
  const editor = createEditor({ savedAppearance: defaults });
  editor.flush();
  const voxel = editor.uploads.at(-2);
  editor.click(editor.node("#avatar-motion-wave"));
  editor.flush();
  editor.flush(100);
  editor.flush(100);
  editor.click(editor.node("#avatar-motion-pause"));
  editor.flush();
  editor.click(editor.node("#avatar-style-soft-doll"));
  editor.flush();
  assert.notDeepEqual(editor.uploads.at(-2), voxel);
  assert.equal(editor.node("#avatar-style-soft-doll").attributes.get("aria-pressed"), "true");
  assert.equal(editor.node("#avatar-save").disabled, true);
  assert.match(editor.node("#avatar-motion-status").textContent, /一時停止中/);
  editor.choose("hair", "twintails");
  editor.click(editor.node("#avatar-save"));
  assert.deepEqual(JSON.parse(editor.storage.get(storageKey)), { ...plain(defaults), hair: "twintails" });
  editor.click(editor.node("#avatar-style-voxel"));
  editor.flush();
  assert.equal(editor.node("#avatar-style-soft-doll").attributes.get("aria-pressed"), "false");
  assert.equal(editor.node("#avatar-save").disabled, true);
  assert.equal(editor.writes.length, 1);
  assert.deepEqual(editor.errors, []);
});

test("rigged rotations preserve rigid parts and head attachments while the body stays fixed", () => {
  for (const hair of options.hair) for (const accessory of options.accessory) {
    const appearance = { ...defaults, hair: hair.id, accessory: accessory.id };
    const mesh = createMesh(appearance);
    const boxes = createBoxes(appearance);
    assert.equal(mesh.joints.length * 3, mesh.positions.length);
    const neutral = posePositions(mesh, createPose("still", 0));
    assert.deepEqual(neutral, mesh.positions);
    const original = mesh.positions.slice();
    const posed = posePositions(mesh, createPose("look", 1));
    for (let box = 0; box < boxes.length; box += 1) {
      const joint = mesh.joints[box * 36];
      const headPart = ["head", "eye", "smile", "fringe", "ponytail", "ponytail-root", "twintail", "twintail-root"]
        .includes(boxes[box].part) || /^(hair-|glasses|cap)/.test(boxes[box].part);
      assert.equal(joint === 1, headPart, boxes[box].part);
      for (let vertex = box * 36; vertex < (box + 1) * 36; vertex += 1) {
        const offset = vertex * 3;
        if (joint !== 1) assert.deepEqual(posed.slice(offset, offset + 3), original.slice(offset, offset + 3));
        const pivot = joint === 1 ? [0, 1.3, 0] : [0, 0, 0];
        const radius = (points) => Math.hypot(...Array.from(points.slice(offset, offset + 3),
          (value, axis) => value - pivot[axis]));
        assert.ok(Math.abs(radius(posed) - radius(original)) < 0.000001);
      }
    }
    assert.deepEqual(mesh.positions, original, "posing must not mutate the rest mesh");
  }
  const mesh = createMesh(defaults);
  const wave = posePositions(mesh, createPose("wave", 1));
  const hand = createBoxes(defaults).findIndex((box) => box.part === "hand");
  assert.ok(wave[hand * 108 + 1] > 1.3, "the waving hand rises above its shoulder");
  const pivots = [[0, 0, 0], [0, 1.3, 0], [-0.32, 1.23, 0], [0.32, 1.23, 0],
    [-0.12, 0.64, 0], [0.12, 0.64, 0]];
  for (const motion of ["walk", "wave"]) {
    const positions = posePositions(mesh, createPose(motion, 1));
    for (let vertex = 0; vertex < mesh.joints.length; vertex += 1) {
      const pivot = pivots[mesh.joints[vertex]];
      const radius = (points) => Math.hypot(...Array.from(points.slice(vertex * 3, vertex * 3 + 3),
        (value, axis) => value - pivot[axis]));
      assert.ok(Math.abs(radius(positions) - radius(mesh.positions)) < 0.000001);
    }
  }
});

test("animated geometry fits the preview at maximum zoom across all hair and motion choices", () => {
  for (const hair of options.hair) for (const accessory of options.accessory) {
    const mesh = createMesh({ ...defaults, hair: hair.id, accessory: accessory.id });
    for (const motion of api.motions) for (const seconds of [0.2, 0.6, 1, 2, 3]) {
      const positions = posePositions(mesh, createPose(motion, seconds));
      for (const yaw of [0, 45, 90, 180]) for (const pitch of [-20, 35]) {
        const y = yaw * Math.PI / 180;
        const p = pitch * Math.PI / 180;
        for (let index = 0; index < positions.length; index += 3) {
          const x = positions[index] * Math.cos(y) + positions[index + 2] * Math.sin(y);
          const z = -positions[index] * Math.sin(y) + positions[index + 2] * Math.cos(y);
          const height = (positions[index + 1] - 0.9) * Math.cos(p) - z * Math.sin(p);
          assert.ok(Math.abs(x * 0.96) < 0.98 && Math.abs(height * 0.96) < 0.98,
            `${hair.id}/${accessory.id}/${motion}/${seconds}`);
        }
      }
    }
  }
});

test("animation plays, pauses, resumes and resets without saving or rebuilding appearance", () => {
  const editor = createEditor({ savedAppearance: defaults });
  editor.flush();
  const uploads = editor.uploads.length;
  editor.click(editor.node("#avatar-motion-walk"));
  editor.flush();
  const neutral = editor.poseUploads.at(-1);
  for (let frame = 0; frame < 20; frame += 1) editor.flush();
  assert.notDeepEqual(editor.poseUploads.at(-1), neutral);
  assert.equal(editor.frames.length, 1);
  assert.equal(editor.node("#avatar-motion-walk").attributes.get("aria-pressed"), "true");
  editor.click(editor.node("#avatar-motion-pause"));
  editor.flush();
  const paused = editor.poseUploads.at(-1);
  assert.equal(editor.frames.length, 0);
  editor.node("#avatar-yaw").value = "80";
  editor.event(editor.node("#avatar-yaw"), "input");
  editor.flush();
  assert.deepEqual(editor.poseUploads.at(-1), paused);
  editor.click(editor.node("#avatar-motion-pause"));
  editor.flush(5000);
  assert.deepEqual(editor.poseUploads.at(-1), paused, "resume must not jump over elapsed pause time");
  editor.flush();
  assert.notDeepEqual(editor.poseUploads.at(-1), paused);
  editor.click(editor.node("#avatar-motion-reset"));
  editor.flush();
  assert.deepEqual(editor.poseUploads.at(-1), neutral);
  assert.equal(editor.frames.length, 0);
  assert.equal(editor.uploads.length, uploads);
  assert.equal(editor.writes.length, 0);
  assert.equal(editor.node("#avatar-save").disabled, true);
});

test("animation stops while hidden and remains paused until explicitly resumed", () => {
  const editor = createEditor();
  editor.click(editor.node("#avatar-motion-look"));
  editor.flush();
  editor.flush();
  const draws = editor.draws.length;
  editor.document.hidden = true;
  editor.event(editor.document, "visibilitychange");
  editor.flush(10000);
  assert.equal(editor.draws.length, draws);
  assert.equal(editor.frames.length, 0);
  assert.match(editor.node("#avatar-motion-status").textContent, /一時停止中/);
  editor.document.hidden = false;
  editor.event(editor.document, "visibilitychange");
  editor.flush();
  assert.equal(editor.frames.length, 0);
  editor.click(editor.node("#avatar-motion-pause"));
  editor.flush();
  assert.equal(editor.frames.length, 1);
  editor.choose("hair", "ponytail");
  editor.flush();
  assert.deepEqual(editor.errors, []);
});

test("editor exposes finite accessible choices and previews drafts without automatically saving", () => {
  const editor = createEditor();
  assert.equal(editor.buttons.length, Object.values(options).reduce((sum, entries) => sum + entries.length, 0));
  for (const button of editor.buttons) {
    assert.ok(button.attributes.get("aria-label"));
    assert.ok(["true", "false"].includes(button.attributes.get("aria-pressed")));
    assert.equal(button.type, "button");
  }
  editor.flush();
  assert.equal(editor.draws.length, 1);
  assert.equal(editor.frames.length, 0, "static preview has no continuous render loop");
  const original = editor.uploads.at(-1);
  editor.choose("top", "ocean");
  editor.flush();
  assert.notDeepEqual(editor.uploads.at(-1), original);
  assert.equal(editor.writes.length, 0);
  assert.match(editor.node("#avatar-status").textContent, /まだ保存/);
  assert.equal(editor.node("#avatar-status").dataset.error, "false");
});

test("explicit save persists only validated appearance and restores it in a new editor", () => {
  const editor = createEditor();
  editor.choose("hair", "bob");
  editor.choose("accessory", "scarf");
  editor.choose("accent", "coral");
  editor.click(editor.node("#avatar-save"));
  const saved = JSON.parse(editor.storage.get(storageKey));
  assert.equal(isAppearance(saved), true);
  assert.deepEqual([saved.hair, saved.accessory, saved.accent], ["bob", "scarf", "coral"]);
  assert.deepEqual(editor.writes, [storageKey]);
  assert.equal(editor.storage.get("moneycraft-3d-world-v2"), "untouched world");
  assert.equal(editor.storage.get("moneycraft-block-selection-v1"), "untouched selection");
  assert.equal(editor.node("#avatar-save").disabled, true);
  assert.match(editor.node("#avatar-status").textContent, /参加者へソフトドール風で表示/);
  const restored = createEditor({ savedAppearance: saved });
  assert.equal(restored.buttons.find((button) => button.dataset.value === "bob").attributes.get("aria-pressed"), "true");
  assert.equal(restored.node("#avatar-save").disabled, true);
  assert.equal(restored.writes.length, 0);
});

test("added hair choices round-trip in existing version-one storage without changing the base skin", () => {
  for (const hair of ["long", "ponytail", "twintails", "buns"]) {
    for (const hairColor of ["caramel", "auburn", "rose", "lavender", "blue", "sage"]) {
      const editor = createEditor({ savedAppearance: defaults });
      editor.choose("hair", hair);
      editor.choose("hairColor", hairColor);
      editor.click(editor.node("#avatar-save"));
      const saved = JSON.parse(editor.storage.get(storageKey));
      assert.deepEqual(saved, { ...plain(defaults), hair, hairColor });
      const restored = createEditor({ savedAppearance: saved });
      for (const [field, value] of [["hair", hair], ["hairColor", hairColor]]) {
        assert.equal(restored.buttons.find((button) => button.dataset.field === field && button.dataset.value === value)
          .attributes.get("aria-pressed"), "true");
      }
      assert.equal(restored.node("#avatar-save").disabled, true);
    }
  }
});

test("discard and defaults affect only drafts until explicitly saved", () => {
  const saved = { ...defaults, top: "berry", hair: "bob" };
  const editor = createEditor({ savedAppearance: saved });
  editor.choose("hair", "crop");
  editor.click(editor.node("#avatar-discard"));
  assert.equal(editor.node("#avatar-save").disabled, true);
  editor.click(editor.node("#avatar-defaults"));
  assert.equal(editor.node("#avatar-save").disabled, false);
  assert.deepEqual(JSON.parse(editor.storage.get(storageKey)), saved);
  assert.equal(editor.writes.length, 0);
  editor.click(editor.node("#avatar-discard"));
  assert.equal(editor.node("#avatar-save").disabled, true);
  const fresh = createEditor();
  fresh.choose("hair", "none");
  fresh.click(fresh.node("#avatar-discard"));
  assert.equal(fresh.buttons.find((button) => button.dataset.field === "hair" && button.dataset.value === "short")
    .attributes.get("aria-pressed"), "true");
});

test("load failures report explicitly and never overwrite old storage", () => {
  for (const savedAppearance of ["{", { ...defaults, version: 9 }, { ...defaults, image: "custom" }]) {
    const editor = createEditor({ savedAppearance });
    assert.equal(editor.errors.length, 1);
    assert.equal(editor.node("#avatar-status").dataset.error, "true");
    const before = editor.storage.get(storageKey);
    editor.choose("top", "ocean");
    assert.match(editor.node("#avatar-status").textContent, /読み込めません/);
    assert.equal(editor.storage.get(storageKey), before);
    assert.equal(editor.writes.length, 0);
  }
  const denied = createEditor({ readFailure: true });
  assert.match(denied.node("#avatar-status").textContent, /読み込めません/);
});

test("save failures retain the editable draft and previous saved appearance", () => {
  const editor = createEditor({ writeFailure: true, savedAppearance: defaults });
  editor.choose("top", "ocean");
  editor.click(editor.node("#avatar-save"));
  assert.equal(editor.errors.length, 1);
  assert.match(editor.node("#avatar-status").textContent, /保存できません/);
  assert.equal(editor.node("#avatar-save").disabled, false);
  assert.deepEqual(JSON.parse(editor.storage.get(storageKey)), plain(defaults));
  assert.equal(editor.buttons.find((button) => button.dataset.value === "ocean").attributes.get("aria-pressed"), "true");
});

test("unavailable or failed WebGL stays explicit while appearance saving remains usable", () => {
  for (const failure of [{ webgl: false }, { shaderFailure: true }, { drawError: 1282 }]) {
    const editor = createEditor(failure);
    editor.flush();
    assert.equal(editor.errors.length, 1);
    assert.equal(editor.node("#avatar-motion-walk").disabled, true);
    assert.equal(editor.node("#avatar-motion-pause").disabled, true);
    assert.equal(editor.frames.length, 0);
    assert.match(editor.node("#avatar-status").textContent, /プレビューを表示できません/);
    editor.choose("top", "ocean");
    editor.click(editor.node("#avatar-save"));
    assert.equal(JSON.parse(editor.storage.get(storageKey)).top, "ocean");
    assert.equal(editor.node("#avatar-status").dataset.error, "true");
    assert.match(editor.node("#avatar-status").textContent, /プレビューは利用できません/);
  }
  const editor = createEditor();
  editor.event(editor.node("#avatar-preview"), "webglcontextlost");
  assert.match(editor.node("#avatar-status").textContent, /プレビューを表示できません/);
});

test("view controls rotate and zoom without changing appearance or rebuilding meshes", () => {
  const editor = createEditor();
  editor.flush();
  const uploads = editor.uploads.length;
  editor.node("#avatar-yaw").value = "90";
  editor.node("#avatar-zoom").value = "120";
  editor.event(editor.node("#avatar-yaw"), "input");
  editor.flush();
  assert.ok(Math.abs(editor.draws.at(-1).view[0]) < 0.000001);
  assert.equal(editor.node("#avatar-zoom-value").textContent, "120%");
  editor.click(editor.node("#avatar-front"));
  editor.flush();
  assert.deepEqual(editor.draws.at(-1).view, [1, 0, 1, 0]);
  assert.equal(editor.uploads.length, uploads);
  assert.equal(editor.writes.length, 0);
  assert.equal(editor.node("#avatar-dirty").textContent, "未保存の試作");
});

test("dragging clamps view angles, respects pointer ownership and stops on cancellation or blur", () => {
  const editor = createEditor();
  const canvas = editor.node("#avatar-preview");
  editor.event(canvas, "pointerdown", { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10 });
  editor.event(canvas, "pointermove", { pointerId: 2, clientX: 500, clientY: 500 });
  assert.equal(editor.node("#avatar-yaw").value, "20");
  editor.event(canvas, "pointermove", { pointerId: 1, clientX: 10000, clientY: 10000 });
  assert.equal(editor.node("#avatar-pitch").value, "35");
  assert.ok(Math.abs(Number(editor.node("#avatar-yaw").value)) <= 180);
  editor.event(canvas, "pointercancel", { pointerId: 1 });
  const yaw = editor.node("#avatar-yaw").value;
  editor.event(canvas, "pointermove", { pointerId: 1, clientX: 0, clientY: 0 });
  assert.equal(editor.node("#avatar-yaw").value, yaw);
  editor.event(canvas, "pointerdown", { pointerId: 3, pointerType: "mouse", button: 0, clientX: 0, clientY: 0 });
  editor.event(editor.window, "blur");
  editor.event(canvas, "pointermove", { pointerId: 3, clientX: 100, clientY: 100 });
  assert.equal(editor.node("#avatar-yaw").value, yaw);
});

test("unused color controls are disabled and unsaved edits warn before leaving", () => {
  const editor = createEditor();
  const accents = editor.buttons.filter((button) => button.dataset.field === "accent");
  assert.ok(accents.every((button) => button.disabled));
  editor.choose("accessory", "cap");
  assert.ok(accents.every((button) => !button.disabled));
  editor.choose("hair", "none");
  assert.ok(editor.buttons.filter((button) => button.dataset.field === "hairColor").every((button) => button.disabled));
  assert.equal(editor.event(editor.window, "beforeunload").defaultPrevented, true);
  editor.click(editor.node("#avatar-save"));
  assert.equal(editor.event(editor.window, "beforeunload").defaultPrevented, false);
});
