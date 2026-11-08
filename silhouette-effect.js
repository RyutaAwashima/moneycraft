"use strict";

(() => {
  const defaults = Object.freeze({
    outlineEnabled: true, outlineColor: "#08050d", outlineWidth: 2, outlineOpacity: 0.9,
    glowEnabled: true, glowColor: "#69418c", glowRadius: 18, glowStrength: 0.8,
  });
  const presets = Object.freeze({
    dark: Object.freeze({ outlineColor: "#08050d", glowColor: "#69418c" }),
    fire: Object.freeze({ outlineColor: "#c43c12", glowColor: "#ff9b25" }),
    lightning: Object.freeze({ outlineColor: "#e7faff", glowColor: "#53cfff" }),
    ice: Object.freeze({ outlineColor: "#7fbddf", glowColor: "#a9edff" }),
  });
  function validate(settings) {
    for (const key of ["outlineEnabled", "glowEnabled"]) {
      if (typeof settings?.[key] !== "boolean") throw new Error(`Invalid silhouette ${key}.`);
    }
    for (const key of ["outlineColor", "glowColor"]) {
      if (!/^#[0-9a-f]{6}$/i.test(settings[key])) throw new Error(`Invalid silhouette ${key}.`);
    }
    for (const [key, min, max] of [
      ["outlineWidth", 1, 8], ["outlineOpacity", 0, 1], ["glowRadius", 1, 40], ["glowStrength", 0, 1],
    ]) {
      if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) {
        throw new Error(`Invalid silhouette ${key}.`);
      }
    }
  }
  const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);

  // The callback draws only the target silhouette; the caller restores its program and attributes.
  function createRenderer(gl) {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not create silhouette shader.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const detail = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(detail || "Silhouette shader compilation failed.");
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec2 aPosition;
      varying vec2 vUV;
      void main() {
        vUV = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec2 vUV;
      uniform sampler2D uMask;
      uniform vec2 uPixel;
      uniform vec2 uRadius;
      uniform vec4 uOutline;
      uniform vec4 uGlow;
      float mask(vec2 uv) {
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
        return texture2D(uMask, uv).a;
      }
      void main() {
        float inside = mask(vUV);
        if (inside > 0.99) { gl_FragColor = vec4(0.0); return; }
        float outline = 0.0;
        float glow = 0.0;
        float total = 0.0;
        for (int direction = 0; direction < 12; direction++) {
          float angle = float(direction) * 0.523598776;
          vec2 ray = vec2(cos(angle), sin(angle)) * uPixel;
          for (int ring = 1; ring <= 3; ring++) {
            outline = max(outline, mask(vUV + ray * uRadius.x * float(ring) / 3.0));
          }
          for (int ring = 1; ring <= 6; ring++) {
            float distance = float(ring) / 6.0;
            float weight = exp(-distance * distance * 3.0);
            glow += mask(vUV + ray * uRadius.y * distance) * weight;
            total += weight;
          }
        }
        float outlineAlpha = outline * uOutline.a * (1.0 - inside);
        float glowAlpha = glow / total * uGlow.a * (1.0 - inside);
        float alpha = outlineAlpha + glowAlpha * (1.0 - outlineAlpha);
        vec3 premultiplied = uOutline.rgb * outlineAlpha
          + uGlow.rgb * glowAlpha * (1.0 - outlineAlpha);
        gl_FragColor = vec4(premultiplied, alpha);
      }
    `);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create silhouette program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Silhouette program linking failed.");
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    const framebuffer = gl.createFramebuffer();
    const texture = gl.createTexture();
    const depth = gl.createRenderbuffer();
    const quad = gl.createBuffer();
    if (!framebuffer || !texture || !depth || !quad) throw new Error("Could not create silhouette buffers.");
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const position = gl.getAttribLocation(program, "aPosition");
    const uniforms = Object.fromEntries(["uMask", "uPixel", "uRadius", "uOutline", "uGlow"]
      .map((name) => [name, gl.getUniformLocation(program, name)]));
    let width = 0;
    let height = 0;
    return {
      draw(w, h, pixelRatio, settings, drawMask) {
        validate(settings);
        if (![w, h].every((value) => Number.isInteger(value) && value > 0)
          || !Number.isFinite(pixelRatio) || pixelRatio <= 0 || typeof drawMask !== "function") {
          throw new Error("Invalid silhouette render target.");
        }
        if (!settings.outlineEnabled && !settings.glowEnabled) return;
        gl.viewport(0, 0, w, h);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        if (width !== w || height !== h) {
          width = w;
          height = h;
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
          gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
          gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            throw new Error("Silhouette framebuffer is incomplete.");
          }
        }
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        try {
          drawMask();
        } finally {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uniforms.uMask, 0);
        gl.uniform2f(uniforms.uPixel, pixelRatio / w, pixelRatio / h);
        gl.uniform2f(uniforms.uRadius, settings.outlineWidth, settings.glowRadius);
        gl.uniform4f(uniforms.uOutline, ...rgb(settings.outlineColor),
          settings.outlineEnabled ? settings.outlineOpacity : 0);
        gl.uniform4f(uniforms.uGlow, ...rgb(settings.glowColor),
          settings.glowEnabled ? settings.glowStrength : 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disable(gl.BLEND);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
      },
      dispose() {
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        gl.deleteRenderbuffer(depth);
        gl.deleteBuffer(quad);
        gl.deleteProgram(program);
      },
    };
  }
  globalThis.MoneycraftSilhouetteEffect = Object.freeze({ defaults, presets, validate, createRenderer });
})();
