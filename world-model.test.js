"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "world-model.js"), "utf8");
const context = {};
context.globalThis = context;
vm.runInNewContext(source, context);
const { createModel } = context.MoneycraftWorld;

function createWorld(seed = 1234) {
  return createModel({ width: 12, depth: 12, height: 12, seed });
}

test("same seed creates identical worlds", () => {
  assert.deepEqual(createWorld(10).serialize(), createWorld(10).serialize());
  assert.notDeepEqual(createWorld(10).serialize(), createWorld(11).serialize());
});

test("block access enforces coordinates and block identifiers", () => {
  const world = createWorld();
  assert.equal(world.setBlock(2, 3, 4, 5), true);
  assert.equal(world.getBlock(2, 3, 4), 5);
  assert.equal(world.setBlock(-1, 3, 4, 1), false);
  assert.equal(world.setBlock(2, 3, 4, 6), false);
  assert.equal(world.getBlock(2, 3, 4), 5);
});

test("versioned snapshots round-trip and reject invalid data without mutation", () => {
  const original = createWorld(7);
  original.setBlock(1, 9, 1, 4);
  const snapshot = original.serialize();
  const restored = createWorld(9);

  assert.equal(restored.load(snapshot), true);
  assert.deepEqual(restored.serialize(), snapshot);
  assert.equal(restored.load({ ...snapshot, blocks: [1, 2] }), false);
  assert.deepEqual(restored.serialize(), snapshot);
});

test("legacy block arrays are accepted for local-save migration", () => {
  const original = createWorld(7);
  const blocks = original.serialize().blocks;
  const restored = createWorld(9);

  assert.equal(restored.load(blocks), true);
  assert.deepEqual(restored.serialize().blocks, blocks);
  assert.equal(restored.serialize().seed, 9);
});
