"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "silhouette-effect.js"), "utf8"), context);
const { defaults, presets, validate } = context.MoneycraftSilhouetteEffect;

test("silhouette color presets share independent outline and glow settings", () => {
  validate(defaults);
  assert.ok(Object.isFrozen(defaults));
  for (const preset of Object.values(presets)) {
    const settings = { ...defaults, ...preset };
    validate(settings);
    validate({ ...settings, outlineEnabled: false });
    validate({ ...settings, glowEnabled: false });
    assert.equal(settings.outlineWidth, defaults.outlineWidth);
    assert.equal(settings.glowRadius, defaults.glowRadius);
    assert.deepEqual(Object.keys(preset).sort(), ["glowColor", "outlineColor"]);
    assert.ok(Object.isFrozen(preset));
  }
});

test("silhouette settings reject malformed colors, flags and out-of-range values", () => {
  assert.throws(() => validate(null), /Invalid silhouette/);
  for (const key of ["outlineColor", "glowColor"]) {
    for (const value of ["red", "#fff", "#gg0000", null]) {
      assert.throws(() => validate({ ...defaults, [key]: value }), /Invalid silhouette/);
    }
  }
  for (const key of ["outlineEnabled", "glowEnabled"]) {
    for (const value of [0, 1, "true", null]) {
      assert.throws(() => validate({ ...defaults, [key]: value }), /Invalid silhouette/);
    }
  }
  for (const [key, min, max] of [
    ["outlineWidth", 1, 8], ["outlineOpacity", 0, 1], ["glowRadius", 1, 40], ["glowStrength", 0, 1],
  ]) {
    validate({ ...defaults, [key]: min });
    validate({ ...defaults, [key]: max });
    for (const value of [min - 0.01, max + 0.01, NaN, Infinity, "2"]) {
      assert.throws(() => validate({ ...defaults, [key]: value }), /Invalid silhouette/);
    }
  }
});
