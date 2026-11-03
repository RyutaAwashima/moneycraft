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
  const legacySnapshot = world.serialize();
  legacySnapshot.version = 1;
  delete legacySnapshot.orientations;
  const digest = createHash("sha256").update(JSON.stringify(legacySnapshot)).digest("hex");
  assert.equal(digest.slice(0, 16), "bac22efd313af023");
});

test("block access enforces coordinates and block identifiers", () => {
  const world = createWorld();
  assert.equal(world.setBlock(2, 3, 4, 5), true);
  assert.equal(world.getBlock(2, 3, 4), 5);
  assert.equal(world.setBlock(-1, 3, 4, 1), false);
  assert.equal(world.setBlock(2, 3, 4, 18), false);
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

test("24 cube orientations map block axes and round-trip with world snapshots", () => {
  const api = context.MoneycraftWorld;
  assert.equal(api.orientationCount, 24);
  const world = createWorld(7);
  for (const normal of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
    const orientation = world.orientationFromNormal(normal);
    const axes = world.getOrientationAxes(orientation);
    assert.deepEqual(Array.from(axes.y), normal);
    assert.equal(axes.x.reduce((sum, value, index) => sum + value * axes.y[index], 0), 0);
    assert.deepEqual([
      axes.x[1] * axes.y[2] - axes.x[2] * axes.y[1],
      axes.x[2] * axes.y[0] - axes.x[0] * axes.y[2],
      axes.x[0] * axes.y[1] - axes.x[1] * axes.y[0],
    ], Array.from(axes.z));
  }
  assert.equal(world.orientationFromNormal([1, 1, 0]), null);
  assert.equal(world.setBlock(1, 9, 1, 4, world.orientationFromNormal([1, 0, 0])), true);
  assert.deepEqual(Array.from(world.getOrientationAxes(world.getOrientation(1, 9, 1)).y), [1, 0, 0]);

  const snapshot = world.serialize();
  const restored = createWorld(9);
  assert.equal(restored.load(snapshot), true);
  assert.deepEqual(restored.serialize(), snapshot);
  assert.equal(restored.setBlock(1, 9, 1, 0), true);
  assert.equal(restored.getOrientation(1, 9, 1), 0);
  const beforeInvalidLoad = restored.serialize();
  assert.equal(restored.load({ ...snapshot, orientations: [24] }), false);
  assert.deepEqual(restored.serialize(), beforeInvalidLoad);
});

test("legacy block arrays are accepted for local-save migration", () => {
  const original = createWorld(7);
  const blocks = original.serialize().blocks;
  const restored = createWorld(9);

  assert.equal(restored.load(blocks), true);
  assert.deepEqual(restored.serialize().blocks, blocks);
  assert.equal(restored.serialize().seed, 9);
  assert.ok(restored.serialize().orientations.every((orientation) => orientation === 0));
});

test("version-one snapshots migrate with default orientations", () => {
  const original = createWorld(7);
  original.setBlock(1, 9, 1, 4);
  const legacySnapshot = original.serialize();
  legacySnapshot.version = 1;
  delete legacySnapshot.orientations;
  const restored = createWorld(9);
  assert.equal(restored.load(legacySnapshot), true);
  assert.equal(restored.getOrientation(1, 9, 1), 0);
  assert.equal(restored.serialize().version, 2);
  assert.deepEqual(restored.serialize().blocks, legacySnapshot.blocks);
});

test("lower slabs share bounds for collision and ray tests and reject rotated states", () => {
  const api = context.MoneycraftWorld;
  const world = createWorld(7);
  const empty = world.serialize();
  empty.blocks.fill(0);
  assert.equal(world.load(empty), true);
  assert.equal(world.setBlock(2, 3, 4, 16), true);
  assert.equal(world.findSurface(2, 4), 3.5);
  assert.equal(api.blockIntersectsBox(16, 2, 3, 4, [2.2, 3.5, 4.2], [2.8, 5.2, 4.8]), false);
  assert.equal(api.blockIntersectsBox(16, 2, 3, 4, [2.2, 3.49, 4.2], [2.8, 5.2, 4.8]), true);
  assert.equal(api.intersectBlockRay(16, [2, 3, 4], [2.5, 3.75, 6], [0, 0, -1], 6), null);
  assert.equal(api.intersectBlockRay(16, [2, 3, 4], [2.5, 3.25, 6], [0, 0, -1], 0.99), null);
  const top = api.intersectBlockRay(16, [2, 3, 4], [2.5, 5, 4.5], [0, -1, 0], 6);
  assert.equal(top.distance, 1.5);
  assert.deepEqual(Array.from(top.normal), [0, 1, 0]);
  const saved = world.serialize();
  assert.equal(world.setBlock(2, 3, 4, 16, 1), false);
  const rotated = structuredClone(saved);
  rotated.orientations[(3 * 12 + 4) * 12 + 2] = 1;
  assert.equal(world.load(rotated), false);
  assert.deepEqual(world.serialize(), saved);
});

test("upper slabs preserve half-cell geometry and placement rules across saves", () => {
  const api = context.MoneycraftWorld;
  const upper = api.upperSlabOrientation;
  assert.equal(upper, 20);
  for (const [normal, hitY, expected] of [
    [[0, 1, 0], 1, 0], [[0, -1, 0], 0, upper],
    [[1, 0, 0], 0.499, 0], [[-1, 0, 0], 0.5, upper],
  ]) assert.equal(api.slabOrientationForPlacement(normal, hitY), expected);
  assert.equal(api.canMergeSlab(16, 0, upper), true);
  assert.equal(api.canMergeSlab(16, upper, 0), true);
  assert.equal(api.canMergeSlab(16, upper, upper), false);
  assert.equal(api.canMergeSlab(6, upper, 0), false);
  const bounds = api.getBlockBoxes(16, upper)[0];
  assert.deepEqual(Array.from(bounds.min), [0, 0.5, 0]);
  assert.deepEqual(Array.from(bounds.max), [1, 1, 1]);
  assert.equal(api.getBlockBounds(16, upper), bounds);
  assert.equal(api.blockIntersectsBox(16, 2, 3, 4, [2.1, 3, 4.1], [2.9, 3.5, 4.9], upper), false);
  assert.equal(api.blockIntersectsBox(16, 2, 3, 4, [2.1, 3.49, 4.1], [2.9, 3.51, 4.9], upper), true);
  assert.equal(api.intersectBlockRay(16, [2, 3, 4], [2.5, 3.25, 6], [0, 0, -1], 6, upper), null);
  const hit = api.intersectBlockRay(16, [2, 3, 4], [2.5, 2, 4.5], [0, 1, 0], 6, upper);
  assert.equal(hit.distance, 1.5);
  assert.deepEqual(Array.from(hit.normal), [0, -1, 0]);
  const world = createWorld();
  const empty = world.serialize();
  empty.blocks.fill(0);
  world.load(empty);
  assert.equal(world.setBlock(2, 3, 4, 16, upper), true);
  assert.equal(world.findSurface(2.5, 4.5), 4);
  const restored = createWorld();
  assert.equal(restored.load(world.serialize()), true);
  assert.equal(restored.getOrientation(2, 3, 4), upper);
  for (let orientation = 0; orientation < 24; orientation += 1) {
    assert.equal(api.isBlockOrientation(16, orientation), orientation === 0 || orientation === upper);
  }
});

test("all seventeen materials round-trip while old five- and nine-block saves remain compatible", () => {
  const old = createModel({ width: 12, depth: 12, height: 12, blockCount: 5, seed: 7 });
  const world = createWorld();
  assert.equal(world.load(old.serialize()), true);
  const nine = createModel({ width: 12, depth: 12, height: 12, blockCount: 9, seed: 7 });
  nine.setBlock(1, 9, 1, 9);
  assert.equal(world.load(nine.serialize()), true);
  assert.equal(world.getBlock(1, 9, 1), 9);
  for (let id = 1; id <= 17; id += 1) {
    assert.equal(world.setBlock(id % 12, 9, Math.floor(id / 12), id), true);
  }
  const restored = createWorld();
  assert.equal(restored.load(world.serialize()), true);
  assert.deepEqual(restored.serialize(), world.serialize());
  assert.equal(nine.load(world.serialize()), false);
  assert.deepEqual(Array.from(context.MoneycraftWorld.blocks, (block) => block.id),
    Array.from({ length: 17 }, (_, index) => index + 1));
  assert.throws(() => createModel({ width: 1, depth: 1, height: 1, blockCount: 256 }), /positive integers/);
});

test("upright stairs share rotated two-box geometry for rays, collision, surfaces and saved states", () => {
  const api = context.MoneycraftWorld;
  const world = createWorld();
  const empty = world.serialize();
  empty.blocks.fill(0);
  assert.equal(world.load(empty), true);
  assert.equal(api.uprightOrientations.length, 4);
  for (const orientation of api.uprightOrientations) {
    const axes = world.getOrientationAxes(orientation);
    const forward = Array.from(axes.z);
    assert.equal(api.orientationFromFacing(forward), orientation);
    const boxes = api.getBlockBoxes(17, orientation);
    assert.equal(boxes.length, 2);
    assert.equal(boxes.reduce((volume, box) => volume + box.max.reduce((value, max, axis) =>
      value * (max - box.min[axis]), 1), 0), 0.75);
    assert.equal(api.getStairOutline(orientation).length, 18);
    assert.equal(world.setBlock(2, 3, 4, 17, orientation), true);
    for (const [side, top] of [[-1, 3.5], [1, 4]]) {
      const point = [2.5, 3.75, 4.5].map((value, axis) => value + forward[axis] * side * 0.25);
      assert.equal(world.findSurface(point[0], point[2]), top);
      const hit = api.intersectBlockRay(17, [2, 3, 4], [point[0], 5, point[2]],
        [0, -1, 0], 6, orientation);
      assert.equal(hit.distance, 5 - top);
      assert.deepEqual(Array.from(hit.normal), [0, 1, 0]);
      assert.equal(api.blockIntersectsBox(17, 2, 3, 4,
        point.map((value) => value - 0.05), point.map((value) => value + 0.05), orientation), side === 1);
      const sidewaysOrigin = point.map((value, axis) => value + axes.x[axis] * 2);
      const sideways = Array.from(axes.x, (value) => -value);
      assert.equal(api.intersectBlockRay(17, [2, 3, 4], sidewaysOrigin, sideways, 6, orientation) !== null,
        side === 1);
    }
    const saved = world.serialize();
    assert.equal(createWorld().load(saved), true);
    assert.equal(saved.orientations[(3 * 12 + 4) * 12 + 2], orientation);
  }
  const saved = world.serialize();
  for (let orientation = 0; orientation < 24; orientation += 1) {
    assert.equal(api.isBlockOrientation(17, orientation), api.stairOrientations.includes(orientation));
    if (api.stairOrientations.includes(orientation)) continue;
    assert.equal(world.setBlock(2, 3, 4, 17, orientation), false);
    const invalid = structuredClone(saved);
    invalid.orientations[(3 * 12 + 4) * 12 + 2] = orientation;
    assert.equal(world.load(invalid), false);
  }
  assert.equal(api.orientationFromFacing([0, 1, 0]), null);
});

test("upside-down stairs preserve facing and use an upper slab with a lower half-depth step", () => {
  const api = context.MoneycraftWorld;
  assert.equal(api.stairOrientations.length, 8);
  for (const upright of api.uprightOrientations) {
    const world = createWorld();
    const empty = world.serialize();
    empty.blocks.fill(0);
    world.load(empty);
    const forward = Array.from(world.getOrientationAxes(upright).z);
    const orientation = api.orientationFromFacing(forward, true);
    assert.equal(world.getOrientationAxes(orientation).y[1], -1);
    assert.deepEqual(Array.from(world.getOrientationAxes(orientation).z, (value) => value || 0),
      forward.map((value) => value || 0));
    assert.equal(world.setBlock(2, 3, 4, 17, orientation), true);
    const boxes = api.getBlockBoxes(17, orientation);
    assert.deepEqual(Array.from(boxes[0].min), [0, 0.5, 0]);
    assert.deepEqual(Array.from(boxes[0].max), [1, 1, 1]);
    assert.equal(boxes.reduce((volume, box) => volume + box.max.reduce((value, max, axis) =>
      value * (max - box.min[axis]), 1), 0), 0.75);
    for (const side of [-1, 1]) {
      const point = [2.5, 3.25, 4.5].map((value, axis) => value + forward[axis] * side * 0.25);
      assert.equal(world.findSurface(point[0], point[2]), 4);
      const hit = api.intersectBlockRay(17, [2, 3, 4], [point[0], 2, point[2]],
        [0, 1, 0], 6, orientation);
      assert.equal(hit.distance, side === 1 ? 1 : 1.5);
      assert.deepEqual(Array.from(hit.normal), [0, -1, 0]);
      assert.equal(api.blockIntersectsBox(17, 2, 3, 4,
        point.map((value) => value - 0.05), point.map((value) => value + 0.05), orientation), side === 1);
    }
    const edges = api.getStairOutline(orientation);
    assert.equal(edges.length, 18);
    for (const edge of edges) for (const point of edge) {
      assert.ok(point.every((value) => value === 0 || value === 0.5 || value === 1));
    }
    const restored = createWorld();
    assert.equal(restored.load(world.serialize()), true);
    assert.equal(restored.getOrientation(2, 3, 4), orientation);
  }
});

test("stair corners derive all four shapes in eight orientations with matching rays, solids and surfaces", () => {
  const api = context.MoneycraftWorld;
  for (const orientation of api.stairOrientations) for (const shape of api.stairShapes.slice(1)) {
    const world = createWorld();
    const snapshot = world.serialize();
    snapshot.blocks.fill(0);
    world.load(snapshot);
    const axes = world.getOrientationAxes(orientation);
    const inner = shape.startsWith("inner");
    const sign = inner ? -1 : 1;
    const side = shape.endsWith("left") ? -1 : 1;
    const neighbor = [5 + axes.z[0] * sign, 5, 5 + axes.z[2] * sign];
    const neighborOrientation = api.orientationFromFacing(Array.from(axes.x, (value) => value * side),
      axes.y[1] < 0);
    world.setBlock(5, 5, 5, 17, orientation);
    world.setBlock(...neighbor, 17, neighborOrientation);
    assert.equal(world.getStairShape(5, 5, 5), shape);
    const boxes = world.getBoxes(5, 5, 5);
    assert.equal(boxes.reduce((volume, box) => volume + box.max.reduce((value, max, axis) =>
      value * (max - box.min[axis]), 1), 0), inner ? 0.875 : 0.625);
    for (const localX of [0.25, 0.75]) for (const localZ of [0.25, 0.75]) {
      const onSide = side < 0 ? localX < 0.5 : localX > 0.5;
      const step = inner ? localZ > 0.5 || onSide : localZ > 0.5 && onSide;
      const point = [0, 1, 2].map((axis) => 5.5 + axes.x[axis] * (localX - 0.5)
        + axes.y[axis] * 0.25 + axes.z[axis] * (localZ - 0.5));
      const top = axes.y[1] < 0 ? 6 : step ? 6 : 5.5;
      const bottom = axes.y[1] > 0 ? 5 : step ? 5 : 5.5;
      assert.equal(world.findSurface(point[0], point[2]), top);
      assert.equal(world.raycastBlock(5, 5, 5, [point[0], 7, point[2]], [0, -1, 0], 6).distance, 7 - top);
      assert.equal(world.raycastBlock(5, 5, 5, [point[0], 4, point[2]], [0, 1, 0], 6).distance, bottom - 4);
      assert.equal(world.intersectsBox(5, 5, 5, point.map((v) => v - 0.05), point.map((v) => v + 0.05)), step);
    }
    const outline = api.getStairOutline(orientation, shape);
    assert.equal(outline.length, 21);
    assert.equal(new Set(outline.map((edge) => JSON.stringify(edge))).size, 21);
    for (const [a, b] of outline) {
      const axis = a.findIndex((value, index) => value !== b[index]);
      assert.ok(axis >= 0);
      assert.equal(a.filter((value, index) => value !== b[index]).length, 1);
      const [u, v] = [0, 1, 2].filter((value) => value !== axis);
      const occupied = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([du, dv]) => {
        const point = a.map((value, index) => (value + b[index]) / 2);
        // Avoid half-cell seams inside a merged outline segment.
        point[axis] = a[axis] + (b[axis] - a[axis]) * 0.25;
        point[u] += du * 0.01;
        point[v] += dv * 0.01;
        return boxes.some((box) => point.every((value, index) => value > box.min[index] && value < box.max[index]));
      }).filter(Boolean).length;
      assert.ok(occupied === 1 || occupied === 3);
    }
    const restored = createWorld();
    assert.equal(restored.load(world.serialize()), true);
    assert.equal(restored.getStairShape(5, 5, 5), shape);
    const saved = world.serialize();
    world.setBlock(5, 5, 5, 0);
    world.setBlock(...neighbor, 0);
    world.setBlock(...neighbor, 17, neighborOrientation);
    world.setBlock(5, 5, 5, 17, orientation);
    assert.deepEqual(world.serialize(), saved);
    assert.equal(world.getStairShape(5, 5, 5), shape);
    world.setBlock(...neighbor, 0);
    assert.equal(world.getStairShape(5, 5, 5), "straight");
  }
});

test("stair corners respect layer, straight continuations and deterministic outer-before-inner priority", () => {
  const api = context.MoneycraftWorld;
  for (const inverted of [false, true]) {
    const world = createWorld();
    const orientation = api.orientationFromFacing([0, 0, 1], inverted);
    const turn = api.orientationFromFacing([1, 0, 0], inverted);
    world.setBlock(5, 9, 5, 17, orientation);
    world.setBlock(5, 9, 6, 17, api.orientationFromFacing([1, 0, 0], !inverted));
    assert.equal(world.getStairShape(5, 9, 5), "straight");
    world.setBlock(5, 9, 6, 17, turn);
    assert.match(world.getStairShape(5, 9, 5), /^outer/);
    world.setBlock(4, 9, 5, 17, orientation);
    assert.equal(world.getStairShape(5, 9, 5), "straight");
    world.setBlock(5, 9, 4, 17, turn);
    assert.match(world.getStairShape(5, 9, 5), /^inner/);
    world.setBlock(4, 9, 5, 0);
    assert.match(world.getStairShape(5, 9, 5), /^outer/);
    world.setBlock(5, 9, 6, 0);
    world.setBlock(6, 9, 5, 17, orientation);
    assert.equal(world.getStairShape(5, 9, 5), "straight");
    world.setBlock(6, 9, 5, 0);
    assert.match(world.getStairShape(5, 9, 5), /^inner/);
    world.setBlock(5, 9, 4, 0);
    world.setBlock(5, 10, 6, 17, turn);
    assert.equal(world.getStairShape(5, 9, 5), "straight");
  }
});

test("hypothetical edits detect only newly filled stair quarters, including removal and continuation guards", () => {
  const api = context.MoneycraftWorld;
  const world = createWorld();
  const forward = api.orientationFromFacing([0, 0, 1]);
  const turn = api.orientationFromFacing([1, 0, 0]);
  world.setBlock(5, 9, 5, 17, forward);
  world.setBlock(5, 9, 6, 17, turn);
  const min = [5.1, 9.6, 5.6], max = [5.4, 9.9, 5.9];
  assert.equal(world.intersectsBox(5, 9, 5, min, max), false);
  const saved = world.serialize();
  assert.equal(world.editIntersectsBox({ x: 5, y: 9, z: 6, block: 0, orientation: 0 }, min, max), true);
  assert.equal(world.editIntersectsBox({ x: 4, y: 9, z: 5, block: 17, orientation: forward }, min, max), true);
  assert.equal(world.editIntersectsBox({ x: 5, y: 9, z: 5, block: 0, orientation: 0 }, min, max), false);
  assert.equal(world.editIntersectsBox({ x: 5, y: 9, z: 6, block: 0, orientation: 0 },
    [5.5, 9.6, 5.6], [5.8, 9.9, 5.9]), false);
  assert.deepEqual(world.serialize(), saved);
  world.setBlock(5, 9, 6, 0);
  assert.equal(world.editIntersectsBox({ x: 5, y: 9, z: 4, block: 17, orientation: turn },
    [5.6, 9.6, 5.1], [5.9, 9.9, 5.4]), true);
});
