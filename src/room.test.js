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
      async delete(key) { return data.delete(key); },
      async deleteAll() { data.clear(); },
      async transaction(callback) {
        const before = structuredClone(data);
        try {
          return await callback(this);
        } catch (error) {
          data.clear();
          for (const [key, value] of before) data.set(key, value);
          throw error;
        }
      },
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
  const persisted = await room.getWorldSnapshot(123);
  const metadata = await ctx.storage.get("world");
  assert.equal(metadata.partCount, 10);
  for (let i = 0; i < metadata.partCount; i += 1) {
    const part = await ctx.storage.get(`world-part-${i}`);
    assert.ok(part.byteLength <= 8192);
    assert.ok(new TextEncoder().encode(JSON.stringify(Array.from(part))).byteLength < 128 * 1024);
  }
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

test("work metadata is owner-only and class end preserves the room and world", async () => {
  const { ctx, room } = await setupRoom();
  const socket = addPlayer(ctx);
  const request = (path, method, token, body) => room.fetch(new Request(`https://room.internal${path}`, {
    method,
    headers: {
      "X-Room-Owner-Token": token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));

  assert.equal((await request("/internal/work", "GET", "wrong")).status, 403);
  assert.equal((await request("/internal/work", "PATCH", "a".repeat(32), { workName: "  " })).status, 400);
  const renamed = await request("/internal/work", "PATCH", "a".repeat(32), { workName: "命山のある町" });
  assert.equal(renamed.status, 200);
  assert.equal((await ctx.storage.get("room")).workName, "命山のある町");
  assert.equal(socket.messages.at(-1).type, "work-renamed");

  const ended = await request("/internal/end-class", "POST", "a".repeat(32));
  assert.equal(ended.status, 200);
  assert.equal(socket.closeCode, 4003);
  assert.ok(await ctx.storage.get("room"));
  assert.ok(await ctx.storage.get("world"));
  assert.equal((await request("/internal/work", "GET", "a".repeat(32))).status, 200);
});

test("named backups retain the latest ten and restore protects the replaced live world", async () => {
  const { ctx, room } = await setupRoom();
  const ownerHeaders = {
    "Content-Type": "application/json",
    "X-Room-Owner-Token": "a".repeat(32),
  };
  const createBackup = (name) => room.fetch(new Request("https://room.internal/internal/backups", {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ name }),
  }));

  const first = await (await createBackup("checkpoint-0")).json();
  for (let index = 1; index < 10; index += 1) {
    const result = await createBackup(`checkpoint-${index}`);
    assert.equal(result.status, 201);
  }
  assert.equal((await ctx.storage.get("backups")).length, 10);
  const eleventhResponse = await createBackup("checkpoint-10");
  assert.equal(eleventhResponse.status, 201);
  const eleventh = await eleventhResponse.json();
  assert.equal(eleventh.removedBackup.name, "checkpoint-0");
  assert.equal((await ctx.storage.get("backups")).length, 10);
  assert.equal(await ctx.storage.get(`backup-${first.backup.id}-part-0`), undefined);

  const baseBackup = (await ctx.storage.get("backups")).find(({ name }) => name === "checkpoint-1");
  const model = globalThis.MoneycraftWorld.createModel(WORLD_DIMENSIONS);
  const live = await room.getWorldSnapshot(123);
  assert.equal(model.load(live.world), true);
  assert.equal(model.setBlock(12, 16, 10, 7), true);
  await room.saveWorldSnapshot({ world: model.serialize(), revision: live.revision + 1 });
  const currentBeforeRestore = await room.getWorldSnapshot(123);
  const socket = addPlayer(ctx);

  const restoredResponse = await room.fetch(new Request("https://room.internal/internal/backups/restore", {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ backupId: baseBackup.id }),
  }));
  assert.equal(restoredResponse.status, 200);
  const restoredResult = await restoredResponse.json();
  const restored = await room.getWorldSnapshot(123);
  assert.equal(restored.revision, currentBeforeRestore.revision + 1);
  assert.equal(restored.world.blocks[(16 * WORLD_DIMENSIONS.depth + 10) * WORLD_DIMENSIONS.width + 12], 0);
  assert.equal(socket.messages.some(({ type }) => type === "work-restore-start"), true);
  assert.equal(socket.messages.some(({ type }) => type === "world-snapshot"), true);
  assert.equal(socket.messages.at(-1).type, "work-restored");
  const automatic = (await ctx.storage.get("backups")).find(({ id }) =>
    restoredResult.backups.some((listed) => listed.id === id && listed.name === "復元前の自動保存"));
  assert.ok(automatic);
  const protectedLive = await room.readBackupSnapshot(automatic);
  assert.equal(protectedLive.world.blocks[(16 * WORLD_DIMENSIONS.depth + 10) * WORLD_DIMENSIONS.width + 12], 7);
});

test("failed backup restore leaves the live world and backup list unchanged", async () => {
  const { ctx, room } = await setupRoom();
  const headers = {
    "Content-Type": "application/json",
    "X-Room-Owner-Token": "a".repeat(32),
  };
  const backupResponse = await room.fetch(new Request("https://room.internal/internal/backups", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "保存済み" }),
  }));
  const { backup } = await backupResponse.json();
  const before = await room.getWorldSnapshot(123);
  const socket = addPlayer(ctx);
  const put = ctx.storage.put.bind(ctx.storage);
  ctx.storage.put = async (key, value) => {
    if (key === "world") throw new Error("storage unavailable");
    return put(key, value);
  };

  const result = await room.fetch(new Request("https://room.internal/internal/backups/restore", {
    method: "POST",
    headers,
    body: JSON.stringify({ backupId: backup.id }),
  }));
  assert.equal(result.status, 503);
  assert.deepEqual(await room.getWorldSnapshot(123), before);
  assert.deepEqual((await ctx.storage.get("backups")).map(({ id }) => id), [backup.id]);
  assert.equal(socket.messages.at(-1).type, "work-restore-cancelled");
});

test("teacher email verification and recovery rotate owner credentials exactly once", async () => {
  const { ctx, room } = await setupRoom();
  const ownerHeaders = {
    "Content-Type": "application/json",
    "X-Room-Owner-Token": "a".repeat(32),
  };
  const request = (path, body, headers = {}) => room.fetch(new Request(`https://room.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }));

  assert.equal((await request("/internal/teacher-email/request", { email: "Not an email" }, ownerHeaders)).status, 400);
  assert.equal((await request("/internal/teacher-email/request", { email: "teacher@example.jp" }, {
    ...ownerHeaders, "X-Room-Owner-Token": "b".repeat(32),
  })).status, 403);

  const emailResponse = await request("/internal/teacher-email/request", { email: " Teacher@Example.JP " }, ownerHeaders);
  assert.equal(emailResponse.status, 200);
  const emailChallenge = await emailResponse.json();
  assert.equal(emailChallenge.email, "teacher@example.jp");
  assert.equal((await ctx.storage.get("room")).pendingTeacherEmail.tokenHash.includes(emailChallenge.token), false);
  assert.equal((await request("/internal/teacher-email/request", { email: "teacher@example.jp" }, ownerHeaders)).status, 429);

  assert.equal((await request("/internal/teacher-email/verify", { token: "wrong-token" })).status, 400);
  assert.equal((await request("/internal/teacher-email/verify", { token: emailChallenge.token })).status, 200);
  assert.equal((await ctx.storage.get("room")).teacherEmail, "teacher@example.jp");

  const recoveryResponse = await request("/internal/recovery/request", {});
  const recovery = await recoveryResponse.json();
  assert.equal(recovery.deliver, true);
  assert.equal(recovery.email, "teacher@example.jp");
  const consumeResponse = await request("/internal/recovery/consume", { token: recovery.token });
  assert.equal(consumeResponse.status, 200);
  const { ownerToken } = await consumeResponse.json();
  assert.equal(typeof ownerToken, "string");
  assert.equal((await request("/internal/recovery/consume", { token: recovery.token })).status, 400);

  const oldOwner = await room.fetch(new Request("https://room.internal/internal/close", {
    method: "POST",
    headers: { "X-Room-Owner-Token": "a".repeat(32) },
  }));
  assert.equal(oldOwner.status, 403);
  const newOwner = await room.fetch(new Request("https://room.internal/internal/close", {
    method: "POST",
    headers: { "X-Room-Owner-Token": ownerToken },
  }));
  assert.equal(newOwner.status, 200);
});

test("rooms without a verified email return the same recovery response without delivery", async () => {
  const { room } = await setupRoom();
  const response = await room.fetch(new Request("https://room.internal/internal/recovery/request", {
    method: "POST",
  }));
  assert.deepEqual(await response.json(), { ok: true, deliver: false });
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
    assert.deepEqual(welcome.world, (await room.getWorldSnapshot(123)).world);
    assert.equal(welcome.roomCode, "ABCD23");
    while (ctx.sockets.length < 16) {
      const response = await room.fetch(new Request("https://room.internal/connect?code=ABCD23", {
        headers: { Upgrade: "websocket" },
      }));
      assert.equal(response.status, 101);
      assert.equal(ctx.sockets.at(-1).messages[0].payload.maxPlayers, 16);
    }
    const full = await room.fetch(new Request("https://room.internal/connect?code=ABCD23", {
      headers: { Upgrade: "websocket" },
    }));
    assert.equal(full.status, 409);
    assert.equal((await full.json()).error, "room_full");
    for (const player of ctx.sockets) player.messages.length = 0;
    for (let tick = 0; tick < 10; tick += 1) {
      for (const player of ctx.sockets) {
        await send(room, player, "player-state", socket.deserializeAttachment().state);
      }
    }
    for (const player of ctx.sockets) {
      assert.equal(player.messages.length, 150);
      assert.ok(player.messages.every((message) => message.type === "player-state"));
    }
    for (const player of ctx.sockets) player.messages.length = 0;
    await send(room, socket, "block-edit", { ...placement, requestId: "capacity-mine", block: 0, expectedBlock: 7 });
    for (const player of ctx.sockets) {
      assert.equal(player.messages.at(-1).type, "block-changed");
      assert.equal(player.messages.at(-1).payload.revision, 2);
    }
    ctx.sockets.at(-1).close(1000);
    const replacement = await room.fetch(new Request("https://room.internal/connect?code=ABCD23", {
      headers: { Upgrade: "websocket" },
    }));
    assert.equal(replacement.status, 101);
    assert.equal(ctx.getWebSockets().length, 16);
    const legacy = createContext();
    await legacy.storage.put("room", { worldSeed: 123 });
    const migrated = await new Room(legacy).getWorldSnapshot(123);
    const initial = globalThis.MoneycraftWorld.createModel({ ...globalThis.MoneycraftWorld.legacyOptions, seed: 123 });
    assert.deepEqual(migrated.world, initial.serialize());
  } finally {
    globalThis.Response = OriginalResponse;
    delete globalThis.WebSocketPair;
  }
});

test("legacy saved rooms preserve dimensions and buildings through transactional storage migration", async () => {
  const ctx = createContext();
  const room = new Room(ctx);
  const oldModel = globalThis.MoneycraftWorld.createModel({ ...globalThis.MoneycraftWorld.legacyOptions, seed: 123 });
  oldModel.setBlock(12, 16, 10, 9);
  const oldSnapshot = { world: oldModel.serialize(), revision: 27 };
  await ctx.storage.put("room", { worldSeed: 123 });
  await ctx.storage.put("world", oldSnapshot);
  assert.deepEqual(await room.getWorldSnapshot(123), oldSnapshot);
  const socket = addPlayer(ctx);
  await send(room, socket, "player-state", { x: 50, y: 16, z: 10, yaw: 0, pitch: 0 });
  assert.equal(socket.messages.at(-1).payload.code, "invalid_message");
  await send(room, socket, "block-edit", { ...placement, x: 40 });
  assert.equal(socket.messages.at(-1).payload.code, "invalid_message");
  await send(room, socket, "block-edit", { ...placement, block: 0, expectedBlock: 9 });
  assert.equal(socket.messages.at(-1).type, "block-changed");
  const restored = await new Room(ctx).getWorldSnapshot(123);
  assert.equal(restored.world.width, 40);
  assert.equal(restored.world.depth, 40);
  oldModel.setBlock(12, 16, 10, 0);
  assert.deepEqual(restored.world, oldModel.serialize());
  assert.equal(restored.revision, 28);
  assert.equal((await ctx.storage.get("world")).storageVersion, 1);
});

test("large-room edge edits persist only the changed part and metadata", async () => {
  const { ctx, room } = await setupRoom();
  const socket = addPlayer(ctx, "edge-player", { x: 60.5, y: 16, z: 60.5, yaw: 0, pitch: 0 });
  const put = ctx.storage.put.bind(ctx.storage);
  const writes = [];
  ctx.storage.put = async (key, value) => { writes.push(key); await put(key, value); };
  const edit = { ...placement, x: 63, z: 63, block: 8 };
  await send(room, socket, "block-edit", edit);
  assert.equal(socket.messages.at(-1).type, "block-changed");
  assert.deepEqual(writes, ["world-part-8", "world"]);
  const restored = await new Room(ctx).getWorldSnapshot(123);
  assert.equal(restored.world.blocks[(16 * 64 + 63) * 64 + 63], 8);
  assert.equal(restored.world.terrain, "forest-plains");
});

test("part and revision writes roll back together on storage failure", async () => {
  const { ctx, room } = await setupRoom();
  const before = await room.getWorldSnapshot(123);
  const socket = addPlayer(ctx);
  const put = ctx.storage.put.bind(ctx.storage);
  ctx.storage.put = async (key, value) => {
    if (key === "world") throw new Error("metadata write failed");
    await put(key, value);
  };
  await send(room, socket, "block-edit", placement);
  assert.equal(socket.closeCode, 1011);
  assert.deepEqual(await new Room(ctx).getWorldSnapshot(123), before);
});

test("missing world parts fail explicitly rather than regenerating buildings", async () => {
  const { ctx, room } = await setupRoom();
  await ctx.storage.put("world-part-0", null);
  await assert.rejects(room.getWorldSnapshot(123), /missing or invalid/);
  await ctx.storage.put("world", null);
  await assert.rejects(room.getWorldSnapshot(123), /metadata is missing/);
});
