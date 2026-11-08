"use strict";

(() => {
  const REQUIRED_VISIBILITY = 0.45;
  const UPPER_BODY_JOINTS = [0, 11, 12];
  const DEFAULT_THRESHOLDS = Object.freeze({
    vertical: 0.14,
    tilt: 0.08,
    useTilt: true,
  });

  function average(first, second) {
    return (first + second) / 2;
  }

  function getPoint(landmarks, index) {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || (Number.isFinite(point.visibility) && point.visibility < REQUIRED_VISIBILITY)) {
      return null;
    }
    return point;
  }

  function getAngle(first, middle, last) {
    const firstVector = { x: first.x - middle.x, y: first.y - middle.y };
    const lastVector = { x: last.x - middle.x, y: last.y - middle.y };
    const firstLength = Math.hypot(firstVector.x, firstVector.y);
    const lastLength = Math.hypot(lastVector.x, lastVector.y);
    if (firstLength === 0 || lastLength === 0) return 0;
    const cosine = Math.max(-1, Math.min(1,
      (firstVector.x * lastVector.x + firstVector.y * lastVector.y) / (firstLength * lastLength)));
    return Math.acos(cosine) * 180 / Math.PI;
  }

  function getBodyMetrics(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length < 17) return null;
    const [nose, leftShoulder, rightShoulder] = UPPER_BODY_JOINTS
      .map((index) => getPoint(landmarks, index));
    if (!nose || !leftShoulder || !rightShoulder) return null;
    const leftHip = getPoint(landmarks, 23);
    const rightHip = getPoint(landmarks, 24);
    const shoulderY = average(leftShoulder.y, rightShoulder.y);
    const shoulderX = average(leftShoulder.x, rightShoulder.x);
    const hasHips = Boolean(leftHip && rightHip);
    const hipY = hasHips ? average(leftHip.y, rightHip.y) : null;
    const hipX = hasHips ? average(leftHip.x, rightHip.x) : null;
    const torsoHeight = hasHips ? hipY - nose.y : shoulderY - nose.y;
    if (torsoHeight < 0.08 || torsoHeight > 0.8) return null;

    const leftElbow = getPoint(landmarks, 13);
    const rightElbow = getPoint(landmarks, 14);
    const leftWrist = getPoint(landmarks, 15);
    const rightWrist = getPoint(landmarks, 16);

    return {
      centerX: average(leftShoulder.x, rightShoulder.x),
      shoulderY,
      hipY,
      torsoLean: hasHips
        ? (shoulderX - hipX) / torsoHeight
        : (shoulderX - nose.x) / torsoHeight,
      leanUsesHips: hasHips,
      centerY: hasHips ? average(shoulderY, hipY) : average(nose.y, shoulderY),
      torsoHeight,
      shoulderWidth: Math.abs(rightShoulder.x - leftShoulder.x),
      arms: leftElbow && rightElbow && leftWrist && rightWrist
        ? {
          leftShoulder,
          rightShoulder,
          leftElbow,
          rightElbow,
          leftWrist,
          rightWrist,
          leftElbowAngle: getAngle(leftShoulder, leftElbow, leftWrist),
          rightElbowAngle: getAngle(rightShoulder, rightElbow, rightWrist),
        }
        : null,
    };
  }

  function averageMetrics(samples) {
    if (!Array.isArray(samples) || samples.length === 0) return null;
    const fields = ["centerY", "torsoHeight", "torsoLean"];
    const baseline = {};
    for (const field of fields) {
      const values = samples.map((sample) => sample[field]).filter(Number.isFinite);
      if (values.length !== samples.length) return null;
      baseline[field] = values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    baseline.leanUsesHips = samples.every((sample) => sample.leanUsesHips === samples[0].leanUsesHips)
      ? samples[0].leanUsesHips
      : null;
    return baseline;
  }

  function getMotionChanges(metrics, baseline) {
    if (!metrics || !baseline) return { vertical: null, tilt: null };
    return {
      vertical: (baseline.centerY - metrics.centerY) / baseline.torsoHeight,
      tilt: baseline.leanUsesHips === metrics.leanUsesHips
        ? Math.abs(metrics.torsoLean - baseline.torsoLean)
        : null,
    };
  }

  function detectMotions(metrics, baseline, thresholds = DEFAULT_THRESHOLDS) {
    if (!metrics) {
      return {
        jump: false,
        squat: false,
        armsUp: false,
        tPose: false,
        leftArmUp: false,
        rightArmUp: false,
        rightHorizontalLeftUp: false,
        leftHorizontalRightUp: false,
      };
    }
    const arms = metrics.arms;
    const armReach = Math.max(0.08, metrics.shoulderWidth * 0.55);
    const isRaised = (wrist, shoulder) => wrist.y < shoulder.y - metrics.torsoHeight * 0.08;
    const isHorizontal = (wrist, shoulder, elbowAngle) =>
      Math.abs(wrist.y - shoulder.y) < metrics.torsoHeight * 0.18
      && Math.abs(wrist.x - shoulder.x) > armReach
      && elbowAngle > 125;
    const leftRaised = Boolean(arms && isRaised(arms.leftWrist, arms.leftShoulder));
    const rightRaised = Boolean(arms && isRaised(arms.rightWrist, arms.rightShoulder));
    const leftHorizontal = Boolean(arms
      && isHorizontal(arms.leftWrist, arms.leftShoulder, arms.leftElbowAngle));
    const rightHorizontal = Boolean(arms
      && isHorizontal(arms.rightWrist, arms.rightShoulder, arms.rightElbowAngle));
    const armsUp = leftRaised && rightRaised;
    const tPose = leftHorizontal && rightHorizontal;
    const rightHorizontalLeftUp = rightHorizontal && leftRaised;
    const leftHorizontalRightUp = leftHorizontal && rightRaised;

    const changes = getMotionChanges(metrics, baseline);
    const verticalThreshold = Number.isFinite(thresholds.vertical)
      ? thresholds.vertical
      : DEFAULT_THRESHOLDS.vertical;
    const tiltThreshold = Number.isFinite(thresholds.tilt)
      ? thresholds.tilt
      : DEFAULT_THRESHOLDS.tilt;

    return {
      jump: Boolean(changes.vertical !== null && changes.vertical >= verticalThreshold
        && (armsUp || changes.vertical >= verticalThreshold * 1.25)),
      squat: Boolean(changes.vertical !== null && changes.vertical <= -verticalThreshold
        && (!thresholds.useTilt || (changes.tilt !== null && changes.tilt >= tiltThreshold))),
      armsUp,
      tPose,
      leftArmUp: leftRaised && !rightRaised && !leftHorizontal && !rightHorizontal,
      rightArmUp: rightRaised && !leftRaised && !leftHorizontal && !rightHorizontal,
      rightHorizontalLeftUp,
      leftHorizontalRightUp,
    };
  }

  function getAvatarBodyTilt(metrics) {
    if (!metrics || !Number.isFinite(metrics.torsoLean)) return 0;
    const sensitivity = metrics.leanUsesHips ? 1.5 : 0.45;
    const tilt = Math.max(-0.35, Math.min(0.35, -Math.atan(metrics.torsoLean * sensitivity)));
    return tilt === 0 ? 0 : tilt;
  }

  function getCenteredCrop(sourceWidth, sourceHeight, targetAspectRatio) {
    if (![sourceWidth, sourceHeight, targetAspectRatio].every(Number.isFinite)
      || sourceWidth <= 0 || sourceHeight <= 0 || targetAspectRatio <= 0) return null;
    const sourceAspectRatio = sourceWidth / sourceHeight;
    if (sourceAspectRatio > targetAspectRatio) {
      const width = sourceHeight * targetAspectRatio;
      return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
    }
    const height = sourceWidth / targetAspectRatio;
    return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
  }

  function createPoseGuideMetrics(pose) {
    const poseArms = {
      armsUp: { leftRaised: true, rightRaised: true },
      leftArmUp: { leftRaised: true, rightRaised: false },
      rightArmUp: { leftRaised: false, rightRaised: true },
      rightHorizontalLeftUp: { leftRaised: true, rightRaised: false, rightHorizontal: true },
      leftHorizontalRightUp: { leftRaised: false, rightRaised: true, leftHorizontal: true },
      tPose: { leftRaised: false, rightRaised: false, leftHorizontal: true, rightHorizontal: true },
    }[pose];
    if (!poseArms) throw new TypeError("Unknown pose guide.");

    const leftShoulder = { x: 0.4, y: 0.4 };
    const rightShoulder = { x: 0.6, y: 0.4 };
    const wristFor = (shoulder, raised, horizontal, side) => ({
      x: raised ? shoulder.x : horizontal ? shoulder.x + side * 0.28 : shoulder.x,
      y: raised ? 0.1 : horizontal ? shoulder.y : 0.68,
    });

    return {
      centerX: 0.5,
      torsoLean: 0,
      leanUsesHips: false,
      arms: {
        leftShoulder,
        rightShoulder,
        leftWrist: wristFor(leftShoulder, poseArms.leftRaised, poseArms.leftHorizontal, -1),
        rightWrist: wristFor(rightShoulder, poseArms.rightRaised, poseArms.rightHorizontal, 1),
      },
    };
  }

  function createAvatarPose(metrics, motions = {}) {
    const pose = Array.from({ length: 6 }, () => [0, 0, 0]);
    const armAngle = (shoulder, wrist, side) => {
      const screenX = -(wrist.x - shoulder.x);
      const screenY = wrist.y - shoulder.y;
      const angle = Math.atan2(screenX, screenY);
      return side < 0 ? -Math.abs(angle) : Math.abs(angle);
    };

    if (metrics?.arms) {
      pose[2][2] = armAngle(metrics.arms.leftShoulder, metrics.arms.leftWrist, -1);
      pose[3][2] = armAngle(metrics.arms.rightShoulder, metrics.arms.rightWrist, 1);
    }

    if (motions.walking) {
      const swing = Math.sin(Number.isFinite(motions.walkPhase) ? motions.walkPhase : 0) * 0.42;
      pose[2][0] += swing * 0.45;
      pose[3][0] -= swing * 0.45;
      pose[4][0] = swing;
      pose[5][0] = -swing;
    }

    if (motions.jump) {
      pose[2][0] -= 0.3;
      pose[3][0] -= 0.3;
      pose[4][0] = -0.25;
      pose[5][0] = -0.25;
    } else if (motions.squat) {
      pose[4][0] = 0.18;
      pose[5][0] = 0.18;
    }

    return pose;
  }

  function getAvatarHorizontalOffset(metrics) {
    if (!metrics || !Number.isFinite(metrics.centerX)) return 0;
    return Math.max(-0.35, Math.min(0.35, (0.5 - metrics.centerX) * 0.7));
  }

  globalThis.MoneycraftMotionSensing = Object.freeze({
    averageMetrics,
    createAvatarPose,
    createPoseGuideMetrics,
    defaultThresholds: DEFAULT_THRESHOLDS,
    detectMotions,
    getAvatarBodyTilt,
    getCenteredCrop,
    getMotionChanges,
    getAvatarHorizontalOffset,
    getBodyMetrics,
  });
})();
