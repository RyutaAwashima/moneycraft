import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import "../world-model.js";
import worker, { Room } from "./worker.js";

class Storage {
  data = new Map();
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async delete(key) { return this.data.delete(key); }
  async list({ prefix = "" } = {}) {
    return new Map([...this.data].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)]));
  }
  async deleteAll() { this.data.clear(); }
  async transaction(callback) { return callback(this); }
}

function createRoomNamespace() {
  const rooms = new Map();
  return {
    rooms,
    idFromName: (name) => name,
    get(id) {
      if (!rooms.has(id)) {
        const ctx = {
          storage: new Storage(),
          getWebSockets: () => [],
          blockConcurrencyWhile: (callback) => callback(),
        };
        const instance = new Room(ctx);
        rooms.set(id, {
          ctx,
          fetch: (request, init) => instance.fetch(
            request instanceof Request ? request : new Request(request, init),
          ),
        });
      }
      return rooms.get(id);
    },
  };
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function request(path, { method = "POST", body, origin = "https://example.test", headers = {} } = {}) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("owner email enrollment, verification, recovery and signed mail delivery work end to end", async () => {
  const ROOMS = createRoomNamespace();
  const env = {
    ROOMS,
    ALLOWED_ORIGINS: "https://example.test",
    RECOVERY_MAILER_URL: "https://script.google.com/macros/s/test-deployment/exec",
    RECOVERY_MAILER_HMAC_SECRET: "a-secure-test-secret-value-with-more-than-32-bytes",
  };
  const createdResponse = await worker.fetch(request("/api/rooms"), env);
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 201);

  const deliveries = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url.href, env.RECOVERY_MAILER_URL);
    const envelope = JSON.parse(options.body);
    const payload = decodeBase64Url(envelope.payload);
    const signature = createHmac("sha256", env.RECOVERY_MAILER_HMAC_SECRET)
      .update(`v1\n${envelope.timestamp}\n${envelope.nonce}\n${envelope.payload}`)
      .digest("base64url");
    assert.equal(envelope.signature, signature);
    deliveries.push({ envelope, payload });
    return Response.json({ ok: true, requestId: payload.requestId });
  };

  try {
    const enrollment = await worker.fetch(request(`/api/rooms/${created.roomCode}/teacher-email`, {
      body: { email: "teacher@example.jp", returnUrl: "https://example.test/moneycraft/?invite=discarded" },
      headers: { "X-Room-Owner-Token": created.ownerToken },
    }), env);
    assert.equal(enrollment.status, 202);
    assert.deepEqual(await enrollment.json(), { ok: true });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].payload.kind, "teacher-email-verification");
    assert.match(deliveries[0].payload.url, /^https:\/\/example\.test\/moneycraft\/\?room=[A-HJ-NP-Z2-9]{6}#verify-email=/);
    const verificationToken = new URL(deliveries[0].payload.url).hash.slice("#verify-email=".length);
    const verified = await worker.fetch(request(`/api/rooms/${created.roomCode}/teacher-email/verify`, {
      body: { token: verificationToken },
    }), env);
    assert.equal(verified.status, 200);
    assert.deepEqual(await verified.json(), { ok: true });

    const recovery = await worker.fetch(request(`/api/rooms/${created.roomCode}/recovery`, {
      body: { returnUrl: "https://example.test/moneycraft/" },
    }), env);
    assert.equal(recovery.status, 202);
    assert.equal((await recovery.json()).ok, true);
    assert.equal(deliveries.length, 2);
    assert.equal(deliveries[1].payload.kind, "teacher-recovery");
    const recoveryToken = new URL(deliveries[1].payload.url).hash.slice("#recover=".length);
    const consumed = await worker.fetch(request(`/api/rooms/${created.roomCode}/recovery/consume`, {
      body: { token: recoveryToken },
    }), env);
    assert.equal(consumed.status, 200);
    assert.equal(consumed.headers.get("Cache-Control"), "no-store");
    const { ownerToken } = await consumed.json();
    assert.notEqual(ownerToken, created.ownerToken);
    const closeWithOldToken = await worker.fetch(request(`/api/rooms/${created.roomCode}`, {
      method: "DELETE",
      headers: { "X-Room-Owner-Token": created.ownerToken },
    }), env);
    assert.equal(closeWithOldToken.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recovery requires an allowed same-origin return URL and a registered owner email", async () => {
  const env = {
    ROOMS: createRoomNamespace(),
    ALLOWED_ORIGINS: "https://example.test",
    RECOVERY_MAILER_URL: "https://script.google.com/macros/s/test-deployment/exec",
    RECOVERY_MAILER_HMAC_SECRET: "a-secure-test-secret-value-with-more-than-32-bytes",
  };
  const absentRoom = await worker.fetch(request("/api/rooms/ABCD23/recovery", {
    body: { returnUrl: "https://example.test/moneycraft/" },
  }), env);
  assert.equal(absentRoom.status, 202);
  assert.equal((await absentRoom.json()).ok, true);

  const badOrigin = await worker.fetch(request("/api/rooms/ABCD23/recovery", {
    origin: "https://attacker.test",
    body: { returnUrl: "https://attacker.test/" },
  }), env);
  assert.equal(badOrigin.status, 403);
});

test("global rate limits cap requests per source and recipient across room codes", async () => {
  const env = {
    ROOMS: createRoomNamespace(),
    ALLOWED_ORIGINS: "https://example.test",
    RECOVERY_MAILER_URL: "https://script.google.com/macros/s/test-deployment/exec",
    RECOVERY_MAILER_HMAC_SECRET: "a-secure-test-secret-value-with-more-than-32-bytes",
  };
  const id = env.ROOMS.idFromName("moneycraft-email-rate-limits-v1");
  const limiter = env.ROOMS.get(id);
  const check = (scope, value) => limiter.fetch(new Request("https://room.internal/internal/email-rate-limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buckets: [{ scope, id: value }] }),
  }));
  const sourceId = "s".repeat(32);
  for (let count = 0; count < 10; count += 1) {
    assert.equal((await (await check("source", sourceId)).json()).allowed, true);
  }
  assert.equal((await (await check("source", sourceId)).json()).allowed, false);

  const recipientId = "r".repeat(32);
  for (let count = 0; count < 3; count += 1) {
    assert.equal((await (await check("recipient", recipientId)).json()).allowed, true);
  }
  assert.equal((await (await check("recipient", recipientId)).json()).allowed, false);
});

test("mailer retries once with a new nonce and the same request ID", async () => {
  const env = {
    ROOMS: createRoomNamespace(),
    ALLOWED_ORIGINS: "https://example.test",
    RECOVERY_MAILER_URL: "https://script.google.com/macros/s/test-deployment/exec",
    RECOVERY_MAILER_HMAC_SECRET: "a-secure-test-secret-value-with-more-than-32-bytes",
  };
  const created = await (await worker.fetch(request("/api/rooms"), env)).json();
  const room = env.ROOMS.get(created.roomCode);
  const emailChallengeResponse = await room.fetch(new Request("https://room.internal/internal/teacher-email/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Room-Owner-Token": created.ownerToken },
    body: JSON.stringify({ email: "teacher@example.jp" }),
  }));
  const emailChallenge = await emailChallengeResponse.json();
  await room.fetch(new Request("https://room.internal/internal/teacher-email/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: emailChallenge.token }),
  }));
  const captured = [];
  const originalFetch = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = async (_url, options) => {
    const envelope = JSON.parse(options.body);
    captured.push(envelope);
    attempt += 1;
    if (attempt === 1) throw new Error("temporary failure");
    const payload = decodeBase64Url(envelope.payload);
    return Response.json({ ok: true, requestId: payload.requestId });
  };
  try {
    const recovery = await worker.fetch(request(`/api/rooms/${created.roomCode}/recovery`, {
      body: { returnUrl: "https://example.test/" },
    }), env);
    assert.equal(recovery.status, 202);
    assert.equal(captured.length, 2);
    const firstPayload = decodeBase64Url(captured[0].payload);
    const secondPayload = decodeBase64Url(captured[1].payload);
    assert.equal(firstPayload.requestId, secondPayload.requestId);
    assert.notEqual(captured[0].nonce, captured[1].nonce);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
