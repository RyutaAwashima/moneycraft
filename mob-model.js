"use strict";

((root) => {
  const palettes = Object.freeze({
    body: Object.freeze([
      { id: "moss", label: "こけ", color: "#73965c" },
      { id: "ocean", label: "うみ", color: "#5689a2" },
      { id: "amber", label: "こはく", color: "#c8914f" },
      { id: "coral", label: "さんご", color: "#c87563" },
      { id: "lavender", label: "ラベンダー", color: "#9383b4" },
      { id: "slate", label: "いし", color: "#76828a" },
    ]),
    belly: Object.freeze([
      { id: "cream", label: "クリーム", color: "#e9dfc5" },
      { id: "mint", label: "ミント", color: "#a9c994" },
      { id: "sky", label: "そら", color: "#a9d1da" },
      { id: "sand", label: "すな", color: "#e3bd83" },
    ]),
    accent: Object.freeze([
      { id: "gold", label: "きん", color: "#e4bd5e" },
      { id: "berry", label: "ベリー", color: "#ae6682" },
      { id: "ink", label: "すみ", color: "#34383c" },
      { id: "snow", label: "ゆき", color: "#f4f1e7" },
    ]),
    eyeColor: Object.freeze([
      { id: "obsidian", label: "こくたん", color: "#30363a" },
      { id: "amber", label: "こはく", color: "#d98a32" },
      { id: "gold", label: "きん", color: "#e5c34b" },
      { id: "crimson", label: "あか", color: "#bd4b4b" },
      { id: "jade", label: "ひすい", color: "#48a878" },
      { id: "azure", label: "あお", color: "#4b8fd1" },
      { id: "violet", label: "むらさき", color: "#9665ca" },
      { id: "rose", label: "もも", color: "#dc7793" },
    ]),
  });
  const options = Object.freeze({
    stance: Object.freeze([
      { id: "quadruped", label: "四足歩行" },
      { id: "biped", label: "二足歩行" },
    ]),
    faceType: Object.freeze([
      { id: "dragon", label: "ドラゴン顔" },
      { id: "griffin", label: "グリフォン顔" },
      { id: "lion", label: "ライオン顔（キマイラ）" },
      { id: "horse", label: "馬顔" },
      { id: "creature", label: "クリーチャー顔" },
    ]),
    griffinBeak: Object.freeze([
      { id: "hooked", label: "かぎ形" },
      { id: "broad", label: "幅広" },
      { id: "short", label: "短いくちばし" },
    ]),
    griffinFeathers: Object.freeze([
      { id: "cheeks", label: "豊かな頬羽" },
      { id: "crest", label: "冠羽" },
      { id: "none", label: "基本の羽毛" },
    ]),
    lionMuzzle: Object.freeze([
      { id: "broad", label: "幅広" },
      { id: "compact", label: "小さめ" },
    ]),
    lionMane: Object.freeze([
      { id: "full", label: "たてがみ" },
      { id: "short", label: "短いたてがみ" },
      { id: "none", label: "なし" },
    ]),
    lionFangs: Object.freeze([
      { id: "small", label: "小さな牙" },
      { id: "large", label: "大きな牙" },
      { id: "none", label: "なし" },
    ]),
    lionEars: Object.freeze([
      { id: "round", label: "丸い耳" },
      { id: "pointed", label: "尖り耳" },
      { id: "long", label: "長耳" },
    ]),
    horseMane: Object.freeze([
      { id: "flowing", label: "長いたてがみ" },
      { id: "crest", label: "標準のたてがみ" },
      { id: "short", label: "短いたてがみ" },
    ]),
    horseEars: Object.freeze([
      { id: "upright", label: "立ち耳" },
      { id: "small", label: "小さな耳" },
      { id: "none", label: "なし" },
    ]),
    creatureMouth: Object.freeze([
      { id: "lamprey", label: "円形の口" },
      { id: "wide", label: "横に広い口" },
      { id: "tube", label: "管状の口" },
      { id: "jagged", label: "深海魚のギザ歯" },
      { id: "octopus", label: "タコ風の触手顔" },
    ]),
    creatureSenses: Object.freeze([
      { id: "stalks", label: "眼柄と触手" },
      { id: "cluster", label: "複眼" },
      { id: "gills", label: "えら" },
      { id: "giant-gills", label: "巨大な彩りえら" },
    ]),
    bodyShape: Object.freeze([
      { id: "sleek", label: "ほっそり" },
      { id: "balanced", label: "標準" },
      { id: "stocky", label: "がっしり" },
    ]),
    neckShape: Object.freeze([
      { id: "low", label: "低く短い" },
      { id: "raised", label: "立ち首" },
      { id: "long", label: "長い首" },
    ]),
    headShape: Object.freeze([
      { id: "round", label: "丸い頭" },
      { id: "crest", label: "とさか頭" },
      { id: "armored", label: "ごつごつ頭" },
    ]),
    snout: Object.freeze([
      { id: "short", label: "短い鼻先" },
      { id: "long", label: "長い鼻先" },
      { id: "beak", label: "くちばし" },
    ]),
    jaw: Object.freeze([
      { id: "none", label: "なし" },
      { id: "short", label: "小さな顎" },
      { id: "long", label: "長い顎" },
      { id: "fangs", label: "牙のある顎" },
    ]),
    jawPose: Object.freeze([
      { id: "closed", label: "閉じる" },
      { id: "open", label: "開く" },
    ]),
    teeth: Object.freeze([
      { id: "none", label: "なし" },
      { id: "small", label: "小さな歯" },
      { id: "fangs", label: "大きな牙" },
    ]),
    eyes: Object.freeze([
      { id: "round", label: "まる目" },
      { id: "narrow", label: "鋭い目" },
      { id: "sleepy", label: "ねむそう" },
    ]),
    horns: Object.freeze([
      { id: "none", label: "なし" },
      { id: "short", label: "小さな角" },
      { id: "curved", label: "曲がり角" },
      { id: "large", label: "大きな角" },
      { id: "swept", label: "後ろへ流れる角" },
      { id: "crown", label: "王冠角" },
    ]),
    backSpines: Object.freeze([
      { id: "none", label: "なし" },
      { id: "row", label: "背びれ列" },
      { id: "large", label: "大きな背びれ" },
    ]),
    limbs: Object.freeze([
      { id: "small", label: "小さめ" },
      { id: "strong", label: "太く力強い" },
      { id: "long", label: "長い" },
    ]),
    tail: Object.freeze([
      { id: "none", label: "なし" },
      { id: "long", label: "長い尾" },
      { id: "club", label: "こん棒尾" },
      { id: "spade", label: "ひれ尾" },
    ]),
    wings: Object.freeze([
      { id: "none", label: "なし" },
      { id: "small", label: "小さな翼" },
      { id: "broad", label: "大きな翼" },
    ]),
  });
  const defaults = Object.freeze({
    format: "moneycraft-mob",
    version: 7,
    stance: "quadruped",
    faceType: "dragon",
    griffinBeak: "hooked",
    griffinFeathers: "cheeks",
    lionMuzzle: "broad",
    lionMane: "full",
    lionFangs: "large",
    lionEars: "round",
    horseMane: "flowing",
    horseEars: "upright",
    creatureMouth: "lamprey",
    creatureSenses: "stalks",
    bodyShape: "balanced",
    neckShape: "raised",
    headShape: "round",
    snout: "long",
    jaw: "fangs",
    jawPose: "closed",
    teeth: "small",
    eyes: "round",
    eyeColor: "obsidian",
    horns: "short",
    backSpines: "none",
    limbs: "strong",
    tail: "long",
    wings: "broad",
    body: "moss",
    belly: "cream",
    accent: "gold",
    bodyLength: 100,
    headScale: 100,
    neckLength: 100,
    tailLength: 100,
  });
  const definitionKeys = Object.freeze(Object.keys(defaults));
  const facePartKeys = Object.freeze([
    "griffinBeak", "griffinFeathers", "lionMuzzle", "lionMane", "lionFangs", "lionEars",
    "horseMane", "horseEars", "creatureMouth", "creatureSenses",
  ]);
  const versionFourKeys = Object.freeze(definitionKeys.filter((key) => !facePartKeys.includes(key)));
  const versionThreeKeys = Object.freeze(versionFourKeys.filter((key) => key !== "faceType"));
  const versionTwoKeys = Object.freeze(definitionKeys.filter((key) =>
    key !== "faceType" && key !== "eyeColor" && !facePartKeys.includes(key)));
  const faceFieldGroups = Object.freeze({
    dragon: Object.freeze(["headShape", "snout", "jaw", "jawPose", "teeth", "eyes", "eyeColor", "horns"]),
    griffin: Object.freeze(["griffinBeak", "griffinFeathers", "eyeColor"]),
    lion: Object.freeze(["lionMuzzle", "lionMane", "lionFangs", "lionEars", "eyeColor"]),
    horse: Object.freeze(["horseMane", "horseEars", "eyeColor"]),
    creature: Object.freeze(["creatureMouth", "creatureSenses", "eyeColor"]),
  });
  const legacyOptions = Object.freeze({
    archetype: ["slime", "quadruped", "biped", "floating"],
    eyes: ["round", "sleepy", "cyclops"],
    ears: ["none", "short", "long", "horns"],
    tail: ["none", "short", "long"],
    wings: ["none", "small", "large"],
  });
  const rangeKeys = Object.freeze(["bodyLength", "headScale", "neckLength", "tailLength"]);
  function faceDimensions(definition) {
    const scale = definition.headScale / 100;
    if (definition.faceType === "griffin") {
      return {
        snoutLength: (definition.griffinBeak === "short" ? 0.22 : 0.31) * scale,
        snoutWidth: (definition.griffinBeak === "broad" ? 0.82 : 0.62) * 0.23 * scale,
        snoutHeight: 0.12 * scale,
      };
    }
    if (definition.faceType === "lion") {
      return {
        snoutLength: 0.2 * scale,
        snoutWidth: 0.23 * scale * (definition.lionMuzzle === "broad" ? 1.06 : 0.78),
        snoutHeight: 0.22 * scale,
      };
    }
    if (definition.faceType === "horse") {
      return {
        snoutLength: 0.46 * scale,
        snoutWidth: 0.23 * scale * 0.56,
        snoutHeight: 0.12 * scale,
      };
    }
    if (definition.faceType === "creature") {
      return {
        snoutLength: definition.creatureMouth === "tube" ? 0.4 * scale : 0.22 * scale,
        snoutWidth: 0.23 * scale * (["wide", "jagged"].includes(definition.creatureMouth) ? 1.08 : 0.88),
        snoutHeight: 0.18 * scale,
      };
    }
    const snoutLength = (definition.snout === "long" ? 0.34
      : definition.snout === "beak" ? 0.28 : 0.16) * scale;
    const snoutWidth = 0.23 * scale * (definition.snout === "beak" ? 0.74 : 0.82);
    return {
      snoutLength,
      snoutWidth,
      snoutHeight: (definition.snout === "beak" ? 0.12 : 0.16) * scale,
    };
  }

  function addFaceModel(add, addBox, boxes, definition, skeleton, body, belly, accent, eyeColor) {
    const { faceType, headScale } = definition;
    const scale = headScale / 100;
    const headWidth = skeleton.headWidth;
    const headHeight = skeleton.headHeight;
    const headCenter = skeleton.head;
    const headFront = skeleton.headFront;
    const headMaxY = skeleton.headMaxY;
    const snoutBaseY = skeleton.snoutBaseY;
    const { snoutLength, snoutWidth, snoutHeight } = faceDimensions(definition);
    const eyeY = headCenter[1] + headHeight * 0.12;
    const addEyeOnSide = (side, z = headCenter[2] + skeleton.headDepth * 0.38) => {
      const x = side * (headWidth + 0.035 * scale);
      addBox("eye-socket", [side * (headWidth + 0.012 * scale), eyeY, z],
        [0.018 * scale, 0.065 * scale, 0.075 * scale], accent);
      addBox("eye", [x, eyeY, z], [0.014 * scale, 0.03 * scale, 0.04 * scale], eyeColor);
      addBox("pupil", [side * (headWidth + 0.05 * scale), eyeY, z + 0.008 * scale],
        [0.008 * scale, 0.02 * scale, 0.012 * scale], "#f4f1e7");
    };
    const addFrontEye = (x, y, z, size = 0.045, prefix = "front") => {
      const eyeSize = size * scale;
      addBox(`${prefix}-eye-socket`, [x, y, z],
        [eyeSize * 0.72, eyeSize * 0.72, 0.018 * scale], accent);
      addBox(`${prefix}-eye`, [x, y, z + 0.018 * scale],
        [eyeSize * 0.48, eyeSize * 0.48, 0.012 * scale], eyeColor);
      addBox(`${prefix}-pupil`, [x, y, z + 0.032 * scale],
        [eyeSize * 0.2, eyeSize * 0.24, 0.008 * scale], "#f4f1e7");
    };
    const addTaperedPart = (part, x, bottom, top, z, bottomWidth, topWidth, depth, tint) => {
      const vertices = [
        [x - bottomWidth, bottom, z - depth], [x + bottomWidth, bottom, z - depth],
        [x - topWidth, top, z - depth], [x + topWidth, top, z - depth],
        [x - bottomWidth, bottom, z + depth], [x + bottomWidth, bottom, z + depth],
        [x - topWidth, top, z + depth], [x + topWidth, top, z + depth],
      ];
      boxes.push({
        part, color: tint, vertices,
        min: [0, 1, 2].map((axis) => Math.min(...vertices.map((point) => point[axis]))),
        max: [0, 1, 2].map((axis) => Math.max(...vertices.map((point) => point[axis]))),
        faces: [[2, 6, 7, 3], [0, 1, 5, 4], [1, 3, 7, 5],
          [0, 4, 6, 2], [4, 5, 7, 6], [0, 2, 3, 1]],
      });
    };

    if (faceType === "dragon") {
      if (definition.headShape === "armored") {
        for (const side of [-1, 1]) addBox("brow-armor",
          [side * headWidth * 0.72, headMaxY - 0.03, headFront - 0.05],
          [headWidth * 0.36, 0.055, 0.08], accent);
      } else if (definition.headShape === "crest") {
        addBox("crest", [0, headMaxY + 0.105 * scale, headCenter[2] + 0.08],
          [headWidth * 0.38, 0.12 * scale, 0.13 * scale], accent);
      }
      if (definition.stance === "biped") {
        addBox("upper-snout", [0, snoutBaseY + snoutHeight / 2, headFront + snoutLength / 2],
          [snoutWidth, snoutHeight / 2, (snoutLength + 0.04 * scale) / 2], body);
      } else {
        add("upper-snout", [-snoutWidth, snoutBaseY, headFront - 0.02 * scale],
          [snoutWidth, snoutBaseY + snoutHeight, headFront + snoutLength], body);
      }
      if (definition.snout === "beak") {
        if (definition.stance === "biped") {
          addBox("beak-tip", [0, snoutBaseY - 0.005 * scale, headFront + snoutLength * 0.82],
            [snoutWidth * 0.7, 0.04 * scale, 0.08 * scale], accent);
        } else {
          add("beak-tip", [-snoutWidth * 0.7, snoutBaseY - 0.045 * scale,
            headFront + snoutLength * 0.58],
          [snoutWidth * 0.7, snoutBaseY + 0.035 * scale,
            headFront + snoutLength + 0.09 * scale], accent);
        }
      } else {
        if (definition.stance === "biped") {
          addBox("nose", [0, snoutBaseY + snoutHeight * 0.68, headFront + snoutLength],
            [snoutWidth * 0.55, snoutHeight * 0.2, 0.025 * scale], accent);
        } else {
          add("nose", [-snoutWidth * 0.55, snoutBaseY + snoutHeight * 0.48,
            headFront + snoutLength - 0.025 * scale],
          [snoutWidth * 0.55, snoutBaseY + snoutHeight * 0.88,
            headFront + snoutLength + 0.015 * scale], accent);
        }
      }
      const eyeHeight = definition.eyes === "sleepy" ? 0.025 : 0.06;
      const eyeWidthScale = definition.eyes === "narrow" ? 1.25 : 0.72;
      const eyeZ = headCenter[2] + skeleton.headDepth * 0.38;
      for (const side of [-1, 1]) {
        addBox("eye-socket", [side * (headWidth + 0.012 * scale), eyeY, eyeZ],
          [0.018 * scale, 0.065 * scale, 0.075 * scale], accent);
        addBox("eye", [side * (headWidth + 0.035 * scale), eyeY, eyeZ],
          [0.014 * scale, eyeHeight * scale / 2, 0.052 * scale * eyeWidthScale], eyeColor);
        if (definition.eyes !== "sleepy") {
          addBox("pupil", [side * (headWidth + 0.05 * scale), eyeY, eyeZ],
            [0.008 * scale, 0.02 * scale, 0.012 * scale], "#f4f1e7");
        }
      }
      if (definition.jaw !== "none") {
        const jawLength = snoutLength + 0.045 * scale;
        const jawWidth = headWidth * (definition.jaw === "fangs" ? 0.8 : 0.68);
        const [,, jawZ] = skeleton.jawPivot;
        if (definition.stance === "biped") {
          addBox("lower-jaw", [0, skeleton.jawPivot[1] - 0.0425 * scale, jawZ + jawLength / 2],
            [jawWidth, 0.0425 * scale, (jawLength + 0.035 * scale) / 2], body);
          addBox("chin", [0, skeleton.jawPivot[1] - 0.048 * scale, jawZ + jawLength * 0.82],
            [jawWidth * 0.76, 0.0225 * scale, jawLength * 0.22], belly);
        } else {
          add("lower-jaw", [-jawWidth, skeleton.jawPivot[1] - 0.085 * scale, jawZ - 0.035 * scale],
            [jawWidth, skeleton.jawPivot[1], jawZ + jawLength], body);
          add("chin", [-jawWidth * 0.76, skeleton.jawPivot[1] - 0.07 * scale,
            jawZ + jawLength * 0.62],
          [jawWidth * 0.76, skeleton.jawPivot[1] - 0.025 * scale,
            jawZ + jawLength + 0.025 * scale], belly);
        }
        const mouthBottom = skeleton.jawPivot[1] + 0.005 * scale;
        const mouthTop = snoutBaseY + 0.01 * scale;
        if (definition.stance === "biped") {
          addBox("mouth-interior", [0, (mouthBottom + mouthTop) / 2, jawZ + jawLength * 0.39],
            [jawWidth * 0.78, Math.max(0.008, (mouthTop - mouthBottom) / 2),
              jawLength * 0.39], "#754b43");
        } else {
          add("mouth-interior", [-jawWidth * 0.78, mouthBottom, jawZ - 0.01 * scale],
            [jawWidth * 0.78, mouthTop, jawZ + jawLength * 0.78], "#754b43");
        }
        if (definition.teeth !== "none") {
          const count = definition.teeth === "fangs" || definition.jaw === "fangs" ? 4 : 2;
          const height = (definition.teeth === "fangs" || definition.jaw === "fangs" ? 0.105 : 0.055) * scale;
          for (let index = 0; index < count; index += 1) {
            const x = (index - (count - 1) / 2) * jawWidth * 0.42;
            if (definition.stance === "biped") {
              addBox("upper-tooth", [x, snoutBaseY - height / 2, jawZ + jawLength * 0.72],
                [0.025 * scale, height / 2, 0.0225 * scale], "#f4f1e7");
            } else {
              add("upper-tooth", [x - 0.025 * scale, snoutBaseY - height,
                jawZ + jawLength * 0.72],
              [x + 0.025 * scale, snoutBaseY + 0.005 * scale,
                jawZ + jawLength * 0.72 + 0.045 * scale], "#f4f1e7");
            }
          }
        }
      }
      addHornParts(boxes, addBox, definition, headWidth, headMaxY, headCenter, scale, accent);
    } else if (faceType === "griffin") {
      const broadBeak = definition.griffinBeak === "broad";
      const skull = boxes.find(({ part }) => part === "skull");
      skull.color = belly;
      const neckParts = boxes.filter(({ part }) => part.startsWith("neck-"));
      for (const [index, neck] of neckParts.entries()) {
        add(`griffin-neck-coat-${index}`, neck.min.map((value, axis) =>
          value - (axis === 1 ? 0.012 : 0.055) * scale),
        neck.max.map((value, axis) => value + (axis === 1 ? 0.012 : 0.055) * scale), belly);
        for (const side of [-1, 1]) {
          addBox(`griffin-neck-feather-${side}-${index}`,
            [side * (neck.max[0] + 0.035 * scale), neck.min[1],
              (neck.min[2] + neck.max[2]) / 2],
            [0.055 * scale, 0.075 * scale, 0.18 * scale], belly);
        }
      }
      const upperNeck = neckParts[neckParts.length - 1];
      add("griffin-nape", [-headWidth * 0.9, upperNeck.min[1],
        Math.min(upperNeck.min[2], skull.min[2]) - 0.035 * scale],
      [headWidth * 0.9, headMaxY + 0.015 * scale, headCenter[2] + 0.08 * scale], belly);
      addBox("griffin-crown", [0, headMaxY, headCenter[2]],
        [headWidth * 0.98, 0.055 * scale, skeleton.headDepth * 0.82], belly);
      addBox("griffin-forehead", [0, eyeY + 0.095 * scale, headFront],
        [headWidth * 0.94, 0.035 * scale, 0.065 * scale], belly);
      addBox("griffin-face-down", [0, snoutBaseY - 0.06 * scale, headFront - 0.025 * scale],
        [headWidth * 0.88, 0.065 * scale, 0.075 * scale], belly);
      const addBeakSection = (part, rearZ, frontZ, rearWidth, frontWidth,
        rearBottom, rearTop, frontBottom, frontTop) => {
        const vertices = [
          [-rearWidth, rearBottom, rearZ], [rearWidth, rearBottom, rearZ],
          [-rearWidth, rearTop, rearZ], [rearWidth, rearTop, rearZ],
          [-frontWidth, frontBottom, frontZ], [frontWidth, frontBottom, frontZ],
          [-frontWidth, frontTop, frontZ], [frontWidth, frontTop, frontZ],
        ];
        boxes.push({
          part, color: accent, vertices,
          min: [0, 1, 2].map((axis) => Math.min(...vertices.map((point) => point[axis]))),
          max: [0, 1, 2].map((axis) => Math.max(...vertices.map((point) => point[axis]))),
          faces: [[2, 6, 7, 3], [0, 1, 5, 4], [1, 3, 7, 5],
            [0, 4, 6, 2], [4, 5, 7, 6], [0, 2, 3, 1]],
        });
      };
      addBeakSection("griffin-beak", headFront - 0.025 * scale,
        headFront + snoutLength * 0.78, snoutWidth, snoutWidth * 0.55,
        snoutBaseY, snoutBaseY + snoutHeight * 1.25,
        snoutBaseY - snoutHeight * 0.06, snoutBaseY + snoutHeight * 0.6);
      addBeakSection("griffin-hook", headFront + snoutLength * 0.7,
        headFront + snoutLength, snoutWidth * 0.6, snoutWidth * 0.12,
        snoutBaseY - snoutHeight * 0.08, snoutBaseY + snoutHeight * 0.7,
        snoutBaseY - snoutHeight * (broadBeak ? 0.8 : 1.1),
        snoutBaseY - snoutHeight * 0.7);
      addBox("griffin-lower-beak", [0, snoutBaseY - 0.02 * scale,
        headFront + snoutLength * 0.28],
      [snoutWidth * 0.72, 0.018 * scale, snoutLength * 0.34], accent);
      addBox("griffin-cere", [0, snoutBaseY + snoutHeight * 0.83, headFront + 0.025 * scale],
        [snoutWidth * 0.72, snoutHeight * 0.22, 0.055 * scale], accent);
      for (const side of [-1, 1]) {
        addBox(`griffin-cheek-${side}`,
          [side * headWidth * 0.87, eyeY - 0.08 * scale, headCenter[2]],
          [headWidth * 0.38, 0.07 * scale, skeleton.headDepth * 1.02], belly);
        const eyeOrigin = [side * headWidth * 0.9, eyeY + 0.015 * scale,
          headFront + 0.035 * scale];
        for (const [part, half, depth, tint] of [
          ["eye-socket", [0.058, 0.044, 0.012], 0, accent],
          ["eye", [0.039, 0.03, 0.009], 0.018, eyeColor],
          ["pupil", [0.012, 0.021, 0.006], 0.03, "#f4f1e7"],
        ]) {
          boxes.push({
            part: `griffin-${part}-${side}`, color: tint,
            min: half.map((value, axis) => (-value + (axis === 2 ? depth : 0)) * scale),
            max: half.map((value, axis) => (value + (axis === 2 ? depth : 0)) * scale),
            frame: { origin: eyeOrigin, axes: [[0.8, 0, -side * 0.6],
              [0, 1, 0], [side * 0.6, 0, 0.8]] },
          });
        }
        if (definition.griffinFeathers === "cheeks") {
          addBox(`griffin-feather-${side}-1`,
            [side * headWidth * 1.08, headCenter[1] - headHeight * 0.25, headFront - 0.19 * scale],
            [headWidth * 0.3 * 1.3, headHeight * 0.24 * 1.3, 0.14 * scale * 1.3], belly);
          addBox(`griffin-feather-${side}-2`,
            [side * headWidth * 1.2, headCenter[1] - headHeight * 0.52, headFront - 0.26 * scale],
            [headWidth * 0.24 * 1.3, headHeight * 0.2 * 1.3, 0.12 * scale * 1.3], belly);
        }
      }
      if (definition.griffinFeathers === "crest") {
        addBox("griffin-crest", [0, headMaxY + headHeight * 0.22, headCenter[2] - 0.03],
          [headWidth * 0.38 * 1.3, headHeight * 0.34 * 1.3, headHeight * 0.28 * 1.3], belly);
      }
    } else if (faceType === "lion") {
      addBox("lion-muzzle", [0, snoutBaseY - snoutHeight * 0.08, headFront + snoutLength * 0.42],
        [snoutWidth, snoutHeight * 0.56, snoutLength * 0.58], belly);
      addBox("lion-nose", [0, snoutBaseY + snoutHeight * 0.36, headFront + snoutLength],
        [snoutWidth * 0.48, snoutHeight * 0.34, 0.035 * scale], "#34383c");
      addBox("lion-mouth", [0, snoutBaseY - snoutHeight * 0.58, headFront + snoutLength * 0.76],
        [snoutWidth * 0.4, snoutHeight * 0.1, 0.025 * scale], "#754b43");
      addBox("lion-chin", [0, snoutBaseY - snoutHeight * 0.76, headFront + snoutLength * 0.72],
        [snoutWidth * 0.55, snoutHeight * 0.14, snoutLength * 0.22], body);
      if (definition.lionMane !== "none") {
        const maneScale = definition.lionMane === "full" ? 1 : 0.65;
        addBox("lion-mane-top", [0, headMaxY + 0.045 * scale, headCenter[2]],
          [headWidth * 0.95 * maneScale, 0.1 * scale * maneScale, 0.25 * scale], accent);
        addBox("lion-mane-bottom", [0, headCenter[1] - headHeight * 0.62, headCenter[2]],
          [headWidth * 0.85 * maneScale, headHeight * 0.3 * maneScale, 0.27 * scale], accent);
        addBox("lion-mane-back", [0, headCenter[1], headCenter[2] - 0.22 * scale],
          [headWidth * 1.05 * maneScale, headHeight * 0.6 * maneScale, 0.14 * scale], accent);
      }
      for (const side of [-1, 1]) {
        addFrontEye(side * headWidth * 0.62, headCenter[1] + headHeight * 0.34,
          headFront + 0.025 * scale, 0.05);
        const earX = side * headWidth * 1.02;
        const earBase = headMaxY + 0.08 * scale;
        const earZ = headCenter[2] + 0.04 * scale;
        addBox(`lion-ear-root-${side}`, [earX, headMaxY + 0.025 * scale, earZ],
          [0.085 * scale, 0.07 * scale, 0.06 * scale], body);
        if (definition.lionEars === "round") {
          addBox(`lion-ear-${side}`, [earX, earBase + 0.09 * scale, earZ],
            [0.105 * scale, 0.09 * scale, 0.065 * scale], body);
          addBox(`lion-ear-cap-${side}`, [earX, earBase + 0.18 * scale, earZ],
            [0.075 * scale, 0.035 * scale, 0.06 * scale], body);
          addBox(`lion-ear-inner-${side}`, [earX, earBase + 0.1 * scale, earZ + 0.066 * scale],
            [0.063 * scale, 0.065 * scale, 0.012 * scale], belly);
        } else {
          const earHeight = (definition.lionEars === "long" ? 0.48 : 0.3) * scale;
          addTaperedPart(`lion-ear-${side}`, earX, earBase, earBase + earHeight,
            earZ, 0.105 * scale, 0.012 * scale, 0.06 * scale, body);
          addTaperedPart(`lion-ear-inner-${side}`, earX, earBase + 0.04 * scale,
            earBase + earHeight * 0.83, earZ + 0.061 * scale,
            0.065 * scale, 0.008 * scale, 0.012 * scale, belly);
        }
        if (definition.lionMane !== "none") {
          const maneScale = definition.lionMane === "full" ? 1 : 0.65;
          addBox(`lion-mane-${side}-upper`,
            [side * headWidth * 1.12, headCenter[1] + headHeight * 0.38, headCenter[2]],
            [headWidth * 0.55 * maneScale, headHeight * 0.34 * maneScale, 0.24 * scale], accent);
          addBox(`lion-mane-${side}-middle`,
            [side * headWidth * 1.55, headCenter[1] - headHeight * 0.02, headCenter[2]],
            [headWidth * 0.65 * maneScale, headHeight * 0.32 * maneScale, 0.28 * scale], accent);
          addBox(`lion-mane-${side}-lower`,
            [side * headWidth * 1.22, headCenter[1] - headHeight * 0.48, headCenter[2]],
            [headWidth * 0.58 * maneScale, headHeight * 0.28 * maneScale, 0.26 * scale], accent);
        }
        if (definition.lionFangs !== "none") {
          const fangHeight = (definition.lionFangs === "large" ? 0.36 : 0.18) * scale;
          const fangTop = snoutBaseY - snoutHeight * 0.18;
          addTaperedPart(`lion-fang-${side}`, side * snoutWidth * 0.72,
            fangTop - fangHeight, fangTop, headFront + snoutLength + 0.04 * scale,
            0.008 * scale, 0.045 * scale, 0.035 * scale, "#f4f1e7");
        }
      }
    } else if (faceType === "horse") {
      const noseLength = 0.08 * scale;
      const faceEnd = headFront + snoutLength - noseLength;
      const faceStart = headCenter[2] + skeleton.headDepth * 0.45;
      const vertices = [
        [-headWidth, headCenter[1] - headHeight * 0.45, faceStart],
        [headWidth, headCenter[1] - headHeight * 0.45, faceStart],
        [-headWidth, headCenter[1] + headHeight * 0.45, faceStart],
        [headWidth, headCenter[1] + headHeight * 0.45, faceStart],
        [-snoutWidth, snoutBaseY - snoutHeight * 0.7, faceEnd],
        [snoutWidth, snoutBaseY - snoutHeight * 0.7, faceEnd],
        [-snoutWidth, snoutBaseY + snoutHeight * 0.7, faceEnd],
        [snoutWidth, snoutBaseY + snoutHeight * 0.7, faceEnd],
      ];
      boxes.push({
        part: "horse-face", color: body, vertices,
        min: [0, 1, 2].map((axis) => Math.min(...vertices.map((point) => point[axis]))),
        max: [0, 1, 2].map((axis) => Math.max(...vertices.map((point) => point[axis]))),
        faces: [[2, 6, 7, 3], [0, 1, 5, 4], [1, 3, 7, 5],
          [0, 4, 6, 2], [4, 5, 7, 6], [0, 2, 3, 1]],
      });
      addBox("horse-muzzle", [0, snoutBaseY, faceEnd + noseLength * 0.45],
        [snoutWidth * 1.04, snoutHeight * 0.72, noseLength * 0.55], body);
      addBox("horse-jaw", [0, snoutBaseY - snoutHeight * 0.67, faceEnd + noseLength * 0.4],
        [snoutWidth * 0.78, snoutHeight * 0.12, noseLength * 0.58], body);
      for (const side of [-1, 1]) {
        addEyeOnSide(side, headCenter[2] + skeleton.headDepth * 0.24);
        addBox(`horse-nostril-${side}`,
          [side * snoutWidth * 0.55, snoutBaseY + snoutHeight * 0.18, faceEnd + noseLength],
          [0.018 * scale, 0.025 * scale, 0.014 * scale], "#34383c");
        if (definition.horseEars !== "none") {
          const earScale = definition.horseEars === "small" ? 0.7 : 1;
          addBox(`horse-ear-${side}`,
            [side * headWidth * 0.68, headMaxY + headHeight * 0.34 * earScale, headCenter[2] - 0.04],
            [headWidth * 0.19 * earScale, headHeight * 0.34 * earScale, 0.06 * scale], body);
        }
      }
      const maneLength = (definition.horseMane === "flowing" ? 0.32
        : definition.horseMane === "crest" ? 0.12 : 0.03) * scale;
      const manePath = [
        [0, headMaxY, headCenter[2] - 0.16 * scale],
        [0, skeleton.neckTop[1], skeleton.neckTop[2] - 0.1],
        [0, skeleton.bodyCenter[1] + skeleton.bodyHeight * 0.5, skeleton.bodyFront * 0.5],
      ];
      for (let section = 0; section < manePath.length - 1; section += 1) {
        const start = manePath[section];
        const end = manePath[section + 1];
        for (let index = 0; index < 4; index += 1) {
          const progress = (index + 0.5) / 4;
          const center = start.map((value, axis) => value + (end[axis] - value) * progress);
          addBox(`horse-mane-${section}-${index}`, center,
            [0.055 * scale, Math.abs(end[1] - start[1]) / 8 + maneLength,
              Math.abs(end[2] - start[2]) / 8 + 0.07 * scale], accent);
        }
      }
      addBox("horse-mane-back-root", manePath[2], [0.055 * scale, maneLength, 0.08 * scale], accent);
    } else {
      const octopus = definition.creatureMouth === "octopus";
      const creatureEyeY = headMaxY - 0.025 * scale;
      const addCreatureEye = (part, x, y, z, size = 0.065) => {
        addBox(part, [x, y, z], [size * scale, size * scale, 0.035 * scale], eyeColor);
      };
      if (octopus) {
        addBox("creature-mantle", [0, headMaxY + 0.055 * scale, headCenter[2]],
          [headWidth * 1.12, headHeight * 0.66, skeleton.headDepth * 0.95], body);
        addBox("creature-mantle-crown", [0, headMaxY + 0.19 * scale, headCenter[2]],
          [headWidth * 0.8, 0.06 * scale, skeleton.headDepth * 0.74], body);
        addBox("creature-mouth", [0, snoutBaseY - 0.05 * scale, headFront + 0.075 * scale],
          [0.075 * scale, 0.06 * scale, 0.035 * scale], "#34383c");
        for (let index = 0; index < 6; index += 1) {
          const offset = index - 2.5;
          const length = (0.32 + (2.5 - Math.abs(offset)) * 0.05) * scale;
          const root = [offset * 0.07 * scale, snoutBaseY, headFront + 0.045 * scale];
          const bend = [root[0] * 1.15, root[1] - length * 0.55, root[2] + 0.12 * scale];
          const tip = [root[0] * 1.4, root[1] - length, root[2] + 0.18 * scale];
          const curl = [tip[0] + Math.sign(offset) * 0.045 * scale,
            tip[1] + 0.05 * scale, tip[2] + 0.045 * scale];
          for (const [section, [start, end]] of [[root, bend], [bend, tip], [tip, curl]].entries()) {
            addOrientedSegment(boxes, `creature-tentacle-${index}-${section}`, start, end,
              (0.064 - section * 0.014) * scale, (0.06 - section * 0.012) * scale, body);
          }
          addBox(`creature-sucker-${index}`, [bend[0], bend[1], bend[2] + 0.033 * scale],
            [0.018 * scale, 0.028 * scale, 0.01 * scale], belly);
        }
      } else if (definition.creatureMouth === "jagged") {
        const mouthY = snoutBaseY - 0.025 * scale;
        const mouthZ = headFront + snoutLength * 0.5;
        addBox("creature-lip", [0, mouthY, mouthZ],
          [snoutWidth * 0.9, 0.105 * scale, 0.07 * scale], accent);
        addBox("creature-mouth", [0, mouthY, mouthZ + 0.045 * scale],
          [snoutWidth * 0.8, 0.085 * scale, 0.03 * scale], "#34383c");
        for (const row of [-1, 1]) for (let index = 0; index < 7; index += 1) {
          const length = (index % 2 === 0 ? 0.068 : 0.045) * scale;
          const base = mouthY + row * 0.085 * scale;
          addTaperedPart(`creature-jagged-tooth-${row}-${index}`,
            (index - 3) * snoutWidth * 0.21,
            row === 1 ? base - length : base, row === 1 ? base : base + length,
            mouthZ + 0.082 * scale, (row === 1 ? 0.004 : 0.021) * scale,
            (row === 1 ? 0.021 : 0.004) * scale, 0.012 * scale, "#f4f1e7");
        }
      } else if (definition.creatureMouth === "tube") {
        addBox("creature-tube", [0, snoutBaseY, headFront + snoutLength * 0.42],
          [snoutWidth * 0.52, snoutHeight * 0.42, snoutLength * 0.58], body);
        addBox("creature-mouth", [0, snoutBaseY, headFront + snoutLength * 0.96],
          [snoutWidth * 0.3, snoutHeight * 0.24, 0.025 * scale], "#34383c");
      } else {
        const mouthWidth = definition.creatureMouth === "wide" ? snoutWidth * 1.24 : snoutWidth * 0.56;
        const mouthHeight = definition.creatureMouth === "wide" ? snoutHeight * 0.58 : snoutHeight * 0.72;
        addBox("creature-lip", [0, snoutBaseY - snoutHeight * 0.12, headFront + snoutLength * 0.42],
          [mouthWidth * 0.72, mouthHeight * 0.68, 0.04 * scale], accent);
        addBox("creature-mouth", [0, snoutBaseY - snoutHeight * 0.12, headFront + snoutLength * 0.48],
          [mouthWidth * 0.52, mouthHeight * 0.44, 0.045 * scale], "#34383c");
        if (definition.creatureMouth === "lamprey") {
          for (const side of [-1, 1]) for (let index = 0; index < 3; index += 1) {
            addBox(`creature-tooth-${side}-${index}`,
              [side * mouthWidth * (0.24 + index * 0.1),
                snoutBaseY - snoutHeight * 0.12 + (index % 2 ? 1 : -1) * mouthHeight * 0.28,
                headFront + snoutLength * 0.52],
              [0.014 * scale, 0.018 * scale, 0.012 * scale], "#f4f1e7");
          }
        }
      }
      if (definition.creatureSenses === "cluster") {
        for (const [index, offset] of [-1, 0, 1].entries()) {
          addCreatureEye(`creature-eye-${index}`, offset * headWidth * 0.65,
            creatureEyeY + (index === 1 ? 0.09 * scale : 0), headFront + 0.045 * scale, 0.06);
        }
      } else if (definition.creatureSenses === "stalks") {
        const stalkLift = octopus ? 0.12 * scale : 0;
        for (const side of [-1, 1]) {
          addBox(`creature-stalk-${side}`,
            [side * headWidth * 0.62, headMaxY + headHeight * 0.46 + stalkLift / 2, headCenter[2]],
            [0.025 * scale, headHeight * 0.56 + stalkLift / 2, 0.025 * scale], body);
          addCreatureEye(`creature-eye-${side}`, side * headWidth * 0.62,
            headMaxY + headHeight + stalkLift, headCenter[2] + 0.035 * scale, 0.075);
          addBox(`creature-barbel-${side}`,
            [side * headWidth * 1.04, headCenter[1] - headHeight * 0.28, headFront + snoutLength * 0.32],
            [headWidth * 0.08, headHeight * 0.06, snoutLength * 0.4], body);
        }
      } else {
        for (const side of [-1, 1]) {
          addCreatureEye(`creature-eye-${side}`, side * headWidth * 0.65,
            creatureEyeY, headFront + 0.045 * scale, 0.075);
          if (definition.creatureSenses === "giant-gills") {
            const root = [side * headWidth * 0.85, headCenter[1], headCenter[2] - 0.12 * scale];
            for (let index = 0; index < 5; index += 1) {
              const tip = [side * (headWidth + (0.28 + (2 - Math.abs(index - 2)) * 0.08) * scale),
                headCenter[1] + (2 - index) * 0.16 * scale,
                headCenter[2] - (0.22 + index * 0.02) * scale];
              addOrientedSegment(boxes, `creature-giant-gill-${side}-${index}`, root, tip,
                0.14 * scale, 0.035 * scale, [accent, belly, body, belly, accent][index]);
            }
          } else for (let index = 0; index < 3; index += 1) {
            addBox(`creature-gill-${side}-${index}`,
              [side * headWidth * 1.02, headCenter[1] - headHeight * (0.12 + index * 0.2),
                headCenter[2] - headWidth * 0.25],
              [headWidth * 0.08, headHeight * 0.045, headWidth * 0.16], accent);
          }
        }
      }
    }
  }

  const blocks = Object.freeze([
    { shade: 0.78, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { shade: 0.68, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { shade: 1, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { shade: 0.58, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { shade: 0.91, corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { shade: 0.65, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ]);

  function isDefinition(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === definitionKeys.length
      && definitionKeys.every((key) => Object.hasOwn(value, key))
      && value.format === defaults.format && value.version === defaults.version
      && Object.entries(options).every(([key, entries]) => entries.some((entry) => entry.id === value[key]))
      && Object.entries(palettes).every(([key, entries]) => entries.some((entry) => entry.id === value[key]))
      && rangeKeys.every((key) => Number.isInteger(value[key]) && value[key] >= 60
        && value[key] <= 140 && value[key] % 10 === 0);
  }

  function randomDefinition(random = Math.random) {
    const pickIndex = (length) => {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new Error("Mob random source must return a number from zero up to, but not including, one.");
      }
      return Math.floor(value * length);
    };
    const definition = { ...defaults };
    for (const [key, entries] of Object.entries({ ...options, ...palettes })) {
      definition[key] = entries[pickIndex(entries.length)].id;
    }
    for (const key of rangeKeys) definition[key] = 60 + pickIndex(9) * 10;
    return definition;
  }

  function normalizeDefinition(value) {
    if (isDefinition(value)) return { ...value };
    if (value !== null && typeof value === "object" && !Array.isArray(value)
      && (value.version === 5 || value.version === 6)) {
      if (!Object.hasOwn(value, "horseMuzzle") || !["slender", "soft"].includes(value.horseMuzzle)
        || (value.version === 5 ? Object.hasOwn(value, "lionEars") : !Object.hasOwn(value, "lionEars"))) {
        throw new Error("Invalid mob definition.");
      }
      const { horseMuzzle, ...fields } = value;
      const upgraded = { ...fields, version: defaults.version,
        lionEars: value.version === 5 ? defaults.lionEars : value.lionEars };
      if (isDefinition(upgraded)) return upgraded;
      throw new Error("Invalid mob definition.");
    }
    const faceDefaults = Object.fromEntries(facePartKeys.map((key) => [key, defaults[key]]));
    if (value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === versionFourKeys.length
      && versionFourKeys.every((key) => Object.hasOwn(value, key))
      && value.format === defaults.format && value.version === 4
      && Object.entries(options).filter(([key]) => !facePartKeys.includes(key))
        .every(([key, entries]) => entries.some((entry) => entry.id === value[key]))
      && Object.entries(palettes).every(([key, entries]) => entries.some((entry) => entry.id === value[key]))
      && rangeKeys.every((key) => Number.isInteger(value[key]) && value[key] >= 60
        && value[key] <= 140 && value[key] % 10 === 0)) {
      return { ...value, ...faceDefaults, version: defaults.version };
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === versionThreeKeys.length
      && versionThreeKeys.every((key) => Object.hasOwn(value, key))
      && value.format === defaults.format && value.version === 3
      && Object.entries(options).filter(([key]) => key !== "faceType" && !facePartKeys.includes(key))
        .every(([key, entries]) => entries.some((entry) => entry.id === value[key]))
      && Object.entries(palettes).every(([key, entries]) => entries.some((entry) => entry.id === value[key]))
      && rangeKeys.every((key) => Number.isInteger(value[key]) && value[key] >= 60
        && value[key] <= 140 && value[key] % 10 === 0)) {
      return { ...value, ...faceDefaults, version: defaults.version, faceType: defaults.faceType };
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === versionTwoKeys.length
      && versionTwoKeys.every((key) => Object.hasOwn(value, key))
      && value.format === defaults.format && value.version === 2
      && Object.entries(options).filter(([key]) => key !== "faceType" && !facePartKeys.includes(key))
        .every(([key, entries]) => entries.some((entry) => entry.id === value[key]))
      && Object.entries(palettes).filter(([key]) => key !== "eyeColor")
        .every(([key, entries]) => entries.some((entry) => entry.id === value[key]))
      && rangeKeys.every((key) => Number.isInteger(value[key]) && value[key] >= 60
        && value[key] <= 140 && value[key] % 10 === 0)) {
      return { ...value, ...faceDefaults, version: defaults.version,
        faceType: defaults.faceType, eyeColor: defaults.eyeColor };
    }
    const legacyKeys = ["format", "version", "archetype", "body", "belly", "accent", "eyes", "ears", "tail", "wings"];
    if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== legacyKeys.length
      || legacyKeys.some((key) => !Object.hasOwn(value, key))
      || value.format !== "moneycraft-mob" || value.version !== 1
      || Object.entries(legacyOptions).some(([key, ids]) => !ids.includes(value[key]))
      || Object.entries(palettes).filter(([key]) => key !== "eyeColor")
        .some(([key, entries]) => !entries.some((entry) => entry.id === value[key]))) {
      throw new Error("Invalid mob definition.");
    }
    return {
      ...defaults,
      stance: value.archetype === "biped" ? "biped" : "quadruped",
      body: value.body,
      belly: value.belly,
      accent: value.accent,
      eyes: value.eyes === "sleepy" ? "sleepy" : "round",
      tail: value.tail === "none" ? "none" : "long",
      wings: value.wings === "large" ? "broad" : value.wings,
      horns: value.ears === "horns" ? "short" : "none",
      backSpines: value.archetype === "slime" || value.archetype === "floating" ? "none" : defaults.backSpines,
    };
  }

  function addOrientedSegment(boxes, part, start, end, width, depth, tint) {
    const direction = end.map((value, axis) => value - start[axis]);
    const length = Math.hypot(...direction);
    if (length === 0) throw new Error("Mob skeleton segment cannot have zero length.");
    const yAxis = direction.map((value) => value / length);
    const reference = Math.abs(yAxis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const normalize = (axis) => {
      const magnitude = Math.hypot(...axis);
      return axis.map((value) => value / magnitude);
    };
    const xAxis = normalize(cross(yAxis, reference));
    const zAxis = normalize(cross(xAxis, yAxis));
    boxes.push({
      part,
      min: [-width / 2, 0, -depth / 2],
      max: [width / 2, length, depth / 2],
      color: tint,
      frame: { origin: start, axes: [xAxis, yAxis, zAxis] },
    });
  }

  function addHornParts(boxes, addBox, definition, headWidth, headMaxY, headCenter, headScale, tint) {
    if (definition.horns === "none") return;
    for (const side of [-1, 1]) {
      const root = [side * headWidth * 0.68, headMaxY - 0.015 * headScale,
        headCenter[2] - 0.08 * headScale];
      addBox(`horn-root-${side}`, root, [0.075 * headScale, 0.06 * headScale,
        0.07 * headScale], tint);
      let paths;
      if (definition.horns === "short") {
        paths = [[root, [root[0] + side * 0.035, root[1] + 0.18 * headScale,
          root[2] - 0.015 * headScale]]];
      } else if (definition.horns === "curved") {
        paths = [
          [root, [root[0] + side * 0.035, root[1] + 0.22 * headScale, root[2]]],
          [[root[0] + side * 0.035, root[1] + 0.22 * headScale, root[2]],
            [root[0] + side * 0.13, root[1] + 0.32 * headScale, root[2] - 0.12 * headScale]],
        ];
      } else if (definition.horns === "large") {
        paths = [[root, [root[0] + side * 0.08, root[1] + 0.52 * headScale,
          root[2] - 0.04 * headScale]]];
      } else if (definition.horns === "swept") {
        paths = [
          [root, [root[0] + side * 0.05, root[1] + 0.24 * headScale,
            root[2] - 0.12 * headScale]],
          [[root[0] + side * 0.05, root[1] + 0.24 * headScale, root[2] - 0.12 * headScale],
            [root[0] + side * 0.16, root[1] + 0.38 * headScale, root[2] - 0.34 * headScale]],
        ];
      } else {
        const outer = [root[0] + side * 0.1, root[1] + 0.43 * headScale,
          root[2] - 0.08 * headScale];
        const inner = [root[0] - side * 0.08, root[1] + 0.32 * headScale,
          root[2] + 0.015 * headScale];
        paths = [
          [root, outer],
          [root, inner],
          [inner, [inner[0] - side * 0.025, inner[1] + 0.17 * headScale,
            inner[2] - 0.06 * headScale]],
        ];
      }
      for (const [index, [start, end]] of paths.entries()) {
        addOrientedSegment(boxes, `horn-${side}-${index}`, start, end,
          (index === paths.length - 1 ? 0.075 : 0.11) * headScale,
          0.1 * headScale, tint);
      }
    }
  }

  function addWingParts(addBox, boxes, skeleton, definition, body, membrane) {
    for (const [index, wing] of skeleton.wingRoots.entries()) {
      const side = index === 0 ? -1 : 1;
      addOrientedSegment(boxes, `wing-arm-root-${side}`, wing.root, wing.elbow, 0.09, 0.09, body);
      addOrientedSegment(boxes, `wing-arm-tip-${side}`, wing.elbow, wing.tip, 0.065, 0.065, body);
      addBox(`wing-joint-${side}`, wing.elbow, [0.065, 0.065, 0.065], body);
      const rear = [side * skeleton.bodyWidth * 0.18, wing.root[1] - 0.28,
        wing.root[2] - wing.rearSpan];
      const surfaces = [wing.root, wing.elbow, wing.tip, rear].map((point) => [
        [point[0], point[1] + 0.018, point[2]],
        [point[0], point[1] - 0.018, point[2]],
      ]);
      const vertices = [...surfaces.map(([front]) => front), ...surfaces.map(([, back]) => back)];
      const panel = {
        part: `wing-panel-${side}`,
        min: [0, 1, 2].map((axis) => Math.min(...vertices.map((point) => point[axis]))),
        max: [0, 1, 2].map((axis) => Math.max(...vertices.map((point) => point[axis]))),
        color: membrane,
        vertices,
        faces: [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]],
      };
      boxes.push(panel);
    }
    if (definition.wings === "none" && skeleton.wingRoots.length !== 0) {
      throw new Error("Mob skeleton has wing anchors without wings.");
    }
  }

  function createSkeleton(definition) {
    if (!isDefinition(definition)) throw new Error("Invalid mob definition.");
    const dimensions = faceDimensions(definition);
    const bodyLength = definition.bodyLength / 100;
    const headScale = definition.headScale / 100;
    const neckScale = definition.neckLength / 100;
    const bodyWidth = definition.bodyShape === "sleek" ? 0.25
      : definition.bodyShape === "stocky" ? 0.4 : 0.32;
    const bodyHeight = definition.bodyShape === "stocky" ? 0.45 : 0.36;
    const bodyCenterY = definition.stance === "quadruped" ? 0.62 : 0.82;
    const bodyFront = 0.42 * bodyLength;
    const bodyBack = -0.58 * bodyLength;
    const neckHeight = (definition.neckShape === "long" ? 0.45
      : definition.neckShape === "low" ? 0.12 : 0.28) * neckScale;
    const neckCount = definition.neckShape === "long" ? 3 : 2;
    const neckBaseY = bodyCenterY + bodyHeight * 0.32;
    const neckTopY = neckBaseY + neckHeight + neckHeight / neckCount * 0.62;
    const headHeight = (definition.faceType === "lion" ? 0.4 : 0.25) * headScale;
    const headMinY = neckTopY - 0.02 * headScale;
    const headCenterY = headMinY + 0.45 * headHeight;
    const neckForward = definition.neckShape === "low" ? 0.18 : 0.04;
    const headCenterZ = bodyFront + 0.22 + neckForward + neckHeight * 0.25;
    const headDepth = 0.27 * headScale;
    const headFront = headCenterZ + headDepth;
    const snoutLength = dimensions.snoutLength;
    const snoutBaseY = headCenterY - 0.025 * headScale;
    const hipY = bodyCenterY - bodyHeight * 0.32;
    const shoulderY = bodyCenterY + bodyHeight * 0.38;
    const tailRoot = [0, bodyCenterY - 0.04, bodyBack * 0.72];
    const legRoots = definition.stance === "quadruped"
      ? [-1, 1].flatMap((side) => [
        [side * bodyWidth * 0.68, hipY, bodyBack * 0.65],
        [side * bodyWidth * 0.68, hipY, bodyFront * 0.58],
      ])
      : [-1, 1].map((side) => [side * bodyWidth * 0.58, hipY, bodyBack * 0.08]);
    const wingSpan = definition.wings === "broad" ? 1.05 : 0.68;
    const wingArmScale = 1.5;
    const wingRootY = bodyCenterY + bodyHeight * 0.52;
    const wingRootZ = bodyFront * 0.06 + (bodyFront + neckForward - bodyFront * 0.06) * 0.3;
    const wingRoots = definition.wings === "none" ? [] : [-1, 1].map((side) => ({
      root: [side * bodyWidth * 0.42, wingRootY, wingRootZ],
      elbow: [side * bodyWidth * 0.42 + side * wingSpan * 0.42 * wingArmScale,
        wingRootY + 0.12 * wingArmScale, wingRootZ - 0.12 * wingArmScale],
      tip: [side * bodyWidth * 0.42 + side * wingSpan * 0.42 * wingArmScale
        + side * wingSpan * 0.58 * wingArmScale,
      wingRootY + 0.12 * wingArmScale - 0.04 * wingArmScale,
      wingRootZ - 0.12 * wingArmScale - 0.36 * wingArmScale],
      rearSpan: (wingSpan + 0.48) * 0.7,
    }));
    return Object.freeze({
      bodyCenter: Object.freeze([0, bodyCenterY, (bodyFront + bodyBack) / 2]),
      pelvis: Object.freeze([0, hipY, bodyBack * 0.08]),
      shoulders: Object.freeze([0, shoulderY, bodyFront * 0.42]),
      neckBase: Object.freeze([0, neckBaseY, bodyFront + neckForward]),
      neckTop: Object.freeze([0, neckTopY, bodyFront + neckForward + neckHeight * 0.35]),
      head: Object.freeze([0, headCenterY, headCenterZ]),
      snout: Object.freeze([0, snoutBaseY, headFront]),
      jawPivot: Object.freeze([0, snoutBaseY - 0.06 * headScale, headFront - 0.06 * headScale]),
      tailRoot: Object.freeze(tailRoot),
      legRoots: Object.freeze(legRoots.map((point) => Object.freeze(point))),
      armRoots: Object.freeze([-1, 1].map((side) =>
        Object.freeze([side * bodyWidth * 0.9, shoulderY, bodyFront * 0.3]))),
      wingRoots: Object.freeze(wingRoots.map((wing) => Object.freeze({
        root: Object.freeze(wing.root),
        elbow: Object.freeze(wing.elbow),
        tip: Object.freeze(wing.tip),
        rearSpan: wing.rearSpan,
      }))),
      bodyWidth,
      bodyHeight,
      bodyFront,
      bodyBack,
      neckHeight,
      neckForward,
      neckCount,
      headWidth: 0.23 * headScale,
      headHeight,
      headDepth,
      headMinY,
      headMaxY: headCenterY + headHeight * 0.55,
      headFront,
      snoutLength,
      snoutBaseY,
    });
  }

  function createBipedBoxes(definition) {
    const skeleton = createSkeleton(definition);
    const color = (key) => palettes[key].find((entry) => entry.id === definition[key]).color;
    const body = color("body");
    const belly = color("belly");
    const accent = color("accent");
    const eyeColor = color("eyeColor");
    const boxes = [];
    const add = (part, min, max, tint) => boxes.push({ part, min, max, color: tint });
    const addBox = (part, center, half, tint) => add(part,
      center.map((value, axis) => value - half[axis]),
      center.map((value, axis) => value + half[axis]), tint);
    const addSegment = (part, start, end, radiusX, radiusY, radiusZ, tint) => add(part,
      [0, 1, 2].map((axis) => Math.min(start[axis], end[axis]) - [radiusX, radiusY, radiusZ][axis]),
      [0, 1, 2].map((axis) => Math.max(start[axis], end[axis]) + [radiusX, radiusY, radiusZ][axis]), tint);
    const { bodyWidth, bodyHeight, bodyFront, bodyBack, bodyCenter, neckCount,
      neckHeight, neckForward, headWidth, headHeight, headDepth, headMaxY,
      headFront, snoutLength, snoutBaseY } = skeleton;
    const [, centerY] = bodyCenter;
    const bodyLength = definition.bodyLength / 100;
    const headScale = definition.headScale / 100;
    const tailScale = definition.tailLength / 100;

    addBox("torso", bodyCenter, [bodyWidth, bodyHeight / 2, (bodyFront - bodyBack) / 2], body);
    addBox("pelvis", [0, centerY - bodyHeight * 0.3, bodyBack * 0.12],
      [bodyWidth * 0.86, bodyHeight * 0.3, 0.23 * bodyLength], body);
    addBox("chest", [0, centerY + bodyHeight * 0.2, bodyFront * 0.72],
      [bodyWidth * 0.82, bodyHeight * 0.36, 0.19], body);
    addBox("belly", [0, centerY - bodyHeight * 0.15, bodyFront * 0.1],
      [bodyWidth * 0.68, bodyHeight * 0.27, (bodyFront - bodyBack) * 0.37], belly);

    for (let index = 0; index < neckCount; index += 1) {
      const progress = (index + 1) / neckCount;
      const y = centerY + bodyHeight * 0.32 + neckHeight * progress;
      const z = bodyFront + neckForward + neckHeight * progress * 0.35;
      const radius = bodyWidth * (0.56 - progress * 0.18);
      addBox(`neck-${index + 1}`, [0, y, z],
        [radius, neckHeight / neckCount * 0.64, 0.14], body);
    }

    const headCenter = [0, skeleton.head[1], skeleton.head[2]];
    addBox("skull", headCenter, [headWidth, headHeight * 0.5, headDepth * 0.72], body);
    if (definition.faceType === "dragon" && definition.headShape === "armored") {
      for (const side of [-1, 1]) addBox("brow-armor",
        [side * headWidth * 0.72, headMaxY - 0.03, headFront - 0.05],
        [headWidth * 0.36, 0.055, 0.08], accent);
    } else if (definition.faceType === "dragon" && definition.headShape === "crest") {
      addBox("crest", [0, headMaxY + 0.105 * headScale, skeleton.head[2] + 0.08],
        [headWidth * 0.38, 0.12 * headScale, 0.13 * headScale], accent);
    }

    addFaceModel(add, addBox, boxes, definition, skeleton, body, belly, accent, eyeColor);

    const legProfile = definition.limbs === "small" ? { width: 0.085, height: 0.34 }
      : definition.limbs === "long" ? { width: 0.1, height: 0.62 } : { width: 0.12, height: 0.48 };
    for (const [index, root] of skeleton.legRoots.entries()) {
      const [x, hipY, z] = root;
      const knee = [x, hipY * 0.55, z + 0.04];
      const ankle = [x, 0.13, z + 0.09];
      addSegment(`leg-upper-${index}`, root, knee, legProfile.width, legProfile.height * 0.22,
        legProfile.width, body);
      addSegment(`leg-lower-${index}`, knee, ankle, legProfile.width * 0.78,
        legProfile.height * 0.18, legProfile.width * 0.82, body);
      addBox(`foot-${index}`, [x, 0.075, z + 0.16],
        [legProfile.width * 0.88, 0.06, 0.13], body);
      for (const toe of [-1, 0, 1]) {
        addBox(`claw-${index}`, [x + toe * legProfile.width * 0.58, 0.04, z + 0.28],
          [0.02, 0.025, 0.055], definition.limbs === "small" ? belly : accent);
      }
    }
    for (const [index, root] of skeleton.armRoots.entries()) {
      const [x, shoulderY, z] = root;
      const elbow = [x * 1.55, shoulderY - 0.16, z + 0.02];
      const wrist = [x * 1.8, shoulderY - 0.34, z + 0.09];
      addSegment(`arm-upper-${index}`, root, elbow, 0.075, 0.075, 0.08, body);
      addSegment(`arm-lower-${index}`, elbow, wrist, 0.06, 0.065, 0.065, body);
      addBox(`hand-${index}`, [wrist[0], wrist[1] - 0.055, wrist[2] + 0.045],
        [0.065, 0.055, 0.065], body);
      addBox(`hand-claw-${index}`, [wrist[0], wrist[1] - 0.12, wrist[2] + 0.1],
        [0.02, 0.025, 0.04], accent);
    }

    if (definition.backSpines !== "none") {
      const count = definition.backSpines === "large" ? 4 : 7;
      for (let index = 0; index < count; index += 1) {
        const progress = index / (count - 1);
        const z = bodyBack * (1 - progress) + bodyFront * progress;
        const height = definition.backSpines === "large" ? 0.36 : 0.17;
        addBox(`back-spine-${index}`,
          [0, centerY + bodyHeight * 0.36 + height * 0.44, z],
          [definition.backSpines === "large" ? 0.19 : 0.105, height * 0.56, 0.09], accent);
      }
    }

    if (definition.tail !== "none") {
      const length = (definition.tail === "club" ? 0.72 : definition.tail === "spade" ? 0.76 : 0.82) * tailScale;
      const segments = 4;
      for (let index = 0; index < segments; index += 1) {
        const progress = index / segments;
        const next = (index + 1) / segments;
        const radius = 0.16 * (1 - progress * 0.78);
        const nextRadius = 0.16 * (1 - next * 0.78);
        const start = [0, skeleton.tailRoot[1] - progress * 0.12, skeleton.tailRoot[2] - progress * length];
        const end = [0, skeleton.tailRoot[1] - next * 0.12, skeleton.tailRoot[2] - next * length];
        addSegment(`tail-segment-${index}`, start, end, Math.max(radius, nextRadius),
          Math.max(radius, nextRadius), (end[2] - start[2]) * -0.5, body);
      }
      const tailEnd = skeleton.tailRoot[2] - length;
      if (definition.tail === "club") {
        addBox("tail-club", [0, skeleton.tailRoot[1] - 0.13, tailEnd],
          [0.27, 0.18, 0.22], accent);
      } else if (definition.tail === "spade") {
        addBox("tail-fin", [0, skeleton.tailRoot[1] - 0.04, tailEnd],
          [0.26, 0.04, 0.17], accent);
      }
    }

    addWingParts(addBox, boxes, skeleton, definition, accent, belly);
    return boxes;
  }

  function createBoxes(definition) {
    if (!isDefinition(definition)) throw new Error("Invalid mob definition.");
    if (definition.stance === "biped") return createBipedBoxes(definition);
    const skeleton = createSkeleton(definition);
    const color = (key) => palettes[key].find((entry) => entry.id === definition[key]).color;
    const body = color("body");
    const belly = color("belly");
    const accent = color("accent");
    const eyeColor = color("eyeColor");
    const boxes = [];
    const add = (part, min, max, tint) => boxes.push({ part, min, max, color: tint });
    const headScale = definition.headScale / 100;
    const tailScale = definition.tailLength / 100;
    const { bodyWidth, bodyHeight, bodyFront, bodyBack } = skeleton;
    const bodyCenter = skeleton.bodyCenter[1];
    const addBox = (part, center, half, tint) => add(part,
      center.map((value, axis) => value - half[axis]),
      center.map((value, axis) => value + half[axis]), tint);
    add("torso", [-bodyWidth, bodyCenter - bodyHeight / 2, bodyBack],
      [bodyWidth, bodyCenter + bodyHeight / 2, bodyFront], body);
    add("chest", [-bodyWidth * 0.86, bodyCenter - bodyHeight * 0.22, bodyFront - 0.19],
      [bodyWidth * 0.86, bodyCenter + bodyHeight * 0.38, bodyFront + 0.09], body);
    add("belly", [-bodyWidth * 0.65, bodyCenter - bodyHeight * 0.35, bodyBack * 0.25],
      [bodyWidth * 0.65, bodyCenter - bodyHeight * 0.02, bodyFront * 0.7], belly);

    const neckHeight = skeleton.neckHeight;
    const neckForward = skeleton.neckForward;
    const neckCount = skeleton.neckCount;
    const neckTop = bodyCenter + bodyHeight * 0.32 + neckHeight
      + neckHeight / neckCount * 0.62;
    const headMinY = skeleton.headMinY;
    const headCenterY = skeleton.head[1];
    const headCenterZ = skeleton.head[2];
    for (let index = 0; index < neckCount; index += 1) {
      const progress = (index + 1) / neckCount;
      const y = bodyCenter + bodyHeight * 0.32 + neckHeight * progress;
      const z = bodyFront + neckForward + neckHeight * progress * 0.35;
      const radius = bodyWidth * (0.56 - progress * 0.18);
      add(`neck-${index + 1}`, [-radius, y - neckHeight / neckCount * 0.62, z - 0.13],
        [radius, y + neckHeight / neckCount * 0.62, z + 0.13], body);
    }

    const headWidth = skeleton.headWidth;
    const headHeight = skeleton.headHeight;
    const headDepth = skeleton.headDepth;
    const headMaxY = headCenterY + headHeight * 0.55;
    const headFront = skeleton.headFront;
    add("skull", [-headWidth, headMinY, headCenterZ - headDepth * 0.72],
      [headWidth, headMaxY, headFront], body);
    addFaceModel(add, (part, center, half, tint) => add(part,
      center.map((value, axis) => value - half[axis]),
      center.map((value, axis) => value + half[axis]), tint),
    boxes, definition, skeleton, body, belly, accent, eyeColor);

    const legWidth = definition.limbs === "small" ? 0.105
      : definition.limbs === "long" ? 0.13 : 0.17;
    for (const root of skeleton.legRoots) {
      const side = root[0] < 0 ? -1 : 1;
      const isFront = root[2] > 0;
      const label = `${side}-${isFront ? "front" : "back"}`;
      const knee = [root[0] * 1.02, root[1] - (isFront ? 0.17 : 0.12),
        root[2] + (isFront ? -0.02 : 0.06)];
      const ankle = [root[0] * 0.96, 0.12, root[2] + (isFront ? 0.06 : 0.18)];
      addOrientedSegment(boxes, `leg-upper-${label}`, root, knee, legWidth * 2,
        legWidth * 1.6, body);
      addBox(`leg-joint-${label}`, knee, [legWidth * 0.8, legWidth * 0.8, legWidth * 0.8], body);
      addOrientedSegment(boxes, `leg-lower-${label}`, knee, ankle, legWidth * 1.3,
        legWidth * 1.2, body);
      const foot = [ankle[0], 0.075, ankle[2] + 0.07];
      addBox(`foot-${label}`, foot, [legWidth * 0.95, 0.075, 0.19], accent);
      for (const toe of [-1, 0, 1]) {
        addBox(`claw-${label}-${toe}`, [foot[0] + toe * legWidth * 0.82, 0.045, foot[2] + 0.17],
          [0.025, 0.035, 0.09], definition.limbs === "small" ? belly : accent);
      }
    }
    if (definition.backSpines !== "none") {
      const count = definition.backSpines === "large" ? 4 : 7;
      for (let index = 0; index < count; index += 1) {
        const progress = index / (count - 1);
        const z = bodyBack * (1 - progress) + bodyFront * progress;
        const height = definition.backSpines === "large" ? 0.36 : 0.17;
        const width = definition.backSpines === "large" ? 0.19 : 0.105;
        add(`back-spine-${index}`, [-width, bodyCenter + bodyHeight * 0.36, z - 0.09],
          [width, bodyCenter + bodyHeight * 0.36 + height * (1 - Math.abs(progress - 0.5) * 0.7),
            z + 0.09], accent);
      }
    }

    if (definition.tail !== "none") {
      const length = (definition.tail === "club" ? 0.72 : definition.tail === "spade" ? 0.76 : 0.82) * tailScale;
      const segments = 4;
      for (let index = 0; index < segments; index += 1) {
        const start = index / segments;
        const end = (index + 1) / segments;
        const radius = 0.16 * (1 - start * 0.78);
        const y = bodyCenter - 0.03 - start * 0.12;
        const z = bodyBack - start * length;
        add(`tail-segment-${index}`, [-radius, y - radius, z - length / segments * 0.55],
          [radius, y + radius, z + length / segments * 0.25], body);
      }
      if (definition.tail === "club") {
        add("tail-club", [-0.27, bodyCenter - 0.2, bodyBack - length - 0.13],
          [0.27, bodyCenter + 0.16, bodyBack - length + 0.09], accent);
      } else if (definition.tail === "spade") {
        add("tail-fin", [-0.26, bodyCenter - 0.04, bodyBack - length - 0.12],
          [0.26, bodyCenter + 0.04, bodyBack - length + 0.12], accent);
      }
    }
    addWingParts((part, center, half, tint) => addBox(part, center, half, tint),
      boxes, skeleton, definition, accent, belly);
    return boxes;
  }

  function rotatePoint(point, pivot, axis, angle) {
    const [x, y, z] = point.map((value, index) => value - pivot[index]);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    let rotated;
    if (axis === "x") rotated = [x, y * cosine - z * sine, y * sine + z * cosine];
    else if (axis === "y") rotated = [x * cosine + z * sine, y, -x * sine + z * cosine];
    else rotated = [x * cosine - y * sine, x * sine + y * cosine, z];
    return rotated.map((value, index) => value + pivot[index]);
  }

  function animatePoint(point, part, phase, definition, skeleton, animation) {
    let animated = point;
    if (/^(lower-jaw$|chin$|mouth-interior$)/.test(part)) {
      const jawLength = skeleton.snoutLength + 0.045 * (definition.headScale / 100);
      const jawRise = skeleton.snout[1] - skeleton.jawPivot[1];
      const closedAngle = -Math.asin(Math.min(0.35, jawRise / jawLength));
      const threatOpen = phase === null ? 0 : animation === "breath"
        ? breathIntensity(phase) * 0.7 : animation === "roar" ? threatIntensity(phase) * 0.92 : 0;
      const openAngle = Math.max(definition.jawPose === "open" ? 0.62 : 0, threatOpen);
      animated = rotatePoint(animated, skeleton.jawPivot, "x", closedAngle + openAngle);
    }
    if (phase === null) return animated;
    if (["stomp", "tail-sweep", "wing-retreat-land", "wing-retreat-hover", "hover", "aerial-charge"].includes(animation)) return animated;
    const headPart = /^(?:face-|neck-|skull$|brow-armor$|crest$|upper-snout$|beak-tip$|nose$|eye|pupil$|lower-jaw$|chin$|mouth-interior$|upper-tooth$|horn|griffin-|lion-|horse-|creature-|front-)/.test(part);
    const neckAngle = animation === "breath" ? 0.42 * breathIntensity(phase)
      : animation === "roar" ? -0.14 * threatIntensity(phase)
        : Math.sin(phase * Math.PI * 2 - Math.PI / 3) * 0.09;
    if (part.startsWith("horse-mane-")) {
      if (part === "horse-mane-back-root") return animated;
      // The mane follows the nod near the head and stays anchored at the back.
      const backY = skeleton.bodyCenter[1] + skeleton.bodyHeight * 0.5;
      const weight = Math.max(0, Math.min(1,
        (point[1] - backY) / (skeleton.neckTop[1] - backY)));
      return rotatePoint(animated, skeleton.neckBase, "x", neckAngle * weight);
    }
    if (animation === "breath") {
      const intensity = breathIntensity(phase);
      if (headPart) return rotatePoint(animated, skeleton.neckBase, "x", neckAngle);
      const frontLeg = part.match(/^(?:leg-upper|leg-lower|leg-joint|foot|claw)-(-1|1)-front/);
      if (frontLeg) {
        const side = Number(frontLeg[1]);
        const root = skeleton.legRoots.find((candidate) => Math.sign(candidate[0]) === side && candidate[2] > 0);
        // Spread continuously from the hip to the planted foot without lifting the sole.
        const weight = Math.max(0, Math.min(1, (root[1] - point[1]) / root[1]));
        return [animated[0] + side * skeleton.bodyWidth * 0.4 * intensity * weight, animated[1], animated[2]];
      }
      const arm = part.match(/^(?:arm-upper|arm-lower|hand|hand-claw)-([01])$/);
      if (arm) {
        const side = Number(arm[1]) === 0 ? -1 : 1;
        return rotatePoint(animated, skeleton.armRoots[Number(arm[1])], "z", side * 0.35 * intensity);
      }
      return animated;
    }
    if (animation === "roar") {
      if (headPart) animated = rotatePoint(animated, skeleton.neckBase, "x", neckAngle);
      return animated;
    }
    if (headPart) animated = rotatePoint(animated, skeleton.neckBase, "x", neckAngle);

    const quadrupedLeg = part.match(/^(leg-upper|leg-lower|leg-joint|foot|claw)-(-1|1)-(front|back)/);
    const bipedLeg = part.match(/^(leg-upper|leg-lower|foot|claw)-([01])$/);
    if (quadrupedLeg || bipedLeg) {
      const match = quadrupedLeg || bipedLeg;
      const upper = match[1] === "leg-upper";
      const side = quadrupedLeg ? Number(match[2]) : (Number(match[2]) === 0 ? -1 : 1);
      const front = quadrupedLeg ? match[3] === "front" : true;
      const root = quadrupedLeg
        ? skeleton.legRoots.find((candidate) =>
          Math.sign(candidate[0]) === side && (candidate[2] > 0) === front)
        : skeleton.legRoots[Number(match[2])];
      if (root) {
        const cycle = phase * Math.PI * 2 + (side === (front ? 1 : -1) ? 0 : Math.PI);
        const swing = Math.sin(cycle) * 0.32;
        const knee = quadrupedLeg
          ? [root[0] * 1.02, root[1] - (front ? 0.17 : 0.12),
            root[2] + (front ? -0.02 : 0.06)]
          : [root[0], root[1] * 0.55, root[2] + 0.04];
        animated = rotatePoint(animated, root, "x", swing);
        if (!upper) animated = rotatePoint(animated,
          rotatePoint(knee, root, "x", swing), "x", -Math.max(0, Math.sin(cycle)) * 0.28);
      }
    }

    const wing = part.match(/^wing-(?:arm-root|arm-tip|joint|panel)-(-1|1)$/);
    if (wing) {
      const side = Number(wing[1]);
      const anchors = skeleton.wingRoots.find((entry) => Math.sign(entry.root[0]) === side);
      if (anchors) {
        const flap = Math.sin(phase * Math.PI * 2) * 0.55 * side;
        animated = rotatePoint(animated, anchors.root, "z", flap);
        if (part.startsWith("wing-arm-tip") || part.startsWith("wing-panel") || part.startsWith("wing-joint")) {
          animated = rotatePoint(animated, rotatePoint(anchors.elbow, anchors.root, "z", flap),
            "z", Math.sin(phase * Math.PI * 2 + Math.PI / 3) * 0.3 * side);
        }
      }
    }

    const tail = part.match(/^tail-(?:segment-(\d+)|club|fin)$/);
    if (tail) {
      const segment = tail[1] === undefined ? 4 : Number(tail[1]);
      const sway = Math.sin(phase * Math.PI * 2 + segment * 0.16) * 0.12 * (segment + 1);
      animated = rotatePoint(animated, skeleton.tailRoot, "y", sway);
    }
    return animated;
  }

  function threatIntensity(phase) {
    const smooth = (value) => value * value * (3 - 2 * value);
    if (phase < 0.18) return smooth(phase / 0.18);
    if (phase < 0.46) return 1;
    if (phase < 0.72) return 1 - smooth((phase - 0.46) / 0.26);
    return 0;
  }

  function breathIntensity(phase) {
    const smooth = (value) => value * value * (3 - 2 * value);
    if (phase < 0.25) return smooth(phase / 0.25);
    if (phase < 0.65) return 1;
    if (phase < 0.95) return 1 - smooth((phase - 0.65) / 0.3);
    return 0;
  }

  function stompPose(phase) {
    const smooth = (value) => value * value * (3 - 2 * value);
    const rise = phase < 0.32 ? smooth(phase / 0.32)
      : phase < 0.45 ? 1 : phase < 0.62 ? 1 - smooth((phase - 0.45) / 0.17) : 0;
    const impact = phase < 0.62 ? 0 : phase < 0.7 ? smooth((phase - 0.62) / 0.08)
      : phase < 0.92 ? 1 - smooth((phase - 0.7) / 0.22) : 0;
    const lookDown = phase < 0.45 ? 0 : phase < 0.62 ? smooth((phase - 0.45) / 0.17)
      : phase < 0.7 ? 1 : impact;
    return { rise, impact, gazePitch: rise * 0.18 + lookDown * 0.36 };
  }

  function tailSweepPose(phase) {
    const smooth = (value) => value * value * (3 - 2 * value);
    const charge = phase < 0.3 ? smooth(phase / 0.3) : 0;
    const turn = phase < 0.3 ? 0 : phase < 0.78 ? smooth((phase - 0.3) / 0.48) : 1;
    const recover = phase < 0.78 ? 1 : phase < 0.95 ? 1 - smooth((phase - 0.78) / 0.17) : 0;
    const active = phase < 0.3 ? charge : recover;
    return {
      active,
      yaw: phase < 0.3 ? -0.22 * charge : phase < 0.78 ? -0.22 + (Math.PI * 2 + 0.22) * turn : 0,
      gazeYaw: active * 0.4,
      tailYaw: phase < 0.3 ? -0.4 * charge
        : phase < 0.78 ? -0.4 * (1 - turn) + Math.sin(turn * Math.PI) * 0.55 : 0,
    };
  }

  function wingRetreatPose(phase, hover) {
    const smooth = (value) => value * value * (3 - 2 * value);
    const ramp = (start, end) => smooth(Math.max(0, Math.min(1, (phase - start) / (end - start))));
    const windup = ramp(0, 0.25);
    const fan = ramp(0.25, 0.43);
    const flight = ramp(0.38, 0.78);
    const settle = ramp(0.78, 1);
    const compression = phase < 0.9 ? ramp(0.78, 0.9) : 1 - ramp(0.9, 1);
    const pose = {
      wingLift: phase < 0.25 ? windup * 0.95
        : phase < 0.43 ? 0.95 - fan * 1.25
          : -0.3 + ramp(0.43, 0.78) * 0.65 - (hover ? 0 : settle * 0.35),
      wingForward: phase < 0.43 ? -windup * 0.35 + fan * 0.95
        : 0.6 * (1 - ramp(0.43, 0.78)),
      height: hover ? flight * 0.85 : Math.sin(flight * Math.PI) * 0.85,
      back: flight * 1.2,
      tuck: hover ? flight : Math.sin(flight * Math.PI),
      crouch: windup * (1 - fan) * 0.04 + (hover ? 0 : compression * 0.07),
      pitch: phase < 0.43 ? fan * -0.12 : -0.12 * (1 - ramp(0.43, 0.78)),
      gaze: hover ? flight * 0.12 : compression * 0.18,
      neckBend: 0, tailPitch: 0, limbBack: 0,
    };
    if (hover) {
      const target = hoverPose(0);
      for (const key of Object.keys(pose)) pose[key] += (target[key] - pose[key]) * settle;
    }
    return pose;
  }

  function hoverPose(phase) {
    const wave = Math.cos(phase * Math.PI * 2);
    return {
      wingLift: 0.35 + wave * 0.55, wingForward: 0,
      height: 0.85 + wave * 0.06, back: 1.2, tuck: 1, crouch: 0,
      pitch: -Math.PI / 4 + (wave - 1) * 0.015, gaze: 0.55,
      neckBend: 0.48, tailPitch: wave * 0.12,
      limbBack: (Math.PI / 4 - (wave - 1) * 0.015) * 1.4,
    };
  }

  function aerialChargePose(phase, startHoverPhase, skeleton) {
    const start = hoverPose(startHoverPhase);
    const windup = { ...start, wingLift: 1.1, wingForward: -0.2, height: 1.18,
      back: 1.35, pitch: -0.5, gaze: 0.25, neckBend: 0.28, tailPitch: -0.1, limbBack: 0.7 };
    const dive = { ...windup, wingLift: -0.1, wingForward: 1.2, height: 1.2,
      pitch: 0.22, gaze: 0.28, neckBend: 0, tailPitch: 0.08, limbBack: 0.45 };
    const landed = { wingLift: 0, wingForward: 0, height: 0, back: -1.2,
      tuck: 0, crouch: 0, pitch: 0, gaze: 0.18, neckBend: 0, tailPitch: 0, limbBack: 0 };
    const compressed = { ...landed, crouch: 0.09 };
    const recovered = { ...landed, gaze: 0 };
    const keys = [
      [0, start], [0.25, windup], [0.4, dive],
      [0.7, landed], [0.76, compressed], [0.9, compressed], [1, recovered],
    ];
    for (let index = 1; index < keys.length; index++) {
      const [end, target] = keys[index];
      if (phase > end) continue;
      const [begin, source] = keys[index - 1];
      const fraction = (phase - begin) / (end - begin);
      const blend = fraction * fraction * (3 - 2 * fraction);
      const pose = {};
      for (const key of Object.keys(source)) pose[key] = source[key] + (target[key] - source[key]) * blend;
      if (phase >= 0.7) {
        const slide = Math.min(1, (phase - 0.7) / 0.2);
        pose.back -= (skeleton.bodyFront - skeleton.bodyBack) * 0.5 * (1 - (1 - slide) ** 2);
      }
      return pose;
    }
    return recovered;
  }

  function stageScale(definition, stage = "pet") {
    if (!["pet", "baby", "enemy"].includes(stage)) throw new Error("Invalid mob stage.");
    const boxes = createBoxes(definition);
    if (stage === "baby") return 0.5;
    if (stage === "pet") return 1;
    const feet = boxes.filter(({ part }) => part.startsWith("foot-"));
    const area = Math.min(...feet.map(({ min, max }) => (max[0] - min[0]) * (max[2] - min[2])));
    if (!Number.isFinite(area) || area <= 0) throw new Error("Mob has no valid foot contact area.");
    return Math.sqrt(1.5 / area);
  }

  function createMesh(definition, phase = null, animation = "walk", stage = "pet", startHoverPhase = 0) {
    if (phase !== null && (!Number.isFinite(phase) || phase < 0 || phase > 1)) {
      throw new Error("Mob animation phase must be between zero and one.");
    }
    if (!Number.isFinite(startHoverPhase) || startHoverPhase < 0 || startHoverPhase > 1) {
      throw new Error("Mob starting hover phase must be between zero and one.");
    }
    if (!["walk", "roar", "breath", "stomp", "tail-sweep", "wing-retreat-land", "wing-retreat-hover", "hover", "aerial-charge"].includes(animation)) {
      throw new Error("Invalid mob animation.");
    }
    const wingRetreat = ["wing-retreat-land", "wing-retreat-hover", "hover", "aerial-charge"].includes(animation);
    if (["breath", "stomp", "tail-sweep"].includes(animation) || wingRetreat) {
      if (stage !== "enemy") throw new Error("Combat animation requires enemy stage.");
    }
    if (wingRetreat && definition.wings === "none") {
      throw new Error("Flight animation requires wings.");
    }
    const skeleton = createSkeleton(definition);
    const scale = stageScale(definition, stage);
    const brace = animation === "breath" && phase !== null ? breathIntensity(phase) : 0;
    const recoil = animation === "breath" && phase >= 0.25 && phase < 0.65
      ? Math.sin((phase - 0.25) / 0.4 * Math.PI * 3) ** 2 : 0;
    const bracePivot = [0, skeleton.pelvis[1], skeleton.bodyBack * 0.65];
    const bodyAngle = brace * 0.18 - recoil * 0.018;
    const headPivot = rotatePoint(
      rotatePoint(skeleton.neckTop, skeleton.neckBase, "x", brace * 0.42),
      bracePivot, "x", bodyAngle);
    headPivot[1] -= skeleton.bodyHeight * 0.08 * brace;
    headPivot[2] -= skeleton.bodyWidth * 0.06 * recoil;
    const stomp = animation === "stomp" && phase !== null ? stompPose(phase) : { rise: 0, impact: 0, gazePitch: 0 };
    const sweep = animation === "tail-sweep" && phase !== null ? tailSweepPose(phase) : null;
    const retreat = wingRetreat && phase !== null ? (animation === "hover" ? hoverPose(phase)
      : animation === "aerial-charge" ? aerialChargePose(phase, startHoverPhase, skeleton)
        : wingRetreatPose(phase, animation === "wing-retreat-hover")) : null;
    const facePartPattern = /^(?:face-|skull$|brow-armor$|crest$|upper-snout$|beak-tip$|nose$|eye|pupil$|lower-jaw$|chin$|mouth-interior$|upper-tooth$|horn|griffin-|lion-|horse-|creature-|front-)/;
    const neckPartPattern = /^(?:neck-|griffin-neck-|griffin-nape$|horse-mane-)/;
    const transform = (point, part, eyeCenter) => {
      if (stage === "baby" && eyeCenter) {
        point = point.map((value, axis) => eyeCenter[axis] + (value - eyeCenter[axis]) * (0.85 / 0.7));
      }
      let posed = animatePoint(point, part, phase, definition, skeleton, animation);
      if (retreat) {
        const wing = part.match(/^wing-(?:arm-root|arm-tip|joint|panel)-(-1|1)$/);
        if (wing) {
          const side = Number(wing[1]);
          const root = skeleton.wingRoots.find((entry) => Math.sign(entry.root[0]) === side).root;
          posed = rotatePoint(posed, root, "z", side * retreat.wingLift);
          posed = rotatePoint(posed, root, "y", -side * retreat.wingForward);
        }
        const neckPart = neckPartPattern.test(part);
        const facePart = facePartPattern.test(part) && !neckPart;
        if (neckPart || facePart) {
          const aim = retreat.gaze - retreat.pitch;
          const share = Math.max(0.15, Math.min(0.55,
            skeleton.neckHeight / (skeleton.headDepth + skeleton.headHeight) * 0.55));
          let weight = 1;
          if (part.startsWith("horse-mane-")) {
            const backY = skeleton.bodyCenter[1] + skeleton.bodyHeight * 0.5;
            weight = part === "horse-mane-back-root" ? 0 : Math.max(0, Math.min(1,
              (point[1] - backY) / (skeleton.neckTop[1] - backY)));
          }
          const neckAngle = aim * share + retreat.neckBend * (1 - share);
          posed = rotatePoint(posed, skeleton.neckBase, "x", neckAngle * weight);
          if (facePart) {
            const joint = rotatePoint(skeleton.neckTop, skeleton.neckBase, "x", neckAngle);
            posed = rotatePoint(posed, joint, "x", aim - neckAngle);
          }
        }
        if (/^tail-/.test(part)) {
          const weight = Math.max(0, Math.min(1,
            (skeleton.tailRoot[2] - point[2]) / (definition.tailLength / 100 * 0.8)));
          posed = rotatePoint(posed, skeleton.tailRoot, "x", retreat.tailPitch * weight);
        }
        const leg = /^(?:leg-(?:upper|lower|joint)|foot|claw)-/.test(part);
        const quadrupedLeg = part.match(/^(?:leg-upper|leg-lower|leg-joint|foot|claw)-(-1|1)-(front|back)/);
        const bipedLeg = part.match(/^(?:leg-upper|leg-lower|foot|claw)-([01])$/);
        let limbRoot = null;
        if (quadrupedLeg && quadrupedLeg[2] === "back") {
          limbRoot = skeleton.legRoots.find((root) => Math.sign(root[0]) === Number(quadrupedLeg[1])
            && root[2] < 0);
        } else if (bipedLeg) limbRoot = skeleton.legRoots[Number(bipedLeg[1])];
        if (limbRoot && retreat.limbBack > 0) {
          posed = rotatePoint(posed, limbRoot, "x", retreat.limbBack);
        }
        let weight = 1;
        if (/^(?:foot|claw)-/.test(part)) weight = retreat.tuck;
        else if (leg) {
          const hipWeight = Math.max(0, Math.min(1, (point[1] - 0.15) / (skeleton.pelvis[1] - 0.15)));
          weight = hipWeight + (1 - hipWeight) * retreat.tuck;
        }
        const tilted = rotatePoint(posed, skeleton.pelvis, "x", retreat.pitch);
        posed = posed.map((value, axis) => value + (tilted[axis] - value) * weight);
        posed[1] -= retreat.crouch * weight;
        if (leg) {
          const lowerWeight = Math.max(0, Math.min(1,
            (skeleton.pelvis[1] - point[1]) / skeleton.pelvis[1]));
          posed[1] += lowerWeight * retreat.tuck * 0.12;
        }
        posed[1] += retreat.height;
        posed[2] -= retreat.back;
      }
      if (sweep && sweep.active > 0) {
        const neckPart = neckPartPattern.test(part);
        const facePart = facePartPattern.test(part) && !neckPart;
        if (neckPart || facePart) {
          const neckShare = Math.max(0.15, Math.min(0.55,
            skeleton.neckHeight / (skeleton.headDepth + skeleton.headHeight) * 0.55));
          const neckYaw = sweep.gazeYaw * neckShare;
          let weight = 1;
          if (part.startsWith("horse-mane-")) {
            const backY = skeleton.bodyCenter[1] + skeleton.bodyHeight * 0.5;
            weight = part === "horse-mane-back-root" ? 0 : Math.max(0, Math.min(1,
              (point[1] - backY) / (skeleton.neckTop[1] - backY)));
          }
          posed = rotatePoint(posed, skeleton.neckBase, "y", neckYaw * weight);
          if (facePart) {
            const joint = rotatePoint(skeleton.neckTop, skeleton.neckBase, "y", neckYaw);
            posed = rotatePoint(posed, joint, "y", sweep.gazeYaw - neckYaw);
          }
        }
        if (/^tail-/.test(part)) {
          // Use distance, not segment IDs, so adjacent tail sections keep the same deformation.
          const weight = Math.max(0, Math.min(1,
            (skeleton.tailRoot[2] - point[2]) / (definition.tailLength / 100 * 0.8)));
          posed = rotatePoint(posed, skeleton.tailRoot, "y", sweep.tailYaw * weight);
        }
        const leg = /^(?:leg-(?:upper|lower|joint)|foot|claw)-/.test(part);
        let bodyWeight = 1;
        if (/^(?:foot|claw)-/.test(part)) bodyWeight = 0;
        else if (leg) bodyWeight = Math.max(0, Math.min(1,
          (point[1] - 0.15) / (skeleton.pelvis[1] - 0.15)));
        posed[1] -= skeleton.bodyHeight * 0.1 * sweep.active * bodyWeight;
        const frontLeg = part.match(/^(?:leg-(?:upper|lower|joint)|foot|claw)-(-1|1)-front/);
        if (frontLeg) {
          const footWeight = 1 - Math.max(0, Math.min(1, point[1] / skeleton.pelvis[1]));
          posed[0] += Number(frontLeg[1]) * skeleton.bodyWidth * 0.25 * sweep.active * footWeight;
        }
        const pivot = [0, skeleton.pelvis[1],
          definition.stance === "quadruped" ? skeleton.bodyFront * 0.58 : skeleton.pelvis[2]];
        posed = rotatePoint(posed, pivot, "y", sweep.yaw);
      }
      if (stomp.rise > 0 || stomp.impact > 0 || stomp.gazePitch > 0) {
        const quadruped = definition.stance === "quadruped";
        const pivot = quadruped ? bracePivot : skeleton.pelvis;
        const angle = -stomp.rise * (quadruped ? 0.95 : 0.18) + stomp.impact * 0.06;
        const neckPart = neckPartPattern.test(part);
        const facePart = facePartPattern.test(part) && !neckPart;
        if (neckPart || facePart) {
          const aim = stomp.gazePitch - angle;
          // Short necks retain clearance by sharing less pitch at the neck and more at the head.
          const neckShare = Math.max(0.15, Math.min(0.55,
            skeleton.neckHeight / (skeleton.headDepth + skeleton.headHeight) * 0.55));
          const neckAngle = aim * neckShare;
          let weight = 1;
          if (part.startsWith("horse-mane-")) {
            const backY = skeleton.bodyCenter[1] + skeleton.bodyHeight * 0.5;
            weight = part === "horse-mane-back-root" ? 0 : Math.max(0, Math.min(1,
              (point[1] - backY) / (skeleton.neckTop[1] - backY)));
          }
          posed = rotatePoint(posed, skeleton.neckBase, "x", neckAngle * weight);
          if (facePart) {
            const joint = rotatePoint(skeleton.neckTop, skeleton.neckBase, "x", neckAngle);
            posed = rotatePoint(posed, joint, "x", aim - neckAngle);
          }
        }
        const arm = part.match(/^(?:arm-upper|arm-lower|hand|hand-claw)-([01])$/);
        if (arm) {
          posed = rotatePoint(posed, skeleton.armRoots[Number(arm[1])], "x", -stomp.rise * 1.25);
        }
        const tailPart = /^tail-/.test(part);
        if (tailPart) posed = rotatePoint(posed, skeleton.tailRoot, "x", -angle);
        const wing = part.match(/^wing-(?:arm-root|arm-tip|joint|panel)-(-1|1)$/);
        if (wing) {
          const side = Number(wing[1]);
          const root = skeleton.wingRoots.find((entry) => Math.sign(entry.root[0]) === side).root;
          posed = rotatePoint(posed, root, "x", -angle);
          posed = rotatePoint(posed, root, "z", side * stomp.rise * 0.25);
        }
        let weight = 1;
        const plantedLeg = quadruped ? /^(?:leg-(?:upper|lower|joint)|foot|claw)-(-1|1)-back/.test(part)
          : /^(?:leg-(?:upper|lower)|foot|claw)-[01]$/.test(part);
        if (/^(?:foot|claw)-/.test(part) && (plantedLeg || stomp.rise === 0)) weight = 0;
        else if (/^leg-/.test(part) && (plantedLeg || stomp.rise === 0)) {
          // Anchor supporting ankles while hips follow the rearing and landing body.
          weight = Math.max(0, Math.min(1, (point[1] - 0.15) / (skeleton.pelvis[1] - 0.15)));
        }
        const reared = rotatePoint(posed, pivot, "x", angle);
        reared[1] -= skeleton.bodyHeight * 0.14 * stomp.impact;
        posed = posed.map((value, axis) => value + (reared[axis] - value) * weight);
      }
      if (brace > 0) {
        let weight = 1;
        if (/^(?:foot|claw)-/.test(part)) weight = 0;
        else if (/^leg-(?:upper|lower|joint)-/.test(part)) {
          // Blend the body's brace into the legs, leaving ankles and soles planted.
          weight = Math.max(0, Math.min(1,
            (point[1] - 0.15) / (skeleton.pelvis[1] - 0.15)));
        }
        const braced = rotatePoint(posed, bracePivot, "x", bodyAngle);
        braced[1] -= skeleton.bodyHeight * 0.08 * brace;
        braced[2] -= skeleton.bodyWidth * 0.06 * recoil;
        posed = posed.map((value, axis) => value + (braced[axis] - value) * weight);
        const facePart = facePartPattern.test(part);
        const neckPart = neckPartPattern.test(part);
        if (facePart && !neckPart) {
          // Counter the neck and body pitch at the head joint so breath aims forward.
          posed = rotatePoint(posed, headPivot, "x", -brace * 0.42 - bodyAngle);
        }
      }
      if (stage === "baby") {
        const headPart = /^(?:skull$|brow-armor|crest$|upper-snout|beak-tip|nose$|eye|pupil|lower-jaw|chin$|mouth-interior|upper-tooth|horn|griffin-|lion-|horse-|creature-|front-)/.test(part);
        const neckPart = /^(?:neck-|griffin-neck-|griffin-nape$|horse-mane-)/.test(part);
        let weight = headPart ? 1 : 0;
        if (neckPart) weight = Math.max(0, Math.min(1,
          (point[1] - skeleton.neckBase[1]) / (skeleton.neckTop[1] - skeleton.neckBase[1])));
        if (part === "horse-mane-back-root") weight = 0;
        const pivot = animatePoint(skeleton.neckTop, "neck-1", phase, definition, skeleton, animation);
        posed = posed.map((value, axis) => value + (value - pivot[axis]) * 0.4 * weight);
      }
      return posed.map((value) => value * scale);
    };
    const positions = [];
    const colors = [];
    const parts = [];
    for (const box of createBoxes(definition)) {
      const rgb = [1, 3, 5].map((start) => parseInt(box.color.slice(start, start + 2), 16) / 255);
      const isEye = /^(?:(?:griffin-|creature-|front-)?eye|(?:griffin-|front-)?pupil)/.test(box.part);
      const localCenter = box.min.map((value, axis) => (value + box.max[axis]) / 2);
      const eyeCenter = isEye ? (box.frame
        ? box.frame.origin.map((value, axis) => value + box.frame.axes.reduce(
          (sum, direction, component) => sum + direction[axis] * localCenter[component], 0))
        : localCenter) : null;
      if (box.vertices) {
        for (const [faceIndex, face] of box.faces.entries()) {
          const shade = faceIndex === 0 ? 1 : faceIndex === 1 ? 0.72 : 0.88;
          for (const index of [0, 1, 2, 0, 2, 3]) {
            positions.push(...transform(box.vertices[face[index]], box.part, eyeCenter));
            colors.push(...rgb.map((value) => value * shade));
            parts.push(box.part);
          }
        }
      } else {
        for (const face of blocks) for (const index of [0, 1, 2, 0, 2, 3]) {
          const local = face.corners[index].map((value, axis) => value ? box.max[axis] : box.min[axis]);
          const point = box.frame
            ? [0, 1, 2].map((axis) => box.frame.origin[axis]
              + box.frame.axes.reduce((sum, direction, component) =>
                sum + direction[axis] * local[component], 0))
            : local;
          positions.push(...transform(point, box.part, eyeCenter));
          colors.push(...rgb.map((value) => value * face.shade));
          parts.push(box.part);
        }
      }
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors), parts };
  }

  function createAuraEmitters(mesh) {
    return root.MoneycraftModelEffects.createEmitters(mesh, 320, (vertex) =>
      /^(?:torso$|chest$|pelvis$|skull$|neck-|leg-upper|leg-lower|tail-segment|wing-arm)/.test(mesh.parts[vertex]));
  }

  function createAuraParticles(mesh, emitters, seconds, sizeScale) {
    return root.MoneycraftModelEffects.createParticles(mesh, emitters, seconds, sizeScale);
  }

  root.MoneycraftMob = Object.freeze({
    defaults, options, palettes, isDefinition, randomDefinition, normalizeDefinition, createSkeleton, createBoxes, stageScale, createMesh,
    createAuraEmitters, createAuraParticles,
  });
})(globalThis);
