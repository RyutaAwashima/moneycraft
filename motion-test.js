"use strict";

(() => {
  const MEDIAPIPE_VERSION = "1.2.2";
  const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
  const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  const MIN_DETECTION_INTERVAL_MS = 70;
  const CALIBRATION_DURATION_MS = 1600;
  const LOG_LIMIT = 8;
  const TUNING_STORAGE_KEY = "moneycraft-motion-tuning-v1";
  const CONNECTIONS = [
    [0, 11], [0, 12], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
    [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
    [11, 23], [12, 24], [23, 24],
  ];
  const MOTION_LABELS = {
    jump: "ジャンプ",
    squat: "スニーク / しゃがみ",
    armsUp: "両手を上げる",
    tPose: "T字ポーズ",
    leftArmUp: "本人の左腕だけを上げる",
    rightArmUp: "本人の右腕だけを上げる",
    rightHorizontalLeftUp: "本人の右腕を水平・左腕を上げる",
    leftHorizontalRightUp: "本人の左腕を水平・右腕を上げる",
  };
  const elements = {
    video: document.querySelector("#motion-video"),
    overlay: document.querySelector("#motion-overlay"),
    preview: document.querySelector("#motion-preview"),
    placeholder: document.querySelector("#preview-placeholder"),
    start: document.querySelector("#camera-start"),
    stop: document.querySelector("#camera-stop"),
    calibrate: document.querySelector("#calibrate"),
    verticalThreshold: document.querySelector("#vertical-threshold"),
    verticalThresholdValue: document.querySelector("#vertical-threshold-value"),
    tiltThreshold: document.querySelector("#tilt-threshold"),
    tiltThresholdValue: document.querySelector("#tilt-threshold-value"),
    useTilt: document.querySelector("#use-tilt"),
    resetTuning: document.querySelector("#reset-tuning"),
    tuningStatus: document.querySelector("#tuning-status"),
    measurements: document.querySelector("#motion-measurements"),
    cameraStatus: document.querySelector("#camera-status"),
    cameraBadge: document.querySelector("#camera-badge"),
    cameraIndicator: document.querySelector("#camera-indicator"),
    recognitionStatus: document.querySelector("#recognition-status"),
    inferenceRate: document.querySelector("#inference-rate"),
    positionMarker: document.querySelector("#position-marker"),
    positionStatus: document.querySelector("#position-status"),
    eventLog: document.querySelector("#event-log"),
    avatarCanvas: document.querySelector("#motion-avatar"),
    avatarMotionStatus: document.querySelector("#avatar-motion-status"),
    avatarAppearanceStatus: document.querySelector("#avatar-appearance-status"),
    detections: {
      jump: document.querySelector("#detection-jump"),
      squat: document.querySelector("#detection-squat"),
      armsUp: document.querySelector("#detection-arms-up"),
      tPose: document.querySelector("#detection-t-pose"),
      leftArmUp: document.querySelector("#detection-left-arm-up"),
      rightArmUp: document.querySelector("#detection-right-arm-up"),
      rightHorizontalLeftUp: document.querySelector("#detection-right-horizontal-left-up"),
      leftHorizontalRightUp: document.querySelector("#detection-left-horizontal-right-up"),
    },
  };
  const context = elements.overlay.getContext("2d");
  let avatarRenderer = null;
  let stream = null;
  let landmarker = null;
  let frameHandle = 0;
  let lastDetectionAt = 0;
  let lastVideoTime = -1;
  let calibrationStartedAt = 0;
  let calibrationSamples = [];
  let baseline = null;
  let previousMotions = Object.fromEntries(Object.keys(MOTION_LABELS).map((key) => [key, false]));
  let inferenceSamples = [];
  let cameraStarting = false;
  let thresholds = { ...globalThis.MoneycraftMotionSensing.defaultThresholds };

  function initializeAvatar() {
    try {
      const { appearance, saved, error } = globalThis.MoneycraftMotionAvatar.loadAppearance();
      avatarRenderer = globalThis.MoneycraftMotionAvatar.createRenderer(elements.avatarCanvas);
      avatarRenderer.updateAppearance(appearance);
      elements.avatarAppearanceStatus.textContent = saved
        ? "アバターのアトリエで保存した外観を表示中"
        : error
          ? "保存した外観を読み込めないため、初期の外観を表示中"
          : "保存した外観がないため、初期の外観を表示中";
      elements.avatarMotionStatus.textContent = "カメラ開始待ち";
      if ("ResizeObserver" in window) {
        new ResizeObserver(() => avatarRenderer?.redraw()).observe(elements.avatarCanvas);
      }
      window.addEventListener("resize", () => avatarRenderer?.redraw());
    } catch (error) {
      console.error("Motion avatar preview could not be initialized.", error);
      elements.avatarCanvas.setAttribute("aria-label", "アバターを表示できません。WebGLを確認してください。");
      elements.avatarMotionStatus.textContent = "3Dアバターを表示できません";
      elements.avatarAppearanceStatus.textContent = "WebGLを利用できるブラウザーで再読み込みしてください。";
    }
  }

  function updateAvatar(metrics, motions = {}) {
    if (!avatarRenderer) return;
    avatarRenderer.setMotion(metrics, motions);
    if (motions.jump) elements.avatarMotionStatus.textContent = "ジャンプ";
    else if (motions.squat) elements.avatarMotionStatus.textContent = "しゃがみ";
    else if (motions.rightHorizontalLeftUp) elements.avatarMotionStatus.textContent = "右腕水平・左腕上げ";
    else if (motions.leftHorizontalRightUp) elements.avatarMotionStatus.textContent = "左腕水平・右腕上げ";
    else if (motions.leftArmUp) elements.avatarMotionStatus.textContent = "左腕上げ";
    else if (motions.rightArmUp) elements.avatarMotionStatus.textContent = "右腕上げ";
    else if (motions.tPose) elements.avatarMotionStatus.textContent = "T字ポーズ";
    else if (motions.armsUp) elements.avatarMotionStatus.textContent = "両手を上げる";
    else if (!stream) elements.avatarMotionStatus.textContent = "カメラ開始待ち";
    else if (!metrics) elements.avatarMotionStatus.textContent = "姿勢を認識できません";
    else elements.avatarMotionStatus.textContent = "姿勢・体の傾きを反映中";
  }

  function setCameraStatus(text, isError = false) {
    elements.cameraStatus.textContent = text;
    elements.cameraStatus.dataset.error = String(isError);
  }

  function setRecognitionStatus(text) {
    elements.recognitionStatus.textContent = text;
  }

  async function createLandmarker() {
    setCameraStatus("姿勢推定モデルを読み込んでいます。初回は少し時間がかかります。");
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

  function cameraErrorMessage(error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      return "カメラを利用できません。ブラウザーのカメラ許可とHTTPSまたはlocalhostでの表示を確認してください。";
    }
    if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
      return "利用できるカメラが見つかりませんでした。PCカメラを接続してから再試行してください。";
    }
    if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
      return "カメラを起動できません。他のアプリが使用中でないか確認してください。";
    }
    return `開始できませんでした: ${error?.message || String(error)}`;
  }

  function resetCalibration() {
    baseline = null;
    calibrationSamples = [];
    calibrationStartedAt = performance.now();
    previousMotions = Object.fromEntries(Object.keys(MOTION_LABELS).map((key) => [key, false]));
    setRecognitionStatus("まっすぐ立って静止してください。上半身の基準姿勢を計測中です。");
    elements.calibrate.disabled = true;
  }

  function updateTuningControls() {
    elements.verticalThresholdValue.textContent = `${elements.verticalThreshold.value}%`;
    elements.tiltThresholdValue.textContent = `${elements.tiltThreshold.value}%`;
  }

  function saveTuning() {
    thresholds = {
      vertical: Number(elements.verticalThreshold.value) / 100,
      tilt: Number(elements.tiltThreshold.value) / 100,
      useTilt: elements.useTilt.checked,
    };
    updateTuningControls();
    try {
      localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(thresholds));
      elements.tuningStatus.textContent = "設定をこのブラウザーに保存しました。カメラ使用中は判定にすぐ反映されます。";
      elements.tuningStatus.dataset.error = "false";
    } catch (error) {
      console.error("Motion tuning settings could not be saved.", error);
      elements.tuningStatus.textContent = "設定を保存できませんでした。現在のページでは調整値を使用できます。";
      elements.tuningStatus.dataset.error = "true";
    }
  }

  function loadTuning() {
    const defaults = globalThis.MoneycraftMotionSensing.defaultThresholds;
    try {
      const saved = localStorage.getItem(TUNING_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const vertical = Number(parsed.vertical) * 100;
        const tilt = Number(parsed.tilt) * 100;
        if (!Number.isFinite(vertical) || !Number.isFinite(tilt)
          || vertical < 6 || vertical > 30 || tilt < 2 || tilt > 25
          || typeof parsed.useTilt !== "boolean") {
          throw new TypeError("Saved motion thresholds are invalid.");
        }
        elements.verticalThreshold.value = String(vertical);
        elements.tiltThreshold.value = String(tilt);
        elements.useTilt.checked = parsed.useTilt;
        thresholds = parsed;
        elements.tuningStatus.textContent = "保存した調整値を読み込みました。";
      } else {
        thresholds = { ...defaults };
      }
    } catch (error) {
      console.error("Motion tuning settings could not be loaded.", error);
      thresholds = { ...defaults };
      elements.verticalThreshold.value = String(defaults.vertical * 100);
      elements.tiltThreshold.value = String(defaults.tilt * 100);
      elements.useTilt.checked = defaults.useTilt;
      elements.tuningStatus.textContent = "保存した設定を読み込めないため、初期値を使用します。";
      elements.tuningStatus.dataset.error = "true";
    }
    updateTuningControls();
  }

  function resetTuning() {
    const defaults = globalThis.MoneycraftMotionSensing.defaultThresholds;
    elements.verticalThreshold.value = String(defaults.vertical * 100);
    elements.tiltThreshold.value = String(defaults.tilt * 100);
    elements.useTilt.checked = defaults.useTilt;
    saveTuning();
  }

  function updateMotionMeasurements(metrics) {
    const changes = globalThis.MoneycraftMotionSensing.getMotionChanges(metrics, baseline);
    if (changes.vertical === null) {
      elements.measurements.textContent = "計測値：立ち姿勢を計測後に表示";
      return;
    }
    const vertical = Math.round(changes.vertical * 100);
    if (changes.tilt === null) {
      elements.measurements.textContent =
        `計測値：上下 ${vertical >= 0 ? "+" : ""}${vertical}% / 傾き計測方式が変化（再計測してください）`;
      return;
    }
    const tilt = Math.round(changes.tilt * 100);
    const tiltSource = metrics.leanUsesHips ? "肩・腰" : "頭・肩の傾き目安";
    elements.measurements.textContent = `計測値：上下 ${vertical >= 0 ? "+" : ""}${vertical}% / ${tiltSource} ${tilt}%`;
  }

  async function startCamera() {
    if (cameraStarting || stream) return;
    cameraStarting = true;
    elements.start.disabled = true;
    setCameraStatus("カメラと姿勢推定を準備しています。");
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
      elements.cameraBadge.textContent = "カメラ使用中";
      elements.cameraIndicator.dataset.active = "true";
      elements.stop.disabled = false;
      resetCalibration();
      setCameraStatus("カメラ映像はこのブラウザー内で処理され、保存・送信されません。");
      frameHandle = requestAnimationFrame(inferenceFrame);
    } catch (error) {
      console.error("Motion test could not start.", error);
      stopCamera();
      setCameraStatus(cameraErrorMessage(error), true);
    } finally {
      cameraStarting = false;
      elements.start.disabled = Boolean(stream);
    }
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
    elements.cameraBadge.textContent = "カメラ停止中";
    elements.cameraIndicator.dataset.active = "false";
    elements.start.disabled = false;
    elements.stop.disabled = true;
    elements.calibrate.disabled = true;
    elements.positionMarker.style.left = "50%";
    elements.positionStatus.textContent = "左右位置：未計測";
    elements.measurements.textContent = "計測値：立ち姿勢を計測後に表示";
    elements.inferenceRate.textContent = "-- fps";
    setRecognitionStatus("カメラを開始すると認識結果が表示されます。");
    for (const key of Object.keys(MOTION_LABELS)) updateDetection(key, false);
    context.clearRect(0, 0, elements.overlay.width, elements.overlay.height);
    baseline = null;
    previousMotions = Object.fromEntries(Object.keys(MOTION_LABELS).map((key) => [key, false]));
    updateAvatar(null);
  }

  function updateDetection(key, active) {
    const card = elements.detections[key];
    card.dataset.active = String(active);
    card.querySelector("output").textContent = active ? "検出中" : "待機";
  }

  function appendMotionEvent(key) {
    const item = document.createElement("li");
    const timestamp = new Date().toLocaleTimeString("ja-JP", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    item.textContent = `${timestamp} · ${MOTION_LABELS[key]}を検出`;
    elements.eventLog.prepend(item);
    while (elements.eventLog.children.length > LOG_LIMIT) {
      elements.eventLog.lastElementChild.remove();
    }
  }

  function drawPose(landmarks) {
    const width = elements.video.videoWidth;
    const height = elements.video.videoHeight;
    if (elements.overlay.width !== width || elements.overlay.height !== height) {
      elements.overlay.width = width;
      elements.overlay.height = height;
    }
    context.clearRect(0, 0, width, height);
    if (!landmarks) return;

    context.lineWidth = Math.max(2, width / 240);
    context.lineCap = "round";
    context.strokeStyle = "rgba(151, 235, 174, 0.9)";
    for (const [firstIndex, secondIndex] of CONNECTIONS) {
      const first = landmarks[firstIndex];
      const second = landmarks[secondIndex];
      if (!first || !second || first.visibility < 0.35 || second.visibility < 0.35) continue;
      context.beginPath();
      context.moveTo(first.x * width, first.y * height);
      context.lineTo(second.x * width, second.y * height);
      context.stroke();
    }
    for (const point of landmarks) {
      if (!point || point.visibility < 0.35) continue;
      context.beginPath();
      context.arc(point.x * width, point.y * height, Math.max(3, width / 120), 0, Math.PI * 2);
      context.fillStyle = "#dcffdf";
      context.fill();
    }
  }

  function updateInferenceRate(now) {
    inferenceSamples.push(now);
    inferenceSamples = inferenceSamples.filter((time) => now - time <= 1000);
    elements.inferenceRate.textContent = `${inferenceSamples.length} fps`;
  }

  function updateCalibration(metrics, now) {
    calibrationSamples.push(metrics);
    if (now - calibrationStartedAt < CALIBRATION_DURATION_MS) return false;
    baseline = globalThis.MoneycraftMotionSensing.averageMetrics(calibrationSamples);
    if (!baseline) {
      calibrationStartedAt = now;
      calibrationSamples = [];
      setRecognitionStatus("頭・両肩・腕が映るよう調整し、上半身の計測をやり直します。");
      return false;
    }
    elements.calibrate.disabled = false;
    setRecognitionStatus("立ち姿勢を計測しました。ジャンプ・しゃがみ・腕のポーズを試してください。");
    return true;
  }

  function inferenceFrame(now) {
    if (!stream || !landmarker) return;
    if (now - lastDetectionAt >= MIN_DETECTION_INTERVAL_MS
      && elements.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && elements.video.currentTime !== lastVideoTime) {
      lastDetectionAt = now;
      lastVideoTime = elements.video.currentTime;
      let result;
      try {
        result = landmarker.detectForVideo(elements.video, now);
      } catch (error) {
        console.error("Motion pose inference failed.", error);
        stopCamera();
        setCameraStatus(`姿勢推定に失敗したためカメラを停止しました: ${error.message}`, true);
        setRecognitionStatus("カメラを再開しても解決しない場合は、別のブラウザーで試してください。");
        return;
      }
      const landmarks = result.landmarks?.[0] || null;
      drawPose(landmarks);
      updateInferenceRate(now);

      const metrics = globalThis.MoneycraftMotionSensing.getBodyMetrics(landmarks);
      if (!metrics) {
        updateAvatar(null);
        setRecognitionStatus("上半身を認識できません。頭・両肩・腕が画面に入るよう調整してください。");
        elements.positionStatus.textContent = "左右位置：上半身を認識できません";
        for (const key of Object.keys(MOTION_LABELS)) updateDetection(key, false);
        previousMotions = Object.fromEntries(Object.keys(MOTION_LABELS).map((key) => [key, false]));
      } else {
        const mirroredCenterX = 1 - metrics.centerX;
        const markerPercent = Math.min(96, Math.max(4, mirroredCenterX * 100));
        elements.positionMarker.style.left = `${markerPercent}%`;
        const side = mirroredCenterX < 0.42 ? "左" : mirroredCenterX > 0.58 ? "右" : "中央";
        elements.positionStatus.textContent = `左右位置：${side}`;

        if (!baseline) {
          updateAvatar(metrics);
          updateCalibration(metrics, now);
        } else {
          const motions = globalThis.MoneycraftMotionSensing.detectMotions(metrics, baseline, thresholds);
          updateMotionMeasurements(metrics);
          updateAvatar(metrics, motions);
          for (const [key, active] of Object.entries(motions)) {
            updateDetection(key, active);
            if (active && !previousMotions[key]) appendMotionEvent(key);
          }
          previousMotions = motions;
          if (Object.values(motions).some(Boolean)) {
            setRecognitionStatus("動作を認識しています。姿勢推定は試作のため、結果が揺れることがあります。");
          } else {
            setRecognitionStatus("上半身を認識中です。動作を試してください。");
          }
        }
      }
    }
    frameHandle = requestAnimationFrame(inferenceFrame);
  }

  elements.start.addEventListener("click", startCamera);
  elements.stop.addEventListener("click", stopCamera);
  elements.calibrate.addEventListener("click", resetCalibration);
  elements.verticalThreshold.addEventListener("input", saveTuning);
  elements.tiltThreshold.addEventListener("input", saveTuning);
  elements.useTilt.addEventListener("change", saveTuning);
  elements.resetTuning.addEventListener("click", resetTuning);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && stream) {
      stopCamera();
      setCameraStatus("ページを離れたためカメラを停止しました。再開するには開始を押してください。");
    }
  });
  window.addEventListener("pagehide", stopCamera);
  loadTuning();
  initializeAvatar();
})();
