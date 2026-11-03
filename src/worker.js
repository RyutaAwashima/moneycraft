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
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Room-Owner-Token",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomToken(byteLength = 16) {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    throw new Error("request_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 8192) {
    throw new Error("request_too_large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid_request");
  }
}

function getReturnUrl(request, returnUrl, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).has(origin) || typeof returnUrl !== "string") {
    throw new Error("origin_not_allowed");
  }
  let url;
  try {
    url = new URL(returnUrl);
  } catch {
    throw new Error("invalid_return_url");
  }
  if (url.origin !== origin || url.username || url.password) {
    throw new Error("invalid_return_url");
  }
  url.search = "";
  url.hash = "";
  return url;
}

function createActionUrl(baseUrl, roomCode, action, token) {
  const url = new URL(baseUrl);
  url.searchParams.set("room", roomCode);
  url.hash = `${action}=${token}`;
  return url.href;
}

function getMailerConfig(env) {
  let endpoint;
  const secret = env.RECOVERY_MAILER_HMAC_SECRET;
  try {
    endpoint = new URL(env.RECOVERY_MAILER_URL);
  } catch {
    throw new Error("email_delivery_not_configured");
  }
  if (!secret || secret.length < 32 || endpoint.protocol !== "https:"
    || endpoint.hostname !== "script.google.com"
    || !/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname)) {
    throw new Error("email_delivery_not_configured");
  }
  return { endpoint, secret };
}

async function getRateLimitBucketId(secret, scope, value) {
  return encodeBase64Url(await hmac(secret, `${scope}\n${value}`));
}

async function applyEmailRateLimit(env, buckets) {
  const stub = env.ROOMS.get(env.ROOMS.idFromName("moneycraft-email-rate-limits-v1"));
  const response = await stub.fetch(new Request("https://room.internal/internal/email-rate-limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buckets }),
  }));
  if (!response.ok) throw new Error("email_rate_limit_unavailable");
  return response.json();
}

async function sourceRateLimitBucket(request, secret) {
  const ipAddress = request.headers.get("CF-Connecting-IP") || "unknown";
  return {
    scope: "source",
    id: await getRateLimitBucketId(secret, "source", ipAddress),
  };
}

async function deliverRecoveryEmail(env, { email, roomCode, requestId, url, kind }) {
  const { endpoint, secret } = getMailerConfig(env);

  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    email,
    roomCode,
    requestId,
    url,
    kind,
  })));
  const version = 1;
  let lastFailure = "email_delivery_failed";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomToken();
    const signature = encodeBase64Url(await hmac(
      secret,
      `v1\n${timestamp}\n${nonce}\n${payload}`,
    ));
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, timestamp, nonce, payload, signature }),
        signal: AbortSignal.timeout(10_000),
      });
      let result;
      try {
        result = await response.json();
      } catch {
        result = null;
      }
      if (response.ok && result?.ok === true && result.requestId === requestId) return;
      lastFailure = "email_delivery_failed";
      if (response.status < 500 && result?.error !== "mail_send_failed") break;
    } catch {
      lastFailure = "email_delivery_failed";
    }
  }
  throw new Error(lastFailure);
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
  const match = pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(connect|teacher-email(?:\/verify)?|recovery(?:\/consume)?|work|backups(?:\/[a-f0-9]{24}\/restore)?|end))?$/);
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
    if (roomRoute.action === "work" && ["GET", "PATCH"].includes(request.method)) {
      let body;
      if (request.method === "PATCH") {
        try {
          body = await readJson(request);
        } catch (error) {
          return jsonResponse({ error: error.message }, error.message === "request_too_large" ? 413 : 400, headers);
        }
      }
      return forwardOwnerRequest(stub, "/internal/work", request, headers, body);
    }
    if (roomRoute.action === "backups" && request.method === "GET") {
      return forwardOwnerRequest(stub, "/internal/backups", request, headers);
    }
    if (roomRoute.action === "backups" && request.method === "POST") {
      let body;
      try {
        body = await readJson(request);
      } catch (error) {
        return jsonResponse({ error: error.message }, error.message === "request_too_large" ? 413 : 400, headers);
      }
      return forwardOwnerRequest(stub, "/internal/backups", request, headers, body);
    }
    if (roomRoute.action.startsWith("backups/") && request.method === "POST") {
      const backupId = roomRoute.action.match(/^backups\/([a-f0-9]{24})\/restore$/)?.[1];
      if (!backupId) return jsonResponse({ error: "not_found" }, 404, headers);
      return forwardOwnerRequest(stub, "/internal/backups/restore", request, headers, { backupId });
    }
    if (roomRoute.action === "end" && request.method === "POST") {
      return forwardOwnerRequest(stub, "/internal/end-class", request, headers);
    }
    if (request.method === "POST" && roomRoute.action === "teacher-email") {
      let body;
      let returnUrl;
      try {
        body = await readJson(request);
        returnUrl = getReturnUrl(request, body.returnUrl, env);
      } catch (error) {
        return jsonResponse({ error: error.message }, error.message === "request_too_large" ? 413 : 400, headers);
      }
      try {
        const { secret } = getMailerConfig(env);
        const sourceBucket = await sourceRateLimitBucket(request, secret);
        const sourceLimit = await applyEmailRateLimit(env, [sourceBucket]);
        if (!sourceLimit.allowed) {
          return jsonResponse({ error: "rate_limited", retryAfterSeconds: sourceLimit.retryAfterSeconds }, 429, headers);
        }
        const result = await stub.fetch(new Request("https://room.internal/internal/teacher-email/request", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Room-Owner-Token": request.headers.get("X-Room-Owner-Token") || "",
          },
          body: JSON.stringify({ email: body.email }),
        }));
        const resultBody = await result.json();
        if (!result.ok) return jsonResponse(resultBody, result.status, headers);
        if (resultBody.deliver) {
          const recipientBucket = {
            scope: "recipient",
            id: await getRateLimitBucketId(secret, "recipient", resultBody.email),
          };
          const recipientLimit = await applyEmailRateLimit(env, [recipientBucket]);
          if (!recipientLimit.allowed) {
            return jsonResponse({
              error: "rate_limited",
              retryAfterSeconds: recipientLimit.retryAfterSeconds,
            }, 429, headers);
          }
          await deliverRecoveryEmail(env, {
            email: resultBody.email,
            roomCode: roomRoute.code,
            requestId: resultBody.requestId,
            url: createActionUrl(returnUrl, roomRoute.code, "verify-email", resultBody.token),
            kind: "teacher-email-verification",
          });
        }
        return jsonResponse({ ok: true }, 202, headers);
      } catch (error) {
        if (error.message === "email_delivery_not_configured") {
          return jsonResponse({ error: "email_delivery_not_configured" }, 503, headers);
        }
        if (error.message === "email_rate_limit_unavailable") {
          console.error("Email rate limit service is unavailable.");
          return jsonResponse({ error: "email_delivery_unavailable" }, 503, headers);
        }
        console.error("Could not deliver teacher email verification.");
        return jsonResponse({ error: "email_delivery_failed" }, 502, headers);
      }
    }
    if (request.method === "POST" && roomRoute.action === "teacher-email/verify") {
      return handleInternalJson(stub, "/internal/teacher-email/verify", request, headers);
    }
    if (request.method === "POST" && roomRoute.action === "recovery") {
      let body;
      let returnUrl;
      try {
        body = await readJson(request);
        returnUrl = getReturnUrl(request, body.returnUrl, env);
      } catch (error) {
        return jsonResponse({ error: error.message }, error.message === "request_too_large" ? 413 : 400, headers);
      }
      try {
        const { secret } = getMailerConfig(env);
        const sourceBucket = await sourceRateLimitBucket(request, secret);
        const sourceLimit = await applyEmailRateLimit(env, [sourceBucket]);
        if (!sourceLimit.allowed) {
          return jsonResponse({
            ok: true,
            message: "登録済みの教員メールがある場合、復旧リンクを送信しました。",
          }, 202, headers);
        }
        const result = await stub.fetch(new Request("https://room.internal/internal/recovery/request", {
          method: "POST",
        }));
        const resultBody = await result.json();
        if (resultBody.deliver) {
          const recipientBucket = {
            scope: "recipient",
            id: await getRateLimitBucketId(secret, "recipient", resultBody.email),
          };
          const recipientLimit = await applyEmailRateLimit(env, [recipientBucket]);
          if (!recipientLimit.allowed) {
            return jsonResponse({
              ok: true,
              message: "登録済みの教員メールがある場合、復旧リンクを送信しました。",
            }, 202, headers);
          }
          await deliverRecoveryEmail(env, {
            email: resultBody.email,
            roomCode: roomRoute.code,
            requestId: resultBody.requestId,
            url: createActionUrl(returnUrl, roomRoute.code, "recover", resultBody.token),
            kind: "teacher-recovery",
          });
        }
        return jsonResponse({
          ok: true,
          message: "登録済みの教員メールがある場合、復旧リンクを送信しました。",
        }, 202, headers);
      } catch (error) {
        if (error.message === "email_delivery_not_configured") {
          return jsonResponse({ error: "email_delivery_not_configured" }, 503, headers);
        }
        if (error.message === "email_rate_limit_unavailable") {
          console.error("Email rate limit service is unavailable.");
          return jsonResponse({ error: "email_delivery_unavailable" }, 503, headers);
        }
        console.error("Could not deliver a teacher recovery email.");
        return jsonResponse({ error: "email_delivery_failed" }, 502, headers);
      }
    }
    if (request.method === "POST" && roomRoute.action === "recovery/consume") {
      return handleInternalJson(stub, "/internal/recovery/consume", request, headers);
    }
    return jsonResponse({ error: "method_not_allowed" }, 405, headers);
  },
};

async function forwardOwnerRequest(stub, pathname, request, headers, body) {
  const response = await stub.fetch(new Request(`https://room.internal${pathname}`, {
    method: request.method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      "X-Room-Owner-Token": request.headers.get("X-Room-Owner-Token") || "",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return jsonResponse(await response.json(), response.status, {
    ...headers,
    "Cache-Control": "no-store",
  });
}

async function handleInternalJson(stub, pathname, request, headers) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return jsonResponse({ error: error.message }, error.message === "request_too_large" ? 413 : 400, headers);
  }
  const response = await stub.fetch(new Request(`https://room.internal${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  return jsonResponse(await response.json(), response.status, {
    ...headers,
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  });
}

export { Room };
