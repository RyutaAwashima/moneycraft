"use strict";

(() => {
  const SAMPLE_TIMEOUT_MS = 250;
  const HISTORY_WINDOW_MS = 1800;
  const NOISE_THRESHOLD = 0.035;
  const MIN_SWING_AMPLITUDE = 0.22;
  const MIN_REVERSAL_INTERVAL_MS = 180;
  const MAX_REVERSAL_INTERVAL_MS = 900;
  const REQUIRED_REVERSALS = 3;

  function createTracker() {
    return {
      value: null,
      direction: 0,
      candidateDirection: 0,
      extreme: null,
      reversals: [],
      lastAt: null,
      amplitude: 0,
    };
  }

  function updateTracker(tracker, value, now) {
    if (tracker.lastAt === null || now - tracker.lastAt > SAMPLE_TIMEOUT_MS) {
      tracker.value = value;
      tracker.direction = 0;
      tracker.candidateDirection = 0;
      tracker.extreme = value;
      tracker.reversals = [];
      tracker.amplitude = 0;
      tracker.lastAt = now;
      return;
    }

    const previousValue = tracker.value;
    const response = 1 - Math.exp(-Math.max(0, now - tracker.lastAt) / 90);
    tracker.value += (value - tracker.value) * response;
    const delta = tracker.value - previousValue;
    if (Math.abs(delta) >= NOISE_THRESHOLD) {
      const direction = Math.sign(delta);
      if (tracker.direction === 0) {
        tracker.direction = direction;
        tracker.extreme = tracker.value;
      } else if (direction === tracker.direction) {
        tracker.candidateDirection = 0;
        tracker.extreme = tracker.value;
      } else {
        tracker.candidateDirection = direction;
        const amplitude = Math.abs(tracker.extreme - tracker.value);
        if (amplitude >= MIN_SWING_AMPLITUDE) {
          const interval = now - tracker.reversals.at(-1)?.at;
          if (tracker.reversals.length === 0
            || (interval >= MIN_REVERSAL_INTERVAL_MS && interval <= MAX_REVERSAL_INTERVAL_MS)) {
            tracker.reversals.push({ at: now, amplitude });
          } else {
            tracker.reversals = [{ at: now, amplitude }];
          }
          tracker.amplitude = amplitude;
          tracker.direction = direction;
          tracker.extreme = tracker.value;
          tracker.candidateDirection = 0;
        }
      }
    }
    tracker.lastAt = now;
    tracker.reversals = tracker.reversals.filter((reversal) => now - reversal.at <= HISTORY_WINDOW_MS);
  }

  function getTrackerState(tracker, now) {
    const reversals = tracker.reversals.filter((reversal) => now - reversal.at <= HISTORY_WINDOW_MS);
    const intervals = reversals.slice(1).map((reversal, index) => reversal.at - reversals[index].at);
    const averageInterval = intervals.length
      ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
      : null;
    const cadence = averageInterval ? 1000 / (averageInterval * 2) : 0;
    return {
      amplitude: tracker.amplitude,
      cadence,
      reversals: reversals.length,
      active: reversals.length >= REQUIRED_REVERSALS
        && cadence >= 0.35 && cadence <= 2.2,
      position: tracker.value,
    };
  }

  function createDetector() {
    const trackers = { left: createTracker(), right: createTracker() };

    function reset() {
      trackers.left = createTracker();
      trackers.right = createTracker();
    }

    function update(metrics, now) {
      if (!Number.isFinite(now)) throw new TypeError("Arm swing timestamp must be finite.");
      const arms = metrics?.arms;
      if (!arms || !Number.isFinite(metrics.centerX)
        || !Number.isFinite(metrics.shoulderWidth) || metrics.shoulderWidth < 0.05) {
        reset();
        return {
          active: false,
          cadence: 0,
          left: getTrackerState(trackers.left, now),
          right: getTrackerState(trackers.right, now),
        };
      }

      for (const side of ["left", "right"]) {
        const wrist = arms[`${side}Wrist`];
        if (!wrist || !Number.isFinite(wrist.x)) {
          trackers[side] = createTracker();
          continue;
        }
        const normalizedX = (wrist.x - metrics.centerX) / metrics.shoulderWidth;
        updateTracker(trackers[side], normalizedX, now);
      }

      const left = getTrackerState(trackers.left, now);
      const right = getTrackerState(trackers.right, now);
      const active = left.active || right.active;
      return {
        active,
        cadence: active ? Math.max(left.cadence, right.cadence) : 0,
        left,
        right,
      };
    }

    return Object.freeze({ reset, update });
  }

  globalThis.MoneycraftArmSwing = Object.freeze({ createDetector });
})();
