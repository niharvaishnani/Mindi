// ======================== MULTIPLAYER MODULE ========================
const Multiplayer = (() => {
  'use strict';

  // ---- Local multiplayer state ----
  let roomRef = null;
  let roomCode = null;
  let playerId = null;
  let isHost = false;
  let listeners = [];
  let heartbeatInterval = null;

  const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  // ---- Helpers ----
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function generatePlayerId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function addListener(ref, event, cb) {
    ref.on(event, cb);
    listeners.push({ ref, event, cb });
  }

  function removeAllListeners() {
    listeners.forEach(({ ref, event, cb }) => {
      ref.off(event, cb);
    });
    listeners = [];
  }

  // ---- Room Management ----
  async function createRoom(playerName) {
    const code = generateRoomCode();
    playerId = generatePlayerId();
    isHost = true;
    roomCode = code;
    roomRef = db.ref('rooms/' + code);

    try {
      // Try with a timeout so it doesn't hang forever if database URL is wrong
      const snap = await Promise.race([
        roomRef.once('value'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
      ]);
      
      if (snap.exists()) {
        return createRoom(playerName);
      }
    } catch (e) {
      if (e.message === 'TIMEOUT') {
        throw new Error('Connection timed out. Did you create the Realtime Database in your Firebase console?');
      }
      if (e.message && e.message.toLowerCase().includes('permission')) {
        throw new Error('Permission denied. Please set your Firebase Realtime Database rules to Test Mode (allow read/write).');
      }
      throw e;
    }

    const roomData = {
      host: playerId,
      status: 'waiting',
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      settings: {
        timerEnabled: true,
        maxNumber: 35
      },
      players: {
        [playerId]: {
          name: playerName,
          avatar: '',
          order: 0,
          secretNumber: null,
          secretReady: false,
          safe: false,
          eliminated: false,
          connected: true
        }
      }
    };

    try {
      await roomRef.set(roomData);
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('permission')) {
        throw new Error('Permission denied. Please set your Firebase Realtime Database rules to Test Mode (allow read/write).');
      }
      throw e;
    }

    // Presence: auto-remove on disconnect
    setupPresence();
    startHeartbeat();

    return { code, playerId };
  }

  async function joinRoom(code, playerName) {
    code = code.toUpperCase().trim();
    roomCode = code;
    roomRef = db.ref('rooms/' + code);

    let snap;
    try {
      snap = await Promise.race([
        roomRef.once('value'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
      ]);
    } catch (e) {
      if (e.message === 'TIMEOUT') {
        throw new Error('Connection timed out. Did you create the Realtime Database in your Firebase console?');
      }
      if (e.message && e.message.toLowerCase().includes('permission')) {
        throw new Error('Permission denied. Please set your Firebase Realtime Database rules to Test Mode (allow read/write).');
      }
      throw e;
    }

    if (!snap.exists()) {
      throw new Error('Room not found. Check the code and try again.');
    }

    const room = snap.val();

    if (room.status !== 'waiting') {
      throw new Error('Game already in progress. Cannot join.');
    }

    const players = room.players || {};
    const playerCount = Object.keys(players).length;

    if (playerCount >= 10) {
      throw new Error('Room is full (max 10 players).');
    }

    // Check for duplicate names
    const names = Object.values(players).map(p => p.name.toLowerCase());
    if (names.includes(playerName.toLowerCase().trim())) {
      throw new Error('That name is already taken. Choose another.');
    }

    playerId = generatePlayerId();
    isHost = false;

    try {
      await roomRef.child('players/' + playerId).set({
        name: playerName.trim(),
        avatar: '',
        order: playerCount,
        secretNumber: null,
        secretReady: false,
        safe: false,
        eliminated: false,
        connected: true
      });
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('permission')) {
        throw new Error('Permission denied. Please set your Firebase Realtime Database rules to Test Mode (allow read/write).');
      }
      throw e;
    }

    setupPresence();
    startHeartbeat();

    return { code, playerId };
  }

  async function leaveRoom() {
    stopHeartbeat();
    removeAllListeners();

    if (roomRef && playerId) {
      if (isHost) {
        // Host leaving — destroy room
        await roomRef.remove();
      } else {
        await roomRef.child('players/' + playerId).remove();
      }
    }

    roomRef = null;
    roomCode = null;
    playerId = null;
    isHost = false;
  }

  function setupPresence() {
    if (!roomRef || !playerId) return;

    const connRef = db.ref('.info/connected');
    const playerRef = roomRef.child('players/' + playerId);

    addListener(connRef, 'value', (snap) => {
      if (snap.val() === true) {
        playerRef.child('connected').set(true);
        // On disconnect, mark as disconnected
        playerRef.child('connected').onDisconnect().set(false);

        if (isHost) {
          // If host disconnects, clear room after grace period
          roomRef.onDisconnect().cancel(); // let heartbeat handle it
        }
      }
    });
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      if (roomRef && playerId) {
        roomRef.child('players/' + playerId + '/lastSeen')
          .set(firebase.database.ServerValue.TIMESTAMP);
      }
    }, 15000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  // ---- Update room settings (host only) ----
  async function updateSettings(settings) {
    if (!isHost || !roomRef) return;
    await roomRef.child('settings').update(settings);
  }

  // ---- Player Listeners ----
  function onPlayersChange(callback) {
    if (!roomRef) return;
    addListener(roomRef.child('players'), 'value', (snap) => {
      const players = snap.val() || {};
      callback(players);
    });
  }

  function onRoomChange(callback) {
    if (!roomRef) return;
    addListener(roomRef, 'value', (snap) => {
      const room = snap.val();
      if (!room) {
        callback(null);
        return;
      }
      callback(room);
    });
  }

  function onStatusChange(callback) {
    if (!roomRef) return;
    addListener(roomRef.child('status'), 'value', (snap) => {
      callback(snap.val());
    });
  }

  // ---- Host: Start the game (move to selection phase) ----
  async function hostStartGame(playerOrder, avatarMap) {
    if (!isHost || !roomRef) return;

    // Assign avatars and order
    const updates = {};
    playerOrder.forEach((pid, idx) => {
      updates[`players/${pid}/order`] = idx;
      updates[`players/${pid}/avatar`] = avatarMap[pid] || '';
      updates[`players/${pid}/secretNumber`] = null;
      updates[`players/${pid}/secretReady`] = false;
      updates[`players/${pid}/safe`] = false;
      updates[`players/${pid}/eliminated`] = false;
    });
    updates['status'] = 'selecting';
    updates['gameState'] = {
      currentTurnPlayerId: playerOrder[0],
      currentPlayerIdx: 0,
      removedNumbers: [],
      playerOrder: playerOrder
    };
    await roomRef.update(updates);
  }

  // ---- Secret Number Selection ----
  async function submitSecretNumber(number) {
    if (!roomRef || !playerId) return;
    // We store the secret number. In a production app you'd want encryption,
    // but for a fun party game with friends we rely on Firebase rules to prevent reading other players' secrets.
    await roomRef.child('players/' + playerId).update({
      secretNumber: number,
      secretReady: true
    });
  }

  function onAllSecretsReady(callback) {
    if (!roomRef) return;
    addListener(roomRef.child('players'), 'value', (snap) => {
      const players = snap.val() || {};
      const allIds = Object.keys(players);
      const allReady = allIds.length > 0 && allIds.every(id => players[id].secretReady === true);
      callback(allReady, players);
    });
  }

  // ---- Host: Transition to gameplay ----
  async function hostStartPlaying() {
    if (!isHost || !roomRef) return;
    await roomRef.child('status').set('playing');
  }

  // ---- Turn Actions ----
  async function submitTurnAction(number) {
    if (!roomRef || !playerId) return;
    await roomRef.child('turnAction').set({
      playerId: playerId,
      number: number,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function onTurnAction(callback) {
    if (!roomRef) return;
    // Listen only for new actions
    addListener(roomRef.child('turnAction'), 'value', (snap) => {
      const action = snap.val();
      if (action && action.number != null) {
        callback(action);
      }
    });
  }

  // ---- Game State Sync (host pushes authoritative state) ----
  async function pushGameState(gameState) {
    if (!roomRef) return;
    await roomRef.child('gameState').set(gameState);
  }

  async function pushPlayerStates(playerStates) {
    if (!roomRef) return;
    const updates = {};
    Object.entries(playerStates).forEach(([pid, pState]) => {
      Object.entries(pState).forEach(([key, val]) => {
        updates[`players/${pid}/${key}`] = val;
      });
    });
    await roomRef.update(updates);
  }

  function onGameStateChange(callback) {
    if (!roomRef) return;
    addListener(roomRef.child('gameState'), 'value', (snap) => {
      const gs = snap.val();
      if (gs) callback(gs);
    });
  }

  // ---- Host: End Game ----
  async function hostEndGame() {
    if (!roomRef) return;
    await roomRef.child('status').set('finished');
  }

  // ---- Host: Return to waiting ----
  async function hostReturnToWaiting() {
    if (!isHost || !roomRef) return;

    const snap = await roomRef.child('players').once('value');
    const players = snap.val() || {};
    const updates = {};

    Object.keys(players).forEach(pid => {
      updates[`players/${pid}/secretNumber`] = null;
      updates[`players/${pid}/secretReady`] = false;
      updates[`players/${pid}/safe`] = false;
      updates[`players/${pid}/eliminated`] = false;
    });
    updates['status'] = 'waiting';
    updates['gameState'] = null;
    updates['turnAction'] = null;

    await roomRef.update(updates);
  }

  // ---- Clear turn action (host calls after processing) ----
  async function clearTurnAction() {
    if (!roomRef) return;
    await roomRef.child('turnAction').remove();
  }

  // ---- Getters ----
  function getRoomCode() { return roomCode; }
  function getPlayerId() { return playerId; }
  function getIsHost() { return isHost; }
  function getRoomRef() { return roomRef; }

  // ---- Cleanup ----
  function destroy() {
    stopHeartbeat();
    removeAllListeners();
    roomRef = null;
    roomCode = null;
    playerId = null;
    isHost = false;
  }

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    updateSettings,
    onPlayersChange,
    onRoomChange,
    onStatusChange,
    hostStartGame,
    submitSecretNumber,
    onAllSecretsReady,
    hostStartPlaying,
    submitTurnAction,
    onTurnAction,
    clearTurnAction,
    pushGameState,
    pushPlayerStates,
    onGameStateChange,
    hostEndGame,
    hostReturnToWaiting,
    getRoomCode,
    getPlayerId,
    getIsHost,
    getRoomRef,
    destroy,
    generateRoomCode
  };
})();
