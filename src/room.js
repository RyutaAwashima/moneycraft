import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_PLAYERS_PER_ROOM,
  MAX_PLAYER_STATE_MESSAGES_PER_SECOND,
  PROTOCOL_VERSION,
  WORLD_DIMENSIONS,
  isPlayerStatePayload,
} from "./protocol.js";

const OWNER_TOKEN_HEADER = "x-room-owner-token";
const DISPLAY_NAME_PREFIXES = [
  "こもれび",
  "ひだまり",
  "わかば",
  "あおぞら",
  "そよかぜ",
  "つきあかり",
  "みずたま",
  "はるいろ",
];
const DISPLAY_NAME_SUFFIXES = [
  "キツネ",
  "フクロウ",
  "リス",
  "ウサギ",
  "タヌキ",
  "コマドリ",
  "ハリネズミ",
  "シカ",
];

function jsonResponse(body, status = 200) {
  return Response.json(body, { status });
}

function newOpaqueId(byteLength = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function digestToken(token) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class Room {
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
      worldSeed: worldSeed >>> 0,
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
      messageCount: 0,
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
          seed: room.worldSeed,
        },
        maxPlayers: MAX_PLAYERS_PER_ROOM,
      },
    });
    this.broadcast({
      v: PROTOCOL_VERSION,
      type: "player-joined",
      payload: { id: player.id, displayName: player.displayName },
    }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  createDisplayName(sockets) {
    const usedNames = new Set(this.listPlayers(sockets).map((player) => player.displayName));
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(3));
      const prefix = DISPLAY_NAME_PREFIXES[bytes[0] % DISPLAY_NAME_PREFIXES.length];
      const suffix = DISPLAY_NAME_SUFFIXES[bytes[1] % DISPLAY_NAME_SUFFIXES.length];
      const number = ((bytes[1] << 8) | bytes[2]) % 1000;
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
        state: player.state,
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

    if (!packet || packet.v !== PROTOCOL_VERSION || packet.type !== "player-state"
      || !isPlayerStatePayload(packet.payload)) {
      this.send(socket, {
        v: PROTOCOL_VERSION,
        type: "error",
        payload: { code: "invalid_message" },
      });
      return;
    }

    const player = socket.deserializeAttachment();
    const now = Date.now();
    if (now - player.messageWindowStart >= 1000) {
      player.messageWindowStart = now;
      player.messageCount = 0;
    }
    player.messageCount += 1;
    if (player.messageCount > MAX_PLAYER_STATE_MESSAGES_PER_SECOND) {
      this.send(socket, {
        v: PROTOCOL_VERSION,
        type: "error",
        payload: { code: "rate_limited" },
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
        state: player.state,
      },
    }, socket);
  }

  webSocketClose(socket) {
    const player = socket.deserializeAttachment();
    if (!player) return;
    this.broadcast({
      v: PROTOCOL_VERSION,
      type: "player-left",
      payload: { id: player.id },
    });
  }

  webSocketError(socket) {
    this.webSocketClose(socket);
  }
}
