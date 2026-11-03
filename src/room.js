import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_PLAYERS_PER_ROOM,
  MAX_PLAYER_STATE_MESSAGES_PER_SECOND,
  MAX_BLOCK_EDIT_MESSAGES_PER_SECOND,
  BLOCK_REACH,
  PROTOCOL_VERSION,
  WORLD_DIMENSIONS,
  isPlayerStatePayload,
  isBlockEditPayload,
} from "./protocol.js";

const OWNER_TOKEN_HEADER = "x-room-owner-token";
const WORLD_PART_SIZE = 8192;
const EMAIL_REQUEST_COOLDOWN_MS = 60_000;
const EMAIL_TOKEN_TTL_MS = 15 * 60_000;
const EMAIL_RATE_WINDOW_MS = 60 * 60_000;
const EMAIL_SOURCE_RATE_LIMIT = 10;
const EMAIL_RECIPIENT_RATE_LIMIT = 3;
const WORK_NAME_MAX_LENGTH = 80;
const BACKUP_MAX_COUNT = 10;
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

function newOpaqueToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function digestToken(token) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function matchesHash(value, expected) {
  if (typeof value !== "string" || typeof expected !== "string" || value.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < value.length; index += 1) {
    difference |= value.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254
    && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

export class Room {
  constructor(ctx) {
    this.ctx = ctx;
    this.operationQueue = Promise.resolve();
  }

  fetch(request) {
    return this.runExclusive(() => this.ctx.blockConcurrencyWhile(() => this.route(request)));
  }

  runExclusive(operation) {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.catch(() => {});
    return result;
  }

  async route(request) {
    const url = new URL(request.url);
    if (url.pathname === "/internal/create" && request.method === "POST") {
      return this.createRoom(request);
    }
    if (url.pathname === "/internal/close" && request.method === "POST") {
      return this.closeRoom(request);
    }
    if (url.pathname === "/internal/end-class" && request.method === "POST") {
      return this.endClass(request);
    }
    if (url.pathname === "/internal/work" && request.method === "GET") {
      return this.getWork(request);
    }
    if (url.pathname === "/internal/work" && request.method === "PATCH") {
      return this.renameWork(request);
    }
    if (url.pathname === "/internal/backups" && request.method === "GET") {
      return this.listBackups(request);
    }
    if (url.pathname === "/internal/backups" && request.method === "POST") {
      return this.createBackup(request);
    }
    if (url.pathname === "/internal/backups/restore" && request.method === "POST") {
      return this.restoreBackup(request);
    }
    if (url.pathname === "/internal/teacher-email/request" && request.method === "POST") {
      return this.requestTeacherEmail(request);
    }
    if (url.pathname === "/internal/teacher-email/verify" && request.method === "POST") {
      return this.verifyTeacherEmail(request);
    }
    if (url.pathname === "/internal/recovery/request" && request.method === "POST") {
      return this.requestRecovery(request);
    }
    if (url.pathname === "/internal/recovery/consume" && request.method === "POST") {
      return this.consumeRecovery(request);
    }
    if (url.pathname === "/internal/email-rate-limit" && request.method === "POST") {
      return this.rateLimitEmailRequests(request);
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
    const room = {
      createdAt: Date.now(),
      workName: "新しい作品",
      ownerTokenHash: toHex(await digestToken(ownerToken)),
      worldSeed: worldSeed >>> 0,
      worldOptions: WORLD_DIMENSIONS,
    };
    const model = globalThis.MoneycraftWorld.createModel({ ...WORLD_DIMENSIONS, seed: room.worldSeed });
    const snapshot = { world: model.serialize(), revision: 0 };
    await this.ctx.storage.transaction(async (transaction) => {
      await transaction.put("room", room);
      await this.writeWorldSnapshot(transaction, snapshot);
    });
    return jsonResponse({ ok: true }, 201);
  }

  async closeRoom(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);

    const token = request.headers.get(OWNER_TOKEN_HEADER);
    if (!token || !matchesHash(toHex(await digestToken(token)), room.ownerTokenHash)) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    for (const socket of this.ctx.getWebSockets()) {
      socket.close(4001, "Room closed by its owner");
    }
    await this.ctx.storage.deleteAll();
    return jsonResponse({ ok: true });
  }

  async endClass(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);
    if (!await this.isOwner(request, room)) return jsonResponse({ error: "forbidden" }, 403);

    for (const socket of this.ctx.getWebSockets()) {
      socket.close(4003, "Class ended; work saved");
    }
    return jsonResponse({ ok: true, workName: room.workName || "新しい作品" });
  }

  async isOwner(request, room) {
    const token = request.headers.get(OWNER_TOKEN_HEADER);
    return Boolean(token && matchesHash(toHex(await digestToken(token)), room.ownerTokenHash));
  }

  async getWork(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);
    if (!await this.isOwner(request, room)) return jsonResponse({ error: "forbidden" }, 403);
    return jsonResponse({
      workName: room.workName || "新しい作品",
      backups: await this.getBackupList(),
      activePlayers: this.ctx.getWebSockets().length,
    });
  }

  async renameWork(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);
    if (!await this.isOwner(request, room)) return jsonResponse({ error: "forbidden" }, 403);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    const workName = typeof body?.workName === "string" ? body.workName.trim() : "";
    if (!workName || workName.length > WORK_NAME_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(workName)) {
      return jsonResponse({ error: "invalid_work_name" }, 400);
    }
    room.workName = workName;
    await this.ctx.storage.put("room", room);
    this.broadcast({
      v: PROTOCOL_VERSION,
      type: "work-renamed",
      payload: { workName },
    });
    return jsonResponse({ ok: true, workName });
  }

  async getBackupList() {
    const backups = await this.ctx.storage.get("backups");
    if (!Array.isArray(backups)) return [];
    return backups.map(({ id, name, createdAt, revision }) => ({ id, name, createdAt, revision }));
  }

  async listBackups(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);
    if (!await this.isOwner(request, room)) return jsonResponse({ error: "forbidden" }, 403);
    return jsonResponse({ backups: await this.getBackupList() });
  }

  async createBackup(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);
    if (!await this.isOwner(request, room)) return jsonResponse({ error: "forbidden" }, 403);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > WORK_NAME_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
      return jsonResponse({ error: "invalid_backup_name" }, 400);
    }

    const snapshot = await this.getWorldSnapshot(room.worldSeed);
    const backup = this.createBackupMetadata(name, snapshot);
    let removedBackup = null;
    await this.ctx.storage.transaction(async (transaction) => {
      const backups = await transaction.get("backups") || [];
      if (backups.length >= BACKUP_MAX_COUNT) {
        removedBackup = backups.shift();
        await this.deleteBackupSnapshot(transaction, removedBackup);
      }
      await this.writeBackupSnapshot(transaction, backup, snapshot);
      await transaction.put("backups", [...backups, backup]);
    });
    const backups = await this.ctx.storage.get("backups") || [];
    return jsonResponse({
      backup: { id: backup.id, name: backup.name, createdAt: backup.createdAt, revision: backup.revision },
      removedBackup: removedBackup && {
        id: removedBackup.id,
        name: removedBackup.name,
        createdAt: removedBackup.createdAt,
      },
      backups: backups.map(({ id, name, createdAt, revision }) => ({ id, name, createdAt, revision })),
    }, 201);
  }

  createBackupMetadata(name, snapshot) {
    const { blocks, ...world } = snapshot.world;
    return {
      id: newOpaqueId(12),
      name,
      createdAt: Date.now(),
      revision: snapshot.revision,
      world,
      partCount: Math.ceil(blocks.length / WORLD_PART_SIZE),
    };
  }

  async writeBackupSnapshot(transaction, backup, snapshot) {
    const { blocks } = snapshot.world;
    for (let index = 0; index < backup.partCount; index += 1) {
      await transaction.put(
        `backup-${backup.id}-part-${index}`,
        Uint8Array.from(blocks.slice(index * WORLD_PART_SIZE, (index + 1) * WORLD_PART_SIZE)),
      );
    }
  }

  async deleteBackupSnapshot(transaction, backup) {
    for (let index = 0; index < backup.partCount; index += 1) {
      await transaction.delete(`backup-${backup.id}-part-${index}`);
    }
  }

  async readBackupSnapshot(backup) {
    const length = backup.world.width * backup.world.depth * backup.world.height;
    if (backup.partCount !== Math.ceil(length / WORLD_PART_SIZE)) {
      throw new Error("Stored backup metadata is invalid.");
    }
    const parts = await Promise.all(Array.from({ length: backup.partCount }, (_, index) =>
      this.ctx.storage.get(`backup-${backup.id}-part-${index}`)));
    const blocks = [];
    for (const [index, part] of parts.entries()) {
      if (!(part instanceof Uint8Array) || part.length !== Math.min(WORLD_PART_SIZE, length - index * WORLD_PART_SIZE)) {
        throw new Error("Stored backup part is missing or invalid.");
      }
      blocks.push(...part);
    }
    const snapshot = { world: { ...backup.world, blocks }, revision: backup.revision };
    this.validateWorldSnapshot(snapshot);
    return snapshot;
  }

  async restoreBackup(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);
    if (!await this.isOwner(request, room)) return jsonResponse({ error: "forbidden" }, 403);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    if (typeof body?.backupId !== "string" || !/^[a-f0-9]{24}$/.test(body.backupId)) {
      return jsonResponse({ error: "invalid_backup_id" }, 400);
    }
    const backups = await this.ctx.storage.get("backups") || [];
    const selected = backups.find(({ id }) => id === body.backupId);
    if (!selected) return jsonResponse({ error: "backup_not_found" }, 404);

    const [current, restored] = await Promise.all([
      this.getWorldSnapshot(room.worldSeed),
      this.readBackupSnapshot(selected),
    ]);
    const recoveryBackup = this.createBackupMetadata("復元前の自動保存", current);
    const nextSnapshot = {
      world: restored.world,
      revision: current.revision + 1,
    };
    this.broadcast({
      v: PROTOCOL_VERSION,
      type: "work-restore-start",
      payload: { backupName: selected.name },
    });
    let retainedBackups;
    try {
      await this.ctx.storage.transaction(async (transaction) => {
        const existing = await transaction.get("backups") || [];
        retainedBackups = [...existing, recoveryBackup];
        while (retainedBackups.length > BACKUP_MAX_COUNT) {
          const oldest = retainedBackups.shift();
          await this.deleteBackupSnapshot(transaction, oldest);
        }
        await this.writeBackupSnapshot(transaction, recoveryBackup, current);
        await this.writeWorldSnapshot(transaction, nextSnapshot);
        await transaction.put("backups", retainedBackups);
      });
    } catch (error) {
      this.broadcast({
        v: PROTOCOL_VERSION,
        type: "work-restore-cancelled",
        payload: {},
      });
      console.error("Could not atomically restore a work snapshot.");
      return jsonResponse({ error: "restore_failed" }, 503);
    }
    this.worldModel = null;
    const payload = { world: nextSnapshot.world, revision: nextSnapshot.revision };
    this.broadcast({ v: PROTOCOL_VERSION, type: "world-snapshot", payload });
    this.broadcast({
      v: PROTOCOL_VERSION,
      type: "work-restored",
      payload: { backupName: selected.name },
    });
    return jsonResponse({
      ok: true,
      workName: room.workName || "新しい作品",
      revision: nextSnapshot.revision,
      backups: retainedBackups.map(({ id, name, createdAt, revision }) => ({ id, name, createdAt, revision })),
    });
  }

  async requestTeacherEmail(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);
    const ownerToken = request.headers.get(OWNER_TOKEN_HEADER);
    if (!ownerToken || !matchesHash(toHex(await digestToken(ownerToken)), room.ownerTokenHash)) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!isValidEmail(email)) return jsonResponse({ error: "invalid_email" }, 400);

    const now = Date.now();
    if (now - (room.teacherEmailRequestAt || 0) < EMAIL_REQUEST_COOLDOWN_MS) {
      return jsonResponse({ error: "rate_limited" }, 429);
    }

    const token = newOpaqueToken();
    const requestId = newOpaqueId();
    room.teacherEmailRequestAt = now;
    room.pendingTeacherEmail = {
      email,
      tokenHash: toHex(await digestToken(token)),
      expiresAt: now + EMAIL_TOKEN_TTL_MS,
      requestId,
    };
    await this.ctx.storage.put("room", room);
    return jsonResponse({
      deliver: true,
      email,
      token,
      requestId,
      expiresAt: room.pendingTeacherEmail.expiresAt,
    });
  }

  async verifyTeacherEmail(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "room_not_found" }, 404);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    const token = body?.token;
    const pending = room.pendingTeacherEmail;
    if (typeof token !== "string" || !pending || pending.expiresAt <= Date.now()
      || !matchesHash(toHex(await digestToken(token)), pending.tokenHash)) {
      return jsonResponse({ error: "invalid_or_expired_token" }, 400);
    }

    room.teacherEmail = pending.email;
    delete room.pendingTeacherEmail;
    await this.ctx.storage.put("room", room);
    return jsonResponse({ ok: true });
  }

  async requestRecovery(request) {
    const room = await this.ctx.storage.get("room");
    if (!room?.teacherEmail) return jsonResponse({ ok: true, deliver: false });

    const now = Date.now();
    if (now - (room.recoveryRequestAt || 0) < EMAIL_REQUEST_COOLDOWN_MS) {
      return jsonResponse({ ok: true, deliver: false });
    }

    const token = newOpaqueToken();
    const requestId = newOpaqueId();
    room.recoveryRequestAt = now;
    room.recoveryTokenHash = toHex(await digestToken(token));
    room.recoveryTokenExpiresAt = now + EMAIL_TOKEN_TTL_MS;
    room.recoveryRequestId = requestId;
    await this.ctx.storage.put("room", room);
    return jsonResponse({
      ok: true,
      deliver: true,
      email: room.teacherEmail,
      token,
      requestId,
      expiresAt: room.recoveryTokenExpiresAt,
    });
  }

  async consumeRecovery(request) {
    const room = await this.ctx.storage.get("room");
    if (!room) return jsonResponse({ error: "invalid_or_expired_token" }, 400);

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    const token = body?.token;
    if (typeof token !== "string" || !room.recoveryTokenHash
      || room.recoveryTokenExpiresAt <= Date.now()
      || !matchesHash(toHex(await digestToken(token)), room.recoveryTokenHash)) {
      return jsonResponse({ error: "invalid_or_expired_token" }, 400);
    }

    const ownerToken = newOpaqueToken();
    room.ownerTokenHash = toHex(await digestToken(ownerToken));
    delete room.recoveryTokenHash;
    delete room.recoveryTokenExpiresAt;
    delete room.recoveryRequestId;
    delete room.pendingTeacherEmail;
    await this.ctx.storage.put("room", room);
    return jsonResponse({ ok: true, ownerToken });
  }

  async rateLimitEmailRequests(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    if (!Array.isArray(body?.buckets) || body.buckets.length < 1 || body.buckets.length > 2
      || !body.buckets.every((bucket) => bucket && ["source", "recipient"].includes(bucket.scope)
        && /^[A-Za-z0-9_-]{20,64}$/.test(bucket.id || ""))) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }
    const scopes = body.buckets.map((bucket) => bucket.scope);
    if (new Set(scopes).size !== scopes.length) return jsonResponse({ error: "invalid_request" }, 400);

    const now = Date.now();
    const entries = await Promise.all(body.buckets.map(async ({ scope, id }) => {
      const key = `email-rate-limit:${scope}:${id}`;
      const limit = scope === "source" ? EMAIL_SOURCE_RATE_LIMIT : EMAIL_RECIPIENT_RATE_LIMIT;
      const existing = await this.ctx.storage.get(key);
      const timestamps = (Array.isArray(existing?.timestamps) ? existing.timestamps : [])
        .filter((timestamp) => Number.isSafeInteger(timestamp) && timestamp > now - EMAIL_RATE_WINDOW_MS);
      return { key, scope, limit, timestamps };
    }));
    const blocked = entries.find((entry) => entry.timestamps.length >= entry.limit);
    if (blocked) {
      return jsonResponse({
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((blocked.timestamps[0] + EMAIL_RATE_WINDOW_MS - now) / 1000)),
      });
    }

    for (const entry of entries) {
      await this.ctx.storage.put(entry.key, {
        timestamps: [...entry.timestamps, now],
        updatedAt: now,
      });
    }
    const checkCount = Number(await this.ctx.storage.get("email-rate-limit:checks")) || 0;
    await this.ctx.storage.put("email-rate-limit:checks", checkCount + 1);
    if (checkCount % 100 === 0 && typeof this.ctx.storage.list === "function") {
      const values = await this.ctx.storage.list({ prefix: "email-rate-limit:" });
      for (const [key, value] of values) {
        if (key !== "email-rate-limit:checks" && value?.updatedAt <= now - EMAIL_RATE_WINDOW_MS) {
          await this.ctx.storage.delete(key);
        }
      }
    }
    return jsonResponse({ allowed: true });
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
    const snapshot = await this.getWorldSnapshot(room.worldSeed);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const player = {
      id: newOpaqueId(),
      displayName: this.createDisplayName(currentSockets),
      state: null,
      messageWindowStart: Date.now(),
      messageCount: 0,
      editCount: 0,
      snapshotCount: 0,
      dimensions: { width: snapshot.world.width, depth: snapshot.world.depth, height: snapshot.world.height },
    };
    server.serializeAttachment(player);
    this.ctx.acceptWebSocket(server);
    this.send(server, {
      v: PROTOCOL_VERSION,
      type: "welcome",
      payload: {
        roomCode: new URL(request.url).searchParams.get("code"),
        workName: room.workName || "新しい作品",
        player: { id: player.id, displayName: player.displayName },
        players: this.listPlayers(currentSockets),
        world: snapshot.world,
        revision: snapshot.revision,
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

  async getWorldSnapshot(seed) {
    const saved = await this.ctx.storage.get("world");
    if (saved) {
      if (saved.storageVersion === undefined) {
        this.validateWorldSnapshot(saved);
        return saved;
      }
      if (saved.storageVersion !== 1 || !globalThis.MoneycraftWorld.isSupportedDimensions(saved.world)
        || saved.partCount !== Math.ceil(saved.world.width * saved.world.depth * saved.world.height / WORLD_PART_SIZE)) {
        throw new Error("Stored world metadata is invalid.");
      }
      const parts = await Promise.all(Array.from({ length: saved.partCount }, (_, index) =>
        this.ctx.storage.get(`world-part-${index}`)));
      const length = saved.world.width * saved.world.depth * saved.world.height;
      const blocks = [];
      for (const [index, part] of parts.entries()) {
        if (!(part instanceof Uint8Array) || part.length !== Math.min(WORLD_PART_SIZE, length - index * WORLD_PART_SIZE)) {
          throw new Error("Stored world part is missing or invalid.");
        }
        blocks.push(...part);
      }
      const snapshot = { world: { ...saved.world, blocks }, revision: saved.revision };
      this.validateWorldSnapshot(snapshot);
      return snapshot;
    }
    const room = await this.ctx.storage.get("room");
    if (!room || room.worldOptions) throw new Error("Stored room world metadata is missing.");
    const model = globalThis.MoneycraftWorld.createModel({ ...globalThis.MoneycraftWorld.legacyOptions, seed });
    const snapshot = { world: model.serialize(), revision: 0 };
    await this.saveWorldSnapshot(snapshot);
    return snapshot;
  }

  validateWorldSnapshot(snapshot) {
    const world = snapshot?.world;
    if (!globalThis.MoneycraftWorld.isSupportedDimensions(world)
      || world.version !== globalThis.MoneycraftWorld.formatVersion
      || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0
      || !["legacy", "forest-plains"].includes(world.terrain ?? "legacy")
      || !Array.isArray(world.blocks) || world.blocks.length !== world.width * world.depth * world.height
      || !world.blocks.every((block) => Number.isInteger(block) && block >= 0 && block <= globalThis.MoneycraftWorld.blocks.length)) {
      throw new Error("Stored room world is invalid.");
    }
  }

  async writeWorldSnapshot(transaction, snapshot, editedIndex = null) {
    const { blocks, ...metadata } = snapshot.world;
    const partCount = Math.ceil(blocks.length / WORLD_PART_SIZE);
    const indices = editedIndex === null ? Array.from({ length: partCount }, (_, index) => index)
      : [Math.floor(editedIndex / WORLD_PART_SIZE)];
    for (const index of indices) {
      await transaction.put(`world-part-${index}`, Uint8Array.from(blocks.slice(index * WORLD_PART_SIZE, (index + 1) * WORLD_PART_SIZE)));
    }
    await transaction.put("world", { storageVersion: 1, world: metadata, revision: snapshot.revision, partCount });
  }

  async saveWorldSnapshot(snapshot, editedIndex = null) {
    const previous = await this.ctx.storage.get("world");
    await this.ctx.storage.transaction((transaction) =>
      this.writeWorldSnapshot(transaction, snapshot, previous?.storageVersion === 1 ? editedIndex : null));
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
    return this.runExclusive(() => this.handleWebSocketMessage(socket, message));
  }

  async handleWebSocketMessage(socket, message) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        await this.handleMessage(socket, message);
      } catch (error) {
        console.error("Could not process or persist a room message.", error);
        socket.close(1011, "Room storage or message processing failed");
      }
    });
  }

  async handleMessage(socket, message) {
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

    if (!packet || packet.v !== PROTOCOL_VERSION) {
      this.send(socket, {
        v: PROTOCOL_VERSION,
        type: "error",
        payload: { code: "invalid_message" },
      });
      return;
    }

    const player = socket.deserializeAttachment();
    if (!player) {
      socket.close(1008, "Unknown player");
      return;
    }
    let dimensions = player.dimensions;
    if (!globalThis.MoneycraftWorld.isSupportedDimensions(dimensions)) {
      const room = await this.ctx.storage.get("room");
      if (!room) {
        socket.close(4001, "Room closed");
        return;
      }
      dimensions = (await this.getWorldSnapshot(room.worldSeed)).world;
      player.dimensions = { width: dimensions.width, depth: dimensions.depth, height: dimensions.height };
    }
    if (!((packet.type === "player-state" && isPlayerStatePayload(packet.payload, dimensions))
      || (packet.type === "block-edit" && isBlockEditPayload(packet.payload, dimensions))
      || (packet.type === "world-request" && packet.payload === null))) {
      this.send(socket, { v: PROTOCOL_VERSION, type: "error", payload: { code: "invalid_message" } });
      return;
    }
    const now = Date.now();
    if (now - player.messageWindowStart >= 1000) {
      player.messageWindowStart = now;
      player.messageCount = 0;
      player.editCount = 0;
      player.snapshotCount = 0;
    }
    if (packet.type === "world-request") {
      player.snapshotCount = (player.snapshotCount || 0) + 1;
      socket.serializeAttachment(player);
      if (player.snapshotCount > 2) {
        this.send(socket, { v: PROTOCOL_VERSION, type: "error", payload: { code: "rate_limited" } });
        return;
      }
      const room = await this.ctx.storage.get("room");
      if (!room) {
        socket.close(4001, "Room closed");
        return;
      }
      this.send(socket, {
        v: PROTOCOL_VERSION, type: "world-snapshot",
        payload: await this.getWorldSnapshot(room.worldSeed),
      });
      return;
    }
    if (packet.type === "block-edit") {
      player.editCount = (player.editCount || 0) + 1;
      socket.serializeAttachment(player);
      await this.editBlock(socket, player, packet.payload);
      return;
    }
    player.messageCount += 1;
    socket.serializeAttachment(player);
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

  async editBlock(socket, player, edit) {
    const reject = (code) => this.send(socket, {
      v: PROTOCOL_VERSION, type: "edit-rejected",
      payload: { requestId: edit.requestId, code },
    });
    if (player.editCount > MAX_BLOCK_EDIT_MESSAGES_PER_SECOND) return reject("rate_limited");
    const state = player.state;
    if (!state || Math.hypot(edit.x + 0.5 - state.x, edit.y + 0.5 - (state.y + 1.7 * 0.88),
      edit.z + 0.5 - state.z) > BLOCK_REACH + Math.sqrt(3) / 2) return reject("out_of_reach");
    const room = await this.ctx.storage.get("room");
    if (!room) return reject("room_closed");
    const snapshot = await this.getWorldSnapshot(room.worldSeed);
    this.worldModel ??= globalThis.MoneycraftWorld.createModel({
      width: snapshot.world.width, depth: snapshot.world.depth, height: snapshot.world.height, seed: room.worldSeed,
    });
    const model = this.worldModel;
    if (!model.load(snapshot.world)) throw new Error("Stored room world is invalid.");
    if (model.getBlock(edit.x, edit.y, edit.z) !== edit.expectedBlock) return reject("edit_conflict");
    if (edit.block !== 0 && this.listPlayers().some(({ state: other }) => other
      && edit.x < other.x + 0.28 && edit.x + 1 > other.x - 0.28
      && edit.z < other.z + 0.28 && edit.z + 1 > other.z - 0.28
      && edit.y < other.y + 1.7 && edit.y + 1 > other.y)) return reject("player_in_block");
    if (!model.setBlock(edit.x, edit.y, edit.z, edit.block)) throw new Error("Validated edit could not be applied.");
    const revision = snapshot.revision + 1;
    const editedIndex = (edit.y * snapshot.world.depth + edit.z) * snapshot.world.width + edit.x;
    await this.saveWorldSnapshot({ world: model.serialize(), revision }, editedIndex);
    this.broadcast({
      v: PROTOCOL_VERSION, type: "block-changed",
      payload: { ...edit, revision, playerId: player.id },
    });
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
