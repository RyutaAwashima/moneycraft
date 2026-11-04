"use strict";

((root) => {
  const palettes = {
    skin: [
      ["porcelain", "アイボリー", "#f0d2bb"], ["sand", "サンド", "#dfb18a"],
      ["amber", "アンバー", "#c58d62"], ["copper", "カッパー", "#a46d4c"],
      ["umber", "アンバー・ダーク", "#80533d"], ["espresso", "エスプレッソ", "#573b30"],
    ],
    hairColor: [
      ["ink", "すみ色", "#302e32"], ["chestnut", "くり色", "#644533"],
      ["walnut", "こげ茶", "#47352c"], ["gold", "こむぎ色", "#c5a363"],
      ["silver", "ぎん色", "#b8bec2"],
      ["caramel", "キャラメル", "#ac794e"], ["auburn", "あか茶", "#8e5141"],
      ["rose", "くすみピンク", "#bd8295"], ["lavender", "ラベンダー", "#9384b3"],
      ["blue", "ブルーグレー", "#647e99"], ["sage", "セージ", "#81967b"],
    ],
    top: [
      ["forest", "もり", "#477965"], ["ocean", "うみ", "#4c7f9d"],
      ["clay", "テラコッタ", "#b86f57"], ["sun", "ひだまり", "#d4ab57"],
      ["berry", "ベリー", "#996b88"], ["cloud", "くも", "#dbe3df"],
    ],
    bottom: [
      ["navy", "こん色", "#384f65"], ["charcoal", "チャコール", "#484c50"],
      ["moss", "こけ色", "#65745a"], ["earth", "つち色", "#897257"],
    ],
    shoes: [
      ["slate", "スレート", "#3e454d"], ["brown", "ブラウン", "#6a5142"],
      ["cream", "クリーム", "#d9d4c4"],
    ],
    accent: [
      ["gold", "きいろ", "#e0b955"], ["mint", "ミント", "#8ec8b0"],
      ["coral", "コーラル", "#d88872"], ["sky", "そら色", "#91bfd8"],
      ["cream", "クリーム", "#eee5cf"],
    ],
  };
  const options = {
    hair: [
      ["short", "ショート"], ["bob", "ボブ"], ["crop", "クロップ"],
      ["long", "ロング"], ["ponytail", "ポニーテール"], ["twintails", "ツインテール"],
      ["buns", "おだんご"], ["none", "なし"],
    ],
    outfit: [["plain", "プレーン"], ["stripe", "ボーダー"], ["vest", "ベスト"]],
    accessory: [["none", "なし"], ["glasses", "めがね"], ["cap", "キャップ"], ["scarf", "スカーフ"]],
  };
  for (const [key, entries] of Object.entries(palettes)) {
    options[key] = entries.map(([id, label, color]) => ({ id, label, color }));
  }
  for (const key of ["hair", "outfit", "accessory"]) {
    options[key] = options[key].map(([id, label]) => ({ id, label }));
  }
  for (const entries of Object.values(options)) {
    entries.forEach(Object.freeze);
    Object.freeze(entries);
  }
  Object.freeze(options);
  const defaults = Object.freeze({
    version: 1, skin: "sand", hair: "short", hairColor: "chestnut",
    outfit: "plain", top: "forest", bottom: "navy", shoes: "slate",
    accent: "gold", accessory: "none",
  });
  const storageKey = "moneycraft-avatar-prototype-v1";
  const motions = Object.freeze(["still", "walk", "wave", "look"]);
  const styles = Object.freeze(["voxel", "soft-doll"]);
  const pivots = Object.freeze([
    [0, 0, 0], [0, 1.3, 0], [-0.32, 1.23, 0], [0.32, 1.23, 0],
    [-0.12, 0.64, 0], [0.12, 0.64, 0],
  ].map(Object.freeze));
  const softDollPivots = Object.freeze(pivots.map((pivot, joint) =>
    joint === 2 || joint === 3 ? Object.freeze([Math.sign(pivot[0]) * 0.25, pivot[1], pivot[2]]) : pivot));

  function createPose(motion, seconds) {
    if (!motions.includes(motion) || !Number.isFinite(seconds) || seconds < 0) {
      throw new Error("Invalid avatar motion or time.");
    }
    const pose = pivots.map(() => [0, 0, 0]);
    const ramp = Math.min(1, seconds / 0.35);
    const ease = ramp * ramp * (3 - 2 * ramp);
    if (motion === "walk") {
      const swing = Math.sin(seconds * Math.PI * 2 * 1.1) * 0.48 * ease;
      pose[2][0] = -swing * 0.8;
      pose[3][0] = swing * 0.8;
      pose[4][0] = swing;
      pose[5][0] = -swing;
    } else if (motion === "wave") {
      pose[2][2] = (-2.35 + Math.sin(seconds * Math.PI * 2 * 1.4) * 0.22) * ease;
      pose[2][0] = 0.12 * ease;
    } else if (motion === "look") {
      pose[1][1] = Math.sin(seconds * 1.4) * 0.55 * ease;
      pose[1][0] = Math.sin(seconds * 2.1) * 0.18 * ease;
    }
    return pose;
  }

  function posePositions(mesh, pose, output = new Float32Array(mesh.positions.length)) {
    if (!Array.isArray(pose) || pose.length !== pivots.length
      || pose.some((angles) => !Array.isArray(angles) || angles.length !== 3 || !angles.every(Number.isFinite))
      || output.length !== mesh.positions.length) throw new Error("Invalid avatar pose.");
    const rotations = pose.map(([x, y, z]) => [
      Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z),
    ]);
    for (let vertex = 0; vertex < mesh.joints.length; vertex += 1) {
      const offset = vertex * 3;
      const joint = mesh.joints[vertex];
      const pivot = (mesh.pivots || pivots)[joint];
      const [cx, sx, cy, sy, cz, sz] = rotations[joint];
      const x = mesh.positions[offset] - pivot[0];
      const y = mesh.positions[offset + 1] - pivot[1];
      const z = mesh.positions[offset + 2] - pivot[2];
      const ry = y * cx - z * sx;
      const rz = y * sx + z * cx;
      const rx = x * cy + rz * sy;
      const depth = -x * sy + rz * cy;
      output[offset] = rx * cz - ry * sz + pivot[0];
      output[offset + 1] = rx * sz + ry * cz + pivot[1];
      output[offset + 2] = depth + pivot[2];
    }
    return output;
  }

  function boxJoint(box) {
    if (["sleeve", "hand"].includes(box.part)) return box.min[0] < 0 ? 2 : 3;
    if (["trousers", "shoe"].includes(box.part)) return box.min[0] < 0 ? 4 : 5;
    if (["head", "eye", "smile", "fringe", "ponytail", "ponytail-root", "twintail", "twintail-root"].includes(box.part)
      || box.part.startsWith("hair-") || box.part.startsWith("glasses") || box.part.startsWith("cap")) return 1;
    return 0;
  }

  function isAppearance(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === Object.keys(defaults).length
      && Object.hasOwn(value, "version") && value.version === 1
      && Object.entries(options).every(([key, entries]) =>
        Object.hasOwn(value, key) && entries.some((entry) => entry.id === value[key]));
  }

  function createBoxes(appearance) {
    if (!isAppearance(appearance)) throw new Error("Invalid avatar appearance.");
    const color = (key) => options[key].find((entry) => entry.id === appearance[key]).color;
    const boxes = [];
    const add = (part, min, max, tint) => boxes.push({ part, min, max, color: tint });
    const skin = color("skin");
    const hair = color("hairColor");
    const top = color("top");
    const bottom = color("bottom");
    const shoes = color("shoes");
    const accent = color("accent");
    add("head", [-0.2, 1.3, -0.2], [0.2, 1.7, 0.2], skin);
    add("torso", [-0.23, 0.64, -0.14], [0.23, 1.27, 0.14], top);
    for (const side of [-1, 1]) {
      const x = side * 0.32;
      add("sleeve", [x - 0.085, 0.89, -0.12], [x + 0.085, 1.25, 0.12], top);
      add("hand", [x - 0.08, 0.67, -0.105], [x + 0.08, 0.89, 0.105], skin);
      const leg = side * 0.12;
      add("trousers", [leg - 0.105, 0.12, -0.12], [leg + 0.105, 0.64, 0.12], bottom);
      add("shoe", [leg - 0.11, 0, -0.14], [leg + 0.11, 0.15, 0.18], shoes);
      add("eye", [side * 0.09 - 0.025, 1.49, 0.201], [side * 0.09 + 0.025, 1.54, 0.208], "#333a3c");
    }
    add("smile", [-0.047, 1.407, 0.201], [0.047, 1.423, 0.208], "#795249");
    if (appearance.hair !== "none") {
      const lower = appearance.hair === "crop" ? 1.66 : 1.62;
      add("hair-top", [-0.213, lower, -0.213], [0.213, 1.725, 0.213], hair);
      const backBottom = appearance.hair === "long" ? 0.96 : appearance.hair === "bob" ? 1.28 : 1.48;
      add("hair-back", [-0.213, backBottom, appearance.hair === "long" ? -0.25 : -0.218],
        [0.213, 1.7, -0.2], hair);
      if (appearance.hair !== "crop") {
        for (const side of [-1, 1]) {
          const x = side * 0.206;
          const sideBottom = appearance.hair === "long" ? 1.14 : appearance.hair === "bob" ? 1.3 : 1.54;
          add("hair-side", [x - 0.013, sideBottom, -0.2],
            [x + 0.013, 1.69, 0.12], hair);
        }
        add("fringe", [-0.213, 1.58, 0.2], [0.025, 1.66, 0.218], hair);
      }
      if (appearance.hair === "ponytail") {
        add("ponytail-root", [-0.075, 1.48, -0.31], [0.075, 1.64, -0.21], hair);
        add("ponytail", [-0.09, 1.03, -0.4], [0.09, 1.56, -0.28], hair);
      } else if (appearance.hair === "twintails") {
        for (const side of [-1, 1]) {
          const x = side * 0.29;
          add("twintail-root", [x - 0.09, 1.48, -0.17], [x + 0.09, 1.6, -0.02], hair);
          add("twintail", [x - 0.075, 1.03, -0.22], [x + 0.075, 1.54, -0.06], hair);
        }
      } else if (appearance.hair === "buns") {
        for (const side of [-1, 1]) {
          const x = side * 0.26;
          add("hair-bun", [x - 0.085, 1.59, -0.19], [x + 0.085, 1.77, -0.02], hair);
        }
      }
    }
    if (appearance.outfit === "stripe") {
      for (const y of [0.83, 1.02]) {
        add("shirt-stripe", [-0.231, y, -0.142], [0.231, y + 0.055, 0.142], accent);
      }
    } else if (appearance.outfit === "vest") {
      for (const side of [-1, 1]) {
        const x = side * 0.145;
        add("vest", [x - 0.08, 0.68, 0.142], [x + 0.08, 1.24, 0.155], accent);
      }
      add("vest-back", [-0.231, 0.68, -0.155], [0.231, 1.24, -0.142], accent);
    }
    if (appearance.accessory === "glasses") {
      for (const side of [-1, 1]) {
        const x = side * 0.09;
        for (const y of [1.476, 1.55]) {
          add("glasses", [x - 0.068, y, 0.214], [x + 0.068, y + 0.012, 0.23], "#3e454d");
        }
        for (const dx of [-0.068, 0.056]) {
          add("glasses", [x + dx, 1.476, 0.214], [x + dx + 0.012, 1.562, 0.23], "#3e454d");
        }
      }
      add("glasses-bridge", [-0.025, 1.52, 0.214], [0.025, 1.532, 0.23], "#3e454d");
    } else if (appearance.accessory === "cap") {
      add("cap", [-0.23, 1.69, -0.23], [0.23, 1.8, 0.23], accent);
      add("cap-brim", [-0.23, 1.675, 0.18], [0.23, 1.7, 0.34], accent);
    } else if (appearance.accessory === "scarf") {
      add("scarf", [-0.17, 1.255, -0.16], [0.17, 1.31, 0.17], accent);
      add("scarf-tail", [0.02, 1.06, 0.15], [0.12, 1.28, 0.18], accent);
    }
    return boxes;
  }

  function createMesh(appearance, style = "voxel") {
    if (!styles.includes(style)) throw new Error("Invalid avatar style.");
    if (style === "soft-doll") return createSoftDollMesh(appearance);
    const positions = [];
    const colors = [];
    const joints = [];
    const faces = [
      { shade: 0.8, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
      { shade: 0.72, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
      { shade: 1, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
      { shade: 0.6, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      { shade: 0.92, corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
      { shade: 0.68, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
    ];
    for (const box of createBoxes(appearance)) {
      const rgb = [1, 3, 5].map((start) => parseInt(box.color.slice(start, start + 2), 16) / 255);
      for (const face of faces) for (const index of [0, 1, 2, 0, 2, 3]) {
        positions.push(...face.corners[index].map((value, axis) => value ? box.max[axis] : box.min[axis]));
        colors.push(...rgb.map((value) => value * face.shade));
        joints.push(boxJoint(box));
      }
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors), joints: new Uint8Array(joints) };
  }

  function createSoftDollMesh(appearance) {
    const positions = [];
    const colors = [];
    const joints = [];
    const boxes = createBoxes(appearance);
    boxes.push({ part: "neck", min: [-0.085, 1.24, -0.075], max: [0.085, 1.34, 0.075],
      color: options.skin.find((entry) => entry.id === appearance.skin).color });
    for (const box of boxes) {
      const joint = boxJoint(box);
      const min = box.min.slice();
      const max = box.max.slice();
      const limb = ["sleeve", "hand", "trousers", "shoe"].includes(box.part);
      if (limb) {
        const centerX = (min[0] + max[0]) / 2 + softDollPivots[joint][0] - pivots[joint][0];
        const width = (max[0] - min[0]) * (box.part === "hand" ? 0.4 : 0.36);
        const centerZ = (min[2] + max[2]) / 2;
        const depth = (max[2] - min[2]) * 0.42;
        min[0] = centerX - width;
        max[0] = centerX + width;
        min[2] = centerZ - depth;
        max[2] = centerZ + depth;
      }
      const torso = ["torso", "shirt-stripe", "vest", "vest-back"].includes(box.part);
      if (torso) {
        min[0] *= 0.86;
        max[0] *= 0.86;
      }
      const smallDetail = /^(eye|smile|glasses|fringe|scarf)/.test(box.part);
      const radius = Math.min(...min.map((value, axis) => max[axis] - value))
        * (smallDetail ? 0.18 : limb ? 0.35 : 0.22);
      const center = min.map((value, axis) => (value + max[axis]) / 2);
      const half = min.map((value, axis) => (max[axis] - value) / 2);
      // Four octagonal rings give a flat central surface and bevelled edges.
      const rings = [
        [min[1], limb ? radius * 0.3 : radius], [min[1] + radius, 0],
        [max[1] - radius, 0], [max[1], limb ? radius * 0.3 : radius],
      ].map(([y, inset]) => {
        const taper = torso ? 0.88 + 0.12 * (y - min[1]) / (max[1] - min[1]) : 1;
        const x = (half[0] - inset) * taper;
        const z = half[2] - inset;
        const cut = Math.min(radius, x * 0.45, z * 0.45);
        return [
          [-x + cut, -z], [x - cut, -z], [x, -z + cut], [x, z - cut],
          [x - cut, z], [-x + cut, z], [-x, z - cut], [-x, -z + cut],
        ].map(([px, pz]) => [center[0] + px, y, center[2] + pz]);
      });
      const rgb = [1, 3, 5].map((start) => parseInt(box.color.slice(start, start + 2), 16) / 255);
      const triangle = (a, b, c) => {
        const u = b.map((value, axis) => value - a[axis]);
        const v = c.map((value, axis) => value - a[axis]);
        const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0]];
        const length = Math.hypot(...normal);
        const light = 0.77 + (normal[0] * -0.16 + normal[1] * 0.2 + normal[2] * 0.12) / length;
        for (const point of [a, b, c]) {
          positions.push(...point);
          colors.push(...rgb.map((value) => value * light));
          joints.push(joint);
        }
      };
      for (let ring = 0; ring < 3; ring += 1) for (let edge = 0; edge < 8; edge += 1) {
        const next = (edge + 1) % 8;
        triangle(rings[ring][edge], rings[ring + 1][edge], rings[ring + 1][next]);
        triangle(rings[ring][edge], rings[ring + 1][next], rings[ring][next]);
      }
      for (let edge = 1; edge < 7; edge += 1) {
        triangle(rings[0][0], rings[0][edge], rings[0][edge + 1]);
        triangle(rings[3][0], rings[3][edge + 1], rings[3][edge]);
      }
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors),
      joints: new Uint8Array(joints), pivots: softDollPivots };
  }

  root.MoneycraftAvatar = Object.freeze({
    options, defaults, storageKey, isAppearance, createBoxes, createMesh, motions, styles, createPose, posePositions,
  });
})(globalThis);
