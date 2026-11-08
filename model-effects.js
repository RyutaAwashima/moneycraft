"use strict";

(() => {
  const silhouette = globalThis.MoneycraftSilhouetteEffect;
  if (!silhouette) throw new Error("Model effects require MoneycraftSilhouetteEffect.");
  const defaults = Object.freeze({
    ...silhouette.defaults,
    particlesEnabled: true, particleColor: "#030206", particleRimColor: "#63387d", particleOpacity: 1,
  });
  const presets = Object.freeze(Object.fromEntries(Object.entries(silhouette.presets).map(([key, colors]) =>
    [key, Object.freeze({ ...colors,
      particleColor: key === "dark" ? defaults.particleColor : colors.outlineColor,
      particleRimColor: key === "dark" ? defaults.particleRimColor : colors.glowColor,
    })])));
  function validate(settings) {
    silhouette.validate(settings);
    if (typeof settings.particlesEnabled !== "boolean") throw new Error("Invalid effects particlesEnabled.");
    for (const key of ["particleColor", "particleRimColor"]) {
      if (typeof settings[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(settings[key])) {
        throw new Error(`Invalid effects ${key}.`);
      }
    }
    if (!Number.isFinite(settings.particleOpacity) || settings.particleOpacity < 0 || settings.particleOpacity > 1) {
      throw new Error("Invalid effects particleOpacity.");
    }
  }
  function validateMesh(mesh) {
    const positions = mesh?.positions;
    if ((!Array.isArray(positions) && !(positions instanceof Float32Array))
      || positions.length === 0 || positions.length % 9 !== 0 || !positions.every(Number.isFinite)) {
      throw new Error("Effects require finite, non-indexed XYZ triangles.");
    }
  }
  function createEmitters(mesh, count = 320, selectTriangle = () => true) {
    validateMesh(mesh);
    if (!Number.isInteger(count) || count < 1 || count > 4096 || typeof selectTriangle !== "function") {
      throw new Error("Invalid effects emitter count or selector.");
    }
    const triangles = [];
    let totalArea = 0;
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 3) {
      if (!selectTriangle(vertex, mesh)) continue;
      const points = [0, 1, 2].map((offset) => Array.from(
        mesh.positions.slice((vertex + offset) * 3, (vertex + offset + 1) * 3)));
      const a = points[1].map((value, axis) => value - points[0][axis]);
      const b = points[2].map((value, axis) => value - points[0][axis]);
      const area = Math.hypot(a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
      if (area === 0) continue;
      totalArea += area;
      triangles.push({ vertex, cumulativeArea: totalArea });
    }
    if (!Number.isFinite(totalArea) || totalArea <= 0) throw new Error("Effects have no valid emitting surface.");
    const fraction = (value) => value - Math.floor(value);
    return Array.from({ length: count }, (_, index) => {
      const triangle = triangles.find(({ cumulativeArea }) =>
        cumulativeArea >= fraction((index + 1) * 0.61803398875) * totalArea);
      const u = Math.sqrt(fraction((index + 1) * 0.754877666));
      const v = fraction((index + 1) * 0.569840291);
      return { vertex: triangle.vertex, weights: [1 - u, u * (1 - v), u * v],
        phase: fraction(index * 0.381966011), lifetime: 1.2 + fraction(index * 0.43) * 1.1 };
    });
  }
  function createParticles(mesh, emitters, seconds, sizeScale = 1) {
    validateMesh(mesh);
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(sizeScale) || sizeScale <= 0) {
      throw new Error("Invalid effects aura time or scale.");
    }
    if (!Array.isArray(emitters) || emitters.length > 4096) throw new Error("Invalid effects emitters.");
    return emitters.map((emitter, index) => {
      const { vertex, weights, phase, lifetime } = emitter || {};
      if (!Number.isInteger(vertex) || vertex < 0 || vertex % 3 !== 0
        || (vertex + 3) * 3 > mesh.positions.length
        || !Array.isArray(weights) || weights.length !== 3
        || !weights.every((weight) => Number.isFinite(weight) && weight >= 0 && weight <= 1)
        || Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-6
        || !Number.isFinite(phase) || phase < 0 || phase >= 1
        || !Number.isFinite(lifetime) || lifetime <= 0) {
        throw new Error("Invalid effects surface emitter; rebuild after topology changes.");
      }
      const age = (seconds / lifetime + phase) % 1;
      const origin = [0, 1, 2].map((axis) => weights.reduce((sum, weight, corner) =>
        sum + mesh.positions[(vertex + corner) * 3 + axis] * weight, 0));
      const particle = {
        origin,
        position: [origin[0] + Math.sin(age * 7 + index) * age * 0.1 * sizeScale,
          origin[1] + age * 0.7 * sizeScale,
          origin[2] + Math.cos(age * 6 + index) * age * 0.1 * sizeScale],
        size: (0.18 + (index % 5) * 0.025) * sizeScale * (1 - age * 0.7),
        opacity: Math.min(1, age * 8) * (1 - age) * 0.8,
        phase: age,
      };
      if (!particle.position.every(Number.isFinite) || !Number.isFinite(particle.size)) {
        throw new Error("Effects particle scale exceeds finite coordinates.");
      }
      return particle;
    });
  }
  const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  function createRenderer(gl) {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not create effects shader.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const detail = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(detail || "Effects shader compilation failed.");
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      attribute vec3 aData;
      uniform mat4 uViewProjection;
      uniform float uPointScale;
      uniform float uMaxPointSize;
      varying vec2 vData;
      void main() {
        gl_Position = uViewProjection * vec4(aPosition, 1.0);
        gl_PointSize = clamp(aData.x * uPointScale / max(0.0001, gl_Position.w), 1.0, uMaxPointSize);
        vData = aData.yz;
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec2 vData;
      uniform vec3 uColor;
      uniform vec3 uRimColor;
      uniform float uOpacity;
      void main() {
        vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
        float sway = sin(uv.y * 9.0 + vData.y * 8.0) * uv.y * 0.12;
        float width = (1.0 - uv.y) * 0.34;
        float edge = width - abs(uv.x - 0.5 - sway);
        float mask = smoothstep(0.0, 0.06, edge) * smoothstep(0.0, 0.12, uv.y);
        float rim = 1.0 - smoothstep(0.025, 0.09, edge);
        gl_FragColor = vec4(mix(uColor, uRimColor, rim), mask * vData.x * uOpacity);
      }
    `);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create effects program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Effects program linking failed.");
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    const position = gl.createBuffer();
    const data = gl.createBuffer();
    if (!position || !data) throw new Error("Could not create effects buffers.");
    const positionAttribute = gl.getAttribLocation(program, "aPosition");
    const dataAttribute = gl.getAttribLocation(program, "aData");
    const uniforms = Object.fromEntries(["uViewProjection", "uPointScale", "uMaxPointSize", "uColor", "uRimColor", "uOpacity"]
      .map((name) => [name, gl.getUniformLocation(program, name)]));
    const maxPointSize = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
    const outline = silhouette.createRenderer(gl);
    let disposed = false;
    return {
      draw({ width, height, pixelRatio = 1, settings = defaults, mesh, emitters,
        seconds = 0, sizeScale = 1, viewProjection, pixelsPerUnit, drawMask, drawOpaque }) {
        if (disposed) throw new Error("Effects renderer has been disposed.");
        validate(settings);
        if (![width, height].every((value) => Number.isInteger(value) && value > 0)
          || !Number.isFinite(pixelRatio) || pixelRatio <= 0
          || typeof drawMask !== "function" || typeof drawOpaque !== "function") {
          throw new Error("Invalid effects render target or callbacks.");
        }
        let particles = [];
        if (settings.particlesEnabled) {
          if (!viewProjection || viewProjection.length !== 16
            || !Array.from(viewProjection).every(Number.isFinite)
            || !Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) {
            throw new Error("Invalid effects projection or point scale.");
          }
          particles = createParticles(mesh, emitters, seconds, sizeScale);
          const depth = ({ position: [x, y, z] }) => {
            const m = viewProjection;
            const w = m[3] * x + m[7] * y + m[11] * z + m[15];
            return (m[2] * x + m[6] * y + m[10] * z + m[14]) / (w || 1);
          };
          particles.sort((a, b) => depth(b) - depth(a));
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        outline.draw(width, height, pixelRatio, settings, drawMask);
        drawOpaque();
        if (particles.length) {
          gl.useProgram(program);
          gl.uniformMatrix4fv(uniforms.uViewProjection, false, new Float32Array(viewProjection));
          gl.uniform1f(uniforms.uPointScale, pixelsPerUnit);
          gl.uniform1f(uniforms.uMaxPointSize, maxPointSize);
          gl.uniform3f(uniforms.uColor, ...rgb(settings.particleColor));
          gl.uniform3f(uniforms.uRimColor, ...rgb(settings.particleRimColor));
          gl.uniform1f(uniforms.uOpacity, settings.particleOpacity);
          gl.bindBuffer(gl.ARRAY_BUFFER, position);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particles.flatMap(({ position }) => position)), gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(positionAttribute);
          gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, data);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particles.flatMap(({ size, opacity, phase }) =>
            [size, opacity, phase])), gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(dataAttribute);
          gl.vertexAttribPointer(dataAttribute, 3, gl.FLOAT, false, 0, 0);
          gl.enable(gl.DEPTH_TEST);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.depthMask(false);
          try {
            gl.drawArrays(gl.POINTS, 0, particles.length);
          } finally {
            gl.depthMask(true);
            gl.disable(gl.BLEND);
          }
        }
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`Effects WebGL error ${error}.`);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        outline.dispose();
        gl.deleteBuffer(position);
        gl.deleteBuffer(data);
        gl.deleteProgram(program);
      },
    };
  }
  globalThis.MoneycraftModelEffects = Object.freeze({ defaults, presets, validate, createEmitters, createParticles, createRenderer });
})();
