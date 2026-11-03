"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createClient({
  href = "https://example.test/moneycraft/",
  autoJoin = true,
  qrAvailable = true,
  ownerSession = null,
  fetchImpl = async () => { throw new Error("Unexpected request"); },
} = {}) {
  class Element extends EventTarget {
    value = "";
    textContent = "";
    dataset = {};
    append() {}
    replaceChildren() {}
    focus() {}
    removeAttribute(name) { delete this[name]; }
  }
  class Socket extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    constructor() { super(); sockets.push(this); }
    send() {
      if (this.failSend) throw new Error("Connection failed");
    }
    close(code, reason) {
      if (code !== 1000 && (code < 3000 || code > 4999)) throw new DOMException("Invalid close code", "InvalidAccessError");
      this.closeCode = code;
      this.readyState = 3;
      const event = new Event("close");
      Object.assign(event, { code, reason });
      this.dispatchEvent(event);
    }
  }
  const sockets = [];
  const elements = new Map();
  const window = new EventTarget();
  window.location = new URL(href);
  window.history = {
    replaceState(_state, _title, url) { window.location = new URL(url, window.location.href); },
  };
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement: () => new Element(),
  };
  const sessions = new Map(ownerSession ? [["moneycraft-room-owner-v1", JSON.stringify(ownerSession)]] : []);
  const context = {
    window, document, WebSocket: Socket, CustomEvent, URL,
    fetch: fetchImpl,
    sessionStorage: {
      getItem: (key) => sessions.get(key) ?? null,
      setItem: (key, value) => sessions.set(key, value),
      removeItem: (key) => sessions.delete(key),
    },
    console: { error() {}, warn() {} },
  };
  vm.createContext(context);
  if (qrAvailable) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "vendor/qrcode.js"), "utf8"), context);
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname, "multiplayer.js"), "utf8"), context);
  if (autoJoin) {
    elements.get("#room-code").value = "ABCD23";
    elements.get("#join-room").dispatchEvent(new Event("click"));
  }
  const socket = sockets.at(-1);
  socket?.dispatchEvent(new Event("open"));
  const message = (data) => {
    const event = new Event("message");
    event.data = typeof data === "string" ? data : JSON.stringify(data);
    socket.dispatchEvent(event);
  };
  const welcome = () => message({
    v: 3, type: "welcome", payload: {
      roomCode: "ABCD23", player: { id: "self", displayName: "Builder" },
      players: [], maxPlayers: 16, world: { version: 1 }, revision: 0,
    },
  });
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(`moneycraft:${type}`, { detail }));
  return { socket, sockets, message, welcome, emit, elements, window, sessions };
}

test("browser protocol and JSON failures close using permitted application codes", () => {
  for (const [packet, expectedCode] of [
    [{ v: 2, type: "welcome" }, 4002],
    [{ v: 3, type: "welcome", payload: {} }, 4002],
    [{ v: 3, type: "player-state", payload: {} }, 4002],
    ["{invalid", 4007],
  ]) {
    const client = createClient();
    client.message(packet);
    assert.equal(client.socket.closeCode, expectedCode);
    assert.equal(client.elements.get("#room-roster-count").textContent, "0 / 16 人");
  }
});

test("world timeout closes the socket and emits room-left for solo restoration", () => {
  const client = createClient();
  client.welcome();
  let left = false;
  client.window.addEventListener("moneycraft:room-left", () => { left = true; });
  client.emit("world-protocol-error", {});
  assert.equal(client.socket.closeCode, 4002);
  assert.equal(left, true);
});

test("failed world and position sends close without InvalidAccessError", () => {
  for (const [type, payload] of [
    ["send-block-edit", { requestId: "edit-1" }],
    ["send-player-state", { x: 1, y: 1, z: 1, yaw: 0, pitch: 0 }],
  ]) {
    const client = createClient();
    client.welcome();
    client.socket.failSend = true;
    client.emit(type, payload);
    assert.equal(client.socket.closeCode, 4011);
  }
});

test("room invitations contain only the room code and preserve the site path", () => {
  const client = createClient({
    href: "https://example.test/moneycraft/?ownerToken=secret&release=old#private",
    ownerSession: { roomCode: "ABCD23", ownerToken: "owner-secret" },
  });
  client.welcome();
  const link = client.elements.get("#room-invite-link");
  assert.equal(link.href, "https://example.test/moneycraft/?room=ABCD23");
  assert.equal(link.hidden, false);
  const image = client.elements.get("#room-qr");
  assert.equal(image.hidden, false);
  assert.match(image.src, /^data:image\/gif;base64,/);
  assert.match(image.alt, /ABCD23/);
  const original = image.src;
  client.message({ v: 3, type: "player-joined", payload: { id: "other", displayName: "Other" } });
  assert.equal(image.src, original);
});

test("opening a QR invitation prefills a validated code without connecting or changing owner rights", () => {
  const client = createClient({
    href: "https://example.test/moneycraft/?room=efgh45", autoJoin: false,
    ownerSession: { roomCode: "ABCD23", ownerToken: "owner-secret" },
  });
  assert.equal(client.elements.get("#room-code").value, "EFGH45");
  assert.equal(client.sockets.length, 0);
  assert.match(client.elements.get("#room-status").textContent, /EFGH45/);
  client.elements.get("#join-room").dispatchEvent(new Event("click"));
  assert.equal(client.sockets.length, 1);
  assert.equal(client.elements.get("#close-room").hidden, true);
  assert.equal(client.elements.get("#room-invite-link").href, "https://example.test/moneycraft/?room=EFGH45");
});

test("invalid invitation codes are reported without joining", () => {
  for (const room of ["", "ABC", "ABC123", "<script>", "ABCDEFG"]) {
    const client = createClient({ href: `https://example.test/?room=${encodeURIComponent(room)}`, autoJoin: false });
    assert.equal(client.sockets.length, 0);
    assert.equal(client.elements.get("#room-status").dataset.state, "error");
  }
});

test("QR generation failures keep room participation and the plain invitation link usable", () => {
  const client = createClient({ qrAvailable: false });
  client.welcome();
  assert.equal(client.elements.get("#room-qr").hidden, true);
  assert.equal(client.elements.get("#room-invite-link").hidden, false);
  assert.match(client.elements.get("#room-qr-status").textContent, /生成できません/);
  assert.equal(client.elements.get("#room-status").dataset.state, "connected");
  assert.equal(client.socket.readyState, 1);
});

test("room closure clears the old QR image and invitation link", () => {
  const client = createClient();
  client.welcome();
  client.socket.close(4001, "Room closed");
  assert.equal(client.elements.get("#room-qr").hidden, true);
  assert.equal(client.elements.get("#room-qr").src, undefined);
  assert.equal(client.elements.get("#room-invite-link").hidden, true);
  assert.equal(client.elements.get("#room-invite-link").href, undefined);
});

test("recovery links consume the token once and save the replacement owner credential", async () => {
  const calls = [];
  const client = createClient({
    href: `https://example.test/moneycraft/?room=ABCD23#recover=${"t".repeat(43)}`,
    autoJoin: false,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return { ok: true, status: 200, json: async () => ({ ok: true, ownerToken: "restored-owner-token" }) };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 0);
  assert.equal(client.elements.get("#email-action").hidden, false);
  client.elements.get("#confirm-email-action").dispatchEvent(new Event("click"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/rooms\/ABCD23\/recovery\/consume$/);
  assert.equal(JSON.parse(calls[0].options.body).token, "t".repeat(43));
  assert.equal(client.sessions.get("moneycraft-room-owner-v1"), JSON.stringify({
    roomCode: "ABCD23",
    ownerToken: "restored-owner-token",
  }));
  assert.equal(client.window.location.hash, "");
  assert.equal(client.sockets.length, 1);
  assert.equal(client.elements.get("#close-room").hidden, false);
});

test("teacher email verification links send only the one-time token to the API", async () => {
  const calls = [];
  const client = createClient({
    href: `https://example.test/moneycraft/?room=ABCD23#verify-email=${"v".repeat(43)}`,
    autoJoin: false,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 0);
  client.elements.get("#confirm-email-action").dispatchEvent(new Event("click"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/rooms\/ABCD23\/teacher-email\/verify$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { token: "v".repeat(43) });
  assert.equal(client.sessions.has("moneycraft-room-owner-v1"), false);
  assert.match(client.elements.get("#room-status").textContent, /メールアドレスを確認しました/);
});
