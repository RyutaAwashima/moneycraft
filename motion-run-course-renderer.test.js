"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = {
  globalThis: {
    MoneycraftWorld: {
      blocks: Array.from({ length: 15 }, () => ({ color: [0.4, 0.5, 0.6] })),
    },
  },
};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "motion-run-course-renderer.js"), "utf8"),
  context,
  { filename: "motion-run-course-renderer.js" },
);
const renderer = context.globalThis.MoneycraftMotionRunRenderer;

test("course meshes omit faces hidden by adjacent blocks", () => {
  const single = renderer.createMesh({ blocks: [{ x: 0, y: 0, z: 0, block: 1 }] },
    context.globalThis.MoneycraftWorld.blocks);
  const pair = renderer.createMesh({
    blocks: [{ x: 0, y: 0, z: 0, block: 1 }, { x: 1, y: 0, z: 0, block: 1 }],
  }, context.globalThis.MoneycraftWorld.blocks);
  assert.equal(single.positions.length / 3, 36);
  assert.equal(pair.positions.length / 3, 60);
  assert.equal(single.colors.length, single.positions.length);
  assert.ok(Array.from(single.colors).every((color) => color >= 0 && color <= 1));
});
