export const PROTOCOL_VERSION = 1;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const MAX_PLAYERS_PER_ROOM = 8;
export const WORLD_DIMENSIONS = Object.freeze({ width: 40, depth: 40, height: 20 });
export const MAX_CLIENT_MESSAGE_BYTES = 2048;
export const MAX_PLAYER_STATE_MESSAGES_PER_SECOND = 20;

export function isPlayerStatePayload(payload) {
  return payload !== null
    && typeof payload === "object"
    && Number.isFinite(payload.x)
    && payload.x >= 0
    && payload.x <= WORLD_DIMENSIONS.width
    && Number.isFinite(payload.y)
    && payload.y >= 0
    && payload.y <= WORLD_DIMENSIONS.height + 10
    && Number.isFinite(payload.z)
    && payload.z >= 0
    && payload.z <= WORLD_DIMENSIONS.depth
    && Number.isFinite(payload.yaw)
    && Math.abs(payload.yaw) <= 1000000
    && Number.isFinite(payload.pitch)
    && payload.pitch >= -1.5
    && payload.pitch <= 1.5;
}
