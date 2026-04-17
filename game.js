// ======================== SECRET NUMBER SURVIVAL ========================
(() => {
  'use strict';

  // ======================== STATE ========================
  const state = {
    players: [],
    numbers: [],
    removedNumbers: [],
    currentPlayerIdx: 0,
    maxNumber: 0,
    timerEnabled: true,
    soundEnabled: true,
    timerInterval: null,
    timerValue: 10,
    selectingPlayerIdx: 0,
    phase: 'lobby',
    // Multiplayer additions
    gameMode: 'local',        // 'local' | 'online'
    myPlayerId: null,
    roomCode: null,
    onlinePlayers: {},        // { playerId: { name, avatar, order, ... } }
    playerOrder: [],          // ordered player IDs for online
    isProcessingAction: false
  };

  const AVATARS = ['🟣', '🔵', '🟢', '🟠', '🔴', '🟡', '⚪', '🟤', '🩵', '🩷'];
  const TIMER_DURATION = 10;
  const CIRCUMFERENCE = 2 * Math.PI * 26;

  // ======================== SOUND ENGINE ========================
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, duration, type = 'sine', vol = 0.15, delay = 0) {
    if (!state.soundEnabled) return;
    ensureAudio();
    const t = audioCtx.currentTime + delay;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + duration);
  }

  function playChord(notes, dur, type = 'sine', vol = 0.08) {
    notes.forEach(f => playTone(f, dur, type, vol));
  }

  const sfxClick = () => { playTone(800,0.06,'sine',0.1); playTone(1200,0.04,'sine',0.05); };
  const sfxSelect = () => { playTone(660,0.12,'sine',0.12); playTone(880,0.12,'sine',0.1,0.06); playTone(1100,0.15,'sine',0.08,0.12); };
  const sfxRemove = () => { playTone(400,0.15,'sawtooth',0.06); playTone(250,0.2,'triangle',0.08,0.05); };
  const sfxSafe = () => { playTone(523,0.15,'sine',0.15); playTone(659,0.15,'sine',0.14,0.12); playTone(784,0.25,'sine',0.13,0.24); playTone(1047,0.3,'sine',0.1,0.36); };
  const sfxBothSafe = () => { playTone(523,0.1,'triangle',0.15); playTone(659,0.1,'triangle',0.15,0.08); playTone(784,0.1,'triangle',0.15,0.16); playTone(1047,0.35,'triangle',0.15,0.24); playTone(1568,0.4,'sine',0.06,0.32); playTone(2093,0.5,'sine',0.04,0.4); };
  const sfxLose = () => { playTone(300,0.3,'sawtooth',0.08); playTone(200,0.4,'sawtooth',0.06,0.1); playTone(150,0.5,'sawtooth',0.05,0.25); playTone(100,0.6,'sawtooth',0.04,0.4); };
  const sfxTick = () => playTone(1000,0.03,'sine',0.05);
  const sfxTimerWarn = () => { playTone(800,0.06,'square',0.08); playTone(900,0.06,'square',0.06,0.06); };
  const sfxTurnChange = () => { playTone(500,0.08,'sine',0.06); playTone(700,0.1,'sine',0.08,0.04); };
  function sfxVictoryFanfare() {
    [523,587,659,784,880,1047].forEach((f,i) => { playTone(f,0.2,'sine',0.1,i*0.08); playTone(f*1.5,0.15,'sine',0.05,i*0.08+0.02); });
    setTimeout(() => playChord([523,659,784,1047],0.8,'sine',0.06), 600);
  }
  const sfxGameStart = () => { playTone(440,0.1,'sine',0.1); playTone(554,0.1,'sine',0.1,0.1); playTone(659,0.1,'sine',0.1,0.2); playTone(880,0.2,'sine',0.12,0.3); };

  // ======================== PARTICLES ========================
  const particleCanvas = document.getElementById('particle-canvas');
  const pCtx = particleCanvas ? particleCanvas.getContext('2d') : null;
  let particles = [];

  function initParticles() {
    if (!particleCanvas || !pCtx) return;
    const resize = () => { particleCanvas.width = window.innerWidth; particleCanvas.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    for (let i = 0; i < 40; i++) {
      particles.push({ x: Math.random()*particleCanvas.width, y: Math.random()*particleCanvas.height,
        vx: (Math.random()-0.5)*0.3, vy: (Math.random()-0.5)*0.3, size: Math.random()*2+0.5,
        opacity: Math.random()*0.3+0.1, hue: Math.random()*60+240 });
    }
    (function animate() {
      pCtx.clearRect(0,0,particleCanvas.width,particleCanvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if(p.x<0) p.x=particleCanvas.width; if(p.x>particleCanvas.width) p.x=0;
        if(p.y<0) p.y=particleCanvas.height; if(p.y>particleCanvas.height) p.y=0;
        pCtx.beginPath(); pCtx.arc(p.x,p.y,p.size,0,Math.PI*2);
        pCtx.fillStyle = `hsla(${p.hue},70%,70%,${p.opacity})`; pCtx.fill();
      });
      requestAnimationFrame(animate);
    })();
  }

  // ======================== CELEBRATION ========================
  let celebrationParticles = [], celebAnimId = null;
  const celebCanvas = document.getElementById('celebration-canvas');
  const cCtx = celebCanvas ? celebCanvas.getContext('2d') : null;

  function startCelebration() {
    if (!celebCanvas || !cCtx) return;
    celebCanvas.width = window.innerWidth; celebCanvas.height = window.innerHeight;
    celebrationParticles = [];
    const colors = ['#7c5cfc','#ff6bca','#00e5a0','#ffb830','#00c9db','#ffd700','#e040fb','#ff5252'];
    for (let i = 0; i < 120; i++) {
      const a = (Math.PI*2*i)/120+(Math.random()-0.5)*0.5, s = 2+Math.random()*6;
      celebrationParticles.push({ x:celebCanvas.width/2, y:celebCanvas.height/2, vx:Math.cos(a)*s, vy:Math.sin(a)*s-2,
        size:3+Math.random()*5, color:colors[Math.floor(Math.random()*colors.length)],
        life:1, decay:0.005+Math.random()*0.01, gravity:0.04+Math.random()*0.02,
        rotation:Math.random()*360, rotationSpeed:(Math.random()-0.5)*10 });
    }
    (function anim() {
      cCtx.clearRect(0,0,celebCanvas.width,celebCanvas.height);
      let alive = false;
      celebrationParticles.forEach(p => {
        if(p.life<=0) return; alive=true;
        p.x+=p.vx; p.y+=p.vy; p.vy+=p.gravity; p.vx*=0.99; p.life-=p.decay; p.rotation+=p.rotationSpeed;
        cCtx.save(); cCtx.translate(p.x,p.y); cCtx.rotate(p.rotation*Math.PI/180);
        cCtx.globalAlpha=Math.max(0,p.life); cCtx.fillStyle=p.color;
        cCtx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6); cCtx.restore();
      });
      if(alive) celebAnimId = requestAnimationFrame(anim);
    })();
  }

  function stopCelebration() {
    if(celebAnimId) { cancelAnimationFrame(celebAnimId); celebAnimId=null; }
    if(cCtx&&celebCanvas) cCtx.clearRect(0,0,celebCanvas.width,celebCanvas.height);
    celebrationParticles = [];
  }

  // ======================== DOM REFS ========================
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  const DOM = {
    screens: { lobby:$('#screen-lobby'), roomLobby:$('#screen-room-lobby'), select:$('#screen-select'), game:$('#screen-game'), result:$('#screen-result') },
    lobby: {
      modeSelection:$('#mode-selection'), localSetup:$('#local-setup'), onlineSetup:$('#online-setup'),
      playerInputs:$('#player-inputs'), btnAdd:$('#btn-add-player'), btnStart:$('#btn-start'),
      error:$('#lobby-error'), toggleTimer:$('#toggle-timer'), toggleSound:$('#toggle-sound'),
      btnModeLocal:$('#btn-mode-local'), btnModeOnline:$('#btn-mode-online'),
      btnBackLocal:$('#btn-back-to-modes'), btnBackOnline:$('#btn-back-to-modes-online'),
      onlineName:$('#online-player-name'), btnCreate:$('#btn-create-room'),
      joinCode:$('#join-room-code'), btnJoin:$('#btn-join-room'), onlineError:$('#online-error')
    },
    room: {
      codeDisplay:$('#room-code-display'), btnCopy:$('#btn-copy-code'),
      playerList:$('#room-player-list'), playerCount:$('#room-player-count'),
      hostSettings:$('#room-host-settings'), btnStart:$('#btn-room-start'),
      waitingMsg:$('#room-waiting-msg'), btnLeave:$('#btn-leave-room'),
      toggleTimer:$('#room-toggle-timer'), toggleSound:$('#room-toggle-sound'),
      connStatus:$('#connection-status')
    },
    select: {
      instruction:$('#select-instruction'), avatar:$('#select-avatar'), playerName:$('#select-player-name'),
      grid:$('#select-grid'), btnConfirm:$('#btn-confirm-select'), passOverlay:$('#pass-device-overlay'),
      passText:$('#pass-text'), passNextName:$('#pass-next-name'), btnPassReady:$('#btn-pass-ready'),
      onlineWaiting:$('#online-select-waiting'), selectProgress:$('#select-progress')
    },
    game: {
      playerList:$('#player-list'), turnName:$('#turn-player-name'), timerCont:$('#timer-container'),
      timerProgress:$('#timer-progress'), timerText:$('#timer-text'), grid:$('#game-grid'),
      removedList:$('#removed-list'), instruction:$('#game-instruction'),
      notYourTurn:$('#not-your-turn'), nytText:$('#nyt-text')
    },
    result: { icon:$('#result-icon'), title:$('#result-title'), message:$('#result-message'), players:$('#result-players'), btnAgain:$('#btn-play-again') },
    safeNotif:$('#safe-notification'), safeText:$('#safe-text'),
    bothSafeNotif:$('#both-safe-notification'), bothSafeText:$('#both-safe-text'),
    selfElimNotif:$('#self-elim-notification'), selfElimText:$('#self-elim-text'), selfElimSub:$('#self-elim-sub')
  };

  // ======================== SCREEN MANAGEMENT ========================
  function showScreen(name) {
    Object.values(DOM.screens).forEach(s => s.classList.remove('active'));
    DOM.screens[name].classList.add('active');
    state.phase = name;
  }

  // ======================== LOBBY – MODE SELECTION ========================
  function initLobby() {
    DOM.lobby.btnModeLocal.addEventListener('click', () => { sfxClick(); showLocalSetup(); });
    DOM.lobby.btnModeOnline.addEventListener('click', () => { sfxClick(); showOnlineSetup(); });
    DOM.lobby.btnBackLocal.addEventListener('click', () => { sfxClick(); showModeSelection(); });
    DOM.lobby.btnBackOnline.addEventListener('click', () => { sfxClick(); showModeSelection(); });

    // Local setup
    DOM.lobby.btnAdd.addEventListener('click', () => {
      const rows = DOM.lobby.playerInputs.querySelectorAll('.input-row');
      if (rows.length >= 10) return;
      sfxClick(); addPlayerInputRow(rows.length); updateRemoveButtons();
    });
    DOM.lobby.btnStart.addEventListener('click', startLocalGame);
    DOM.lobby.toggleTimer.addEventListener('change', e => { state.timerEnabled = e.target.checked; });
    DOM.lobby.toggleSound.addEventListener('change', e => { state.soundEnabled = e.target.checked; });
    updateRemoveButtons();

    // Online setup
    DOM.lobby.btnCreate.addEventListener('click', handleCreateRoom);
    DOM.lobby.btnJoin.addEventListener('click', handleJoinRoom);
    DOM.lobby.joinCode.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''); });

    // Room lobby
    DOM.room.btnCopy.addEventListener('click', copyRoomCode);
    DOM.room.btnLeave.addEventListener('click', handleLeaveRoom);
    DOM.room.btnStart.addEventListener('click', handleRoomStart);
    if (DOM.room.toggleTimer) DOM.room.toggleTimer.addEventListener('change', e => {
      state.timerEnabled = e.target.checked;
      if (Multiplayer.getIsHost()) Multiplayer.updateSettings({ timerEnabled: e.target.checked });
    });
    if (DOM.room.toggleSound) DOM.room.toggleSound.addEventListener('change', e => { state.soundEnabled = e.target.checked; });
  }

  function showModeSelection() {
    DOM.lobby.modeSelection.style.display = '';
    DOM.lobby.localSetup.style.display = 'none';
    DOM.lobby.onlineSetup.style.display = 'none';
  }
  function showLocalSetup() {
    state.gameMode = 'local';
    DOM.lobby.modeSelection.style.display = 'none';
    DOM.lobby.localSetup.style.display = '';
    DOM.lobby.onlineSetup.style.display = 'none';
  }
  function showOnlineSetup() {
    state.gameMode = 'online';
    DOM.lobby.modeSelection.style.display = 'none';
    DOM.lobby.localSetup.style.display = 'none';
    DOM.lobby.onlineSetup.style.display = '';
    DOM.lobby.onlineError.textContent = '';
  }

  // ======================== LOCAL LOBBY (existing) ========================
  function addPlayerInputRow(index) {
    const row = document.createElement('div');
    row.className = 'input-row'; row.dataset.index = index;
    row.style.animationDelay = `${index*0.05}s`;
    row.innerHTML = `<span class="input-icon">👤</span>
      <input type="text" class="player-name-input" placeholder="Player ${index+1}" maxlength="16" autocomplete="off">
      <button class="btn-remove-player" title="Remove player">✕</button>`;
    DOM.lobby.playerInputs.appendChild(row);
    row.querySelector('.btn-remove-player').addEventListener('click', () => {
      sfxClick(); row.style.opacity='0'; row.style.transform='translateX(20px) scale(0.95)'; row.style.transition='all 0.3s ease';
      setTimeout(() => { row.remove(); reindexPlayerInputs(); updateRemoveButtons(); }, 300);
    });
    setTimeout(() => row.querySelector('.player-name-input').focus(), 50);
  }

  function reindexPlayerInputs() {
    DOM.lobby.playerInputs.querySelectorAll('.input-row').forEach((r,i) => {
      r.dataset.index = i;
      const inp = r.querySelector('.player-name-input');
      if (!inp.value) inp.placeholder = `Player ${i+1}`;
    });
  }

  function updateRemoveButtons() {
    const rows = DOM.lobby.playerInputs.querySelectorAll('.input-row');
    rows.forEach(r => { r.querySelector('.btn-remove-player').style.visibility = rows.length > 2 ? 'visible' : 'hidden'; });
    DOM.lobby.btnAdd.style.display = rows.length >= 10 ? 'none' : '';
  }

  function startLocalGame() {
    const inputs = DOM.lobby.playerInputs.querySelectorAll('.player-name-input');
    const names = [];
    inputs.forEach((inp,i) => names.push(inp.value.trim() || `Player ${i+1}`));
    if (names.length < 2) { DOM.lobby.error.textContent = 'Need at least 2 players!'; return; }
    if (new Set(names).size !== names.length) { DOM.lobby.error.textContent = 'Player names must be unique!'; return; }
    DOM.lobby.error.textContent = '';
    sfxGameStart();
    state.maxNumber = 35;
    state.numbers = Array.from({length:state.maxNumber},(_,i)=>i+1);
    state.removedNumbers = [];
    state.players = names.map((name,i) => ({ name, avatar:AVATARS[i], secretNumber:null, safe:false, eliminated:false }));
    state.selectingPlayerIdx = 0;
    showScreen('select');
    setupSecretSelection();
  }

  // ======================== ONLINE LOBBY ========================
  async function handleCreateRoom() {
    if (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey === 'YOUR_API_KEY') {
      DOM.lobby.onlineError.textContent = 'Setup required: Please enter your Firebase project credentials in firebase-config.js';
      return;
    }

    const name = DOM.lobby.onlineName.value.trim();
    if (!name) { DOM.lobby.onlineError.textContent = 'Please enter your name.'; return; }
    DOM.lobby.onlineError.textContent = '';
    DOM.lobby.btnCreate.disabled = true;
    try {
      const { code, playerId } = await Multiplayer.createRoom(name);
      state.myPlayerId = playerId;
      state.roomCode = code;
      state.gameMode = 'online';
      enterRoomLobby(true);
    } catch (e) {
      DOM.lobby.onlineError.textContent = e.message || 'Failed to create room.';
    }
    DOM.lobby.btnCreate.disabled = false;
  }

  async function handleJoinRoom() {
    if (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey === 'YOUR_API_KEY') {
      DOM.lobby.onlineError.textContent = 'Setup required: Please enter your Firebase project credentials in firebase-config.js';
      return;
    }

    const name = DOM.lobby.onlineName.value.trim();
    const code = DOM.lobby.joinCode.value.trim();
    if (!name) { DOM.lobby.onlineError.textContent = 'Please enter your name.'; return; }
    if (!code || code.length < 4) { DOM.lobby.onlineError.textContent = 'Please enter a valid room code.'; return; }
    DOM.lobby.onlineError.textContent = '';
    DOM.lobby.btnJoin.disabled = true;
    try {
      const { playerId } = await Multiplayer.joinRoom(code, name);
      state.myPlayerId = playerId;
      state.roomCode = code;
      state.gameMode = 'online';
      enterRoomLobby(false);
    } catch (e) {
      DOM.lobby.onlineError.textContent = e.message || 'Failed to join room.';
    }
    DOM.lobby.btnJoin.disabled = false;
  }

  function enterRoomLobby(asHost) {
    showScreen('roomLobby');
    DOM.room.codeDisplay.textContent = state.roomCode;

    if (asHost) {
      DOM.room.hostSettings.style.display = '';
      DOM.room.btnStart.style.display = '';
      DOM.room.waitingMsg.style.display = 'none';
    } else {
      DOM.room.hostSettings.style.display = 'none';
      DOM.room.btnStart.style.display = 'none';
      DOM.room.waitingMsg.style.display = '';
    }

    // Listen for player changes
    Multiplayer.onPlayersChange(players => {
      state.onlinePlayers = players;
      renderRoomPlayers(players);
      const count = Object.keys(players).length;
      DOM.room.playerCount.textContent = `${count}/10`;
      if (asHost) DOM.room.btnStart.disabled = count < 2;
    });

    // Listen for status changes
    Multiplayer.onStatusChange(status => {
      if (status === 'selecting') {
        startOnlineSecretSelection();
      } else if (status === 'playing') {
        startOnlineGameplay();
      } else if (status === 'finished') {
        // Result handled via game state
      } else if (status === null) {
        // Room destroyed
        alert('Room was closed by the host.');
        resetToLobby();
      }
    });
  }

  function renderRoomPlayers(players) {
    DOM.room.playerList.innerHTML = '';
    const sorted = Object.entries(players).sort((a,b) => a[1].order - b[1].order);
    sorted.forEach(([pid, p], i) => {
      const li = document.createElement('li');
      li.className = 'room-player-item';
      const isMe = pid === state.myPlayerId;
      const isRoomHost = Multiplayer.getIsHost() && pid === state.myPlayerId || (!Multiplayer.getIsHost() && i === 0);
      li.innerHTML = `
        <span class="room-player-avatar">${AVATARS[i]}</span>
        <span class="room-player-name">${p.name}${isMe ? ' (You)' : ''}</span>
        ${i === 0 ? '<span class="host-badge">HOST</span>' : ''}
        <span class="conn-dot ${p.connected ? 'connected' : 'disconnected'}"></span>`;
      DOM.room.playerList.appendChild(li);
    });
  }

  function copyRoomCode() {
    navigator.clipboard.writeText(state.roomCode).then(() => {
      DOM.room.btnCopy.textContent = '✅ Copied!';
      setTimeout(() => DOM.room.btnCopy.textContent = '📋 Copy', 2000);
    }).catch(() => {});
  }

  async function handleLeaveRoom() {
    sfxClick();
    await Multiplayer.leaveRoom();
    resetToLobby();
  }

  function resetToLobby() {
    Multiplayer.destroy();
    state.gameMode = 'local';
    state.myPlayerId = null;
    state.roomCode = null;
    state.onlinePlayers = {};
    state.playerOrder = [];
    showScreen('lobby');
    showModeSelection();
  }

  async function handleRoomStart() {
    const players = state.onlinePlayers;
    const pids = Object.entries(players).sort((a,b)=>a[1].order-b[1].order).map(([pid])=>pid);
    if (pids.length < 2) return;

    const avatarMap = {};
    pids.forEach((pid,i) => avatarMap[pid] = AVATARS[i]);
    state.playerOrder = pids;

    sfxGameStart();
    await Multiplayer.hostStartGame(pids, avatarMap);
  }

  // ======================== SECRET SELECTION ========================
  let tempSelectedNumber = null;

  // --- LOCAL ---
  function setupSecretSelection() {
    const player = state.players[state.selectingPlayerIdx];
    tempSelectedNumber = null;
    DOM.select.avatar.textContent = player.avatar;
    DOM.select.playerName.textContent = player.name;
    DOM.select.instruction.textContent = `${player.name}, choose your secret number!`;
    DOM.select.btnConfirm.disabled = true;
    DOM.select.passOverlay.classList.add('hidden');
    DOM.select.onlineWaiting.style.display = 'none';
    DOM.select.avatar.style.animation = 'none'; DOM.select.avatar.offsetHeight; DOM.select.avatar.style.animation = '';
    renderSelectGrid();
  }

  // --- ONLINE ---
  function startOnlineSecretSelection() {
    showScreen('select');
    tempSelectedNumber = null;

    const players = state.onlinePlayers;
    const me = players[state.myPlayerId];
    if (!me) return;

    DOM.select.avatar.textContent = me.avatar || '🎭';
    DOM.select.playerName.textContent = me.name;
    DOM.select.instruction.textContent = `${me.name}, choose your secret number!`;
    DOM.select.btnConfirm.disabled = true;
    DOM.select.passOverlay.classList.add('hidden');
    DOM.select.onlineWaiting.style.display = 'none';

    state.maxNumber = 35;
    state.numbers = Array.from({length:state.maxNumber},(_,i)=>i+1);

    renderSelectGrid();

    DOM.select.btnConfirm.onclick = async () => {
      if (tempSelectedNumber === null) return;
      sfxSelect();
      await Multiplayer.submitSecretNumber(tempSelectedNumber);
      DOM.select.grid.style.display = 'none';
      DOM.select.btnConfirm.style.display = 'none';
      DOM.select.onlineWaiting.style.display = '';
      listenForAllReady();
    };
  }

  function listenForAllReady() {
    Multiplayer.onAllSecretsReady((allReady, players) => {
      // Update progress
      const total = Object.keys(players).length;
      const ready = Object.values(players).filter(p => p.secretReady).length;
      DOM.select.selectProgress.textContent = `${ready}/${total} players ready`;
      state.onlinePlayers = players;

      if (allReady && Multiplayer.getIsHost()) {
        setTimeout(() => Multiplayer.hostStartPlaying(), 1000);
      }
    });
  }

  // --- SHARED ---
  function renderSelectGrid() {
    DOM.select.grid.innerHTML = '';
    DOM.select.grid.style.display = '';
    DOM.select.btnConfirm.style.display = '';
    const nums = state.numbers || Array.from({length:35},(_,i)=>i+1);
    nums.forEach((num, i) => {
      const cell = document.createElement('div');
      cell.className = 'num-cell'; cell.textContent = num; cell.dataset.number = num;
      cell.style.animationDelay = `${i*0.015}s`;
      cell.addEventListener('click', () => onSelectNumber(num, cell));
      DOM.select.grid.appendChild(cell);
    });
    if (state.gameMode === 'local') DOM.select.btnConfirm.onclick = confirmLocalSelection;
  }

  function onSelectNumber(num, cell) {
    sfxClick();
    DOM.select.grid.querySelectorAll('.num-cell.selected').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    tempSelectedNumber = num;
    DOM.select.btnConfirm.disabled = false;
  }

  function confirmLocalSelection() {
    if (tempSelectedNumber === null) return;
    sfxSelect();
    state.players[state.selectingPlayerIdx].secretNumber = tempSelectedNumber;
    state.selectingPlayerIdx++;
    if (state.selectingPlayerIdx < state.players.length) {
      const next = state.players[state.selectingPlayerIdx];
      DOM.select.passOverlay.classList.remove('hidden');
      DOM.select.passText.textContent = 'Pass the device to the next player';
      DOM.select.passNextName.textContent = next.name;
      DOM.select.btnPassReady.onclick = () => { sfxClick(); setupSecretSelection(); };
    } else {
      startGameplay();
    }
  }

  // ======================== GAMEPLAY ========================
  function startGameplay() {
    state.currentPlayerIdx = 0;
    state.removedNumbers = [];
    showScreen('game');
    DOM.game.notYourTurn.style.display = 'none';
    renderPlayerList(); renderGameGrid(); updateTurn();
  }

  function startOnlineGameplay() {
    const players = state.onlinePlayers;
    const sorted = Object.entries(players).sort((a,b)=>a[1].order-b[1].order);
    state.playerOrder = sorted.map(([pid])=>pid);
    state.players = sorted.map(([pid,p]) => ({
      pid, name:p.name, avatar:p.avatar, secretNumber:p.secretNumber,
      safe:p.safe||false, eliminated:p.eliminated||false
    }));
    state.maxNumber = 35;
    state.numbers = Array.from({length:state.maxNumber},(_,i)=>i+1);
    state.removedNumbers = [];
    state.currentPlayerIdx = 0;

    showScreen('game');
    renderPlayerList(); renderGameGrid(); updateOnlineTurn();

    // Listen for game state changes from host
    Multiplayer.onGameStateChange(gs => {
      if (!gs) return;
      syncFromGameState(gs);
    });

    // Listen for turn actions
    Multiplayer.onTurnAction(action => {
      if (state.isProcessingAction) return;
      if (action && action.number != null) {
        const num = action.number;
        if (!state.removedNumbers.includes(num)) {
          state.isProcessingAction = true;
          processRemoveNumber(num, () => {
            state.isProcessingAction = false;
            if (Multiplayer.getIsHost()) {
              Multiplayer.clearTurnAction();
            }
          });
        }
      }
    });
  }

  function syncFromGameState(gs) {
    if (gs.playerStates) {
      state.players.forEach((p, i) => {
        const pid = state.playerOrder[i];
        if (gs.playerStates[pid]) {
          p.safe = gs.playerStates[pid].safe || false;
          p.eliminated = gs.playerStates[pid].eliminated || false;
        }
      });
    }
    if (gs.currentPlayerIdx !== undefined) state.currentPlayerIdx = gs.currentPlayerIdx;
    if (gs.removedNumbers) {
      gs.removedNumbers.forEach(n => {
        if (!state.removedNumbers.includes(n)) state.removedNumbers.push(n);
        const cell = $(`#game-cell-${n}`);
        if (cell && !cell.classList.contains('removed')) cell.classList.add('removed');
      });
    }
    updatePlayerList();
    updateOnlineTurn();

    if (gs.gameOver) {
      setTimeout(() => endGame(), 600);
    }
  }

  function updateOnlineTurn() {
    const player = state.players[state.currentPlayerIdx];
    if (!player) return;
    DOM.game.turnName.classList.remove('turn-name-animate');
    DOM.game.turnName.offsetHeight;
    DOM.game.turnName.textContent = player.name;
    DOM.game.turnName.classList.add('turn-name-animate');
    updatePlayerList();

    const myIdx = state.playerOrder.indexOf(state.myPlayerId);
    const isMyTurn = myIdx === state.currentPlayerIdx;

    if (isMyTurn) {
      DOM.game.notYourTurn.style.display = 'none';
      DOM.game.instruction.textContent = 'Your turn! Tap a number to remove it';
      enableGrid(true);
      resetTimer();
    } else {
      DOM.game.notYourTurn.style.display = '';
      DOM.game.nytText.textContent = `Waiting for ${player.name}'s move...`;
      DOM.game.instruction.textContent = `${player.name} is choosing...`;
      enableGrid(false);
      clearTimer();
    }
  }

  function enableGrid(enabled) {
    DOM.game.grid.style.pointerEvents = enabled ? 'auto' : 'none';
    DOM.game.grid.style.opacity = enabled ? '1' : '0.6';
  }

  function renderPlayerList() {
    DOM.game.playerList.innerHTML = '';
    state.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'player-item'; li.id = `player-item-${i}`;
      li.style.animationDelay = `${i*0.06}s`;
      li.innerHTML = `<span class="player-avatar-mini">${p.avatar}</span>
        <div class="player-info"><div class="player-item-name">${p.name}</div><div class="player-status">Active</div></div>`;
      DOM.game.playerList.appendChild(li);
    });
  }

  function updatePlayerList() {
    state.players.forEach((p, i) => {
      const li = $(`#player-item-${i}`);
      if (!li) return;
      li.classList.remove('active-turn','safe','eliminated','safe-animate');
      const status = li.querySelector('.player-status');
      if (p.safe) { li.classList.add('safe'); status.textContent = '🛡️ Safe'; }
      else if (p.eliminated) { li.classList.add('eliminated'); status.textContent = '💀 Eliminated'; }
      else { status.textContent = 'Active'; if (i === state.currentPlayerIdx) li.classList.add('active-turn'); }
    });
  }

  function renderGameGrid() {
    DOM.game.grid.innerHTML = ''; DOM.game.removedList.innerHTML = '';
    state.numbers.forEach((num, i) => {
      const cell = document.createElement('div');
      cell.className = 'num-cell'; cell.id = `game-cell-${num}`; cell.textContent = num;
      cell.dataset.number = num; cell.style.animationDelay = `${i*0.012}s`;
      if (state.removedNumbers.includes(num)) cell.classList.add('removed');
      else cell.addEventListener('click', () => handleCellClick(num));
      DOM.game.grid.appendChild(cell);
    });
  }

  function handleCellClick(num) {
    if (state.gameMode === 'online') {
      const myIdx = state.playerOrder.indexOf(state.myPlayerId);
      if (myIdx !== state.currentPlayerIdx) return;
      clearTimer();
      Multiplayer.submitTurnAction(num);
    } else {
      onRemoveNumber(num);
    }
  }

  function getActivePlayers() { return state.players.filter(p => !p.safe && !p.eliminated); }

  function advanceTurn() {
    const active = getActivePlayers();
    if (active.length <= 1) return;
    let next = (state.currentPlayerIdx + 1) % state.players.length;
    while (state.players[next].safe || state.players[next].eliminated) next = (next + 1) % state.players.length;
    state.currentPlayerIdx = next;
    sfxTurnChange();
    if (state.gameMode === 'online') {
      if (Multiplayer.getIsHost()) pushHostState();
      updateOnlineTurn();
    } else {
      updateTurn();
    }
  }

  function updateTurn() {
    const player = state.players[state.currentPlayerIdx];
    DOM.game.turnName.classList.remove('turn-name-animate');
    DOM.game.turnName.offsetHeight;
    DOM.game.turnName.textContent = player.name;
    DOM.game.turnName.classList.add('turn-name-animate');
    updatePlayerList(); resetTimer();
  }

  // ======================== REMOVE NUMBER ========================
  function processRemoveNumber(num, callback) {
    if (state.removedNumbers.includes(num)) { if(callback) callback(); return; }
    sfxRemove(); clearTimer();
    state.removedNumbers.push(num);
    const cell = $(`#game-cell-${num}`);
    const activePlayers = getActivePlayers();
    const currentPlayer = state.players[state.currentPlayerIdx];
    const matched = activePlayers.filter(p => p.secretNumber === num);

    if (currentPlayer.secretNumber === num && !currentPlayer.safe && !currentPlayer.eliminated) {
      cell.classList.add('removing'); sfxLose(); currentPlayer.eliminated = true;
      matched.filter(p => p !== currentPlayer).forEach(p => { p.safe = true; });
      addRemovedChip(num, false);
      setTimeout(() => {
        showSelfElimNotification(`${currentPlayer.name} picked their own number!`, `Number ${num} was your secret — you lose! 💀`);
        setTimeout(() => {
          hideSelfElimNotification(); cell.classList.add('removed'); updatePlayerList();
          if (Multiplayer.getIsHost && state.gameMode === 'online') pushHostState();
          const rem = getActivePlayers();
          if (rem.length <= 1) { setTimeout(() => endGame(), 600); }
          else if (checkAllSameNumberTrap()) handleAllSameTrap();
          else advanceTurn();
          if(callback) callback();
        }, 3000);
      }, 800);
      return;
    }

    if (matched.length > 0) {
      if (activePlayers.length === 2 && matched.length === 2) {
        cell.classList.add('safe-reveal'); sfxBothSafe();
        matched.forEach(p => { p.safe = true; }); updatePlayerList(); addRemovedChip(num, true);
        setTimeout(() => {
          showBothSafeNotification("Both players guessed the same number! Both are safe!");
          setTimeout(() => { hideBothSafeNotification(); setTimeout(() => endGame(), 500); if(callback) callback(); }, 3000);
        }, 800);
        return;
      }
      cell.classList.add('safe-reveal');
      matched.forEach(p => { p.safe = true; sfxSafe();
        const idx = state.players.indexOf(p); const li = $(`#player-item-${idx}`);
        if(li) setTimeout(() => { li.classList.add('safe','safe-animate'); li.querySelector('.player-status').textContent='🛡️ Safe'; }, 400);
      });
      showSafeNotification(`${matched.map(p=>p.name).join(' & ')} is SAFE! 🛡️`);
      addRemovedChip(num, true);
    } else {
      cell.classList.add('removing'); addRemovedChip(num, false);
    }

    setTimeout(() => {
      cell.classList.add('removed'); updatePlayerList();
      if (state.gameMode === 'online' && Multiplayer.getIsHost()) pushHostState();
      const rem = getActivePlayers();
      if (rem.length <= 1) setTimeout(() => endGame(), 600);
      else if (checkAllSameNumberTrap()) handleAllSameTrap();
      else advanceTurn();
      if(callback) callback();
    }, 700);
  }

  function onRemoveNumber(num) { processRemoveNumber(num); }

  function pushHostState() {
    if (!Multiplayer.getIsHost()) return;
    const playerStates = {};
    state.players.forEach((p,i) => {
      const pid = state.playerOrder[i];
      playerStates[pid] = { safe:p.safe, eliminated:p.eliminated };
    });
    Multiplayer.pushGameState({
      currentPlayerIdx: state.currentPlayerIdx,
      removedNumbers: state.removedNumbers,
      playerOrder: state.playerOrder,
      playerStates,
      gameOver: getActivePlayers().length <= 1 || state.players.every(p=>p.safe||p.eliminated)
    });
  }

  function addRemovedChip(num, wasSafe) {
    const chip = document.createElement('span');
    chip.className = `removed-num${wasSafe ? ' was-safe' : ''}`; chip.textContent = num;
    DOM.game.removedList.appendChild(chip);
  }

  // ======================== ALL-SAME TRAP ========================
  function checkAllSameNumberTrap() {
    const active = getActivePlayers(); if (active.length < 2) return false;
    const available = state.numbers.filter(n => !state.removedNumbers.includes(n));
    const first = active[0].secretNumber;
    if (!active.every(p => p.secretNumber === first)) return false;
    return available.length === 1 && available[0] === first;
  }

  function handleAllSameTrap() {
    const active = getActivePlayers(); const num = active[0].secretNumber;
    const names = active.map(p=>p.name).join(', ');
    sfxLose(); active.forEach(p => { p.eliminated = true; }); updatePlayerList();
    showSelfElimNotification(`All remaining players chose the same number: ${num}!`, `${names} — you all lose! 💀`);
    setTimeout(() => { hideSelfElimNotification(); setTimeout(() => endGame(), 500); }, 3500);
  }

  // ======================== NOTIFICATIONS ========================
  function showSafeNotification(text) {
    DOM.safeText.textContent = text; DOM.safeNotif.classList.remove('hidden');
    DOM.safeNotif.style.animation='none'; DOM.safeNotif.offsetHeight; DOM.safeNotif.style.animation='';
    setTimeout(() => DOM.safeNotif.classList.add('hidden'), 2500);
  }
  function showBothSafeNotification(t) { DOM.bothSafeText.textContent=t; DOM.bothSafeNotif.classList.remove('hidden'); }
  function hideBothSafeNotification() { DOM.bothSafeNotif.classList.add('hidden'); }
  function showSelfElimNotification(t,s) { DOM.selfElimText.textContent=t; DOM.selfElimSub.textContent=s; DOM.selfElimNotif.classList.remove('hidden'); }
  function hideSelfElimNotification() { DOM.selfElimNotif.classList.add('hidden'); }

  // ======================== TIMER ========================
  function resetTimer() {
    clearTimer();
    if (!state.timerEnabled) { DOM.game.timerCont.classList.add('hidden'); return; }
    DOM.game.timerCont.classList.remove('hidden');
    state.timerValue = TIMER_DURATION;
    DOM.game.timerText.textContent = state.timerValue;
    DOM.game.timerProgress.style.strokeDasharray = CIRCUMFERENCE;
    DOM.game.timerProgress.style.strokeDashoffset = '0';
    DOM.game.timerProgress.classList.remove('warning','danger');
    state.timerInterval = setInterval(() => {
      state.timerValue--;
      DOM.game.timerText.textContent = Math.max(0, state.timerValue);
      DOM.game.timerProgress.style.strokeDashoffset = ((TIMER_DURATION-state.timerValue)/TIMER_DURATION)*CIRCUMFERENCE;
      if (state.timerValue <= 3) { DOM.game.timerProgress.classList.add('danger'); DOM.game.timerProgress.classList.remove('warning'); sfxTimerWarn(); }
      else if (state.timerValue <= 5) { DOM.game.timerProgress.classList.add('warning'); sfxTick(); }
      if (state.timerValue <= 0) { clearTimer(); autoRemoveNumber(); }
    }, 1000);
  }

  function clearTimer() { if(state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval=null; } }

  function autoRemoveNumber() {
    const available = state.numbers.filter(n => !state.removedNumbers.includes(n));
    if (available.length === 0) return;
    const randomNum = available[Math.floor(Math.random()*available.length)];
    if (state.gameMode === 'online') Multiplayer.submitTurnAction(randomNum);
    else onRemoveNumber(randomNum);
  }

  // ======================== END GAME ========================
  function endGame() {
    clearTimer();
    const safePlayers = state.players.filter(p => p.safe);
    const remaining = getActivePlayers();
    const eliminated = state.players.filter(p => p.eliminated);
    DOM.result.players.innerHTML = '';

    if (remaining.length === 0 && eliminated.length === 0) {
      DOM.result.icon.textContent='🎉'; DOM.result.title.textContent='No Loser!';
      DOM.result.title.className='result-title draw'; DOM.result.message.textContent='Everyone survived!';
      state.players.forEach((p,i) => setTimeout(()=>addResultChip(p.name,p.avatar,true), i*100));
      sfxVictoryFanfare(); spawnConfetti(); startCelebration();
    } else if (remaining.length === 0 && eliminated.length > 1) {
      DOM.result.icon.textContent='💀'; DOM.result.title.textContent='Everyone Loses!';
      DOM.result.title.className='result-title loser';
      DOM.result.message.textContent=`${eliminated.map(p=>p.name).join(', ')} all picked the same number!`;
      sfxLose();
      state.players.forEach((p,i) => setTimeout(()=>addResultChip(p.name,p.avatar,p.safe), i*100));
    } else if (remaining.length <= 1) {
      const loser = remaining.length === 1 ? remaining[0] : eliminated[eliminated.length-1];
      if (loser && !loser.eliminated) loser.eliminated = true;
      DOM.result.icon.textContent='💀'; DOM.result.title.textContent='Game Over!';
      DOM.result.title.className='result-title loser';
      DOM.result.message.textContent=`${loser.name} is the last one standing — they LOSE!`;
      sfxLose();
      state.players.forEach((p,i) => setTimeout(()=>addResultChip(p.name,p.avatar,p.safe), i*100));
    }

    if (state.gameMode === 'online' && Multiplayer.getIsHost()) {
      Multiplayer.hostEndGame();
      pushHostState();
    }
    showScreen('result');
  }

  function addResultChip(name, avatar, isSafe) {
    const chip = document.createElement('div');
    chip.className = `result-player-chip ${isSafe ? 'safe-chip' : 'loser-chip'}`;
    chip.innerHTML = `<span>${avatar}</span> ${name} ${isSafe ? '🛡️' : '💀'}`;
    DOM.result.players.appendChild(chip);
  }

  function spawnConfetti() {
    const colors = ['#7c5cfc','#ff6bca','#00e5a0','#ffb830','#00c9db','#ffd700','#e040fb','#00e676','#ff5252','#40c4ff'];
    for (let i=0;i<100;i++) {
      const p = document.createElement('div'); p.className='confetti-particle';
      p.style.left=Math.random()*100+'vw'; p.style.top='-10px';
      p.style.background=colors[Math.floor(Math.random()*colors.length)];
      const sz=4+Math.random()*8; p.style.width=sz+'px'; p.style.height=sz*(0.4+Math.random()*0.6)+'px';
      p.style.setProperty('--fall-duration',(2+Math.random()*3)+'s');
      p.style.setProperty('--rotation',(360+Math.random()*720)+'deg');
      p.style.animationDelay=(Math.random()*2)+'s';
      p.style.borderRadius=Math.random()>0.5?'50%':'2px';
      document.body.appendChild(p); setTimeout(()=>p.remove(), 6000);
    }
  }

  // ======================== PLAY AGAIN ========================
  DOM.result.btnAgain.addEventListener('click', async () => {
    sfxClick(); stopCelebration();
    if (state.gameMode === 'online') {
      if (Multiplayer.getIsHost()) {
        await Multiplayer.hostReturnToWaiting();
      }
      enterRoomLobby(Multiplayer.getIsHost());
    } else {
      showScreen('lobby'); showLocalSetup();
      DOM.lobby.error.textContent = '';
      state.players = []; state.numbers = []; state.removedNumbers = []; tempSelectedNumber = null;
    }
  });

  // ======================== INIT ========================
  function init() {
    initLobby(); initParticles();
    DOM.lobby.playerInputs.querySelectorAll('.btn-remove-player').forEach(btn => {
      btn.addEventListener('click', () => {
        sfxClick(); const row = btn.closest('.input-row');
        row.style.opacity='0'; row.style.transform='translateX(20px) scale(0.95)'; row.style.transition='all 0.3s ease';
        setTimeout(() => { row.remove(); reindexPlayerInputs(); updateRemoveButtons(); }, 300);
      });
    });
    DOM.lobby.playerInputs.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const rows = DOM.lobby.playerInputs.querySelectorAll('.input-row');
        if (rows.length < 10) DOM.lobby.btnAdd.click();
      }
    });
    document.addEventListener('touchend', e => {
      if (e.target.closest('.num-cell') || e.target.closest('.btn')) { e.preventDefault(); e.target.click(); }
    }, {passive:false});
  }

  init();
})();
