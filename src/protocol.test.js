"use strict";

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PLAYERS_PER_ROOM,
  PROTOCOL_VERSION,
  ROOM_CODE_PATTERN,
  WORLD_DIMENSIONS,
  isPlayerStatePayload,
  isBlockEditPayload,
} from "./protocol.js";

test("room codes use a fixed, unambiguous alphabet and capacity is sixteen", () => {
  assert.equal(ROOM_CODE_PATTERN.test("ABCD23"), true);
  assert.equal(ROOM_CODE_PATTERN.test("ABCI23"), false);
  assert.equal(ROOM_CODE_PATTERN.test("ABC1234"), false);
  assert.equal(MAX_PLAYERS_PER_ROOM, 16);
});

test("player states must be finite and inside world bounds", () => {
  const valid = { x: 2, y: 6, z: 3, yaw: -2.4, pitch: 0.2 };
  assert.equal(isPlayerStatePayload(valid), true);
  assert.equal(isPlayerStatePayload({ ...valid, x: WORLD_DIMENSIONS.width + 1 }), false);
  assert.equal(isPlayerStatePayload({ ...valid, y: -1 }), false);
  assert.equal(isPlayerStatePayload({ ...valid, y: Number.NaN }), false);
  assert.equal(isPlayerStatePayload({ ...valid, pitch: 2 }), false);
  assert.equal(isPlayerStatePayload(null), false);
  assert.equal(PROTOCOL_VERSION, 4);
});

test("block edits validate identifiers, bounds and compare-and-set operations", () => {
  const edit = { requestId: "edit-1", x: 2, y: 8, z: 3, block: 9, expectedBlock: 0 };
  assert.equal(isBlockEditPayload(edit), true);
  assert.equal(isBlockEditPayload({ ...edit, block: 0, expectedBlock: 9 }), true);
  for (const invalid of [
    null, { ...edit, x: 64 }, { ...edit, y: -1 }, { ...edit, z: 1.5 },
    { ...edit, block: 16 }, { ...edit, expectedBlock: 16 }, { ...edit, expectedBlock: 1 },
    { ...edit, block: 0 }, { ...edit, requestId: "" }, { ...edit, requestId: "x".repeat(65) },
  ]) assert.equal(isBlockEditPayload(invalid), false);
  for (let block = 10; block <= 15; block += 1) {
    assert.equal(isBlockEditPayload({ ...edit, block }), true);
    assert.equal(isBlockEditPayload({ ...edit, block: 0, expectedBlock: block }), true);
  }
});

test("validation uses the room size, including coordinates beyond the old edge", () => {
  const state = { x: 63.5, y: 6, z: 63.5, yaw: 0, pitch: 0 };
  const edit = { requestId: "edge-1", x: 63, y: 8, z: 63, block: 9, expectedBlock: 0 };
  const legacy = globalThis.MoneycraftWorld.legacyOptions;
  assert.equal(isPlayerStatePayload(state), true);
  assert.equal(isBlockEditPayload(edit), true);
  assert.equal(isPlayerStatePayload(state, legacy), false);
  assert.equal(isBlockEditPayload(edit, legacy), false);
  assert.equal(isPlayerStatePayload({ ...state, x: 64.01 }), false);
  assert.equal(isBlockEditPayload({ ...edit, z: 64 }), false);
});
