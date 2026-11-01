import assert from "node:assert/strict";
import test from "node:test";
import { Room } from "./room.js";
import { PROTOCOL_VERSION, WORLD_DIMENSIONS } from "./protocol.js";

class Socket {
  readyState = 1;
  messages = [];
  attachment = null;
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(message) { this.messages.push(JSON.parse(message)); }
  close(code) { this.closeCode = code; this.readyState = 3; }
}

globalThis.WebSocket = Socket;
Socket.OPEN = 1;

function createContext() {
  const data = new Map();
  let queue = Promise.resolve();
  return {
    sockets: [],
    storage: {
      async get(key) { return structuredClone(data.get(key)); },
      async put(key, value) { data.set(key, structuredClone(value)); },
      async deleteAll() { data.clear(); },
    },
    getWebSockets() { return this.sockets.filter((socket) => socket.readyState === 1); },
    acceptWebSocket(socket) { this.sockets.push(socket); },
    blockConcurrencyWhile(callback) {
      const next = queue.then(callback);
      queue = next.catch(() => {});
      return next;
    },
  };
}

function addPlayer(ctx, id = "player-1", state = { x: 10.5, y: 16, z: 10.5, yaw: 0, pitch: 0 }) {
  const socket = new Socket();
  socket.serializeAttachment({
    id, displayName: id, state, messageWindowStart: Date.now(), messageCount: 0, editCount: 0,
  });
  ctx.acceptWebSocket(socket);
  return socket;
}

async function setupRoom() {
  const ctx = createContext();
  const room = new Room(ctx);
  const response = await room.fetch(new Request("https://room.internal/internal/create", {
    method: "POST",
    body: JSON.stringify({ ownerToken: "a".repeat(32), worldSeed: 123 }),
  }));
  assert.equal(response.status, 201);
  return { ctx, room };
}

function send(room, socket, type, payload) {
  return room.webSocketMessage(socket, JSON.stringify({ v: PROTOCOL_VERSION, type, payload }));
}

const placement = { requestId: "edit-1", x: 12, y: 16, z: 10, block: 7, expectedBlock: 0 };

test("room edits broadcast only after persistence and survive a new Room instance", async () => {
  const { ctx, room } = await setupRoom();
  const one = addPlayer(ctx);
  const two = addPlayer(ctx, "player-2");
  await send(room, one, "block-edit", placement);
  assert.equal(one.messages.at(-1).type, "block-changed");
  assert.deepEqual(one.messages.at(-1), two.messages.at(-1));
  const persisted = await ctx.storage.get("world");
  assert.ok(new TextEncoder().encode(JSON.stringify(persisted)).byteLength < 128 * 1024);
  assert.equal(persisted.revision, 1);
  const model = globalThis.MoneycraftWorld.createModel(WORLD_DIMENSIONS);
  assert.equal(model.load(persisted.world), true);
  assert.equal(model.getBlock(12, 16, 10), 7);
  const restarted = new Room(ctx);
  await send(restarted, two, "world-request", null);
  assert.deepEqual(two.messages.at(-1).payload, persisted);
  await send(restarted, two, "block-edit", { ...placement, requestId: "mine-1", block: 0, expectedBlock: 7 });
  assert.equal((await ctx.storage.get("world")).revision, 2);
});

test("simultaneous edits are serialized and only one empty-cell placement wins", async () => {
  const { ctx, room } = await setupRoom();
  const one = addPlayer(ctx);
  const two = addPlayer(ctx, "player-2");
  await Promise.all([
    send(room, one, "block-edit", placement),
    send(room, two, "block-edit", { ...placement, requestId: "edit-2", block: 9 }),
  ]);
  assert.equal((await ctx.storage.get("world")).revision, 1);
  assert.equal(two.messages.at(-1).type, "edit-rejected");
  assert.equal(two.messages.at(-1).payload.code, "edit_conflict");
});

test("invalid, distant and player-overlapping edits cannot mutate the world", async () => {
  const { ctx, room } = await setupRoom();
  const socket = addPlayer(ctx);
  await send(room, socket, "block-edit", { ...placement, block: 10 });
  assert.equal(socket.messages.at(-1).payload.code, "invalid_message");
  await send(room, socket, "block-edit", { ...placement, x: 30 });
  assert.equal(socket.messages.at(-1).payload.code, "out_of_reach");
  addPlayer(ctx, "player-2", { x: 12.5, y: 16, z: 10.5, yaw: 0, pitch: 0 });
  await send(room, socket, "block-edit", placement);
  assert.equal(socket.messages.at(-1).payload.code, "player_in_block");
  assert.equal((await ctx.storage.get("world")).revision, 0);
});

test("edit and snapshot rate limits are independent from position messages", async () => {
  const { ctx, room } = await setupRoom();
  const socket = addPlayer(ctx);
  for (let i = 0; i < 11; i += 1) await send(room, socket, "block-edit", { ...placement, requestId: `edit-${i}` });
  assert.equal(socket.messages.at(-1).payload.code, "rate_limited");
  await send(room, socket, "player-state", socket.deserializeAttachment().state);
  assert.equal(socket.deserializeAttachment().messageCount, 1);
  for (let i = 0; i < 3; i += 1) await send(room, socket, "world-request", null);
  assert.equal(socket.messages.at(-1).payload.code, "rate_limited");
});

test("a failed save never broadcasts a successful edit", async () => {
  const { ctx, room } = await setupRoom();
  const socket = addPlayer(ctx);
  ctx.storage.put = async () => { throw new Error("storage unavailable"); };
  await send(room, socket, "block-edit", placement);
  assert.equal(socket.closeCode, 1011);
  assert.equal(socket.messages.some((message) => message.type === "block-changed"), false);
  assert.equal((await ctx.storage.get("world")).revision, 0);
});

test("only the owner can close and delete the shared world", async () => {
  const { ctx, room } = await setupRoom();
  const socket = addPlayer(ctx);
  const close = (token) => room.fetch(new Request("https://room.internal/internal/close", {
    method: "POST", headers: { "x-room-owner-token": token },
  }));
  assert.equal((await close("wrong")).status, 403);
  assert.ok(await ctx.storage.get("world"));
  assert.equal((await close("a".repeat(32))).status, 200);
  assert.equal(socket.closeCode, 4001);
  assert.equal(await ctx.storage.get("world"), undefined);
  assert.equal((await room.fetch(new Request("https://room.internal/connect"))).status, 404);
});

test("welcome includes the latest full world, and old rooms initialize deterministically", async () => {
  const { ctx, room } = await setupRoom();
  const socket = addPlayer(ctx);
  await send(room, socket, "block-edit", placement);
  const OriginalResponse = globalThis.Response;
  globalThis.WebSocketPair = class {
    constructor() { this[0] = new Socket(); this[1] = new Socket(); }
  };
  globalThis.Response = class extends OriginalResponse {
    constructor(body, options) {
      if (options?.status === 101) return { status: 101, webSocket: options.webSocket };
      super(body, options);
    }
  };
  try {
    const connected = await room.fetch(new Request("https://room.internal/connect?code=ABCD23", {
      headers: { Upgrade: "websocket" },
    }));
    assert.equal(connected.status, 101);
    const welcome = ctx.sockets.at(-1).messages[0].payload;
    assert.equal(welcome.revision, 1);
    assert.deepEqual(welcome.world, (await ctx.storage.get("world")).world);
    assert.equal(welcome.roomCode, "ABCD23");
    while (ctx.sockets.length < 8) addPlayer(ctx, `player-${ctx.sockets.length}`);
    const full = await room.fetch(new Request("https://room.internal/connect?code=ABCD23", {
      headers: { Upgrade: "websocket" },
    }));
    assert.equal(full.status, 409);
    const legacy = createContext();
    await legacy.storage.put("room", { worldSeed: 123 });
    const migrated = await new Room(legacy).getWorldSnapshot(123);
    const initial = globalThis.MoneycraftWorld.createModel({ ...WORLD_DIMENSIONS, seed: 123 });
    assert.deepEqual(migrated.world, initial.serialize());
  } finally {
    globalThis.Response = OriginalResponse;
    delete globalThis.WebSocketPair;
  }
});
