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
  const REACH = 6;
  const GRAVITY = 19;
  const JUMP_SPEED = 7.8;
  const blocks = [
    { id: 1, name: "草ブロック", color: [0.39, 0.65, 0.27] },
    { id: 2, name: "土ブロック", color: [0.52, 0.32, 0.18] },
    { id: 3, name: "石ブロック", color: [0.49, 0.53, 0.53] },
    { id: 4, name: "木材ブロック", color: [0.65, 0.43, 0.23] },
    { id: 5, name: "葉っぱブロック", color: [0.25, 0.53, 0.29] },
  ];
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

  let world = new Uint8Array(WORLD_WIDTH * WORLD_DEPTH * WORLD_HEIGHT);
  let player = { x: 20.5, y: 0, z: 29.5, velocityY: 0, grounded: false, yaw: 0, pitch: -0.12 };
  let selectedBlock = 1;
  let program;
  let positionBuffer;
  let colorBuffer;
  let vertexCount = 0;
  let lastTime = 0;
  let saveTimer = 0;
  let debugTimer = 0;
  let pointerLockPending = false;

  function indexOf(x, y, z) {
    return (y * WORLD_DEPTH + z) * WORLD_WIDTH + x;
  }

  function inBounds(x, y, z) {
    return x >= 0 && x < WORLD_WIDTH && z >= 0 && z < WORLD_DEPTH && y >= 0 && y < WORLD_HEIGHT;
  }

  function getBlock(x, y, z) {
    return inBounds(x, y, z) ? world[indexOf(x, y, z)] : 0;
  }

  function setBlock(x, y, z, block) {
    if (inBounds(x, y, z)) world[indexOf(x, y, z)] = block;
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
      uniform mat4 uViewProjection;
      varying vec3 vColor;
      void main() {
        gl_Position = uViewProjection * vec4(aPosition, 1.0);
        vColor = aColor;
      }
    `);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 vColor;
      void main() {
        gl_FragColor = vec4(vColor, 1.0);
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
    positionBuffer = gl.createBuffer();
    colorBuffer = gl.createBuffer();
    if (!positionBuffer || !colorBuffer) throw new Error("Could not create WebGL buffers.");
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, "aPosition"));
    gl.enableVertexAttribArray(gl.getAttribLocation(program, "aColor"));
  }

  function terrainHeight(x, z) {
    return Math.floor(
      5
      + Math.sin(x * 0.31) * 1.2
      + Math.sin(z * 0.27) * 1.25
      + Math.sin((x + z) * 0.17) * 0.75
      + Math.sin((x - z) * 0.11) * 0.55,
    );
  }

  function createWorld() {
    world = new Uint8Array(WORLD_WIDTH * WORLD_DEPTH * WORLD_HEIGHT);
    const heights = Array.from({ length: WORLD_DEPTH }, () => Array(WORLD_WIDTH).fill(0));
    for (let z = 0; z < WORLD_DEPTH; z += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        const surface = terrainHeight(x, z);
        heights[z][x] = surface;
        for (let y = 0; y <= surface; y += 1) {
          setBlock(x, y, z, y === surface ? 1 : y >= surface - 3 ? 2 : 3);
        }
      }
    }

    for (let z = 3; z < WORLD_DEPTH - 3; z += 1) {
      for (let x = 3; x < WORLD_WIDTH - 3; x += 1) {
        if ((x * 17 + z * 31) % 43 !== 0) continue;
        const ground = heights[z][x];
        const trunkHeight = 3 + ((x + z) % 2);
        for (let dy = 1; dy <= trunkHeight; dy += 1) setBlock(x, ground + dy, z, 4);
        const crownY = ground + trunkHeight;
        for (let dy = -1; dy <= 2; dy += 1) {
          for (let dz = -2; dz <= 2; dz += 1) {
            for (let dx = -2; dx <= 2; dx += 1) {
              if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - 1) > 4) continue;
              if (getBlock(x + dx, crownY + dy, z + dz) === 0) setBlock(x + dx, crownY + dy, z + dz, 5);
            }
          }
        }
      }
    }
  }

  function findSurface(x, z) {
    const cellX = Math.max(0, Math.min(WORLD_WIDTH - 1, Math.floor(x)));
    const cellZ = Math.max(0, Math.min(WORLD_DEPTH - 1, Math.floor(z)));
    for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
      if (getBlock(cellX, y, cellZ) !== 0) return y + 1;
    }
    return 1;
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
      const y = findSurface(candidate.x, candidate.z);
      if (collidesAt(candidate.x, y, candidate.z)) continue;
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
        if (data.world instanceof Array && data.world.length === world.length
          && data.world.every((block) => Number.isInteger(block) && block >= 0 && block <= 5)
          && Number.isFinite(data.x) && Number.isFinite(data.z)) {
          world.set(data.world);
          player.x = Math.max(1, Math.min(WORLD_WIDTH - 1, data.x));
          player.z = Math.max(1, Math.min(WORLD_DEPTH - 1, data.z));
          player.y = findSurface(player.x, player.z);
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
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        world: Array.from(world),
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
    const positions = [];
    const colors = [];
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let z = 0; z < WORLD_DEPTH; z += 1) {
        for (let x = 0; x < WORLD_WIDTH; x += 1) {
          const block = getBlock(x, y, z);
          if (block === 0) continue;
          for (const face of faces) {
            if (getBlock(x + face.neighbor[0], y + face.neighbor[1], z + face.neighbor[2]) !== 0) continue;
            const baseColor = blocks[block - 1].color;
            const faceColor = baseColor.map((channel) => channel * face.light);
            const points = face.corners;
            for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
              const corner = points[cornerIndex];
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              colors.push(faceColor[0], faceColor[1], faceColor[2]);
            }
          }
        }
      }
    }
    vertexCount = positions.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.getAttribLocation(program, "aPosition"), 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.getAttribLocation(program, "aColor"), 3, gl.FLOAT, false, 0, 0);
  }

  function buildHotbar() {
    for (const [index, block] of blocks.entries()) {
      const button = document.createElement("button");
      button.className = "hotbar-slot";
      button.type = "button";
      button.setAttribute("aria-label", `${index + 1}: ${block.name}`);
      button.setAttribute("aria-pressed", String(selectedBlock === block.id));
      button.title = `${index + 1}: ${block.name}`;
      button.innerHTML = `<span class="slot-number">${index + 1}</span><span class="block-swatch" style="background:rgb(${blocks[index].color.map((value) => Math.round(value * 255)).join(",")})" aria-hidden="true"></span>`;
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
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
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

    const nextX = player.x + stepX;
    if (!collidesAt(nextX, player.y, player.z)) player.x = nextX;
    const nextZ = player.z + stepZ;
    if (!collidesAt(player.x, player.y, nextZ)) player.z = nextZ;

    player.velocityY -= GRAVITY * dt;
    const nextY = player.y + player.velocityY * dt;
    if (!collidesAt(player.x, nextY, player.z)) {
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
    const minedBlock = getBlock(target.x, target.y, target.z);
    setBlock(target.x, target.y, target.z, 0);
    rebuildWorldMesh();
    saveGame();
    message.textContent = `${blocks[minedBlock - 1].name}を掘りました`;
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
    setBlock(x, y, z, selectedBlock);
    rebuildWorldMesh();
    saveGame();
    message.textContent = `${blocks[selectedBlock - 1].name}を置きました`;
  }

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
    if (!window.confirm("ワールドを最初の状態に戻しますか？")) return;
    createWorld();
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
    createWorld();
    loadGame();
    buildHotbar();
    rebuildWorldMesh();
    window.requestAnimationFrame(frame);
  } catch (error) {
    console.error("The 3D world could not be initialized.", error);
    message.textContent = "3Dワールドを開始できませんでした";
    saveState.textContent = "WebGLの初期化に失敗しました";
  }
})();
