"use strict";

((root) => {
  const FORMAT_VERSION = 1;
  const DEFAULT_SEED = 20261015;

  function createModel({ width, depth, height, blockCount = 5, seed = DEFAULT_SEED }) {
    if (![width, depth, height, blockCount].every(Number.isSafeInteger)
      || width < 1 || depth < 1 || height < 1 || blockCount < 1) {
      throw new TypeError("World dimensions and block count must be positive integers.");
    }

    let data = new Uint8Array(width * depth * height);
    let worldSeed = seed >>> 0;

    function inBounds(x, y, z) {
      return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)
        && x >= 0 && x < width && z >= 0 && z < depth && y >= 0 && y < height;
    }

    function indexOf(x, y, z) {
      return (y * depth + z) * width + x;
    }

    function getBlock(x, y, z) {
      return inBounds(x, y, z) ? data[indexOf(x, y, z)] : 0;
    }

    function setBlock(x, y, z, block) {
      if (!inBounds(x, y, z) || !Number.isInteger(block) || block < 0 || block > blockCount) {
        return false;
      }
      data[indexOf(x, y, z)] = block;
      return true;
    }

    function randomGenerator(value) {
      let state = value >>> 0;
      return () => {
        state += 0x6D2B79F5;
        let result = state;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
      };
    }

    function terrainHeight(x, z) {
      return Math.floor(
        5
        + Math.sin(x * 0.31) * 1.2
        + Math.sin(z * 0.27) * 1.25
        + Math.sin((x + z) * 0.17) * 0.75
        + Math.sin((x - z) * 0.11) * 0.55,
      );
    }

    function reset(nextSeed = DEFAULT_SEED) {
      worldSeed = nextSeed >>> 0;
      data = new Uint8Array(width * depth * height);
      const heights = Array.from({ length: depth }, () => Array(width).fill(0));
      for (let z = 0; z < depth; z += 1) {
        for (let x = 0; x < width; x += 1) {
          const surface = terrainHeight(x, z);
          heights[z][x] = surface;
          for (let y = 0; y <= surface && y < height; y += 1) {
            setBlock(x, y, z, y === surface ? 1 : y >= surface - 3 ? 2 : 3);
          }
        }
      }

      const random = randomGenerator(worldSeed);
      for (let z = 3; z < depth - 3; z += 1) {
        for (let x = 3; x < width - 3; x += 1) {
          if (random() > 0.04) continue;
          const ground = heights[z][x];
          const trunkHeight = 3 + Math.floor(random() * 2);
          for (let dy = 1; dy <= trunkHeight; dy += 1) setBlock(x, ground + dy, z, 4);
          const crownY = ground + trunkHeight;
          for (let dy = -1; dy <= 2; dy += 1) {
            for (let dz = -2; dz <= 2; dz += 1) {
              for (let dx = -2; dx <= 2; dx += 1) {
                if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - 1) > 4) continue;
                if (getBlock(x + dx, crownY + dy, z + dz) === 0) setBlock(x + dx, crownY + dy, z + dz, 5);
              }
            }
          }
        }
      }
    }

    function findSurface(x, z) {
      const cellX = Math.max(0, Math.min(width - 1, Math.floor(x)));
      const cellZ = Math.max(0, Math.min(depth - 1, Math.floor(z)));
      for (let y = height - 1; y >= 0; y -= 1) {
        if (getBlock(cellX, y, cellZ) !== 0) return y + 1;
      }
      return 1;
    }

    function load(snapshot) {
      const isLegacy = Array.isArray(snapshot);
      const blocks = isLegacy ? snapshot : snapshot?.blocks;
      if (!isLegacy && (!snapshot || snapshot.version !== FORMAT_VERSION
        || snapshot.width !== width || snapshot.depth !== depth || snapshot.height !== height)) {
        return false;
      }
      if (!Array.isArray(blocks) || blocks.length !== data.length
        || !blocks.every((block) => Number.isInteger(block) && block >= 0 && block <= blockCount)) {
        return false;
      }
      const nextData = Uint8Array.from(blocks);
      data = nextData;
      if (!isLegacy && Number.isSafeInteger(snapshot.seed)) worldSeed = snapshot.seed >>> 0;
      return true;
    }

    function serialize() {
      return {
        version: FORMAT_VERSION,
        width,
        depth,
        height,
        seed: worldSeed,
        blocks: Array.from(data),
      };
    }

    reset(worldSeed);
    return Object.freeze({
      dimensions: Object.freeze({ width, depth, height }),
      formatVersion: FORMAT_VERSION,
      getBlock,
      setBlock,
      inBounds,
      findSurface,
      reset,
      load,
      serialize,
    });
  }

  root.MoneycraftWorld = Object.freeze({ createModel, formatVersion: FORMAT_VERSION });
})(globalThis);
