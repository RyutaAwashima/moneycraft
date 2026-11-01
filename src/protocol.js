import "../world-model.js";

export const PROTOCOL_VERSION = 3;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const MAX_PLAYERS_PER_ROOM = 8;
export const WORLD_DIMENSIONS = globalThis.MoneycraftWorld.defaultOptions;
export const MAX_CLIENT_MESSAGE_BYTES = 2048;
export const MAX_PLAYER_STATE_MESSAGES_PER_SECOND = 20;
export const MAX_BLOCK_EDIT_MESSAGES_PER_SECOND = 10;
export const MAX_BLOCK_ID = globalThis.MoneycraftWorld.blocks.length;
export const BLOCK_REACH = 6;

export function isBlockEditPayload(payload, dimensions = WORLD_DIMENSIONS) {
  return payload !== null && typeof payload === "object"
    && typeof payload.requestId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(payload.requestId)
    && Number.isInteger(payload.x) && payload.x >= 0 && payload.x < dimensions.width
    && Number.isInteger(payload.y) && payload.y >= 0 && payload.y < dimensions.height
    && Number.isInteger(payload.z) && payload.z >= 0 && payload.z < dimensions.depth
    && Number.isInteger(payload.block) && payload.block >= 0 && payload.block <= MAX_BLOCK_ID
    && Number.isInteger(payload.expectedBlock) && payload.expectedBlock >= 0 && payload.expectedBlock <= MAX_BLOCK_ID
    && ((payload.block === 0 && payload.expectedBlock > 0)
      || (payload.block > 0 && payload.expectedBlock === 0));
}

export function isPlayerStatePayload(payload, dimensions = WORLD_DIMENSIONS) {
  return payload !== null
    && typeof payload === "object"
    && Number.isFinite(payload.x)
    && payload.x >= 0
    && payload.x <= dimensions.width
    && Number.isFinite(payload.y)
    && payload.y >= 0
    && payload.y <= dimensions.height + 10
    && Number.isFinite(payload.z)
    && payload.z >= 0
    && payload.z <= dimensions.depth
    && Number.isFinite(payload.yaw)
    && Math.abs(payload.yaw) <= 1000000
    && Number.isFinite(payload.pitch)
    && payload.pitch >= -1.5
    && payload.pitch <= 1.5;
}
