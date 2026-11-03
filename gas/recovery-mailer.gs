const RECOVERY_MAX_BODY_BYTES = 8192;
const RECOVERY_TIMESTAMP_TOLERANCE_SECONDS = 300;
const RECOVERY_IDEMPOTENCY_TTL_SECONDS = 86400;
const RECOVERY_PENDING_TTL_SECONDS = 120;
const RECOVERY_APP_LINK_PATTERN =
  /^https:\/\/ryutaawashima\.github\.io(?:\/[A-Za-z0-9._~/-]*)?\?room=[A-HJ-NP-Z2-9]{6}#(?:verify-email|recover)=[A-Za-z0-9_-]{32,64}$/;

function doPost(event) {
  try {
    return recoveryJsonOutput(processRecoveryRequest(event));
  } catch (error) {
    return recoveryJsonOutput({ ok: false, error: error.code || "invalid_request" });
  }
}

function processRecoveryRequest(event) {
  const rawBody = event?.postData?.contents;
  if (typeof rawBody !== "string" || Utilities.newBlob(rawBody).getBytes().length > RECOVERY_MAX_BODY_BYTES) {
    throw recoveryError("invalid_request");
  }

  let envelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    throw recoveryError("invalid_request");
  }
  const properties = PropertiesService.getScriptProperties();
  const secret = properties.getProperty("RECOVERY_HMAC_SECRET");
  if (typeof secret !== "string" || secret.length < 32 || !verifyRecoveryEnvelope(envelope, secret)) {
    throw recoveryError("unauthorized");
  }

  const payload = decodeRecoveryPayload(envelope.payload);
  validateRecoveryPayload(payload);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(envelope.timestamp)) > RECOVERY_TIMESTAMP_TOLERANCE_SECONDS) {
    throw recoveryError("expired_request");
  }

  const requestId = payload.requestId;
  const nonce = envelope.nonce;
  const requestKey = `recovery_request_${requestId}`;
  const nonceKey = `recovery_nonce_${nonce}`;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let requestState;
  try {
    purgeRecoveryState(properties, nowSeconds);
    const previous = properties.getProperty(requestKey);
    if (previous) {
      const state = JSON.parse(previous);
      if (state.status === "sent") return { ok: true, requestId };
      if (state.status === "pending" && nowSeconds - state.updatedAt < RECOVERY_PENDING_TTL_SECONDS) {
        throw recoveryError("request_in_progress");
      }
    }
    if (properties.getProperty(nonceKey)) throw recoveryError("replay_detected");
    properties.setProperty(nonceKey, String(nowSeconds));
    properties.setProperty(requestKey, JSON.stringify({ status: "pending", updatedAt: nowSeconds }));
    requestState = { requestKey, properties };
  } finally {
    lock.releaseLock();
  }

  try {
    sendRecoveryEmail(payload);
    saveRecoveryRequestState(requestState, { status: "sent", updatedAt: nowSeconds });
    return { ok: true, requestId };
  } catch {
    saveRecoveryRequestState(requestState, { status: "failed", updatedAt: nowSeconds });
    throw recoveryError("mail_send_failed");
  }
}

function verifyRecoveryEnvelope(envelope, secret) {
  if (!envelope || envelope.version !== 1
    || !/^\d{10}$/.test(String(envelope.timestamp))
    || !/^[A-Za-z0-9_-]{20,64}$/.test(envelope.nonce || "")
    || !/^[A-Za-z0-9_-]{1,8192}$/.test(envelope.payload || "")
    || !/^[A-Za-z0-9_-]{40,64}$/.test(envelope.signature || "")) return false;

  const signedValue = `v1\n${envelope.timestamp}\n${envelope.nonce}\n${envelope.payload}`;
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(signedValue, secret),
  ).replace(/=+$/, "");
  return recoveryConstantTimeEqual(expected, envelope.signature);
}

function decodeRecoveryPayload(payload) {
  try {
    const decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString("UTF-8");
    return JSON.parse(decoded);
  } catch {
    throw recoveryError("invalid_payload");
  }
}

function validateRecoveryPayload(payload) {
  if (!payload || !["teacher-email-verification", "teacher-recovery"].includes(payload.kind)
    || !/^[A-HJ-NP-Z2-9]{6}$/.test(payload.roomCode || "")
    || !/^[a-f0-9]{32}$/.test(payload.requestId || "")
    || typeof payload.email !== "string" || payload.email.length > 254
    || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(payload.email)
    || typeof payload.url !== "string" || !RECOVERY_APP_LINK_PATTERN.test(payload.url)) {
    throw recoveryError("invalid_payload");
  }
  const expectedFragment = payload.kind === "teacher-email-verification" ? "#verify-email=" : "#recover=";
  if (!payload.url.includes(expectedFragment)) throw recoveryError("invalid_payload");
}

function sendRecoveryEmail(payload) {
  const isVerification = payload.kind === "teacher-email-verification";
  const subject = isVerification ? "Moneycraft 教員メールアドレスの確認" : "Moneycraft 教員管理権限の復旧";
  const action = isVerification ? "メールアドレスを確認" : "教員管理権限を復旧";
  const expiry = isVerification ? "15分以内" : "15分以内";
  const body = [
    `Moneycraftの部屋 ${payload.roomCode} から、${action}のリクエストがありました。`,
    "",
    `次のリンクを${expiry}に開いてください。このリンクは一度だけ使用できます。`,
    payload.url,
    "",
    "この操作に心当たりがない場合は、このメールを無視してください。",
  ].join("\n");
  const htmlBody = [
    `<p>Moneycraftの部屋 <strong>${payload.roomCode}</strong> から、${action}のリクエストがありました。</p>`,
    `<p>次のリンクを${expiry}に開いてください。このリンクは一度だけ使用できます。</p>`,
    `<p><a href="${payload.url}">${action}</a></p>`,
    "<p>この操作に心当たりがない場合は、このメールを無視してください。</p>",
  ].join("");
  MailApp.sendEmail({ to: payload.email, subject, body, htmlBody });
}

function saveRecoveryRequestState(requestState, state) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requestState.properties.setProperty(requestState.requestKey, JSON.stringify(state));
  } finally {
    lock.releaseLock();
  }
}

function purgeRecoveryState(properties, nowSeconds) {
  const all = properties.getProperties();
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith("recovery_nonce_")) {
      if (nowSeconds - Number(value) > RECOVERY_IDEMPOTENCY_TTL_SECONDS) properties.deleteProperty(key);
      continue;
    }
    if (key.startsWith("recovery_request_")) {
      let updatedAt = 0;
      try {
        updatedAt = JSON.parse(value).updatedAt || 0;
      } catch {
        updatedAt = 0;
      }
      if (nowSeconds - updatedAt > RECOVERY_IDEMPOTENCY_TTL_SECONDS) properties.deleteProperty(key);
    }
  }
}

function recoveryConstantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function recoveryError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function recoveryJsonOutput(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
