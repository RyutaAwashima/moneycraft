"use strict";

(() => {
  const MEDIAPIPE_VERSION = "1.2.2";
  const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
  const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  const MIN_DETECTION_INTERVAL_MS = 70;
  const DETECTION_ASPECT_RATIO = 3 / 4;
  const CONNECTIONS = [
    [0, 11], [0, 12], [11, 12], [11, 13], [13, 15],
    [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  ];
  const elements = {
    video: document.querySelector("#run-video"),
    overlay: document.querySelector("#run-overlay"),
    cameraPreview: document.querySelector("#camera-preview"),
    cameraPlaceholder: document.querySelector("#camera-placeholder"),
    cameraState: document.querySelector("#camera-state"),
    start: document.querySelector("#run-start"),
    stop: document.querySelector("#run-stop"),
    reset: document.querySelector("#run-reset"),
    fullscreen: document.querySelector("#run-fullscreen"),
    game: document.querySelector("#run-game"),
    status: document.querySelector("#run-status"),
    scene: document.querySelector("#run-scene"),
    sceneCanvas: document.querySelector("#course-canvas"),
    courseState: document.querySelector("#course-state"),
    clock: document.querySelector("#run-clock"),
    checkpointCounter: document.querySelector("#checkpoint-counter"),
    obstacleCounter: document.querySelector("#obstacle-counter"),
    task: document.querySelector("#run-task"),
    taskNumber: document.querySelector("#task-number"),
    taskPrompt: document.querySelector("#task-prompt"),
    taskTimer: document.querySelector("#task-timer"),
    poseGuideCanvas: document.querySelector("#pose-guide-avatar"),
    poseGuideStatus: document.querySelector("#pose-guide-status"),
    feedback: document.querySelector("#run-feedback"),
    progress: document.querySelector("#course-progress"),
    progressBar: document.querySelector(".motion-run-progress"),
    cleared: document.querySelector("#cleared-count"),
    missed: document.querySelector("#missed-count"),
    score: document.querySelector("#score-time"),
    walking: document.querySelector("#walk-state"),
    walkFrequency: document.querySelector("#walk-frequency"),
    jumpState: document.querySelector("#jump-state"),
    poseStates: {
      armsUp: document.querySelector("#arms-up-state"),
      leftArmUp: document.querySelector("#left-arm-up-state"),
      rightArmUp: document.querySelector("#right-arm-up-state"),
      rightHorizontalLeftUp: document.querySelector("#right-horizontal-left-up-state"),
      leftHorizontalRightUp: document.querySelector("#left-horizontal-right-up-state"),
      tPose: document.querySelector("#t-pose-state"),
    },
    avatarCanvas: document.querySelector("#run-avatar"),
    avatarState: document.querySelector("#avatar-state"),
    result: document.querySelector("#run-result"),
    resultTime: document.querySelector("#result-time"),
    resultCalories: document.querySelector("#result-calories"),
    resultSummary: document.querySelector("#result-summary"),
  };
  const overlayContext = elements.overlay.getContext("2d");
  const detectionCanvas = document.createElement("canvas");
  const detectionContext = detectionCanvas.getContext("2d", { alpha: false });
  let sceneContext = null;
  const runModel = globalThis.MoneycraftMotionRun;
  const courseModel = globalThis.MoneycraftMotionRunCourse;
  const course = courseModel.createCourse(runModel.checkpoints, runModel.obstacles);
  const swingDetector = globalThis.MoneycraftArmSwing.createDetector();
  let courseRenderer = null;
  let landmarker = null;
  let stream = null;
  let avatarRenderer = null;
  let poseGuideRenderer = null;
  let poseGuideName = null;
  let runState = runModel.createRunState();
  let startPhase = "idle";
  let countdownStepIndex = -1;
  let countdownStartedAt = 0;
  let calibrationStartedAt = 0;
  let calibrationSamples = [];
  let baseline = null;
  let startTime = 0;
  let lastDetectionAt = 0;
  let lastVideoTime = -1;
  let frameHandle = 0;
  let activeMotions = emptyPoseState();
  let lastMetrics = null;
  let swingState = emptySwingState();
  let walkPhase = 0;
  let lastWalkUpdateAt = 0;
  let lastWalkingCadence = 0;
  let feedbackTimeout = 0;

  function emptyPoseState() {
    return Object.fromEntries(runModel.poses.map(({ pose }) => [pose, false]));
  }

  function emptySwingState() {
    return { active: false, cadence: 0 };
  }

  function getMovementState() {
    const gateActive = runState.activeCheckpoint !== null;
    return {
      active: swingState.active || gateActive,
      cadence: swingState.active ? swingState.cadence : gateActive ? lastWalkingCadence : 0,
    };
  }

  function initializeCourseRenderer() {
    try {
      courseRenderer = globalThis.MoneycraftMotionRunRenderer.createRenderer(
        elements.sceneCanvas,
        course,
      );
      if (!courseRenderer) {
        sceneContext = elements.sceneCanvas.getContext("2d");
        if (!sceneContext) throw new Error("WebGLとCanvas 2Dのどちらも利用できません。");
        setStatus("この環境では3D表示を利用できないため、簡易表示でプレイします。");
      }
    } catch (error) {
      console.error("Motion run course could not be rendered.", error);
      setStatus(`コースを表示できません: ${error.message}`, true);
      elements.start.disabled = true;
      elements.sceneCanvas.setAttribute("aria-label", "コースを表示できません。WebGLを確認してください。");
    }
  }

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.dataset.error = String(isError);
  }

  function showFeedback(message, type, durationMs) {
    clearTimeout(feedbackTimeout);
    elements.feedback.textContent = message;
    elements.feedback.dataset.type = type;
    elements.feedback.hidden = false;
    elements.feedback.classList.remove("motion-run-feedback-pop");
    void elements.feedback.offsetWidth;
    elements.feedback.classList.add("motion-run-feedback-pop");
    elements.feedback.style.animationDuration = `${durationMs}ms`;
    feedbackTimeout = window.setTimeout(() => {
      elements.feedback.hidden = true;
      elements.feedback.classList.remove("motion-run-feedback-pop");
      elements.feedback.style.removeProperty("animation-duration");
      elements.feedback.removeAttribute("data-type");
      feedbackTimeout = 0;
    }, durationMs);
  }

  function clearFeedback() {
    clearTimeout(feedbackTimeout);
    feedbackTimeout = 0;
    elements.feedback.hidden = true;
    elements.feedback.classList.remove("motion-run-feedback-pop");
    elements.feedback.style.removeProperty("animation-duration");
  }

  function formatTime(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function initializeAvatar() {
    let appearance;
    try {
      ({ appearance } = globalThis.MoneycraftMotionAvatar.loadAppearance());
    } catch (error) {
      console.error("Motion run avatar appearance could not be loaded.", error);
      elements.avatarCanvas.setAttribute("aria-label", "アバターの外観を読み込めません。");
      elements.avatarState.textContent = "表示できません";
      elements.poseGuideCanvas.setAttribute("aria-label", "ポーズのお手本を表示できません。");
      elements.poseGuideStatus.hidden = false;
      return;
    }

    try {
      avatarRenderer = globalThis.MoneycraftMotionAvatar.createRenderer(elements.avatarCanvas);
      avatarRenderer.updateAppearance(appearance);
      elements.avatarState.textContent = "待機中";
    } catch (error) {
      console.error("Motion run avatar could not be initialized.", error);
      elements.avatarCanvas.setAttribute("aria-label", "アバターを表示できません。WebGLを確認してください。");
      elements.avatarState.textContent = "表示できません";
    }

    try {
      poseGuideRenderer = globalThis.MoneycraftMotionAvatar.createRenderer(elements.poseGuideCanvas);
      poseGuideRenderer.updateAppearance(appearance);
      updatePoseGuide();
    } catch (error) {
      console.error("Motion run pose guide could not be initialized.", error);
      elements.poseGuideCanvas.setAttribute("aria-label", "ポーズのお手本を表示できません。WebGLを確認してください。");
      elements.poseGuideStatus.hidden = false;
    }
    if ("ResizeObserver" in window) {
      new ResizeObserver(() => avatarRenderer?.redraw()).observe(elements.avatarCanvas);
      new ResizeObserver(() => poseGuideRenderer?.redraw()).observe(elements.poseGuideCanvas);
    }
    window.addEventListener("resize", () => {
      avatarRenderer?.redraw();
      poseGuideRenderer?.redraw();
    });
  }

  function updatePoseGuide() {
    if (!poseGuideRenderer) return;
    const index = runState.activeCheckpoint ?? runState.nextCheckpoint;
    const checkpoint = runModel.checkpoints[index];
    if (!checkpoint) {
      poseGuideName = null;
      poseGuideRenderer.reset();
      elements.poseGuideCanvas.setAttribute("aria-label", "お手本アバター：ポーズゲートはありません");
      return;
    }
    if (poseGuideName === checkpoint.pose) return;
    poseGuideName = checkpoint.pose;
    poseGuideRenderer.setMotion(globalThis.MoneycraftMotionSensing.createPoseGuideMetrics(checkpoint.pose), {});
    elements.poseGuideCanvas.setAttribute("aria-label", `お手本アバター：${checkpoint.label}`);
  }

  async function createLandmarker() {
    const { FilesetResolver, PoseLandmarker } = await import(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`
    );
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  function getStartError(error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      return "カメラを利用できません。ブラウザーのカメラ許可とHTTPSまたはlocalhostでの表示を確認してください。";
    }
    if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
      return "利用できるカメラが見つかりませんでした。";
    }
    if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
      return "カメラを起動できません。他のアプリが使用中でないか確認してください。";
    }
    return `ランを開始できませんでした: ${error?.message || String(error)}`;
  }

  function stopTracks() {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    elements.video.srcObject = null;
    elements.cameraPreview.dataset.active = "false";
    elements.cameraPlaceholder.hidden = false;
    elements.cameraState.textContent = "停止中";
    swingDetector.reset();
    swingState = emptySwingState();
    walkPhase = 0;
    lastWalkingCadence = 0;
    if (avatarRenderer) avatarRenderer.reset();
  }

  function resetRunDisplay() {
    clearFeedback();
    runState = runModel.createRunState();
    activeMotions = emptyPoseState();
    lastMetrics = null;
    swingDetector.reset();
    swingState = emptySwingState();
    walkPhase = 0;
    lastWalkUpdateAt = 0;
    lastWalkingCadence = 0;
    elements.clock.textContent = "00:00";
    elements.checkpointCounter.textContent = `ゲート 0 / ${runModel.checkpoints.length}`;
    elements.obstacleCounter.textContent = `障害物 0 / ${runModel.obstacles.length}`;
    elements.courseState.textContent = "腕振りで歩き始めてください";
    elements.task.dataset.active = "false";
    elements.taskNumber.textContent = "準備中";
    elements.taskPrompt.textContent = "腕を振って歩こう！";
    elements.taskTimer.textContent = "";
    elements.progress.style.width = "0%";
    elements.progressBar.setAttribute("aria-valuenow", "0");
    elements.cleared.textContent = "0";
    elements.missed.textContent = "0";
    elements.score.textContent = "--:--";
    elements.walking.textContent = "歩行：腕を振ってください";
    elements.walkFrequency.textContent = "頻度 -- Hz · 速度 --x";
    for (const [pose, status] of Object.entries(elements.poseStates)) {
      status.textContent = `${runModel.poses.find((item) => item.pose === pose).label}：待機`;
      status.dataset.active = "false";
    }
    updatePoseGuide();
    elements.result.hidden = true;
    startPhase = "idle";
    countdownStepIndex = -1;
    countdownStartedAt = 0;
    calibrationStartedAt = 0;
    calibrationSamples = [];
    baseline = null;
    drawCourse(0, runState);
  }

  async function startRun() {
    if (stream) return;
    elements.start.disabled = true;
    elements.reset.disabled = true;
    startPhase = "idle";
    clearFeedback();
    setStatus("姿勢推定モデルとカメラを準備しています。初回は少し時間がかかります。");
    try {
      if (!landmarker) landmarker = await createLandmarker();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 24 },
        },
      });
      elements.video.srcObject = stream;
      await elements.video.play();
      elements.cameraPreview.dataset.active = "true";
      elements.cameraPlaceholder.hidden = true;
      elements.cameraState.textContent = "認識中";
      resetRunDisplay();
      runState = runModel.createRunState();
      startPhase = "waiting";
      startTime = 0;
      calibrationStartedAt = 0;
      calibrationSamples = [];
      baseline = null;
      lastDetectionAt = 0;
      lastVideoTime = -1;
      elements.start.disabled = true;
      elements.stop.disabled = false;
      elements.scene.dataset.running = "true";
      elements.taskNumber.textContent = "スタート準備";
      elements.taskPrompt.textContent = "中央枠に上半身を映してね";
      elements.courseState.textContent = "カメラ判定を待っています";
      elements.avatarState.textContent = "カメラ確認中";
      elements.cameraState.textContent = "上半身を確認中";
      setStatus("中央の縦長枠に一人で上半身と両腕を映してください。");
      frameHandle = requestAnimationFrame(runFrame);
    } catch (error) {
      console.error("Motion run could not start.", error);
      stopTracks();
      elements.start.disabled = false;
      elements.stop.disabled = true;
      setStatus(getStartError(error), true);
    }
  }

  function captureDetectionFrame() {
    if (!detectionContext) {
      throw new Error("判定用カメラ画像を作成できません。Canvasに対応したブラウザーが必要です。");
    }
    const width = elements.video.videoWidth;
    const height = elements.video.videoHeight;
    const crop = globalThis.MoneycraftMotionSensing.getCenteredCrop(
      width,
      height,
      DETECTION_ASPECT_RATIO,
    );
    if (!crop) return null;
    const canvasWidth = Math.round(crop.width);
    const canvasHeight = Math.round(crop.height);
    if (detectionCanvas.width !== canvasWidth || detectionCanvas.height !== canvasHeight) {
      detectionCanvas.width = canvasWidth;
      detectionCanvas.height = canvasHeight;
    }
    detectionContext.drawImage(
      elements.video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvasWidth,
      canvasHeight,
    );
    return detectionCanvas;
  }

  function drawPose(landmarks, width, height) {
    if (elements.overlay.width !== width || elements.overlay.height !== height) {
      elements.overlay.width = width;
      elements.overlay.height = height;
    }
    overlayContext.clearRect(0, 0, width, height);
    if (!landmarks) return;
    overlayContext.lineWidth = Math.max(2, width / 240);
    overlayContext.lineCap = "round";
    overlayContext.strokeStyle = "rgba(151, 235, 174, 0.9)";
    for (const [firstIndex, secondIndex] of CONNECTIONS) {
      const first = landmarks[firstIndex];
      const second = landmarks[secondIndex];
      if (!first || !second || first.visibility < 0.35 || second.visibility < 0.35) continue;
      overlayContext.beginPath();
      overlayContext.moveTo(first.x * width, first.y * height);
      overlayContext.lineTo(second.x * width, second.y * height);
      overlayContext.stroke();
    }
    for (const index of [0, 11, 12, 13, 14, 15, 16]) {
      const point = landmarks[index];
      if (!point || point.visibility < 0.35) continue;
      overlayContext.beginPath();
      overlayContext.arc(point.x * width, point.y * height, Math.max(3, width / 120), 0, Math.PI * 2);
      overlayContext.fillStyle = "#dcffdf";
      overlayContext.fill();
    }
  }

  function updatePose(now) {
    if (now - lastDetectionAt < MIN_DETECTION_INTERVAL_MS
      || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      || elements.video.currentTime === lastVideoTime) return;
    const detectionFrame = captureDetectionFrame();
    if (!detectionFrame) {
      throw new Error("カメラ映像を判定用の縦長エリアに切り出せません。");
    }
    lastDetectionAt = now;
    lastVideoTime = elements.video.currentTime;
    const result = landmarker.detectForVideo(detectionFrame, now);
    const landmarks = result.landmarks?.[0] || null;
    drawPose(landmarks, detectionFrame.width, detectionFrame.height);
    lastMetrics = globalThis.MoneycraftMotionSensing.getBodyMetrics(landmarks);
    activeMotions = lastMetrics
      ? globalThis.MoneycraftMotionSensing.detectMotions(lastMetrics, baseline)
      : emptyPoseState();
    if (startPhase === "waiting" || startPhase === "countdown") {
      if (!lastMetrics) {
        calibrationStartedAt = 0;
        calibrationSamples = [];
        baseline = null;
      } else if (startPhase === "waiting") {
        if (calibrationStartedAt === 0) calibrationStartedAt = now;
        calibrationSamples.push(lastMetrics);
      }
      swingDetector.reset();
      swingState = emptySwingState();
      return;
    }
    const wasWalking = swingState.active;
    swingState = swingDetector.update(lastMetrics, now);
    if (swingState.active) {
      lastWalkingCadence = swingState.cadence;
      if (!wasWalking && runState.activeCheckpoint === null
        && (elements.feedback.hidden || elements.feedback.dataset.type !== "success")) {
        showFeedback("腕を振って歩こう！", "walk", 1800);
      }
    }
    const movement = getMovementState();
    if (movement.active) {
      const deltaTime = lastWalkUpdateAt
        ? Math.min(0.2, Math.max(0, now - lastWalkUpdateAt) / 1000)
        : 0;
      walkPhase += Math.PI * 2 * movement.cadence * deltaTime;
    } else {
      walkPhase = 0;
    }
    lastWalkUpdateAt = now;
    for (const [pose, status] of Object.entries(elements.poseStates)) {
      const label = runModel.poses.find((item) => item.pose === pose).label;
      status.textContent = `${label}：${activeMotions[pose] ? "検出中" : "待機"}`;
      status.dataset.active = String(activeMotions[pose]);
    }
    elements.jumpState.textContent = `ジャンプ：${activeMotions.jump ? "検出中" : "待機"}`;
    elements.jumpState.dataset.active = String(Boolean(activeMotions.jump));
    elements.cameraState.textContent = activeMotions.jump ? "ジャンプ検出中" : "認識中";
    if (avatarRenderer) {
      avatarRenderer.setMotion(lastMetrics, {
        ...activeMotions,
        walking: movement.active,
        walkPhase,
      });
    }
  }

  function updateStartCountdown(now) {
    if (startPhase === "waiting") {
      if (!lastMetrics || !runModel.isJumpCalibrationReady(
        calibrationStartedAt,
        now,
        calibrationSamples.length,
      )) {
        elements.taskPrompt.textContent = lastMetrics
          ? "まっすぐ立って準備中…"
          : "中央枠に上半身を映してね";
        elements.cameraState.textContent = lastMetrics ? "基準姿勢を計測中" : "上半身を確認中";
        return;
      }
      baseline = globalThis.MoneycraftMotionSensing.averageMetrics(calibrationSamples);
      if (!baseline) {
        calibrationStartedAt = 0;
        calibrationSamples = [];
        elements.taskPrompt.textContent = "まっすぐ立って準備中…";
        elements.cameraState.textContent = "基準姿勢を再計測中";
        return;
      }
      startPhase = "countdown";
      countdownStartedAt = now;
      countdownStepIndex = -1;
      setStatus("カメラ判定OK！まもなくスタートします。");
      elements.courseState.textContent = "カメラ判定OK！";
    } else if (startPhase === "countdown" && !lastMetrics) {
      startPhase = "waiting";
      countdownStartedAt = 0;
      countdownStepIndex = -1;
      calibrationStartedAt = 0;
      calibrationSamples = [];
      baseline = null;
      clearFeedback();
      elements.taskPrompt.textContent = "中央枠に上半身を映してね";
      elements.courseState.textContent = "カメラ判定を待っています";
      elements.cameraState.textContent = "上半身を確認中";
      setStatus("上半身を認識できません。中央の縦長枠に戻ってください。");
      return;
    }
    if (startPhase !== "countdown") return;

    const step = runModel.getStartCountdownStep(now - countdownStartedAt);
    if (!step) {
      clearFeedback();
      startPhase = "running";
      startTime = now;
      swingDetector.reset();
      swingState = emptySwingState();
      lastWalkingCadence = 0;
      walkPhase = 0;
      lastWalkUpdateAt = now;
      elements.taskPrompt.textContent = "腕を振って歩こう！";
      elements.courseState.textContent = "腕振りで歩き始めてください";
      elements.avatarState.textContent = "歩行待機";
      setStatus("スタート！腕を振って歩こう。ゲートのポーズを0.7秒キープし、ジャンプも試せます。");
      return;
    }
    if (step.index === countdownStepIndex) return;

    countdownStepIndex = step.index;
    elements.cameraState.textContent = step.index === 0 ? "カメラ判定OK！" : "認識中";
    elements.courseState.textContent = step.message;
    elements.taskPrompt.textContent = step.index === 0 ? "カメラ判定OK！" : step.message;
    showFeedback(step.message, "countdown", step.durationMs);
  }

  function recordEvents(events) {
    for (const event of events) {
      if (event.type === "started") {
        setStatus(`ゲート${event.index + 1}通過中：画面のお手本と同じポーズを5秒以内にキープしてください。`);
      } else if (event.type === "cleared") {
        setStatus(`ゲート${event.index + 1}をクリア！その調子で歩き続けよう。`);
        showFeedback("ポーズ成功！", "success", 1800);
      } else if (event.type === "missed") {
        setStatus(`ゲート${event.index + 1}は通過しました。歩き続けて次のゲートへ！`);
      } else if (event.type === "obstacle-cleared") {
        setStatus(`障害物${event.index + 1}をジャンプで回避！その調子！`);
        showFeedback("ジャンプ成功！", "success", 1800);
      } else if (event.type === "obstacle-hit") {
        setStatus(`障害物${event.index + 1}に接触！次はタイミングよくジャンプしよう。`);
        showFeedback("障害物に接触！", "obstacle-hit", 1800);
      }
    }
  }

  function updateRunView(now) {
    const elapsedMs = now - startTime;
    const previousElapsed = runState.elapsedMs;
    const movement = getMovementState();
    runState = runModel.advanceRun(runState, elapsedMs, activeMotions, movement);
    recordEvents(runState.events || []);
    updatePoseGuide();
    const progress = runState.courseElapsedMs / runModel.runDurationMs;
    const summary = runModel.getRunSummary(runState);
    elements.clock.textContent = formatTime(runState.elapsedMs);
    elements.progress.style.width = `${progress * 100}%`;
    elements.progressBar.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    elements.cleared.textContent = String(summary.cleared);
    elements.missed.textContent = String(summary.missed);
    elements.score.textContent = runState.elapsedMs > 0 ? formatTime(summary.scoreMs) : "--:--";
    elements.checkpointCounter.textContent =
      `ゲート ${summary.cleared + summary.missed} / ${runModel.checkpoints.length}`;
    elements.obstacleCounter.textContent =
      `障害物 ${summary.obstaclesCleared + summary.obstaclesHit} / ${runModel.obstacles.length}`;
    if (runState.activeCheckpoint !== null) {
      const checkpoint = runModel.checkpoints[runState.activeCheckpoint];
      const remaining = Math.max(0, runModel.checkpointWindowMs
        - (runState.elapsedMs - runState.checkpointStartedAt));
      const holdProgress = Math.min(1, runState.holdMs / runModel.holdDurationMs);
      elements.task.dataset.active = "true";
      elements.taskNumber.textContent = `ゲート ${runState.activeCheckpoint + 1} / ${runModel.checkpoints.length}`;
      elements.taskPrompt.textContent = "お手本と同じポーズをしてね！";
      elements.taskTimer.textContent = `残り ${Math.ceil(remaining / 1000)} 秒 · キープ ${Math.floor(holdProgress * 100)}%`;
      elements.courseState.textContent = `ポーズゲート ${runState.activeCheckpoint + 1}`;
    } else {
      const nextCheckpoint = runModel.checkpoints[runState.nextCheckpoint];
      elements.task.dataset.active = "false";
      elements.taskNumber.textContent = nextCheckpoint
        ? `次のゲート ${runState.nextCheckpoint + 1} / ${runModel.checkpoints.length}`
        : "ゴールが見えた！";
      elements.taskPrompt.textContent = nextCheckpoint
        ? swingState.active
          ? "次のゲートのお手本を見てね"
          : runState.courseElapsedMs === 0
            ? "腕を振って歩こう！"
            : "腕を振って歩行を再開しよう！"
        : "そのままゴールへ！";
      elements.taskTimer.textContent = "";
      elements.courseState.textContent = runState.complete
        ? "ゴール！"
        : swingState.active
          ? `${course.getSection(progress).label} · 歩行中`
          : `${course.getSection(progress).label} · 腕振り待機`;
    }
    const viewMovement = getMovementState();
    const speed = runModel.getWalkSpeedMultiplier(viewMovement.cadence);
    elements.walking.textContent = viewMovement.active
      ? runState.activeCheckpoint !== null ? "歩行：ゲート通過中" : "歩行：検出中"
      : runState.activeCheckpoint !== null ? "歩行：ゲート判定中" : "歩行：腕を振ってください";
    elements.walking.dataset.active = String(viewMovement.active);
    elements.walkFrequency.textContent = viewMovement.active
      ? `頻度 ${viewMovement.cadence.toFixed(1)} Hz · 速度 ${speed.toFixed(1)}x`
      : "頻度 -- Hz · 速度 --x";
    elements.walkFrequency.dataset.active = String(viewMovement.active);
    if (runState.activeCheckpoint !== null) {
      elements.avatarState.textContent = viewMovement.active ? "歩行・ポーズ判定中" : "ポーズ判定中";
    }
    else if (!runState.complete) elements.avatarState.textContent = swingState.active ? "歩行中" : "歩行待機";
    drawCourse(runState.courseElapsedMs, runState);
    if (runState.complete) {
      finishRun(summary);
      return;
    }
    if (runState.elapsedMs < previousElapsed) {
      throw new Error("Run elapsed time must never move backwards.");
    }
  }

  function drawCourse(elapsedMs, state) {
    if (courseRenderer) {
      courseRenderer.draw(Math.min(1, elapsedMs / runModel.runDurationMs));
      return;
    }
    if (!sceneContext) return;
    const ctx = sceneContext;
    const width = elements.sceneCanvas.width;
    const height = elements.sceneCanvas.height;
    const progress = Math.min(1, elapsedMs / runModel.runDurationMs);
    const time = elapsedMs / 1000;
    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.68);
    sky.addColorStop(0, "#83c7df");
    sky.addColorStop(1, "#e5f1cf");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#a9cf91";
    ctx.fillRect(0, 220, width, height - 220);
    for (let row = 0; row < 3; row += 1) {
      const baseY = 250 + row * 30;
      const step = 28 - row * 4;
      ctx.fillStyle = row % 2 === 0 ? "#8fbd7e" : "#7fae73";
      for (let column = 0; column < Math.ceil(width / step); column += 1) {
        const x = column * step - ((row * 13 + time * 4) % step);
        const heightOffset = ((column + row) % 5) * 8;
        ctx.fillRect(x, baseY - heightOffset, step - 1, heightOffset + 70);
      }
    }

    const horizon = 220;
    const roadHalfWidth = (depth) => 38 + depth * 410;
    const roadY = (depth) => horizon + depth * (height - horizon);
    const roadPoint = (depth, across) => ({
      x: width / 2 + across * roadHalfWidth(depth),
      y: roadY(depth),
    });
    const fillQuad = (points, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index].x, points[index].y);
      }
      ctx.closePath();
      ctx.fill();
    };

    const rowCount = 13;
    const rowOffset = (time * 0.95) % 1;
    for (let row = -1; row < rowCount; row += 1) {
      const nearDepth = (row + rowOffset) / rowCount;
      const farDepth = nearDepth + 1 / rowCount;
      if (farDepth <= 0 || nearDepth >= 1) continue;
      const near = Math.max(0, nearDepth);
      const far = Math.min(1, farDepth);
      for (let column = 0; column < 8; column += 1) {
        const left = -1 + column * 0.25;
        const right = left + 0.25;
        const points = [
          roadPoint(near, left), roadPoint(near, right),
          roadPoint(far, right), roadPoint(far, left),
        ];
        const palette = ["#737d79", "#818a84", "#6d7773", "#899089"];
        fillQuad(points, palette[(row + column + 40) % palette.length]);
        ctx.strokeStyle = "rgba(40, 54, 46, 0.35)";
        ctx.lineWidth = Math.max(1, far * 2);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.lineTo(points[2].x, points[2].y);
        ctx.stroke();
      }

      for (const side of [-1, 1]) {
        const nearOuter = roadPoint(near, side * 1.25);
        const nearInner = roadPoint(near, side * 1.02);
        const farOuter = roadPoint(far, side * 1.25);
        const farInner = roadPoint(far, side * 1.02);
        fillQuad([nearInner, nearOuter, farOuter, farInner],
          (row + side) % 2 ? "#79a95f" : "#83b767");
        ctx.strokeStyle = "rgba(47, 89, 46, 0.38)";
        ctx.lineWidth = Math.max(1, far * 2);
        ctx.beginPath();
        ctx.moveTo(nearOuter.x, nearOuter.y);
        ctx.lineTo(farOuter.x, farOuter.y);
        ctx.stroke();
      }
    }

    for (let index = 0; index < 9; index += 1) {
      const depth = ((index * 0.19 + time * 0.16) % 1);
      const side = index % 2 === 0 ? -1 : 1;
      const base = roadPoint(depth, side * (1.34 + (index % 3) * 0.12));
      const size = 5 + depth * 15;
      ctx.fillStyle = "#765b3e";
      ctx.fillRect(base.x - size * 0.22, base.y - size * 1.1, size * 0.44, size * 1.1);
      ctx.fillStyle = "#3e854f";
      ctx.fillRect(base.x - size, base.y - size * 2.4, size * 2, size * 1.45);
      ctx.fillStyle = "#4d9958";
      ctx.fillRect(base.x - size * 0.72, base.y - size * 2.85, size * 1.44, size * 0.75);
    }

    for (const obstacle of runModel.obstacles) {
      const distance = obstacle.progress - progress;
      if (distance < 0 || distance > 0.28) continue;
      const depth = 1 - distance / 0.28;
      const center = roadPoint(depth, 0);
      const blockSize = 5 + depth * 30;
      const baseY = center.y;
      for (let block = -1; block <= 1; block += 1) {
        ctx.fillStyle = block === 0 ? "#f0ca55" : "#b85c43";
        ctx.fillRect(
          center.x + block * blockSize - blockSize / 2,
          baseY - blockSize,
          blockSize - 1,
          blockSize - 1,
        );
      }
    }

    const checkpoint = state.activeCheckpoint === null
      ? null
      : runModel.checkpoints[state.activeCheckpoint];
    if (checkpoint) {
      const gateY = 345;
      const blockSize = 23;
      for (let row = 0; row < 6; row += 1) {
        for (const side of [-1, 1]) {
          ctx.fillStyle = (row % 2) ? "#c65f42" : "#d5794d";
          ctx.fillRect(width / 2 + side * 82 - blockSize / 2,
            gateY - (row + 1) * blockSize, blockSize, blockSize);
        }
      }
      ctx.fillStyle = "#d5794d";
      ctx.fillRect(width / 2 - 82, gateY - 6 * blockSize, 7 * blockSize, blockSize);
      ctx.fillStyle = "#f4cf67";
      ctx.fillRect(width / 2 - 82, gateY - 6 * blockSize, 7 * blockSize, 5);
      ctx.fillStyle = "#fff8d5";
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(checkpoint.label, width / 2, gateY - 6 * blockSize - 11);
    }

    drawRunner(ctx, width / 2, height - 58, time);
    ctx.fillStyle = "#f3edc2";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(progress >= 0.98 ? "GOAL" : "FINISH", width - 25, 38);
    ctx.fillRect(width - 51, 49, 5, 75);
    ctx.fillStyle = "#db8074";
    ctx.fillRect(width - 46, 49, 35, 23);
  }

  function drawRunner(ctx, x, y, time) {
    const stride = Math.sin(time * 10) * 13;
    ctx.save();
    ctx.fillStyle = "#315b49";
    ctx.fillRect(x - 11 - stride * 0.18, y - 43, 22, 32);
    ctx.fillStyle = "#557c62";
    ctx.fillRect(x - 8 - stride * 0.2, y - 14, 8, 14 + stride * 0.35);
    ctx.fillRect(x + 1 + stride * 0.2, y - 14, 8, 14 - stride * 0.35);
    ctx.fillStyle = "#b95742";
    ctx.fillRect(x - 17 - stride * 0.22, y - 42, 7, 24);
    ctx.fillRect(x + 10 + stride * 0.22, y - 42, 7, 24);
    ctx.fillStyle = "#f3ce9c";
    ctx.fillRect(x - 12, y - 70, 24, 24);
    ctx.fillStyle = "#604638";
    ctx.fillRect(x - 13, y - 76, 26, 9);
    ctx.fillRect(x - 13, y - 68, 5, 5);
    ctx.restore();
  }

  function finishRun(summary) {
    cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    elements.scene.dataset.running = "false";
    elements.courseState.textContent = "ゴール！";
    elements.task.dataset.active = "false";
    elements.taskNumber.textContent = "ゴール！";
    elements.taskPrompt.textContent = "最後まで走りきりました";
    elements.taskTimer.textContent = "";
    elements.avatarState.textContent = "ゴール";
    elements.stop.disabled = true;
    elements.reset.disabled = false;
    stopTracks();
    elements.result.hidden = false;
    elements.resultTime.textContent = formatTime(summary.elapsedMs);
    elements.resultCalories.textContent = `約${summary.estimatedCaloriesKcal.toFixed(1)} kcal`;
    elements.resultSummary.textContent =
      `ポーズを ${summary.cleared} / ${runModel.checkpoints.length} 回クリア。障害物は ${summary.obstaclesCleared} / ${runModel.obstacles.length} 個回避、${summary.obstaclesHit} 個接触。未達ポーズ ${summary.missed} 回のペナルティ ${formatTime(summary.penaltyMs)} を加えたスコアは ${formatTime(summary.scoreMs)} です。消費カロリーは体重${runModel.calorieReferenceWeightKg}kg・運動強度${runModel.calorieActivityMet} METでの簡易推定です。`;
    setStatus("ランが終了しました。カメラを停止しました。もう一度走って記録に挑戦できます。");
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === elements.game) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement) {
        await elements.game.requestFullscreen();
      }
    } catch (error) {
      console.error("Motion run fullscreen could not be changed.", error);
      setStatus(`全画面表示を切り替えられませんでした: ${error.message}`, true);
    }
  }

  function updateFullscreenButton() {
    const isFullscreen = document.fullscreenElement === elements.game;
    elements.fullscreen.textContent = isFullscreen ? "全画面を終了" : "全画面表示";
    elements.fullscreen.setAttribute("aria-pressed", String(isFullscreen));
    drawCourse(runState.courseElapsedMs, runState);
  }

  function stopRun() {
    cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    elements.scene.dataset.running = "false";
    elements.start.disabled = false;
    elements.stop.disabled = true;
    elements.reset.disabled = true;
    stopTracks();
    setStatus("ランを中止しました。カメラを停止しました。");
    elements.courseState.textContent = "中止";
  }

  function runFrame(now) {
    if (!stream || !landmarker) return;
    try {
      updatePose(now);
      if (startPhase !== "running") {
        updateStartCountdown(now);
        frameHandle = requestAnimationFrame(runFrame);
        return;
      }
      updateRunView(now);
      if (!runState.complete) frameHandle = requestAnimationFrame(runFrame);
    } catch (error) {
      console.error("Motion run update failed.", error);
      stopRun();
      setStatus(`ランを停止しました: ${error.message}`, true);
    }
  }

  elements.start.addEventListener("click", startRun);
  elements.stop.addEventListener("click", stopRun);
  elements.fullscreen.addEventListener("click", toggleFullscreen);
  elements.reset.addEventListener("click", () => {
    resetRunDisplay();
    elements.scene.dataset.running = "false";
    elements.start.disabled = false;
    elements.reset.disabled = true;
    setStatus("準備ができました。ランを開始するとカメラを起動します。");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && stream) stopRun();
  });
  document.addEventListener("fullscreenchange", updateFullscreenButton);
  elements.fullscreen.disabled = !document.fullscreenEnabled
    || typeof elements.game.requestFullscreen !== "function";
  window.addEventListener("pagehide", stopTracks);
  initializeCourseRenderer();
  resetRunDisplay();
  initializeAvatar();
})();
