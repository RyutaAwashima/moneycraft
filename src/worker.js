import { ROOM_CODE_PATTERN, PROTOCOL_VERSION } from "./protocol.js";
import { Room } from "./room.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers });
}

function allowedOrigins(env) {
  return new Set((env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Room-Owner-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins(env).has(origin);
}

function generateRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte & 31]).join("");
}

function generateOwnerToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function newWorldSeed() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return bytes[0];
}

async function createRoom(env) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomCode = generateRoomCode();
    const ownerToken = generateOwnerToken();
    const id = env.ROOMS.idFromName(roomCode);
    const stub = env.ROOMS.get(id);
    const result = await stub.fetch("https://room.internal/internal/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerToken, worldSeed: newWorldSeed() }),
    });
    if (result.status === 201) {
      return jsonResponse({
        v: PROTOCOL_VERSION,
        roomCode,
        ownerToken,
      }, 201);
    }
    if (result.status !== 409) {
      return jsonResponse({ error: "room_creation_failed" }, 500);
    }
  }
  return jsonResponse({ error: "room_creation_failed" }, 503);
}

function getRoomStub(env, code) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

function routeRoomPath(pathname) {
  const match = pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(connect))?$/);
  if (!match || !ROOM_CODE_PATTERN.test(match[1])) return null;
  return { code: match[1], action: match[2] ?? "room" };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const headers = corsHeaders(request, env);
    if (!isAllowedOrigin(request, env)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({ ok: true, protocolVersion: PROTOCOL_VERSION }, 200, headers);
    }
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const response = await createRoom(env);
      return new Response(response.body, { status: response.status, headers: { ...headers, ...response.headers } });
    }

    const roomRoute = routeRoomPath(url.pathname);
    if (!roomRoute) return jsonResponse({ error: "not_found" }, 404, headers);
    const stub = getRoomStub(env, roomRoute.code);
    if (roomRoute.action === "connect" && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return jsonResponse({ error: "websocket_required" }, 426, headers);
      }
      if (!isAllowedOrigin(request, env)) {
        return jsonResponse({ error: "origin_not_allowed" }, 403, headers);
      }
      return stub.fetch(new Request(`https://room.internal/connect?code=${roomRoute.code}`, request));
    }
    if (roomRoute.action === "room" && request.method === "DELETE") {
      return stub.fetch(new Request("https://room.internal/internal/close", {
        method: "POST",
        headers: { "X-Room-Owner-Token": request.headers.get("X-Room-Owner-Token") || "" },
      })).then(async (response) => jsonResponse(await response.json(), response.status, headers));
    }
    return jsonResponse({ error: "method_not_allowed" }, 405, headers);
  },
};

export { Room };
