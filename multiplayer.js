"use strict";

(() => {
  const buildTab = document.querySelector("#build-tab");
  const roomTab = document.querySelector("#room-tab");
  const buildView = document.querySelector("#build-view");
  const roomView = document.querySelector("#room-view");
  const createButton = document.querySelector("#create-room");
  const joinButton = document.querySelector("#join-room");
  const leaveButton = document.querySelector("#leave-room");
  const closeButton = document.querySelector("#close-room");
  const endClassButton = document.querySelector("#end-class");
  const recoveryButton = document.querySelector("#request-owner-recovery");
  const workManagement = document.querySelector("#work-management");
  const roomWorkName = document.querySelector("#room-work-name");
  const workNameInput = document.querySelector("#work-name");
  const saveWorkNameButton = document.querySelector("#save-work-name");
  const backupNameInput = document.querySelector("#backup-name");
  const createBackupButton = document.querySelector("#create-backup");
  const backupList = document.querySelector("#backup-list");
  const workManagementStatus = document.querySelector("#work-management-status");
  const recoveryStatus = document.querySelector("#recovery-status");
  const teacherEmailControls = document.querySelector("#teacher-email-controls");
  const teacherEmailInput = document.querySelector("#teacher-email");
  const teacherEmailButton = document.querySelector("#register-teacher-email");
  const teacherEmailStatus = document.querySelector("#teacher-email-status");
  const emailAction = document.querySelector("#email-action");
  const emailActionMessage = document.querySelector("#email-action-message");
  const emailActionStatus = document.querySelector("#email-action-status");
  const confirmEmailActionButton = document.querySelector("#confirm-email-action");
  const cancelEmailActionButton = document.querySelector("#cancel-email-action");
  const roomCodeInput = document.querySelector("#room-code");
  const roomStatus = document.querySelector("#room-status");
  const roomDetails = document.querySelector("#room-details");
  const roomShareCode = document.querySelector("#room-share-code");
  const roomQr = document.querySelector("#room-qr");
  const roomInviteLink = document.querySelector("#room-invite-link");
  const roomQrStatus = document.querySelector("#room-qr-status");
  const roomRoster = document.querySelector("#room-roster");
  const roomRosterCount = document.querySelector("#room-roster-count");
  const roomOwnerNote = document.querySelector("#room-owner-note");
  const OWNER_SESSION_KEY = "moneycraft-room-owner-v1";
  const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
  const API_BASE_URL = (globalThis.MONEYCRAFT_CONFIG?.apiBaseUrl || window.location.origin)
    .replace(/\/+$/, "");

  let activeSocket = null;
  let currentRoomCode = "";
  let localPlayerId = "";
  let maxPlayers = 16;
  let isRoomOwner = false;
  let worldReady = false;
  let renderedInviteCode = "";
  let pendingEmailAction = null;
  let currentWorkName = "新しい作品";
  let currentBackups = [];
  let activePlayerCount = 0;
  const PROTOCOL_VERSION = 11;
  const players = new Map();
  const avatar = globalThis.MoneycraftAvatar;
  const avatarSharingStatus = document.querySelector("#avatar-sharing-status");
  let sentAppearance = "";

  function refreshSavedAppearance(force = false) {
    let appearance = { ...avatar.defaults };
    try {
      const saved = localStorage.getItem(avatar.storageKey);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (!avatar.isAppearance(parsed)) throw new Error("Invalid saved avatar appearance.");
        appearance = parsed;
      }
      avatarSharingStatus.textContent = saved === null
        ? "保存した外観がないため、共同建築では既定の外観を使用します。"
        : "保存した外観を共同建築で使用します。未保存の編集は反映しません。";
    } catch (error) {
      console.error("Could not load the saved avatar appearance.", error);
      avatarSharingStatus.textContent = "保存した外観を読み込めないため、既定の外観を使用します。元の保存データは変更していません。";
    }
    if (!worldReady || !activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    const serialized = JSON.stringify(appearance, Object.keys(avatar.defaults));
    if (!force && serialized === sentAppearance) return;
    sendWorldMessage("player-appearance", appearance);
    if (activeSocket?.readyState === WebSocket.OPEN) sentAppearance = serialized;
  }

  function isAppearancePlayer(player) {
    return player && typeof player.id === "string" && typeof player.displayName === "string"
      && avatar.isAppearance(player.appearance);
  }

  function selectWorkspaceTab(tabName, focus = false) {
    const showBuild = tabName === "build";
    buildTab.setAttribute("aria-selected", String(showBuild));
    roomTab.setAttribute("aria-selected", String(!showBuild));
    buildTab.tabIndex = showBuild ? 0 : -1;
    roomTab.tabIndex = showBuild ? -1 : 0;
    buildView.hidden = !showBuild;
    roomView.hidden = showBuild;
    if (focus) (showBuild ? buildTab : roomTab).focus();
  }

  function handleWorkspaceTabKeydown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let tabName;
    if (event.key === "Home") tabName = "build";
    else if (event.key === "End") tabName = "rooms";
    else if (event.key === "ArrowRight") tabName = event.currentTarget === buildTab ? "rooms" : "build";
    else tabName = event.currentTarget === roomTab ? "build" : "rooms";
    selectWorkspaceTab(tabName, true);
  }

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
    roomWorkName.textContent = currentWorkName;
    roomShareCode.textContent = currentRoomCode;
    updateRoomInvite();
    roomOwnerNote.textContent = isRoomOwner
      ? "授業終了は保存されます。完全削除は取り消せません。"
      : "教員権限があれば作品を管理できます。";
    endClassButton.hidden = !isRoomOwner;
    closeButton.hidden = !isRoomOwner;
    workManagement.hidden = !isRoomOwner;
    teacherEmailControls.hidden = !isRoomOwner;
    leaveButton.disabled = !activeSocket;
    renderRoster();
  }

  function updateRoomInvite() {
    if (renderedInviteCode === currentRoomCode) return;
    roomQr.hidden = true;
    roomQr.removeAttribute("src");
    roomInviteLink.hidden = true;
    roomInviteLink.removeAttribute("href");
    roomQrStatus.textContent = "";
    renderedInviteCode = "";
    if (!currentRoomCode) return;
    try {
      if (!ROOM_CODE_PATTERN.test(currentRoomCode)) throw new Error("Invalid invitation room code");
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("room", currentRoomCode);
      roomInviteLink.href = url.href;
      roomInviteLink.hidden = false;
      const qr = globalThis.qrcode(0, "M");
      qr.addData(url.href, "Byte");
      qr.make();
      roomQr.src = qr.createDataURL(4);
      roomQr.alt = `部屋 ${currentRoomCode} に参加するためのQRコード`;
      roomQr.hidden = false;
      renderedInviteCode = currentRoomCode;
    } catch (error) {
      console.error("Could not generate the room invitation QR code.", error);
      roomQrStatus.textContent = "QRコードを生成できませんでした。部屋コードか参加用リンクを使ってください。";
    }
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

  function getReturnUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.href;
  }

  function saveOwnerSession(roomCode, ownerToken) {
    sessionStorage.setItem(OWNER_SESSION_KEY, JSON.stringify({ roomCode, ownerToken }));
    isRoomOwner = true;
    currentRoomCode = roomCode;
    roomCodeInput.value = roomCode;
    updateRoomDetails();
  }

  function clearPlayers() {
    players.clear();
    activePlayerCount = 0;
    localPlayerId = "";
    renderRoster();
  }

  function sendPlayerState(event) {
    if (!worldReady || !activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    const state = event.detail;
    if (!state || !["x", "y", "z", "yaw", "pitch"].every((key) => Number.isFinite(state[key]))) {
      console.error("Could not send an invalid local player state.");
      return;
    }
    try {
      activeSocket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "player-state", payload: state }));
    } catch (error) {
      console.error("Could not send the local player state.", error);
      activeSocket.close(4011, "Player state delivery failed");
    }
  }

  function sendWorldMessage(type, payload) {
    if (!worldReady || !activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      setStatus("共有ワールドに接続していません。部屋コードで再参加してください。", "error");
      emitRoomEvent("world-send-failed", payload);
      return;
    }
    try {
      activeSocket.send(JSON.stringify({ v: PROTOCOL_VERSION, type, payload }));
    } catch (error) {
      console.error("Could not send a shared world message.", error);
      const appearanceFailed = type === "player-appearance";
      setStatus(appearanceFailed ? "外観を送信できませんでした。再参加してください。"
        : "建築の変更を送信できませんでした。再参加してください。", "error");
      if (appearanceFailed) avatarSharingStatus.textContent = "外観を送信できませんでした。部屋へ再参加してください。";
      activeSocket.close(4011, "World message delivery failed");
      if (!appearanceFailed) emitRoomEvent("world-send-failed", payload);
    }
  }

  function handleRoomMessage(packet, socket) {
    if (socket !== activeSocket) return;
    if (!packet || packet.v !== PROTOCOL_VERSION || typeof packet.type !== "string") {
      setStatus("サーバー応答の形式が正しくありません。", "error");
      socket.close(4002, "Invalid protocol message");
      return;
    }

    if (packet.type === "welcome") {
      const welcome = packet.payload;
      if (!welcome || welcome.roomCode !== currentRoomCode
        || !welcome.player || typeof welcome.player.id !== "string"
        || !isAppearancePlayer(welcome.player) || !Array.isArray(welcome.players)
        || !welcome.players.every(isAppearancePlayer)
        || !welcome.world || !Number.isSafeInteger(welcome.revision) || welcome.revision < 0) {
        setStatus("部屋の初期状態を読み込めませんでした。", "error");
        socket.close(4002, "Invalid welcome message");
        return;
      }
      localPlayerId = welcome.player.id;
      currentWorkName = typeof welcome.workName === "string" ? welcome.workName : "新しい作品";
      maxPlayers = welcome.maxPlayers;
      clearPlayers();
      localPlayerId = welcome.player.id;
      for (const player of welcome.players) players.set(player.id, player);
      players.set(welcome.player.id, welcome.player);
      activePlayerCount = players.size;
      updateRoomDetails();
      setStatus(`「${welcome.player.displayName}」として入室しました。`, "connected");
      worldReady = true;
      emitRoomEvent("room-joined", welcome);
      refreshSavedAppearance(true);
      if (isRoomOwner) loadWorkManagement();
      return;
    }

    if (packet.type === "work-renamed" && typeof packet.payload?.workName === "string") {
      currentWorkName = packet.payload.workName;
      updateRoomDetails();
      return;
    }

    if (packet.type === "work-restore-start" && typeof packet.payload?.backupName === "string") {
      setStatus(`教員が「${packet.payload.backupName}」を復元しています。`, "connecting");
      return;
    }

    if (packet.type === "work-restore-cancelled") {
      setStatus("バックアップを復元できませんでした。現在の作品は保持されています。", "error");
      return;
    }

    if (packet.type === "work-restored" && typeof packet.payload?.backupName === "string") {
      setStatus(`「${packet.payload.backupName}」を復元しました。`, "connected");
      return;
    }

    if (packet.type === "player-joined") {
      if (!isAppearancePlayer(packet.payload)) {
        setStatus("プレイヤー外観の通信形式が正しくありません。", "error");
        socket.close(4002, "Invalid player appearance");
        return;
      }
      players.set(packet.payload.id, packet.payload);
      activePlayerCount = players.size;
      updateRoomDetails();
      setStatus(`${packet.payload.displayName} が参加しました。`, "connected");
      emitRoomEvent("player-joined", packet.payload);
      return;
    }

    if (packet.type === "player-appearance") {
      const update = packet.payload;
      const player = players.get(update?.playerId);
      if (!player || !avatar.isAppearance(update.appearance)) {
        setStatus("プレイヤー外観の通信形式が正しくありません。", "error");
        socket.close(4002, "Invalid player appearance");
        return;
      }
      player.appearance = update.appearance;
      emitRoomEvent("player-appearance", update);
      return;
    }

    if (packet.type === "player-left" && packet.payload?.id) {
      const leaving = players.get(packet.payload.id);
      players.delete(packet.payload.id);
      activePlayerCount = players.size;
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
        socket.close(4002, "Invalid player state");
        return;
      }
      emitRoomEvent("player-state", {
        ...update,
        displayName: players.get(update.playerId)?.displayName || update.displayName,
        appearance: players.get(update.playerId)?.appearance,
      });
      return;
    }

    if (["block-changed", "edit-rejected", "world-snapshot"].includes(packet.type)) {
      emitRoomEvent(packet.type, packet.payload);
      return;
    }

    if (packet.type === "error") {
      setStatus(`通信エラー: ${packet.payload?.code || "unknown"}`, "error");
      emitRoomEvent("room-error", packet.payload);
    }
  }

  function connectToRoom(roomCode) {
    worldReady = false;
    emitRoomEvent("room-connecting", { code: roomCode });
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
      emitRoomEvent("room-left", { code: roomCode });
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
      if (socket !== activeSocket) return;
      let packet;
      try {
        packet = JSON.parse(event.data);
      } catch (error) {
        console.error("Could not parse a multiplayer message.", error);
        setStatus("サーバーから読み取れない通信を受信しました。", "error");
        socket.close(4007, "Invalid JSON");
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
      worldReady = false;
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
      } else if (event.code === 4003) {
        detail = "授業が終了しました。作品は保存されています。同じ部屋コードで再開できます。";
        state = "closed";
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
      if (result.v !== PROTOCOL_VERSION || typeof result.roomCode !== "string" || typeof result.ownerToken !== "string") {
        throw new Error("部屋作成の応答が正しくありません");
      }
      currentRoomCode = result.roomCode;
      isRoomOwner = true;
      saveOwnerSession(result.roomCode, result.ownerToken);
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
    if (!ROOM_CODE_PATTERN.test(roomCode)) {
      setStatus("部屋コードは6文字で入力してください。", "error");
      roomCodeInput.focus();
      return;
    }
    const ownerSession = readOwnerSession();
    isRoomOwner = ownerSession?.roomCode === roomCode;
    connectToRoom(roomCode);
  }

  function getOwnerHeaders(ownerSession = readOwnerSession()) {
    if (!ownerSession || ownerSession.roomCode !== currentRoomCode) return null;
    return { "X-Room-Owner-Token": ownerSession.ownerToken };
  }

  async function loadWorkManagement() {
    const ownerSession = readOwnerSession();
    const headers = getOwnerHeaders(ownerSession);
    if (!headers) return;
    try {
      const work = await requestJson(`/api/rooms/${currentRoomCode}/work`, { headers });
      currentWorkName = work.workName;
      currentBackups = work.backups;
      activePlayerCount = work.activePlayers;
      workNameInput.value = currentWorkName;
      renderBackups();
      updateRoomDetails();
    } catch (error) {
      console.error("Could not load work management data.", error);
      workManagementStatus.textContent = `作品情報を読み込めませんでした: ${error.message}`;
    }
  }

  function renderBackups() {
    backupList.replaceChildren();
    for (const backup of currentBackups) {
      const item = document.createElement("li");
      const description = document.createElement("span");
      description.textContent = backup.name;
      const created = document.createElement("time");
      created.dateTime = new Date(backup.createdAt).toISOString();
      created.textContent = new Date(backup.createdAt).toLocaleString("ja-JP");
      const restoreButton = document.createElement("button");
      restoreButton.className = "room-button";
      restoreButton.type = "button";
      restoreButton.textContent = "この状態に復元";
      restoreButton.addEventListener("click", () => restoreBackup(backup));
      item.append(description, created, restoreButton);
      backupList.append(item);
    }
    if (!currentBackups.length) {
      const empty = document.createElement("li");
      empty.textContent = "バックアップはまだありません。";
      backupList.append(empty);
    }
  }

  async function saveWorkName() {
    const headers = getOwnerHeaders();
    const workName = workNameInput.value.trim();
    if (!headers) {
      workManagementStatus.textContent = "作成者として接続してから操作してください。";
      return;
    }
    saveWorkNameButton.disabled = true;
    try {
      const result = await requestJson(`/api/rooms/${currentRoomCode}/work`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ workName }),
      });
      currentWorkName = result.workName;
      workNameInput.value = currentWorkName;
      updateRoomDetails();
      workManagementStatus.textContent = "作品名を保存しました。";
    } catch (error) {
      console.error("Could not save work name.", error);
      workManagementStatus.textContent = `作品名を保存できませんでした: ${error.message}`;
    } finally {
      saveWorkNameButton.disabled = false;
    }
  }

  async function createBackup() {
    const headers = getOwnerHeaders();
    const name = backupNameInput.value.trim();
    if (!headers) {
      workManagementStatus.textContent = "作成者として接続してから操作してください。";
      return;
    }
    if (!name) {
      workManagementStatus.textContent = "バックアップ名を入力してください。";
      backupNameInput.focus();
      return;
    }
    const oldest = currentBackups[0];
    if (currentBackups.length >= 10 && !window.confirm(
      `保存上限は10件です。作成すると最古の「${oldest.name}」が削除されます。続けますか？`,
    )) return;

    createBackupButton.disabled = true;
    try {
      const result = await requestJson(`/api/rooms/${currentRoomCode}/backups`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      currentBackups = result.backups;
      backupNameInput.value = "";
      renderBackups();
      workManagementStatus.textContent = result.removedBackup
        ? `バックアップを作成し、最古の「${result.removedBackup.name}」を削除しました。`
        : `「${result.backup.name}」を保存しました。`;
    } catch (error) {
      console.error("Could not create a work backup.", error);
      workManagementStatus.textContent = `バックアップを作成できませんでした: ${error.message}`;
    } finally {
      createBackupButton.disabled = false;
    }
  }

  async function restoreBackup(backup) {
    const headers = getOwnerHeaders();
    if (!headers) {
      workManagementStatus.textContent = "作成者として接続してから操作してください。";
      return;
    }
    const oldest = currentBackups[0];
    const retentionWarning = currentBackups.length >= 10
      ? `復元前の作品状態は自動バックアップとして保存されます。その際、最古の「${oldest.name}」が削除されます。`
      : "復元前の現在状態も自動バックアップとして保存します。";
    const time = new Date(backup.createdAt).toLocaleString("ja-JP");
    if (!window.confirm(
      `「${backup.name}」（${time}）に復元しますか？参加者${activePlayerCount}人の画面が置き換わります。\n${retentionWarning}`,
    )) return;

    workManagementStatus.textContent = "参加者へ通知し、バックアップを復元しています…";
    try {
      const result = await requestJson(
        `/api/rooms/${currentRoomCode}/backups/${backup.id}/restore`,
        { method: "POST", headers },
      );
      currentBackups = result.backups;
      renderBackups();
      workManagementStatus.textContent = `「${backup.name}」を復元しました。復元前の状態もバックアップに保存しました。`;
    } catch (error) {
      console.error("Could not restore a work backup.", error);
      workManagementStatus.textContent = `復元できませんでした。現在の作品は保持されています: ${error.message}`;
    }
  }

  async function endClass() {
    const headers = getOwnerHeaders();
    if (!headers) {
      setStatus("このブラウザーには授業を終了する権限がありません。", "error");
      return;
    }
    if (!window.confirm(
      `「${currentWorkName}」の授業を終了しますか？参加者${activePlayerCount}人を退出させますが、作品とバックアップは保存されます。`,
    )) return;
    endClassButton.disabled = true;
    try {
      await requestJson(`/api/rooms/${currentRoomCode}/end`, { method: "POST", headers });
      setStatus("授業を終了しました。作品は保存されています。同じ部屋コードで再開できます。", "closed");
    } catch (error) {
      console.error("Could not end the class while preserving its work.", error);
      setStatus(`授業を終了できませんでした: ${error.message}`, "error");
    } finally {
      endClassButton.disabled = false;
    }
  }

  function leaveRoom() {
    if (!activeSocket) return;
    const socket = activeSocket;
    activeSocket = null;
    worldReady = false;
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
    if (!window.confirm(
      `「${currentWorkName}」を完全削除しますか？ライブ作品とすべてのバックアップが消え、復元できません。`,
    )) return;
    const confirmation = window.prompt(`完全削除を確認するため、作品名「${currentWorkName}」を入力してください。`);
    if (confirmation?.trim() !== currentWorkName) {
      setStatus("作品名が一致しないため、削除を中止しました。", "idle");
      return;
    }

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
      currentWorkName = "新しい作品";
      currentBackups = [];
      worldReady = false;
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

  async function registerTeacherEmail() {
    const ownerSession = readOwnerSession();
    const email = teacherEmailInput.value.trim();
    if (!ownerSession || ownerSession.roomCode !== currentRoomCode || !email) {
      teacherEmailStatus.textContent = "部屋の作成者として接続し、メールアドレスを入力してください。";
      return;
    }

    teacherEmailButton.disabled = true;
    teacherEmailStatus.textContent = "";
    try {
      await requestJson(`/api/rooms/${currentRoomCode}/teacher-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Room-Owner-Token": ownerSession.ownerToken,
        },
        body: JSON.stringify({ email, returnUrl: getReturnUrl() }),
      });
      teacherEmailStatus.textContent = "確認メールを送信しました。15分以内にメール内のリンクを開いてください。";
    } catch (error) {
      console.error("Could not request teacher email verification.", error);
      teacherEmailStatus.textContent = `確認メールを送れませんでした: ${error.message}`;
    } finally {
      teacherEmailButton.disabled = false;
    }
  }

  async function requestOwnerRecovery() {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(roomCode)) {
      recoveryStatus.textContent = "復旧する部屋の6文字のコードを入力してください。";
      roomCodeInput.focus();
      return;
    }

    recoveryButton.disabled = true;
    recoveryStatus.textContent = "";
    try {
      await requestJson(`/api/rooms/${roomCode}/recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: getReturnUrl() }),
      });
      recoveryStatus.textContent = "登録済みの教員メールがある場合、復旧リンクを送信しました。受信まで少しお待ちください。";
    } catch (error) {
      console.error("Could not request teacher recovery.", error);
      recoveryStatus.textContent = `復旧メールを要求できませんでした: ${error.message}`;
    } finally {
      recoveryButton.disabled = false;
    }
  }

  function prepareEmailAction() {
    const match = window.location.hash.match(/^#(verify-email|recover)=([A-Za-z0-9_-]{32,64})$/);
    if (!match) return;
    selectWorkspaceTab("rooms");
    const roomCode = new URL(window.location.href).searchParams.get("room")?.toUpperCase() || "";
    window.history?.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (!ROOM_CODE_PATTERN.test(roomCode)) {
      setStatus("メール内リンクに部屋コードがありません。最初からやり直してください。", "error");
      return;
    }
    pendingEmailAction = { action: match[1], roomCode, token: match[2] };
    emailAction.hidden = false;
    emailActionStatus.textContent = "";
    emailActionMessage.textContent = match[1] === "verify-email"
      ? "教員メールアドレスを確認します。続行するとこのリンクを使用します。"
      : "教員管理権限を復旧します。続行するとこの一回限りのリンクを使用します。";
    setStatus("メールのリンクを確認してください。", "idle");
  }

  async function completeEmailAction() {
    if (!pendingEmailAction) return;
    const { action, roomCode, token } = pendingEmailAction;
    confirmEmailActionButton.disabled = true;
    cancelEmailActionButton.disabled = true;
    emailActionStatus.textContent = "";
    try {
      if (action === "verify-email") {
        await requestJson(`/api/rooms/${roomCode}/teacher-email/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        pendingEmailAction = null;
        emailAction.hidden = true;
        setStatus("教員メールアドレスを確認しました。このブラウザーの作成者権限は維持されています。", "connected");
        return;
      }

      const result = await requestJson(`/api/rooms/${roomCode}/recovery/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (typeof result.ownerToken !== "string") throw new Error("復旧応答に作成者権限がありません");
      saveOwnerSession(roomCode, result.ownerToken);
      pendingEmailAction = null;
      emailAction.hidden = true;
      connectToRoom(roomCode);
      setStatus("教員管理権限を復旧しました。", "connected");
    } catch (error) {
      console.error("Could not complete the room recovery link.", error);
      emailActionStatus.textContent = `リンクを処理できませんでした: ${error.message}`;
    } finally {
      confirmEmailActionButton.disabled = false;
      cancelEmailActionButton.disabled = false;
    }
  }

  function cancelEmailAction() {
    pendingEmailAction = null;
    emailAction.hidden = true;
    emailActionMessage.textContent = "";
    emailActionStatus.textContent = "";
  }

  function setButtonsDisabled(disabled) {
    createButton.disabled = disabled;
    joinButton.disabled = disabled;
    endClassButton.disabled = disabled;
    closeButton.disabled = disabled;
    recoveryButton.disabled = disabled;
    teacherEmailButton.disabled = disabled;
    saveWorkNameButton.disabled = disabled;
    createBackupButton.disabled = disabled;
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
  endClassButton.addEventListener("click", endClass);
  closeButton.addEventListener("click", closeRoom);
  saveWorkNameButton.addEventListener("click", saveWorkName);
  createBackupButton.addEventListener("click", createBackup);
  recoveryButton.addEventListener("click", requestOwnerRecovery);
  teacherEmailButton.addEventListener("click", registerTeacherEmail);
  confirmEmailActionButton.addEventListener("click", completeEmailAction);
  cancelEmailActionButton.addEventListener("click", cancelEmailAction);
  buildTab.addEventListener("click", () => selectWorkspaceTab("build"));
  roomTab.addEventListener("click", () => selectWorkspaceTab("rooms"));
  buildTab.addEventListener("keydown", handleWorkspaceTabKeydown);
  roomTab.addEventListener("keydown", handleWorkspaceTabKeydown);
  selectWorkspaceTab("build");
  window.addEventListener("moneycraft:send-player-state", sendPlayerState);
  window.addEventListener("focus", () => refreshSavedAppearance());
  window.addEventListener("pageshow", () => refreshSavedAppearance());
  window.addEventListener("storage", (event) => {
    if (event.key === avatar.storageKey || event.key === null) refreshSavedAppearance();
  });
  refreshSavedAppearance();
  window.addEventListener("moneycraft:send-block-edit", (event) => sendWorldMessage("block-edit", event.detail));
  window.addEventListener("moneycraft:request-world", () => sendWorldMessage("world-request", null));
  window.addEventListener("moneycraft:world-protocol-error", () => {
    worldReady = false;
    setStatus("共有ワールドの通信形式が正しくありません。再参加してください。", "error");
    activeSocket?.close(4002, "Invalid world message");
  });

  const ownerSession = readOwnerSession();
  if (ownerSession) {
    currentRoomCode = ownerSession.roomCode;
    roomCodeInput.value = ownerSession.roomCode;
    isRoomOwner = true;
    updateRoomDetails();
    setStatus("作成者用の終了権限があります。コードを共有して参加者を招待できます。");
  }
  const invitedRoom = new URL(window.location.href).searchParams.get("room");
  if (invitedRoom !== null) {
    const code = invitedRoom.trim().toUpperCase();
    if (ROOM_CODE_PATTERN.test(code)) {
      roomCodeInput.value = code;
      selectWorkspaceTab("rooms");
      setStatus(`招待された部屋 ${code} に入るには「参加する」を押してください。`);
    } else {
      setStatus("参加用リンクの部屋コードが正しくありません。6文字のコードを確認してください。", "error");
    }
  }
  prepareEmailAction();
})();
