"use strict";

(() => {
  const MEDIAPIPE_VERSION = "1.2.2";
  const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
  const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  const MIN_DETECTION_INTERVAL_MS = 70;
  const HISTORY_SIZE = 48;
  const CONNECTIONS = [
    [0, 11], [0, 12], [11, 12], [11, 13], [13, 15],
    [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  ];
  const elements = {
    video: document.querySelector("#swing-video"),
    overlay: document.querySelector("#swing-overlay"),
    preview: document.querySelector("#swing-camera-preview"),
    placeholder: document.querySelector("#swing-camera-placeholder"),
    cameraState: document.querySelector("#swing-camera-state"),
    start: document.querySelector("#swing-start"),
    stop: document.querySelector("#swing-stop"),
    message: document.querySelector("#swing-message"),
    status: document.querySelector("#swing-status"),
    statusLabel: document.querySelector("#swing-status-label"),
    frequency: document.querySelector("#swing-frequency"),
    chart: document.querySelector("#swing-chart"),
    leftMetric: document.querySelector("#left-swing-metric"),
    rightMetric: document.querySelector("#right-swing-metric"),
    avatarCanvas: document.querySelector("#swing-avatar"),
    avatarState: document.querySelector("#swing-avatar-state"),
  };
  const overlayContext = elements.overlay.getContext("2d");
  const chartContext = elements.chart.getContext("2d");
  const detector = globalThis.MoneycraftArmSwing.createDetector();
  const history = { left: [], right: [] };
  const chartBaseline = { left: null, right: null };
  let landmarker = null;
  let stream = null;
  let frameHandle = 0;
  let lastDetectionAt = 0;
  let lastVideoTime = -1;
  let lastWalkUpdateAt = 0;
  let walkPhase = 0;
  let avatarRenderer = null;

  function setMessage(message, isError = false) {
    elements.message.textContent = message;
    elements.message.dataset.error = String(isError);
  }

  function initializeAvatar() {
    try {
      const { appearance } = globalThis.MoneycraftMotionAvatar.loadAppearance();
      avatarRenderer = globalThis.MoneycraftMotionAvatar.createRenderer(elements.avatarCanvas);
      avatarRenderer.updateAppearance(appearance);
      if ("ResizeObserver" in window) {
        new ResizeObserver(() => avatarRenderer?.redraw()).observe(elements.avatarCanvas);
      }
      window.addEventListener("resize", () => avatarRenderer?.redraw());
    } catch (error) {
      console.error("Arm swing avatar could not be initialized.", error);
      elements.avatarCanvas.setAttribute("aria-label", "アバターを表示できません。WebGLを確認してください。");
      elements.avatarState.textContent = "表示できません";
    }
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

  function drawPose(landmarks) {
    const width = elements.video.videoWidth;
    const height = elements.video.videoHeight;
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
    for (const index of [0, 11, 12, 15, 16]) {
      const point = landmarks[index];
      if (!point || point.visibility < 0.35) continue;
      overlayContext.beginPath();
      overlayContext.arc(point.x * width, point.y * height, Math.max(3, width / 120), 0, Math.PI * 2);
      overlayContext.fillStyle = "#dcffdf";
      overlayContext.fill();
    }
  }

  function drawChart() {
    const { width, height } = elements.chart;
    const ctx = chartContext;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fbfcfa";
    ctx.fillRect(0, 0, width, height);
    const centerY = height / 2;
    const amplitude = height * 0.37;
    ctx.strokeStyle = "#e4eae1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    for (const [side, color] of [["left", "#3f9a5c"], ["right", "#d18b3b"]]) {
      const values = history[side];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      values.forEach((value, index) => {
        const x = values.length < 2 ? width : index / (values.length - 1) * width;
        const y = centerY - Math.max(-1, Math.min(1, value)) * amplitude;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#3f9a5c";
    ctx.fillText("左手首", 12, 20);
    ctx.fillStyle = "#d18b3b";
    ctx.fillText("右手首", 76, 20);
  }

  function updateReadout(state, hasArms) {
    elements.status.dataset.active = String(state.active);
    elements.statusLabel.textContent = !hasArms
      ? "両手首を映してください"
      : state.active
        ? "歩行を検出中"
        : "腕を振ってください";
    elements.frequency.textContent = state.active ? `${state.cadence.toFixed(1)} Hz` : "-- Hz";
    elements.avatarState.textContent = state.active ? "歩行中" : hasArms ? "待機中" : "手首を認識できません";
    for (const [side, metric, status] of [
      ["left", state.left, elements.leftMetric],
      ["right", state.right, elements.rightMetric],
    ]) {
      status.textContent = `${metric.amplitude.toFixed(2)}幅 · ${metric.reversals}回`;
    }
    for (const side of ["left", "right"]) {
      const value = state[side].position;
      if (Number.isFinite(value)) {
        if (chartBaseline[side] === null) chartBaseline[side] = value;
        history[side].push(value - chartBaseline[side]);
      }
      else history[side].push(null);
      if (history[side].length > HISTORY_SIZE) history[side].shift();
    }
    drawChart();
  }

  function updateAvatar(metrics, state, now) {
    if (state.active) {
      const deltaTime = lastWalkUpdateAt ? Math.min(0.2, Math.max(0, now - lastWalkUpdateAt) / 1000) : 0;
      walkPhase += Math.PI * 2 * state.cadence * deltaTime;
    } else {
      walkPhase = 0;
    }
    lastWalkUpdateAt = now;
    avatarRenderer?.setMotion(metrics, { walking: state.active, walkPhase });
  }

  function stopCamera() {
    cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    elements.video.srcObject = null;
    elements.preview.dataset.active = "false";
    elements.placeholder.hidden = false;
    elements.cameraState.textContent = "停止中";
    elements.start.disabled = false;
    elements.stop.disabled = true;
    detector.reset();
    history.left.length = 0;
    history.right.length = 0;
    chartBaseline.left = null;
    chartBaseline.right = null;
    drawChart();
    const empty = detector.update(null, performance.now());
    updateReadout(empty, false);
    updateAvatar(null, empty, performance.now());
  }

  async function startCamera() {
    if (stream) return;
    elements.start.disabled = true;
    setMessage("姿勢推定モデルとカメラを準備しています。初回は少し時間がかかります。");
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
      elements.preview.dataset.active = "true";
      elements.placeholder.hidden = true;
      elements.cameraState.textContent = "認識中";
      elements.stop.disabled = false;
      detector.reset();
      history.left.length = 0;
      history.right.length = 0;
      chartBaseline.left = null;
      chartBaseline.right = null;
      drawChart();
      lastDetectionAt = 0;
      lastVideoTime = -1;
      lastWalkUpdateAt = 0;
      setMessage("映像上の左右に手首を振ってください。反復が続くと歩行判定になります。");
      frameHandle = requestAnimationFrame(inferenceFrame);
    } catch (error) {
      console.error("Arm swing test could not start.", error);
      stopCamera();
      setMessage(error?.name === "NotAllowedError" || error?.name === "SecurityError"
        ? "カメラを利用できません。許可設定とHTTPSまたはlocalhostでの表示を確認してください。"
        : `カメラを開始できませんでした: ${error?.message || String(error)}`, true);
    }
  }

  function inferenceFrame(now) {
    if (!stream || !landmarker) return;
    if (now - lastDetectionAt >= MIN_DETECTION_INTERVAL_MS
      && elements.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && elements.video.currentTime !== lastVideoTime) {
      lastDetectionAt = now;
      lastVideoTime = elements.video.currentTime;
      try {
        const result = landmarker.detectForVideo(elements.video, now);
        const landmarks = result.landmarks?.[0] || null;
        drawPose(landmarks);
        const metrics = globalThis.MoneycraftMotionSensing.getBodyMetrics(landmarks);
        const state = detector.update(metrics, now);
        updateReadout(state, Boolean(metrics?.arms));
        updateAvatar(metrics, state, now);
        elements.cameraState.textContent = metrics?.arms ? "手首を追跡中" : "腕が見えません";
      } catch (error) {
        console.error("Arm swing inference failed.", error);
        stopCamera();
        setMessage(`腕振りの推定に失敗したためカメラを停止しました: ${error.message}`, true);
        return;
      }
    }
    frameHandle = requestAnimationFrame(inferenceFrame);
  }

  elements.start.addEventListener("click", startCamera);
  elements.stop.addEventListener("click", () => {
    stopCamera();
    setMessage("テストを停止しました。カメラを停止しました。");
  });
  window.addEventListener("pagehide", stopCamera);
  initializeAvatar();
  drawChart();
})();
