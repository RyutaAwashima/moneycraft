"use strict";

(() => {
  const { defaults, storageKey, isAppearance, createMesh, posePositions } = globalThis.MoneycraftAvatar;

  function createRenderer(canvas) {
    const gl = canvas.getContext("webgl", {
      alpha: true, antialias: true, preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL is unavailable.");
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not create motion avatar shader.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const detail = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(detail || "Motion avatar shader compilation failed.");
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      uniform vec4 uView;
      uniform vec2 uScale;
      uniform float uBodyHeight;
      uniform float uBodyOffset;
      uniform float uBodyX;
      uniform float uBodyTilt;
      varying vec3 vColor;
      void main() {
        vec3 p = aPosition - vec3(0.0, 0.9, 0.0);
        p.x += uBodyX;
        p.y = p.y * uBodyHeight + uBodyOffset;
        float tiltCos = cos(uBodyTilt);
        float tiltSin = sin(uBodyTilt);
        vec2 tilted = vec2(
          p.x * tiltCos - p.y * tiltSin,
          p.x * tiltSin + p.y * tiltCos
        );
        p.xy = tilted;
        float x = p.x * uView.x + p.z * uView.y;
        float z = -p.x * uView.y + p.z * uView.x;
        float y = p.y * uView.z - z * uView.w;
        float depth = p.y * uView.w + z * uView.z;
        gl_Position = vec4(x * uScale.x, y * uScale.y, -depth * 0.3, 1.0);
        vColor = aColor;
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0); }
    `);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create motion avatar program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Motion avatar program linking failed.");
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    const position = gl.createBuffer();
    const color = gl.createBuffer();
    if (!position || !color) throw new Error("Could not create motion avatar buffers.");
    const positionAttribute = gl.getAttribLocation(program, "aPosition");
    const colorAttribute = gl.getAttribLocation(program, "aColor");
    const view = gl.getUniformLocation(program, "uView");
    const scale = gl.getUniformLocation(program, "uScale");
    const bodyHeight = gl.getUniformLocation(program, "uBodyHeight");
    const bodyOffset = gl.getUniformLocation(program, "uBodyOffset");
    const bodyX = gl.getUniformLocation(program, "uBodyX");
    const bodyTilt = gl.getUniformLocation(program, "uBodyTilt");
    let mesh;
    let posed;
    let count = 0;
    let targetPose = Array.from({ length: 6 }, () => [0, 0, 0]);
    let currentPose = Array.from({ length: 6 }, () => [0, 0, 0]);
    let targetHeight = 1;
    let currentHeight = 1;
    let targetOffset = 0;
    let currentOffset = 0;
    let targetX = 0;
    let currentX = 0;
    let targetTilt = 0;
    let currentTilt = 0;
    let animationFrame = 0;
    let lastFrameTime = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width === width && canvas.height === height) return false;
      canvas.width = width;
      canvas.height = height;
      return true;
    }

    function draw(deltaTime, force = false) {
      const response = 1 - Math.exp(-14 * Math.min(deltaTime, 0.1));
      let changed = false;
      for (let joint = 0; joint < currentPose.length; joint += 1) {
        for (let axis = 0; axis < 3; axis += 1) {
          const next = currentPose[joint][axis]
            + (targetPose[joint][axis] - currentPose[joint][axis]) * response;
          if (Math.abs(next - currentPose[joint][axis]) > 0.0001) changed = true;
          currentPose[joint][axis] = next;
        }
      }
      const nextHeight = currentHeight + (targetHeight - currentHeight) * response;
      const nextOffset = currentOffset + (targetOffset - currentOffset) * response;
      const nextX = currentX + (targetX - currentX) * response;
      const nextTilt = currentTilt + (targetTilt - currentTilt) * response;
      if (Math.abs(nextHeight - currentHeight) > 0.0001
        || Math.abs(nextOffset - currentOffset) > 0.0001
        || Math.abs(nextX - currentX) > 0.0001
        || Math.abs(nextTilt - currentTilt) > 0.0001) changed = true;
      currentHeight = nextHeight;
      currentOffset = nextOffset;
      currentX = nextX;
      currentTilt = nextTilt;
      const resized = resize();
      if (!changed && !resized && !force) return false;

      posePositions(mesh, currentPose, posed);
      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, posed);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const yaw = 12 * Math.PI / 180;
      const pitch = 8 * Math.PI / 180;
      gl.uniform4f(view, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch));
      const size = 0.5;
      gl.uniform2f(scale, size / Math.max(1, canvas.width / canvas.height),
        size / Math.max(1, canvas.height / canvas.width));
      gl.uniform1f(bodyHeight, currentHeight);
      gl.uniform1f(bodyOffset, currentOffset);
      gl.uniform1f(bodyX, currentX);
      gl.uniform1f(bodyTilt, currentTilt);
      gl.drawArrays(gl.TRIANGLES, 0, count);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`Motion avatar WebGL error: ${error}`);
      return changed;
    }

    function animate(time) {
      animationFrame = 0;
      const deltaTime = lastFrameTime ? (time - lastFrameTime) / 1000 : 1 / 60;
      if (time - lastFrameTime >= 66) {
        lastFrameTime = time;
        draw(deltaTime, true);
      }
      animationFrame = requestAnimationFrame(animate);
    }

    function requestAnimation() {
      if (!animationFrame) animationFrame = requestAnimationFrame(animate);
    }

    return {
      updateAppearance(appearance) {
        mesh = createMesh(appearance, "soft-doll");
        posed = new Float32Array(mesh.positions.length);
        count = mesh.positions.length / 3;
        for (const [buffer, data, attribute] of [
          [position, mesh.positions, positionAttribute],
          [color, mesh.colors, colorAttribute],
        ]) {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(attribute);
          gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
        }
        draw(1 / 60, true);
        requestAnimation();
      },
      setMotion(metrics, motions) {
        targetPose = globalThis.MoneycraftMotionSensing.createAvatarPose(metrics, motions);
        targetHeight = motions.squat ? 0.78 : 1;
        targetOffset = motions.jump ? 0.18 : 0;
        targetX = globalThis.MoneycraftMotionSensing.getAvatarHorizontalOffset(metrics);
        targetTilt = globalThis.MoneycraftMotionSensing.getAvatarBodyTilt(metrics);
        requestAnimation();
      },
      reset() {
        targetPose = Array.from({ length: 6 }, () => [0, 0, 0]);
        targetHeight = 1;
        targetOffset = 0;
        targetX = 0;
        targetTilt = 0;
        requestAnimation();
      },
      redraw() {
        draw(1 / 60, true);
      },
    };
  }

  function loadAppearance() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return { appearance: { ...defaults }, saved: false };
      const value = JSON.parse(raw);
      if (!isAppearance(value)) throw new Error("Invalid saved avatar prototype.");
      return { appearance: value, saved: true };
    } catch (error) {
      console.error("Saved avatar appearance could not be loaded for motion test.", error);
      return { appearance: { ...defaults }, saved: false, error };
    }
  }

  globalThis.MoneycraftMotionAvatar = Object.freeze({ createRenderer, loadAppearance });
})();
