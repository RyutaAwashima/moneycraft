"use strict";

((root) => {
  const enabled = new URLSearchParams(root.location?.search || "").get("boss-test") === "1";

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
    return world;
  }

  function createEntity() {
    const definition = Object.freeze({ ...root.MoneycraftMob.defaults });
    const position = Object.freeze({ x: 32, y: 6, z: 28 });
    const mesh = root.MoneycraftMob.createMesh(definition, null, "walk", "enemy");
    const positions = new Float32Array(mesh.positions.length);
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] = mesh.positions[index] + position.x;
      positions[index + 1] = mesh.positions[index + 1] + position.y;
      positions[index + 2] = mesh.positions[index + 2] + position.z;
    }
    return Object.freeze({
      id: "boss-test-1", definition, stage: "enemy", position, yaw: 0, state: "idle",
      mesh: { ...mesh, positions },
    });
  }

  root.MoneycraftBossArena = Object.freeze({ enabled, createWorld, createEntity });
})(globalThis);
