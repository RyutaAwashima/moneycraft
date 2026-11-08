"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = { globalThis: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "motion-sensing.js"), "utf8"),
  context,
  { filename: "motion-sensing.js" },
);
const sensing = context.globalThis.MoneycraftMotionSensing;

function standingPose() {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  landmarks[0] = { x: 0.5, y: 0.12, visibility: 1 };
  landmarks[11] = { x: 0.42, y: 0.3, visibility: 1 };
  landmarks[12] = { x: 0.58, y: 0.3, visibility: 1 };
  landmarks[13] = { x: 0.36, y: 0.4, visibility: 1 };
  landmarks[14] = { x: 0.64, y: 0.4, visibility: 1 };
  landmarks[15] = { x: 0.36, y: 0.5, visibility: 1 };
  landmarks[16] = { x: 0.64, y: 0.5, visibility: 1 };
  landmarks[23] = { x: 0.45, y: 0.55, visibility: 1 };
  landmarks[24] = { x: 0.55, y: 0.55, visibility: 1 };
  landmarks[25] = { x: 0.44, y: 0.75, visibility: 1 };
  landmarks[26] = { x: 0.56, y: 0.75, visibility: 1 };
  landmarks[27] = { x: 0.44, y: 0.95, visibility: 1 };
  landmarks[28] = { x: 0.56, y: 0.95, visibility: 1 };
  landmarks[31] = { x: 0.42, y: 0.98, visibility: 1 };
  landmarks[32] = { x: 0.58, y: 0.98, visibility: 1 };
  return landmarks;
}

function shiftPose(landmarks, amount) {
  return landmarks.map((point) => ({ ...point, y: point.y + amount }));
}

test("body metrics reject missing, truncated, and low-confidence poses", () => {
  assert.equal(sensing.getBodyMetrics(null), null);
  assert.equal(sensing.getBodyMetrics([]), null);
  const landmarks = standingPose();
  landmarks[12].visibility = 0.1;
  assert.equal(sensing.getBodyMetrics(landmarks), null);
});

test("upper-body tracking works without hips, knees, or ankles", () => {
  const landmarks = standingPose().slice(0, 17);
  const metrics = sensing.getBodyMetrics(landmarks);
  assert.ok(metrics);
  assert.equal(metrics.hipY, null);
  assert.ok(Number.isFinite(metrics.torsoHeight));
});

test("standing pose does not trigger a motion", () => {
  const metrics = sensing.getBodyMetrics(standingPose().slice(0, 17));
  const baseline = sensing.averageMetrics([metrics, metrics]);
  assert.deepEqual({ ...sensing.detectMotions(metrics, baseline) },
    {
      jump: false,
      squat: false,
      armsUp: false,
      tPose: false,
      leftArmUp: false,
      rightArmUp: false,
      rightHorizontalLeftUp: false,
      leftHorizontalRightUp: false,
    });
});

test("upper-body rising and lowering use calibrated movement and lean to distinguish motions", () => {
  const standingPoseUpper = standingPose().slice(0, 17);
  const baselineMetrics = sensing.getBodyMetrics(standingPoseUpper);
  const baseline = sensing.averageMetrics([baselineMetrics]);
  const jumpMetrics = sensing.getBodyMetrics(shiftPose(standingPoseUpper, -0.08));
  assert.equal(sensing.detectMotions(jumpMetrics, baseline).jump, true);
  assert.equal(sensing.detectMotions(baselineMetrics, baseline).jump, false);
  const loweredWithoutTilt = sensing.getBodyMetrics(shiftPose(standingPoseUpper, 0.08));
  assert.equal(sensing.detectMotions(loweredWithoutTilt, baseline).squat, false);
  assert.equal(sensing.detectMotions(loweredWithoutTilt, baseline, {
    ...sensing.defaultThresholds,
    useTilt: false,
  }).squat, true);
  const leaningPose = shiftPose(standingPoseUpper, 0.08);
  leaningPose[0] = { ...leaningPose[0], x: 0.56 };
  const squat = sensing.getBodyMetrics(leaningPose);
  assert.equal(sensing.detectMotions(squat, baseline).squat, true);
});

test("arm raise assists a smaller upward movement in jump detection", () => {
  const standing = standingPose().slice(0, 17);
  const baseline = sensing.averageMetrics([sensing.getBodyMetrics(standing)]);
  const smallRise = shiftPose(standing, -0.027);
  assert.equal(sensing.detectMotions(sensing.getBodyMetrics(smallRise), baseline).jump, false);
  smallRise[13] = { x: 0.4, y: 0.24, visibility: 1 };
  smallRise[14] = { x: 0.6, y: 0.24, visibility: 1 };
  smallRise[15] = { x: 0.38, y: 0.13, visibility: 1 };
  smallRise[16] = { x: 0.62, y: 0.13, visibility: 1 };
  const motions = sensing.detectMotions(sensing.getBodyMetrics(smallRise), baseline);
  assert.equal(motions.armsUp, true);
  assert.equal(motions.jump, true);
});

test("a change between hip and head tilt estimates disables only the tilt gate", () => {
  const withHips = sensing.getBodyMetrics(standingPose());
  const withoutHips = sensing.getBodyMetrics(standingPose().slice(0, 17));
  const baseline = sensing.averageMetrics([withHips, withoutHips]);
  const lowered = sensing.getBodyMetrics(shiftPose(standingPose(), 0.08));
  assert.equal(sensing.getMotionChanges(lowered, baseline).tilt, null);
  assert.equal(sensing.detectMotions(lowered, baseline).squat, false);
  assert.equal(sensing.detectMotions(lowered, baseline, {
    ...sensing.defaultThresholds,
    useTilt: false,
  }).squat, true);
});

test("raised arms and horizontal T pose are distinguished", () => {
  const baseline = sensing.averageMetrics([sensing.getBodyMetrics(standingPose())]);
  const raisedArms = standingPose();
  raisedArms[13] = { x: 0.4, y: 0.17, visibility: 1 };
  raisedArms[14] = { x: 0.6, y: 0.17, visibility: 1 };
  raisedArms[15] = { x: 0.38, y: 0.08, visibility: 1 };
  raisedArms[16] = { x: 0.62, y: 0.08, visibility: 1 };
  const armsUp = sensing.detectMotions(sensing.getBodyMetrics(raisedArms), baseline);
  assert.equal(armsUp.armsUp, true);
  assert.equal(armsUp.tPose, false);

  const tPose = standingPose();
  tPose[13] = { x: 0.34, y: 0.3, visibility: 1 };
  tPose[14] = { x: 0.66, y: 0.3, visibility: 1 };
  tPose[15] = { x: 0.24, y: 0.3, visibility: 1 };
  tPose[16] = { x: 0.76, y: 0.3, visibility: 1 };
  const detectedTPose = sensing.detectMotions(sensing.getBodyMetrics(tPose), baseline);
  assert.equal(detectedTPose.armsUp, false);
  assert.equal(detectedTPose.tPose, true);
});

test("single-arm raises identify the person's anatomical left and right", () => {
  const leftRaised = standingPose();
  leftRaised[13] = { x: 0.39, y: 0.19, visibility: 1 };
  leftRaised[15] = { x: 0.35, y: 0.08, visibility: 1 };
  const left = sensing.detectMotions(sensing.getBodyMetrics(leftRaised), null);
  assert.equal(left.leftArmUp, true);
  assert.equal(left.rightArmUp, false);

  const rightRaised = standingPose();
  rightRaised[14] = { x: 0.61, y: 0.19, visibility: 1 };
  rightRaised[16] = { x: 0.65, y: 0.08, visibility: 1 };
  const right = sensing.detectMotions(sensing.getBodyMetrics(rightRaised), null);
  assert.equal(right.rightArmUp, true);
  assert.equal(right.leftArmUp, false);
});

test("crossed arms are not a supported pose and mixed horizontal-raised poses remain distinct", () => {
  const crossed = standingPose();
  crossed[13] = { x: 0.48, y: 0.34, visibility: 1 };
  crossed[14] = { x: 0.52, y: 0.34, visibility: 1 };
  crossed[15] = { x: 0.57, y: 0.38, visibility: 1 };
  crossed[16] = { x: 0.43, y: 0.38, visibility: 1 };
  const crossedMotions = sensing.detectMotions(sensing.getBodyMetrics(crossed), null);
  assert.equal(Object.hasOwn(crossedMotions, "armsCrossed"), false);
  assert.equal(crossedMotions.armsUp, false);
  assert.equal(crossedMotions.tPose, false);
  assert.equal(crossedMotions.rightHorizontalLeftUp, false);

  const rightHorizontalLeftRaised = standingPose();
  rightHorizontalLeftRaised[14] = { x: 0.67, y: 0.3, visibility: 1 };
  rightHorizontalLeftRaised[16] = { x: 0.76, y: 0.3, visibility: 1 };
  rightHorizontalLeftRaised[13] = { x: 0.39, y: 0.19, visibility: 1 };
  rightHorizontalLeftRaised[15] = { x: 0.35, y: 0.08, visibility: 1 };
  const mixedA = sensing.detectMotions(sensing.getBodyMetrics(rightHorizontalLeftRaised), null);
  assert.equal(mixedA.rightHorizontalLeftUp, true);
  assert.equal(mixedA.leftHorizontalRightUp, false);
  assert.equal(mixedA.rightArmUp, false);

  const leftHorizontalRightRaised = standingPose();
  leftHorizontalRightRaised[13] = { x: 0.33, y: 0.3, visibility: 1 };
  leftHorizontalRightRaised[15] = { x: 0.24, y: 0.3, visibility: 1 };
  leftHorizontalRightRaised[14] = { x: 0.61, y: 0.19, visibility: 1 };
  leftHorizontalRightRaised[16] = { x: 0.65, y: 0.08, visibility: 1 };
  const mixedB = sensing.detectMotions(sensing.getBodyMetrics(leftHorizontalRightRaised), null);
  assert.equal(mixedB.leftHorizontalRightUp, true);
  assert.equal(mixedB.rightHorizontalLeftUp, false);
  assert.equal(mixedB.leftArmUp, false);
});

test("upper-body landmarks map to avatar arm poses", () => {
  const raisedArms = standingPose();
  raisedArms[15] = { x: 0.38, y: 0.08, visibility: 1 };
  raisedArms[16] = { x: 0.62, y: 0.08, visibility: 1 };
  const raisedPose = sensing.createAvatarPose(sensing.getBodyMetrics(raisedArms));
  assert.ok(raisedPose[2][2] < -2.5);
  assert.ok(raisedPose[3][2] > 2.5);

  const tPose = standingPose();
  tPose[15] = { x: 0.24, y: 0.3, visibility: 1 };
  tPose[16] = { x: 0.76, y: 0.3, visibility: 1 };
  const horizontalPose = sensing.createAvatarPose(sensing.getBodyMetrics(tPose));
  assert.ok(Math.abs(horizontalPose[2][2] + Math.PI / 2) < 0.01);
  assert.ok(Math.abs(horizontalPose[3][2] - Math.PI / 2) < 0.01);
});

test("jump and squat map to distinct full-body avatar poses", () => {
  const jump = sensing.createAvatarPose(null, { jump: true });
  const squat = sensing.createAvatarPose(null, { squat: true });
  assert.equal(jump[4][0], -0.25);
  assert.equal(jump[5][0], -0.25);
  assert.equal(squat[4][0], 0.18);
  assert.equal(squat[5][0], 0.18);
});

test("walking gait animates opposite arm and leg swings", () => {
  const firstStep = sensing.createAvatarPose(null, { walking: true, walkPhase: 0 });
  const secondStep = sensing.createAvatarPose(null, { walking: true, walkPhase: Math.PI / 2 });
  assert.equal(firstStep[4][0], 0);
  assert.ok(secondStep[4][0] > 0);
  assert.ok(secondStep[5][0] < 0);
  assert.ok(secondStep[2][0] > 0);
  assert.ok(secondStep[3][0] < 0);
});

test("pose guide metrics create the expected avatar arm positions for every supported pose", () => {
  const expectedAngles = {
    armsUp: [-Math.PI, Math.PI],
    leftArmUp: [-Math.PI, 0],
    rightArmUp: [0, Math.PI],
    rightHorizontalLeftUp: [-Math.PI, Math.PI / 2],
    leftHorizontalRightUp: [-Math.PI / 2, Math.PI],
    tPose: [-Math.PI / 2, Math.PI / 2],
  };
  for (const [pose, [left, right]] of Object.entries(expectedAngles)) {
    const guide = sensing.createPoseGuideMetrics(pose);
    const avatarPose = sensing.createAvatarPose(guide);
    assert.ok(Math.abs(avatarPose[2][2] - left) < 1e-10, pose);
    assert.ok(Math.abs(avatarPose[3][2] - right) < 1e-10, pose);
  }
  assert.throws(() => sensing.createPoseGuideMetrics("unknown"), /Unknown pose guide/);
});

test("camera horizontal position moves the avatar within a bounded range", () => {
  assert.ok(sensing.getAvatarHorizontalOffset({ centerX: 0.2 }) > 0);
  assert.ok(sensing.getAvatarHorizontalOffset({ centerX: 0.8 }) < 0);
  assert.equal(sensing.getAvatarHorizontalOffset(null), 0);
  assert.equal(sensing.getAvatarHorizontalOffset({ centerX: -2 }), 0.35);
});

test("avatar body tilt follows lateral torso lean with a smaller upper-body fallback and a safe limit", () => {
  assert.equal(sensing.getAvatarBodyTilt(null), 0);
  assert.equal(sensing.getAvatarBodyTilt({ torsoLean: 0, leanUsesHips: true }), 0);
  const hipTilt = sensing.getAvatarBodyTilt({ torsoLean: 0.2, leanUsesHips: true });
  const upperBodyTilt = sensing.getAvatarBodyTilt({ torsoLean: 0.2, leanUsesHips: false });
  assert.ok(hipTilt < 0);
  assert.ok(Math.abs(hipTilt) > Math.abs(upperBodyTilt));
  assert.equal(sensing.getAvatarBodyTilt({ torsoLean: 100, leanUsesHips: true }), -0.35);
  assert.equal(sensing.getAvatarBodyTilt({ torsoLean: -100, leanUsesHips: true }), 0.35);
});

test("centered portrait crop excludes the outer sides of a landscape camera frame", () => {
  assert.deepEqual({ ...sensing.getCenteredCrop(640, 480, 3 / 4) }, {
    x: 140,
    y: 0,
    width: 360,
    height: 480,
  });
  assert.deepEqual({ ...sensing.getCenteredCrop(480, 640, 3 / 4) }, {
    x: 0,
    y: 0,
    width: 480,
    height: 640,
  });
  assert.equal(sensing.getCenteredCrop(0, 480, 3 / 4), null);
  assert.equal(sensing.getCenteredCrop(640, 480, 0), null);
});

test("calibration rejects empty or incomplete samples", () => {
  assert.equal(sensing.averageMetrics([]), null);
  assert.equal(sensing.averageMetrics([{ centerY: 0.5 }]), null);
});
