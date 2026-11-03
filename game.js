"use strict";

(() => {
  const canvas = document.querySelector("#game");
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
  const hotbar = document.querySelector("#hotbar");
  const blockPicker = document.querySelector("#block-picker");
  const blockOptions = document.querySelector("#block-options");
  const blockPickerTitle = document.querySelector("#block-picker-title");
  const blockCandidate = document.querySelector("#block-candidate");
  const chooseBlock = document.querySelector("#choose-block");
  const selectionStatus = document.querySelector("#block-selection-status");
  const selectedBlockName = document.querySelector("#selected-block-name");
  const message = document.querySelector("#game-message");
  const debugIndicator = document.querySelector("#debug-indicator");
  const virtualStick = document.querySelector("#virtual-stick");
  const touchMine = document.querySelector("#touch-mine");
  const touchPlace = document.querySelector("#touch-place");
  const touchJump = document.querySelector("#touch-jump");
  const touchDescend = document.querySelector("#touch-descend");
  const flightStatus = document.querySelector("#flight-status");
  const gameCard = document.querySelector(".game-card");
  const fullscreenButton = document.querySelector("#fullscreen-game");
  const soundToggle = document.querySelector("#sound-toggle");
  const soundVolume = document.querySelector("#sound-volume");
  const soundStatus = document.querySelector("#sound-status");
  const saveState = document.querySelector("#save-state");
  const resetButton = document.querySelector("#reset-world");
  const remotePlayerLabels = document.querySelector("#remote-player-labels");
  if (!gl) {
    message.textContent = "このブラウザーではWebGLを利用できません";
    saveState.textContent = "WebGL対応ブラウザーが必要です";
    return;
  }

  function loadAudioSettings() {
    try {
      const saved = localStorage.getItem(AUDIO_SETTINGS_KEY);
      if (!saved) {
        updateAudioControls();
        return;
      }
      const settings = JSON.parse(saved);
      if (typeof settings.muted === "boolean") soundMuted = settings.muted;
      if (Number.isFinite(settings.volume) && settings.volume >= 0 && settings.volume <= 1) {
        soundVolumeLevel = settings.volume;
      }
    } catch (error) {
      console.error("Sound settings could not be loaded from this browser.", error);
      soundStatus.textContent = "音声設定を読み込めませんでした";
    }
    updateAudioControls();
  }

  function saveAudioSettings() {
    try {
      localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({
        muted: soundMuted,
        volume: soundVolumeLevel,
      }));
      soundStatus.textContent = "";
    } catch (error) {
      console.error("Sound settings could not be saved to this browser.", error);
      soundStatus.textContent = "音声設定を保存できませんでした";
    }
  }

  function updateAudioControls() {
    soundToggle.textContent = `音声：${soundMuted ? "OFF" : "ON"}`;
    soundToggle.setAttribute("aria-pressed", String(!soundMuted));
    soundToggle.setAttribute("aria-label", soundMuted ? "音声を有効にする" : "音声をミュートする");
    soundVolume.value = String(soundVolumeLevel);
  }

  function createAudioContext() {
    const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextConstructor) return false;
    audioContext ||= new AudioContextConstructor();
    return true;
  }

  function resumeAudioContext() {
    if (!audioResumePromise && audioContext.state === "suspended") {
      audioResumePromise = audioContext.resume().finally(() => {
        audioResumePromise = null;
      });
    }
    return audioResumePromise || Promise.resolve();
  }

  function prepareAudioForInteraction() {
    if (soundMuted) return;
    try {
      if (!createAudioContext()) {
        soundMuted = true;
        soundStatus.textContent = "このブラウザーでは効果音を利用できません";
        updateAudioControls();
        saveAudioSettings();
        return;
      }
      void resumeAudioContext().then(scheduleAmbientChirp).catch((error) => {
        console.error("Sound could not be prepared after user interaction.", error);
        soundStatus.textContent = "効果音を有効にできませんでした";
      });
    } catch (error) {
      console.error("Sound could not be prepared after user interaction.", error);
      soundStatus.textContent = "効果音を有効にできませんでした";
    }
  }

  function stopAmbientChirp() {
    if (ambientChirpTimer === null) return;
    window.clearTimeout(ambientChirpTimer);
    ambientChirpTimer = null;
  }

  function scheduleAmbientChirp() {
    if (soundMuted || ambientChirpTimer !== null || document.hidden
      || !audioContext || audioContext.state !== "running") return;
    ambientChirpTimer = window.setTimeout(() => {
      ambientChirpTimer = null;
      if (soundMuted || document.hidden || audioContext?.state !== "running") return;
      if (playAmbientChirp()) scheduleAmbientChirp();
    }, AMBIENT_CHIRP_INTERVAL_MS);
  }

  function playAmbientChirp() {
    try {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1650, now);
      oscillator.frequency.exponentialRampToValueAtTime(2300, now + 0.08);
      oscillator.frequency.setValueAtTime(2100, now + 0.11);
      oscillator.frequency.exponentialRampToValueAtTime(1750, now + 0.21);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, soundVolumeLevel * 0.018), now + 0.02);
      gain.gain.setValueAtTime(Math.max(0.0001, soundVolumeLevel * 0.018), now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.25);
      return true;
    } catch (error) {
      console.error("Ambient sound could not be played.", error);
      soundStatus.textContent = "環境音を再生できませんでした";
      return false;
    }
  }

  async function enableSound() {
    try {
      if (!createAudioContext()) {
        soundStatus.textContent = "このブラウザーでは効果音を利用できません";
        return;
      }
      await resumeAudioContext();
      soundMuted = false;
      soundStatus.textContent = "";
      updateAudioControls();
      saveAudioSettings();
      scheduleAmbientChirp();
    } catch (error) {
      console.error("Sound could not be enabled in this browser.", error);
      soundMuted = true;
      soundStatus.textContent = "効果音を有効にできませんでした";
      updateAudioControls();
    }
  }

  function toggleSound() {
    if (soundMuted) {
      void enableSound();
      return;
    }
    soundMuted = true;
    stopAmbientChirp();
    updateAudioControls();
    saveAudioSettings();
  }

  function playBlockSound(block) {
    if (soundMuted) return;
    const play = () => {
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const mining = block === 0;
      oscillator.type = mining ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(mining ? 235 : 390, now);
      oscillator.frequency.exponentialRampToValueAtTime(mining ? 105 : 520, now + 0.075);
      gain.gain.setValueAtTime(Math.max(0.0001, soundVolumeLevel * 0.12), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.085);
    };
    try {
      if (!createAudioContext()) {
        soundMuted = true;
        updateAudioControls();
        soundStatus.textContent = "このブラウザーでは効果音を利用できません";
        saveAudioSettings();
        return;
      }
      if (audioContext.state === "suspended" || audioResumePromise) {
        void resumeAudioContext().then(play).catch((error) => {
          console.error("Block sound could not be played.", error);
          soundStatus.textContent = "効果音を再生できませんでした";
        });
        return;
      }
      play();
    } catch (error) {
      console.error("Block sound could not be played.", error);
      soundStatus.textContent = "効果音を再生できませんでした";
    }
  }

  const SAVE_KEY = "moneycraft-3d-world-v2";
  const AUDIO_SETTINGS_KEY = "moneycraft-audio-settings-v1";
  const BLOCK_SELECTION_KEY = "moneycraft-block-selection-v1";
  const AMBIENT_CHIRP_INTERVAL_MS = 15000;
  const FRAME_SAMPLE_CAPACITY = 120;
  const PLAYER_HEIGHT = 1.7;
  const PLAYER_RADIUS = 0.28;
  const PLAYER_STATE_INTERVAL_MS = 100;
  const REMOTE_PLAYER_TIMEOUT = 5000;
  const REACH = 6;
  const GRAVITY = 20.9475;
  const JUMP_SPEED = 7.8;
  const FLIGHT_SPEED = 4.5;
  const DOUBLE_JUMP_MS = 300;
  const DOUBLE_FORWARD_MS = 300;
  const SPRINT_MULTIPLIER = 1.5;
  const CONTINUOUS_EDIT_INTERVAL_MS = 200;
  const CONTINUOUS_EDIT_RETRY_MS = 50;
  const blocks = globalThis.MoneycraftWorld.blocks;
  const { getBlockBounds, getBlockBoxes, getStairOutline, orientationFromFacing,
    slabOrientationForPlacement, canMergeSlab, upperSlabOrientation,
    stairShapes, shapeAffectedCells, isBlockOrientation } = globalThis.MoneycraftWorld;
  let worldModel = globalThis.MoneycraftWorld.createModel(globalThis.MoneycraftWorld.defaultOptions);
  const keys = new Set();
  const touchPointers = new Map();
  const touchMove = { x: 0, z: 0 };
  const heldTouchActions = new Map();
  let activeBlockAction = null;
  let audioContext = null;
  let audioResumePromise = null;
  let ambientChirpTimer = null;
  let soundMuted = true;
  let soundVolumeLevel = 0.35;
  let lastJumpTime = -Infinity;
  let lastForwardTime = -Infinity;
  let doubleTapSprint = false;
  let expanded = false;
  const frameTimeSamples = new Float64Array(FRAME_SAMPLE_CAPACITY);
  let frameTimeSampleCount = 0;
  let nextFrameTimeSample = 0;
  let renderDrawCalls = 0;
  let renderTriangles = 0;
  let renderChunkCount = 0;
  let lastRenderDurationMs = 0;
  const faces = [
    { normal: [1, 0, 0], neighbor: [1, 0, 0], light: 0.82, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { normal: [-1, 0, 0], neighbor: [-1, 0, 0], light: 0.72, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { normal: [0, 1, 0], neighbor: [0, 1, 0], light: 1, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { normal: [0, -1, 0], neighbor: [0, -1, 0], light: 0.54, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { normal: [0, 0, 1], neighbor: [0, 0, 1], light: 0.9, corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { normal: [0, 0, -1], neighbor: [0, 0, -1], light: 0.68, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];
  const avatarFaces = [
    [0, 1, 2, 0, 2, 3], [4, 7, 6, 4, 6, 5],
    [0, 4, 5, 0, 5, 1], [3, 2, 6, 3, 6, 7],
    [1, 5, 6, 1, 6, 2], [0, 3, 7, 0, 7, 4],
  ];

  let player = { x: 20.5, y: 0, z: 29.5, velocityY: 0, grounded: false, yaw: 0, pitch: -0.12 };
  let stepViewOffset = 0;
  const STEP_VIEW_RESPONSE = 20;
  const remotePlayers = new Map();
  const remotePlayerLabelElements = new Map();
  let selectedBlock = 1;
  const blockCategories = [
    { id: "nature", name: "自然・地形", blocks: [1, 2, 3, 4, 5] },
    { id: "building", name: "基本建材", blocks: [6, 7, 8] },
    { id: "stairs", name: "階段", blocks: [17] },
    { id: "slabs", name: "ハーフ", blocks: [16] },
    { id: "glass", name: "窓・ガラス", blocks: [9] },
    { id: "colors", name: "色付き", blocks: [10, 11, 12, 13, 14, 15] },
  ];
  const categorySelections = new Map(blockCategories.map((category) => [category.id, category.blocks[0]]));
  let selectedCategory = 0;
  let pickerOpen = false;
  let candidateBlock = selectedBlock;
  let lastSelectionWheel = -Infinity;
  let program;
  let avatarPositionBuffer;
  let avatarColorBuffer;
  let targetPositionBuffer;
  let targetColorBuffer;
  let positionAttribute;
  let colorAttribute;
  let uvAttribute;
  let textureAtlas;
  let atlasCanvas;
  const CHUNK_SIZE = 8;
  const chunkMeshes = new Map();
  let transparentMesh;
  let transparentFaces = [];
  let transparentMeshDirty = true;
  let transparentView = "";
  const TARGET_OUTLINE_EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const targetPositions = new Float32Array(72);
  const targetColors = new Float32Array(72);
  for (let index = 0; index < targetColors.length; index += 3) {
    targetColors.set([1, 0.78, 0.16], index);
  }
  const stairOutlineSize = Math.max(...stairShapes.map((shape) => getStairOutline(0, shape).length)) * 6;
  const stairTargetPositions = new Float32Array(stairOutlineSize);
  const stairTargetColors = new Float32Array(stairOutlineSize);
  for (let index = 0; index < stairTargetColors.length; index += 3) {
    stairTargetColors.set([1, 0.78, 0.16], index);
  }
  let lastTime = 0;
  let saveTimer = 0;
  let debugTimer = 0;
  let remoteRenderTime = 0;
  let pointerLockPending = false;
  let roomMode = "solo";
  let soloSnapshot = null;
  let worldRevision = 0;
  let awaitingSnapshot = false;
  let snapshotTimer = 0;
  const pendingEdits = new Map();

  function loadWorld(snapshot) {
    const options = Array.isArray(snapshot) ? globalThis.MoneycraftWorld.legacyOptions : snapshot;
    if (!globalThis.MoneycraftWorld.isSupportedDimensions(options)) return false;
    const current = worldModel.dimensions;
    if (current.width === options.width && current.depth === options.depth && current.height === options.height) {
      if (!worldModel.load(snapshot)) return false;
    } else {
      const restored = globalThis.MoneycraftWorld.createModel({
        width: options.width, depth: options.depth, height: options.height,
      });
      if (!restored.load(snapshot)) return false;
      worldModel = restored;
    }
    updateWorldLabel();
    return true;
  }

  function updateWorldLabel() {
    const { width, depth } = worldModel.dimensions;
    document.querySelector("#world-label").textContent = worldModel.terrain === "forest-plains"
      ? `草原と森 · ${width}×${depth}`
      : `ひだまりの丘 · ${width}×${depth}`;
  }

  function emitWorldEvent(type, detail) {
    window.dispatchEvent(new CustomEvent(`moneycraft:${type}`, { detail }));
  }

  function sendCurrentPlayerState() {
    emitWorldEvent("send-player-state", {
      x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch,
    });
  }

  function clearPendingEdits() {
    window.clearTimeout(snapshotTimer);
    for (const timer of pendingEdits.values()) window.clearTimeout(timer);
    pendingEdits.clear();
  }

  function enterRoom() {
    if (roomMode === "solo") {
      saveGame();
      soloSnapshot = { world: worldModel.serialize(), player: { ...player } };
    }
    clearInput();
    setFlying(false);
    roomMode = "connecting";
    awaitingSnapshot = false;
    clearPendingEdits();
    clearRemotePlayers();
    resetButton.disabled = true;
    saveState.textContent = "共有ワールドを読み込み中";
    document.querySelector("#world-mode").textContent = "共有ワールドに接続中";
  }

  function leaveSharedWorld() {
    clearRemotePlayers();
    clearPendingEdits();
    awaitingSnapshot = false;
    if (!soloSnapshot) return;
    if (!loadWorld(soloSnapshot.world)) {
      throw new Error("Could not restore the solo world.");
    }
    player = { ...soloSnapshot.player };
    stepViewOffset = 0;
    clearInput();
    updateFlightControls();
    soloSnapshot = null;
    roomMode = "solo";
    resetButton.disabled = false;
    rebuildWorldMesh();
    saveState.textContent = "このブラウザーに自動保存";
    message.textContent = "元のひとり用ワールドに戻りました";
    document.querySelector("#world-mode").textContent = "ひとりで遊ぶワールド";
  }

  function invalidWorldMessage() {
    console.error("Received an invalid shared world message.");
    emitWorldEvent("world-protocol-error", {});
  }

  function requestWorldSnapshot() {
    if (roomMode !== "shared" || awaitingSnapshot) return;
    stopBlockAction();
    awaitingSnapshot = true;
    clearPendingEdits();
    saveState.textContent = "共有ワールドを再同期中";
    snapshotTimer = window.setTimeout(() => {
      message.textContent = "共有ワールドを再同期できませんでした。再参加してください";
      emitWorldEvent("world-protocol-error", {});
    }, 5000);
    emitWorldEvent("request-world", null);
  }

  function receiveWorldSnapshot(event) {
    const snapshot = event.detail;
    if (roomMode === "solo") return;
    if (!snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0
      || (roomMode === "shared" && (snapshot.world?.width !== worldModel.dimensions.width
        || snapshot.world?.depth !== worldModel.dimensions.depth || snapshot.world?.height !== worldModel.dimensions.height))
      || !loadWorld(snapshot.world)) {
      invalidWorldMessage();
      return false;
    }
    worldRevision = snapshot.revision;
    awaitingSnapshot = false;
    clearPendingEdits();
    rebuildWorldMesh();
    const { width, depth, height } = worldModel.dimensions;
    if (player.x < PLAYER_RADIUS || player.x > width - PLAYER_RADIUS
      || player.z < PLAYER_RADIUS || player.z > depth - PLAYER_RADIUS
      || player.y < 0 || player.y > height + 10
      || collidesAt(player.x, player.y, player.z)) moveToSafeSpawn();
    saveState.textContent = "共有ワールドをサーバーに保存";
    return true;
  }

  function receiveBlockChanged(event) {
    if (roomMode !== "shared") return;
    const edit = event.detail;
    if (!edit || !Number.isSafeInteger(edit.revision) || edit.revision < 1
      || typeof edit.requestId !== "string" || typeof edit.playerId !== "string"
      || !inBounds(edit.x, edit.y, edit.z) || !Number.isInteger(edit.block)
      || edit.block < 0 || edit.block > blocks.length
      || !isBlockOrientation(edit.block, edit.orientation)) {
      invalidWorldMessage();
      return;
    }
    if (awaitingSnapshot || edit.revision <= worldRevision) return;
    if (edit.revision !== worldRevision + 1 || getBlock(edit.x, edit.y, edit.z) !== edit.expectedBlock
      || (edit.block === 6 && edit.expectedBlock === 16
        && worldModel.getOrientation(edit.x, edit.y, edit.z) !== edit.expectedOrientation)) {
      requestWorldSnapshot();
      return;
    }
    setBlock(edit.x, edit.y, edit.z, edit.block, edit.orientation);
    worldRevision = edit.revision;
    updateWorldMesh(edit.x, edit.y, edit.z);
    if (pendingEdits.has(edit.requestId)) {
      window.clearTimeout(pendingEdits.get(edit.requestId));
      pendingEdits.delete(edit.requestId);
      message.textContent = edit.block === 0 ? "ブロックを掘りました" : `${blocks[edit.block - 1].name}を置きました`;
      playBlockSound(edit.block);
    }
    if (collidesAt(player.x, player.y, player.z)) moveToSafeSpawn();
    saveState.textContent = "共有ワールドをサーバーに保存";
  }

  function receiveEditRejected(event) {
    const rejection = event.detail;
    if (roomMode !== "shared" || !rejection || typeof rejection.requestId !== "string"
      || typeof rejection.code !== "string") {
      invalidWorldMessage();
      return;
    }
    window.clearTimeout(pendingEdits.get(rejection.requestId));
    pendingEdits.delete(rejection.requestId);
    stopBlockAction();
    const reasons = {
      rate_limited: "操作が速すぎます。少し待ってください",
      out_of_reach: "置きたい・掘りたい場所に近づいてください",
      edit_conflict: "ほかの人が先に変更しました。再同期します",
      player_in_block: "形が変わる場所にプレイヤーがいるため変更できません",
      room_closed: "部屋が閉じられました",
    };
    message.textContent = reasons[rejection.code] || `建築の変更が拒否されました: ${rejection.code}`;
    if (rejection.code === "edit_conflict") requestWorldSnapshot();
  }

  function changeBlock(x, y, z, block, orientation = 0) {
    if (roomMode === "connecting" || awaitingSnapshot) {
      message.textContent = "共有ワールドの読み込み完了を待ってください";
      return false;
    }
    if (worldModel.editIntersectsBox({ x, y, z, block, orientation },
      [player.x - PLAYER_RADIUS, player.y, player.z - PLAYER_RADIUS],
      [player.x + PLAYER_RADIUS, player.y + PLAYER_HEIGHT, player.z + PLAYER_RADIUS])) {
      message.textContent = "形が変わる場所にプレイヤーがいるため変更できません";
      return false;
    }
    prepareAudioForInteraction();
    if (roomMode === "shared") {
      const requestId = crypto.randomUUID();
      pendingEdits.set(requestId, window.setTimeout(() => {
        message.textContent = "建築の応答を確認できません。再同期します";
        requestWorldSnapshot();
      }, 5000));
      message.textContent = "建築の変更を送信中";
      sendCurrentPlayerState();
      emitWorldEvent("send-block-edit", {
        requestId, x, y, z, block, orientation, expectedBlock: getBlock(x, y, z),
        ...(block === 6 && getBlock(x, y, z) === 16
          ? { expectedOrientation: worldModel.getOrientation(x, y, z) } : {}),
      });
      return true;
    }
    setBlock(x, y, z, block, orientation);
    updateWorldMesh(x, y, z);
    saveGame();
    playBlockSound(block);
    message.textContent = block === 0 ? "ブロックを掘りました" : `${blocks[block - 1].name}を置きました`;
    return true;
  }

  function inBounds(x, y, z) {
    return worldModel.inBounds(x, y, z);
  }

  function getBlock(x, y, z) {
    return worldModel.getBlock(x, y, z);
  }

  function setBlock(x, y, z, block, orientation = 0) {
    return worldModel.setBlock(x, y, z, block, orientation);
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create WebGL shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader) || "Unknown shader compilation error.";
      gl.deleteShader(shader);
      throw new Error(error);
    }
    return shader;
  }

  function initializeRenderer() {
    const vertexShader = compileShader(gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      attribute vec2 aUv;
      uniform mat4 uViewProjection;
      varying vec3 vColor;
      varying vec2 vUv;
      void main() {
        gl_Position = uViewProjection * vec4(aPosition, 1.0);
        vColor = aColor;
        vUv = aUv;
      }
    `);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 vColor;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform bool uTextured;
      void main() {
        gl_FragColor = vec4(vColor, 1.0) * (uTextured ? texture2D(uTexture, vUv) : vec4(1.0));
      }
    `);
    program = gl.createProgram();
    if (!program) throw new Error("Could not create WebGL program.");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Unknown WebGL program link error.");
    }
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    positionAttribute = gl.getAttribLocation(program, "aPosition");
    colorAttribute = gl.getAttribLocation(program, "aColor");
    uvAttribute = gl.getAttribLocation(program, "aUv");
    gl.enableVertexAttribArray(positionAttribute);
    gl.enableVertexAttribArray(colorAttribute);
    avatarPositionBuffer = gl.createBuffer();
    avatarColorBuffer = gl.createBuffer();
    targetPositionBuffer = gl.createBuffer();
    targetColorBuffer = gl.createBuffer();
    transparentMesh = {
      position: gl.createBuffer(), color: gl.createBuffer(), uv: gl.createBuffer(), count: 0,
      positions: new Float32Array(0), colors: new Float32Array(0), uvs: new Float32Array(0),
    };
    if (!avatarPositionBuffer || !avatarColorBuffer || !targetPositionBuffer || !targetColorBuffer) {
      throw new Error("Could not create world rendering buffers.");
    }
    if (!transparentMesh.position || !transparentMesh.color || !transparentMesh.uv) {
      throw new Error("Could not create transparent rendering buffers.");
    }
    initializeTextures();
  }

  function initializeTextures() {
    atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = 2 ** Math.ceil(Math.log2((blocks.length + 2) * 16));
    atlasCanvas.height = 16;
    const context = atlasCanvas.getContext("2d");
    if (!context) throw new Error("Could not create block texture canvas.");
    for (let tile = 0; tile < blocks.length + 2; tile += 1) {
      const material = tile < blocks.length ? blocks[tile] : null;
      const id = material ? material.textureBlock ?? material.id : tile === blocks.length ? 2 : 4;
      const base = blocks[id - 1].color.map((channel) => Math.round(channel * 255));
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          const noise = ((x * 37 + y * 67 + tile * 13 + x * y * 11) % 23) - 11;
          let color = base.map((channel) => channel + noise);
          if (id === 3 && (y === 0 || x === 0)) color = [104, 112, 112];
          if (id === 4) {
            color = base.map((channel) => channel + noise + (x % 4 === 0 ? -35 : 0));
          }
          if (id === 5 && (x + y * 3) % 7 < 2) color = [47, 110, 56];
          if (id === 6 && (y % 4 === 0 || (x === (Math.floor(y / 4) % 2) * 8 && y % 4 !== 0))) {
            color = [119, 79, 43];
          }
          if (id === 7 && (y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0)) {
            color = [200, 185, 161];
          }
          if (id === 8 || id >= 10) color = base.map((channel) => channel + noise * 0.25);
          if (id === 9) {
            if (x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7) color = [227, 223, 206];
            else if ((x + y) % 14 < 2) color = [194, 227, 236];
          }
          if (tile === blocks.length && y < 3 + x % 2) color = blocks[0].color.map((channel) => channel * 255 + noise);
          if (tile === blocks.length + 1) {
            const ring = Math.floor(Math.hypot(x - 7.5, y - 7.5)) % 3 === 0 ? -28 : 12;
            color = base.map((channel) => channel + ring + noise * 0.3);
          }
          const alpha = id === 9 && x !== 0 && y !== 0 && x !== 15 && y !== 15 && x !== 7 && y !== 7
            ? 0.22 : 1;
          context.fillStyle = `rgba(${color.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))).join(",")},${alpha})`;
          context.fillRect(tile * 16 + x, y, 1, 1);
        }
      }
    }
    textureAtlas = gl.createTexture();
    if (!textureAtlas) throw new Error("Could not create block texture atlas.");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureAtlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);
  }

  function moveToSafeSpawn() {
    const { width, depth } = worldModel.dimensions;
    const center = worldModel.spawnCenter;
    const candidates = [];
    for (let z = 2; z < depth - 2; z += 1) {
      for (let x = 2; x < width - 2; x += 1) {
        candidates.push({ x: x + 0.5, z: z + 0.5, distance: (x + 0.5 - center.x) ** 2 + (z + 0.5 - center.z) ** 2 });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates) {
      const y = worldModel.findSurface(candidate.x, candidate.z);
      if (collidesAt(candidate.x, y, candidate.z)) continue;
      if ([...remotePlayers.values()].some(({ target }) => target
        && Math.hypot(candidate.x - target.x, candidate.z - target.z) < 1
        && y < target.y + PLAYER_HEIGHT && y + PLAYER_HEIGHT > target.y)) continue;
      player.x = candidate.x;
      player.y = y;
      player.z = candidate.z;
      player.velocityY = 0;
      player.grounded = true;
      setFlying(false);
      clearInput();
      return;
    }
    throw new Error("Could not find a clear player spawn location.");
  }

  function loadGame() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (Number.isFinite(data.x) && Number.isFinite(data.z) && loadWorld(data.world)) {
          const { width, depth } = worldModel.dimensions;
          player.x = Math.max(1, Math.min(width - 1, data.x));
          player.z = Math.max(1, Math.min(depth - 1, data.z));
          player.y = worldModel.findSurface(player.x, player.z);
          if (Number.isFinite(data.yaw)) player.yaw = data.yaw;
          if (!collidesAt(player.x, player.y, player.z)) return;
        } else {
          throw new Error("Saved world dimensions or block data are invalid.");
        }
      }
    } catch (error) {
      console.warn("Saved world could not be loaded; starting a new world.", error);
    }
    moveToSafeSpawn();
  }

  function saveGame() {
    if (roomMode !== "solo") return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        world: worldModel.serialize(),
        x: player.x,
        z: player.z,
        yaw: player.yaw,
      }));
      saveState.textContent = "このブラウザーに自動保存";
    } catch (error) {
      console.error("World could not be saved to this browser.", error);
      saveState.textContent = "保存できませんでした";
    }
  }

  function rebuildWorldMesh() {
    transparentMeshDirty = true;
    const { width, depth, height } = worldModel.dimensions;
    for (const [key, mesh] of chunkMeshes) {
      const [x, y, z] = key.split(",").map(Number);
      if (x < width && y < height && z < depth) continue;
      for (const buffer of [mesh.position, mesh.color, mesh.uv]) gl.deleteBuffer(buffer);
      chunkMeshes.delete(key);
    }
    for (let y = 0; y < height; y += CHUNK_SIZE) {
      for (let z = 0; z < depth; z += CHUNK_SIZE) {
        for (let x = 0; x < width; x += CHUNK_SIZE) rebuildChunk(x, y, z);
      }
    }
  }

  function updateWorldMesh(x, y, z) {
    const chunks = new Map();
    for (const affected of shapeAffectedCells(x, y, z)) {
      if ((affected[0] !== x || affected[2] !== z) && getBlock(...affected) !== 17) continue;
      for (const offset of [[0, 0, 0], ...faces.map((face) => face.neighbor)]) {
        const cell = affected.map((value, axis) => value + offset[axis]);
        if (!inBounds(...cell)) continue;
        const start = cell.map((value) => Math.floor(value / CHUNK_SIZE) * CHUNK_SIZE);
        chunks.set(start.join(","), start);
      }
    }
    for (const start of chunks.values()) rebuildChunk(...start);
  }

  function visibleFaceBounds(bounds, neighbor, normal) {
    if (!neighbor) return [bounds];
    const axis = normal.findIndex((value) => value !== 0);
    const positive = normal[axis] > 0;
    if ((positive ? bounds.max[axis] : bounds.min[axis])
      !== (positive ? neighbor.min[axis] : neighbor.max[axis])) return [bounds];
    const [u, v] = [0, 1, 2].filter((value) => value !== axis);
    const minU = Math.max(bounds.min[u], neighbor.min[u]);
    const maxU = Math.min(bounds.max[u], neighbor.max[u]);
    const minV = Math.max(bounds.min[v], neighbor.min[v]);
    const maxV = Math.min(bounds.max[v], neighbor.max[v]);
    if (minU >= maxU || minV >= maxV) return [bounds];
    const visible = [];
    for (const [left, right, bottom, top] of [
      [bounds.min[u], minU, bounds.min[v], bounds.max[v]],
      [maxU, bounds.max[u], bounds.min[v], bounds.max[v]],
      [minU, maxU, bounds.min[v], minV],
      [minU, maxU, maxV, bounds.max[v]],
    ]) {
      if (left >= right || bottom >= top) continue;
      const min = bounds.min.slice();
      const max = bounds.max.slice();
      min[u] = left;
      max[u] = right;
      min[v] = bottom;
      max[v] = top;
      visible.push({ min, max });
    }
    return visible;
  }

  function rebuildChunk(startX, startY, startZ) {
    const positions = [];
    const colors = [];
    const uvs = [];
    const translucentFaces = [];
    const { width, depth, height } = worldModel.dimensions;
    for (let y = startY; y < Math.min(height, startY + CHUNK_SIZE); y += 1) {
      for (let z = startZ; z < Math.min(depth, startZ + CHUNK_SIZE); z += 1) {
        for (let x = startX; x < Math.min(width, startX + CHUNK_SIZE); x += 1) {
          const block = getBlock(x, y, z);
          if (block === 0) continue;
          const translucent = blocks[block - 1].renderLayer === "translucent";
          const orientation = worldModel.getOrientation(x, y, z);
          const boxes = worldModel.getBoxes(x, y, z);
          const axis = worldModel.getOrientationAxes(orientation).y;
          for (const face of faces) {
            const neighborCell = [x, y, z].map((value, dimension) => value + face.neighbor[dimension]);
            const neighborBlock = getBlock(...neighborCell);
            const neighborBoxes = neighborBlock && blocks[neighborBlock - 1].renderLayer === "translucent"
              && neighborBlock !== block ? [] : worldModel.getBoxes(...neighborCell);
            const normalAxis = face.normal.findIndex((value) => value !== 0);
            if (boxes.length === 1 && neighborBoxes.length === 1 && boxes[0] === neighborBoxes[0]
              && boxes[0].min[normalAxis] === 0 && boxes[0].max[normalAxis] === 1) continue;
            const neighbors = neighborBoxes.map((box) => ({
              min: box.min.map((value, dimension) => value + face.neighbor[dimension]),
              max: box.max.map((value, dimension) => value + face.neighbor[dimension]),
            }));
            let tile = block - 1;
            if (block === 1) tile = face.normal[1] === 1 ? 0 : face.normal[1] === -1 ? 1 : blocks.length;
            if (block === 4 && Math.abs(
              face.normal[0] * axis[0] + face.normal[1] * axis[1] + face.normal[2] * axis[2],
            ) === 1) tile = blocks.length + 1;
            const faceUv = [[0, 1], [0, 0], [1, 0], [1, 1]];
            for (const bounds of boxes) {
              let visibleBounds = [bounds];
              for (const neighbor of [...boxes.filter((box) => box !== bounds), ...neighbors]) {
                visibleBounds = visibleBounds.flatMap((visible) => visibleFaceBounds(visible, neighbor, face.normal));
              }
              for (const visible of visibleBounds) {
                const target = translucent ? { positions: [], colors: [], uvs: [],
                  center: [x, y, z].map((value, dimension) =>
                    value + (face.normal[dimension] === 0
                      ? (visible.min[dimension] + visible.max[dimension]) / 2
                      : face.normal[dimension] > 0 ? visible.max[dimension] : visible.min[dimension])),
                  depth: 0,
                } : { positions, colors, uvs };
                for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
                  const corner = face.corners[cornerIndex].map((value, dimension) =>
                    value === 0 ? visible.min[dimension] : visible.max[dimension]);
                  const uv = faceUv[cornerIndex].slice();
                  for (let dimension = 0; dimension < 3; dimension += 1) {
                    const alongU = face.corners[3][dimension] - face.corners[0][dimension];
                    const alongV = face.corners[0][dimension] - face.corners[1][dimension];
                    if (alongU) uv[0] = (corner[dimension] - face.corners[0][dimension]) * alongU;
                    if (alongV) uv[1] = (corner[dimension] - face.corners[1][dimension]) * alongV;
                  }
                  target.positions.push(x + corner[0], y + corner[1], z + corner[2]);
                  target.colors.push(face.light, face.light, face.light);
                  target.uvs.push((tile * 16 + 0.5 + uv[0] * 15) / atlasCanvas.width,
                    (0.5 + uv[1] * 15) / 16);
                }
                if (translucent) translucentFaces.push(target);
              }
            }
          }
        }
      }
    }
    const key = [startX, startY, startZ].join(",");
    let mesh = chunkMeshes.get(key);
    if (!mesh) {
      mesh = { position: gl.createBuffer(), color: gl.createBuffer(), uv: gl.createBuffer(), count: 0 };
      if (!mesh.position || !mesh.color || !mesh.uv) throw new Error("Could not create chunk buffers.");
      chunkMeshes.set(key, mesh);
    }
    mesh.count = positions.length / 3;
    mesh.transparentFaces = translucentFaces;
    transparentMeshDirty = true;
    for (const [buffer, data] of [[mesh.position, positions], [mesh.color, colors], [mesh.uv, uvs]]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    }
  }

  function buildHotbar() {
    blockPicker.hidden = true;
    for (const [index, block] of blocks.entries()) {
      const button = document.createElement("button");
      button.className = "block-option";
      button.type = "button";
      button.setAttribute("aria-label", block.name);
      button.title = block.name;
      const name = document.createElement("span");
      name.textContent = block.name;
      const swatch = document.createElement("canvas");
      swatch.className = "block-swatch";
      swatch.width = 16;
      swatch.height = 16;
      swatch.setAttribute("aria-hidden", "true");
      const context = swatch.getContext("2d");
      if (!context) throw new Error("Could not create a block preview.");
      for (const box of getBlockBoxes(block.id)) {
        const left = box.min[2] * 16;
        const top = (1 - box.max[1]) * 16;
        const width = (box.max[2] - box.min[2]) * 16;
        const height = (box.max[1] - box.min[1]) * 16;
        context.drawImage(atlasCanvas, index * 16 + left, top, width, height, left, top, width, height);
      }
      button.append(swatch, name);
      button.addEventListener("click", () => {
        if (!pickerOpen || !blockCategories[selectedCategory].blocks.includes(block.id)) return;
        candidateBlock = block.id;
        closeBlockPicker(true);
      });
      blockOptions.append(button);
    }
    for (const [index, category] of blockCategories.entries()) {
      const button = document.createElement("button");
      button.className = "hotbar-slot";
      button.type = "button";
      button.setAttribute("aria-controls", "block-picker");
      const number = document.createElement("span");
      number.className = "slot-number";
      number.textContent = String(index + 1);
      const name = document.createElement("span");
      name.className = "category-name";
      name.textContent = category.name;
      const current = document.createElement("span");
      current.className = "category-block";
      button.append(number, name, current);
      button.addEventListener("click", () => {
        if (index === selectedCategory) {
          if (pickerOpen) closeBlockPicker(false);
          else openBlockPicker();
        } else {
          selectCategory(index);
        }
      });
      hotbar.append(button);
    }
    updateBlockSelection();
  }

  function updateBlockSelection() {
    const category = blockCategories[selectedCategory];
    for (const [index, button] of [...hotbar.children].entries()) {
      const item = blockCategories[index];
      const block = blocks[categorySelections.get(item.id) - 1];
      button.setAttribute("aria-pressed", String(index === selectedCategory));
      button.setAttribute("aria-expanded", String(pickerOpen && index === selectedCategory));
      button.setAttribute("aria-label", `${index + 1}: ${item.name} · ${block.name}`);
      button.title = `${item.name} · ${block.name}（選択中のカテゴリを再タップで一覧）`;
      button.children[2].textContent = block.name;
    }
    for (const [index, button] of [...blockOptions.children].entries()) {
      button.hidden = !category.blocks.includes(blocks[index].id);
      button.setAttribute("aria-pressed", String(blocks[index].id === candidateBlock));
    }
    selectedBlockName.textContent = blocks[selectedBlock - 1].name;
    blockPickerTitle.textContent = `${selectedCategory + 1} · ${category.name}`;
    blockCandidate.textContent = `${blocks[candidateBlock - 1].name} · ${category.blocks.indexOf(candidateBlock) + 1} / ${category.blocks.length}`;
    chooseBlock.setAttribute("aria-expanded", String(pickerOpen));
    blockPicker.hidden = !pickerOpen;
  }

  function saveBlockSelection() {
    try {
      localStorage.setItem(BLOCK_SELECTION_KEY, JSON.stringify({
        category: blockCategories[selectedCategory].id,
        selections: Object.fromEntries(categorySelections),
      }));
      selectionStatus.textContent = "";
    } catch (error) {
      console.error("Block selection could not be saved to this browser.", error);
      selectionStatus.textContent = "建材の選択履歴を保存できませんでした";
    }
  }

  function loadBlockSelection() {
    try {
      const raw = localStorage.getItem(BLOCK_SELECTION_KEY);
      if (!raw) return;
      const settings = JSON.parse(raw);
      if (!settings || typeof settings !== "object" || !settings.selections
        || typeof settings.selections !== "object") throw new Error("Invalid block selection settings.");
      const index = blockCategories.findIndex((category) => category.id === settings.category);
      if (index < 0 || blockCategories.some((category) =>
        !category.blocks.includes(settings.selections[category.id]))) throw new Error("Invalid block selection category.");
      for (const category of blockCategories) categorySelections.set(category.id, settings.selections[category.id]);
      selectedCategory = index;
      selectedBlock = categorySelections.get(blockCategories[index].id);
      candidateBlock = selectedBlock;
    } catch (error) {
      console.error("Block selection could not be loaded from this browser.", error);
      selectionStatus.textContent = "建材の選択履歴を読み込めませんでした";
    }
  }

  function selectCategory(index) {
    closeBlockPicker(false);
    stopBlockAction();
    selectedCategory = index;
    selectedBlock = categorySelections.get(blockCategories[index].id);
    candidateBlock = selectedBlock;
    updateBlockSelection();
    saveBlockSelection();
    message.textContent = `${blocks[selectedBlock - 1].name}を選択中 · Rで建材を変更`;
  }

  function openBlockPicker() {
    clearInput();
    pickerOpen = true;
    candidateBlock = selectedBlock;
    updateBlockSelection();
    message.textContent = "建材を選択中 · R／Enterで確定 · Escで取消";
    if (document.pointerLockElement !== canvas) blockOptions.children[candidateBlock - 1].focus();
  }

  function closeBlockPicker(confirm) {
    if (!pickerOpen) return;
    const restoreFocus = blockPicker.contains(document.activeElement);
    pickerOpen = false;
    if (confirm) {
      selectedBlock = candidateBlock;
      categorySelections.set(blockCategories[selectedCategory].id, selectedBlock);
      saveBlockSelection();
    }
    candidateBlock = selectedBlock;
    updateBlockSelection();
    message.textContent = `${blocks[selectedBlock - 1].name}を選択中`;
    if (restoreFocus) hotbar.children[selectedCategory].focus();
  }

  function cycleBlockCandidate(direction) {
    const ids = blockCategories[selectedCategory].blocks;
    candidateBlock = ids[(ids.indexOf(candidateBlock) + direction + ids.length) % ids.length];
    updateBlockSelection();
    if (document.pointerLockElement !== canvas) {
      blockOptions.children[candidateBlock - 1].focus({ preventScroll: true });
    }
    const option = blockOptions.children[candidateBlock - 1].getBoundingClientRect();
    const list = blockOptions.getBoundingClientRect();
    if (option.top < list.top) blockOptions.scrollTop -= list.top - option.top;
    else if (option.bottom > list.bottom) blockOptions.scrollTop += option.bottom - list.bottom;
  }

  function handleSelectionWheel(event) {
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastSelectionWheel < 100) return;
    lastSelectionWheel = now;
    const direction = Math.sign(event.deltaY);
    if (pickerOpen) cycleBlockCandidate(direction);
    else selectCategory((selectedCategory + direction + blockCategories.length) % blockCategories.length);
  }

  function vecNormalize(vector) {
    const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    return vector.map((value) => value / length);
  }

  function matrixMultiply(a, b) {
    const result = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        result[column * 4 + row] = a[row] * b[column * 4]
          + a[4 + row] * b[column * 4 + 1]
          + a[8 + row] * b[column * 4 + 2]
          + a[12 + row] * b[column * 4 + 3];
      }
    }
    return result;
  }

  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const range = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * range, -1,
      0, 0, 2 * far * near * range, 0,
    ]);
  }

  function lookAt(eye, direction) {
    const forward = vecNormalize(direction);
    const right = vecNormalize([
      -forward[2],
      0,
      forward[0],
    ]);
    const up = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];
    return new Float32Array([
      right[0], up[0], -forward[0], 0,
      right[1], up[1], -forward[1], 0,
      right[2], up[2], -forward[2], 0,
      -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]),
      -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]),
      forward[0] * eye[0] + forward[1] * eye[1] + forward[2] * eye[2],
      1,
    ]);
  }

  function viewDirection() {
    const horizontal = Math.cos(player.pitch);
    return [
      Math.sin(player.yaw) * horizontal,
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * horizontal,
    ];
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  }

  function render() {
    const measureRender = !debugIndicator.hidden;
    const renderStartedAt = measureRender ? performance.now() : 0;
    renderDrawCalls = 0;
    renderTriangles = 0;
    renderChunkCount = 0;
    resizeCanvas();
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clearColor(0.62, 0.82, 0.88, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    const eye = cameraEye();
    const direction = viewDirection();
    const viewProjection = matrixMultiply(
      perspective(Math.PI / 3, canvas.width / canvas.height, 0.08, 100),
      lookAt(eye, direction),
    );
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uViewProjection"), false, viewProjection);
    gl.uniform1i(gl.getUniformLocation(program, "uTextured"), 1);
    gl.enableVertexAttribArray(uvAttribute);
    for (const mesh of chunkMeshes.values()) {
      if (measureRender && (mesh.count || mesh.transparentFaces.length)) renderChunkCount += 1;
      if (mesh.count) drawTexturedMesh(mesh);
    }
    gl.uniform1i(gl.getUniformLocation(program, "uTextured"), 0);
    gl.disableVertexAttribArray(uvAttribute);
    gl.vertexAttrib2f(uvAttribute, 0, 0);
    renderRemotePlayers(viewProjection);
    renderTargetOutline();
    renderTransparentBlocks(eye, direction);
    if (measureRender) lastRenderDurationMs = performance.now() - renderStartedAt;
  }

  function drawTexturedMesh(mesh) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
    gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.color);
    gl.vertexAttribPointer(colorAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv);
    gl.vertexAttribPointer(uvAttribute, 2, gl.FLOAT, false, 0, 0);
    drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  function renderTransparentBlocks(eye, direction) {
    const view = [...eye, ...direction].join(",");
    if (transparentMeshDirty || view !== transparentView) {
      if (transparentMeshDirty) {
        transparentFaces = [...chunkMeshes.values()].flatMap((mesh) => mesh.transparentFaces);
      }
      for (const face of transparentFaces) {
        face.depth = face.center.reduce((depth, value, axis) =>
          depth + (value - eye[axis]) * direction[axis], 0);
      }
      transparentFaces.sort((a, b) => b.depth - a.depth);
      const count = transparentFaces.length * 6;
      if (transparentMesh.count !== count) {
        transparentMesh.positions = new Float32Array(count * 3);
        transparentMesh.colors = new Float32Array(count * 3);
        transparentMesh.uvs = new Float32Array(count * 2);
      }
      transparentMesh.count = count;
      for (const [index, face] of transparentFaces.entries()) {
        transparentMesh.positions.set(face.positions, index * 18);
        transparentMesh.colors.set(face.colors, index * 18);
        transparentMesh.uvs.set(face.uvs, index * 12);
      }
      if (count) {
        for (const [buffer, data] of [
          [transparentMesh.position, transparentMesh.positions],
          [transparentMesh.color, transparentMesh.colors], [transparentMesh.uv, transparentMesh.uvs],
        ]) {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        }
      }
      transparentView = view;
      transparentMeshDirty = false;
    }
    if (!transparentMesh.count) return;
    gl.uniform1i(gl.getUniformLocation(program, "uTextured"), 1);
    gl.enableVertexAttribArray(uvAttribute);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawTexturedMesh(transparentMesh);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function drawArrays(mode, first, count) {
    if (!debugIndicator.hidden) {
      renderDrawCalls += 1;
      if (mode === gl.TRIANGLES) renderTriangles += count / 3;
    }
    gl.drawArrays(mode, first, count);
  }

  function renderTargetOutline() {
    const target = raycast();
    if (!target) return;
    if (blocks[getBlock(target.x, target.y, target.z) - 1].orientationMode === "horizontal") {
      const edges = getStairOutline(worldModel.getOrientation(target.x, target.y, target.z),
        worldModel.getStairShape(target.x, target.y, target.z));
      let offset = 0;
      for (const edge of edges) {
        for (const point of edge) {
          stairTargetPositions.set(point.map((value, axis) => value + [target.x, target.y, target.z][axis]), offset);
          offset += 3;
        }
      }
      gl.depthRange(0, 0.99999);
      drawTargetOutline(stairTargetPositions.subarray(0, offset), stairTargetColors.subarray(0, offset));
      gl.depthRange(0, 1);
      return;
    }
    const bounds = getBlockBounds(getBlock(target.x, target.y, target.z),
      worldModel.getOrientation(target.x, target.y, target.z));
    const left = target.x + bounds.min[0] - 0.003;
    const bottom = target.y + bounds.min[1] - 0.003;
    const back = target.z + bounds.min[2] - 0.003;
    const right = target.x + bounds.max[0] + 0.003;
    const top = target.y + bounds.max[1] + 0.003;
    const front = target.z + bounds.max[2] + 0.003;
    const corners = [
      [left, bottom, back], [right, bottom, back], [right, top, back], [left, top, back],
      [left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front],
    ];
    let offset = 0;
    for (const [start, end] of TARGET_OUTLINE_EDGES) {
      targetPositions.set(corners[start], offset);
      targetPositions.set(corners[end], offset + 3);
      offset += 6;
    }
    drawTargetOutline(targetPositions, targetColors);
  }

  function drawTargetOutline(positions, colors) {
    gl.bindBuffer(gl.ARRAY_BUFFER, targetPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, targetColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(colorAttribute, 3, gl.FLOAT, false, 0, 0);
    drawArrays(gl.LINES, 0, positions.length / 3);
  }

  function isRemotePlayerState(state) {
    const { width, depth, height } = worldModel.dimensions;
    return state !== null
      && typeof state === "object"
      && Number.isFinite(state.x) && state.x >= 0 && state.x <= width
      && Number.isFinite(state.y) && state.y >= 0 && state.y <= height + 10
      && Number.isFinite(state.z) && state.z >= 0 && state.z <= depth
      && Number.isFinite(state.yaw)
      && Number.isFinite(state.pitch) && state.pitch >= -1.5 && state.pitch <= 1.5;
  }

  function getRemotePlayerLabel(id) {
    let label = remotePlayerLabelElements.get(id);
    if (!label) {
      label = document.createElement("span");
      label.className = "remote-player-label";
      label.hidden = true;
      remotePlayerLabels.append(label);
      remotePlayerLabelElements.set(id, label);
    }
    return label;
  }

  function addOrUpdateRemotePlayer(playerInfo) {
    if (!playerInfo || typeof playerInfo.id !== "string" || typeof playerInfo.displayName !== "string") return;
    let remote = remotePlayers.get(playerInfo.id);
    if (!remote) {
      remote = {
        id: playerInfo.id,
        displayName: playerInfo.displayName,
        state: null,
        target: null,
        lastStateAt: 0,
      };
      remotePlayers.set(playerInfo.id, remote);
    } else {
      remote.displayName = playerInfo.displayName;
    }
    const label = getRemotePlayerLabel(playerInfo.id);
    label.textContent = playerInfo.displayName;
    label.hidden = !remote.state;
    if (!isRemotePlayerState(playerInfo.state)) return;
    if (!remote.state) remote.state = { ...playerInfo.state };
    remote.target = { ...playerInfo.state };
    remote.lastStateAt = performance.now();
  }

  function removeRemotePlayer(id) {
    remotePlayers.delete(id);
    const label = remotePlayerLabelElements.get(id);
    if (label) label.remove();
    remotePlayerLabelElements.delete(id);
  }

  function clearRemotePlayers() {
    for (const id of remotePlayers.keys()) removeRemotePlayer(id);
  }

  function receiveRoomJoined(event) {
    const room = event.detail;
    if (!room || typeof room.player?.id !== "string" || !Array.isArray(room.players)) return;
    if (roomMode === "solo") enterRoom();
    if (!receiveWorldSnapshot({ detail: room })) return;
    roomMode = "shared";
    document.querySelector("#world-mode").textContent = `共同建築 · ${room.roomCode}`;
    clearRemotePlayers();
    for (const otherPlayer of room.players) {
      if (otherPlayer.id !== room.player.id) addOrUpdateRemotePlayer(otherPlayer);
    }
    moveToSafeSpawn();
    player.yaw = 0;
    player.pitch = -0.12;
    sendCurrentPlayerState();
    message.textContent = "共有ワールドで建築できます";
  }

  function receivePlayerJoined(event) {
    const remote = event.detail;
    if (remote?.id) addOrUpdateRemotePlayer(remote);
  }

  function receivePlayerState(event) {
    const update = event.detail;
    if (!update || typeof update.playerId !== "string" || !isRemotePlayerState(update.state)) return;
    let remote = remotePlayers.get(update.playerId);
    if (!remote && typeof update.displayName === "string") {
      addOrUpdateRemotePlayer({
        id: update.playerId,
        displayName: update.displayName,
        state: update.state,
      });
      remote = remotePlayers.get(update.playerId);
    }
    if (!remote) return;
    remote.target = { ...update.state };
    remote.lastStateAt = performance.now();
    getRemotePlayerLabel(remote.id).hidden = false;
    if (!remote.state) remote.state = { ...update.state };
  }

  function projectToCanvas(viewProjection, x, y, z) {
    const clipX = viewProjection[0] * x + viewProjection[4] * y + viewProjection[8] * z + viewProjection[12];
    const clipY = viewProjection[1] * x + viewProjection[5] * y + viewProjection[9] * z + viewProjection[13];
    const clipW = viewProjection[3] * x + viewProjection[7] * y + viewProjection[11] * z + viewProjection[15];
    if (clipW <= 0) return null;
    const normalizedX = clipX / clipW;
    const normalizedY = clipY / clipW;
    if (Math.abs(normalizedX) > 1.1 || Math.abs(normalizedY) > 1.2) return null;
    return {
      x: (normalizedX + 1) * 0.5 * canvas.clientWidth,
      y: (1 - normalizedY) * 0.5 * canvas.clientHeight,
    };
  }

  function remotePlayerColor(id) {
    let hash = 2166136261;
    for (let index = 0; index < id.length; index += 1) {
      hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
    }
    return [
      0.36 + ((hash >>> 16) & 0xff) / 510,
      0.36 + ((hash >>> 8) & 0xff) / 510,
      0.36 + (hash & 0xff) / 510,
    ];
  }

  function appendAvatarBox(positions, colors, remote, center, halfSize, color) {
    const corners = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];
    const cosYaw = Math.cos(remote.state.yaw);
    const sinYaw = Math.sin(remote.state.yaw);
    const transformed = corners.map(([x, y, z]) => {
      const localX = x * halfSize[0];
      const localZ = z * halfSize[2];
      return [
        remote.state.x + center[0] + localX * cosYaw + localZ * sinYaw,
        remote.state.y + center[1] + y * halfSize[1],
        remote.state.z + center[2] - localX * sinYaw + localZ * cosYaw,
      ];
    });
    for (const face of avatarFaces) {
      for (const index of face) {
        positions.push(...transformed[index]);
        colors.push(...color);
      }
    }
  }

  function renderRemotePlayers(viewProjection) {
    const positions = [];
    const colors = [];
    const now = performance.now();
    const interpolation = 1 - Math.exp(-12 * Math.min(1 / 30, (now - (remoteRenderTime || now)) / 1000));
    remoteRenderTime = now;

    for (const remote of remotePlayers.values()) {
      if (!remote.lastStateAt || now - remote.lastStateAt > REMOTE_PLAYER_TIMEOUT) {
        removeRemotePlayer(remote.id);
        continue;
      }
      if (!remote.state || !remote.target) continue;
      const yawDelta = Math.atan2(
        Math.sin(remote.target.yaw - remote.state.yaw),
        Math.cos(remote.target.yaw - remote.state.yaw),
      );
      remote.state.x += (remote.target.x - remote.state.x) * interpolation;
      remote.state.y += (remote.target.y - remote.state.y) * interpolation;
      remote.state.z += (remote.target.z - remote.state.z) * interpolation;
      remote.state.yaw += yawDelta * interpolation;
      remote.state.pitch += (remote.target.pitch - remote.state.pitch) * interpolation;

      const eyeY = cameraEye()[1];
      if (Math.hypot(remote.state.x - player.x, remote.state.z - player.z) < 0.55
        && eyeY > remote.state.y && eyeY < remote.state.y + PLAYER_HEIGHT) {
        getRemotePlayerLabel(remote.id).hidden = true;
        continue;
      }

      const color = remotePlayerColor(remote.id);
      appendAvatarBox(positions, colors, remote, [0, 0.98, 0], [0.23, 0.34, 0.16], color);
      appendAvatarBox(positions, colors, remote, [0, 1.48, 0], [0.2, 0.2, 0.2], color.map((channel) => Math.min(1, channel * 1.18)));
      appendAvatarBox(positions, colors, remote, [-0.3, 1.02, 0], [0.09, 0.29, 0.11], color);
      appendAvatarBox(positions, colors, remote, [0.3, 1.02, 0], [0.09, 0.29, 0.11], color);
      appendAvatarBox(positions, colors, remote, [-0.12, 0.34, 0], [0.105, 0.31, 0.12], color.map((channel) => channel * 0.78));
      appendAvatarBox(positions, colors, remote, [0.12, 0.34, 0], [0.105, 0.31, 0.12], color.map((channel) => channel * 0.78));

      const label = getRemotePlayerLabel(remote.id);
      const screenPosition = projectToCanvas(viewProjection, remote.state.x, remote.state.y + 1.75, remote.state.z);
      label.hidden = !screenPosition;
      if (screenPosition) {
        label.style.left = `${screenPosition.x}px`;
        label.style.top = `${screenPosition.y}px`;
      }
    }

    if (!positions.length) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, avatarPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, avatarColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(colorAttribute, 3, gl.FLOAT, false, 0, 0);
    drawArrays(gl.TRIANGLES, 0, positions.length / 3);
  }

  function collidesAt(x, feetY, z) {
    const min = [x - PLAYER_RADIUS, feetY + 0.0001, z - PLAYER_RADIUS];
    const max = [x + PLAYER_RADIUS, feetY + PLAYER_HEIGHT - 0.04, z + PLAYER_RADIUS];
    const minX = Math.floor(x - PLAYER_RADIUS);
    const maxX = Math.floor(x + PLAYER_RADIUS);
    const minZ = Math.floor(z - PLAYER_RADIUS);
    const maxZ = Math.floor(z + PLAYER_RADIUS);
    const minY = Math.floor(feetY + 0.0001);
    const maxY = Math.floor(feetY + PLAYER_HEIGHT - 0.04);
    for (let y = minY; y <= maxY; y += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        for (let cellX = minX; cellX <= maxX; cellX += 1) {
          if (worldModel.intersectsBox(cellX, y, cellZ, min, max)) return true;
        }
      }
    }
    return false;
  }

  function findSupportY(x, z, fromY, toY) {
    const minX = Math.floor(x - PLAYER_RADIUS);
    const maxX = Math.floor(x + PLAYER_RADIUS);
    const minZ = Math.floor(z - PLAYER_RADIUS);
    const maxZ = Math.floor(z + PLAYER_RADIUS);
    for (let y = Math.floor(fromY - 0.0001); y >= Math.floor(toY); y -= 1) {
      let support = null;
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        for (let cellX = minX; cellX <= maxX; cellX += 1) {
          for (const bounds of worldModel.getBoxes(cellX, y, cellZ)) {
            const top = y + bounds.max[1];
            if (top > fromY + 0.0001 || top < toY) continue;
            if (x + PLAYER_RADIUS > cellX + bounds.min[0] && x - PLAYER_RADIUS < cellX + bounds.max[0]
              && z + PLAYER_RADIUS > cellZ + bounds.min[2] && z - PLAYER_RADIUS < cellZ + bounds.max[2]) {
              support = Math.max(support ?? top, top);
            }
          }
        }
      }
      if (support !== null) return support;
    }
    return toY;
  }

  function moveHorizontally(x, z) {
    if (!collidesAt(x, player.y, z)) {
      player.x = x;
      player.z = z;
      return;
    }
    if (player.flying || !player.grounded || player.velocityY > 0) return;
    const support = findSupportY(x, z, player.y + 0.5, player.y);
    if (support <= player.y || collidesAt(player.x, support, player.z) || collidesAt(x, support, z)) return;
    player.x = x;
    player.z = z;
    stepViewOffset -= support - player.y;
    player.y = support;
  }

  function cameraEye() {
    return [player.x, player.y + PLAYER_HEIGHT * 0.88 + stepViewOffset, player.z];
  }

  function findCeilingY(nextY) {
    let ceiling = Infinity;
    const head = player.y + PLAYER_HEIGHT - 0.04;
    const nextHead = nextY + PLAYER_HEIGHT - 0.04;
    for (let y = Math.floor(head); y <= Math.floor(nextHead); y += 1) {
      for (let z = Math.floor(player.z - PLAYER_RADIUS); z <= Math.floor(player.z + PLAYER_RADIUS); z += 1) {
        for (let x = Math.floor(player.x - PLAYER_RADIUS); x <= Math.floor(player.x + PLAYER_RADIUS); x += 1) {
          for (const box of worldModel.getBoxes(x, y, z)) {
            const bottom = y + box.min[1];
            if (bottom < head - 0.0001 || bottom > nextHead) continue;
            if (player.x + PLAYER_RADIUS > x + box.min[0] && player.x - PLAYER_RADIUS < x + box.max[0]
              && player.z + PLAYER_RADIUS > z + box.min[2] && player.z - PLAYER_RADIUS < z + box.max[2]) {
              ceiling = Math.min(ceiling, bottom);
            }
          }
        }
      }
    }
    if (!Number.isFinite(ceiling)) throw new Error("Could not resolve upward player collision.");
    return ceiling - PLAYER_HEIGHT;
  }

  function update(dt) {
    const { width, depth, height } = worldModel.dimensions;
    const forwardInput = Math.max(-1, Math.min(1,
      Number(keys.has("KeyW") || keys.has("ArrowUp"))
      - Number(keys.has("KeyS") || keys.has("ArrowDown"))
      + touchMove.z));
    const sideInput = Math.max(-1, Math.min(1,
      Number(keys.has("KeyD") || keys.has("ArrowRight"))
      - Number(keys.has("KeyA") || keys.has("ArrowLeft"))
      + touchMove.x));
    const length = Math.max(1, Math.hypot(forwardInput, sideInput));
    const sprinting = keys.has("KeyW") && forwardInput > 0 && (doubleTapSprint || keys.has("KeyF"));
    const speed = 4.5 * (sprinting ? SPRINT_MULTIPLIER : 1);
    const stepX = (Math.sin(player.yaw) * forwardInput + Math.cos(player.yaw) * sideInput) / length * speed * dt;
    const stepZ = (-Math.cos(player.yaw) * forwardInput + Math.sin(player.yaw) * sideInput) / length * speed * dt;

    const nextX = Math.max(PLAYER_RADIUS, Math.min(width - PLAYER_RADIUS, player.x + stepX));
    moveHorizontally(nextX, player.z);
    const nextZ = Math.max(PLAYER_RADIUS, Math.min(depth - PLAYER_RADIUS, player.z + stepZ));
    moveHorizontally(player.x, nextZ);

    if (player.flying) {
      const up = keys.has("Space") || [...heldTouchActions.values()].includes("up");
      const down = keys.has("ShiftLeft") || keys.has("ShiftRight") || [...heldTouchActions.values()].includes("down");
      player.velocityY = (Number(up) - Number(down)) * FLIGHT_SPEED;
    } else {
      player.velocityY -= GRAVITY * dt;
    }
    const nextY = Math.min(height + 10, player.y + player.velocityY * dt);
    if (nextY < 0 && !collidesAt(player.x, 0, player.z)) {
      player.y = 0;
      player.velocityY = 0;
      player.grounded = true;
    } else if (!collidesAt(player.x, nextY, player.z)) {
      player.y = nextY;
      player.grounded = false;
    } else if (player.velocityY < 0) {
      player.y = findSupportY(player.x, player.z, player.y, nextY);
      player.velocityY = 0;
      player.grounded = true;
    } else {
      player.y = findCeilingY(nextY);
      player.velocityY = 0;
    }
  }

  function updateDebugIndicator() {
    if (debugIndicator.hidden) return;
    const blockX = Math.floor(player.x);
    const blockY = Math.floor(player.y);
    const blockZ = Math.floor(player.z);
    debugIndicator.textContent = [
      `World  X ${player.x.toFixed(3)}  Y ${player.y.toFixed(3)}  Z ${player.z.toFixed(3)}`,
      `Block  X ${blockX}  Y ${blockY}  Z ${blockZ}`,
      `Grounded ${player.grounded ? "yes" : "no"}  Vy ${player.velocityY.toFixed(3)}`,
      `Yaw ${(player.yaw * 180 / Math.PI).toFixed(1)}°  Pitch ${(player.pitch * 180 / Math.PI).toFixed(1)}°`,
      performanceSummary(),
    ].join("\n");
  }

  function performanceSummary() {
    if (frameTimeSampleCount === 0) return "Performance  measuring...";
    const samples = Array.from(frameTimeSamples.slice(0, frameTimeSampleCount)).sort((a, b) => a - b);
    const total = samples.reduce((sum, duration) => sum + duration, 0);
    const p95Index = Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1);
    const fps = Math.round(samples.length * 1000 / total);
    return [
      `Performance  ${fps} FPS · frame p95 ${samples[p95Index].toFixed(1)} ms`,
      `Render submit ${lastRenderDurationMs.toFixed(1)} ms · ${renderChunkCount} chunks · ${renderDrawCalls} calls · ${Math.round(renderTriangles / 100) / 10}k tris`,
    ].join("\n");
  }

  function raycast() {
    const direction = viewDirection();
    const origin = cameraEye();
    let x = Math.floor(player.x);
    let y = Math.floor(origin[1]);
    let z = Math.floor(player.z);
    const stepX = Math.sign(direction[0]);
    const stepY = Math.sign(direction[1]);
    const stepZ = Math.sign(direction[2]);
    const deltaX = direction[0] === 0 ? Infinity : Math.abs(1 / direction[0]);
    const deltaY = direction[1] === 0 ? Infinity : Math.abs(1 / direction[1]);
    const deltaZ = direction[2] === 0 ? Infinity : Math.abs(1 / direction[2]);
    let maxX = direction[0] === 0 ? Infinity : ((stepX > 0 ? x + 1 : x) - player.x) / direction[0];
    let maxY = direction[1] === 0 ? Infinity : ((stepY > 0 ? y + 1 : y) - origin[1]) / direction[1];
    let maxZ = direction[2] === 0 ? Infinity : ((stepZ > 0 ? z + 1 : z) - player.z) / direction[2];
    let distance = 0;

    while (distance <= REACH) {
      const hit = worldModel.raycastBlock(x, y, z, origin, direction, REACH);
      if (hit) return { x, y, z, ...hit };
      if (maxX < maxY && maxX < maxZ) {
        x += stepX;
        distance = maxX;
        maxX += deltaX;
      } else if (maxY < maxZ) {
        y += stepY;
        distance = maxY;
        maxY += deltaY;
      } else {
        z += stepZ;
        distance = maxZ;
        maxZ += deltaZ;
      }
    }
    return null;
  }

  function mineBlock() {
    const target = raycast();
    if (!target) {
      message.textContent = "照準を近くのブロックに合わせてね";
      return false;
    }
    return changeBlock(target.x, target.y, target.z, 0);
  }

  function placeBlock() {
    const target = raycast();
    if (!target) {
      message.textContent = "置きたい場所に近づいてね";
      return false;
    }
    let x = target.x + target.normal[0];
    let y = target.y + target.normal[1];
    let z = target.z + target.normal[2];
    let placedBlock = selectedBlock;
    const hitY = cameraEye()[1] + viewDirection()[1] * target.distance - target.y;
    const block = blocks[selectedBlock - 1];
    let orientation = block.orientationMode === "axis"
      ? worldModel.orientationFromNormal(target.normal)
      : block.orientationMode === "horizontal" ? orientationFromFacing(viewDirection(),
        slabOrientationForPlacement(target.normal, hitY) === upperSlabOrientation)
        : block.orientationMode === "slab" ? slabOrientationForPlacement(target.normal, hitY) : 0;
    if (orientation === null) {
      message.textContent = "ブロックの向きを決められませんでした";
      return false;
    }
    if (selectedBlock === 16) {
      const targetOrientation = worldModel.getOrientation(target.x, target.y, target.z);
      if (getBlock(target.x, target.y, target.z) === 16
        && ((targetOrientation === 0 && target.normal[1] === 1)
          || (targetOrientation === upperSlabOrientation && target.normal[1] === -1))) {
        x = target.x;
        y = target.y;
        z = target.z;
        placedBlock = 6;
        orientation = 0;
      } else if (canMergeSlab(getBlock(x, y, z), worldModel.getOrientation(x, y, z), orientation)) {
        placedBlock = 6;
        orientation = 0;
      }
    }
    if (!inBounds(x, y, z) || (getBlock(x, y, z) !== 0
      && !(selectedBlock === 16 && placedBlock === 6 && getBlock(x, y, z) === 16))
      || collidesAt(player.x, player.y, player.z)) {
      message.textContent = "そこにはブロックを置けません";
      return false;
    }
    return changeBlock(x, y, z, placedBlock, orientation);
  }

  function performBlockAction(type) {
    return type === "mine" ? mineBlock() : placeBlock();
  }

  function scheduleBlockAction(action, delay) {
    action.timer = window.setTimeout(() => {
      action.timer = null;
      if (activeBlockAction !== action) return;
      if (pendingEdits.size > 0) {
        scheduleBlockAction(action, CONTINUOUS_EDIT_RETRY_MS);
        return;
      }
      if (!performBlockAction(action.type)) {
        stopBlockAction();
        return;
      }
      scheduleBlockAction(action, CONTINUOUS_EDIT_INTERVAL_MS);
    }, delay);
  }

  function startBlockAction(type, source, pointerId = null) {
    if (pickerOpen) return false;
    if (activeBlockAction) return false;
    const action = { type, source, pointerId, timer: null };
    activeBlockAction = action;
    if (pendingEdits.size > 0) {
      scheduleBlockAction(action, CONTINUOUS_EDIT_RETRY_MS);
      return true;
    }
    if (!performBlockAction(type)) {
      stopBlockAction();
      return false;
    }
    scheduleBlockAction(action, CONTINUOUS_EDIT_INTERVAL_MS);
    return true;
  }

  function stopBlockAction(pointerId = null) {
    if (!activeBlockAction) return;
    if (pointerId !== null
      && (activeBlockAction.source !== "touch" || activeBlockAction.pointerId !== pointerId)) return;
    if (activeBlockAction.timer !== null) window.clearTimeout(activeBlockAction.timer);
    activeBlockAction = null;
  }

  window.addEventListener("moneycraft:room-joined", receiveRoomJoined);
  window.addEventListener("moneycraft:player-joined", receivePlayerJoined);
  window.addEventListener("moneycraft:player-state", receivePlayerState);
  window.addEventListener("moneycraft:player-left", (event) => removeRemotePlayer(event.detail?.id));
  window.addEventListener("moneycraft:room-connecting", enterRoom);
  window.addEventListener("moneycraft:room-left", leaveSharedWorld);
  window.addEventListener("moneycraft:room-closed", leaveSharedWorld);
  window.addEventListener("moneycraft:block-changed", receiveBlockChanged);
  window.addEventListener("moneycraft:world-snapshot", receiveWorldSnapshot);
  window.addEventListener("moneycraft:edit-rejected", receiveEditRejected);
  window.addEventListener("moneycraft:world-send-failed", () => {
    stopBlockAction();
    clearPendingEdits();
    message.textContent = "共有ワールドの通信に失敗しました。再参加してください";
  });
  window.addEventListener("moneycraft:room-error", () => {
    if (awaitingSnapshot) {
      message.textContent = "再同期に失敗しました。部屋コードで再参加してください";
    }
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("click", (event) => {
    if (pickerOpen) return;
    if (event.pointerType === "touch") return;
    if (document.pointerLockElement === canvas || pointerLockPending) return;
    if (typeof canvas.requestPointerLock !== "function") {
      message.textContent = "このブラウザーではマウス視点を利用できません";
      return;
    }
    pointerLockPending = true;
    try {
      const request = canvas.requestPointerLock();
      if (request && typeof request.catch === "function") {
        request.catch((error) => {
          pointerLockPending = false;
          console.error("Mouse pointer lock could not be enabled.", error);
          message.textContent = "マウス操作を開始できませんでした。もう一度クリックしてください";
        });
      } else {
        pointerLockPending = false;
      }
    } catch (error) {
      pointerLockPending = false;
      console.error("Mouse pointer lock could not be enabled.", error);
      message.textContent = "マウス操作を開始できませんでした。もう一度クリックしてください";
    }
  });
  canvas.addEventListener("mousedown", (event) => {
    if (document.pointerLockElement !== canvas) return;
    if (event.button === 0) startBlockAction("mine", "mouse");
    if (event.button === 2) startBlockAction("place", "mouse");
  });
  window.addEventListener("mouseup", () => {
    if (activeBlockAction?.source === "mouse") stopBlockAction();
  });
  canvas.addEventListener("pointerdown", (event) => {
    prepareAudioForInteraction();
    if (pickerOpen) return;
    if (event.pointerType !== "touch") return;
    enableTouchControls();
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const zone = event.clientX - bounds.left < bounds.width / 2 ? "move" : "look";
    if ([...touchPointers.values()].some((pointer) => pointer.zone === zone)) return;
    const pointer = {
      zone,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    touchPointers.set(event.pointerId, pointer);
    canvas.setPointerCapture(event.pointerId);
    if (zone === "move") {
      virtualStick.style.left = `${event.clientX - bounds.left}px`;
      virtualStick.style.top = `${event.clientY - bounds.top}px`;
      updateTouchMovement(pointer, event);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const pointer = touchPointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    if (pointer.zone === "move") {
      updateTouchMovement(pointer, event);
    } else {
      player.yaw += (event.clientX - pointer.lastX) * 0.004;
      player.pitch = Math.max(-1.48, Math.min(1.48,
        player.pitch - (event.clientY - pointer.lastY) * 0.004));
    }
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
  });
  function updateTouchMovement(pointer, event) {
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    const distance = Math.hypot(dx, dy);
    const radius = 44;
    const scale = distance > radius ? radius / distance : 1;
    const stickX = dx * scale;
    const stickY = dy * scale;
    touchMove.x = stickX / radius;
    touchMove.z = -stickY / radius;
    virtualStick.style.setProperty("--stick-x", `${stickX}px`);
    virtualStick.style.setProperty("--stick-y", `${stickY}px`);
  }
  function endTouchPointer(event) {
    const pointer = touchPointers.get(event.pointerId);
    if (!pointer) return;
    touchPointers.delete(event.pointerId);
    if (pointer.zone === "move") {
      touchMove.x = 0;
      touchMove.z = 0;
      resetStick();
    }
  }
  canvas.addEventListener("pointerup", endTouchPointer);
  canvas.addEventListener("pointercancel", endTouchPointer);
  canvas.addEventListener("lostpointercapture", endTouchPointer);

  function updateFlightControls() {
    flightStatus.hidden = !player.flying;
    touchDescend.hidden = !player.flying;
    touchJump.textContent = player.flying ? "上昇" : "ジャンプ";
    touchJump.setAttribute("aria-label", player.flying ? "上昇。素早く2回で飛行を解除" : "ジャンプ。素早く2回で飛行");
  }
  function setFlying(flying) {
    stepViewOffset = 0;
    player.flying = flying;
    player.velocityY = 0;
    lastJumpTime = -Infinity;
    updateFlightControls();
  }
  function jump() {
    const now = performance.now();
    if (now - lastJumpTime <= DOUBLE_JUMP_MS) {
      setFlying(!player.flying);
      message.textContent = player.flying ? "飛行中：ジャンプ長押しで上昇、Shift／下降ボタンで下降" : "飛行を解除しました";
      return;
    }
    lastJumpTime = now;
    if (player.flying) return;
    if (!player.grounded) return;
    player.velocityY = JUMP_SPEED;
    player.grounded = false;
  }
  function enableTouchControls() {
    gameCard.classList.add("touch-enabled");
    if (message.textContent === "ゲーム画面をクリックしてスタート") {
      message.textContent = "左のパッドで移動、画面右をドラッグして見回します";
    }
  }
  function resetStick() {
    virtualStick.style.left = "";
    virtualStick.style.top = "";
    virtualStick.style.setProperty("--stick-x", "0px");
    virtualStick.style.setProperty("--stick-y", "0px");
  }
  function clearInput() {
    closeBlockPicker(false);
    lastForwardTime = -Infinity;
    doubleTapSprint = false;
    stopBlockAction();
    keys.clear();
    touchPointers.clear();
    heldTouchActions.clear();
    touchMove.x = 0;
    touchMove.z = 0;
    lastJumpTime = -Infinity;
    resetStick();
  }
  function bindTouchAction(button, action, heldAction) {
    button.addEventListener("pointerdown", (event) => {
      if (pickerOpen) return;
      prepareAudioForInteraction();
      event.preventDefault();
      event.stopPropagation();
      if (event.pointerType === "touch") enableTouchControls();
      if (heldAction === "mine" || heldAction === "place") {
        if (startBlockAction(heldAction, "touch", event.pointerId)) {
          if (Number.isFinite(event.pointerId)) button.setPointerCapture(event.pointerId);
        }
        return;
      }
      if (heldAction) {
        if ([...heldTouchActions.values()].includes(heldAction)) return;
        heldTouchActions.set(event.pointerId, heldAction);
        button.setPointerCapture(event.pointerId);
      }
      action();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(type, (event) => heldTouchActions.delete(event.pointerId));
      button.addEventListener(type, (event) => stopBlockAction(event.pointerId));
    }
  }
  bindTouchAction(touchMine, mineBlock, "mine");
  bindTouchAction(touchPlace, placeBlock, "place");
  bindTouchAction(touchJump, jump, "up");
  bindTouchAction(touchDescend, () => {}, "down");
  document.addEventListener("pointerlockchange", () => {
    pointerLockPending = false;
    if (document.pointerLockElement !== canvas) clearInput();
    message.textContent = document.pointerLockElement === canvas
      ? "Escでカーソルを戻せます"
      : gameCard.classList.contains("touch-enabled")
        ? "左のパッドで移動、画面右をドラッグして見回します"
        : "ゲーム画面をクリックしてスタート";
  });
  document.addEventListener("pointerlockerror", () => {
    pointerLockPending = false;
    message.textContent = "マウス操作を開始できませんでした。もう一度クリックしてください";
  });
  window.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas || pickerOpen) return;
    player.yaw += event.movementX * 0.0025;
    player.pitch = Math.max(-1.48, Math.min(1.48, player.pitch - event.movementY * 0.0025));
  });
  window.addEventListener("keydown", (event) => {
    prepareAudioForInteraction();
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.target.isContentEditable || event.target.tagName === "SELECT") return;
    if (event.code === "KeyR") {
      event.preventDefault();
      if (!event.repeat) {
        if (pickerOpen) closeBlockPicker(true);
        else openBlockPicker();
      }
      return;
    }
    if (/^Digit[1-9]$/.test(event.code)) {
      const index = Number(event.code.slice(5)) - 1;
      if (index < blockCategories.length) {
        event.preventDefault();
        if (!event.repeat) selectCategory(index);
      }
      return;
    }
    if (pickerOpen) {
      if (["Enter", "Space"].includes(event.code) && event.target.tagName === "BUTTON") return;
      if (["ArrowUp", "ArrowDown", "Space", "Enter", "Escape"].includes(event.code)) event.preventDefault();
      if (event.code === "ArrowUp") cycleBlockCandidate(-1);
      if (event.code === "ArrowDown") cycleBlockCandidate(1);
      if (event.code === "Enter" && !event.repeat) closeBlockPicker(true);
      if (event.code === "Escape") closeBlockPicker(false);
      return;
    }
    if (event.target.tagName === "BUTTON" && ["Enter", "Space"].includes(event.code)) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    if (event.code === "KeyI" && !event.repeat) {
      debugIndicator.hidden = !debugIndicator.hidden;
      updateDebugIndicator();
    }
    if (event.code === "Escape" && expanded) void toggleFullscreen();
    if (event.code === "Space" && !event.repeat && !keys.has("Space")) jump();
    if (event.code === "KeyW" && !event.repeat && !keys.has("KeyW")) {
      const now = performance.now();
      doubleTapSprint = now - lastForwardTime <= DOUBLE_FORWARD_MS;
      lastForwardTime = now;
    }
    keys.add(event.code);
  });
  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
    if (event.code === "KeyW") doubleTapSprint = false;
  });
  chooseBlock.addEventListener("click", () => {
    if (pickerOpen) closeBlockPicker(false);
    else openBlockPicker();
  });
  document.querySelector("#confirm-block-picker").addEventListener("click", () => closeBlockPicker(true));
  document.querySelector("#cancel-block-picker").addEventListener("click", () => closeBlockPicker(false));
  document.querySelector(".game-footer").addEventListener("wheel", handleSelectionWheel, { passive: false });
  canvas.addEventListener("wheel", (event) => {
    if (document.pointerLockElement === canvas || pickerOpen) handleSelectionWheel(event);
  }, { passive: false });
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInput();
      stopAmbientChirp();
    } else {
      scheduleAmbientChirp();
    }
  });

  function updateFullscreenControls() {
    fullscreenButton.textContent = expanded ? "全画面を終了" : "全画面";
    fullscreenButton.setAttribute("aria-pressed", String(expanded));
    gameCard.classList.toggle("is-expanded", expanded);
    document.body.classList.toggle("game-expanded", expanded);
    clearInput();
  }
  async function toggleFullscreen() {
    if (fullscreenButton.disabled) return;
    fullscreenButton.disabled = true;
    try {
      if (expanded) {
        if (document.fullscreenElement === gameCard) await document.exitFullscreen();
        expanded = false;
      } else {
        expanded = true;
        updateFullscreenControls();
        if (typeof gameCard.requestFullscreen === "function" && document.fullscreenEnabled !== false) {
          await gameCard.requestFullscreen();
        }
      }
    } catch (error) {
      console.error("Could not change fullscreen mode.", error);
      expanded = document.fullscreenElement === gameCard;
      message.textContent = "全画面を切り替えられませんでした。もう一度お試しください";
    }
    updateFullscreenControls();
    fullscreenButton.disabled = false;
  }
  fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    expanded = document.fullscreenElement === gameCard;
    updateFullscreenControls();
  });
  soundToggle.addEventListener("click", toggleSound);
  soundVolume.addEventListener("input", () => {
    soundVolumeLevel = Number(soundVolume.value);
    saveAudioSettings();
  });
  resetButton.addEventListener("click", () => {
    if (roomMode !== "solo") return;
    if (!window.confirm("ひとり用ワールドを新しい64×64の草原と森に置き換えますか？今の建築は削除されます。")) return;
    worldModel = globalThis.MoneycraftWorld.createModel({
      ...globalThis.MoneycraftWorld.defaultOptions, seed: Date.now(),
    });
    updateWorldLabel();
    moveToSafeSpawn();
    player.yaw = 0;
    player.pitch = -0.12;
    rebuildWorldMesh();
    saveGame();
    message.textContent = "新しいワールドを作りました";
  });

  function frame(time) {
    const frameInterval = lastTime ? time - lastTime : 0;
    const dt = Math.min(frameInterval / 1000 || 0, 1 / 30);
    lastTime = time;
    if (!debugIndicator.hidden && frameInterval > 0) {
      frameTimeSamples[nextFrameTimeSample] = frameInterval;
      nextFrameTimeSample = (nextFrameTimeSample + 1) % FRAME_SAMPLE_CAPACITY;
      frameTimeSampleCount = Math.min(frameTimeSampleCount + 1, FRAME_SAMPLE_CAPACITY);
    }
    stepViewOffset *= Math.exp(-STEP_VIEW_RESPONSE * Math.max(0, frameInterval) / 1000);
    if (Math.abs(stepViewOffset) < 0.0001) stepViewOffset = 0;
    update(dt);
    debugTimer += dt;
    if (debugTimer >= 0.1) {
      updateDebugIndicator();
      debugTimer = 0;
    }
    saveTimer += dt;
    if (saveTimer >= 5) {
      saveGame();
      saveTimer = 0;
    }
    render();
    window.requestAnimationFrame(frame);
  }

  try {
    initializeRenderer();
    loadAudioSettings();
    loadGame();
    loadBlockSelection();
    updateWorldLabel();
    buildHotbar();
    rebuildWorldMesh();
    if (window.matchMedia?.("(any-pointer: coarse)").matches) enableTouchControls();
    window.setInterval(sendCurrentPlayerState, PLAYER_STATE_INTERVAL_MS);
    window.requestAnimationFrame(frame);
  } catch (error) {
    console.error("The 3D world could not be initialized.", error);
    message.textContent = "3Dワールドを開始できませんでした";
    saveState.textContent = "WebGLの初期化に失敗しました";
  }
})();
