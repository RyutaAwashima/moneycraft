"use strict";

(() => {
  const WIDTH = 36;
  const DEPTH = 224;
  const HEIGHT = 16;
  const WATER_START = 72;
  const WATER_END = 84;
  const ROUTE = Object.freeze([
    [0, 18], [32, 21], [62, 22], [92, 18], [122, 14], [152, 15], [184, 20], [224, 18],
  ].map(Object.freeze));
  const SECTIONS = Object.freeze([
    { start: 0, end: 0.22, label: "ひだまり草原" },
    { start: 0.22, end: 0.4, label: "せせらぎの木橋" },
    { start: 0.4, end: 0.69, label: "石の森" },
    { start: 0.69, end: 1, label: "花ひらく丘" },
  ].map(Object.freeze));
  const BLOCKS = Object.freeze({
    grass: 1,
    soil: 2,
    stone: 3,
    wood: 4,
    leaves: 5,
    planks: 6,
    brick: 7,
    white: 8,
    blue: 11,
    yellow: 12,
    green: 13,
    purple: 14,
  });

  function centerAtZ(z) {
    const position = Math.max(0, Math.min(DEPTH, z));
    let segment = 0;
    while (segment < ROUTE.length - 2 && position >= ROUTE[segment + 1][0]) segment += 1;
    const [startZ, startX] = ROUTE[segment];
    const [endZ, endX] = ROUTE[segment + 1];
    const amount = Math.max(0, Math.min(1, (position - startZ) / (endZ - startZ)));
    const eased = amount * amount * (3 - 2 * amount);
    return startX + (endX - startX) * eased;
  }

  function getPosition(progress) {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const z = clampedProgress * DEPTH;
    const x = centerAtZ(z);
    const directionX = centerAtZ(Math.min(DEPTH, z + 1)) - centerAtZ(Math.max(0, z - 1));
    const length = Math.hypot(directionX, 2) || 1;
    return { x, y: 3, z, direction: [directionX / length, 2 / length] };
  }

  function getSection(progress) {
    return SECTIONS.find((section) => progress >= section.start && progress < section.end)
      || SECTIONS[SECTIONS.length - 1];
  }

  function createCourse(checkpoints, obstacles = []) {
    if (!Array.isArray(checkpoints) || checkpoints.length === 0
      || checkpoints.some(({ progress }) => !Number.isFinite(progress) || progress < 0 || progress > 1)) {
      throw new TypeError("Course checkpoints must have valid progress positions.");
    }
    if (!Array.isArray(obstacles)
      || obstacles.some(({ progress }) => !Number.isFinite(progress) || progress < 0 || progress > 1)) {
      throw new TypeError("Course obstacles must have valid progress positions.");
    }

    const cells = new Map();
    const keyOf = (x, y, z) => `${x},${y},${z}`;
    function place(x, y, z, block) {
      if (![x, y, z, block].every(Number.isInteger)
        || x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || z < 0 || z >= DEPTH
        || block < 1 || block > 15) {
        throw new RangeError("Course block is outside the course bounds.");
      }
      cells.set(keyOf(x, y, z), { x, y, z, block });
    }

    for (let z = 0; z < DEPTH; z += 1) {
      const center = centerAtZ(z + 0.5);
      const water = z >= WATER_START && z < WATER_END;
      for (let x = 0; x < WIDTH; x += 1) {
        place(x, 0, z, BLOCKS.stone);
        place(x, 1, z, water ? BLOCKS.blue : BLOCKS.soil);
        if (!water) place(x, 2, z, BLOCKS.grass);
      }

      const laneCenter = Math.round(center);
      const deck = water ? BLOCKS.planks : z >= 92 && z < 152 ? BLOCKS.stone : BLOCKS.planks;
      for (let x = laneCenter - 3; x <= laneCenter + 3; x += 1) {
        place(x, 2, z, deck);
      }
      for (const side of [-1, 1]) {
        const railX = laneCenter + side * 4;
        place(railX, 2, z, water ? BLOCKS.wood : BLOCKS.white);
        place(railX, 3, z, water ? BLOCKS.wood : BLOCKS.yellow);
      }
    }

    for (let z = 5; z < DEPTH - 5; z += 9) {
      const center = centerAtZ(z + 0.5);
      for (const side of [-1, 1]) {
        const variation = ((z * 17 + side * 29) % 4) - 1;
        const x = Math.round(center + side * (8 + variation));
        if (x < 2 || x >= WIDTH - 2) continue;
        if (z >= WATER_START - 2 && z < WATER_END + 2) continue;
        for (let y = 3; y <= 5; y += 1) place(x, y, z, BLOCKS.wood);
        for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = 0; dy <= 2; dy += 1) {
            if (Math.abs(dx) + Math.abs(dz) + dy > 3) continue;
            place(x + dx, 6 + dy, z + dz, BLOCKS.leaves);
          }
        }
      }
    }

    const gates = checkpoints.map((checkpoint, index) => {
      const position = getPosition(checkpoint.progress);
      const centerX = Math.round(position.x);
      const gateZ = Math.round(position.z);
      const accent = [BLOCKS.green, BLOCKS.blue, BLOCKS.purple, BLOCKS.yellow][index % 4];
      for (const side of [-1, 1]) {
        for (let y = 3; y <= 8; y += 1) {
          place(centerX + side * 4, y, gateZ, y < 5 ? BLOCKS.wood : accent);
        }
      }
      for (let x = centerX - 4; x <= centerX + 4; x += 1) {
        place(x, 9, gateZ, accent);
      }
      place(centerX, 10, gateZ, BLOCKS.yellow);
      return Object.freeze({ index, progress: checkpoint.progress, x: centerX, z: gateZ });
    });

    const courseObstacles = obstacles.map((obstacle, index) => {
      const position = getPosition(obstacle.progress);
      const centerX = Math.round(position.x);
      const obstacleZ = Math.round(position.z);
      for (let dx = -1; dx <= 1; dx += 1) {
        place(centerX + dx, 3, obstacleZ, dx === 0 ? BLOCKS.yellow : BLOCKS.brick);
      }
      return Object.freeze({ index, progress: obstacle.progress, x: centerX, z: obstacleZ });
    });

    const startX = Math.round(centerAtZ(1));
    const finishX = Math.round(centerAtZ(DEPTH - 2));
    for (const [z, centerX, color] of [
      [2, startX, BLOCKS.green],
      [DEPTH - 3, finishX, BLOCKS.purple],
    ]) {
      for (const side of [-1, 1]) for (let y = 3; y <= 9; y += 1) {
        place(centerX + side * 4, y, z, y === 9 ? color : BLOCKS.wood);
      }
      for (let x = centerX - 4; x <= centerX + 4; x += 1) place(x, 9, z, color);
    }

    const blocks = [...cells.values()].sort((first, second) =>
      first.z - second.z || first.y - second.y || first.x - second.x);
    return Object.freeze({
      dimensions: Object.freeze({ width: WIDTH, depth: DEPTH, height: HEIGHT }),
      blocks: Object.freeze(blocks.map(Object.freeze)),
      gates: Object.freeze(gates),
      obstacles: Object.freeze(courseObstacles),
      getPosition,
      getSection,
    });
  }

  globalThis.MoneycraftMotionRunCourse = Object.freeze({
    blocks: BLOCKS,
    createCourse,
    dimensions: Object.freeze({ width: WIDTH, depth: DEPTH, height: HEIGHT }),
    getPosition,
    getSection,
    sections: SECTIONS,
  });
})();
