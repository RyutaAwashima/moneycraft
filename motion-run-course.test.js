"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = { globalThis: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "motion-run-course.js"), "utf8"),
  context,
  { filename: "motion-run-course.js" },
);
const courseModel = context.globalThis.MoneycraftMotionRunCourse;
const checkpoints = Array.from({ length: 12 }, (_, index) => ({
  progress: 0.035 + index * 0.08,
}));

test("the dedicated course spans four named sections and follows a bounded route", () => {
  const course = courseModel.createCourse(checkpoints);
  assert.deepEqual({ ...course.dimensions }, { width: 36, depth: 224, height: 16 });
  assert.deepEqual(Array.from(courseModel.sections, ({ label }) => label), [
    "ひだまり草原",
    "せせらぎの木橋",
    "石の森",
    "花ひらく丘",
  ]);
  for (let progress = 0; progress <= 1; progress += 0.01) {
    const position = course.getPosition(progress);
    assert.ok(position.x >= 0 && position.x < course.dimensions.width);
    assert.ok(position.z >= 0 && position.z <= course.dimensions.depth);
    assert.ok(Math.abs(Math.hypot(...position.direction) - 1) < 1e-10);
  }
  assert.ok(course.getPosition(1).x >= 0);
  assert.equal(course.getPosition(1).z, course.dimensions.depth);
  assert.equal(course.getSection(0).label, "ひだまり草原");
  assert.equal(course.getSection(0.3).label, "せせらぎの木橋");
  assert.equal(course.getSection(0.55).label, "石の森");
  assert.equal(course.getSection(0.8).label, "花ひらく丘");
});

test("the fixed block course has one walkable lane and a physical gate at every checkpoint", () => {
  const obstacles = [0.17, 0.38, 0.59, 0.8].map((progress) => ({ progress }));
  const course = courseModel.createCourse(checkpoints, obstacles);
  const cells = new Map(course.blocks.map(({ x, y, z, block }) => [`${x},${y},${z}`, block]));
  assert.equal(course.gates.length, checkpoints.length);
  assert.equal(course.obstacles.length, obstacles.length);
  for (const obstacle of course.obstacles) {
    for (let dx = -1; dx <= 1; dx += 1) {
      assert.equal(cells.get(`${obstacle.x + dx},3,${obstacle.z}`),
        dx === 0 ? courseModel.blocks.yellow : courseModel.blocks.brick);
    }
    assert.ok(cells.has(`${obstacle.x},2,${obstacle.z}`));
  }
  for (const [index, checkpoint] of checkpoints.entries()) {
    const gate = course.gates[index];
    const position = course.getPosition(checkpoint.progress);
    assert.ok(Math.abs(gate.z - position.z) <= 1);
    assert.ok(Math.abs(gate.x - position.x) <= 1);
    assert.equal(cells.get(`${gate.x - 4},9,${gate.z}`), courseModel.blocks.green
      + (index % 4 === 0 ? 0 : (index % 4 === 1 ? -2 : index % 4 === 2 ? 1 : -1)));
    assert.equal(cells.get(`${gate.x},10,${gate.z}`), courseModel.blocks.yellow);
    for (let x = gate.x - 3; x <= gate.x + 3; x += 1) {
      assert.ok(cells.has(`${x},2,${gate.z}`));
    }
  }
  assert.ok(course.blocks.some(({ block }) => block === courseModel.blocks.blue));
  assert.ok(course.blocks.some(({ block }) => block === courseModel.blocks.leaves));
  assert.ok(course.blocks.every(({ x, y, z }) =>
    x >= 0 && x < 36 && y >= 0 && y < 16 && z >= 0 && z < 224));
});

test("course generation rejects invalid checkpoint positions", () => {
  assert.throws(() => courseModel.createCourse([]), /Course checkpoints/);
  assert.throws(() => courseModel.createCourse([{ progress: Number.NaN }]), /Course checkpoints/);
  assert.throws(() => courseModel.createCourse([{ progress: 1.1 }]), /Course checkpoints/);
  assert.throws(() => courseModel.createCourse(checkpoints, [{ progress: -0.1 }]), /Course obstacles/);
});
