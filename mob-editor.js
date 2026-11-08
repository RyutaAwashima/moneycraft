"use strict";

(() => {
  const { defaults, options, palettes, isDefinition, randomDefinition, normalizeDefinition, stageScale, createMesh,
    createAuraEmitters } = globalThis.MoneycraftMob;
  const canvas = document.querySelector("#mob-preview");
  const controls = document.querySelector("#mob-controls");
  const status = document.querySelector("#mob-status");
  const jsonOutput = document.querySelector("#mob-json");
  const importInput = document.querySelector("#mob-import");
  const sizeControls = document.querySelector("#mob-size-controls");
  const animationToggle = document.querySelector("#mob-animation-toggle");
  const animationRoar = document.querySelector("#mob-animation-roar");
  const animationBreath = document.querySelector("#mob-animation-breath");
  const animationStomp = document.querySelector("#mob-animation-stomp");
  const animationTailSweep = document.querySelector("#mob-animation-tail-sweep");
  const combatAnimations = {
    breath: { label: "ブレス姿勢", duration: 3, button: animationBreath },
    stomp: { label: "踏みつけ", duration: 3, button: animationStomp },
    "tail-sweep": { label: "尻尾薙ぎ払い", duration: 3, button: animationTailSweep },
    "wing-retreat-land": { label: "翼で後退・着地", duration: 3, hold: true, wings: true,
      button: document.querySelector("#mob-animation-wing-land") },
    "wing-retreat-hover": { label: "翼で後退・滞空", duration: 3, wings: true,
      button: document.querySelector("#mob-animation-wing-hover") },
    hover: { label: "滞空", duration: 1.5, loop: true, wings: true },
    "aerial-charge": { label: "空中突進・着地", duration: 3.6, hold: true, wings: true,
      button: document.querySelector("#mob-animation-aerial-charge") },
  };
  const animationReset = document.querySelector("#mob-animation-reset");
  const viewInputs = ["yaw", "pitch", "zoom"].map((key) => document.querySelector(`#mob-${key}`));
  const effects = globalThis.MoneycraftModelEffects;
  const effectSettings = { ...effects.defaults };
  const effectInputs = [...document.querySelectorAll("[data-effect]")];
  const effectPreset = document.querySelector("#mob-effect-preset");
  const fields = [
    ["stance", "基本の姿勢"], ["faceType", "顔の系統"],
    ["headShape", "頭の形"], ["snout", "鼻先"], ["jaw", "あご"],
    ["jawPose", "あごの開き"], ["teeth", "歯・牙"], ["eyes", "目"], ["eyeColor", "目の色"],
    ["horns", "角"], ["griffinBeak", "くちばし"], ["griffinFeathers", "羽毛"],
    ["lionMuzzle", "口先"], ["lionMane", "たてがみ"], ["lionFangs", "牙"], ["lionEars", "耳"],
    ["horseMane", "たてがみ"], ["horseEars", "耳"],
    ["creatureMouth", "口の形"], ["creatureSenses", "感覚器"],
    ["bodyShape", "胴体"], ["neckShape", "首"], ["backSpines", "背中のとげ・ひれ"],
    ["limbs", "脚・腕"], ["tail", "尾"], ["wings", "翼"],
    ["body", "体の色"], ["belly", "おなかの色"], ["accent", "模様・パーツの色"],
  ];
  const faceFieldGroups = {
    dragon: new Set(["headShape", "snout", "jaw", "jawPose", "teeth", "eyes", "eyeColor", "horns"]),
    griffin: new Set(["griffinBeak", "griffinFeathers", "eyeColor"]),
    lion: new Set(["lionMuzzle", "lionMane", "lionFangs", "lionEars", "eyeColor"]),
    horse: new Set(["horseMane", "horseEars", "eyeColor"]),
    creature: new Set(["creatureMouth", "creatureSenses", "eyeColor"]),
  };
  const sizeFields = [
    ["bodyLength", "胴の長さ"], ["headScale", "頭の大きさ"],
    ["neckLength", "首の長さ"], ["tailLength", "尾の長さ"],
  ];
  const choices = new Map();
  const choiceFields = new Map();
  const sizeInputs = new Map();
  let draft = { ...defaults };
  let previewStage = "pet";
  let auraFrame = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let renderer = null;
  let previewFailed = false;
  let drag = null;
  let animationPlaying = false;
  let animationPoseActive = false;
  let animationPhase = 0;
  let animationMode = "walk";
  let pendingAerialCharge = false;
  let startHoverPhase = 0;
  let animationFrame = null;
  let previousFrameTime = null;

  function report(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function reportPreviewFailure(error) {
    if (auraFrame !== null) window.cancelAnimationFrame(auraFrame);
    auraFrame = null;
    console.error("Mob preview could not be rendered.", error);
    stopAnimation();
    previewFailed = true;
    canvas.setAttribute("aria-label", "3Dプレビューを表示できません。選択と定義データの出力は利用できます。");
    report("3Dプレビューを表示できません。WebGLを確認してページを再読み込みしてください。選択と定義データは利用できます。", true);
  }

  function updateControls() {
    for (const [key, buttons] of choices) for (const [id, button] of buttons) {
      button.setAttribute("aria-pressed", String(draft[key] === id));
    }
    for (const [key, field] of choiceFields) {
      const faceSpecific = Object.values(faceFieldGroups).some((fieldsForFace) => fieldsForFace.has(key));
      field.hidden = faceSpecific && !faceFieldGroups[draft.faceType]?.has(key);
    }
    for (const [key, input] of sizeInputs) {
      input.value = String(draft[key]);
      input.nextElementSibling.textContent = `${draft[key]}%`;
    }
    jsonOutput.value = `${JSON.stringify(draft, null, 2)}\n`;
    for (const button of document.querySelectorAll("[data-stage]")) {
      if (button.tagName === "BUTTON") button.setAttribute("aria-pressed", String(button.dataset.stage === previewStage));
    }
    canvas.parentElement.dataset.stage = previewStage;
    const multiplier = stageScale(draft, previewStage);
    document.querySelector("#mob-scale-info").textContent =
      `隣のアバターは約1.73ブロック高。同じ尺度で比較しています。${previewStage === "enemy"
        ? `敵：成体の${multiplier.toFixed(1)}倍、足1本の接地面積1.5ブロック分。`
        : previewStage === "baby" ? "赤ちゃん：体50%・頭部70%・目85%。" : "ペット：基準サイズ。"} 状態切替はプレビュー専用です。`;
  }

  function render() {
    if (previewFailed || !renderer) return;
    try {
      renderer.draw(...viewInputs.map((input) => Number(input.value)));
    } catch (error) {
      reportPreviewFailure(error);
    }
  }

  function updateAuraAnimation() {
    if (auraFrame !== null) window.cancelAnimationFrame(auraFrame);
    auraFrame = null;
    if (previewStage !== "enemy" || !effectSettings.particlesEnabled || reducedMotion.matches || document.hidden || previewFailed) return;
    const tick = () => {
      auraFrame = null;
      if (!animationPlaying) render();
      if (!previewFailed && !document.hidden && previewStage === "enemy" && effectSettings.particlesEnabled) {
        auraFrame = window.requestAnimationFrame(tick);
      }
    };
    auraFrame = window.requestAnimationFrame(tick);
  }

  function animate(timestamp) {
    animationFrame = null;
    if (!animationPlaying || document.hidden || previewFailed || !renderer) return;
    const combat = combatAnimations[animationMode];
    if (previousFrameTime !== null) {
      const nextPhase = animationPhase + Math.min(timestamp - previousFrameTime, 50) / 1000
        * (combat ? 1 / combat.duration : animationMode === "roar" ? 0.38 : 0.8);
      animationPhase = combat && !combat.loop ? Math.min(1, nextPhase) : nextPhase % 1;
    }
    previousFrameTime = timestamp;
    try {
      renderer.pose(animationPhase, animationMode);
      renderer.draw(...viewInputs.map((input) => Number(input.value)));
      if (animationMode === "hover" && reducedMotion.matches) {
        stopAnimation();
        report("滞空姿勢を静止表示しています（動きを減らす設定）。");
        return;
      }
      if (combat && !combat.loop && animationPhase === 1) {
        if (animationMode === "wing-retreat-hover") {
          animationMode = pendingAerialCharge ? "aerial-charge" : "hover";
          pendingAerialCharge = false;
          startHoverPhase = 0;
          animationPhase = 0;
          updateAnimationControls();
          report(animationMode === "hover" ? "滞空中です。羽ばたきながら地面を見ています。"
            : "空中でタメて突進します（攻撃エフェクト・当たり判定なし）。");
          animationFrame = window.requestAnimationFrame(animate);
          return;
        }
        animationPoseActive = Boolean(combat.hold);
        stopAnimation();
        if (!previewFailed) report(combat.hold
          ? `${combat.label}の確認が完了しました。着地先の姿勢を保持しています。`
          : `${combat.label}の確認が完了しました。`);
        return;
      }
      animationFrame = window.requestAnimationFrame(animate);
    } catch (error) {
      reportPreviewFailure(error);
    }
  }

  function stopAnimation() {
    animationPlaying = false;
    previousFrameTime = null;
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    updateAnimationControls();
  }

  function updateAnimationControls() {
    const holding = animationPoseActive && animationPhase === 1 && combatAnimations[animationMode]?.hold;
    animationToggle.disabled = Boolean(holding);
    animationToggle.setAttribute("aria-pressed", String(animationPlaying));
    animationToggle.textContent = animationPlaying
      ? "一時停止"
      : holding ? (animationMode === "aerial-charge" ? "着地先の姿勢を保持中" : "後退先の姿勢を保持中")
        : animationPoseActive ? (combatAnimations[animationMode] ? `${combatAnimations[animationMode].label}を再開` : animationMode === "roar"
        ? (draft.faceType === "dragon" ? "威嚇を再開" : "顔の動きを再開")
        : "歩行を再開") : "歩行をためす";
    animationRoar.setAttribute("aria-pressed", String(animationMode === "roar" && animationPoseActive));
    animationRoar.textContent = animationPlaying && animationMode === "roar"
      ? (draft.faceType === "dragon" ? "威嚇中" : "顔の動き中")
      : (draft.faceType === "dragon" ? "威嚇をためす" : "顔の動きをためす");
    for (const [mode, { button, wings }] of Object.entries(combatAnimations)) {
      if (!button) continue;
      button.disabled = previewStage !== "enemy" || previewFailed || (wings && draft.wings === "none");
      button.setAttribute("aria-pressed", String(animationPoseActive
        && (animationMode === mode || (mode === "wing-retreat-hover" && animationMode === "hover")
          || (mode === "aerial-charge" && pendingAerialCharge))));
    }
  }

  function startAnimation(mode = animationMode) {
    if (previewFailed || !renderer) return;
    if (combatAnimations[mode] && previewStage !== "enemy") {
      report("攻撃モーションは敵プレビューでのみ利用できます。", true);
      return;
    }
    if (combatAnimations[mode]?.wings && draft.wings === "none") {
      report("飛行モーションには翼のある造形が必要です。", true);
      return;
    }
    if (mode !== animationMode || !animationPoseActive) animationPhase = 0;
    if (mode !== "wing-retreat-hover") pendingAerialCharge = false;
    animationMode = mode;
    animationPlaying = true;
    animationPoseActive = true;
    previousFrameTime = null;
    updateAnimationControls();
    if (animationFrame === null && !document.hidden) {
      animationFrame = window.requestAnimationFrame(animate);
    }
  }

  function updateDefinition(message) {
    if (combatAnimations[animationMode]?.wings && draft.wings === "none") {
      stopAnimation();
      animationMode = "walk";
      animationPhase = 0;
      animationPoseActive = false;
      pendingAerialCharge = false;
    }
    updateControls();
    updateAnimationControls();
    if (!previewFailed) {
      try {
        renderer?.update(draft);
        if (animationPoseActive) renderer?.pose(animationPhase, animationMode);
      } catch (error) {
        reportPreviewFailure(error);
      }
    }
    if (!previewFailed) report(message);
    render();
    updateAuraAnimation();
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
      for (const option of options[key] || palettes[key]) {
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
          updateDefinition(`${label}を「${option.label}」に変更しました。`);
        });
        group.append(button);
        buttons.set(option.id, button);
      }
      choices.set(key, buttons);
      choiceFields.set(key, field);
      field.append(legend, group);
      controls.append(field);
    }
    for (const [key, label] of sizeFields) {
      const field = document.createElement("fieldset");
      field.className = "mob-size-field avatar-field";
      const legend = document.createElement("legend");
      legend.textContent = label;
      const row = document.createElement("div");
      row.className = "mob-size-row";
      const input = document.createElement("input");
      input.type = "range";
      input.min = "60";
      input.max = "140";
      input.step = "10";
      input.value = String(defaults[key]);
      input.setAttribute("aria-label", label);
      const output = document.createElement("output");
      output.textContent = `${defaults[key]}%`;
      input.addEventListener("input", () => {
        draft[key] = Number(input.value);
        output.textContent = `${draft[key]}%`;
        updateDefinition(`${label}を${draft[key]}%にしました。`);
      });
      sizeInputs.set(key, input);
      row.append(input, output);
      field.append(legend, row);
      sizeControls.append(field);
    }
  }

  function updateView() {
    for (const [index, key] of ["yaw", "pitch", "zoom"].entries()) {
      document.querySelector(`#mob-${key}-value`).textContent =
        `${viewInputs[index].value}${key === "zoom" ? "%" : "°"}`;
    }
    render();
  }

  async function importDefinition(file) {
    if (!file) return;
    try {
      if (file.size > 16_384) throw new Error("Mob definition file is too large.");
      const value = JSON.parse(await file.text());
      draft = normalizeDefinition(value);
      if (!isDefinition(draft)) throw new Error("Invalid mob definition.");
      updateDefinition(value.version < defaults.version
        ? "旧形式のモブ定義を読み込み、新形式へ変換しました。"
        : "モブ定義を読み込みました。ゲームにはまだ接続されていません。");
    } catch (error) {
      console.error("Mob definition could not be imported.", error);
      report("読み込めませんでした。対応するMoneycraftモブ定義JSONか確認してください。編集中の内容は変更していません。", true);
    } finally {
      importInput.value = "";
    }
  }

  buildControls();
  updateControls();
  try {
    renderer = createRenderer(canvas);
    renderer.update(draft);
    render();
  } catch (error) {
    reportPreviewFailure(error);
  }

  for (const input of viewInputs) input.addEventListener("input", updateView);
  for (const input of effectInputs) input.addEventListener("input", () => {
    effectSettings[input.dataset.effect] = input.type === "checkbox" ? input.checked
      : input.type === "color" ? input.value : Number(input.value);
    if (input.type === "range") input.nextElementSibling.value = input.value;
    if (input.type === "color") effectPreset.value = "custom";
    render();
    updateAuraAnimation();
    if (!previewFailed) report("エフェクトを変更しました。モデルJSONには含まれません。");
  });
  effectPreset.addEventListener("change", () => {
    if (effectPreset.value === "custom") return;
    Object.assign(effectSettings, effects.presets[effectPreset.value]);
    for (const input of effectInputs) {
      if (input.type === "color") input.value = effectSettings[input.dataset.effect];
    }
    render();
    if (!previewFailed) report("輪郭線・グロー・粒子の属性配色を切り替えました。");
  });
  for (const button of document.querySelectorAll("button[data-stage]")) {
    button.addEventListener("click", () => {
      previewStage = button.dataset.stage;
      if (combatAnimations[animationMode] && previewStage !== "enemy") {
        stopAnimation();
        animationMode = "walk";
        animationPhase = 0;
        animationPoseActive = false;
        pendingAerialCharge = false;
      }
      updateDefinition("モブの状態プレビューを切り替えました。");
    });
  }
  document.querySelector("#mob-front").addEventListener("click", () => {
    [0, 0, 100].forEach((value, index) => { viewInputs[index].value = String(value); });
    updateView();
  });
  animationToggle.addEventListener("click", () => {
    if (animationPlaying) {
      stopAnimation();
      try {
        render();
        report("アニメーションを一時停止しました。");
      } catch (error) {
        reportPreviewFailure(error);
      }
    } else {
      startAnimation(animationPoseActive ? animationMode : "walk");
      if (animationPlaying) report(combatAnimations[animationMode]
        ? `${combatAnimations[animationMode].label}を再生しています（攻撃エフェクト・当たり判定なし）。` : animationMode === "roar"
        ? (draft.faceType === "dragon" ? "口を開いて威嚇する動きを再生しています。"
          : "顔を持ち上げる動きを再生しています。")
        : "四足歩行・翼ばたき・尾の動きを再生しています。");
    }
  });
  animationRoar.addEventListener("click", () => {
    startAnimation("roar");
    if (animationPlaying) report(draft.faceType === "dragon"
      ? "口を開いて威嚇する動きを再生しています。"
      : "顔を持ち上げる動きを再生しています。");
  });
  for (const [mode, { button, label }] of Object.entries(combatAnimations)) {
    if (!button) continue;
    button.addEventListener("click", () => {
      pendingAerialCharge = false;
      if (mode === "aerial-charge") {
        if (animationMode === "hover" && animationPoseActive) {
          startHoverPhase = animationPhase;
          startAnimation(mode);
        } else {
          animationPoseActive = false;
          startAnimation("wing-retreat-hover");
          pendingAerialCharge = animationPlaying;
          updateAnimationControls();
        }
        if (animationPlaying) report("滞空から空中突進・着地を再生します（攻撃エフェクト・当たり判定なし）。");
        return;
      }
      if (animationMode === mode) animationPoseActive = false;
      startAnimation(mode);
      if (animationPlaying) report(`${label}を再生しています（攻撃エフェクト・当たり判定なし）。`);
    });
  }
  animationReset.addEventListener("click", () => {
    stopAnimation();
    animationPhase = 0;
    animationMode = "walk";
    animationPoseActive = false;
    pendingAerialCharge = false;
    updateAnimationControls();
    try {
      renderer?.pose(null);
      render();
      report("静止姿勢に戻しました。");
    } catch (error) {
      reportPreviewFailure(error);
    }
  });
  document.querySelector("#mob-random").addEventListener("click", () => {
    try {
      draft = randomDefinition();
      const face = options.faceType.find(({ id }) => id === draft.faceType);
      updateDefinition(`「${face.label}」のモブをランダムに造形しました。`);
    } catch (error) {
      console.error("Mob definition could not be randomized.", error);
      report("ランダムな造形を作成できませんでした。もう一度お試しください。", true);
    }
  });
  document.querySelector("#mob-reset").addEventListener("click", () => {
    draft = { ...defaults };
    updateDefinition("初期状態に戻しました。");
  });
  document.querySelector("#mob-copy").addEventListener("click", async () => {
    try {
      if (!globalThis.navigator?.clipboard?.writeText) {
        jsonOutput.focus();
        jsonOutput.select();
        report("クリップボードを利用できません。JSONを選択しました。コピーしてください。");
        return;
      }
      await globalThis.navigator.clipboard.writeText(jsonOutput.value);
      report("モブ定義JSONをコピーしました。");
    } catch (error) {
      console.error("Mob definition could not be copied.", error);
      jsonOutput.focus();
      jsonOutput.select();
      report("自動コピーに失敗しました。選択したJSONをコピーしてください。", true);
    }
  });
  document.querySelector("#mob-download").addEventListener("click", () => {
    try {
      const file = new Blob([jsonOutput.value], { type: "application/json" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `moneycraft-mob-${draft.stance}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      report("モブ定義JSONを保存しました。");
    } catch (error) {
      console.error("Mob definition could not be downloaded.", error);
      report("JSONファイルを保存できませんでした。下の定義データをコピーしてください。", true);
    }
  });
  importInput.addEventListener("change", () => { void importDefinition(importInput.files?.[0]); });

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
  window.addEventListener("resize", render);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) renderer?.dispose();
  });
  document.addEventListener("visibilitychange", () => {
    updateAuraAnimation();
    if (document.hidden) {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      previousFrameTime = null;
    } else if (animationPlaying && animationFrame === null) {
      animationFrame = window.requestAnimationFrame(animate);
    }
  });
  reducedMotion.addEventListener("change", () => {
    updateAuraAnimation();
    render();
  });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    reportPreviewFailure(new Error("Mob WebGL context lost."));
  });

  function createRenderer(target) {
    const gl = target.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) throw new Error("WebGL is unavailable.");
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not create mob shader.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const detail = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(detail || "Mob shader compilation failed.");
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      uniform vec4 uView;
      uniform vec2 uScale;
      uniform vec3 uCenter;
      uniform float uDepthScale;
      varying vec3 vColor;
      void main() {
        vec3 p = aPosition - uCenter;
        float x = p.x * uView.x + p.z * uView.y;
        float z = -p.x * uView.y + p.z * uView.x;
        float y = p.y * uView.z - z * uView.w;
        float depth = p.y * uView.w + z * uView.z;
        gl_Position = vec4(x * uScale.x, y * uScale.y, -depth * uDepthScale, 1.0);
        vColor = aColor;
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec3 vColor;
      uniform bool uMask;
      void main() {
        gl_FragColor = uMask ? vec4(1.0) : vec4(vColor, 1.0);
      }
    `);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create mob program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Mob program linking failed.");
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    const position = gl.createBuffer();
    const color = gl.createBuffer();
    if (!position || !color) throw new Error("Could not create mob buffers.");
    const positionAttribute = gl.getAttribLocation(program, "aPosition");
    const colorAttribute = gl.getAttribLocation(program, "aColor");
    const view = gl.getUniformLocation(program, "uView");
    const scale = gl.getUniformLocation(program, "uScale");
    const centerUniform = gl.getUniformLocation(program, "uCenter");
    const depthScale = gl.getUniformLocation(program, "uDepthScale");
    const maskUniform = gl.getUniformLocation(program, "uMask");
    const effectsRenderer = effects.createRenderer(gl);
    let activeMob = null;
    let emitters = [];
    let auraScale = 1;
    let count = 0;
    let activeDefinition = null;
    let modelScale = 1;
    let modelCenter = [0, 0.82, 0];
    let referenceOffset = 0;
    const avatar = globalThis.MoneycraftAvatar;
    const reference = avatar.createMesh(avatar.defaults, "soft-doll");
    const previewMesh = (definition, phase = null, mode = "walk") => {
      const mob = createMesh(definition, phase, mode, previewStage, startHoverPhase);
      activeMob = mob;
      const positions = new Float32Array(mob.positions.length + reference.positions.length);
      positions.set(mob.positions);
      for (let index = 0; index < reference.positions.length; index += 1) {
        positions[mob.positions.length + index] = reference.positions[index] + (index % 3 === 0 ? referenceOffset : 0);
      }
      const colors = new Float32Array(mob.colors.length + reference.colors.length);
      colors.set(mob.colors);
      colors.set(reference.colors, mob.colors.length);
      return { positions, colors };
    };
    const uploadPositions = (data, usage) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, position);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      gl.enableVertexAttribArray(positionAttribute);
      gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
    };
    return {
      dispose() {
        effectsRenderer.dispose();
        gl.deleteBuffer(position);
        gl.deleteBuffer(color);
        gl.deleteProgram(program);
      },
      update(definition) {
        activeDefinition = definition;
        const mob = createMesh(definition, null, "walk", previewStage);
        emitters = previewStage === "enemy" ? createAuraEmitters(mob) : [];
        auraScale = stageScale(definition, previewStage);
        referenceOffset = Math.max(...mob.positions.filter((_, index) => index % 3 === 0)) + 0.85;
        const mesh = previewMesh(definition);
        count = mesh.positions.length / 3;
        let minX = 0;
        let maxX = 0;
        let height = 0;
        for (let index = 0; index < mesh.positions.length; index += 3) {
          minX = Math.min(minX, mesh.positions[index]);
          maxX = Math.max(maxX, mesh.positions[index]);
          height = Math.max(height, mesh.positions[index + 1]);
        }
        modelCenter = [(minX + maxX) / 2, height / 2, 0];
        let radius = 1;
        for (let index = 0; index < mesh.positions.length; index += 3) {
          radius = Math.max(radius, Math.hypot(mesh.positions[index] - modelCenter[0],
            mesh.positions[index + 1] - modelCenter[1], mesh.positions[index + 2]));
        }
        if (previewStage === "enemy" && definition.wings !== "none") {
          // Reserve the flight path without changing framing during an animation.
          for (const mode of ["wing-retreat-land", "wing-retreat-hover", "hover", "aerial-charge"]) {
            for (const phase of [0, 0.25, 0.4, 0.43, 0.5, 0.58, 0.7, 0.75, 0.78, 0.82, 0.9, 1]) {
              const flight = createMesh(definition, phase, mode, previewStage);
              for (let index = 0; index < flight.positions.length; index += 3) {
                radius = Math.max(radius, Math.hypot(flight.positions[index] - modelCenter[0],
                  flight.positions[index + 1] - modelCenter[1], flight.positions[index + 2]));
              }
            }
          }
        }
        modelScale = 0.9 / radius;
        uploadPositions(mesh.positions, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, color);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(colorAttribute);
        gl.vertexAttribPointer(colorAttribute, 3, gl.FLOAT, false, 0, 0);
      },
      pose(phase, mode = "walk") {
        if (!activeDefinition) throw new Error("Mob preview has no active definition.");
        uploadPositions(previewMesh(activeDefinition, phase, mode).positions, gl.DYNAMIC_DRAW);
      },
      draw(yaw, pitch, zoom) {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(target.clientWidth * ratio));
        const height = Math.max(1, Math.round(target.clientHeight * ratio));
        if (target.width !== width || target.height !== height) {
          target.width = width;
          target.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.useProgram(program);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const y = pitch * Math.PI / 180;
        const x = yaw * Math.PI / 180;
        const aspect = width / height;
        gl.uniform4f(view, Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y));
        gl.uniform3f(centerUniform, ...modelCenter);
        gl.uniform1f(depthScale, modelScale * 0.3);
        const scaleX = modelScale * 0.96 * zoom / 100 / Math.max(1, aspect);
        const scaleY = modelScale * 0.94 * zoom / 100 / Math.max(1, 1 / aspect);
        gl.uniform2f(scale, scaleX, scaleY);
        const bindModel = (mask) => {
          gl.useProgram(program);
          gl.uniform1i(maskUniform, mask ? 1 : 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, position);
          gl.enableVertexAttribArray(positionAttribute);
          gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, color);
          gl.enableVertexAttribArray(colorAttribute);
          gl.vertexAttribPointer(colorAttribute, 3, gl.FLOAT, false, 0, 0);
        };
        const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
        const ds = modelScale * 0.3;
        const rows = [
          [cx * scaleX, 0, sx * scaleX],
          [sx * sy * scaleY, cy * scaleY, -cx * sy * scaleY],
          [sx * cy * ds, -sy * ds, -cx * cy * ds],
        ];
        const translations = rows.map((row) => -row.reduce((sum, value, axis) =>
          sum + value * modelCenter[axis], 0));
        const viewProjection = [
          rows[0][0], rows[1][0], rows[2][0], 0,
          rows[0][1], rows[1][1], rows[2][1], 0,
          rows[0][2], rows[1][2], rows[2][2], 0,
          ...translations, 1,
        ];
        effectsRenderer.draw({
          width, height, pixelRatio: ratio,
          settings: { ...effectSettings, particlesEnabled: effectSettings.particlesEnabled && previewStage === "enemy" },
          mesh: activeMob, emitters,
          seconds: reducedMotion.matches ? 0 : performance.now() / 1000,
          sizeScale: auraScale, viewProjection,
          pixelsPerUnit: Math.min(width * scaleX, height * scaleY) / 2,
          drawMask() {
            bindModel(true);
            gl.drawArrays(gl.TRIANGLES, 0, activeMob.positions.length / 3);
          },
          drawOpaque() {
            bindModel(false);
            gl.drawArrays(gl.TRIANGLES, 0, count);
          },
        });
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`Mob WebGL error ${error}.`);
      },
    };
  }
})();
