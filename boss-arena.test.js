"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadArena() {
  const context = {
    URLSearchParams,
    location: { search: "?boss-test=1" },
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["world-model.js", "mob-model.js", "boss-arena.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context);
  }
  return {
    world: context.MoneycraftBossArena.createWorld(),
    arena: context.MoneycraftBossArena,
    mob: context.MoneycraftMob,
  };
}

test("boss arena scales the enemy to 63 percent while keeping its feet on the floor", () => {
  const { world, arena, mob } = loadArena();
  const entity = arena.createEntity();
  const reference = mob.createMesh(entity.definition, null, "walk", "enemy");
  const minY = Math.min(...entity.mesh.positions.filter((_, index) => index % 3 === 1));
  const maxY = Math.max(...entity.mesh.positions.filter((_, index) => index % 3 === 1));
  const referenceHeight = Math.max(...reference.positions.filter((_, index) => index % 3 === 1));

  assert.ok(Math.abs(minY - entity.position.y) < 1e-6);
  assert.ok(Math.abs((maxY - minY) / referenceHeight - 0.63) < 1e-5);
  assert.ok(Math.abs(entity.bodyBounds.maxY / referenceHeight - 0.63) < 1e-5);
  assert.equal(world.findSurface(entity.position.x, entity.position.z), entity.position.y);
});

test("boss arena enemy walks toward the player and pauses its gait at stop range", () => {
  const { world, arena } = loadArena();
  const entity = arena.createEntity();
  const initialPosition = { ...entity.position };
  const initialPhase = entity.animationPhase;

  arena.updateEntity(entity, world, { x: 20.5, z: 29.5 }, 1);
  assert.ok(entity.position.x < initialPosition.x);
  assert.equal(entity.position.y, 6);
  assert.equal(entity.state, "walk");
  assert.ok(entity.animationPhase > initialPhase);
  assert.ok(entity.mesh.positions.some((value, index) => index % 3 === 0 && value < 32));

  entity.attackCooldown = 2;
  const stoppedPosition = { ...entity.position };
  const nearbyTarget = { x: entity.position.x + 4.5, z: entity.position.z };
  arena.updateEntity(entity, world, nearbyTarget, 1);
  assert.equal(entity.state, "idle");
  assert.equal(entity.position.x, stoppedPosition.x);
  assert.equal(entity.position.y, stoppedPosition.y);
  assert.equal(entity.position.z, stoppedPosition.z);
  const stoppedPhase = entity.animationPhase;
  const stoppedMesh = Array.from(entity.mesh.positions);
  arena.updateEntity(entity, world, nearbyTarget, 0.1);
  assert.equal(entity.animationPhase, stoppedPhase);
  assert.deepEqual(Array.from(entity.mesh.positions), stoppedMesh);
});

test("boss arena telegraphs a stomp, hits a stationary target, and enters recovery", () => {
  const { world, arena } = loadArena();
  const entity = arena.createEntity();
  const target = { x: 32, z: 33 };

  arena.updateEntity(entity, world, target, 0);
  assert.equal(entity.state, "telegraph");
  assert.equal(entity.event, "telegraph");
  const telegraphPose = Array.from(entity.mesh.positions);

  arena.updateEntity(entity, world, target, 1.86);
  assert.equal(entity.state, "active");
  assert.equal(entity.event, "hit");
  assert.notDeepEqual(Array.from(entity.mesh.positions), telegraphPose);

  arena.updateEntity(entity, world, target, 0.3);
  assert.equal(entity.state, "recovery");
  assert.equal(entity.event, null, "one stomp resolves only once");
  arena.updateEntity(entity, world, target, 1);
  assert.equal(entity.state, "idle");
  assert.ok(entity.attackCooldown > 0);
  arena.updateEntity(entity, world, target, 0.1);
  assert.equal(entity.event, null, "cooldown prevents an immediate repeat");
});

test("boss arena stomp can be dodged by leaving its announced impact area", () => {
  const { world, arena } = loadArena();
  const entity = arena.createEntity();
  const target = { x: 32, z: 33 };
  arena.updateEntity(entity, world, target, 0);
  target.x += 3;

  arena.updateEntity(entity, world, target, 1.86);

  assert.equal(entity.state, "active");
  assert.equal(entity.event, "miss");
});

test("boss arena includes a visible half-step and unsupported gap", () => {
  const { world } = loadArena();
  assert.equal(world.findSurface(32, 28), 6);
  assert.equal(world.findSurface(32, 34), 6.5);
  assert.equal(world.findSurface(32, 46), 1);
  assert.equal(world.findSurface(32, 52), 6);
});

test("boss arena enemy crosses the raised path and stops before its gap", () => {
  const { world, arena } = loadArena();
  const entity = arena.createEntity();

  for (let index = 0; index < 180; index += 1) {
    arena.updateEntity(entity, world, { x: 32, z: 55 }, 1 / 30);
  }

  assert.ok(entity.position.z > 34, "the enemy crosses the raised path");
  assert.ok(entity.position.z < 45, "the enemy stays on the near side of the gap");
  assert.equal(entity.position.y, 6.5);
  assert.equal(entity.state, "idle");
});

test("boss arena enemy stays grounded and cannot cross the arena wall", () => {
  const { world, arena } = loadArena();
  const entity = arena.createEntity();
  const worldBefore = world.serialize();

  for (let index = 0; index < 120; index += 1) {
    arena.updateEntity(entity, world, { x: 0.5, z: 28 }, 0.25);
  }
  assert.ok(entity.position.x > 0);
  assert.equal(entity.position.y, 6);
  assert.ok(Math.min(...entity.mesh.positions.filter((_, index) => index % 3 === 1)) >= 6 - 1e-6);
  assert.deepEqual(world.serialize(), worldBefore, "the test mob must not edit arena terrain");

  const stoppedX = entity.position.x;
  arena.updateEntity(entity, world, { x: 0.5, z: 28 }, 1);
  assert.equal(entity.position.x, stoppedX);
});

test("boss arena enemy steps onto half slabs and follows their surface height", () => {
  const { world, arena } = loadArena();
  for (let z = 31; z <= 42; z += 1) {
    for (let x = 1; x < world.dimensions.width - 1; x += 1) world.setBlock(x, 6, z, 16);
  }
  const entity = arena.createEntity();

  for (let index = 0; index < 120; index += 1) {
    arena.updateEntity(entity, world, { x: 32, z: 55 }, 1 / 30);
  }

  assert.ok(entity.position.z > 34, "the enemy crosses the half-block step");
  assert.equal(entity.position.y, 6.5);
  assert.ok(Math.abs(Math.min(...entity.mesh.positions.filter((_, index) => index % 3 === 1)) - 6.5) < 1e-5);
});

test("boss arena enemy stops before unsupported ground instead of treating a gap as floor", () => {
  const { world, arena } = loadArena();
  const { width } = world.dimensions;
  for (let z = 36; z <= 42; z += 1) {
    for (let y = 0; y <= 6; y += 1) {
      for (let x = 1; x < width - 1; x += 1) world.setBlock(x, y, z, 0);
    }
  }
  const entity = arena.createEntity();

  for (let index = 0; index < 120; index += 1) {
    arena.updateEntity(entity, world, { x: 32, z: 55 }, 1 / 30);
  }

  assert.ok(entity.position.z < 36, "the enemy remains on supported ground");
  assert.equal(entity.position.y, 6.5);
  assert.ok(Math.min(...entity.mesh.positions.filter((_, index) => index % 3 === 1)) >= 6.5 - 1e-5);
  assert.equal(entity.state, "idle");
});

test("boss arena movement rejects invalid time steps and target positions", () => {
  const { world, arena } = loadArena();
  const entity = arena.createEntity();
  assert.throws(() => arena.updateEntity(entity, world, { x: 1, z: 1 }, -1), /delta time/);
  assert.throws(() => arena.updateEntity(entity, world, { x: NaN, z: 1 }, 1), /target position/);
});
