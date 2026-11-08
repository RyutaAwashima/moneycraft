"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = { globalThis: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "motion-arm-swing.js"), "utf8"),
  context,
  { filename: "motion-arm-swing.js" },
);
const { createDetector } = context.globalThis.MoneycraftArmSwing;

function metrics(leftX, rightX = 0.6) {
  return {
    centerX: 0.5,
    shoulderWidth: 0.2,
    arms: {
      leftWrist: { x: leftX },
      rightWrist: { x: rightX },
    },
  };
}

test("repeated rhythmic wrist swings activate walking and estimate cadence", () => {
  const detector = createDetector();
  let state;
  for (let now = 0; now <= 2400; now += 70) {
    const normalized = Math.sin(now / 1000 * Math.PI * 2);
    state = detector.update(metrics(0.5 + normalized * 0.075), now);
  }
  assert.equal(state.active, true);
  assert.ok(state.left.reversals >= 3);
  assert.ok(state.cadence >= 0.35 && state.cadence <= 2.2);
});

test("standing still and small wrist jitter do not activate walking", () => {
  const detector = createDetector();
  let state;
  for (let now = 0; now <= 2400; now += 70) {
    state = detector.update(metrics(0.5 + Math.sin(now / 1000 * Math.PI * 2) * 0.004), now);
  }
  assert.equal(state.active, false);
  assert.equal(state.left.reversals, 0);
});

test("either wrist can provide a steady walking rhythm", () => {
  const detector = createDetector();
  let state;
  for (let now = 0; now <= 2400; now += 70) {
    const normalized = Math.sin(now / 1000 * Math.PI * 2);
    state = detector.update(metrics(0.4, 0.5 + normalized * 0.075), now);
  }
  assert.equal(state.active, true);
  assert.ok(state.right.reversals >= 3);
  assert.equal(state.left.active, false);
});

test("tracking loss clears swing history and stops the walking signal", () => {
  const detector = createDetector();
  for (let now = 0; now <= 1600; now += 70) {
    const normalized = Math.sin(now / 1000 * Math.PI * 2);
    detector.update(metrics(0.5 + normalized * 0.075), now);
  }
  const lost = detector.update(null, 1700);
  assert.equal(lost.active, false);
  assert.equal(lost.left.reversals, 0);
  assert.throws(() => detector.update(null, Number.NaN), /timestamp/);
});
