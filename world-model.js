"use strict";

((root) => {
  const FORMAT_VERSION = 2;
  const PREVIOUS_FORMAT_VERSION = 1;
  const DEFAULT_SEED = 20261015;
  const DEFAULT_OPTIONS = Object.freeze({ width: 64, depth: 64, height: 20, terrain: "forest-plains" });
  const LEGACY_OPTIONS = Object.freeze({ width: 40, depth: 40, height: 20, terrain: "legacy" });
  const ORIENTATION_COUNT = 24;
  const DIRECTIONS = Object.freeze([
    [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0],
  ]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const orientations = [];
  for (const yAxis of DIRECTIONS) {
    for (const xAxis of DIRECTIONS) {
      if (dot(xAxis, yAxis) !== 0) continue;
      orientations.push(Object.freeze({
        x: Object.freeze(xAxis.slice()),
        y: Object.freeze(yAxis.slice()),
        z: Object.freeze(cross(xAxis, yAxis)),
      }));
    }
  }
  const orientationIndexByYAxis = new Map(orientations.map(({ y }, index) => [y.join(","), index]));
  const cubeBounds = Object.freeze({
    min: Object.freeze([0, 0, 0]), max: Object.freeze([1, 1, 1]),
  });
  const slabBounds = Object.freeze({
    min: Object.freeze([0, 0, 0]), max: Object.freeze([1, 0.5, 1]),
  });
  const UPPER_SLAB_ORIENTATION = 20;
  const upperSlabBounds = Object.freeze({
    min: Object.freeze([0, 0.5, 0]), max: Object.freeze([1, 1, 1]),
  });
  const upperSlabBoxes = Object.freeze([upperSlabBounds]);
  const emptyBoxes = Object.freeze([]);
  const uprightOrientations = Object.freeze(orientations.flatMap(({ y }, index) =>
    y[1] === 1 ? [index] : []));
  const stairOrientations = Object.freeze(orientations.flatMap(({ y }, index) =>
    Math.abs(y[1]) === 1 ? [index] : []));
  function rotatePoint(point, orientation) {
    const axes = orientations[orientation];
    return [0, 1, 2].map((axis) => 0.5
      + (point[0] - 0.5) * axes.x[axis]
      + (point[1] - 0.5) * axes.y[axis]
      + (point[2] - 0.5) * axes.z[axis]);
  }
  const stairBoxes = new Map(stairOrientations.map((orientation) => [
    orientation, Object.freeze([slabBounds, { min: [0, 0.5, 0.5], max: [1, 1, 1] }].map((box) => {
      const a = rotatePoint(box.min, orientation);
      const b = rotatePoint(box.max, orientation);
      return Object.freeze({
        min: Object.freeze(a.map((value, axis) => Math.min(value, b[axis]))),
        max: Object.freeze(a.map((value, axis) => Math.max(value, b[axis]))),
      });
    })),
  ]));
  const stairOutlines = new Map(stairOrientations.map((orientation) => {
    const profile = [[0, 0], [0.5, 0], [0.5, 0.5], [1, 0.5], [1, 1], [0, 1]];
    const sides = [0, 1].map((x) => profile.map(([y, z]) => rotatePoint([x, y, z], orientation)));
    const edges = sides.flatMap((points) => points.map((point, index) =>
      [point, points[(index + 1) % points.length]]));
    edges.push(...sides[0].map((point, index) => [point, sides[1][index]]));
    return [orientation, Object.freeze(edges.map((edge) =>
      Object.freeze(edge.map((point) => Object.freeze(point)))))];
  }));
  const stairShapes = Object.freeze(["straight", "outer-left", "outer-right", "inner-left", "inner-right"]);
  const shapedStairBoxes = new Map();
  const shapedStairOutlines = new Map();
  function containsPoint(boxes, point) {
    return boxes.some((box) => point.every((value, axis) => value > box.min[axis] && value < box.max[axis]));
  }

  function outlineForBoxes(boxes) {
    const edges = [];
    for (let axis = 0; axis < 3; axis += 1) {
      const [u, v] = [0, 1, 2].filter((value) => value !== axis);
      for (let a = 0; a <= 2; a += 1) for (let b = 0; b <= 2; b += 1) {
        let start = null;
        for (let step = 0; step <= 2; step += 1) {
          const quadrants = step === 2 ? [] : [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([du, dv]) => {
            const point = [];
            point[axis] = (step + 0.5) / 2;
            point[u] = a / 2 + du / 4;
            point[v] = b / 2 + dv / 4;
            return containsPoint(boxes, point);
          });
          const count = quadrants.filter(Boolean).length;
          const crease = count === 1 || count === 3
            || (count === 2 && quadrants[0] === quadrants[2]);
          if (crease && start === null) start = step;
          if (!crease && start !== null) {
            const point = [];
            point[axis] = start / 2;
            point[u] = a / 2;
            point[v] = b / 2;
            const end = point.slice();
            end[axis] = step / 2;
            edges.push(Object.freeze([Object.freeze(point), Object.freeze(end)]));
            start = null;
          }
        }
      }
    }
    return Object.freeze(edges);
  }
  for (const orientation of stairOrientations) {
    for (const shape of stairShapes) {
      const key = `${orientation}:${shape}`;
      if (shape === "straight") {
        shapedStairBoxes.set(key, stairBoxes.get(orientation));
        shapedStairOutlines.set(key, stairOutlines.get(orientation));
        continue;
      }
      const left = shape.endsWith("left");
      const minX = left ? 0 : 0.5;
      const maxX = left ? 0.5 : 1;
      const steps = shape.startsWith("outer")
        ? [{ min: [minX, 0.5, 0.5], max: [maxX, 1, 1] }]
        : [{ min: [0, 0.5, 0.5], max: [1, 1, 1] },
          { min: [minX, 0.5, 0], max: [maxX, 1, 0.5] }];
      const boxes = Object.freeze([slabBounds, ...steps].map((box) => {
        const a = rotatePoint(box.min, orientation);
        const b = rotatePoint(box.max, orientation);
        return Object.freeze({
          min: Object.freeze(a.map((value, axis) => Math.min(value, b[axis]))),
          max: Object.freeze(a.map((value, axis) => Math.max(value, b[axis]))),
        });
      }));
      shapedStairBoxes.set(key, boxes);
      shapedStairOutlines.set(key, outlineForBoxes(boxes));
    }
  }

  function shapeAffectedCells(x, y, z) {
    return [[x, y, z], [x - 1, y, z], [x + 1, y, z], [x, y, z - 1], [x, y, z + 1]];
  }
  const blocks = Object.freeze([
    { id: 1, name: "草ブロック", color: [0.39, 0.65, 0.27] },
    { id: 2, name: "土ブロック", color: [0.52, 0.32, 0.18] },
    { id: 3, name: "石ブロック", color: [0.49, 0.53, 0.53] },
    { id: 4, name: "木材ブロック", color: [0.65, 0.43, 0.23], orientationMode: "axis" },
    { id: 5, name: "葉っぱブロック", color: [0.25, 0.53, 0.29] },
    { id: 6, name: "板材ブロック", color: [0.73, 0.53, 0.31] },
    { id: 7, name: "レンガブロック", color: [0.68, 0.32, 0.25] },
    { id: 8, name: "白い壁ブロック", color: [0.9, 0.88, 0.82] },
    { id: 9, name: "窓ブロック", color: [0.48, 0.73, 0.83], renderLayer: "translucent" },
    { id: 10, name: "赤い壁ブロック", color: [0.79, 0.25, 0.23] },
    { id: 11, name: "青い壁ブロック", color: [0.24, 0.44, 0.78] },
    { id: 12, name: "黄色い壁ブロック", color: [0.94, 0.76, 0.24] },
    { id: 13, name: "緑の壁ブロック", color: [0.29, 0.65, 0.42] },
    { id: 14, name: "紫の壁ブロック", color: [0.58, 0.36, 0.72] },
    { id: 15, name: "黒い壁ブロック", color: [0.22, 0.24, 0.27] },
    { id: 16, name: "板材ハーフブロック", color: [0.73, 0.53, 0.31],
      bounds: slabBounds, textureBlock: 6, orientationMode: "slab" },
    { id: 17, name: "板材の階段", color: [0.73, 0.53, 0.31],
      textureBlock: 6, orientationMode: "horizontal" },
  ].map((block) => Object.freeze({
    ...block, bounds: block.bounds ?? cubeBounds, renderLayer: block.renderLayer ?? "opaque",
    boxes: block.orientationMode === "horizontal" ? stairBoxes.get(0)
      : Object.freeze([block.bounds ?? cubeBounds]),
    color: Object.freeze(block.color),
  })));

  function getBlockBounds(block, orientation = 0) {
    if (block === 0) return null;
    if (!Number.isInteger(block) || !blocks[block - 1]) throw new RangeError("Unknown block identifier.");
    return block === 16 && orientation === UPPER_SLAB_ORIENTATION ? upperSlabBounds : blocks[block - 1].bounds;
  }

  function isBlockOrientation(block, orientation) {
    return Number.isInteger(orientation) && orientation >= 0 && orientation < ORIENTATION_COUNT
      && (blocks[block - 1]?.orientationMode !== "horizontal" || stairOrientations.includes(orientation))
      && (blocks[block - 1]?.orientationMode !== "slab" || orientation === 0 || orientation === UPPER_SLAB_ORIENTATION)
      && ((block !== 0 && blocks[block - 1]?.orientationMode !== "fixed") || orientation === 0);
  }

  function getBlockBoxes(block, orientation = 0, shape = "straight") {
    if (block === 0) return emptyBoxes;
    getBlockBounds(block);
    if (!isBlockOrientation(block, orientation)) throw new RangeError("Invalid block orientation.");
    if (block === 16 && orientation === UPPER_SLAB_ORIENTATION) return upperSlabBoxes;
    if (block === 17) {
      const boxes = shapedStairBoxes.get(`${orientation}:${shape}`);
      if (!boxes) throw new RangeError("Invalid stair shape.");
      return boxes;
    }
    return blocks[block - 1].boxes;
  }

  function getStairOutline(orientation, shape = "straight") {
    const outline = shapedStairOutlines.get(`${orientation}:${shape}`);
    if (!outline) throw new RangeError("Invalid stair orientation or shape.");
    return outline;
  }

  function orientationFromFacing(direction, upsideDown = false) {
    if (!Array.isArray(direction) || direction.length !== 3 || !direction.every(Number.isFinite)
      || Math.hypot(direction[0], direction[2]) === 0) return null;
    const candidates = upsideDown
      ? stairOrientations.filter((orientation) => orientations[orientation].y[1] === -1) : uprightOrientations;
    return candidates.reduce((best, orientation) =>
      dot(orientations[orientation].z, direction) > dot(orientations[best].z, direction) ? orientation : best);
  }

  function slabOrientationForPlacement(normal, hitY) {
    return normal[1] < 0 || (normal[1] === 0 && hitY >= 0.5) ? UPPER_SLAB_ORIENTATION : 0;
  }

  function canMergeSlab(existingBlock, existingOrientation, addedOrientation) {
    return existingBlock === 16 && isBlockOrientation(16, existingOrientation)
      && isBlockOrientation(16, addedOrientation) && existingOrientation !== addedOrientation;
  }

  function blockIntersectsBox(block, x, y, z, min, max, orientation = 0, shape = "straight") {
    return getBlockBoxes(block, orientation, shape).some((bounds) =>
      x + bounds.min[0] < max[0] && x + bounds.max[0] > min[0]
      && y + bounds.min[1] < max[1] && y + bounds.max[1] > min[1]
      && z + bounds.min[2] < max[2] && z + bounds.max[2] > min[2]);
  }

  function intersectBlockRay(block, cell, origin, direction, reach, orientation = 0, shape = "straight") {
    let nearest = null;
    for (const bounds of getBlockBoxes(block, orientation, shape)) {
      const hit = intersectBoxRay(bounds, cell, origin, direction, reach);
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
    }
    return nearest;
  }

  function intersectBoxRay(bounds, cell, origin, direction, reach) {
    let near = 0;
    let far = reach;
    let normal = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const min = cell[axis] + bounds.min[axis];
      const max = cell[axis] + bounds.max[axis];
      if (direction[axis] === 0) {
        if (origin[axis] < min || origin[axis] > max) return null;
        continue;
      }
      const first = (min - origin[axis]) / direction[axis];
      const second = (max - origin[axis]) / direction[axis];
      const entry = Math.min(first, second);
      if (entry > near) {
        near = entry;
        normal = [0, 0, 0];
        normal[axis] = -Math.sign(direction[axis]);
      }
      far = Math.min(far, Math.max(first, second));
      if (near > far) return null;
    }
    return { distance: near, normal };
  }

  function isSupportedDimensions(value) {
    return value !== null && typeof value === "object" && value.height === 20
      && ((value.width === 40 && value.depth === 40) || (value.width === 64 && value.depth === 64));
  }

  function createModel({ width, depth, height, blockCount = blocks.length, seed = DEFAULT_SEED, terrain = "legacy" }) {
    if (![width, depth, height, blockCount].every(Number.isSafeInteger)
      || width < 1 || depth < 1 || height < 1 || blockCount < 1 || blockCount > 255) {
      throw new TypeError("World dimensions must be positive integers and block count must be between 1 and 255.");
    }
    if (!["legacy", "forest-plains"].includes(terrain)) throw new TypeError("Unknown terrain generator.");

    let data = new Uint8Array(width * depth * height);
    let orientationData = new Uint8Array(width * depth * height);
    let worldSeed = seed >>> 0;
    let terrainType = terrain;
    const plainsWidth = Math.floor(width * 0.6);

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

    function setBlock(x, y, z, block, orientation = 0) {
      if (!inBounds(x, y, z) || !Number.isInteger(block) || block < 0 || block > blockCount
        || !isBlockOrientation(block, orientation)) {
        return false;
      }
      const index = indexOf(x, y, z);
      data[index] = block;
      orientationData[index] = block === 0 ? 0 : orientation;
      return true;
    }

    function getOrientation(x, y, z) {
      return inBounds(x, y, z) ? orientationData[indexOf(x, y, z)] : 0;
    }

    function cellState(x, y, z, edit) {
      return edit && edit.x === x && edit.y === y && edit.z === z
        ? edit : { block: getBlock(x, y, z), orientation: getOrientation(x, y, z) };
    }

    function getStairShape(x, y, z, edit) {
      const cell = cellState(x, y, z, edit);
      if (cell.block !== 17) return "straight";
      const axes = orientations[cell.orientation];
      const neighborAt = (direction, sign = 1) =>
        cellState(x + direction[0] * sign, y, z + direction[2] * sign, edit);
      const sameLayer = (neighbor) => neighbor.block === 17
        && orientations[neighbor.orientation].y[1] === axes.y[1];
      const sameFacing = (neighbor) => sameLayer(neighbor)
        && dot(orientations[neighbor.orientation].z, axes.z) === 1;
      // The side continuation keeps a straight run from being cut by a crossing stair.
      for (const [sign, type] of [[1, "outer"], [-1, "inner"]]) {
        const neighbor = neighborAt(axes.z, sign);
        if (!sameLayer(neighbor)) continue;
        const facing = orientations[neighbor.orientation].z;
        if (dot(facing, axes.z) !== 0 || sameFacing(neighborAt(facing, -sign))) continue;
        return `${type}-${dot(facing, axes.x) < 0 ? "left" : "right"}`;
      }
      return "straight";
    }

    function getBoxes(x, y, z, edit) {
      const cell = cellState(x, y, z, edit);
      return getBlockBoxes(cell.block, cell.orientation,
        cell.block === 17 ? getStairShape(x, y, z, edit) : "straight");
    }

    function intersectsBox(x, y, z, min, max) {
      return blockIntersectsBox(getBlock(x, y, z), x, y, z, min, max,
        getOrientation(x, y, z), getStairShape(x, y, z));
    }

    function raycastBlock(x, y, z, origin, direction, reach) {
      return intersectBlockRay(getBlock(x, y, z), [x, y, z], origin, direction, reach,
        getOrientation(x, y, z), getStairShape(x, y, z));
    }

    function editIntersectsBox(edit, min, max) {
      for (const [x, y, z] of shapeAffectedCells(edit.x, edit.y, edit.z)) {
        if (!inBounds(x, y, z)) continue;
        const before = getBoxes(x, y, z);
        const after = getBoxes(x, y, z, edit);
        // All supported solids align to the half-cell grid; test only newly filled octants.
        for (let dx = 0; dx < 2; dx += 1) for (let dy = 0; dy < 2; dy += 1) {
          for (let dz = 0; dz < 2; dz += 1) {
            const point = [dx, dy, dz].map((value) => value / 2 + 0.25);
            if (!containsPoint(after, point) || containsPoint(before, point)) continue;
            if ([x, y, z].every((value, axis) =>
              value + point[axis] - 0.25 < max[axis] && value + point[axis] + 0.25 > min[axis])) return true;
          }
        }
      }
      return false;
    }

    function orientationFromNormal(normal) {
      if (!Array.isArray(normal) || normal.length !== 3 || !normal.every(Number.isInteger)) return null;
      return orientationIndexByYAxis.get(normal.join(",")) ?? null;
    }

    function getOrientationAxes(orientation) {
      if (!Number.isInteger(orientation) || orientation < 0 || orientation >= ORIENTATION_COUNT) return null;
      const axes = orientations[orientation];
      return { x: axes.x.slice(), y: axes.y.slice(), z: axes.z.slice() };
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
      orientationData = new Uint8Array(width * depth * height);
      const heights = Array.from({ length: depth }, () => Array(width).fill(0));
      for (let z = 0; z < depth; z += 1) {
        for (let x = 0; x < width; x += 1) {
          const transition = Math.max(0, Math.min(1, (x - plainsWidth) / 6));
          const blend = transition * transition * (3 - 2 * transition);
          const surface = terrainType === "legacy" ? terrainHeight(x, z)
            : x < plainsWidth ? 5 : Math.round(5 + (terrainHeight(x, z) - 5) * blend);
          heights[z][x] = surface;
          for (let y = 0; y <= surface && y < height; y += 1) {
            setBlock(x, y, z, y === surface ? 1 : y >= surface - 3 ? 2 : 3);
          }
        }
      }

      const random = randomGenerator(worldSeed);
      for (let z = 3; z < depth - 3; z += 1) {
        for (let x = 3; x < width - 3; x += 1) {
          if (terrainType === "forest-plains" && x < plainsWidth + 2) continue;
          if (random() > (terrainType === "legacy" ? 0.04 : 0.08)) continue;
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
        const tops = getBoxes(cellX, y, cellZ)
          .filter((box) => x - cellX >= box.min[0] && x - cellX < box.max[0]
            && z - cellZ >= box.min[2] && z - cellZ < box.max[2])
          .map((box) => y + box.max[1]);
        if (tops.length) return Math.max(...tops);
      }
      return 1;
    }

    function load(snapshot) {
      const isLegacy = Array.isArray(snapshot);
      const blocks = isLegacy ? snapshot : snapshot?.blocks;
      const nextTerrain = isLegacy ? "legacy" : snapshot?.terrain ?? "legacy";
      const version = isLegacy ? null : snapshot?.version;
      if (!isLegacy && (!snapshot || snapshot.version !== FORMAT_VERSION
        && snapshot.version !== PREVIOUS_FORMAT_VERSION
        || snapshot.width !== width || snapshot.depth !== depth || snapshot.height !== height)) {
        return false;
      }
      if (!["legacy", "forest-plains"].includes(nextTerrain)) return false;
      if (!Array.isArray(blocks) || blocks.length !== data.length
        || !blocks.every((block) => Number.isInteger(block) && block >= 0 && block <= blockCount)) {
        return false;
      }
      const nextOrientations = isLegacy || version === PREVIOUS_FORMAT_VERSION
        ? Array(data.length).fill(0)
        : snapshot.orientations;
      if (!Array.isArray(nextOrientations) || nextOrientations.length !== data.length
        || !nextOrientations.every((orientation, index) => isBlockOrientation(blocks[index], orientation))) {
        return false;
      }
      const nextData = Uint8Array.from(blocks);
      const nextOrientationData = Uint8Array.from(nextOrientations);
      data = nextData;
      orientationData = nextOrientationData;
      terrainType = nextTerrain;
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
        ...(terrainType === "legacy" ? {} : { terrain: terrainType }),
        blocks: Array.from(data),
        orientations: Array.from(orientationData),
      };
    }

    reset(worldSeed);
    return Object.freeze({
      dimensions: Object.freeze({ width, depth, height }),
      get terrain() { return terrainType; },
      get spawnCenter() {
        return { x: terrainType === "forest-plains" ? Math.floor(plainsWidth / 2) + 0.5 : width / 2 + 0.5,
          z: depth / 2 + 0.5 };
      },
      formatVersion: FORMAT_VERSION,
      getBlock,
      setBlock,
      getOrientation,
      getStairShape,
      getBoxes,
      intersectsBox,
      raycastBlock,
      editIntersectsBox,
      orientationFromNormal,
      getOrientationAxes,
      inBounds,
      findSurface,
      reset,
      load,
      serialize,
    });
  }

  root.MoneycraftWorld = Object.freeze({
    createModel, blocks, defaultOptions: DEFAULT_OPTIONS, legacyOptions: LEGACY_OPTIONS,
    isSupportedDimensions, formatVersion: FORMAT_VERSION, orientationCount: ORIENTATION_COUNT,
    getBlockBounds, getBlockBoxes, getStairOutline, orientationFromFacing, uprightOrientations, stairOrientations,
    stairShapes, shapeAffectedCells,
    upperSlabOrientation: UPPER_SLAB_ORIENTATION, slabOrientationForPlacement, canMergeSlab,
    isBlockOrientation, blockIntersectsBox, intersectBlockRay,
  });
})(globalThis);
