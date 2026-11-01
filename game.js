"use strict";

(() => {
  const canvas = document.querySelector("#game");
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
  const hotbar = document.querySelector("#hotbar");
  const message = document.querySelector("#game-message");
  const debugIndicator = document.querySelector("#debug-indicator");
  const virtualStick = document.querySelector("#virtual-stick");
  const touchMine = document.querySelector("#touch-mine");
  const touchPlace = document.querySelector("#touch-place");
  const touchJump = document.querySelector("#touch-jump");
  const saveState = document.querySelector("#save-state");
  const resetButton = document.querySelector("#reset-world");
  const remotePlayerLabels = document.querySelector("#remote-player-labels");
  if (!gl) {
    message.textContent = "このブラウザーではWebGLを利用できません";
    saveState.textContent = "WebGL対応ブラウザーが必要です";
    return;
  }

  const WORLD_WIDTH = 40;
  const WORLD_DEPTH = 40;
  const WORLD_HEIGHT = 20;
  const SAVE_KEY = "moneycraft-3d-world-v2";
  const PLAYER_HEIGHT = 1.7;
  const PLAYER_RADIUS = 0.28;
  const PLAYER_STATE_INTERVAL_MS = 100;
  const REMOTE_PLAYER_TIMEOUT = 5000;
  const REACH = 6;
  const GRAVITY = 19;
  const JUMP_SPEED = 7.8;
  const blocks = globalThis.MoneycraftWorld.blocks;
  const worldModel = globalThis.MoneycraftWorld.createModel({
    width: WORLD_WIDTH,
    depth: WORLD_DEPTH,
    height: WORLD_HEIGHT,
  });
  const keys = new Set();
  const touchPointers = new Map();
  const touchMove = { x: 0, z: 0 };
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
  const remotePlayers = new Map();
  const remotePlayerLabelElements = new Map();
  let selectedBlock = 1;
  let program;
  let avatarPositionBuffer;
  let avatarColorBuffer;
  let positionAttribute;
  let colorAttribute;
  let uvAttribute;
  let textureAtlas;
  let atlasCanvas;
  const CHUNK_SIZE = 8;
  const chunkMeshes = new Map();
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
    if (!worldModel.load(soloSnapshot.world)) {
      throw new Error("Could not restore the solo world.");
    }
    player = { ...soloSnapshot.player };
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
      || !worldModel.load(snapshot.world)) {
      invalidWorldMessage();
      return false;
    }
    worldRevision = snapshot.revision;
    awaitingSnapshot = false;
    clearPendingEdits();
    rebuildWorldMesh();
    if (collidesAt(player.x, player.y, player.z)) moveToSafeSpawn();
    saveState.textContent = "共有ワールドをサーバーに保存";
    return true;
  }

  function receiveBlockChanged(event) {
    if (roomMode !== "shared") return;
    const edit = event.detail;
    if (!edit || !Number.isSafeInteger(edit.revision) || edit.revision < 1
      || typeof edit.requestId !== "string" || typeof edit.playerId !== "string"
      || !inBounds(edit.x, edit.y, edit.z) || !Number.isInteger(edit.block)
      || edit.block < 0 || edit.block > blocks.length) {
      invalidWorldMessage();
      return;
    }
    if (awaitingSnapshot || edit.revision <= worldRevision) return;
    if (edit.revision !== worldRevision + 1 || getBlock(edit.x, edit.y, edit.z) !== edit.expectedBlock) {
      requestWorldSnapshot();
      return;
    }
    setBlock(edit.x, edit.y, edit.z, edit.block);
    worldRevision = edit.revision;
    updateWorldMesh(edit.x, edit.y, edit.z);
    if (pendingEdits.has(edit.requestId)) {
      window.clearTimeout(pendingEdits.get(edit.requestId));
      pendingEdits.delete(edit.requestId);
      message.textContent = edit.block === 0 ? "ブロックを掘りました" : `${blocks[edit.block - 1].name}を置きました`;
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
    const reasons = {
      rate_limited: "操作が速すぎます。少し待ってください",
      out_of_reach: "置きたい・掘りたい場所に近づいてください",
      edit_conflict: "ほかの人が先に変更しました。再同期します",
      player_in_block: "プレイヤーがいる場所には置けません",
      room_closed: "部屋が閉じられました",
    };
    message.textContent = reasons[rejection.code] || `建築の変更が拒否されました: ${rejection.code}`;
    if (rejection.code === "edit_conflict") requestWorldSnapshot();
  }

  function changeBlock(x, y, z, block) {
    if (roomMode === "connecting" || awaitingSnapshot) {
      message.textContent = "共有ワールドの読み込み完了を待ってください";
      return;
    }
    if (roomMode === "shared") {
      const requestId = crypto.randomUUID();
      pendingEdits.set(requestId, window.setTimeout(() => {
        message.textContent = "建築の応答を確認できません。再同期します";
        requestWorldSnapshot();
      }, 5000));
      message.textContent = "建築の変更を送信中";
      sendCurrentPlayerState();
      emitWorldEvent("send-block-edit", { requestId, x, y, z, block, expectedBlock: getBlock(x, y, z) });
      return;
    }
    setBlock(x, y, z, block);
    updateWorldMesh(x, y, z);
    saveGame();
    message.textContent = block === 0 ? "ブロックを掘りました" : `${blocks[block - 1].name}を置きました`;
  }

  function inBounds(x, y, z) {
    return worldModel.inBounds(x, y, z);
  }

  function getBlock(x, y, z) {
    return worldModel.getBlock(x, y, z);
  }

  function setBlock(x, y, z, block) {
    return worldModel.setBlock(x, y, z, block);
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
    if (!avatarPositionBuffer || !avatarColorBuffer) {
      throw new Error("Could not create multiplayer avatar buffers.");
    }
    initializeTextures();
  }

  function initializeTextures() {
    atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = 256;
    atlasCanvas.height = 16;
    const context = atlasCanvas.getContext("2d");
    if (!context) throw new Error("Could not create block texture canvas.");
    for (let tile = 0; tile < 11; tile += 1) {
      const id = tile < 9 ? tile + 1 : tile === 9 ? 2 : 4;
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
          if (id === 8) color = base.map((channel) => channel + noise * 0.25);
          if (id === 9) {
            if (x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7) color = [227, 223, 206];
            else if ((x + y) % 14 < 2) color = [194, 227, 236];
          }
          if (tile === 9 && y < 3 + x % 2) color = blocks[0].color.map((channel) => channel * 255 + noise);
          if (tile === 10) {
            const ring = Math.floor(Math.hypot(x - 7.5, y - 7.5)) % 3 === 0 ? -28 : 12;
            color = base.map((channel) => channel + ring + noise * 0.3);
          }
          context.fillStyle = `rgb(${color.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))).join(",")})`;
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
    const candidates = [];
    for (let z = 2; z < WORLD_DEPTH - 2; z += 1) {
      for (let x = 2; x < WORLD_WIDTH - 2; x += 1) {
        candidates.push({ x: x + 0.5, z: z + 0.5, distance: (x + 0.5 - 20.5) ** 2 + (z + 0.5 - 20.5) ** 2 });
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
      return;
    }
    throw new Error("Could not find a clear player spawn location.");
  }

  function loadGame() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (Number.isFinite(data.x) && Number.isFinite(data.z) && worldModel.load(data.world)) {
          player.x = Math.max(1, Math.min(WORLD_WIDTH - 1, data.x));
          player.z = Math.max(1, Math.min(WORLD_DEPTH - 1, data.z));
          player.y = worldModel.findSurface(player.x, player.z);
          if (Number.isFinite(data.yaw)) player.yaw = data.yaw;
          if (!collidesAt(player.x, player.y, player.z)) return;
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
    for (let y = 0; y < WORLD_HEIGHT; y += CHUNK_SIZE) {
      for (let z = 0; z < WORLD_DEPTH; z += CHUNK_SIZE) {
        for (let x = 0; x < WORLD_WIDTH; x += CHUNK_SIZE) rebuildChunk(x, y, z);
      }
    }
  }

  function updateWorldMesh(x, y, z) {
    const chunks = new Map();
    for (const offset of [[0, 0, 0], ...faces.map((face) => face.neighbor)]) {
      const cell = [x + offset[0], y + offset[1], z + offset[2]];
      if (!inBounds(...cell)) continue;
      const start = cell.map((value) => Math.floor(value / CHUNK_SIZE) * CHUNK_SIZE);
      chunks.set(start.join(","), start);
    }
    for (const start of chunks.values()) rebuildChunk(...start);
  }

  function rebuildChunk(startX, startY, startZ) {
    const positions = [];
    const colors = [];
    const uvs = [];
    const { width, depth, height } = worldModel.dimensions;
    for (let y = startY; y < Math.min(height, startY + CHUNK_SIZE); y += 1) {
      for (let z = startZ; z < Math.min(depth, startZ + CHUNK_SIZE); z += 1) {
        for (let x = startX; x < Math.min(width, startX + CHUNK_SIZE); x += 1) {
          const block = getBlock(x, y, z);
          if (block === 0) continue;
          for (const face of faces) {
            if (getBlock(x + face.neighbor[0], y + face.neighbor[1], z + face.neighbor[2]) !== 0) continue;
            let tile = block - 1;
            if (block === 1) tile = face.normal[1] === 1 ? 0 : face.normal[1] === -1 ? 1 : 9;
            if (block === 4 && face.normal[1] !== 0) tile = 10;
            const faceUv = [[0, 1], [0, 0], [1, 0], [1, 1]];
            const points = face.corners;
            for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
              const corner = points[cornerIndex];
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              colors.push(face.light, face.light, face.light);
              uvs.push((tile * 16 + 0.5 + faceUv[cornerIndex][0] * 15) / 256,
                (0.5 + faceUv[cornerIndex][1] * 15) / 16);
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
    for (const [buffer, data] of [[mesh.position, positions], [mesh.color, colors], [mesh.uv, uvs]]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    }
  }

  function buildHotbar() {
    for (const [index, block] of blocks.entries()) {
      const button = document.createElement("button");
      button.className = "hotbar-slot";
      button.type = "button";
      button.setAttribute("aria-label", `${index + 1}: ${block.name}`);
      button.setAttribute("aria-pressed", String(selectedBlock === block.id));
      button.title = `${index + 1}: ${block.name}`;
      const number = document.createElement("span");
      number.className = "slot-number";
      number.textContent = String(index + 1);
      const swatch = document.createElement("canvas");
      swatch.className = "block-swatch";
      swatch.width = 16;
      swatch.height = 16;
      swatch.setAttribute("aria-hidden", "true");
      const context = swatch.getContext("2d");
      if (!context) throw new Error("Could not create a block preview.");
      context.drawImage(atlasCanvas, index * 16, 0, 16, 16, 0, 0, 16, 16);
      button.append(number, swatch);
      button.addEventListener("click", () => selectBlock(block.id));
      hotbar.append(button);
    }
  }

  function selectBlock(id) {
    selectedBlock = id;
    for (const [index, button] of [...hotbar.children].entries()) {
      button.setAttribute("aria-pressed", String(blocks[index].id === id));
    }
    message.textContent = `${blocks[id - 1].name}を選択中`;
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
    resizeCanvas();
    gl.clearColor(0.62, 0.82, 0.88, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    const eye = [player.x, player.y + PLAYER_HEIGHT * 0.88, player.z];
    const viewProjection = matrixMultiply(
      perspective(Math.PI / 3, canvas.width / canvas.height, 0.08, 100),
      lookAt(eye, viewDirection()),
    );
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uViewProjection"), false, viewProjection);
    gl.uniform1i(gl.getUniformLocation(program, "uTextured"), 1);
    gl.enableVertexAttribArray(uvAttribute);
    for (const mesh of chunkMeshes.values()) {
      if (!mesh.count) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
      gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.color);
      gl.vertexAttribPointer(colorAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv);
      gl.vertexAttribPointer(uvAttribute, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
    gl.uniform1i(gl.getUniformLocation(program, "uTextured"), 0);
    gl.disableVertexAttribArray(uvAttribute);
    gl.vertexAttrib2f(uvAttribute, 0, 0);
    renderRemotePlayers(viewProjection);
  }

  function isRemotePlayerState(state) {
    return state !== null
      && typeof state === "object"
      && Number.isFinite(state.x) && state.x >= 0 && state.x <= WORLD_WIDTH
      && Number.isFinite(state.y) && state.y >= 0 && state.y <= WORLD_HEIGHT + 10
      && Number.isFinite(state.z) && state.z >= 0 && state.z <= WORLD_DEPTH
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

      const eyeY = player.y + PLAYER_HEIGHT * 0.88;
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
    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);
  }

  function collidesAt(x, feetY, z) {
    const minX = Math.floor(x - PLAYER_RADIUS);
    const maxX = Math.floor(x + PLAYER_RADIUS);
    const minZ = Math.floor(z - PLAYER_RADIUS);
    const maxZ = Math.floor(z + PLAYER_RADIUS);
    const minY = Math.floor(feetY + 0.0001);
    const maxY = Math.floor(feetY + PLAYER_HEIGHT - 0.04);
    for (let y = minY; y <= maxY; y += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        for (let cellX = minX; cellX <= maxX; cellX += 1) {
          if (getBlock(cellX, y, cellZ) !== 0) return true;
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
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        for (let cellX = minX; cellX <= maxX; cellX += 1) {
          if (getBlock(cellX, y, cellZ) !== 0) return y + 1;
        }
      }
    }
    return toY;
  }

  function update(dt) {
    const forwardInput = Math.max(-1, Math.min(1,
      Number(keys.has("KeyW") || keys.has("ArrowUp"))
      - Number(keys.has("KeyS") || keys.has("ArrowDown"))
      + touchMove.z));
    const sideInput = Math.max(-1, Math.min(1,
      Number(keys.has("KeyD") || keys.has("ArrowRight"))
      - Number(keys.has("KeyA") || keys.has("ArrowLeft"))
      + touchMove.x));
    const length = Math.max(1, Math.hypot(forwardInput, sideInput));
    const forward = viewDirection();
    const stepX = (forward[0] * forwardInput + Math.cos(player.yaw) * sideInput) / length * 4.5 * dt;
    const stepZ = (forward[2] * forwardInput + Math.sin(player.yaw) * sideInput) / length * 4.5 * dt;

    const nextX = Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, player.x + stepX));
    if (!collidesAt(nextX, player.y, player.z)) player.x = nextX;
    const nextZ = Math.max(PLAYER_RADIUS, Math.min(WORLD_DEPTH - PLAYER_RADIUS, player.z + stepZ));
    if (!collidesAt(player.x, player.y, nextZ)) player.z = nextZ;

    player.velocityY -= GRAVITY * dt;
    const nextY = player.y + player.velocityY * dt;
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
      player.y = Math.floor(nextY + PLAYER_HEIGHT) - PLAYER_HEIGHT;
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
    ].join("\n");
  }

  function raycast() {
    const direction = viewDirection();
    let x = Math.floor(player.x);
    let y = Math.floor(player.y + PLAYER_HEIGHT * 0.88);
    let z = Math.floor(player.z);
    const stepX = Math.sign(direction[0]);
    const stepY = Math.sign(direction[1]);
    const stepZ = Math.sign(direction[2]);
    const deltaX = direction[0] === 0 ? Infinity : Math.abs(1 / direction[0]);
    const deltaY = direction[1] === 0 ? Infinity : Math.abs(1 / direction[1]);
    const deltaZ = direction[2] === 0 ? Infinity : Math.abs(1 / direction[2]);
    let maxX = direction[0] === 0 ? Infinity : ((stepX > 0 ? x + 1 : x) - player.x) / direction[0];
    let maxY = direction[1] === 0 ? Infinity : ((stepY > 0 ? y + 1 : y) - (player.y + PLAYER_HEIGHT * 0.88)) / direction[1];
    let maxZ = direction[2] === 0 ? Infinity : ((stepZ > 0 ? z + 1 : z) - player.z) / direction[2];
    let distance = 0;
    let normal = [0, 0, 0];

    while (distance <= REACH) {
      if (getBlock(x, y, z) !== 0) return { x, y, z, normal, distance };
      if (maxX < maxY && maxX < maxZ) {
        x += stepX;
        distance = maxX;
        maxX += deltaX;
        normal = [-stepX, 0, 0];
      } else if (maxY < maxZ) {
        y += stepY;
        distance = maxY;
        maxY += deltaY;
        normal = [0, -stepY, 0];
      } else {
        z += stepZ;
        distance = maxZ;
        maxZ += deltaZ;
        normal = [0, 0, -stepZ];
      }
    }
    return null;
  }

  function mineBlock() {
    const target = raycast();
    if (!target) {
      message.textContent = "照準を近くのブロックに合わせてね";
      return;
    }
    changeBlock(target.x, target.y, target.z, 0);
  }

  function placeBlock() {
    const target = raycast();
    if (!target) {
      message.textContent = "置きたい場所に近づいてね";
      return;
    }
    const x = target.x + target.normal[0];
    const y = target.y + target.normal[1];
    const z = target.z + target.normal[2];
    if (!inBounds(x, y, z) || getBlock(x, y, z) !== 0 || collidesAt(player.x, player.y, player.z)
      || (x >= player.x - PLAYER_RADIUS && x <= player.x + PLAYER_RADIUS
        && z >= player.z - PLAYER_RADIUS && z <= player.z + PLAYER_RADIUS
        && y < player.y + PLAYER_HEIGHT && y + 1 > player.y)) {
      message.textContent = "そこにはブロックを置けません";
      return;
    }
    changeBlock(x, y, z, selectedBlock);
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
    if (event.button === 0) mineBlock();
    if (event.button === 2) placeBlock();
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
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
      virtualStick.hidden = false;
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
      virtualStick.hidden = true;
    }
  }
  canvas.addEventListener("pointerup", endTouchPointer);
  canvas.addEventListener("pointercancel", endTouchPointer);
  canvas.addEventListener("lostpointercapture", endTouchPointer);

  function jump() {
    if (!player.grounded) return;
    player.velocityY = JUMP_SPEED;
    player.grounded = false;
  }
  function bindTouchAction(button, action) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
  }
  bindTouchAction(touchMine, mineBlock);
  bindTouchAction(touchPlace, placeBlock);
  bindTouchAction(touchJump, jump);
  document.addEventListener("pointerlockchange", () => {
    pointerLockPending = false;
    message.textContent = document.pointerLockElement === canvas
      ? "Escでカーソルを戻せます"
      : "ゲーム画面をクリックしてスタート";
  });
  document.addEventListener("pointerlockerror", () => {
    pointerLockPending = false;
    message.textContent = "マウス操作を開始できませんでした。もう一度クリックしてください";
  });
  window.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    player.yaw += event.movementX * 0.0025;
    player.pitch = Math.max(-1.48, Math.min(1.48, player.pitch - event.movementY * 0.0025));
  });
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    if (event.code === "KeyI" && !event.repeat) {
      debugIndicator.hidden = !debugIndicator.hidden;
      updateDebugIndicator();
    }
    if (event.code.startsWith("Digit")) {
      const index = Number(event.code.slice(5));
      if (index >= 1 && index <= blocks.length) selectBlock(index);
    }
    if (event.code === "Space") jump();
    keys.add(event.code);
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => keys.clear());
  resetButton.addEventListener("click", () => {
    if (roomMode !== "solo") return;
    if (!window.confirm("ワールドを最初の状態に戻しますか？")) return;
    worldModel.reset(Date.now());
    moveToSafeSpawn();
    player.yaw = 0;
    player.pitch = -0.12;
    rebuildWorldMesh();
    saveGame();
    message.textContent = "新しいワールドを作りました";
  });

  function frame(time) {
    const dt = Math.min((time - lastTime) / 1000 || 0, 1 / 30);
    lastTime = time;
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
    loadGame();
    buildHotbar();
    rebuildWorldMesh();
    window.setInterval(sendCurrentPlayerState, PLAYER_STATE_INTERVAL_MS);
    window.requestAnimationFrame(frame);
  } catch (error) {
    console.error("The 3D world could not be initialized.", error);
    message.textContent = "3Dワールドを開始できませんでした";
    saveState.textContent = "WebGLの初期化に失敗しました";
  }
})();
