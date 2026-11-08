"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "mob-model.js"), "utf8");
const context = {};
for (const file of ["silhouette-effect.js", "model-effects.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context);
}
vm.runInNewContext(source, context);
const { defaults, options, palettes, isDefinition, randomDefinition, normalizeDefinition, createSkeleton, createBoxes, createMesh } = context.MoneycraftMob;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("mob definitions accept only versioned finite choices and exact fields", () => {
  assert.equal(isDefinition(defaults), true);
  for (const [key, entries] of Object.entries({ ...options, ...palettes })) {
    for (const entry of entries) {
      assert.equal(isDefinition({ ...defaults, [key]: entry.id }), true);
      if (entry.color) assert.match(entry.color, /^#[0-9a-f]{6}$/);
    }
    assert.equal(isDefinition({ ...defaults, [key]: "custom" }), false);
  }
  for (const value of [
    null, [], "mob", 1, { ...defaults, version: defaults.version + 1 },
    { ...defaults, script: "run arbitrary code" },
    { ...defaults, body: "#ffffff" },
    { ...defaults, stance: "custom" },
  ]) {
    assert.equal(isDefinition(value), false);
    assert.throws(() => createBoxes(value), /Invalid mob definition/);
    assert.throws(() => createMesh(value), /Invalid mob definition/);
  }
  const missing = { ...defaults };
  delete missing.jaw;
  assert.equal(isDefinition(missing), false);
});

test("random mob definitions sample every choice and size without changing the schema", () => {
  for (const fraction of [0, 0.25, 0.5, 0.75, 1 - Number.EPSILON]) {
    const definition = randomDefinition(() => fraction);
    assert.equal(isDefinition(definition), true);
    assert.equal(definition.format, defaults.format);
    assert.equal(definition.version, defaults.version);
    for (const [key, entries] of Object.entries({ ...options, ...palettes })) {
      assert.equal(definition[key], entries[Math.floor(fraction * entries.length)].id);
    }
    for (const key of ["bodyLength", "headScale", "neckLength", "tailLength"]) {
      assert.equal(definition[key], 60 + Math.floor(fraction * 9) * 10);
    }
    assert.ok(Array.from(createMesh(definition).positions).every(Number.isFinite));
    assert.deepEqual(plain(normalizeDefinition(plain(definition))), plain(definition));
  }
  for (const value of [-0.1, 1, NaN, Infinity]) {
    assert.throws(() => randomDefinition(() => value), /random source/);
  }
  assert.equal(isDefinition(randomDefinition()), true);
});

test("enemy and baby previews preserve topology and apply measured life-stage scales", () => {
  for (const stance of ["quadruped", "biped"]) {
    for (const { id: faceType } of options.faceType) {
      for (const { id: limbs } of options.limbs) {
        const definition = { ...defaults, stance, faceType, limbs };
        const adult = createMesh(definition);
        const enemy = createMesh(definition, null, "walk", "enemy");
        const baby = createMesh(definition, null, "walk", "baby");
        const { stageScale } = context.MoneycraftMob;
        const multiplier = stageScale(definition, "enemy");
        for (const { min, max } of createBoxes(definition).filter(({ part }) => part.startsWith("foot-"))) {
          const area = (max[0] - min[0]) * (max[2] - min[2]) * multiplier ** 2;
          assert.ok(area >= 1 - 1e-12 && area <= 2 + 1e-12);
        }
        assert.deepEqual(plain(enemy.parts), plain(adult.parts));
        assert.deepEqual(plain(baby.parts), plain(adult.parts));
        for (let index = 0; index < adult.positions.length; index += 1) {
          assert.ok(Math.abs(enemy.positions[index] - adult.positions[index] * multiplier) < 1e-5);
          if (adult.parts[Math.floor(index / 3)] === "torso") {
            assert.ok(Math.abs(baby.positions[index] - adult.positions[index] * 0.5) < 1e-6);
          }
        }
        const extent = (mesh, part, axis) => {
          const values = Array.from(mesh.positions).filter((_, index) =>
            index % 3 === axis && mesh.parts[Math.floor(index / 3)] === part);
          return Math.max(...values) - Math.min(...values);
        };
        for (const axis of [0, 1, 2]) {
          assert.ok(Math.abs(extent(baby, "skull", axis) / extent(adult, "skull", axis) - 0.7) < 1e-5);
        }
        for (const animation of ["walk", "roar"]) {
          for (const stage of ["baby", "enemy"]) {
            assert.ok(Array.from(createMesh(definition, 0.3, animation, stage).positions).every(Number.isFinite));
          }
        }
      }
    }
  }
  assert.throws(() => createMesh(defaults, null, "walk", "unknown"), /stage/);
});

test("baby eyes are 85 percent of adult size across every face and sensory style", () => {
  for (const stance of ["quadruped", "biped"]) {
    for (const { id: faceType } of options.faceType) {
      for (const { id: creatureSenses } of options.creatureSenses) {
        const definition = { ...defaults, stance, faceType, creatureSenses };
        const adult = createMesh(definition);
        const baby = createMesh(definition, null, "walk", "baby");
        const boxes = createBoxes(definition);
        const pivot = createSkeleton(definition).neckTop;
        for (const [index, box] of boxes.entries()) {
          if (!/^(?:(?:griffin-|creature-|front-)?eye|(?:griffin-|front-)?pupil)/.test(box.part)) continue;
          for (const axis of [0, 1, 2]) {
            const bounds = (mesh) => {
              const values = Array.from(mesh.positions.slice(index * 108, (index + 1) * 108))
                .filter((_, component) => component % 3 === axis);
              return [Math.min(...values), Math.max(...values)];
            };
            const [min, max] = bounds(adult);
            const [babyMin, babyMax] = bounds(baby);
            assert.ok(Math.abs((babyMax - babyMin) / (max - min) - 0.85) < 1e-5);
            assert.ok(Math.abs((babyMin + babyMax) / 2
              - ((min + max) / 2 * 0.7 - pivot[axis] * 0.2)) < 1e-6);
          }
        }
      }
    }
  }
});

test("aura particles originate on animated mob surfaces and rise, shrink and fade", () => {
  const { createAuraEmitters, createAuraParticles } = context.MoneycraftMob;
  for (const { id: faceType } of options.faceType) {
    for (const stance of ["quadruped", "biped"]) {
      const definition = { ...defaults, faceType, stance };
      const mesh = createMesh(definition, null, "walk", "enemy");
      const animated = createMesh(definition, 0.3, "walk", "enemy");
      const emitters = createAuraEmitters(mesh);
      assert.equal(emitters.length, 320);
      const particles = createAuraParticles(mesh, emitters, 0, 3);
      const moving = createAuraParticles(animated, emitters, 0, 3);
      assert.notDeepEqual(plain(particles.map(({ origin }) => origin)),
        plain(moving.map(({ origin }) => origin)));
      for (const [index, emitter] of emitters.entries()) {
        assert.ok(Math.abs(emitter.weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
        assert.ok(emitter.weights.every((weight) => weight >= 0 && weight <= 1));
        for (let axis = 0; axis < 3; axis += 1) {
          const expected = emitter.weights.reduce((sum, weight, corner) =>
            sum + mesh.positions[(emitter.vertex + corner) * 3 + axis] * weight, 0);
          assert.equal(particles[index].origin[axis], expected);
        }
        assert.ok(particles[index].position.every(Number.isFinite));
        assert.ok(particles[index].position[1] >= particles[index].origin[1]);
      }
      const early = createAuraParticles(mesh, [emitters[0]], emitters[0].lifetime * 0.2, 3)[0];
      const late = createAuraParticles(mesh, [emitters[0]], emitters[0].lifetime * 0.8, 3)[0];
      assert.ok(late.position[1] > early.position[1]);
      assert.ok(late.size < early.size && late.opacity < early.opacity);
      assert.throws(() => createAuraParticles(mesh, emitters, -1, 3), /aura/);
    }
  }
});

test("all modular part choices produce finite, shaded meshes", () => {
  const definitions = [defaults];
  for (const [key, entries] of Object.entries(options)) {
    for (const [index, entry] of entries.entries()) {
      definitions.push({ ...defaults, [key]: entry.id, bodyLength: 60 + (index % 9) * 10 });
    }
  }
  for (const key of ["body", "belly", "accent"]) {
    for (const entry of palettes[key]) definitions.push({ ...defaults, [key]: entry.id });
  }
  definitions.push(
    { ...defaults, stance: "biped", bodyShape: "sleek", neckShape: "long", headShape: "crest",
      snout: "beak", jaw: "none", horns: "curved", backSpines: "large", limbs: "long",
      tail: "spade", wings: "broad", bodyLength: 140, headScale: 140, neckLength: 140, tailLength: 140 },
    { ...defaults, stance: "quadruped", bodyShape: "stocky", neckShape: "low", headShape: "armored",
      snout: "short", jaw: "long", jawPose: "open", teeth: "fangs", horns: "none",
      backSpines: "none", limbs: "small", tail: "club", wings: "small" },
  );
  for (const definition of definitions) {
    assert.equal(isDefinition(definition), true);
    const boxes = createBoxes(definition);
    const mesh = createMesh(definition);
    assert.ok(boxes.length >= 20 && boxes.length <= 80);
    assert.equal(mesh.positions.length, boxes.length * 36 * 3);
    assert.equal(mesh.positions.length, mesh.colors.length);
    assert.equal(mesh.parts.length, mesh.positions.length / 3);
    assert.ok(Array.from(mesh.positions).every(Number.isFinite));
    assert.ok(Array.from(mesh.colors).every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1));
    for (const box of boxes) for (let axis = 0; axis < 3; axis += 1) {
      assert.ok(Number.isFinite(box.min[axis]) && Number.isFinite(box.max[axis]));
      assert.ok(box.min[axis] < box.max[axis]);
    }
  }
});

test("animation phases move articulated limbs, wings and tail without deforming the torso", () => {
  const still = createMesh(defaults);
  const animated = createMesh(defaults, 0.25);
  const valuesFor = (mesh, part) => mesh.positions.filter((_, index) =>
    mesh.parts[Math.floor(index / 3)] === part);
  for (const part of [
    "leg-upper--1-front", "wing-arm-root--1", "wing-panel-1", "tail-segment-2",
    "neck-1", "skull", "upper-snout", "lower-jaw",
  ]) {
    assert.notDeepEqual(Array.from(valuesFor(animated, part)), Array.from(valuesFor(still, part)), part);
  }
  assert.deepEqual(Array.from(valuesFor(animated, "torso")), Array.from(valuesFor(still, "torso")));
  assert.ok(Array.from(animated.positions).every(Number.isFinite));
  assert.throws(() => createMesh(defaults, -0.1), /phase/);
  assert.throws(() => createMesh(defaults, 1.1), /phase/);
  const biped = createMesh({ ...defaults, stance: "biped" }, 0.25);
  const stillBiped = createMesh({ ...defaults, stance: "biped" });
  assert.notDeepEqual(Array.from(valuesFor(biped, "leg-upper-0")),
    Array.from(valuesFor(stillBiped, "leg-upper-0")));
});

test("roar animation opens the jaw and lifts the head without moving the body", () => {
  for (const stance of ["quadruped", "biped"]) {
    const definition = { ...defaults, stance };
    const still = createMesh(definition);
    const roaring = createMesh(definition, 0.3, "roar");
    const resting = createMesh(definition, 0.9, "roar");
    const valuesFor = (mesh, part) => mesh.positions.filter((_, index) =>
      mesh.parts[Math.floor(index / 3)] === part);
    assert.notDeepEqual(Array.from(valuesFor(roaring, "lower-jaw")),
      Array.from(valuesFor(still, "lower-jaw")), stance);
    assert.notDeepEqual(Array.from(valuesFor(roaring, "skull")),
      Array.from(valuesFor(still, "skull")), stance);
    assert.deepEqual(Array.from(valuesFor(roaring, "torso")), Array.from(valuesFor(still, "torso")));
    const legPart = stance === "quadruped" ? "leg-upper--1-front" : "leg-upper-0";
    assert.deepEqual(Array.from(valuesFor(roaring, legPart)), Array.from(valuesFor(still, legPart)));
    assert.deepEqual(Array.from(valuesFor(resting, "lower-jaw")), Array.from(valuesFor(still, "lower-jaw")));
  }
  assert.throws(() => createMesh(defaults, 0.3, "unknown"), /animation/);
});

test("enemy breath spreads planted front limbs, lowers every face and returns to rest", () => {
  const valuesFor = (mesh, part) => Array.from(mesh.positions.filter((_, index) =>
    mesh.parts[Math.floor(index / 3)] === part));
  const center = (mesh, part, axis) => {
    const values = valuesFor(mesh, part).filter((_, index) => index % 3 === axis);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  for (const { id: faceType } of options.faceType) {
    for (const stance of ["quadruped", "biped"]) {
      const definition = { ...defaults, faceType, stance };
      const still = createMesh(definition, null, "walk", "enemy");
      const attacking = createMesh(definition, 0.4, "breath", "enemy");
      assert.deepEqual(plain(attacking.parts), plain(still.parts));
      assert.deepEqual(Array.from(attacking.colors), Array.from(still.colors));
      for (const phase of [0, 0.1, 0.25, 0.65, 0.8, 0.95, 1]) {
        const mesh = createMesh(definition, phase, "breath", "enemy");
        assert.ok(Array.from(mesh.positions).every(Number.isFinite));
        if (phase === 0 || phase >= 0.95) {
          assert.deepEqual(Array.from(mesh.positions), Array.from(still.positions));
        }
      }
      assert.ok(center(attacking, "skull", 1) < center(still, "skull", 1), faceType);
      for (const part of ["torso", "wing-arm-root--1", "tail-segment-2"]) {
        assert.notDeepEqual(valuesFor(attacking, part), valuesFor(still, part), part);
      }
      assert.ok(center(attacking, "chest", 1) < center(still, "chest", 1));
      const torso = valuesFor(still, "torso");
      const bracedTorso = valuesFor(attacking, "torso");
      const minZ = Math.min(...torso.filter((_, index) => index % 3 === 2));
      const maxZ = Math.max(...torso.filter((_, index) => index % 3 === 2));
      const dropAt = (z) => {
        const drops = [];
        for (let index = 0; index < torso.length; index += 3) {
          if (torso[index + 2] === z) drops.push(bracedTorso[index + 1] - torso[index + 1]);
        }
        return drops.reduce((sum, value) => sum + value, 0) / drops.length;
      };
      assert.ok(dropAt(maxZ) < dropAt(minZ), "body slopes down toward the front");
      const hold = createMesh(definition, 0.25, "breath", "enemy");
      const recoil = createMesh(definition, 0.25 + 0.4 / 6, "breath", "enemy");
      assert.ok(center(recoil, "torso", 2) < center(hold, "torso", 2), "recoil presses body backward");
      assert.ok(center(attacking, "skull", 1) < center(still, "skull", 1) - 0.15
        * context.MoneycraftMob.stageScale(definition, "enemy"), "head lowers visibly");
      for (const posed of [hold, recoil, attacking]) {
        const neutral = valuesFor(still, "skull");
        const horizontal = valuesFor(posed, "skull");
        for (let index = 3; index < neutral.length; index += 1) {
          const axis = index % 3;
          assert.ok(Math.abs((horizontal[index] - horizontal[axis])
            - (neutral[index] - neutral[axis])) < 2e-6,
          `${faceType}/${stance}: head orientation stays horizontal through recoil`);
        }
      }
      for (const side of [-1, 1]) {
        const part = stance === "quadruped" ? `foot-${side}-front` : `hand-${side === -1 ? 0 : 1}`;
        assert.ok(Math.abs(center(attacking, part, 0)) > Math.abs(center(still, part, 0)), part);
        const foot = stance === "quadruped" ? part : `foot-${side === -1 ? 0 : 1}`;
        assert.deepEqual(valuesFor(attacking, foot).filter((_, index) => index % 3 === 1),
          valuesFor(still, foot).filter((_, index) => index % 3 === 1));
        const rearFoot = stance === "quadruped" ? `foot-${side}-back` : foot;
        assert.deepEqual(valuesFor(attacking, rearFoot), valuesFor(still, rearFoot));
      }
      if (faceType === "dragon") {
        assert.notDeepEqual(valuesFor(attacking, "lower-jaw"), valuesFor(still, "lower-jaw"));
      }
    }
  }
  for (const stage of ["pet", "baby"]) {
    assert.throws(() => createMesh(defaults, 0.4, "breath", stage), /enemy/);
  }
});

test("braced breath stays finite and above ground across size extremes", () => {
  for (const stance of ["quadruped", "biped"]) {
    for (const { id: faceType } of options.faceType) {
      for (const size of [60, 140]) {
        const definition = { ...defaults, stance, faceType,
          headScale: size, neckLength: size, bodyLength: size, tailLength: size };
        for (const phase of [0.25, 0.32, 0.5, 0.65, 0.8]) {
          const mesh = createMesh(definition, phase, "breath", "enemy");
          assert.ok(mesh.positions.every(Number.isFinite));
          assert.ok(Math.min(...mesh.positions.filter((_, index) => index % 3 === 1)) >= 0,
            `${stance}/${faceType}/${size}/${phase} penetrates ground`);
        }
      }
    }
  }
});

test("enemy stomp rears on planted rear feet, swings down and absorbs landing", () => {
  const valuesFor = (mesh, part) => Array.from(mesh.positions.filter((_, index) =>
    mesh.parts[Math.floor(index / 3)] === part));
  const centerY = (mesh, part) => {
    const values = valuesFor(mesh, part).filter((_, index) => index % 3 === 1);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  for (const stance of ["quadruped", "biped"]) {
    for (const { id: faceType } of options.faceType) {
      for (const size of [60, 100, 140]) {
        const definition = { ...defaults, stance, faceType,
          headScale: size, neckLength: size, bodyLength: size, tailLength: size };
        const still = createMesh(definition, null, "walk", "enemy");
        const reared = createMesh(definition, 0.4, "stomp", "enemy");
        const falling = createMesh(definition, 0.55, "stomp", "enemy");
        const impact = createMesh(definition, 0.7, "stomp", "enemy");
        assert.deepEqual(plain(reared.parts), plain(still.parts));
        assert.deepEqual(Array.from(reared.colors), Array.from(still.colors));
        assert.ok(centerY(reared, "chest") > centerY(still, "chest"));
        assert.ok(centerY(impact, "chest") < centerY(still, "chest"));
        for (const side of [-1, 1]) {
          const supporting = stance === "quadruped" ? `foot-${side}-back` : `foot-${side === -1 ? 0 : 1}`;
          for (const pose of [reared, falling, impact]) {
            assert.deepEqual(valuesFor(pose, supporting), valuesFor(still, supporting));
          }
          const striking = stance === "quadruped" ? `foot-${side}-front` : `hand-${side === -1 ? 0 : 1}`;
          const multiplier = context.MoneycraftMob.stageScale(definition, "enemy");
          assert.ok(centerY(reared, striking) > centerY(still, striking) + 0.2 * multiplier);
          assert.ok(centerY(falling, striking) < centerY(reared, striking));
          if (stance === "quadruped") assert.deepEqual(valuesFor(impact, striking), valuesFor(still, striking));
        }
        for (const phase of [0, 0.1, 0.32, 0.45, 0.55, 0.62, 0.7, 0.8, 0.92, 1]) {
          const posed = createMesh(definition, phase, "stomp", "enemy");
          assert.ok(posed.positions.every(Number.isFinite));
          assert.ok(Math.min(...posed.positions.filter((_, index) => index % 3 === 1)) >= -1e-6,
            `${stance}/${faceType}/${size}/${phase} penetrates ground`);
          if (phase === 0 || phase >= 0.92) assert.deepEqual(Array.from(posed.positions), Array.from(still.positions));
        }
      }
    }
  }
  for (const stage of ["pet", "baby"]) {
    assert.throws(() => createMesh(defaults, 0.4, "stomp", stage), /enemy/);
  }
});

test("stomp gaze follows the strike with neck-length-aware head clearance", () => {
  const pointsFor = (mesh, part, scale = 1) => {
    const points = [];
    for (let index = 0; index < mesh.positions.length; index += 3) {
      if (mesh.parts[index / 3] === part) points.push(Array.from(mesh.positions.slice(index, index + 3),
        (value) => value / scale));
    }
    return points;
  };
  const smooth = (value) => value * value * (3 - 2 * value);
  for (const stance of ["quadruped", "biped"]) {
    for (const { id: faceType } of options.faceType) {
      for (const { id: neckShape } of options.neckShape) {
        for (const neckLength of [60, 140]) {
          for (const headScale of [60, 140]) {
            const definition = { ...defaults, stance, faceType, neckShape, neckLength, headScale };
            const skeleton = createSkeleton(definition);
            const scale = context.MoneycraftMob.stageScale(definition, "enemy");
            const still = createMesh(definition, null, "walk", "enemy");
            const neutral = pointsFor(still, "skull", scale);
            const bodyBoxes = createBoxes(definition).filter(({ part }) =>
              ["torso", "chest", "pelvis"].includes(part));
            for (const phase of [0.4, 0.55, 0.62, 0.7, 0.8, 0.92]) {
              const rise = phase < 0.45 ? 1 : phase < 0.62 ? 1 - smooth((phase - 0.45) / 0.17) : 0;
              const impact = phase < 0.7 ? 0 : phase < 0.92 ? 1 - smooth((phase - 0.7) / 0.22) : 0;
              const angle = -rise * (stance === "quadruped" ? 0.95 : 0.18) + impact * 0.06;
              const lookDown = phase < 0.45 ? 0 : phase < 0.62 ? smooth((phase - 0.45) / 0.17)
                : phase < 0.7 ? 1 : impact;
              const pitch = rise * 0.18 + lookDown * 0.36;
              const posed = createMesh(definition, phase, "stomp", "enemy");
              const head = pointsFor(posed, "skull", scale);
              for (let index = 1; index < head.length; index += 1) {
                const delta = neutral[index].map((value, axis) => value - neutral[0][axis]);
                const expected = [delta[0], delta[1] * Math.cos(pitch) - delta[2] * Math.sin(pitch),
                  delta[1] * Math.sin(pitch) + delta[2] * Math.cos(pitch)];
                assert.ok(head[index].every((value, axis) =>
                  Math.abs(value - head[0][axis] - expected[axis]) < 2e-6),
                `${stance}/${faceType}/${neckShape}: gaze follows strike and landing`);
              }
              const pivot = stance === "quadruped"
                ? [0, skeleton.pelvis[1], skeleton.bodyBack * 0.65] : skeleton.pelvis;
              // Undo the torso pose to compare the head against its body-space boxes.
              const local = head.map(([x, y, z]) => {
                y += skeleton.bodyHeight * 0.14 * impact;
                const py = y - pivot[1], pz = z - pivot[2];
                return [x, py * Math.cos(angle) + pz * Math.sin(angle) + pivot[1],
                  -py * Math.sin(angle) + pz * Math.cos(angle) + pivot[2]];
              });
              for (const box of bodyBoxes) {
                const corners = [box.min[0], box.max[0]].flatMap((x) =>
                  [box.min[1], box.max[1]].flatMap((y) => [box.min[2], box.max[2]].map((z) => [x, y, z])));
                const localPitch = pitch - angle;
                const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1],
                  [0, Math.cos(localPitch), Math.sin(localPitch)],
                  [0, -Math.sin(localPitch), Math.cos(localPitch)]];
                const separated = axes.some((axis) => {
                  const project = (points) => points.map((point) =>
                    point.reduce((sum, value, index) => sum + value * axis[index], 0));
                  const headProjection = project(local), bodyProjection = project(corners);
                  return Math.min(...headProjection) >= Math.max(...bodyProjection) - 1e-6
                    || Math.max(...headProjection) <= Math.min(...bodyProjection) + 1e-6;
                });
                assert.ok(separated, `${stance}/${faceType}/${neckShape}/${neckLength}/${headScale}: skull overlaps ${box.part}`);
              }
              assert.ok(posed.positions.every(Number.isFinite));
              assert.ok(Math.min(...posed.positions.filter((_, index) => index % 3 === 1)) >= -1e-6);
            }
          }
        }
      }
    }
  }
});

test("enemy tail sweep braces, turns a full circle, leads with gaze and returns to rest", () => {
  const pointsFor = (mesh, part) => {
    const points = [];
    for (let index = 0; index < mesh.positions.length; index += 3) {
      if (mesh.parts[index / 3] === part) points.push(Array.from(mesh.positions.slice(index, index + 3)));
    }
    return points;
  };
  const smooth = (value) => value * value * (3 - 2 * value);
  for (const stance of ["quadruped", "biped"]) {
    for (const { id: faceType } of options.faceType) {
      for (const size of [60, 100, 140]) {
        const definition = { ...defaults, stance, faceType,
          headScale: size, neckLength: size, bodyLength: size, tailLength: size };
        const still = createMesh(definition, null, "walk", "enemy");
        const neutralTorso = pointsFor(still, "torso");
        const neutralHead = pointsFor(still, "skull");
        const charge = createMesh(definition, 0.3, "tail-sweep", "enemy");
        assert.ok(pointsFor(charge, "torso")[0][1] < neutralTorso[0][1], "body crouches during charge");
        let previousYaw = -0.22;
        for (const phase of [0, 0.1, 0.3, 0.4, 0.54, 0.65, 0.75, 0.78, 0.85, 0.95, 1]) {
          const posed = createMesh(definition, phase, "tail-sweep", "enemy");
          assert.deepEqual(plain(posed.parts), plain(still.parts));
          assert.deepEqual(Array.from(posed.colors), Array.from(still.colors));
          assert.ok(posed.positions.every(Number.isFinite));
          assert.ok(Math.min(...posed.positions.filter((_, index) => index % 3 === 1)) >= -1e-6);
          if (phase === 0 || phase >= 0.95) {
            assert.deepEqual(Array.from(posed.positions), Array.from(still.positions));
          }
          const torso = pointsFor(posed, "torso"), head = pointsFor(posed, "skull");
          const turn = phase < 0.3 ? 0 : phase < 0.78 ? smooth((phase - 0.3) / 0.48) : 1;
          const yaw = phase < 0.3 ? -0.22 * smooth(phase / 0.3)
            : phase < 0.78 ? -0.22 + (Math.PI * 2 + 0.22) * turn : Math.PI * 2;
          const active = phase < 0.3 ? smooth(phase / 0.3)
            : phase < 0.78 ? 1 : phase < 0.95 ? 1 - smooth((phase - 0.78) / 0.17) : 0;
          const assertYaw = (neutral, animated, angle) => {
            for (let index = 1; index < neutral.length; index++) {
              const delta = neutral[index].map((value, axis) => value - neutral[0][axis]);
              const expected = [delta[0] * Math.cos(angle) + delta[2] * Math.sin(angle),
                delta[1], -delta[0] * Math.sin(angle) + delta[2] * Math.cos(angle)];
              assert.ok(animated[index].every((value, axis) =>
                Math.abs(value - animated[0][axis] - expected[axis]) < 3e-6));
            }
          };
          assertYaw(neutralTorso, torso, yaw);
          assertYaw(neutralHead, head, yaw + active * 0.4);
          if (phase >= 0.3 && phase <= 0.78) {
            assert.ok(yaw >= previousYaw, "turn progresses forward through a full circle");
            previousYaw = yaw;
          }
          for (const side of [-1, 1]) {
            const foot = stance === "quadruped" ? `foot-${side}-front` : `foot-${side === -1 ? 0 : 1}`;
            assert.deepEqual(pointsFor(posed, foot).map((point) => point[1]),
              pointsFor(still, foot).map((point) => point[1]), "feet remain at ground height");
          }
        }
        assert.equal(previousYaw, Math.PI * 2);
        const attacking = createMesh(definition, 0.54, "tail-sweep", "enemy");
        assert.notDeepEqual(pointsFor(attacking, "tail-segment-2"), pointsFor(still, "tail-segment-2"));
      }
    }
  }
  for (const stage of ["pet", "baby"]) {
    assert.throws(() => createMesh(defaults, 0.5, "tail-sweep", stage), /enemy/);
  }
});

test("wing retreat fans forward, flies backward and ends landed or hovering", () => {
  const pointsFor = (mesh, part, scale = 1) => {
    const points = [];
    for (let index = 0; index < mesh.positions.length; index += 3) {
      if (mesh.parts[index / 3] === part) points.push(Array.from(mesh.positions.slice(index, index + 3),
        (value) => value / scale));
    }
    return points;
  };
  const average = (points, axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length;
  for (const stance of ["quadruped", "biped"]) {
    for (const { id: faceType } of options.faceType) {
      for (const wings of ["small", "broad"]) {
        for (const size of [60, 140]) {
          const definition = { ...defaults, stance, faceType, wings, headScale: size,
            neckLength: size, bodyLength: size, tailLength: size };
          const scale = context.MoneycraftMob.stageScale(definition, "enemy");
          const still = createMesh(definition, null, "walk", "enemy");
          for (const mode of ["wing-retreat-land", "wing-retreat-hover"]) {
            const initial = createMesh(definition, 0, mode, "enemy");
            assert.deepEqual(Array.from(initial.positions), Array.from(still.positions));
            const raised = createMesh(definition, 0.25, mode, "enemy");
            const fanned = createMesh(definition, 0.43, mode, "enemy");
            assert.ok(average(pointsFor(raised, "wing-arm-tip-1", scale), 1)
              > average(pointsFor(still, "wing-arm-tip-1", scale), 1));
            assert.notDeepEqual(pointsFor(raised, "wing-panel-1"), pointsFor(fanned, "wing-panel-1"));
            const flying = createMesh(definition, 0.58, mode, "enemy");
            const endpoint = createMesh(definition, 1, mode, "enemy");
            const body = pointsFor(still, "torso", scale);
            const endBody = pointsFor(endpoint, "torso", scale);
            for (let index = 0; mode === "wing-retreat-land" && index < body.length; index++) {
              assert.ok(Math.abs(endBody[index][2] - body[index][2] + 1.2) < 1e-6);
              assert.ok(Math.abs(endBody[index][1] - body[index][1]
                - (mode === "wing-retreat-hover" ? 0.85 : 0)) < 1e-6);
            }
            const foot = stance === "quadruped" ? "foot-1-front" : "foot-1";
            assert.ok(average(pointsFor(flying, foot, scale), 1) > average(pointsFor(still, foot, scale), 1) + 0.3);
            if (mode === "wing-retreat-land") {
              const endFoot = pointsFor(endpoint, foot, scale), original = pointsFor(still, foot, scale);
              endFoot.forEach((point, index) => assert.ok(Math.abs(point[1] - original[index][1]) < 1e-6));
              const impact = createMesh(definition, 0.9, mode, "enemy");
              assert.ok(average(pointsFor(impact, "torso", scale), 1) < average(body, 1));
            } else {
              assert.ok(Math.min(...endpoint.positions.filter((_, index) => index % 3 === 1)) > 0);
              assert.deepEqual(Array.from(createMesh(definition, 0, "hover", "enemy").positions),
                Array.from(endpoint.positions), "retreat joins hover without changing any vertex");
            }
            let previousZ = average(body, 2);
            for (const phase of [0.25, 0.35, 0.43, 0.58, 0.7, 0.78, 0.9, 1]) {
              const posed = createMesh(definition, phase, mode, "enemy");
              assert.deepEqual(plain(posed.parts), plain(still.parts));
              assert.deepEqual(Array.from(posed.colors), Array.from(still.colors));
              assert.ok(posed.positions.every(Number.isFinite));
              assert.ok(Math.min(...posed.positions.filter((_, index) => index % 3 === 1)) >= -1e-6);
              if (phase >= 0.43 && (mode === "wing-retreat-land" || phase <= 0.78)) {
                const z = average(pointsFor(posed, "torso", scale), 2);
                assert.ok(z <= previousZ + 1e-6, "body moves backward without teleporting home");
                previousZ = z;
              }
            }
          }
        }
      }
    }
  }
  for (const mode of ["wing-retreat-land", "wing-retreat-hover"]) {
    assert.throws(() => createMesh({ ...defaults, wings: "none" }, 0.4, mode, "enemy"), /wings/);
    for (const stage of ["pet", "baby"]) assert.throws(() => createMesh(defaults, 0.4, mode, stage), /enemy/);
  }
});

test("aerial charge connects every hover phase, dives forward and recovers at a planted landing", () => {
  const valuesFor = (mesh, part) => Array.from(mesh.positions.filter((_, index) =>
    mesh.parts[Math.floor(index / 3)] === part));
  const center = (mesh, part, axis) => {
    const values = valuesFor(mesh, part).filter((_, index) => index % 3 === axis);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  for (const stance of ["quadruped", "biped"]) {
    for (const { id: faceType } of options.faceType) {
      for (const { id: neckShape } of options.neckShape) {
        for (const size of [60, 140]) {
          const definition = { ...defaults, stance, faceType, neckShape,
            headScale: size, neckLength: size, bodyLength: size, tailLength: size };
          const scale = context.MoneycraftMob.stageScale(definition, "enemy");
          const still = createMesh(definition, null, "walk", "enemy");
          for (const hoverPhase of [0, 0.23, 0.5, 0.87, 1]) {
            const start = createMesh(definition, 0, "aerial-charge", "enemy", hoverPhase);
            assert.deepEqual(Array.from(start.positions),
              Array.from(createMesh(definition, hoverPhase, "hover", "enemy").positions));
          }
          let previousZ = center(createMesh(definition, 0.4, "aerial-charge", "enemy"), "torso", 2);
          for (const phase of [0, 0.25, 0.4, 0.5, 0.6, 0.7, 0.76, 0.82, 0.9, 1]) {
            const mesh = createMesh(definition, phase, "aerial-charge", "enemy");
            assert.deepEqual(plain(mesh.parts), plain(still.parts));
            assert.deepEqual(Array.from(mesh.colors), Array.from(still.colors));
            assert.ok(mesh.positions.every(Number.isFinite));
            assert.ok(Math.min(...mesh.positions.filter((_, index) => index % 3 === 1)) >= -1e-6,
              `${stance}/${faceType}/${neckShape}/${size}/${phase}: no ground penetration`);
            if (phase >= 0.4 && phase <= 0.7) {
              const z = center(mesh, "torso", 2);
              assert.ok(z >= previousZ - 1e-6, "dive advances toward the target");
              previousZ = z;
            }
          }
          const endpoint = createMesh(definition, 1, "aerial-charge", "enemy");
          const skeleton = createSkeleton(definition);
          const slideDistance = (skeleton.bodyFront - skeleton.bodyBack) * 0.5 * scale;
          for (let index = 0; index < still.positions.length; index++) {
            assert.ok(Math.abs(endpoint.positions[index] - still.positions[index]
              - (index % 3 === 2 ? 1.2 * scale + slideDistance : 0)) < 3e-6);
          }
          const impact = createMesh(definition, 0.9, "aerial-charge", "enemy");
          assert.ok(center(impact, "torso", 1) < center(endpoint, "torso", 1) - 0.08 * scale);
          for (const part of [...new Set(still.parts)].filter((name) => /^(foot|claw)-/.test(name))) {
            const landed = valuesFor(endpoint, part), compressed = valuesFor(impact, part);
            landed.forEach((value, index) => assert.ok(Math.abs(value - compressed[index]) < 3e-6,
              "feet and claws stay planted while absorbing impact"));
          }
          const contact = createMesh(definition, 0.7, "aerial-charge", "enemy");
          let previousStep = Infinity;
          let previousPosition = center(contact, "torso", 2);
          for (const phase of [0.75, 0.8, 0.85, 0.9]) {
            const sliding = createMesh(definition, phase, "aerial-charge", "enemy");
            const position = center(sliding, "torso", 2);
            const step = position - previousPosition;
            assert.ok(step > 0 && step < previousStep, "ground slide decelerates");
            previousStep = step;
            previousPosition = position;
            for (const part of [...new Set(still.parts)].filter((name) => /^(foot|claw)-/.test(name))) {
              const initial = valuesFor(contact, part), dragged = valuesFor(sliding, part);
              initial.forEach((value, index) => assert.ok(Math.abs(dragged[index] - value
                - (index % 3 === 2 ? position - center(contact, "torso", 2) : 0)) < 3e-6,
              "feet drag forward without leaving the ground"));
            }
            if (phase >= 0.8) assert.ok(center(sliding, "torso", 1)
              < center(endpoint, "torso", 1) - 0.08 * scale, "body stays low until sliding stops");
          }
          assert.ok(Math.abs(previousPosition - center(contact, "torso", 2) - slideDistance) < 3e-6,
            "slide covers exactly half the torso length");
          for (const phase of [0.25, 0.4, 0.7, 0.76, 0.9]) {
            const before = createMesh(definition, phase - 0.0001, "aerial-charge", "enemy");
            const after = createMesh(definition, phase + 0.0001, "aerial-charge", "enemy");
            assert.ok(before.positions.every((value, index) =>
              Math.abs(value - after.positions[index]) < 0.002 * scale), "segments connect continuously");
          }
        }
      }
    }
  }
  for (const wings of ["small", "broad"]) {
    assert.ok(createMesh({ ...defaults, wings }, 0.5, "aerial-charge", "enemy").positions.every(Number.isFinite));
  }
  assert.throws(() => createMesh({ ...defaults, wings: "none" }, 0.5, "aerial-charge", "enemy"), /wings/);
  for (const stage of ["pet", "baby"]) {
    assert.throws(() => createMesh(defaults, 0.5, "aerial-charge", stage), /enemy/);
  }
  for (const phase of [NaN, Infinity, -0.1, 1.1, null]) {
    assert.throws(() => createMesh(defaults, 0.5, "aerial-charge", "enemy", phase), /hover phase/);
  }
});

test("wing retreat gaze stays forward in flight and lowers for landing across neck types", () => {
  const skullPoints = (mesh) => {
    const points = [];
    for (let index = 0; index < mesh.positions.length; index += 3) {
      if (mesh.parts[index / 3] === "skull") points.push(Array.from(mesh.positions.slice(index, index + 3)));
    }
    return points;
  };
  for (const { id: faceType } of options.faceType) {
    for (const { id: neckShape } of options.neckShape) {
      for (const size of [60, 140]) {
        const definition = { ...defaults, faceType, neckShape, neckLength: size, headScale: size };
        const still = skullPoints(createMesh(definition, null, "walk", "enemy"));
        for (const [mode, phase, pitch] of [
          ["wing-retreat-land", 0.43, 0], ["wing-retreat-land", 0.9, 0.18],
          ["wing-retreat-hover", 1, 0.55],
          ["aerial-charge", 0.25, 0.25], ["aerial-charge", 0.4, 0.28],
          ["aerial-charge", 0.7, 0.18], ["aerial-charge", 1, 0],
        ]) {
          const mesh = createMesh(definition, phase, mode, "enemy");
          const posed = skullPoints(mesh);
          for (let index = 1; index < posed.length; index++) {
            const delta = still[index].map((value, axis) => value - still[0][axis]);
            const expected = [delta[0], delta[1] * Math.cos(pitch) - delta[2] * Math.sin(pitch),
              delta[1] * Math.sin(pitch) + delta[2] * Math.cos(pitch)];
            assert.ok(posed[index].every((value, axis) =>
              Math.abs(value - posed[0][axis] - expected[axis]) < 3e-6));
          }
          assert.ok(Math.min(...mesh.positions.filter((_, index) => index % 3 === 1)) >= -1e-6);
        }
      }
    }
  }
});

test("hover loops at a 45-degree body pitch with wing beats, tail motion and a continuous retreat join", () => {
  const valuesFor = (mesh, part) => Array.from(mesh.positions.filter((_, index) =>
    mesh.parts[Math.floor(index / 3)] === part));
  for (const stance of ["quadruped", "biped"]) {
    for (const { id: faceType } of options.faceType) {
      for (const { id: neckShape } of options.neckShape) {
        for (const size of [60, 140]) {
          const definition = { ...defaults, stance, faceType, neckShape,
            headScale: size, neckLength: size, tailLength: size };
          const scale = context.MoneycraftMob.stageScale(definition, "enemy");
          const join = createMesh(definition, 1, "wing-retreat-hover", "enemy");
          const start = createMesh(definition, 0, "hover", "enemy");
          const end = createMesh(definition, 1, "hover", "enemy");
          assert.deepEqual(Array.from(join.positions), Array.from(start.positions));
          assert.deepEqual(Array.from(start.positions), Array.from(end.positions));
          const skeleton = createSkeleton(definition);
          const pitch = -Math.PI / 4;
          const unpose = ([x, y, z]) => {
            const py = y / scale - 0.91 - skeleton.pelvis[1];
            const pz = z / scale + 1.2 - skeleton.pelvis[2];
            return [x / scale, py * Math.cos(pitch) + pz * Math.sin(pitch) + skeleton.pelvis[1],
              -py * Math.sin(pitch) + pz * Math.cos(pitch) + skeleton.pelvis[2]];
          };
          for (const [index, root] of skeleton.legRoots.entries()) {
            const part = stance === "quadruped"
              ? `foot-${Math.sign(root[0])}-${root[2] > 0 ? "front" : "back"}` : `foot-${index}`;
            const values = valuesFor(start, part);
            const points = [];
            for (let offset = 0; offset < values.length; offset += 3) {
              points.push(unpose(values.slice(offset, offset + 3)));
            }
            const centerZ = points.reduce((sum, point) => sum + point[2], 0) / points.length;
            if (stance === "quadruped" && root[2] > 0) {
              const resting = valuesFor(createMesh(definition, null, "walk", "enemy"), part);
              let expectedZ = 0;
              for (let offset = 0; offset < resting.length; offset += 3) {
                const lowerWeight = Math.max(0, Math.min(1,
                  (skeleton.pelvis[1] - resting[offset + 1] / scale) / skeleton.pelvis[1]));
                expectedZ += resting[offset + 2] / scale - Math.sin(pitch) * lowerWeight * 0.12;
              }
              expectedZ /= resting.length / 3;
              assert.ok(Math.abs(centerZ - expectedZ) < 1e-6, "front feet keep their previous local angle");
            } else {
              assert.ok(centerZ < root[2] - 0.1, `${stance}/${part}: rear foot trails hip toward tail`);
            }
          }
          const neutral = valuesFor(createMesh(definition, null, "walk", "enemy"), "torso");
          const angled = valuesFor(start, "torso");
          for (let index = 3; index < neutral.length; index += 3) {
            const dy = neutral[index + 1] - neutral[1], dz = neutral[index + 2] - neutral[2];
            assert.ok(Math.abs(angled[index + 1] - angled[1]
              - (dy * Math.cos(-Math.PI / 4) - dz * Math.sin(-Math.PI / 4))) < 3e-6);
            assert.ok(Math.abs(angled[index + 2] - angled[2]
              - (dy * Math.sin(-Math.PI / 4) + dz * Math.cos(-Math.PI / 4))) < 3e-6);
          }
          const half = createMesh(definition, 0.5, "hover", "enemy");
          for (const part of ["torso", "wing-arm-tip-1", "tail-segment-2"]) {
            assert.notDeepEqual(valuesFor(start, part), valuesFor(half, part));
          }
          const averageY = (mesh) => {
            const values = valuesFor(mesh, "torso").filter((_, index) => index % 3 === 1);
            return values.reduce((sum, value) => sum + value, 0) / values.length;
          };
          assert.ok(averageY(start) - averageY(half) > 0.1 * scale);
          for (const phase of [0.25, 0.5, 0.75]) {
            const posed = createMesh(definition, phase, "hover", "enemy");
            assert.ok(posed.positions.every(Number.isFinite));
            assert.ok(Math.min(...posed.positions.filter((_, index) => index % 3 === 1)) > 0);
          }
          const approaching = createMesh(definition, 0.999, "wing-retreat-hover", "enemy");
          const departing = createMesh(definition, 0.001, "hover", "enemy");
          for (const near of [approaching, departing]) {
            assert.ok(near.positions.every((value, index) =>
              Math.abs(value - start.positions[index]) < 0.001 * scale), "smooth join without positional snap");
          }
        }
      }
    }
  }
  assert.throws(() => createMesh({ ...defaults, wings: "none" }, 0, "hover", "enemy"), /wings/);
  assert.throws(() => createMesh(defaults, 0, "hover", "pet"), /enemy/);
});

test("the default quadruped shares leg and wing joints with the skeleton", () => {
  assert.equal(defaults.stance, "quadruped");
  const skeleton = createSkeleton(defaults);
  const boxes = createBoxes(defaults);
  const torso = boxes.find(({ part }) => part === "torso");
  const chest = boxes.find(({ part }) => part === "chest");
  const skull = boxes.find(({ part }) => part === "skull");
  const upperNeck = boxes.filter(({ part }) => part.startsWith("neck-"))
    .reduce((highest, box) => box.max[1] > highest.max[1] ? box : highest);
  assert.ok(torso.min[1] < skeleton.pelvis[1] && torso.max[1] > skeleton.bodyCenter[1]);
  assert.ok(chest.max[2] > skeleton.legRoots[1][2]);
  assert.ok(upperNeck.max[1] >= skull.min[1] - 1e-12);
  assert.equal(skeleton.legRoots.length, 4);
  for (const root of skeleton.legRoots) {
    assert.ok(root[0] < torso.max[0] && root[0] > torso.min[0]);
    assert.ok(root[1] < torso.max[1] && root[1] > torso.min[1]);
    assert.ok(root[2] < torso.max[2] && root[2] > torso.min[2]);
  }
  for (const [index, wing] of skeleton.wingRoots.entries()) {
    const side = index === 0 ? -1 : 1;
    const previousRootZ = skeleton.bodyFront * 0.06;
    const neckZ = skeleton.bodyFront + skeleton.neckForward;
    const expectedRootZ = previousRootZ + (neckZ - previousRootZ) * 0.3;
    assert.ok(Math.abs(wing.root[2] - expectedRootZ) < 1e-12);
    const first = boxes.find(({ part }) => part === `wing-arm-root-${side}`);
    const second = boxes.find(({ part }) => part === `wing-arm-tip-${side}`);
    assert.deepEqual(plain(first.frame.origin), plain(wing.root));
    assert.deepEqual(plain(second.frame.origin), plain(wing.elbow));
    const firstEnd = first.frame.origin.map((value, axis) =>
      value + first.frame.axes[1][axis] * first.max[1]);
    assert.ok(firstEnd.every((value, axis) => Math.abs(value - wing.elbow[axis]) < 1e-12));
    assert.ok(wing.root[2] < skeleton.legRoots.find((root) =>
      Math.sign(root[0]) === side && root[2] > 0)[2]);
  }
  assert.equal(boxes.filter(({ part }) => part.startsWith("wing-panel-")).length, 2);
  assert.equal(defaults.wings, "broad");
  assert.equal(createBoxes({ ...defaults, wings: "none" })
    .some(({ part }) => part.startsWith("wing-")), false);
  const biped = createBoxes({ ...defaults, stance: "biped" });
  assert.equal(biped.filter(({ part }) => part.startsWith("wing-panel-")).length, 2);
  assert.ok(biped.some(({ part }) => part === "wing-arm-root--1"));
});

test("large diamond wing panels connect to the root, elbow and wing tip", () => {
  const skeleton = createSkeleton(defaults);
  const boxes = createBoxes(defaults);
  const span = 1.05;
  const length = (start, end) => Math.hypot(...start.map((value, axis) => end[axis] - value));
  for (const [index, wing] of skeleton.wingRoots.entries()) {
    const side = index === 0 ? -1 : 1;
    const panel = boxes.find(({ part }) => part === `wing-panel-${side}`);
    assert.ok(panel);
    assert.equal(panel.vertices.length, 8);
    assert.equal(panel.faces.length, 6);
    for (const [corner, anchor] of [[0, wing.root], [1, wing.elbow], [2, wing.tip]]) {
      for (const axis of [0, 2]) assert.equal(panel.vertices[corner][axis], anchor[axis]);
      assert.ok(Math.abs(Math.abs(panel.vertices[corner][1] - anchor[1]) - 0.018) < 1e-12);
    }
    assert.ok(Math.abs(length(wing.root, wing.elbow)
      - Math.hypot(span * 0.42, 0.12, 0.12) * 1.5) < 1e-12);
    assert.ok(Math.abs(length(wing.elbow, wing.tip)
      - Math.hypot(span * 0.58, 0.04, 0.36) * 1.5) < 1e-12);
    assert.ok(Math.abs(wing.rearSpan - (span + 0.48) * 0.7) < 1e-12);
    assert.ok(Math.abs((wing.root[2] - panel.vertices[3][2]) / wing.rearSpan - 1) < 1e-12);
    assert.ok(panel.vertices[3][1] < wing.root[1] - 0.25);
    assert.ok(panel.max[0] - panel.min[0] > 1.1);
    assert.ok(panel.max[2] - panel.min[2] > 1.0);
  }
});

test("jaw hinge sits below the face and the open pose rotates around its joint", () => {
  const closed = createBoxes(defaults);
  const skeleton = createSkeleton(defaults);
  assert.ok(closed.some(({ part }) => part === "lower-jaw"));
  assert.ok(closed.some(({ part }) => part === "chin"));
  assert.ok(closed.some(({ part }) => part === "mouth-interior"));
  assert.ok(closed.some(({ part }) => part === "upper-tooth"));
  assert.ok(Math.abs(skeleton.jawPivot[1]
    - (skeleton.snout[1] + 0.025 * (defaults.headScale / 100) - 0.085 * (defaults.headScale / 100))) < 1e-12);
  const closedMesh = createMesh(defaults);
  const openMesh = createMesh({ ...defaults, jawPose: "open" });
  const jawPoints = (mesh) => mesh.positions.filter((_, index) =>
    mesh.parts[Math.floor(index / 3)] === "lower-jaw");
  assert.notDeepEqual(Array.from(jawPoints(closedMesh)), Array.from(jawPoints(openMesh)));
  const snout = closed.find(({ part }) => part === "upper-snout");
  assert.ok(Math.max(...Array.from(jawPoints(closedMesh)).filter((_, index) => index % 3 === 1))
    >= snout.min[1] - 0.02);
  const openJaw = createBoxes({ ...defaults, jawPose: "open" }).find(({ part }) => part === "lower-jaw");
  const chin = closed.find(({ part }) => part === "chin");
  assert.ok(openJaw.max[1] > snout.min[1] - 0.2);
  assert.ok(openJaw.min[2] < snout.max[2]);
  assert.ok(openJaw.max[2] >= snout.max[2] - 0.02);
  assert.ok(chin.min[1] >= closed.find(({ part }) => part === "lower-jaw").min[1]
    && chin.max[1] <= closed.find(({ part }) => part === "lower-jaw").max[1]);
  assert.ok(chin.min[2] < closed.find(({ part }) => part === "lower-jaw").max[2]
    && chin.max[2] > closed.find(({ part }) => part === "lower-jaw").min[2]);
  assert.equal(createBoxes({ ...defaults, jaw: "none" }).some(({ part }) => part === "lower-jaw"), false);
  assert.equal(createBoxes({ ...defaults, teeth: "none" }).some(({ part }) => part === "upper-tooth"), false);
});

test("upper teeth sit near the front of the snout in both stances", () => {
  for (const stance of ["quadruped", "biped"]) {
    for (const snout of ["short", "long", "beak"]) {
      const definition = { ...defaults, stance, snout };
      const skeleton = createSkeleton(definition);
      const teeth = createBoxes(definition).filter(({ part }) => part === "upper-tooth");
      const jawLength = skeleton.snoutLength + 0.045 * (definition.headScale / 100);
      const muzzleEnd = skeleton.headFront + skeleton.snoutLength;
      assert.ok(teeth.length > 0);
      for (const tooth of teeth) {
        const centerZ = (tooth.min[2] + tooth.max[2]) / 2;
        assert.ok(centerZ > skeleton.jawPivot[2] + jawLength * 0.6,
          `${stance}/${snout} tooth should be toward the nose`);
        assert.ok(tooth.max[2] <= muzzleEnd + 0.05, `${stance}/${snout} tooth extends past the nose`);
      }
    }
  }
});

test("eyes sit on the side surfaces and horn options produce distinct silhouettes", () => {
  for (const stance of ["quadruped", "biped"]) {
    const definition = { ...defaults, stance, horns: "none" };
    const skeleton = createSkeleton(definition);
    const boxes = createBoxes(definition);
    const skull = boxes.find(({ part }) => part === "skull");
    const eyes = boxes.filter(({ part }) => part === "eye");
    const eyeParts = boxes.filter(({ part }) => ["eye", "eye-socket", "pupil"].includes(part));
    assert.equal(eyes.length, 2);
    assert.equal(eyeParts.length, 6);
    for (const eye of eyeParts) {
      assert.ok(Math.abs((eye.min[0] + eye.max[0]) / 2) > skull.max[0] * 0.95);
      assert.ok(eye.min[2] < skull.max[2] && eye.max[2] > skull.min[2]);
      const centerZ = (eye.min[2] + eye.max[2]) / 2;
      assert.ok(Math.abs(centerZ - (skeleton.head[2] + skeleton.headDepth * 0.38)) < 1e-12);
    }
  }
  const hornOptions = options.horns.filter(({ id }) => id !== "none");
  const signatures = new Set();
  for (const horn of hornOptions) {
    const boxes = createBoxes({ ...defaults, horns: horn.id }).filter(({ part }) => part.startsWith("horn-"));
    assert.ok(boxes.length >= 4, horn.id);
    const mesh = createMesh({ ...defaults, horns: horn.id });
    const hornY = mesh.positions.filter((_, index) =>
      index % 3 === 1 && /^horn-/.test(mesh.parts[Math.floor(index / 3)]));
    const highest = Math.max(...hornY);
    signatures.add(`${boxes.length}:${highest.toFixed(3)}`);
    for (const box of boxes.filter(({ part }) => /^horn-(-1|1)-\d+$/.test(part))) {
      assert.ok(box.frame, `${horn.id} has an oriented connected horn segment`);
      assert.ok(Number.isFinite(box.max[1]));
    }
  }
  assert.equal(signatures.size, hornOptions.length);
  const maxHornY = (horn) => {
    const mesh = createMesh({ ...defaults, horns: horn });
    return Math.max(...mesh.positions.filter((_, index) =>
      index % 3 === 1 && /^horn-/.test(mesh.parts[Math.floor(index / 3)])));
  };
  assert.ok(maxHornY("large") > maxHornY("short") + 0.25);
});

test("head and segmented neck overlap instead of floating apart", () => {
  for (const neckShape of options.neckShape) for (const headScale of [60, 100, 140]) {
    const boxes = createBoxes({ ...defaults, neckShape: neckShape.id, headScale });
    const skull = boxes.find(({ part }) => part === "skull");
    const neck = boxes.filter(({ part }) => part.startsWith("neck-"))
      .reduce((highest, box) => box.max[1] > highest.max[1] ? box : highest);
    assert.ok(neck.max[1] >= skull.min[1] - 1e-12);
  }
});

test("version one mob definitions are validated and upgraded to the modular schema", () => {
  const legacy = {
    format: "moneycraft-mob", version: 1, archetype: "biped",
    body: "coral", belly: "sand", accent: "berry", eyes: "sleepy",
    ears: "horns", tail: "long", wings: "large",
  };
  const upgraded = normalizeDefinition(legacy);
  assert.equal(isDefinition(upgraded), true);
  assert.equal(upgraded.stance, "biped");
  assert.equal(upgraded.horns, "short");
  assert.equal(upgraded.wings, "broad");
  assert.equal(upgraded.body, "coral");
  assert.equal(upgraded.eyeColor, defaults.eyeColor);
  assert.throws(() => normalizeDefinition({ ...legacy, image: "data:image/png;base64,abc" }), /Invalid mob/);
});

test("version five definitions gain ears without losing existing face settings", () => {
  const { lionEars, ...oldFields } = defaults;
  const legacy = { ...oldFields, version: 5, horseMuzzle: "slender", faceType: "lion", lionMane: "short" };
  const upgraded = normalizeDefinition(legacy);
  assert.equal(upgraded.lionEars, lionEars);
  assert.equal(upgraded.lionMane, "short");
  assert.equal(upgraded.version, 7);
  assert.throws(() => normalizeDefinition({ ...legacy, unexpected: true }), /Invalid mob/);
  assert.throws(() => normalizeDefinition({ ...legacy, lionEars: "round" }), /Invalid mob/);
});

test("retired horse muzzle choices are validated and removed from old definitions", () => {
  assert.equal(Object.hasOwn(defaults, "horseMuzzle"), false);
  assert.equal(Object.hasOwn(options, "horseMuzzle"), false);
  for (const version of [5, 6]) {
    for (const horseMuzzle of ["slender", "soft"]) {
      const legacy = { ...defaults, version, faceType: "horse", horseMuzzle,
        horseMane: "crest", lionEars: "long" };
      if (version === 5) delete legacy.lionEars;
      const upgraded = normalizeDefinition(legacy);
      assert.equal(upgraded.version, 7);
      assert.equal(upgraded.horseMane, "crest");
      assert.equal(upgraded.lionEars, version === 5 ? defaults.lionEars : "long");
      assert.equal(Object.hasOwn(upgraded, "horseMuzzle"), false);
      assert.equal(isDefinition(upgraded), true);
      assert.deepEqual(plain(createBoxes(upgraded)),
        plain(createBoxes({ ...defaults, faceType: "horse", horseMane: "crest",
          lionEars: version === 5 ? defaults.lionEars : "long" })));
      assert.throws(() => normalizeDefinition({ ...legacy, horseMuzzle: "invalid" }), /Invalid mob/);
      assert.throws(() => normalizeDefinition({ ...legacy, extra: true }), /Invalid mob/);
      const missing = { ...legacy };
      delete missing.horseMuzzle;
      assert.throws(() => normalizeDefinition(missing), /Invalid mob/);
    }
  }
  assert.equal(isDefinition({ ...defaults, horseMuzzle: "slender" }), false);
});

test("version four definitions are upgraded with defaults for face-specific parameters", () => {
  const packageKeys = ["griffinBeak", "griffinFeathers", "lionMuzzle", "lionMane", "lionFangs", "lionEars",
    "horseMuzzle", "horseMane", "horseEars", "creatureMouth", "creatureSenses"];
  const versionFour = Object.fromEntries(Object.entries(defaults)
    .filter(([key]) => !packageKeys.includes(key)));
  const legacy = { ...versionFour, version: 4, faceType: "horse" };
  const upgraded = normalizeDefinition(legacy);
  assert.equal(isDefinition(upgraded), true);
  assert.equal(upgraded.version, 7);
  assert.equal(upgraded.faceType, "horse");
  assert.equal(upgraded.horseMane, defaults.horseMane);
  assert.throws(() => normalizeDefinition({ ...legacy, unexpected: true }), /Invalid mob/);
});

test("version three definitions are upgraded with the default dragon face package", () => {
  const omittedKeys = ["faceType", "griffinBeak", "griffinFeathers", "lionMuzzle", "lionMane",
    "lionFangs", "lionEars", "horseMuzzle", "horseMane", "horseEars", "creatureMouth", "creatureSenses"];
  const versionThree = Object.fromEntries(Object.entries(defaults)
    .filter(([key]) => !omittedKeys.includes(key)));
  const legacy = { ...versionThree, version: 3 };
  const upgraded = normalizeDefinition(legacy);
  assert.equal(isDefinition(upgraded), true);
  assert.equal(upgraded.version, 7);
  assert.equal(upgraded.faceType, "dragon");
  assert.throws(() => normalizeDefinition({ ...legacy, unexpected: true }), /Invalid mob/);
});

test("version two definitions are upgraded with default eye color and face type", () => {
  const omittedKeys = ["eyeColor", "faceType", "griffinBeak", "griffinFeathers", "lionMuzzle",
    "lionMane", "lionFangs", "lionEars", "horseMuzzle", "horseMane", "horseEars",
    "creatureMouth", "creatureSenses"];
  const versionTwo = Object.fromEntries(Object.entries(defaults)
    .filter(([key]) => !omittedKeys.includes(key)));
  const legacy = { ...versionTwo, version: 2 };
  const upgraded = normalizeDefinition(legacy);
  assert.equal(isDefinition(upgraded), true);
  assert.equal(upgraded.version, 7);
  assert.equal(upgraded.eyeColor, defaults.eyeColor);
  assert.equal(upgraded.faceType, "dragon");
  assert.equal(upgraded.lionMane, defaults.lionMane);
  assert.throws(() => normalizeDefinition({ ...legacy, unexpected: true }), /Invalid mob/);
});

test("face prototypes have distinct features and keep valid articulations in both stances", () => {
  const details = {
    dragon: null,
    griffin: "griffin-beak",
    lion: "lion-muzzle",
    horse: "horse-mane",
    creature: "creature-mouth",
  };
  for (const stance of ["quadruped", "biped"]) {
    for (const [faceType, feature] of Object.entries(details)) {
      const definition = { ...defaults, stance, faceType };
      const boxes = createBoxes(definition);
      const mesh = createMesh(definition, 0.3, "roar");
      if (feature) assert.ok(boxes.some(({ part }) => part.startsWith(feature)), `${faceType} details`);
      else assert.equal(boxes.some(({ part }) => part.startsWith("face-")), false);
      assert.ok(Array.from(mesh.positions).every(Number.isFinite), `${stance}/${faceType}`);
      assert.equal(boxes.some(({ part }) => part === "lower-jaw"), faceType === "dragon",
        `${stance}/${faceType} articulated jaw`);
      assert.ok(boxes.some(({ part }) =>
        ["upper-snout", "griffin-beak", "lion-muzzle", "horse-muzzle", "creature-mouth"].includes(part)),
      `${stance}/${faceType} muzzle`);
      assert.equal(boxes.some(({ part }) => part === "front-eye"), faceType === "lion",
        `${stance}/${faceType} eye placement`);
      assert.equal(boxes.some(({ part }) => part.startsWith("horse-mane-")), faceType === "horse",
        `${stance}/${faceType} mane`);
    }
  }
  assert.ok(createSkeleton({ ...defaults, faceType: "horse" }).snoutLength
    > createSkeleton(defaults).snoutLength);
  assert.ok(createSkeleton({ ...defaults, faceType: "lion" }).snoutLength
    < createSkeleton(defaults).snoutLength);
});

test("each face package exposes effective parameters without changing the dragon standard", () => {
  const packages = {
    griffin: ["griffinBeak", "griffinFeathers"],
    lion: ["lionMuzzle", "lionMane", "lionFangs", "lionEars"],
    horse: ["horseMane", "horseEars"],
    creature: ["creatureMouth", "creatureSenses"],
  };
  const dragon = createBoxes(defaults);
  const alternateDragon = createBoxes({
    ...defaults, griffinBeak: "broad", griffinFeathers: "crest", lionMuzzle: "compact",
    lionMane: "none", lionFangs: "none", lionEars: "long", horseMane: "short",
    horseEars: "none", creatureMouth: "wide", creatureSenses: "cluster",
  });
  assert.deepEqual(
    plain(alternateDragon.map(({ part, min, max }) => ({ part, min, max }))),
    plain(dragon.map(({ part, min, max }) => ({ part, min, max }))),
  );
  for (const [faceType, fields] of Object.entries(packages)) {
    for (const stance of ["quadruped", "biped"]) {
      for (const key of fields) {
        const geometries = options[key].map(({ id }) => {
          const boxes = createBoxes({ ...defaults, stance, faceType, [key]: id });
          assert.ok(boxes.every(({ min, max }) => min.every(Number.isFinite)
            && max.every(Number.isFinite) && min.every((value, axis) => value < max[axis])));
          return JSON.stringify(boxes.map(({ part, min, max }) => ({ part, min, max })));
        });
        assert.ok(new Set(geometries).size > 1, `${faceType}/${key} changes geometry`);
      }
    }
  }
});

test("griffin plumage covers the head and neck while exposing eyes and a tapered hook", () => {
  for (const stance of ["quadruped", "biped"]) {
    const griffin = { ...defaults, faceType: "griffin", stance };
    for (const { id: headShape } of options.headShape) {
      assert.deepEqual(plain(createBoxes({ ...griffin, headShape })), plain(createBoxes(griffin)));
    }
    for (const headScale of [60, 100, 140]) {
      for (const neckShape of ["low", "raised", "long"]) {
        for (const { id: griffinFeathers } of options.griffinFeathers) {
          for (const { id: griffinBeak } of options.griffinBeak) {
            const definition = { ...defaults, faceType: "griffin", stance,
              headScale, neckShape, griffinFeathers, griffinBeak };
            const boxes = createBoxes(definition);
            const featherColor = palettes.belly.find(({ id }) => id === definition.belly).color;
            const beakColor = palettes.accent.find(({ id }) => id === definition.accent).color;
            assert.equal(boxes.find(({ part }) => part === "skull").color, featherColor);
            const necks = boxes.filter(({ part }) => part.startsWith("neck-"));
            for (const [index, neck] of necks.entries()) {
              const coat = boxes.find(({ part }) => part === `griffin-neck-coat-${index}`);
              assert.equal(coat.color, featherColor);
              assert.ok(neck.min.every((value, axis) => coat.min[axis] < value));
              assert.ok(neck.max.every((value, axis) => coat.max[axis] > value));
            }
            const beak = boxes.find(({ part }) => part === "griffin-beak");
            const hook = boxes.find(({ part }) => part === "griffin-hook");
            assert.equal(beak.color, beakColor);
            assert.equal(hook.color, beakColor);
            assert.ok(Math.abs(beak.vertices[4][0]) < Math.abs(beak.vertices[0][0]));
            assert.ok(Math.abs(hook.vertices[4][0]) < Math.abs(hook.vertices[0][0]));
            assert.ok(hook.vertices[4][1] < hook.vertices[0][1]);
            assert.ok(hook.max[2] > beak.max[2]);
            assert.ok(hook.min[2] < beak.max[2] && hook.max[1] > beak.min[1]);
            for (const side of [-1, 1]) {
              const eye = boxes.find(({ part }) => part === `griffin-eye-${side}`);
              assert.ok(eye.frame.axes[2][2] > 0 && side * eye.frame.axes[2][0] > 0);
              const eyeCenter = eye.frame.origin.map((value, axis) => value
                + eye.frame.axes[2][axis] * (eye.min[2] + eye.max[2]) / 2);
              const plumage = boxes.filter(({ part }) => part === "skull"
                || /^griffin-(?:neck-|nape|crown|forehead|face-down|cheek|feather|crest)/.test(part));
              assert.ok(plumage.every(({ min, max }) => eyeCenter.some((value, axis) =>
                value < min[axis] || value > max[axis])), "eyes are outside the plumage");
            }
            const still = createMesh(definition);
            const walking = createMesh(definition, 0.25);
            assert.ok(Array.from(walking.positions).every(Number.isFinite));
            const valuesFor = (mesh, part) => Array.from(mesh.positions.filter((_, index) =>
              mesh.parts[Math.floor(index / 3)] === part));
            for (const part of ["griffin-neck-coat-0", "griffin-crown", "griffin-beak"]) {
              assert.notDeepEqual(valuesFor(walking, part), valuesFor(still, part));
            }
          }
        }
      }
    }
  }
});

test("additional griffin feathers are 30 percent larger without resizing basic plumage", () => {
  for (const stance of ["quadruped", "biped"]) {
    for (const headScale of [60, 100, 140]) {
      const definition = { ...defaults, faceType: "griffin", stance, headScale };
      const skeleton = createSkeleton(definition);
      const scale = headScale / 100;
      const basic = createBoxes({ ...definition, griffinFeathers: "none" });
      for (const griffinFeathers of ["cheeks", "crest"]) {
        const boxes = createBoxes({ ...definition, griffinFeathers });
        const extras = boxes.filter(({ part }) => /^griffin-(?:feather-|crest$)/.test(part));
        assert.equal(extras.length, griffinFeathers === "cheeks" ? 4 : 1);
        assert.deepEqual(plain(boxes.filter((box) => !extras.includes(box))), plain(basic));
        for (const box of extras) {
          const previousHalf = box.part === "griffin-crest"
            ? [skeleton.headWidth * 0.38, skeleton.headHeight * 0.34, skeleton.headHeight * 0.28]
            : box.part.endsWith("-1")
              ? [skeleton.headWidth * 0.3, skeleton.headHeight * 0.24, 0.14 * scale]
              : [skeleton.headWidth * 0.24, skeleton.headHeight * 0.2, 0.12 * scale];
          for (let axis = 0; axis < 3; axis += 1) {
            assert.ok(Math.abs((box.max[axis] - box.min[axis]) / (2 * previousHalf[axis]) - 1.3) < 1e-12);
          }
        }
      }
    }
  }
});

test("chimera has a taller face, visible ears, voluminous mane and exposed saber fangs", () => {
  for (const stance of ["quadruped", "biped"]) {
    for (const headScale of [60, 100, 140]) {
      for (const { id: lionEars } of options.lionEars) {
        for (const { id: lionMane } of options.lionMane) {
          for (const { id: lionMuzzle } of options.lionMuzzle) {
            const definition = { ...defaults, faceType: "lion", stance, headScale,
              lionEars, lionMane, lionMuzzle };
            const skeleton = createSkeleton(definition);
            assert.ok(Math.abs(skeleton.headHeight - 0.4 * headScale / 100) < 1e-12);
            const boxes = createBoxes(definition);
            const chin = boxes.find(({ part }) => part === "lion-chin");
            const muzzle = boxes.find(({ part }) => part === "lion-muzzle");
            const mane = boxes.filter(({ part }) => part.startsWith("lion-mane-"));
            assert.equal(mane.length, lionMane === "none" ? 0 : 9);
            for (const side of [-1, 1]) {
              const ear = boxes.find(({ part }) => part === `lion-ear-${side}`);
              const root = boxes.find(({ part }) => part === `lion-ear-root-${side}`);
              const skull = boxes.find(({ part }) => part === "skull");
              for (const connected of [skull, ear]) {
                assert.ok(root.min.every((value, axis) => value < connected.max[axis]
                  && root.max[axis] > connected.min[axis]), "ear root overlaps the skull and ear");
              }
              assert.ok(ear.max[1] > skeleton.headMaxY);
              assert.ok(mane.every((box) => box.max[1] < ear.max[1]));
              if (lionMane !== "none") {
                const upper = mane.find(({ part }) => part === `lion-mane-${side}-upper`);
                const middle = mane.find(({ part }) => part === `lion-mane-${side}-middle`);
                const lower = mane.find(({ part }) => part === `lion-mane-${side}-lower`);
                const outside = (box) => side < 0 ? -box.min[0] : box.max[0];
                assert.ok(outside(middle) > outside(upper) && outside(middle) > outside(lower));
                assert.ok(upper.max[1] > middle.max[1] && middle.min[1] > lower.min[1]);
              }
              const fang = boxes.find(({ part }) => part === `lion-fang-${side}`);
              assert.ok(fang.min[1] < chin.min[1]);
              assert.ok(fang.min[2] > muzzle.max[2]);
              assert.ok(Math.abs(fang.vertices[0][0] - fang.vertices[1][0])
                < Math.abs(fang.vertices[2][0] - fang.vertices[3][0]));
            }
            for (const animation of ["walk", "roar"]) {
              assert.ok(Array.from(createMesh(definition, 0.3, animation).positions).every(Number.isFinite));
            }
          }
        }
      }
    }
  }
});

test("horse face extends into a short nose and mane lengths share a head-to-back path", () => {
  for (const stance of ["quadruped", "biped"]) {
    for (const headScale of [60, 100, 140]) {
      for (const neckShape of ["low", "raised", "long"]) {
        for (const neckLength of [60, 140]) {
          for (const { id: horseEars } of options.horseEars) {
            const definition = { ...defaults, faceType: "horse", stance, headScale,
              neckShape, neckLength, horseEars };
            const skeleton = createSkeleton(definition);
            const variants = ["short", "crest", "flowing"].map((horseMane) =>
              createBoxes({ ...definition, horseMane }));
            const [short, standard, long] = variants;
            const skull = short.find(({ part }) => part === "skull");
            const face = short.find(({ part }) => part === "horse-face");
            const nose = short.find(({ part }) => part === "horse-muzzle");
            assert.ok(face.min[2] < skull.max[2] && face.max[2] > skull.max[2]);
            assert.ok(nose.min[2] < face.max[2] && nose.max[2] > face.max[2]);
            assert.ok(nose.max[2] - nose.min[2] < (face.max[2] - face.min[2]) / 4);
            assert.equal(face.color, skull.color);
            assert.equal(nose.color, skull.color);
            assert.equal(short.find(({ part }) => part === "horse-jaw").color, skull.color);
            assert.equal(short.some(({ part }) => part === "horse-mouth"), false);
            const nostrils = short.filter(({ part }) => part.startsWith("horse-nostril-"));
            assert.equal(nostrils.length, 2);
            assert.ok(nostrils.every(({ color, max }) => color === "#34383c" && max[2] > nose.max[2]));
            assert.ok(Math.abs(face.vertices[4][0]) < Math.abs(face.vertices[0][0]));
            assert.deepEqual(
              plain(short.filter(({ part }) => !part.startsWith("horse-mane-"))),
              plain(long.filter(({ part }) => !part.startsWith("horse-mane-"))),
            );
            const manes = variants.map((boxes) =>
              boxes.filter(({ part }) => part.startsWith("horse-mane-")));
            assert.ok(manes.every((boxes) => boxes.length === 9));
            const overlap = (a, b) => a.min.every((value, axis) =>
              value < b.max[axis] && a.max[axis] > b.min[axis]);
            assert.ok(overlap(manes[0][0], skull), "mane connects to the back of the head");
            const root = short.find(({ part }) => part === "horse-mane-back-root");
            assert.ok(overlap(root, short.find(({ part }) => part === "torso")));
            for (const mane of manes) {
              for (let index = 1; index < mane.length; index += 1) {
                assert.ok(overlap(mane[index - 1], mane[index]), "mane sections stay connected");
              }
            }
            for (let index = 0; index < manes[0].length; index += 1) {
              const boxes = manes.map((mane) => mane[index]);
              const centers = boxes.map(({ min, max }) => min.map((value, axis) =>
                (value + max[axis]) / 2));
              assert.ok(centers.every((center) => center.every((value, axis) =>
                Math.abs(value - centers[0][axis]) < 1e-12)));
              assert.ok(boxes[0].max[1] - boxes[0].min[1] < boxes[1].max[1] - boxes[1].min[1]);
              assert.ok(boxes[1].max[1] - boxes[1].min[1] < boxes[2].max[1] - boxes[2].min[1]);
              const section = Number(boxes[0].part.split("-")[2]);
              const previousHalf = section === 0
                ? Math.abs(skeleton.neckTop[1] - skeleton.headMaxY) / 8
                : section === 1
                  ? Math.abs(skeleton.bodyCenter[1] + skeleton.bodyHeight * 0.5 - skeleton.neckTop[1]) / 8
                  : 0;
              for (const [variant, length] of [0.03, 0.12, 0.32].entries()) {
                assert.ok(Math.abs((boxes[variant].max[1] - boxes[variant].min[1]) / 2
                  - previousHalf - length * headScale / 100) < 1e-12);
              }
            }
            const valuesFor = (mesh, part) => Array.from(mesh.positions.filter((_, index) =>
              mesh.parts[Math.floor(index / 3)] === part));
            const still = createMesh(definition);
            for (const animation of ["walk", "roar"]) {
              const animated = createMesh(definition, 0.3, animation);
              assert.ok(Array.from(animated.positions).every(Number.isFinite));
              assert.deepEqual(valuesFor(animated, "horse-mane-back-root"),
                valuesFor(still, "horse-mane-back-root"));
              assert.notDeepEqual(valuesFor(animated, "horse-mane-0-0"),
                valuesFor(still, "horse-mane-0-0"));
            }
            assert.equal(skeleton.snoutLength, 0.46 * (headScale / 100));
          }
        }
      }
    }
  }
});

test("playful creature faces combine solid eyes, exposed jagged teeth, tentacles and colorful gills", () => {
  const worldPoints = (box) => box.vertices || (box.frame
    ? [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => {
      const local = [x, y, z].map((value, axis) => value ? box.max[axis] : box.min[axis]);
      return box.frame.origin.map((value, axis) => value + box.frame.axes.reduce(
        (sum, direction, component) => sum + direction[axis] * local[component], 0));
    })))
    : [box.min, box.max]);
  for (const stance of ["quadruped", "biped"]) {
    for (const headScale of [60, 100, 140]) {
      for (const { id: creatureMouth } of options.creatureMouth) {
        for (const { id: creatureSenses } of options.creatureSenses) {
          const definition = { ...defaults, faceType: "creature", stance, headScale,
            creatureMouth, creatureSenses, eyeColor: "azure" };
          assert.deepEqual(plain(normalizeDefinition(plain(definition))), plain(definition));
          const boxes = createBoxes(definition);
          const eyes = boxes.filter(({ part }) => part.startsWith("creature-eye-"));
          assert.equal(eyes.length, creatureSenses === "cluster" ? 3 : 2);
          assert.equal(boxes.some(({ part }) => /pupil|socket/.test(part)), false);
          const eyeColor = palettes.eyeColor.find(({ id }) => id === definition.eyeColor).color;
          const solids = boxes.filter(({ part }) => !part.startsWith("creature-eye-"));
          for (const eye of eyes) {
            assert.equal(eye.color, eyeColor);
            assert.ok((eye.max[0] - eye.min[0]) / (headScale / 100) >= 0.12 - 1e-12);
            const center = eye.min.map((value, axis) => (value + eye.max[axis]) / 2);
            assert.ok(solids.every((box) => {
              const points = worldPoints(box);
              return center.some((value, axis) => value < Math.min(...points.map((point) => point[axis]))
                || value > Math.max(...points.map((point) => point[axis])));
            }), "eyes remain exposed");
          }
          if (creatureMouth === "jagged") {
            const mouth = boxes.find(({ part }) => part === "creature-mouth");
            const teeth = boxes.filter(({ part }) => part.startsWith("creature-jagged-tooth-"));
            assert.equal(teeth.length, 14);
            assert.ok(teeth.every(({ vertices, max }) => vertices && max[2] > mouth.max[2]));
          }
          assert.equal(boxes.filter(({ part }) => part.startsWith("creature-tentacle-")).length,
            creatureMouth === "octopus" ? 18 : 0);
          if (creatureSenses === "giant-gills") {
            const gills = boxes.filter(({ part }) => part.startsWith("creature-giant-gill-"));
            assert.equal(gills.length, 10);
            assert.equal(new Set(gills.map(({ color }) => color)).size, 3);
            const skeleton = createSkeleton(definition);
            assert.ok(gills.every((box) => worldPoints(box).some((point) =>
              Math.abs(point[0]) > skeleton.headWidth * 1.8)));
          }
          for (const animation of ["walk", "roar"]) {
            const mesh = createMesh(definition, 0.3, animation);
            assert.ok(Array.from(mesh.positions).every(Number.isFinite));
            assert.equal(mesh.positions.length, mesh.colors.length);
          }
          const recolored = createBoxes({ ...definition, eyeColor: "crimson" });
          assert.deepEqual(plain(boxes.filter(({ part }) => !part.startsWith("creature-eye-"))),
            plain(recolored.filter(({ part }) => !part.startsWith("creature-eye-"))));
        }
      }
    }
  }
});

test("size controls reject out-of-range and non-step values", () => {
  for (const value of [50, 141, 101, 139, NaN, "100"]) {
    assert.equal(isDefinition({ ...defaults, headScale: value }), false);
  }
  for (const value of [60, 100, 140]) {
    assert.equal(isDefinition({ ...defaults, headScale: value }), true);
  }
});

test("body colors change material without changing the creature geometry", () => {
  const base = createBoxes(defaults);
  const recolored = createBoxes({ ...defaults, body: "coral" });
  assert.deepEqual(
    plain(recolored.map(({ part, min, max }) => ({ part, min, max }))),
    plain(base.map(({ part, min, max }) => ({ part, min, max }))),
  );
  assert.notDeepEqual(recolored.map(({ color }) => color), base.map(({ color }) => color));
});

test("eye color choices change only the eye material", () => {
  for (const stance of ["quadruped", "biped"]) {
    const original = createMesh({ ...defaults, stance });
    const changed = createMesh({ ...defaults, stance, eyeColor: "crimson" });
    assert.deepEqual(
      Array.from(original.positions.filter((_, index) =>
        original.parts[Math.floor(index / 3)] === "eye")),
      Array.from(changed.positions.filter((_, index) =>
        changed.parts[Math.floor(index / 3)] === "eye")),
    );
    const colorsFor = (mesh, part) => mesh.colors.filter((_, index) =>
      mesh.parts[Math.floor(index / 3)] === part);
    assert.notDeepEqual(Array.from(colorsFor(original, "eye")), Array.from(colorsFor(changed, "eye")));
    assert.deepEqual(Array.from(colorsFor(original, "pupil")), Array.from(colorsFor(changed, "pupil")));
  }
});
