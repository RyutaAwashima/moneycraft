"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = { globalThis: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "motion-run-model.js"), "utf8"),
  context,
  { filename: "motion-run-model.js" },
);
const runModel = context.globalThis.MoneycraftMotionRun;

function advanceTo(state, targetMs, motions = {}, walking = { active: true, cadence: 1 }) {
  let next = state;
  for (let elapsed = state.elapsedMs + 100; elapsed <= targetMs; elapsed += 100) {
    next = runModel.advanceRun(next, elapsed, motions, walking);
  }
  if (next.elapsedMs < targetMs) next = runModel.advanceRun(next, targetMs, motions, walking);
  return next;
}

test("the course presents five gates with longer walking intervals", () => {
  assert.deepEqual(Array.from(runModel.poses, (pose) => pose.pose), [
    "armsUp",
    "leftArmUp",
    "rightHorizontalLeftUp",
    "rightArmUp",
    "leftHorizontalRightUp",
    "tPose",
  ]);
  assert.equal(runModel.checkpoints.length, 5);
  assert.deepEqual(Array.from(runModel.checkpoints, (checkpoint) => checkpoint.pose), [
    "armsUp",
    "leftArmUp",
    "rightHorizontalLeftUp",
    "rightArmUp",
    "leftHorizontalRightUp",
  ]);
  assert.ok(Math.abs(runModel.checkpoints.at(-1).progress - 0.9) < Number.EPSILON);
  const intervals = runModel.checkpoints.slice(1).map((checkpoint, index) =>
    (checkpoint.progress - runModel.checkpoints[index].progress) * runModel.runDurationMs);
  assert.ok(intervals.every((interval) => Math.abs(interval - 22_050) < 1));
});

test("the course waits for arm swings and higher cadence moves it faster", () => {
  let state = runModel.createRunState();
  state = runModel.advanceRun(state, 1_000);
  assert.equal(state.courseElapsedMs, 0);
  const slow = runModel.advanceRun(state, 2_000, {}, { active: true, cadence: 1 });
  const fast = runModel.advanceRun(state, 2_000, {}, { active: true, cadence: 2 });
  assert.equal(slow.courseElapsedMs, 1_000);
  assert.equal(fast.courseElapsedMs, 2_000);
  assert.equal(runModel.getWalkSpeedMultiplier(0.35), 0.35);
  assert.equal(runModel.getWalkSpeedMultiplier(2.2), 2.2);
  assert.equal(runModel.getWalkSpeedMultiplier(3), 0);
});

test("run summary reports elapsed time and a 25 kg, 3.5 MET calorie estimate", () => {
  const state = {
    ...runModel.createRunState(),
    elapsedMs: 105_000,
    results: ["cleared", "missed", null, null, null],
  };
  const summary = runModel.getRunSummary(state);
  assert.equal(summary.elapsedMs, 105_000);
  assert.equal(summary.estimatedCaloriesKcal, 2.6);
  assert.equal(summary.penaltyMs, 1_000);
  assert.equal(summary.scoreMs, 106_000);
  assert.equal(runModel.estimateCalories(3_600_000), 87.5);
  assert.throws(() => runModel.estimateCalories(-1), /non-negative finite number/);
  assert.throws(() => runModel.estimateCalories(Number.NaN), /non-negative finite number/);
});

test("start countdown shows camera readiness, then 3, 2, 1, start before gameplay", () => {
  assert.equal(runModel.getStartCountdownStep(0).message, "カメラ判定OK！");
  assert.equal(runModel.getStartCountdownStep(899).message, "カメラ判定OK！");
  assert.equal(runModel.getStartCountdownStep(900).message, "3");
  assert.equal(runModel.getStartCountdownStep(1_900).message, "2");
  assert.equal(runModel.getStartCountdownStep(2_900).message, "1");
  assert.equal(runModel.getStartCountdownStep(3_900).message, "スタート！");
  assert.equal(runModel.getStartCountdownStep(runModel.startCountdownDurationMs), null);
  assert.throws(() => runModel.getStartCountdownStep(-1), /non-negative finite number/);
});

test("jump calibration requires a stable sample window before the countdown", () => {
  const startedAt = 1_000;
  assert.equal(runModel.isJumpCalibrationReady(startedAt, 2_399, 20), false);
  assert.equal(runModel.isJumpCalibrationReady(startedAt, 2_400, 9), false);
  assert.equal(runModel.isJumpCalibrationReady(startedAt, 2_400, 10), true);
  assert.equal(runModel.isJumpCalibrationReady(2_000, 1_999, 20), false);
  assert.equal(runModel.isJumpCalibrationReady(startedAt, 2_400, 10.5), false);
});

test("a jump within the buffer clears an obstacle as the runner reaches it", () => {
  const obstacleAt = Math.round(runModel.obstacles[0].progress * runModel.runDurationMs);
  const walking = { active: true, cadence: 1 };
  let state = runModel.advanceRun(runModel.createRunState(), obstacleAt - 500, {}, walking);
  state = runModel.advanceRun(state, obstacleAt, { jump: true }, walking);
  assert.equal(state.obstacleResults[0], "cleared");
  assert.equal(state.nextObstacle, 1);
  assert.equal(state.events[0].type, "obstacle-cleared");
  assert.equal(runModel.getRunSummary(state).obstaclesCleared, 1);
});

test("a jump outside the buffer does not clear an obstacle", () => {
  const obstacleAt = Math.round(runModel.obstacles[0].progress * runModel.runDurationMs);
  const walking = { active: true, cadence: 1 };
  let state = runModel.advanceRun(runModel.createRunState(), obstacleAt - runModel.jumpBufferMs - 100,
    { jump: true }, walking);
  state = runModel.advanceRun(state, obstacleAt, {}, walking);
  assert.equal(state.obstacleResults[0], "hit");
  assert.equal(state.events[0].type, "obstacle-hit");
  assert.equal(runModel.getRunSummary(state).obstaclesHit, 1);
  assert.equal(runModel.getRunSummary(state).scoreMs, state.elapsedMs);
});

test("a matching pose clears a gate while walking and course movement continue", () => {
  const firstGateAt = Math.round(runModel.checkpoints[0].progress * runModel.runDurationMs);
  let state = advanceTo(runModel.createRunState(), firstGateAt);
  assert.equal(state.activeCheckpoint, 0);
  const gatePosition = state.courseElapsedMs;
  state = advanceTo(state, firstGateAt + runModel.holdDurationMs, { armsUp: true });
  assert.equal(state.results[0], "cleared");
  assert.equal(state.activeCheckpoint, null);
  assert.equal(state.courseElapsedMs, gatePosition + runModel.holdDurationMs);
  assert.equal(runModel.getRunSummary(state).cleared, 1);
});

test("a missed gate times out while the course continues moving", () => {
  const firstGateAt = Math.round(runModel.checkpoints[0].progress * runModel.runDurationMs);
  let state = advanceTo(runModel.createRunState(), firstGateAt);
  const gatePosition = state.courseElapsedMs;
  state = advanceTo(state, firstGateAt + runModel.checkpointWindowMs, { tPose: true });
  assert.equal(state.results[0], "missed");
  assert.equal(state.nextCheckpoint, 1);
  assert.equal(state.activeCheckpoint, null);
  assert.equal(state.courseElapsedMs, gatePosition + runModel.checkpointWindowMs);
  assert.equal(runModel.getRunSummary(state).penaltyMs, runModel.missPenaltyMs);
  const nextGateAt = Math.round(runModel.checkpoints[1].progress * runModel.runDurationMs);
  state = advanceTo(state, state.elapsedMs + nextGateAt - state.courseElapsedMs);
  assert.equal(state.activeCheckpoint, 1);
});

test("a brief interruption resets the required hold duration", () => {
  const firstGateAt = Math.round(runModel.checkpoints[0].progress * runModel.runDurationMs);
  let state = advanceTo(runModel.createRunState(), firstGateAt);
  state = runModel.advanceRun(state, state.elapsedMs + 100, { armsUp: true });
  state = runModel.advanceRun(state, state.elapsedMs + 200, { armsUp: true });
  const interrupted = runModel.advanceRun(state, state.elapsedMs + 100, { armsUp: false });
  assert.equal(interrupted.holdMs, 0);
  const resumed = runModel.advanceRun(interrupted, interrupted.elapsedMs + 100, { armsUp: true });
  assert.equal(resumed.results[0], null);
});

test("missing every pose still reaches the goal while walking continues through gates", () => {
  let state = runModel.createRunState();
  for (let elapsed = 100; elapsed <= 180_000 && !state.complete; elapsed += 100) {
    state = runModel.advanceRun(state, elapsed, {}, { active: true, cadence: 1 });
  }
  const summary = runModel.getRunSummary(state);
  assert.equal(state.complete, true);
  assert.deepEqual(Array.from(state.results), Array(5).fill("missed"));
  assert.equal(summary.missed, 5);
  assert.equal(summary.obstaclesHit, runModel.obstacles.length);
  assert.equal(state.elapsedMs, runModel.runDurationMs);
  assert.equal(summary.penaltyMs, 5_000);
  assert.equal(summary.scoreMs, runModel.runDurationMs + 5_000);
});
