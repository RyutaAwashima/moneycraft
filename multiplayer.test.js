"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createClient() {
  class Element extends EventTarget {
    value = "";
    textContent = "";
    dataset = {};
    append() {}
    replaceChildren() {}
    focus() {}
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
  window.location = { origin: "https://example.test" };
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    },
    createElement: () => new Element(),
  };
  const context = {
    window, document, WebSocket: Socket, CustomEvent, URL,
    sessionStorage: { getItem: () => null },
    console: { error() {}, warn() {} },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "multiplayer.js"), "utf8"), context);
  elements.get("#room-code").value = "ABCD23";
  elements.get("#join-room").dispatchEvent(new Event("click"));
  const socket = sockets.at(-1);
  socket.dispatchEvent(new Event("open"));
  const message = (data) => {
    const event = new Event("message");
    event.data = typeof data === "string" ? data : JSON.stringify(data);
    socket.dispatchEvent(event);
  };
  const welcome = () => message({
    v: 2, type: "welcome", payload: {
      roomCode: "ABCD23", player: { id: "self", displayName: "Builder" },
      players: [], maxPlayers: 8, world: { version: 1 }, revision: 0,
    },
  });
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(`moneycraft:${type}`, { detail }));
  return { socket, message, welcome, emit, elements, window };
}

test("browser protocol and JSON failures close using permitted application codes", () => {
  for (const [packet, expectedCode] of [
    [{ v: 1, type: "welcome" }, 4002],
    [{ v: 2, type: "welcome", payload: {} }, 4002],
    [{ v: 2, type: "player-state", payload: {} }, 4002],
    ["{invalid", 4007],
  ]) {
    const client = createClient();
    client.message(packet);
    assert.equal(client.socket.closeCode, expectedCode);
    assert.equal(client.elements.get("#room-roster-count").textContent, "0 / 8 人");
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
