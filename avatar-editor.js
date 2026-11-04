"use strict";

(() => {
  const { options, defaults, storageKey, isAppearance, createMesh, motions, styles, createPose, posePositions } = globalThis.MoneycraftAvatar;
  const canvas = document.querySelector("#avatar-preview");
  const status = document.querySelector("#avatar-status");
  const dirty = document.querySelector("#avatar-dirty");
  const saveButton = document.querySelector("#avatar-save");
  const controls = document.querySelector("#avatar-controls");
  const fields = [
    ["skin", "肌の色"], ["hair", "髪型"], ["hairColor", "髪の色"],
    ["outfit", "服のかたち"], ["top", "トップスの色"], ["bottom", "ボトムスの色"],
    ["shoes", "くつの色"], ["accessory", "装飾（ひとつ）"], ["accent", "模様・装飾の色"],
  ];
  const viewInputs = ["yaw", "pitch", "zoom"].map((key) => document.querySelector(`#avatar-${key}`));
  const choices = new Map();
  let saved = null;
  let draft = { ...defaults };
  let renderer = null;
  let previewFailed = false;
  let storageFailed = false;
  let drag = null;
  let pendingFrame = false;
  let motion = "still";
  let motionTime = 0;
  let motionPlaying = false;
  let lastMotionFrame = null;
  let style = "voxel";
  const pauseMotion = document.querySelector("#avatar-motion-pause");
  const motionStatus = document.querySelector("#avatar-motion-status");
  const motionNames = { still: "静止", walk: "歩行", wave: "手を振る", look: "見回す" };

  function updateMotionControls() {
    for (const id of motions) {
      const button = document.querySelector(`#avatar-motion-${id}`);
      button.setAttribute("aria-pressed", String(motion === id));
      button.disabled = previewFailed;
    }
    pauseMotion.disabled = previewFailed || motion === "still";
    pauseMotion.textContent = motionPlaying ? "一時停止" : "再生";
    motionStatus.textContent = previewFailed ? "3Dプレビューを利用できません"
      : motion === "still" ? "静止中" : `${motionNames[motion]} · ${motionPlaying ? "再生中" : "一時停止中"}`;
  }

  function setMotion(id) {
    motion = id;
    motionTime = 0;
    lastMotionFrame = null;
    motionPlaying = id !== "still" && !document.hidden;
    updateMotionControls();
    requestRender();
  }

  function report(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function reportPreviewFailure(error) {
    console.error("Avatar preview could not be rendered.", error);
    previewFailed = true;
    motionPlaying = false;
    updateMotionControls();
    canvas.setAttribute("aria-label", "3Dプレビューを表示できません。見た目の選択と保存は利用できます。");
    report("3Dプレビューを表示できません。WebGLを確認してページを再読み込みしてください。選択と保存は利用できます。", true);
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return;
      const value = JSON.parse(raw);
      if (!isAppearance(value)) throw new Error("Invalid saved avatar prototype.");
      saved = { ...value };
      draft = { ...value };
      report("このブラウザーに保存した姿を読み込みました。");
    } catch (error) {
      console.error("Avatar prototype could not be loaded.", error);
      storageFailed = true;
      report("保存した姿を読み込めませんでした。初期の組合せを表示しています。元の保存データは変更していません。", true);
    }
  }

  function updateControls() {
    for (const [key, buttons] of choices) for (const [id, button] of buttons) {
      button.setAttribute("aria-pressed", String(draft[key] === id));
    }
    const changed = !saved || Object.keys(defaults).some((key) => saved[key] !== draft[key]);
    dirty.textContent = !saved ? "未保存の試作" : changed ? "保存していない変更があります" : "保存した姿と同じです";
    saveButton.disabled = !changed;
    const canUseAccent = draft.outfit !== "plain" || ["cap", "scarf"].includes(draft.accessory);
    for (const button of choices.get("accent").values()) button.disabled = !canUseAccent;
    for (const button of choices.get("hairColor").values()) button.disabled = draft.hair === "none";
  }

  function requestRender() {
    if (pendingFrame || previewFailed || !renderer || document.hidden) return;
    pendingFrame = true;
    window.requestAnimationFrame((time) => {
      pendingFrame = false;
      if (previewFailed || document.hidden) return;
      try {
        if (motionPlaying) {
          if (lastMotionFrame !== null) motionTime += Math.max(0, Math.min(0.1, (time - lastMotionFrame) / 1000));
          lastMotionFrame = time;
        }
        renderer.draw(...viewInputs.map((input) => Number(input.value)), motion, motionTime);
        if (motionPlaying) requestRender();
      } catch (error) {
        reportPreviewFailure(error);
      }
    });
  }

  function updateAppearance(message) {
    updateControls();
    updateMotionControls();
    if (!previewFailed) {
      try {
        renderer?.update(draft, style);
      } catch (error) {
        reportPreviewFailure(error);
      }
    }
    if (!previewFailed && !storageFailed) report(message);
    requestRender();
  }

  function buildControls() {
    for (const [key, label] of fields) {
      const field = document.createElement("fieldset");
      field.className = "avatar-field";
      const legend = document.createElement("legend");
      legend.textContent = label;
      const group = document.createElement("div");
      group.className = "avatar-choices";
      const buttons = new Map();
      for (const option of options[key]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "avatar-choice";
        button.dataset.field = key;
        button.dataset.value = option.id;
        button.setAttribute("aria-label", `${label}：${option.label}`);
        if (option.color) {
          const swatch = document.createElement("span");
          swatch.className = "avatar-swatch";
          swatch.style.backgroundColor = option.color;
          swatch.setAttribute("aria-hidden", "true");
          button.append(swatch);
        }
        const name = document.createElement("span");
        name.textContent = option.label;
        button.append(name);
        button.addEventListener("click", () => {
          draft[key] = option.id;
          updateAppearance(`${label}を「${option.label}」に変更しました。まだ保存されていません。`);
        });
        group.append(button);
        buttons.set(option.id, button);
      }
      choices.set(key, buttons);
      field.append(legend, group);
      controls.append(field);
    }
  }

  function updateView() {
    for (const [index, key] of ["yaw", "pitch", "zoom"].entries()) {
      document.querySelector(`#avatar-${key}-value`).textContent =
        `${viewInputs[index].value}${key === "zoom" ? "%" : "°"}`;
    }
    requestRender();
  }

  loadSaved();
  buildControls();
  updateControls();
  try {
    renderer = createRenderer(canvas);
    renderer.update(draft, style);
    requestRender();
  } catch (error) {
    reportPreviewFailure(error);
  }

  for (const id of styles) {
    document.querySelector(`#avatar-style-${id}`).addEventListener("click", () => {
      style = id;
      for (const item of styles) {
        document.querySelector(`#avatar-style-${item}`).setAttribute("aria-pressed", String(item === style));
      }
      updateAppearance(`${style === "voxel" ? "ボクセル風" : "ソフトドール風"}で比較しています。外観の選択と保存データは変わりません。`);
    });
  }

  for (const id of motions) {
    document.querySelector(`#avatar-motion-${id}`).addEventListener("click", () => setMotion(id));
  }
  document.querySelector("#avatar-motion-reset").addEventListener("click", () => setMotion("still"));
  pauseMotion.addEventListener("click", () => {
    if (motion === "still" || previewFailed) return;
    motionPlaying = !motionPlaying;
    lastMotionFrame = null;
    updateMotionControls();
    requestRender();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      drag = null;
      motionPlaying = false;
      lastMotionFrame = null;
      updateMotionControls();
    } else requestRender();
  });

  saveButton.addEventListener("click", () => {
    try {
      if (!isAppearance(draft)) throw new Error("Invalid avatar draft.");
      localStorage.setItem(storageKey, JSON.stringify(draft));
      saved = { ...draft };
      storageFailed = false;
      updateControls();
      report(previewFailed
        ? "この姿を保存しました。ただし3Dプレビューは利用できません。ページを再読み込みしてください。"
        : "この姿を保存しました。ゲームへ戻ると三人称で確認でき、共同建築の参加者へソフトドール風で表示されます。", previewFailed);
    } catch (error) {
      console.error("Avatar prototype could not be saved.", error);
      storageFailed = true;
      report("保存できませんでした。編集中の姿はこの画面に残っています。ブラウザーの保存設定を確認してください。", true);
    }
  });
  document.querySelector("#avatar-discard").addEventListener("click", () => {
    draft = { ...(saved || defaults) };
    updateAppearance(saved ? "未保存の変更を取り消し、保存した姿に戻しました。"
      : "保存済みの姿がないため、初期の組合せに戻しました。");
  });
  document.querySelector("#avatar-defaults").addEventListener("click", () => {
    draft = { ...defaults };
    updateAppearance("初期の組合せに戻しました。保存するまでは、以前の保存データは変わりません。");
  });
  viewInputs.forEach((input) => input.addEventListener("input", updateView));
  document.querySelector("#avatar-front").addEventListener("click", () => {
    [0, 0, 100].forEach((value, index) => { viewInputs[index].value = String(value); });
    updateView();
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (drag || (event.pointerType === "mouse" && event.button !== 0)) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    const yaw = Number(viewInputs[0].value) + (event.clientX - drag.x) * 0.6;
    viewInputs[0].value = String(Math.round(((yaw + 180) % 360 + 360) % 360 - 180));
    viewInputs[1].value = String(Math.round(Math.max(-20, Math.min(35,
      Number(viewInputs[1].value) + (event.clientY - drag.y) * 0.3))));
    drag.x = event.clientX;
    drag.y = event.clientY;
    updateView();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, (event) => { if (drag?.id === event.pointerId) drag = null; });
  }
  window.addEventListener("blur", () => { drag = null; });
  window.addEventListener("resize", requestRender);
  window.addEventListener("beforeunload", (event) => {
    if (saved ? Object.keys(defaults).some((key) => saved[key] !== draft[key])
      : Object.keys(defaults).some((key) => defaults[key] !== draft[key])) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    reportPreviewFailure(new Error("Avatar WebGL context lost."));
  });

  function createRenderer(target) {
    const gl = target.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) throw new Error("WebGL is unavailable.");
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not create avatar shader.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const detail = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(detail || "Avatar shader compilation failed.");
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      uniform vec4 uView;
      uniform vec2 uScale;
      varying vec3 vColor;
      void main() {
        vec3 p = aPosition - vec3(0.0, 0.9, 0.0);
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
    if (!program) throw new Error("Could not create avatar program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Avatar program linking failed.");
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    const position = gl.createBuffer();
    const color = gl.createBuffer();
    if (!position || !color) throw new Error("Could not create avatar buffers.");
    const positionAttribute = gl.getAttribLocation(program, "aPosition");
    const colorAttribute = gl.getAttribLocation(program, "aColor");
    const view = gl.getUniformLocation(program, "uView");
    const scale = gl.getUniformLocation(program, "uScale");
    let count = 0;
    let mesh;
    let posed;
    let previousPose = "";
    return {
      update(appearance, style) {
        mesh = createMesh(appearance, style);
        posed = new Float32Array(mesh.positions.length);
        previousPose = "";
        count = mesh.positions.length / 3;
        for (const [buffer, data, attribute] of [
          [position, mesh.positions, positionAttribute], [color, mesh.colors, colorAttribute],
        ]) {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(attribute);
          gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
        }
      },
      draw(yaw, pitch, zoom, motion, seconds) {
        const poseKey = `${motion}:${seconds}`;
        if (previousPose !== poseKey) {
          posePositions(mesh, createPose(motion, seconds), posed);
          gl.bindBuffer(gl.ARRAY_BUFFER, position);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, posed);
          previousPose = poseKey;
        }
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(target.clientWidth * ratio));
        const height = Math.max(1, Math.round(target.clientHeight * ratio));
        if (target.width !== width || target.height !== height) {
          target.width = width;
          target.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const y = yaw * Math.PI / 180;
        const p = pitch * Math.PI / 180;
        gl.uniform4f(view, Math.cos(y), Math.sin(y), Math.cos(p), Math.sin(p));
        const size = zoom / 100 * 0.8;
        gl.uniform2f(scale, size / Math.max(1, width / height), size / Math.max(1, height / width));
        gl.drawArrays(gl.TRIANGLES, 0, count);
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`Avatar WebGL error: ${error}`);
      },
    };
  }
})();
