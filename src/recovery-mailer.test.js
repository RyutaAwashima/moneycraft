import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../gas/recovery-mailer.gs", import.meta.url), "utf8");
const secret = "a-secure-test-secret-value-with-more-than-32-bytes";

function createMailer({ failSends = 0 } = {}) {
  const properties = new Map([["RECOVERY_HMAC_SECRET", secret]]);
  const sentEmails = [];
  let sendAttempts = 0;
  const context = {
    Date,
    JSON,
    Math,
    Object,
    String,
    Error,
    RegExp,
    Utilities: {
      newBlob(value) {
        return {
          getBytes: () => new TextEncoder().encode(value),
          getDataAsString: () => Buffer.from(value).toString("utf8"),
        };
      },
      base64DecodeWebSafe(value) {
        return Uint8Array.from(Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64"));
      },
      base64EncodeWebSafe(value) {
        return Buffer.from(value).toString("base64url");
      },
      computeHmacSha256Signature(value, key) {
        return Uint8Array.from(createHmac("sha256", key).update(value).digest());
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties.get(key) ?? null,
        setProperty: (key, value) => properties.set(key, value),
        deleteProperty: (key) => properties.delete(key),
        getProperties: () => Object.fromEntries(properties),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {},
        releaseLock() {},
      }),
    },
    MailApp: {
      sendEmail(email) {
        sendAttempts += 1;
        if (failSends > 0) {
          failSends -= 1;
          throw new Error("mail service failure");
        }
        sentEmails.push(email);
      },
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(text) {
        return {
          text,
          setMimeType(type) { this.mimeType = type; return this; },
        };
      },
    },
    TextEncoder,
    Buffer,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    post: (envelope) => {
      const output = context.doPost({ postData: { contents: JSON.stringify(envelope) } });
      return JSON.parse(output.text);
    },
    sentEmails,
    properties,
    get sendAttempts() { return sendAttempts; },
  };
}

function createEnvelope({
  requestId = "a".repeat(32),
  nonce = Buffer.from("nonce-token-0123456789").toString("base64url"),
  timestamp = Math.floor(Date.now() / 1000).toString(),
  signatureOverride,
  kind = "teacher-recovery",
} = {}) {
  const action = kind === "teacher-email-verification" ? "verify-email" : "recover";
  const payload = Buffer.from(JSON.stringify({
    email: "teacher@example.jp",
    roomCode: "ABCD23",
    requestId,
    url: `https://ryutaawashima.github.io/moneycraft/?room=ABCD23#${action}=${"x".repeat(43)}`,
    kind,
  })).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`v1\n${timestamp}\n${nonce}\n${payload}`)
    .digest("base64url");
  return {
    version: 1,
    timestamp,
    nonce,
    payload,
    signature: signatureOverride ?? signature,
  };
}

test("GAS mailer authenticates, sends, and idempotently returns completed requests", () => {
  const mailer = createMailer();
  const envelope = createEnvelope({ kind: "teacher-email-verification" });
  assert.deepEqual(mailer.post(envelope), { ok: true, requestId: "a".repeat(32) });
  assert.deepEqual(mailer.post(createEnvelope({
    requestId: "a".repeat(32),
    kind: "teacher-email-verification",
    nonce: Buffer.from("nonce-token-9876543210").toString("base64url"),
  })), {
    ok: true,
    requestId: "a".repeat(32),
  });
  assert.equal(mailer.sendAttempts, 1);
  assert.equal(mailer.sentEmails.length, 1);
  assert.equal(mailer.sentEmails[0].to, "teacher@example.jp");
  assert.match(mailer.sentEmails[0].subject, /確認/);
});

test("GAS mailer rejects invalid signatures, replays, expired timestamps, and untrusted links", () => {
  const mailer = createMailer();
  assert.deepEqual(mailer.post(createEnvelope({ signatureOverride: "invalid" })), {
    ok: false,
    error: "unauthorized",
  });
  const first = createEnvelope({ requestId: "b".repeat(32) });
  assert.deepEqual(mailer.post(first), { ok: true, requestId: "b".repeat(32) });
  const replay = createEnvelope({ requestId: "c".repeat(32), nonce: first.nonce });
  assert.deepEqual(mailer.post(replay), { ok: false, error: "replay_detected" });
  assert.deepEqual(mailer.post(createEnvelope({
    requestId: "d".repeat(32),
    timestamp: String(Math.floor(Date.now() / 1000) - 600),
  })), { ok: false, error: "expired_request" });

  const unsafe = createEnvelope({ requestId: "e".repeat(32) });
  const payload = JSON.parse(Buffer.from(unsafe.payload, "base64url").toString("utf8"));
  payload.url = "https://attacker.example/recover";
  unsafe.payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  unsafe.signature = createHmac("sha256", secret)
    .update(`v1\n${unsafe.timestamp}\n${unsafe.nonce}\n${unsafe.payload}`)
    .digest("base64url");
  assert.deepEqual(mailer.post(unsafe), { ok: false, error: "invalid_payload" });
  assert.equal(mailer.sentEmails.length, 1);
});

test("GAS mailer allows one retry after send failure and suppresses duplicate delivery", () => {
  const mailer = createMailer({ failSends: 1 });
  const requestId = "f".repeat(32);
  assert.deepEqual(mailer.post(createEnvelope({ requestId })), { ok: false, error: "mail_send_failed" });
  assert.deepEqual(mailer.post(createEnvelope({
    requestId,
    nonce: Buffer.from("nonce-token-second-1234").toString("base64url"),
  })), { ok: true, requestId });
  assert.deepEqual(mailer.post(createEnvelope({
    requestId,
    nonce: Buffer.from("nonce-token-third-12345").toString("base64url"),
  })), { ok: true, requestId });
  assert.equal(mailer.sendAttempts, 2);
  assert.equal(mailer.sentEmails.length, 1);
});
