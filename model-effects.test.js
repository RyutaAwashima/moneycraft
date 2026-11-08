"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const context = {};
for (const file of ["silhouette-effect.js", "model-effects.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context);
}
const { defaults, presets, validate, createEmitters, createParticles } = context.MoneycraftModelEffects;
const plain = (value) => JSON.parse(JSON.stringify(value));
const mesh = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 4, 0, 0, 2, 2, 0] };

test("unified presets color all three layers without changing geometry or flags", () => {
  for (const preset of Object.values(presets)) {
    validate({ ...defaults, ...preset });
    assert.ok(Object.isFrozen(preset));
    for (const key of ["outlineColor", "glowColor", "particleColor", "particleRimColor"]) {
      assert.match(preset[key], /^#[0-9a-f]{6}$/);
    }
    assert.equal(Object.keys(preset).length, 4);
  }
  assert.equal(presets.dark.particleColor, defaults.particleColor);
  for (const flags of [0, 1, 2, 3, 4, 5, 6, 7]) {
    validate({ ...defaults, outlineEnabled: Boolean(flags & 1),
      glowEnabled: Boolean(flags & 2), particlesEnabled: Boolean(flags & 4) });
  }
  for (const value of ["true", null, 1]) {
    assert.throws(() => validate({ ...defaults, particlesEnabled: value }), /Invalid/);
  }
  for (const value of [-0.1, 1.1, NaN, "1"]) {
    assert.throws(() => validate({ ...defaults, particleOpacity: value }), /Invalid/);
  }
  assert.throws(() => validate({ ...defaults, particleColor: "#fff" }), /Invalid/);
  assert.throws(() => validate({ ...defaults, particleRimColor: null }), /Invalid/);
});

test("generic surface sampling needs no mob parts and is deterministic and area weighted", () => {
  const emitters = createEmitters(mesh, 1000);
  assert.equal(emitters.length, 1000);
  assert.deepEqual(plain(createEmitters(mesh, 1000)), plain(emitters));
  const large = emitters.filter(({ vertex }) => vertex === 3).length;
  assert.ok(large >= 790 && large <= 810, `expected 80% large surface, got ${large / 10}%`);
  assert.ok(createEmitters(mesh, 20, (vertex) => vertex === 3).every(({ vertex }) => vertex === 3));
  for (const { weights } of emitters) {
    assert.ok(weights.every((value) => value >= 0 && value <= 1));
    assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  }
});

test("particles follow another mesh's animation and keep repeatable clock and scale behavior", () => {
  const emitters = createEmitters(mesh);
  const particles = createParticles(mesh, emitters, 0.4);
  assert.deepEqual(plain(createParticles(mesh, emitters, 0.4)), plain(particles));
  const moved = { positions: mesh.positions.map((value, index) => value + [3, 4, 5][index % 3]) };
  const moving = createParticles(moved, emitters, 0.4);
  for (let index = 0; index < particles.length; index++) {
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(moving[index].position[axis] - particles[index].position[axis] - [3, 4, 5][axis]) < 1e-12);
    }
    assert.ok(particles[index].size > 0);
    assert.ok(particles[index].opacity >= 0 && particles[index].opacity <= 0.8);
  }
  assert.notDeepEqual(plain(createParticles(mesh, emitters, 0.6)), plain(particles));
  const doubled = createParticles(mesh, emitters, 0.4, 2);
  assert.equal(doubled[0].size, particles[0].size * 2);
});

test("invalid meshes, emitter topology, clocks and scales fail explicitly", () => {
  for (const invalid of [null, { positions: [] }, { positions: [0, 0, 0] },
    { positions: [...mesh.positions.slice(0, 8), NaN] }]) {
    assert.throws(() => createEmitters(invalid), /Effects/);
  }
  assert.throws(() => createEmitters({ positions: Array(9).fill(0) }), /surface/);
  assert.throws(() => createEmitters(mesh, 320, () => false), /surface/);
  for (const count of [0, 4097, 1.5]) assert.throws(() => createEmitters(mesh, count), /Invalid/);
  const emitters = createEmitters(mesh);
  for (const override of [
    { vertex: 99 }, { vertex: 1 }, { weights: [1, 1, 1] }, { weights: null },
    { lifetime: 0 }, { phase: 1 }, { phase: NaN },
  ]) assert.throws(() => createParticles(mesh, [{ ...emitters[0], ...override }], 0), /emitter/);
  for (const seconds of [-1, NaN, Infinity]) {
    assert.throws(() => createParticles(mesh, emitters, seconds), /time/);
  }
  for (const scale of [0, -1, NaN, Infinity]) {
    assert.throws(() => createParticles(mesh, emitters, 0, scale), /scale/);
  }
  assert.throws(() => createParticles(mesh, null, 0), /emitters/);
});
