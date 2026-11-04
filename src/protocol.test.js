"use strict";

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PLAYERS_PER_ROOM,
  PROTOCOL_VERSION,
  ROOM_CODE_PATTERN,
  WORLD_DIMENSIONS,
  isPlayerStatePayload,
  isPlayerAppearancePayload,
  isBlockEditPayload,
} from "./protocol.js";

test("room codes use a fixed, unambiguous alphabet and capacity is sixteen", () => {
  assert.equal(ROOM_CODE_PATTERN.test("ABCD23"), true);
  assert.equal(ROOM_CODE_PATTERN.test("ABCI23"), false);
  assert.equal(ROOM_CODE_PATTERN.test("ABC1234"), false);
  assert.equal(MAX_PLAYERS_PER_ROOM, 16);
});

test("player states must be finite and inside world bounds", () => {
  const valid = { x: 2, y: 6, z: 3, yaw: -2.4, pitch: 0.2, locomotion: "grounded" };
  assert.equal(isPlayerStatePayload(valid), true);
  assert.equal(isPlayerStatePayload({ ...valid, x: WORLD_DIMENSIONS.width + 1 }), false);
  assert.equal(isPlayerStatePayload({ ...valid, y: -1 }), false);
  assert.equal(isPlayerStatePayload({ ...valid, y: Number.NaN }), false);
  assert.equal(isPlayerStatePayload({ ...valid, pitch: 2, locomotion: "grounded" }), false);
  assert.equal(isPlayerStatePayload(null), false);
  assert.equal(PROTOCOL_VERSION, 12);
});

test("locomotion is a required finite state and pose data cannot enter position packets", () => {
  const state = { x: 2, y: 6, z: 3, yaw: 0, pitch: 0, locomotion: "grounded" };
  for (const locomotion of globalThis.MoneycraftAvatar.locomotionStates) {
    assert.equal(isPlayerStatePayload({ ...state, locomotion }), true);
  }
  for (const locomotion of [undefined, null, "", "walk", "swimming", 1, {}, []]) {
    assert.equal(isPlayerStatePayload({ ...state, locomotion }), false);
  }
  assert.equal(isPlayerStatePayload({ ...state, pose: [] }), false);
  const { locomotion, ...oldState } = state;
  assert.equal(isPlayerStatePayload(oldState), false);
});

test("shared appearances use the exact finite version-one atelier schema", () => {
  const avatar = globalThis.MoneycraftAvatar;
  assert.equal(isPlayerAppearancePayload, avatar.isAppearance);
  for (const [field, entries] of Object.entries(avatar.options)) for (const entry of entries) {
    assert.equal(isPlayerAppearancePayload({ ...avatar.defaults, [field]: entry.id }), true);
  }
  for (const value of [null, [], { ...avatar.defaults, version: 2 },
    { ...avatar.defaults, style: "voxel" }, { ...avatar.defaults, image: "https://example.test/x" },
    { ...avatar.defaults, hair: "unknown" }, { ...avatar.defaults, skin: "#ffffff" }]) {
    assert.equal(isPlayerAppearancePayload(value), false);
  }
});

test("block edits validate identifiers, bounds and compare-and-set operations", () => {
  const edit = { requestId: "edit-1", x: 2, y: 8, z: 3, block: 9, orientation: 0, expectedBlock: 0 };
  assert.equal(isBlockEditPayload(edit), true);
  assert.equal(isBlockEditPayload({ ...edit, block: 0, expectedBlock: 9 }), true);
  for (const invalid of [
    null, { ...edit, x: 64 }, { ...edit, y: -1 }, { ...edit, z: 1.5 },
    { ...edit, block: 18 }, { ...edit, expectedBlock: 18 }, { ...edit, expectedBlock: 1 },
    { ...edit, block: 0 }, { ...edit, orientation: -1 }, { ...edit, orientation: 24 },
    { ...edit, block: 0, orientation: 1 }, { ...edit, orientation: undefined },
    { ...edit, requestId: "" }, { ...edit, requestId: "x".repeat(65) },
  ]) assert.equal(isBlockEditPayload(invalid), false);
  for (let block = 10; block <= 17; block += 1) {
    assert.equal(isBlockEditPayload({ ...edit, block }), true);
    assert.equal(isBlockEditPayload({ ...edit, block: 0, expectedBlock: block }), true);
  }
  assert.equal(isBlockEditPayload({ ...edit, block: 16, orientation: 1 }), false);
  for (let orientation = 0; orientation < 24; orientation += 1) {
    assert.equal(isBlockEditPayload({ ...edit, block: 17, orientation }),
      globalThis.MoneycraftWorld.stairOrientations.includes(orientation));
  }
});

test("validation uses the room size, including coordinates beyond the old edge", () => {
  const state = { x: 63.5, y: 6, z: 63.5, yaw: 0, pitch: 0, locomotion: "grounded" };
  const edit = { requestId: "edge-1", x: 63, y: 8, z: 63, block: 9, orientation: 0, expectedBlock: 0 };
  const legacy = globalThis.MoneycraftWorld.legacyOptions;
  assert.equal(isPlayerStatePayload(state), true);
  assert.equal(isBlockEditPayload(edit), true);
  assert.equal(isPlayerStatePayload(state, legacy), false);
  assert.equal(isBlockEditPayload(edit, legacy), false);
  assert.equal(isPlayerStatePayload({ ...state, x: 64.01 }), false);
  assert.equal(isBlockEditPayload({ ...edit, z: 64 }), false);
});

test("slab merging allows only oriented slab-to-plank replacements", () => {
  const edit = { requestId: "merge", x: 2, y: 8, z: 3, block: 6, orientation: 0,
    expectedBlock: 16, expectedOrientation: 0 };
  assert.equal(isBlockEditPayload(edit), true);
  assert.equal(isBlockEditPayload({ ...edit, expectedOrientation: 20 }), true);
  for (const invalid of [
    { ...edit, expectedOrientation: undefined }, { ...edit, expectedOrientation: 1 },
    { ...edit, orientation: 1 }, { ...edit, block: 7 }, { ...edit, expectedBlock: 17 },
  ]) assert.equal(isBlockEditPayload(invalid), false);
  assert.equal(isBlockEditPayload({ ...edit, block: 16, orientation: 20, expectedBlock: 0 }), true);
});
