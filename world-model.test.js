"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

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

test("64-square forest-plains worlds guarantee a level, tree-free building area", () => {
  const api = context.MoneycraftWorld;
  for (const seed of [1, 123, 20261015]) {
    const world = createModel({ ...api.defaultOptions, seed });
    const groundHeights = new Set();
    let forestTrunks = 0;
    for (let z = 0; z < 64; z += 1) {
      for (let x = 0; x < 64; x += 1) {
        if (x < 38) {
          assert.equal(world.findSurface(x, z), 6);
          assert.equal(world.getBlock(x, 5, z), 1);
          for (let y = 6; y < 20; y += 1) assert.equal(world.getBlock(x, y, z), 0);
        } else {
          for (let y = 19; y >= 0; y -= 1) {
            if (world.getBlock(x, y, z) === 1) { groundHeights.add(y); break; }
          }
          for (let y = 6; y < 20; y += 1) if (world.getBlock(x, y, z) === 4) forestTrunks += 1;
        }
      }
    }
    assert.equal(world.serialize().blocks.length, 81920);
    assert.ok(38 * 64 / (64 * 64) >= 0.59);
    assert.ok(forestTrunks > 50);
    assert.ok(groundHeights.size > 1);
    assert.equal(world.terrain, "forest-plains");
    assert.ok(world.spawnCenter.x < 38);
    assert.deepEqual(world.serialize(), createModel({ ...api.defaultOptions, seed }).serialize());
  }
});

test("forest-plains terrain selection round-trips and survives reset", () => {
  const options = context.MoneycraftWorld.defaultOptions;
  const world = createModel({ ...options, seed: 123 });
  const restored = createModel({ width: 64, depth: 64, height: 20 });
  assert.equal(restored.load(world.serialize()), true);
  restored.reset(123);
  assert.deepEqual(restored.serialize(), world.serialize());
  const before = restored.serialize();
  assert.equal(restored.load({ ...before, terrain: "unknown" }), false);
  assert.deepEqual(restored.serialize(), before);
});

test("the legacy 40-square generator remains identical to the published hills", () => {
  const world = createModel({ ...context.MoneycraftWorld.legacyOptions, seed: 123 });
  const digest = createHash("sha256").update(JSON.stringify(world.serialize())).digest("hex");
  assert.equal(digest.slice(0, 16), "bac22efd313af023");
});

test("block access enforces coordinates and block identifiers", () => {
  const world = createWorld();
  assert.equal(world.setBlock(2, 3, 4, 5), true);
  assert.equal(world.getBlock(2, 3, 4), 5);
  assert.equal(world.setBlock(-1, 3, 4, 1), false);
  assert.equal(world.setBlock(2, 3, 4, 16), false);
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

test("all fifteen materials round-trip while old five- and nine-block saves remain compatible", () => {
  const old = createModel({ width: 12, depth: 12, height: 12, blockCount: 5, seed: 7 });
  const world = createWorld();
  assert.equal(world.load(old.serialize()), true);
  const nine = createModel({ width: 12, depth: 12, height: 12, blockCount: 9, seed: 7 });
  nine.setBlock(1, 9, 1, 9);
  assert.equal(world.load(nine.serialize()), true);
  assert.equal(world.getBlock(1, 9, 1), 9);
  for (let id = 1; id <= 15; id += 1) {
    assert.equal(world.setBlock(id % 12, 9, Math.floor(id / 12), id), true);
  }
  const restored = createWorld();
  assert.equal(restored.load(world.serialize()), true);
  assert.deepEqual(restored.serialize(), world.serialize());
  assert.equal(nine.load(world.serialize()), false);
  assert.deepEqual(Array.from(context.MoneycraftWorld.blocks, (block) => block.id),
    Array.from({ length: 15 }, (_, index) => index + 1));
  assert.throws(() => createModel({ width: 1, depth: 1, height: 1, blockCount: 256 }), /positive integers/);
});
