"use strict";

((root) => {
  const enabled = new URLSearchParams(root.location?.search || "").get("boss-test") === "1";
  const ENTITY_SPEED = 2.4;
  const STOP_DISTANCE = 4.5;
  const WALK_CYCLE_DISTANCE = 2.4;
  const MAX_MOVE_STEP = 0.1;
  const MAX_STEP_HEIGHT = 0.5;
  const ENEMY_SCALE = 0.63;
  const STOMP_START_DISTANCE = 6.5;
  const STOMP_HIT_RADIUS = 2.2;
  const STOMP_DURATION = 3;
  const STOMP_IMPACT_PHASE = 0.62;
  const STOMP_ACTIVE_END_PHASE = 0.7;
  const ATTACK_COOLDOWN = 1.2;

  function createWorld() {
    const world = root.MoneycraftWorld.createModel(root.MoneycraftWorld.defaultOptions);
    const { width, height, depth } = world.dimensions;
    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          const border = x === 0 || z === 0 || x === width - 1 || z === depth - 1;
          world.setBlock(x, y, z, y < 5 || (border && y < 9) ? 3 : y === 5 ? 1 : 0);
        }
      }
    }
    for (let z = 31; z <= 42; z += 1) {
      for (let x = 1; x < width - 1; x += 1) world.setBlock(x, 6, z, 16);
    }
    for (let z = 45; z <= 48; z += 1) {
      for (let y = 0; y <= 5; y += 1) {
        for (let x = 1; x < width - 1; x += 1) world.setBlock(x, y, z, 0);
      }
    }
    return world;
  }

  function createEntity() {
    const definition = Object.freeze({ ...root.MoneycraftMob.defaults });
    const entity = {
      id: "boss-test-1", definition, stage: "enemy",
      position: { x: 32, y: 6, z: 28 }, yaw: 0, state: "idle", animationPhase: 0,
      mesh: null, bodyBounds: null, attackTimer: 0, attackTarget: null,
      attackCooldown: 0, attackResolved: false, event: null,
    };
    const restMesh = root.MoneycraftMob.createMesh(definition, null, "walk", "enemy");
    entity.bodyBounds = scaleBounds(getBounds(restMesh.positions), ENEMY_SCALE);
    entity.mesh = placeMesh(restMesh, entity.position, entity.yaw);
    return entity;
  }

  function scaleBounds(bounds, scale) {
    return Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, value * scale]));
  }

  function getBounds(positions) {
    const bounds = {
      minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity,
      minZ: Infinity, maxZ: -Infinity,
    };
    for (let index = 0; index < positions.length; index += 3) {
      bounds.minX = Math.min(bounds.minX, positions[index]);
      bounds.maxX = Math.max(bounds.maxX, positions[index]);
      bounds.minY = Math.min(bounds.minY, positions[index + 1]);
      bounds.maxY = Math.max(bounds.maxY, positions[index + 1]);
      bounds.minZ = Math.min(bounds.minZ, positions[index + 2]);
      bounds.maxZ = Math.max(bounds.maxZ, positions[index + 2]);
    }
    return bounds;
  }

  function placeMesh(mesh, position, yaw) {
    const positions = new Float32Array(mesh.positions.length);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    for (let index = 0; index < positions.length; index += 3) {
      const x = mesh.positions[index] * ENEMY_SCALE;
      const y = mesh.positions[index + 1] * ENEMY_SCALE;
      const z = mesh.positions[index + 2] * ENEMY_SCALE;
      positions[index] = position.x + x * cosYaw + z * sinYaw;
      positions[index + 1] = position.y + y;
      positions[index + 2] = position.z - x * sinYaw + z * cosYaw;
    }
    return { ...mesh, positions };
  }

  function surfaceAt(world, x, z) {
    const { width, depth, height } = world.dimensions;
    if (x < 0 || x >= width || z < 0 || z >= depth) return null;
    const blockX = Math.floor(x);
    const blockZ = Math.floor(z);
    const localX = x - blockX;
    const localZ = z - blockZ;
    for (let blockY = height - 1; blockY >= 0; blockY -= 1) {
      const tops = world.getBoxes(blockX, blockY, blockZ)
        .filter((box) => localX >= box.min[0] && localX <= box.max[0]
          && localZ >= box.min[2] && localZ <= box.max[2])
        .map((box) => blockY + box.max[1]);
      if (tops.length) return Math.max(...tops);
    }
    return null;
  }

  function collidesAt(entity, world, x, z) {
    const { width, depth } = world.dimensions;
    const { minX, maxX, minY, maxY, minZ, maxZ } = entity.bodyBounds;
    const cosYaw = Math.abs(Math.cos(entity.yaw));
    const sinYaw = Math.abs(Math.sin(entity.yaw));
    const halfX = cosYaw * Math.max(Math.abs(minX), Math.abs(maxX))
      + sinYaw * Math.max(Math.abs(minZ), Math.abs(maxZ));
    const halfZ = sinYaw * Math.max(Math.abs(minX), Math.abs(maxX))
      + cosYaw * Math.max(Math.abs(minZ), Math.abs(maxZ));
    if (x - halfX < 0 || x + halfX > width || z - halfZ < 0 || z + halfZ > depth) return true;

    const floorY = surfaceAt(world, x, z);
    if (floorY === null) return true;
    for (const [sampleX, sampleZ] of [
      [x - halfX, z - halfZ], [x - halfX, z + halfZ],
      [x + halfX, z - halfZ], [x + halfX, z + halfZ],
    ]) {
      const sampleY = surfaceAt(world, sampleX, sampleZ);
      if (sampleY === null || Math.abs(sampleY - floorY) > MAX_STEP_HEIGHT) return true;
    }

    const min = [x - halfX, floorY + MAX_STEP_HEIGHT, z - halfZ];
    const max = [x + halfX, floorY + maxY - 0.0001, z + halfZ];
    for (let blockY = Math.floor(min[1]); blockY <= Math.floor(max[1]); blockY += 1) {
      for (let blockZ = Math.floor(min[2]); blockZ <= Math.floor(max[2]); blockZ += 1) {
        for (let blockX = Math.floor(min[0]); blockX <= Math.floor(max[0]); blockX += 1) {
          if (world.getBlock(blockX, blockY, blockZ) === 0) continue;
          if (world.intersectsBox(blockX, blockY, blockZ, min, max)) return true;
        }
      }
    }
    return false;
  }

  function setEntityPose(entity, animation, phase = null) {
    const mesh = root.MoneycraftMob.createMesh(entity.definition, phase, animation, entity.stage);
    entity.mesh = placeMesh(mesh, entity.position, entity.yaw);
  }

  function updateStomp(entity, target, dt) {
    entity.attackTimer = Math.min(STOMP_DURATION, entity.attackTimer + dt);
    const phase = entity.attackTimer / STOMP_DURATION;
    if (!entity.attackResolved && phase >= STOMP_IMPACT_PHASE) {
      const dx = target.x - entity.attackTarget.x;
      const dz = target.z - entity.attackTarget.z;
      entity.event = Math.hypot(dx, dz) <= STOMP_HIT_RADIUS ? "hit" : "miss";
      entity.attackResolved = true;
    }

    if (phase < STOMP_IMPACT_PHASE) entity.state = "telegraph";
    else if (phase < STOMP_ACTIVE_END_PHASE) entity.state = "active";
    else if (phase < 1) entity.state = "recovery";
    else {
      entity.state = "idle";
      entity.attackCooldown = ATTACK_COOLDOWN;
      entity.attackTarget = null;
      setEntityPose(entity, "walk");
      return;
    }
    setEntityPose(entity, "stomp", phase);
  }

  function updateEntity(entity, world, target, dt) {
    if (!entity || !world || !target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) {
      throw new TypeError("Boss arena entity, world, and target position are required.");
    }
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError("Boss arena delta time must be non-negative.");

    entity.event = null;
    entity.attackCooldown = Math.max(0, entity.attackCooldown - dt);
    if (entity.state === "telegraph" || entity.state === "active" || entity.state === "recovery") {
      updateStomp(entity, target, dt);
      return entity;
    }

    const previousYaw = entity.yaw;
    const previousState = entity.state;
    const dx = target.x - entity.position.x;
    const dz = target.z - entity.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.0001) entity.yaw = Math.atan2(dx, dz);

    if (distance <= STOMP_START_DISTANCE && entity.attackCooldown === 0) {
      entity.attackTarget = { x: target.x, z: target.z };
      entity.attackTimer = 0;
      entity.attackResolved = false;
      entity.state = "telegraph";
      entity.event = "telegraph";
      setEntityPose(entity, "stomp", 0);
      return entity;
    }

    let remaining = Math.min(ENTITY_SPEED * dt, Math.max(0, distance - STOP_DISTANCE));
    let travelled = 0;
    const directionX = distance > 0 ? dx / distance : 0;
    const directionZ = distance > 0 ? dz / distance : 0;
    while (remaining > 0.0001) {
      const step = Math.min(MAX_MOVE_STEP, remaining);
      const beforeX = entity.position.x;
      const beforeZ = entity.position.z;
      const nextX = beforeX + directionX * step;
      if (!collidesAt(entity, world, nextX, beforeZ)) {
        entity.position.x = nextX;
        entity.position.y = surfaceAt(world, nextX, beforeZ);
      }
      const nextZ = beforeZ + directionZ * step;
      if (!collidesAt(entity, world, entity.position.x, nextZ)) {
        entity.position.z = nextZ;
        entity.position.y = surfaceAt(world, entity.position.x, nextZ);
      }
      const moved = Math.hypot(entity.position.x - beforeX, entity.position.z - beforeZ);
      travelled += moved;
      if (moved < 0.0001) break;
      remaining -= step;
    }

    const nextState = travelled > 0.0001 ? "walk" : "idle";
    if (nextState === "walk") {
      entity.animationPhase = (entity.animationPhase + travelled / WALK_CYCLE_DISTANCE) % 1;
    }
    if (travelled > 0.0001 || nextState !== previousState
      || Math.abs(entity.yaw - previousYaw) > 0.0001) {
      setEntityPose(entity, "walk", nextState === "walk" ? entity.animationPhase : null);
    }
    entity.state = nextState;
    return entity;
  }

  root.MoneycraftBossArena = Object.freeze({ enabled, createWorld, createEntity, updateEntity });
})(globalThis);
