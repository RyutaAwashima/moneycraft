"use strict";

(() => {
  const createButton = document.querySelector("#create-room");
  const joinButton = document.querySelector("#join-room");
  const leaveButton = document.querySelector("#leave-room");
  const closeButton = document.querySelector("#close-room");
  const roomCodeInput = document.querySelector("#room-code");
  const roomStatus = document.querySelector("#room-status");
  const roomDetails = document.querySelector("#room-details");
  const roomShareCode = document.querySelector("#room-share-code");
  const roomRoster = document.querySelector("#room-roster");
  const roomRosterCount = document.querySelector("#room-roster-count");
  const roomOwnerNote = document.querySelector("#room-owner-note");
  const OWNER_SESSION_KEY = "moneycraft-room-owner-v1";
  const API_BASE_URL = (globalThis.MONEYCRAFT_CONFIG?.apiBaseUrl || window.location.origin)
    .replace(/\/+$/, "");

  let activeSocket = null;
  let currentRoomCode = "";
  let localPlayerId = "";
  let maxPlayers = 8;
  let isRoomOwner = false;
  const players = new Map();

  function setStatus(text, state = "idle") {
    roomStatus.textContent = text;
    roomStatus.dataset.state = state;
  }

  function renderRoster() {
    roomRoster.replaceChildren();
    for (const player of players.values()) {
      const item = document.createElement("li");
      item.textContent = player.displayName + (player.id === localPlayerId ? "（あなた）" : "");
      roomRoster.append(item);
    }
    roomRosterCount.textContent = `${players.size} / ${maxPlayers} 人`;
  }

  function updateRoomDetails() {
    const hasRoom = Boolean(currentRoomCode);
    roomDetails.hidden = !hasRoom;
    roomShareCode.textContent = currentRoomCode;
    roomOwnerNote.textContent = isRoomOwner
      ? "このブラウザーからワールドを閉じられます"
      : "部屋を作成した教員だけがワールドを閉じられます";
    closeButton.hidden = !isRoomOwner;
    leaveButton.disabled = !activeSocket;
    renderRoster();
  }

  function emitRoomEvent(type, detail) {
    window.dispatchEvent(new CustomEvent(`moneycraft:${type}`, { detail }));
  }

  function apiUrl(path) {
    return new URL(path, `${API_BASE_URL}/`);
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(apiUrl(path), options);
    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw new Error(`サーバーからJSON以外の応答を受信しました (${response.status})`, { cause: error });
    }
    if (!response.ok) {
      const error = new Error(body.error || `サーバーエラー (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function socketUrl(roomCode) {
    const url = apiUrl(`/api/rooms/${roomCode}/connect`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url;
  }

  function clearPlayers() {
    players.clear();
    localPlayerId = "";
    renderRoster();
  }

  function sendPlayerState(event) {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    const state = event.detail;
    if (!state || !["x", "y", "z", "yaw", "pitch"].every((key) => Number.isFinite(state[key]))) {
      console.error("Could not send an invalid local player state.");
      return;
    }
    try {
      activeSocket.send(JSON.stringify({ v: 1, type: "player-state", payload: state }));
    } catch (error) {
      console.error("Could not send the local player state.", error);
      activeSocket.close(1011, "Player state delivery failed");
    }
  }

  function handleRoomMessage(packet, socket) {
    if (socket !== activeSocket) return;
    if (!packet || packet.v !== 1 || typeof packet.type !== "string") {
      setStatus("サーバー応答の形式が正しくありません。", "error");
      socket.close(1002, "Invalid protocol message");
      return;
    }

    if (packet.type === "welcome") {
      const welcome = packet.payload;
      if (!welcome || welcome.roomCode !== currentRoomCode
        || !welcome.player || typeof welcome.player.id !== "string"
        || typeof welcome.player.displayName !== "string" || !Array.isArray(welcome.players)) {
        setStatus("部屋の初期状態を読み込めませんでした。", "error");
        socket.close(1002, "Invalid welcome message");
        return;
      }
      localPlayerId = welcome.player.id;
      maxPlayers = welcome.maxPlayers;
      clearPlayers();
      localPlayerId = welcome.player.id;
      for (const player of welcome.players) players.set(player.id, player);
      players.set(welcome.player.id, welcome.player);
      updateRoomDetails();
      setStatus(`「${welcome.player.displayName}」として入室しました。`, "connected");
      emitRoomEvent("room-joined", welcome);
      return;
    }

    if (packet.type === "player-joined" && packet.payload?.id && packet.payload?.displayName) {
      players.set(packet.payload.id, packet.payload);
      updateRoomDetails();
      setStatus(`${packet.payload.displayName} が参加しました。`, "connected");
      emitRoomEvent("player-joined", packet.payload);
      return;
    }

    if (packet.type === "player-left" && packet.payload?.id) {
      const leaving = players.get(packet.payload.id);
      players.delete(packet.payload.id);
      updateRoomDetails();
      if (leaving) setStatus(`${leaving.displayName} が退出しました。`, "connected");
      emitRoomEvent("player-left", packet.payload);
      return;
    }

    if (packet.type === "player-state") {
      const update = packet.payload;
      const state = update?.state;
      if (typeof update?.playerId !== "string" || !state
        || !["x", "y", "z", "yaw", "pitch"].every((key) => Number.isFinite(state[key]))) {
        setStatus("プレイヤー位置の通信形式が正しくありません。", "error");
        socket.close(1002, "Invalid player state");
        return;
      }
      emitRoomEvent("player-state", {
        ...update,
        displayName: players.get(update.playerId)?.displayName || update.displayName,
      });
      return;
    }

    if (packet.type === "error") {
      setStatus(`通信エラー: ${packet.payload?.code || "unknown"}`, "error");
    }
  }

  function connectToRoom(roomCode) {
    if (activeSocket) {
      const previousSocket = activeSocket;
      activeSocket = null;
      previousSocket.close(1000, "Reconnecting");
    }
    currentRoomCode = roomCode;
    roomCodeInput.value = roomCode;
    clearPlayers();
    updateRoomDetails();
    setStatus("部屋に接続しています…", "connecting");

    let socket;
    try {
      socket = new WebSocket(socketUrl(roomCode));
    } catch (error) {
      console.error("Could not connect to the multiplayer room.", error);
      setStatus("部屋に接続できません。サーバーURLを確認してください。", "error");
      return;
    }
    activeSocket = socket;
    let connectionOpened = false;
    socket.addEventListener("open", () => {
      if (socket === activeSocket) {
        connectionOpened = true;
        setStatus("部屋に接続しました。参加情報を受信しています…", "connecting");
      }
    });
    socket.addEventListener("message", (event) => {
      let packet;
      try {
        packet = JSON.parse(event.data);
      } catch (error) {
        console.error("Could not parse a multiplayer message.", error);
        setStatus("サーバーから読み取れない通信を受信しました。", "error");
        socket.close(1007, "Invalid JSON");
        return;
      }
      handleRoomMessage(packet, socket);
    });
    socket.addEventListener("error", () => {
      if (socket === activeSocket) setStatus("接続に失敗しました。部屋コードとサーバーを確認してください。", "error");
    });
    socket.addEventListener("close", (event) => {
      if (socket !== activeSocket) return;
      const closedRoomCode = currentRoomCode;
      activeSocket = null;
      clearPlayers();
      let detail;
      let state;
      if (event.code === 4001) {
        currentRoomCode = "";
        roomCodeInput.value = "";
        isRoomOwner = false;
        clearOwnerSession();
        detail = "教員がワールドを閉じました。";
        state = "closed";
      } else if (!connectionOpened) {
        currentRoomCode = "";
        isRoomOwner = false;
        detail = "部屋に接続できませんでした。部屋コードとサーバーを確認してください。";
        state = "error";
      } else if (event.code === 1000) {
        detail = "部屋から退出しました。";
        state = "disconnected";
      } else {
        detail = "接続が切れました。部屋が開いていれば、部屋コードで再参加できます。";
        state = "disconnected";
      }
      updateRoomDetails();
      setStatus(detail, state);
      emitRoomEvent("room-left", { code: closedRoomCode, closeCode: event.code });
    });
  }

  function readOwnerSession() {
    try {
      const value = sessionStorage.getItem(OWNER_SESSION_KEY);
      if (!value) return null;
      const session = JSON.parse(value);
      if (typeof session.roomCode === "string" && typeof session.ownerToken === "string") return session;
    } catch (error) {
      console.warn("Could not read the room owner session.", error);
    }
    return null;
  }

  function clearOwnerSession() {
    try {
      sessionStorage.removeItem(OWNER_SESSION_KEY);
    } catch (error) {
      console.warn("Could not clear the room owner session.", error);
    }
    isRoomOwner = false;
    updateRoomDetails();
  }

  async function createRoom() {
    setButtonsDisabled(true);
    setStatus("新しい部屋を作っています…", "connecting");
    try {
      const result = await requestJson("/api/rooms", { method: "POST" });
      if (result.v !== 1 || typeof result.roomCode !== "string" || typeof result.ownerToken !== "string") {
        throw new Error("部屋作成の応答が正しくありません");
      }
      currentRoomCode = result.roomCode;
      isRoomOwner = true;
      sessionStorage.setItem(OWNER_SESSION_KEY, JSON.stringify({
        roomCode: result.roomCode,
        ownerToken: result.ownerToken,
      }));
      updateRoomDetails();
      connectToRoom(result.roomCode);
    } catch (error) {
      console.error("Could not create a multiplayer room.", error);
      setStatus(`部屋を作成できませんでした: ${error.message}`, "error");
    } finally {
      setButtonsDisabled(false);
    }
  }

  function joinRoom() {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomCode)) {
      setStatus("部屋コードは6文字で入力してください。", "error");
      roomCodeInput.focus();
      return;
    }
    const ownerSession = readOwnerSession();
    isRoomOwner = ownerSession?.roomCode === roomCode;
    connectToRoom(roomCode);
  }

  function leaveRoom() {
    if (!activeSocket) return;
    const socket = activeSocket;
    activeSocket = null;
    socket.close(1000, "Player left");
    clearPlayers();
    updateRoomDetails();
    setStatus("部屋から退出しました。", "disconnected");
    emitRoomEvent("room-left", { code: currentRoomCode, closeCode: 1000 });
  }

  async function closeRoom() {
    const ownerSession = readOwnerSession();
    if (!ownerSession || ownerSession.roomCode !== currentRoomCode) {
      setStatus("このブラウザーには部屋を閉じる権限がありません。", "error");
      return;
    }
    if (!window.confirm("このワールドを閉じますか？参加者全員が退出し、ワールドは削除されます。")) return;

    setButtonsDisabled(true);
    try {
      await requestJson(`/api/rooms/${currentRoomCode}`, {
        method: "DELETE",
        headers: { "X-Room-Owner-Token": ownerSession.ownerToken },
      });
      if (activeSocket) {
        const socket = activeSocket;
        activeSocket = null;
        socket.close(1000, "Room closed by owner");
      }
      currentRoomCode = "";
      clearPlayers();
      clearOwnerSession();
      roomCodeInput.value = "";
      roomDetails.hidden = true;
      setStatus("ワールドを閉じました。", "closed");
      emitRoomEvent("room-closed", {});
    } catch (error) {
      console.error("Could not close the multiplayer room.", error);
      setStatus(`ワールドを閉じられませんでした: ${error.message}`, "error");
    } finally {
      setButtonsDisabled(false);
    }
  }

  function setButtonsDisabled(disabled) {
    createButton.disabled = disabled;
    joinButton.disabled = disabled;
    closeButton.disabled = disabled;
  }

  roomCodeInput.addEventListener("input", () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
  });
  roomCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") joinRoom();
  });
  createButton.addEventListener("click", createRoom);
  joinButton.addEventListener("click", joinRoom);
  leaveButton.addEventListener("click", leaveRoom);
  closeButton.addEventListener("click", closeRoom);
  window.addEventListener("moneycraft:send-player-state", sendPlayerState);

  const ownerSession = readOwnerSession();
  if (ownerSession) {
    currentRoomCode = ownerSession.roomCode;
    roomCodeInput.value = ownerSession.roomCode;
    isRoomOwner = true;
    updateRoomDetails();
    setStatus("作成者用の終了権限があります。コードを共有して参加者を招待できます。");
  }
})();
