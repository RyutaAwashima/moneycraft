"use strict";

(() => {
  const FACES = Object.freeze([
    { neighbor: [1, 0, 0], shade: 0.78, points: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 1, 1], [1, 0, 1], [1, 0, 0]] },
    { neighbor: [-1, 0, 0], shade: 0.68, points: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 1, 0], [0, 0, 0], [0, 0, 1]] },
    { neighbor: [0, 1, 0], shade: 1, points: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1]] },
    { neighbor: [0, -1, 0], shade: 0.52, points: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 0, 1], [0, 0, 1], [0, 0, 0]] },
    { neighbor: [0, 0, 1], shade: 0.86, points: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]] },
    { neighbor: [0, 0, -1], shade: 0.72, points: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] },
  ]);
  const KEY = (x, y, z) => `${x},${y},${z}`;

  function normalize(vector) {
    const length = Math.hypot(...vector) || 1;
    return vector.map((value) => value / length);
  }

  function multiplyMatrices(first, second) {
    const result = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        result[column * 4 + row] = first[row] * second[column * 4]
          + first[4 + row] * second[column * 4 + 1]
          + first[8 + row] * second[column * 4 + 2]
          + first[12 + row] * second[column * 4 + 3];
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

  function lookAt(eye, target) {
    const forward = normalize(target.map((value, axis) => value - eye[axis]));
    const right = normalize([-forward[2], 0, forward[0]]);
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

  function createMesh(course, materials) {
    const occupied = new Map(course.blocks.map((block) =>
      [KEY(block.x, block.y, block.z), block.block]));
    const positions = [];
    const colors = [];
    for (const block of course.blocks) {
      const material = materials[block.block - 1];
      if (!material) throw new Error(`Unknown course block: ${block.block}`);
      const variation = (((block.x * 37 + block.y * 17 + block.z * 31 + block.block * 13) % 9) - 4) * 0.004;
      for (const face of FACES) {
        const [dx, dy, dz] = face.neighbor;
        if (occupied.has(KEY(block.x + dx, block.y + dy, block.z + dz))) continue;
        for (const point of face.points) {
          positions.push(block.x + point[0], block.y + point[1], block.z + point[2]);
          colors.push(...material.color.map((channel) =>
            Math.max(0, Math.min(1, channel * face.shade + variation))));
        }
      }
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
  }

  function createRenderer(canvas, course) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
    if (!gl) return null;

    function compile(type, source) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not create course shader.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message || "Course shader compilation failed.");
      }
      return shader;
    }

    const vertexShader = compile(gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      uniform mat4 uViewProjection;
      varying vec3 vColor;
      varying float vFog;
      void main() {
        vec4 clip = uViewProjection * vec4(aPosition, 1.0);
        gl_Position = clip;
        vColor = aColor;
        vFog = clamp((clip.w - 24.0) / 82.0, 0.0, 0.72);
      }
    `);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 vColor;
      varying float vFog;
      void main() {
        gl_FragColor = vec4(mix(vColor, vec3(0.68, 0.83, 0.81), vFog), 1.0);
      }
    `);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create course rendering program.");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Course shader linking failed.");
    }
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    const mesh = createMesh(course, globalThis.MoneycraftWorld.blocks);
    const positionBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    if (!positionBuffer || !colorBuffer) throw new Error("Could not create course mesh buffers.");
    const positionAttribute = gl.getAttribLocation(program, "aPosition");
    const colorAttribute = gl.getAttribLocation(program, "aColor");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttribute);
    gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(colorAttribute);
    gl.vertexAttribPointer(colorAttribute, 3, gl.FLOAT, false, 0, 0);
    const viewProjection = gl.getUniformLocation(program, "uViewProjection");
    let lastSize = "";

    function draw(progress) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      const size = `${width}x${height}`;
      if (size !== lastSize) {
        canvas.width = width;
        canvas.height = height;
        lastSize = size;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0.68, 0.83, 0.81, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const runner = course.getPosition(progress);
      const [directionX, directionZ] = runner.direction;
      const eye = [runner.x - directionX * 8, 8.3, runner.z - directionZ * 8];
      const target = [runner.x + directionX * 12, 4.5, runner.z + directionZ * 12];
      const projection = perspective(Math.PI / 3.2, width / height, 0.1, 120);
      gl.uniformMatrix4fv(viewProjection, false,
        multiplyMatrices(projection, lookAt(eye, target)));
      gl.drawArrays(gl.TRIANGLES, 0, mesh.positions.length / 3);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`Course WebGL error: ${error}`);
    }

    return Object.freeze({ draw });
  }

  globalThis.MoneycraftMotionRunRenderer = Object.freeze({ createMesh, createRenderer });
})();
