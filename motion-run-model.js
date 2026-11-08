"use strict";

(() => {
  const RUN_DURATION_MS = 105_000;
  const CHECKPOINT_WINDOW_MS = 5_000;
  const HOLD_DURATION_MS = 700;
  const MISS_PENALTY_MS = 1_000;
  const CALORIE_REFERENCE_WEIGHT_KG = 25;
  const CALORIE_ACTIVITY_MET = 3.5;
  const JUMP_CALIBRATION_DURATION_MS = 1_400;
  const JUMP_CALIBRATION_MIN_SAMPLES = 10;
  const JUMP_BUFFER_MS = 900;
  const START_COUNTDOWN_STEPS = Object.freeze([
    { message: "カメラ判定OK！", durationMs: 900 },
    { message: "3", durationMs: 1_000 },
    { message: "2", durationMs: 1_000 },
    { message: "1", durationMs: 1_000 },
    { message: "スタート！", durationMs: 700 },
  ]);
  const START_COUNTDOWN_DURATION_MS = START_COUNTDOWN_STEPS
    .reduce((total, step) => total + step.durationMs, 0);
  const POSES = Object.freeze([
    { pose: "armsUp", label: "両手を上げる" },
    { pose: "leftArmUp", label: "本人の左腕だけを上げる" },
    { pose: "rightHorizontalLeftUp", label: "本人の右腕を水平・左腕を上げる" },
    { pose: "rightArmUp", label: "本人の右腕だけを上げる" },
    { pose: "leftHorizontalRightUp", label: "本人の左腕を水平・右腕を上げる" },
    { pose: "tPose", label: "T字に腕を広げる" },
  ]);
  const CHECKPOINT_COUNT = 5;
  const CHECKPOINTS = Object.freeze(Array.from({ length: CHECKPOINT_COUNT }, (_, index) => ({
    ...POSES[index % POSES.length],
    progress: 0.06 + index * 0.21,
  })));
  const OBSTACLES = Object.freeze([0.17, 0.38, 0.59, 0.8].map((progress, index) =>
    Object.freeze({ index, progress })));

  function createRunState() {
    return {
      elapsedMs: 0,
      courseElapsedMs: 0,
      jumpBufferedUntilMs: -1,
      nextCheckpoint: 0,
      activeCheckpoint: null,
      checkpointStartedAt: null,
      holdMs: 0,
      results: Array(CHECKPOINTS.length).fill(null),
      nextObstacle: 0,
      obstacleResults: Array(OBSTACLES.length).fill(null),
      complete: false,
    };
  }

  function getWalkSpeedMultiplier(cadence) {
    return Number.isFinite(cadence) && cadence >= 0.35 && cadence <= 2.2
      ? cadence
      : 0;
  }

  function getStartCountdownStep(elapsedMs) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new TypeError("Countdown elapsed time must be a non-negative finite number.");
    }
    let remainingMs = elapsedMs;
    for (let index = 0; index < START_COUNTDOWN_STEPS.length; index += 1) {
      const step = START_COUNTDOWN_STEPS[index];
      if (remainingMs < step.durationMs) return { ...step, index };
      remainingMs -= step.durationMs;
    }
    return null;
  }

  function isJumpCalibrationReady(startedAt, now, sampleCount) {
    return Number.isFinite(startedAt)
      && Number.isFinite(now)
      && now >= startedAt
      && Number.isInteger(sampleCount)
      && sampleCount >= JUMP_CALIBRATION_MIN_SAMPLES
      && now - startedAt >= JUMP_CALIBRATION_DURATION_MS;
  }

  function advanceRun(state, elapsedMs, motions = {}, walking = {}) {
    if (!Number.isFinite(elapsedMs)) throw new TypeError("Run timestamp must be finite.");
    if (state.complete) return state;
    const nextElapsedMs = Math.max(state.elapsedMs, elapsedMs);
    const deltaMs = nextElapsedMs - state.elapsedMs;
    const next = {
      ...state,
      elapsedMs: nextElapsedMs,
      results: [...state.results],
      obstacleResults: [...state.obstacleResults],
    };
    const events = [];

    if (motions.jump) next.jumpBufferedUntilMs = nextElapsedMs + JUMP_BUFFER_MS;
    if (walking.active) {
      const speed = getWalkSpeedMultiplier(walking.cadence);
      next.courseElapsedMs = Math.min(RUN_DURATION_MS, state.courseElapsedMs + deltaMs * speed);
    }

    while (next.nextObstacle < OBSTACLES.length) {
      const index = next.nextObstacle;
      const obstacle = OBSTACLES[index];
      const obstacleAt = Math.round(obstacle.progress * RUN_DURATION_MS);
      if (state.courseElapsedMs >= obstacleAt || next.courseElapsedMs < obstacleAt) break;
      const result = next.jumpBufferedUntilMs >= nextElapsedMs ? "cleared" : "hit";
      next.obstacleResults[index] = result;
      next.nextObstacle += 1;
      events.push({ type: result === "cleared" ? "obstacle-cleared" : "obstacle-hit", index, obstacle });
    }

    while (next.nextCheckpoint < CHECKPOINTS.length) {
      const index = next.nextCheckpoint;
      const checkpoint = CHECKPOINTS[index];
      const startsAt = Math.round(checkpoint.progress * RUN_DURATION_MS);
      if (next.activeCheckpoint === null) {
        if (next.courseElapsedMs < startsAt) break;
        next.activeCheckpoint = index;
        next.checkpointStartedAt = next.elapsedMs;
        next.holdMs = 0;
        events.push({ type: "started", index, checkpoint });
        break;
      }

      const isMatchingPose = Boolean(motions[checkpoint.pose]);
      next.holdMs = isMatchingPose
        ? next.holdMs + Math.min(100, deltaMs)
        : 0;
      if (next.holdMs >= HOLD_DURATION_MS) {
        next.results[index] = "cleared";
        next.nextCheckpoint += 1;
        next.activeCheckpoint = null;
        next.checkpointStartedAt = null;
        next.holdMs = 0;
        events.push({ type: "cleared", index, checkpoint });
        continue;
      }
      if (next.elapsedMs - next.checkpointStartedAt >= CHECKPOINT_WINDOW_MS) {
        next.results[index] = "missed";
        next.nextCheckpoint += 1;
        next.activeCheckpoint = null;
        next.checkpointStartedAt = null;
        next.holdMs = 0;
        events.push({ type: "missed", index, checkpoint });
        continue;
      }
      if (next.activeCheckpoint !== null) break;
    }

    if (next.courseElapsedMs >= RUN_DURATION_MS && next.nextCheckpoint >= CHECKPOINTS.length) {
      next.complete = true;
      events.push({ type: "finished" });
    }
    return { ...next, events };
  }

  function getRunSummary(state) {
    const cleared = state.results.filter((result) => result === "cleared").length;
    const missed = state.results.filter((result) => result === "missed").length;
    const obstaclesCleared = state.obstacleResults.filter((result) => result === "cleared").length;
    const obstaclesHit = state.obstacleResults.filter((result) => result === "hit").length;
    const elapsedMs = state.elapsedMs;
    return {
      cleared,
      missed,
      obstaclesCleared,
      obstaclesHit,
      penaltyMs: missed * MISS_PENALTY_MS,
      elapsedMs,
      scoreMs: elapsedMs + missed * MISS_PENALTY_MS,
      estimatedCaloriesKcal: estimateCalories(elapsedMs),
    };
  }

  function estimateCalories(elapsedMs) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new TypeError("Run duration must be a non-negative finite number.");
    }
    const calories = CALORIE_ACTIVITY_MET * CALORIE_REFERENCE_WEIGHT_KG * (elapsedMs / 3_600_000);
    return Math.round(calories * 10) / 10;
  }

  globalThis.MoneycraftMotionRun = Object.freeze({
    checkpoints: CHECKPOINTS,
    checkpointWindowMs: CHECKPOINT_WINDOW_MS,
    holdDurationMs: HOLD_DURATION_MS,
    missPenaltyMs: MISS_PENALTY_MS,
    calorieReferenceWeightKg: CALORIE_REFERENCE_WEIGHT_KG,
    calorieActivityMet: CALORIE_ACTIVITY_MET,
    jumpCalibrationDurationMs: JUMP_CALIBRATION_DURATION_MS,
    jumpCalibrationMinSamples: JUMP_CALIBRATION_MIN_SAMPLES,
    jumpBufferMs: JUMP_BUFFER_MS,
    poses: POSES,
    obstacles: OBSTACLES,
    runDurationMs: RUN_DURATION_MS,
    startCountdownDurationMs: START_COUNTDOWN_DURATION_MS,
    advanceRun,
    createRunState,
    getWalkSpeedMultiplier,
    getRunSummary,
    estimateCalories,
    getStartCountdownStep,
    isJumpCalibrationReady,
  });
})();
