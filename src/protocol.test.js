"use strict";

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PLAYERS_PER_ROOM,
  PROTOCOL_VERSION,
  ROOM_CODE_PATTERN,
  WORLD_DIMENSIONS,
  isPlayerStatePayload,
} from "./protocol.js";

test("room codes use a fixed, unambiguous alphabet and capacity is eight", () => {
  assert.equal(ROOM_CODE_PATTERN.test("ABCD23"), true);
  assert.equal(ROOM_CODE_PATTERN.test("ABCI23"), false);
  assert.equal(ROOM_CODE_PATTERN.test("ABC1234"), false);
  assert.equal(MAX_PLAYERS_PER_ROOM, 8);
});

test("player states must be finite and inside world bounds", () => {
  const valid = { x: 2, y: 6, z: 3, yaw: -2.4, pitch: 0.2 };
  assert.equal(isPlayerStatePayload(valid), true);
  assert.equal(isPlayerStatePayload({ ...valid, x: WORLD_DIMENSIONS.width + 1 }), false);
  assert.equal(isPlayerStatePayload({ ...valid, y: -1 }), false);
  assert.equal(isPlayerStatePayload({ ...valid, y: Number.NaN }), false);
  assert.equal(isPlayerStatePayload({ ...valid, pitch: 2 }), false);
  assert.equal(isPlayerStatePayload(null), false);
  assert.equal(PROTOCOL_VERSION, 1);
});
