var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/protocol.js
var PROTOCOL_VERSION = 1;
var ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
var MAX_PLAYERS_PER_ROOM = 8;
var WORLD_DIMENSIONS = Object.freeze({ width: 40, depth: 40, height: 20 });
var MAX_CLIENT_MESSAGE_BYTES = 2048;
var MAX_PLAYER_STATE_MESSAGES_PER_SECOND = 20;
function isPlayerStatePayload(payload) {
  return payload !== null && typeof payload === "object" && Number.isFinite(payload.x) && payload.x >= 0 && payload.x <= WORLD_DIMENSIONS.width && Number.isFinite(payload.y) && payload.y >= 0 && payload.y <= WORLD_DIMENSIONS.height + 10 && Number.isFinite(payload.z) && payload.z >= 0 && payload.z <= WORLD_DIMENSIONS.depth && Number.isFinite(payload.yaw) && Math.abs(payload.yaw) <= 1e6 && Number.isFinite(payload.pitch) && payload.pitch >= -1.5 && payload.pitch <= 1.5;
}
__name(isPlayerStatePayload, "isPlayerStatePayload");

// src/room.js
var OWNER_TOKEN_HEADER = "x-room-owner-token";
var DISPLAY_NAME_PREFIXES = [
  "\u3053\u3082\u308C\u3073",
  "\u3072\u3060\u307E\u308A",
  "\u308F\u304B\u3070",
  "\u3042\u304A\u305E\u3089",
  "\u305D\u3088\u304B\u305C",
  "\u3064\u304D\u3042\u304B\u308A",
  "\u307F\u305A\u305F\u307E",
  "\u306F\u308B\u3044\u308D"
];
var DISPLAY_NAME_SUFFIXES = [
  "\u30AD\u30C4\u30CD",
  "\u30D5\u30AF\u30ED\u30A6",
  "\u30EA\u30B9",
  "\u30A6\u30B5\u30AE",
  "\u30BF\u30CC\u30AD",
  "\u30B3\u30DE\u30C9\u30EA",
  "\u30CF\u30EA\u30CD\u30BA\u30DF",
  "\u30B7\u30AB"
];
function jsonResponse(body, status = 200) {
  return Response.json(body, { status });
}
__name(jsonResponse, "jsonResponse");
function newOpaqueId(byteLength = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(newOpaqueId, "newOpaqueId");
function digestToken(token) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
}
__name(digestToken, "digestToken");
function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(toHex, "toHex");
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(ctx) {
    this.ctx = ctx;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/internal/create" && request.method === "POST") {
      return this.createRoom(request);
    }
    if (url.pathname === "/internal/close" && request.method === "POST") {
      return this.closeRoom(request);
    }
    if (url.pathname === "/connect" && request.method === "GET") {
      return this.connect(request);
    }
    return jsonResponse({ error: "not_found" }, 404);
  }
  async createRoom(request) {
    const existing = await this.ctx.storage.get("room");
    if (existing) return jsonResponse({ error: "room_code_unavailable" }, 409);
    const { ownerToken, worldSeed } = await request.json();
    if (typeof ownerToken !== "string" || ownerToken.length < 32 || !Number.isSafeInteger(worldSeed)) {
      return jsonResponse({ error: "invalid_room_setup" }, 400);
    }
    await this.ctx.storage.put("room", {
      createdAt: Date.now(),
      ownerTokenHash: toHex(await digestToken(ownerToken)),
      worldSeed: worldSeed >>> 0
    });
    return jsonResponse({ ok: true }, 201);
  }
  async closeRoom(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);
    const token = request.headers.get(OWNER_TOKEN_HEADER);
    if (!token || toHex(await digestToken(token)) !== room.ownerTokenHash) {
      return jsonResponse({ error: "forbidden" }, 403);
    }
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(4001, "Room closed by its owner");
    }
    await this.ctx.storage.deleteAll();
    return jsonResponse({ ok: true });
  }
  async connect(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonResponse({ error: "websocket_required" }, 426);
    }
    const currentSockets = this.ctx.getWebSockets();
    if (currentSockets.length >= MAX_PLAYERS_PER_ROOM) {
      return jsonResponse({ error: "room_full" }, 409);
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const player = {
      id: newOpaqueId(),
      displayName: this.createDisplayName(currentSockets),
      state: null,
      messageWindowStart: Date.now(),
      messageCount: 0
    };
    server.serializeAttachment(player);
    this.ctx.acceptWebSocket(server);
    this.send(server, {
      v: PROTOCOL_VERSION,
      type: "welcome",
      payload: {
        roomCode: new URL(request.url).searchParams.get("code"),
        player: { id: player.id, displayName: player.displayName },
        players: this.listPlayers(currentSockets),
        world: {
          version: 1,
          ...WORLD_DIMENSIONS,
          seed: room.worldSeed
        },
        maxPlayers: MAX_PLAYERS_PER_ROOM
      }
    });
    this.broadcast({
      v: PROTOCOL_VERSION,
      type: "player-joined",
      payload: { id: player.id, displayName: player.displayName }
    }, server);
    return new Response(null, { status: 101, webSocket: client });
  }
  createDisplayName(sockets) {
    const usedNames = new Set(this.listPlayers(sockets).map((player) => player.displayName));
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(3));
      const prefix = DISPLAY_NAME_PREFIXES[bytes[0] % DISPLAY_NAME_PREFIXES.length];
      const suffix = DISPLAY_NAME_SUFFIXES[bytes[1] % DISPLAY_NAME_SUFFIXES.length];
      const number = (bytes[1] << 8 | bytes[2]) % 1e3;
      const name = `${prefix}${suffix}-${number.toString().padStart(3, "0")}`;
      if (!usedNames.has(name)) return name;
    }
    throw new Error("Could not generate a unique anonymous display name.");
  }
  listPlayers(sockets = this.ctx.getWebSockets()) {
    return sockets.flatMap((socket) => {
      const player = socket.deserializeAttachment();
      if (!player) return [];
      return [{
        id: player.id,
        displayName: player.displayName,
        state: player.state
      }];
    });
  }
  send(socket, message) {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.warn("Could not send a room message to a client.", error);
      socket.close(1011, "Message delivery failed");
    }
  }
  broadcast(message, except = null) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except) this.send(socket, message);
    }
  }
  webSocketMessage(socket, message) {
    if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > MAX_CLIENT_MESSAGE_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }
    let packet;
    try {
      packet = JSON.parse(message);
    } catch {
      socket.close(1007, "Invalid JSON");
      return;
    }
    if (!packet || packet.v !== PROTOCOL_VERSION || packet.type !== "player-state" || !isPlayerStatePayload(packet.payload)) {
      this.send(socket, {
        v: PROTOCOL_VERSION,
        type: "error",
        payload: { code: "invalid_message" }
      });
      return;
    }
    const player = socket.deserializeAttachment();
    const now = Date.now();
    if (now - player.messageWindowStart >= 1e3) {
      player.messageWindowStart = now;
      player.messageCount = 0;
    }
    player.messageCount += 1;
    if (player.messageCount > MAX_PLAYER_STATE_MESSAGES_PER_SECOND) {
      this.send(socket, {
        v: PROTOCOL_VERSION,
        type: "error",
        payload: { code: "rate_limited" }
      });
      return;
    }
    player.state = packet.payload;
    socket.serializeAttachment(player);
    this.broadcast({
      v: PROTOCOL_VERSION,
      type: "player-state",
      payload: {
        playerId: player.id,
        displayName: player.displayName,
        state: player.state
      }
    }, socket);
  }
  webSocketClose(socket) {
    const player = socket.deserializeAttachment();
    if (!player) return;
    this.broadcast({
      v: PROTOCOL_VERSION,
      type: "player-left",
      payload: { id: player.id }
    });
  }
  webSocketError(socket) {
    this.webSocketClose(socket);
  }
};

// src/worker.js
var ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function jsonResponse2(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers });
}
__name(jsonResponse2, "jsonResponse");
function allowedOrigins(env) {
  return new Set((env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean));
}
__name(allowedOrigins, "allowedOrigins");
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Room-Owner-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins(env).has(origin);
}
__name(isAllowedOrigin, "isAllowedOrigin");
function generateRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte & 31]).join("");
}
__name(generateRoomCode, "generateRoomCode");
function generateOwnerToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
__name(generateOwnerToken, "generateOwnerToken");
function newWorldSeed() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return bytes[0];
}
__name(newWorldSeed, "newWorldSeed");
async function createRoom(env) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomCode = generateRoomCode();
    const ownerToken = generateOwnerToken();
    const id = env.ROOMS.idFromName(roomCode);
    const stub = env.ROOMS.get(id);
    const result = await stub.fetch("https://room.internal/internal/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerToken, worldSeed: newWorldSeed() })
    });
    if (result.status === 201) {
      return jsonResponse2({
        v: PROTOCOL_VERSION,
        roomCode,
        ownerToken
      }, 201);
    }
    if (result.status !== 409) {
      return jsonResponse2({ error: "room_creation_failed" }, 500);
    }
  }
  return jsonResponse2({ error: "room_creation_failed" }, 503);
}
__name(createRoom, "createRoom");
function getRoomStub(env, code) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}
__name(getRoomStub, "getRoomStub");
function routeRoomPath(pathname) {
  const match = pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(connect))?$/);
  if (!match || !ROOM_CODE_PATTERN.test(match[1])) return null;
  return { code: match[1], action: match[2] ?? "room" };
}
__name(routeRoomPath, "routeRoomPath");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return jsonResponse2({ error: "not_found" }, 404);
    }
    const headers = corsHeaders(request, env);
    if (!isAllowedOrigin(request, env)) {
      return jsonResponse2({ error: "origin_not_allowed" }, 403);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse2({ ok: true, protocolVersion: PROTOCOL_VERSION }, 200, headers);
    }
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const response = await createRoom(env);
      return new Response(response.body, { status: response.status, headers: { ...headers, ...response.headers } });
    }
    const roomRoute = routeRoomPath(url.pathname);
    if (!roomRoute) return jsonResponse2({ error: "not_found" }, 404, headers);
    const stub = getRoomStub(env, roomRoute.code);
    if (roomRoute.action === "connect" && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return jsonResponse2({ error: "websocket_required" }, 426, headers);
      }
      if (!isAllowedOrigin(request, env)) {
        return jsonResponse2({ error: "origin_not_allowed" }, 403, headers);
      }
      return stub.fetch(new Request(`https://room.internal/connect?code=${roomRoute.code}`, request));
    }
    if (roomRoute.action === "room" && request.method === "DELETE") {
      return stub.fetch(new Request("https://room.internal/internal/close", {
        method: "POST",
        headers: { "X-Room-Owner-Token": request.headers.get("X-Room-Owner-Token") || "" }
      })).then(async (response) => jsonResponse2(await response.json(), response.status, headers));
    }
    return jsonResponse2({ error: "method_not_allowed" }, 405, headers);
  }
};

// ../.local/node-v22.18.0-darwin-arm64/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../.local/node-v22.18.0-darwin-arm64/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-oPYbG4/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../.local/node-v22.18.0-darwin-arm64/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-oPYbG4/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Room,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
