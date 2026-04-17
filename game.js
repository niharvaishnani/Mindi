// ======================== SECRET NUMBER SURVIVAL ========================
(() => {
  'use strict';

  // ======================== STATE ========================
  const state = {
    players: [],         // { name, secretNumber, safe, eliminated }
    numbers: [],         // all numbers
    removedNumbers: [],  // numbers removed so far
    currentPlayerIdx: 0, // whose turn in selection / gameplay
    maxNumber: 0,
    timerEnabled: true,
    soundEnabled: true,
    timerInterval: null,
    timerValue: 10,
    selectingPlayerIdx: 0, // for secret selection phase
    phase: 'lobby'       // lobby | select | game | result
  };

  const AVATARS = ['🟣', '🔵', '🟢', '🟠', '🔴', '🟡', '⚪', '🟤', '🩵', '🩷'];
  const TIMER_DURATION = 10;
  const CIRCUMFERENCE = 2 * Math.PI * 26; // ~163.36

  // ======================== ENHANCED SOUND ENGINE ========================
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, duration, type = 'sine', vol = 0.15, delay = 0) {
    if (!state.soundEnabled) return;
    ensureAudio();
    const startTime = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  function playChord(notes, duration, type = 'sine', vol = 0.08) {
    notes.forEach(freq => playTone(freq, duration, type, vol));
  }

  // Sound effects with richer, layered tones
  function sfxClick() {
    playTone(800, 0.06, 'sine', 0.1);
    playTone(1200, 0.04, 'sine', 0.05);
  }

  function sfxSelect() {
    playTone(660, 0.12, 'sine', 0.12);
    playTone(880, 0.12, 'sine', 0.1, 0.06);
    playTone(1100, 0.15, 'sine', 0.08, 0.12);
  }

  function sfxRemove() {
    playTone(400, 0.15, 'sawtooth', 0.06);
    playTone(250, 0.2, 'triangle', 0.08, 0.05);
  }

  function sfxSafe() {
    playTone(523, 0.15, 'sine', 0.15);
    playTone(659, 0.15, 'sine', 0.14, 0.12);
    playTone(784, 0.25, 'sine', 0.13, 0.24);
    playTone(1047, 0.3, 'sine', 0.1, 0.36);
  }

  function sfxBothSafe() {
    playTone(523, 0.1, 'triangle', 0.15);
    playTone(659, 0.1, 'triangle', 0.15, 0.08);
    playTone(784, 0.1, 'triangle', 0.15, 0.16);
    playTone(1047, 0.35, 'triangle', 0.15, 0.24);
    // Shimmer
    playTone(1568, 0.4, 'sine', 0.06, 0.32);
    playTone(2093, 0.5, 'sine', 0.04, 0.4);
  }

  function sfxLose() {
    playTone(300, 0.3, 'sawtooth', 0.08);
    playTone(200, 0.4, 'sawtooth', 0.06, 0.1);
    playTone(150, 0.5, 'sawtooth', 0.05, 0.25);
    playTone(100, 0.6, 'sawtooth', 0.04, 0.4);
  }

  function sfxTick() {
    playTone(1000, 0.03, 'sine', 0.05);
  }

  function sfxTimerWarn() {
    playTone(800, 0.06, 'square', 0.08);
    playTone(900, 0.06, 'square', 0.06, 0.06);
  }

  function sfxTurnChange() {
    playTone(500, 0.08, 'sine', 0.06);
    playTone(700, 0.1, 'sine', 0.08, 0.04);
  }

  function sfxVictoryFanfare() {
    const notes = [523, 587, 659, 784, 880, 1047];
    notes.forEach((freq, i) => {
      playTone(freq, 0.2, 'sine', 0.1, i * 0.08);
      playTone(freq * 1.5, 0.15, 'sine', 0.05, i * 0.08 + 0.02);
    });
    // Final chord
    setTimeout(() => {
      playChord([523, 659, 784, 1047], 0.8, 'sine', 0.06);
    }, 600);
  }

  function sfxGameStart() {
    playTone(440, 0.1, 'sine', 0.1);
    playTone(554, 0.1, 'sine', 0.1, 0.1);
    playTone(659, 0.1, 'sine', 0.1, 0.2);
    playTone(880, 0.2, 'sine', 0.12, 0.3);
  }

  // ======================== FLOATING PARTICLES ========================
  const particleCanvas = document.getElementById('particle-canvas');
  const pCtx = particleCanvas ? particleCanvas.getContext('2d') : null;
  let particles = [];
  let particleAnimId = null;

  function initParticles() {
    if (!particleCanvas || !pCtx) return;
    resizeParticleCanvas();
    window.addEventListener('resize', resizeParticleCanvas);

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * particleCanvas.width,
        y: Math.random() * particleCanvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.3 + 0.1,
        hue: Math.random() * 60 + 240 // purple-blue range
      });
    }
    animateParticles();
  }

  function resizeParticleCanvas() {
    if (!particleCanvas) return;
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  }

  function animateParticles() {
    if (!pCtx) return;
    pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      // Wrap around edges
      if (p.x < 0) p.x = particleCanvas.width;
      if (p.x > particleCanvas.width) p.x = 0;
      if (p.y < 0) p.y = particleCanvas.height;
      if (p.y > particleCanvas.height) p.y = 0;

      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      pCtx.fillStyle = `hsla(${p.hue}, 70%, 70%, ${p.opacity})`;
      pCtx.fill();
    });

    particleAnimId = requestAnimationFrame(animateParticles);
  }

  // ======================== CELEBRATION PARTICLES ========================
  let celebrationParticles = [];
  let celebrationAnimId = null;
  const celebCanvas = document.getElementById('celebration-canvas');
  const cCtx = celebCanvas ? celebCanvas.getContext('2d') : null;

  function startCelebration() {
    if (!celebCanvas || !cCtx) return;
    celebCanvas.width = window.innerWidth;
    celebCanvas.height = window.innerHeight;
    celebrationParticles = [];

    const colors = ['#7c5cfc', '#ff6bca', '#00e5a0', '#ffb830', '#00c9db', '#ffd700', '#e040fb', '#ff5252'];

    // Burst from center
    for (let i = 0; i < 120; i++) {
      const angle = (Math.PI * 2 * i) / 120 + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 6;
      celebrationParticles.push({
        x: celebCanvas.width / 2,
        y: celebCanvas.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.005 + Math.random() * 0.01,
        gravity: 0.04 + Math.random() * 0.02,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10
      });
    }

    // Firework bursts
    for (let burst = 0; burst < 5; burst++) {
      const bx = Math.random() * celebCanvas.width;
      const by = Math.random() * celebCanvas.height * 0.5;
      for (let i = 0; i < 30; i++) {
        const angle = (Math.PI * 2 * i) / 30;
        const speed = 1 + Math.random() * 3;
        celebrationParticles.push({
          x: bx,
          y: by,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 2 + Math.random() * 3,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1,
          decay: 0.008 + Math.random() * 0.015,
          gravity: 0.03,
          rotation: 0,
          rotationSpeed: (Math.random() - 0.5) * 8,
          delay: burst * 15 // stagger bursts
        });
      }
    }

    animateCelebration();
  }

  function animateCelebration() {
    if (!cCtx) return;
    cCtx.clearRect(0, 0, celebCanvas.width, celebCanvas.height);

    let alive = false;
    celebrationParticles.forEach(p => {
      if (p.delay && p.delay > 0) {
        p.delay--;
        alive = true;
        return;
      }
      if (p.life <= 0) return;
      alive = true;

      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.99;
      p.life -= p.decay;
      p.rotation += p.rotationSpeed;

      cCtx.save();
      cCtx.translate(p.x, p.y);
      cCtx.rotate((p.rotation * Math.PI) / 180);
      cCtx.globalAlpha = Math.max(0, p.life);
      cCtx.fillStyle = p.color;
      cCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      cCtx.restore();
    });

    if (alive) {
      celebrationAnimId = requestAnimationFrame(animateCelebration);
    }
  }

  function stopCelebration() {
    if (celebrationAnimId) {
      cancelAnimationFrame(celebrationAnimId);
      celebrationAnimId = null;
    }
    if (cCtx && celebCanvas) {
      cCtx.clearRect(0, 0, celebCanvas.width, celebCanvas.height);
    }
    celebrationParticles = [];
  }

  // ======================== DOM REFS ========================
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const DOM = {
    screens: {
      lobby:  $('#screen-lobby'),
      select: $('#screen-select'),
      game:   $('#screen-game'),
      result: $('#screen-result')
    },
    lobby: {
      playerInputs: $('#player-inputs'),
      btnAdd:       $('#btn-add-player'),
      btnStart:     $('#btn-start'),
      error:        $('#lobby-error'),
      toggleTimer:  $('#toggle-timer'),
      toggleSound:  $('#toggle-sound')
    },
    select: {
      instruction:   $('#select-instruction'),
      avatar:        $('#select-avatar'),
      playerName:    $('#select-player-name'),
      grid:          $('#select-grid'),
      btnConfirm:    $('#btn-confirm-select'),
      passOverlay:   $('#pass-device-overlay'),
      passText:      $('#pass-text'),
      passNextName:  $('#pass-next-name'),
      btnPassReady:  $('#btn-pass-ready')
    },
    game: {
      playerList:   $('#player-list'),
      turnName:     $('#turn-player-name'),
      timerCont:    $('#timer-container'),
      timerProgress:$('#timer-progress'),
      timerText:    $('#timer-text'),
      grid:         $('#game-grid'),
      removedList:  $('#removed-list')
    },
    result: {
      icon:    $('#result-icon'),
      title:   $('#result-title'),
      message: $('#result-message'),
      players: $('#result-players'),
      btnAgain:$('#btn-play-again')
    },
    safeNotif:     $('#safe-notification'),
    safeText:      $('#safe-text'),
    bothSafeNotif: $('#both-safe-notification'),
    bothSafeText:  $('#both-safe-text'),
    selfElimNotif: $('#self-elim-notification'),
    selfElimText:  $('#self-elim-text'),
    selfElimSub:   $('#self-elim-sub')
  };

  // ======================== SCREEN MANAGEMENT ========================
  function showScreen(name) {
    Object.values(DOM.screens).forEach(s => s.classList.remove('active'));
    DOM.screens[name].classList.add('active');
    state.phase = name;
  }

  // ======================== LOBBY ========================
  function initLobby() {
    DOM.lobby.btnAdd.addEventListener('click', () => {
      const rows = DOM.lobby.playerInputs.querySelectorAll('.input-row');
      if (rows.length >= 10) return;
      sfxClick();
      addPlayerInputRow(rows.length);
      updateRemoveButtons();
    });

    DOM.lobby.btnStart.addEventListener('click', startGame);
    DOM.lobby.toggleTimer.addEventListener('change', (e) => {
      state.timerEnabled = e.target.checked;
    });
    DOM.lobby.toggleSound.addEventListener('change', (e) => {
      state.soundEnabled = e.target.checked;
    });

    updateRemoveButtons();
  }

  function addPlayerInputRow(index) {
    const row = document.createElement('div');
    row.className = 'input-row';
    row.dataset.index = index;
    row.style.animationDelay = `${index * 0.05}s`;
    row.innerHTML = `
      <span class="input-icon">👤</span>
      <input type="text" class="player-name-input" placeholder="Player ${index + 1}" maxlength="16" autocomplete="off">
      <button class="btn-remove-player" title="Remove player">✕</button>
    `;
    DOM.lobby.playerInputs.appendChild(row);

    row.querySelector('.btn-remove-player').addEventListener('click', () => {
      sfxClick();
      row.style.animation = 'none';
      row.style.opacity = '0';
      row.style.transform = 'translateX(20px) scale(0.95)';
      row.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        row.remove();
        reindexPlayerInputs();
        updateRemoveButtons();
      }, 300);
    });

    // Focus the new input
    setTimeout(() => {
      row.querySelector('.player-name-input').focus();
    }, 50);
  }

  function reindexPlayerInputs() {
    const rows = DOM.lobby.playerInputs.querySelectorAll('.input-row');
    rows.forEach((r, i) => {
      r.dataset.index = i;
      const input = r.querySelector('.player-name-input');
      if (!input.value) input.placeholder = `Player ${i + 1}`;
    });
  }

  function updateRemoveButtons() {
    const rows = DOM.lobby.playerInputs.querySelectorAll('.input-row');
    rows.forEach((r) => {
      const btn = r.querySelector('.btn-remove-player');
      btn.style.visibility = rows.length > 2 ? 'visible' : 'hidden';
    });

    DOM.lobby.btnAdd.style.display = rows.length >= 10 ? 'none' : '';
  }

  function startGame() {
    const inputs = DOM.lobby.playerInputs.querySelectorAll('.player-name-input');
    const names = [];

    inputs.forEach((inp, i) => {
      const name = inp.value.trim() || `Player ${i + 1}`;
      names.push(name);
    });

    if (names.length < 2) {
      DOM.lobby.error.textContent = 'Need at least 2 players!';
      return;
    }

    // Check for duplicate names
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      DOM.lobby.error.textContent = 'Player names must be unique!';
      return;
    }

    DOM.lobby.error.textContent = '';
    sfxGameStart();

    // Setup state
    state.maxNumber = 35;
    state.numbers = Array.from({ length: state.maxNumber }, (_, i) => i + 1);
    state.removedNumbers = [];
    state.players = names.map((name, i) => ({
      name,
      avatar: AVATARS[i],
      secretNumber: null,
      safe: false,
      eliminated: false
    }));
    state.selectingPlayerIdx = 0;

    // Move to secret selection
    showScreen('select');
    setupSecretSelection();
  }

  // ======================== SECRET SELECTION ========================
  let tempSelectedNumber = null;

  function setupSecretSelection() {
    const player = state.players[state.selectingPlayerIdx];
    tempSelectedNumber = null;

    DOM.select.avatar.textContent = player.avatar;
    DOM.select.playerName.textContent = player.name;
    DOM.select.instruction.textContent = `${player.name}, choose your secret number!`;
    DOM.select.btnConfirm.disabled = true;
    DOM.select.passOverlay.classList.add('hidden');

    // Re-trigger avatar animation
    DOM.select.avatar.style.animation = 'none';
    DOM.select.avatar.offsetHeight;
    DOM.select.avatar.style.animation = '';

    renderSelectGrid();
  }

  function renderSelectGrid() {
    DOM.select.grid.innerHTML = '';
    state.numbers.forEach((num, i) => {
      const cell = document.createElement('div');
      cell.className = 'num-cell';
      cell.textContent = num;
      cell.dataset.number = num;
      cell.style.animationDelay = `${i * 0.015}s`; // Staggered entrance
      cell.addEventListener('click', () => onSelectNumber(num, cell));
      DOM.select.grid.appendChild(cell);
    });

    DOM.select.btnConfirm.onclick = confirmSecretSelection;
  }

  function onSelectNumber(num, cell) {
    sfxClick();
    // Deselect previous
    DOM.select.grid.querySelectorAll('.num-cell.selected').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    tempSelectedNumber = num;
    DOM.select.btnConfirm.disabled = false;
  }

  function confirmSecretSelection() {
    if (tempSelectedNumber === null) return;
    sfxSelect();

    state.players[state.selectingPlayerIdx].secretNumber = tempSelectedNumber;
    state.selectingPlayerIdx++;

    if (state.selectingPlayerIdx < state.players.length) {
      // Show pass device overlay
      const nextPlayer = state.players[state.selectingPlayerIdx];
      DOM.select.passOverlay.classList.remove('hidden');
      DOM.select.passText.textContent = 'Pass the device to the next player';
      DOM.select.passNextName.textContent = nextPlayer.name;

      DOM.select.btnPassReady.onclick = () => {
        sfxClick();
        setupSecretSelection();
      };
    } else {
      // All players selected, start game
      startGameplay();
    }
  }

  // ======================== GAMEPLAY ========================
  function startGameplay() {
    state.currentPlayerIdx = 0;
    state.removedNumbers = [];
    showScreen('game');
    renderPlayerList();
    renderGameGrid();
    updateTurn();
  }

  function renderPlayerList() {
    DOM.game.playerList.innerHTML = '';
    state.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'player-item';
      li.id = `player-item-${i}`;
      li.style.animationDelay = `${i * 0.06}s`;
      li.innerHTML = `
        <span class="player-avatar-mini">${p.avatar}</span>
        <div class="player-info">
          <div class="player-item-name">${p.name}</div>
          <div class="player-status">Active</div>
        </div>
      `;
      DOM.game.playerList.appendChild(li);
    });
  }

  function updatePlayerList() {
    state.players.forEach((p, i) => {
      const li = $(`#player-item-${i}`);
      if (!li) return;
      li.classList.remove('active-turn', 'safe', 'eliminated', 'safe-animate');
      const status = li.querySelector('.player-status');

      if (p.safe) {
        li.classList.add('safe');
        status.textContent = '🛡️ Safe';
      } else if (p.eliminated) {
        li.classList.add('eliminated');
        status.textContent = '💀 Eliminated';
      } else {
        status.textContent = 'Active';
        if (i === state.currentPlayerIdx) {
          li.classList.add('active-turn');
        }
      }
    });
  }

  function renderGameGrid() {
    DOM.game.grid.innerHTML = '';
    DOM.game.removedList.innerHTML = '';

    state.numbers.forEach((num, i) => {
      const cell = document.createElement('div');
      cell.className = 'num-cell';
      cell.id = `game-cell-${num}`;
      cell.textContent = num;
      cell.dataset.number = num;
      cell.style.animationDelay = `${i * 0.012}s`; // Staggered entrance

      if (state.removedNumbers.includes(num)) {
        cell.classList.add('removed');
      } else {
        cell.addEventListener('click', () => onRemoveNumber(num));
      }

      DOM.game.grid.appendChild(cell);
    });
  }

  function getActivePlayers() {
    return state.players.filter(p => !p.safe && !p.eliminated);
  }

  function advanceTurn() {
    const active = getActivePlayers();
    if (active.length <= 1) return; // game will end

    let next = (state.currentPlayerIdx + 1) % state.players.length;
    while (state.players[next].safe || state.players[next].eliminated) {
      next = (next + 1) % state.players.length;
    }
    state.currentPlayerIdx = next;
    sfxTurnChange();
    updateTurn();
  }

  function updateTurn() {
    const player = state.players[state.currentPlayerIdx];

    // Animate turn name change
    DOM.game.turnName.classList.remove('turn-name-animate');
    DOM.game.turnName.offsetHeight; // Force reflow
    DOM.game.turnName.textContent = player.name;
    DOM.game.turnName.classList.add('turn-name-animate');

    updatePlayerList();
    resetTimer();
  }

  // ======================== REMOVE NUMBER ========================
  function onRemoveNumber(num) {
    if (state.removedNumbers.includes(num)) return;

    sfxRemove();
    clearTimer();

    state.removedNumbers.push(num);

    const cell = $(`#game-cell-${num}`);

    // Check if any active player(s) had this as secret
    const activePlayers = getActivePlayers();
    const currentPlayer = state.players[state.currentPlayerIdx];
    const matchedPlayers = activePlayers.filter(p => p.secretNumber === num);

    // === SELF-ELIMINATION RULE ===
    if (currentPlayer.secretNumber === num && !currentPlayer.safe && !currentPlayer.eliminated) {
      cell.classList.add('removing');
      sfxLose();
      currentPlayer.eliminated = true;

      const otherMatched = matchedPlayers.filter(p => p !== currentPlayer);
      otherMatched.forEach(p => { p.safe = true; });

      addRemovedChip(num, false);

      const curIdx = state.players.indexOf(currentPlayer);
      const curLi = $(`#player-item-${curIdx}`);
      if (curLi) {
        setTimeout(() => {
          curLi.classList.add('eliminated');
          curLi.querySelector('.player-status').textContent = '💀 Eliminated';
        }, 400);
      }

      otherMatched.forEach(p => {
        sfxSafe();
        const idx = state.players.indexOf(p);
        const li = $(`#player-item-${idx}`);
        if (li) {
          setTimeout(() => {
            li.classList.add('safe', 'safe-animate');
            li.querySelector('.player-status').textContent = '🛡️ Safe';
          }, 600);
        }
      });

      setTimeout(() => {
        showSelfElimNotification(
          `${currentPlayer.name} picked their own number!`,
          `Number ${num} was your secret — you lose! 💀`
        );
        setTimeout(() => {
          hideSelfElimNotification();
          cell.classList.add('removed');
          updatePlayerList();
          const remaining = getActivePlayers();
          if (remaining.length <= 1) {
            setTimeout(() => endGame(), 600);
          } else if (checkAllSameNumberTrap()) {
            handleAllSameTrap();
          } else {
            advanceTurn();
          }
        }, 3000);
      }, 800);
      return;
    }

    if (matchedPlayers.length > 0) {
      // Check special final rule: 2 remaining, both same number
      if (activePlayers.length === 2 && matchedPlayers.length === 2) {
        cell.classList.add('safe-reveal');
        sfxBothSafe();
        matchedPlayers.forEach(p => { p.safe = true; });
        updatePlayerList();
        addRemovedChip(num, true);

        matchedPlayers.forEach(p => {
          const idx = state.players.indexOf(p);
          const li = $(`#player-item-${idx}`);
          if (li) {
            li.classList.add('safe-animate');
          }
        });

        setTimeout(() => {
          showBothSafeNotification("Both players guessed the same number! Both are safe!");
          setTimeout(() => {
            hideBothSafeNotification();
            setTimeout(() => endGame(), 500);
          }, 3000);
        }, 800);
        return;
      }

      // Normal safe reveal
      cell.classList.add('safe-reveal');
      matchedPlayers.forEach(p => { p.safe = true; });

      matchedPlayers.forEach(p => {
        sfxSafe();
        const idx = state.players.indexOf(p);
        const li = $(`#player-item-${idx}`);
        if (li) {
          setTimeout(() => {
            li.classList.add('safe', 'safe-animate');
            li.querySelector('.player-status').textContent = '🛡️ Safe';
          }, 400);
        }
      });

      const safeNames = matchedPlayers.map(p => p.name).join(' & ');
      showSafeNotification(`${safeNames} is SAFE! 🛡️`);

      addRemovedChip(num, true);
    } else {
      cell.classList.add('removing');
      addRemovedChip(num, false);
    }

    // After animation, check game state
    setTimeout(() => {
      cell.classList.add('removed');
      updatePlayerList();

      const remaining = getActivePlayers();
      if (remaining.length <= 1) {
        setTimeout(() => endGame(), 600);
      } else if (checkAllSameNumberTrap()) {
        handleAllSameTrap();
      } else {
        advanceTurn();
      }
    }, 700);
  }

  function addRemovedChip(num, wasSafe) {
    const chip = document.createElement('span');
    chip.className = `removed-num${wasSafe ? ' was-safe' : ''}`;
    chip.textContent = num;
    DOM.game.removedList.appendChild(chip);
  }

  // ======================== ALL-SAME-NUMBER TRAP ========================
  function checkAllSameNumberTrap() {
    const active = getActivePlayers();
    if (active.length < 2) return false;

    const available = state.numbers.filter(n => !state.removedNumbers.includes(n));

    const firstSecret = active[0].secretNumber;
    const allSame = active.every(p => p.secretNumber === firstSecret);
    if (!allSame) return false;

    if (available.length === 1 && available[0] === firstSecret) {
      return true;
    }

    return false;
  }

  function handleAllSameTrap() {
    const active = getActivePlayers();
    const sharedNum = active[0].secretNumber;
    const names = active.map(p => p.name).join(', ');

    sfxLose();

    active.forEach(p => { p.eliminated = true; });
    updatePlayerList();

    showSelfElimNotification(
      `All remaining players chose the same number: ${sharedNum}!`,
      `${names} — you all lose! 💀`
    );

    setTimeout(() => {
      hideSelfElimNotification();
      setTimeout(() => endGame(), 500);
    }, 3500);
  }

  // ======================== NOTIFICATIONS ========================
  function showSafeNotification(text) {
    DOM.safeText.textContent = text;
    DOM.safeNotif.classList.remove('hidden');
    DOM.safeNotif.style.animation = 'none';
    DOM.safeNotif.offsetHeight;
    DOM.safeNotif.style.animation = '';

    setTimeout(() => {
      DOM.safeNotif.classList.add('hidden');
    }, 2500);
  }

  function showBothSafeNotification(text) {
    DOM.bothSafeText.textContent = text;
    DOM.bothSafeNotif.classList.remove('hidden');
  }

  function hideBothSafeNotification() {
    DOM.bothSafeNotif.classList.add('hidden');
  }

  function showSelfElimNotification(text, sub) {
    DOM.selfElimText.textContent = text;
    DOM.selfElimSub.textContent = sub;
    DOM.selfElimNotif.classList.remove('hidden');
  }

  function hideSelfElimNotification() {
    DOM.selfElimNotif.classList.add('hidden');
  }

  // ======================== TIMER ========================
  function resetTimer() {
    clearTimer();
    if (!state.timerEnabled) {
      DOM.game.timerCont.classList.add('hidden');
      return;
    }

    DOM.game.timerCont.classList.remove('hidden');
    state.timerValue = TIMER_DURATION;
    DOM.game.timerText.textContent = state.timerValue;
    DOM.game.timerProgress.style.strokeDasharray = CIRCUMFERENCE;
    DOM.game.timerProgress.style.strokeDashoffset = '0';
    DOM.game.timerProgress.classList.remove('warning', 'danger');

    state.timerInterval = setInterval(() => {
      state.timerValue--;
      DOM.game.timerText.textContent = Math.max(0, state.timerValue);

      const offset = ((TIMER_DURATION - state.timerValue) / TIMER_DURATION) * CIRCUMFERENCE;
      DOM.game.timerProgress.style.strokeDashoffset = offset;

      if (state.timerValue <= 3) {
        DOM.game.timerProgress.classList.add('danger');
        DOM.game.timerProgress.classList.remove('warning');
        sfxTimerWarn();
      } else if (state.timerValue <= 5) {
        DOM.game.timerProgress.classList.add('warning');
        sfxTick();
      }

      if (state.timerValue <= 0) {
        clearTimer();
        autoRemoveNumber();
      }
    }, 1000);
  }

  function clearTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function autoRemoveNumber() {
    const available = state.numbers.filter(n => !state.removedNumbers.includes(n));
    if (available.length === 0) return;
    const randomNum = available[Math.floor(Math.random() * available.length)];
    onRemoveNumber(randomNum);
  }

  // ======================== END GAME ========================
  function endGame() {
    clearTimer();

    const safePlayers = state.players.filter(p => p.safe);
    const remaining = getActivePlayers();
    const eliminatedPlayers = state.players.filter(p => p.eliminated);

    DOM.result.players.innerHTML = '';

    if (remaining.length === 0 && eliminatedPlayers.length === 0) {
      // No loser — all safe
      DOM.result.icon.textContent = '🎉';
      DOM.result.title.textContent = 'No Loser!';
      DOM.result.title.className = 'result-title draw';
      DOM.result.message.textContent = 'Everyone survived! What an incredible round!';

      state.players.forEach((p, i) => {
        setTimeout(() => addResultChip(p.name, p.avatar, true), i * 100);
      });

      sfxVictoryFanfare();
      spawnConfetti();
      startCelebration();
    } else if (remaining.length === 0 && eliminatedPlayers.length > 1) {
      // Multiple players eliminated (all-same-number trap)
      const loserNames = eliminatedPlayers.map(p => p.name).join(', ');
      DOM.result.icon.textContent = '💀';
      DOM.result.title.textContent = 'Everyone Loses!';
      DOM.result.title.className = 'result-title loser';
      DOM.result.message.textContent = `${loserNames} all picked the same secret number and all lost!`;

      sfxLose();

      state.players.forEach((p, i) => {
        setTimeout(() => addResultChip(p.name, p.avatar, p.safe), i * 100);
      });
    } else if (remaining.length <= 1) {
      // One loser
      const loser = remaining.length === 1 ? remaining[0] : eliminatedPlayers[eliminatedPlayers.length - 1];
      if (loser && !loser.eliminated) loser.eliminated = true;

      DOM.result.icon.textContent = '💀';
      DOM.result.title.textContent = 'Game Over!';
      DOM.result.title.className = 'result-title loser';
      DOM.result.message.textContent = `${loser.name} is the last one standing... and that means they LOSE!`;

      sfxLose();

      state.players.forEach((p, i) => {
        setTimeout(() => {
          if (p.safe) {
            addResultChip(p.name, p.avatar, true);
          } else {
            addResultChip(p.name, p.avatar, false);
          }
        }, i * 100);
      });
    }

    showScreen('result');
  }

  function addResultChip(name, avatar, isSafe) {
    const chip = document.createElement('div');
    chip.className = `result-player-chip ${isSafe ? 'safe-chip' : 'loser-chip'}`;
    chip.innerHTML = `<span>${avatar}</span> ${name} ${isSafe ? '🛡️' : '💀'}`;
    DOM.result.players.appendChild(chip);
  }

  // ======================== CONFETTI ========================
  function spawnConfetti() {
    const colors = ['#7c5cfc', '#ff6bca', '#00e5a0', '#ffb830', '#00c9db', '#ffd700', '#e040fb', '#00e676', '#ff5252', '#40c4ff'];
    for (let i = 0; i < 100; i++) {
      const particle = document.createElement('div');
      particle.className = 'confetti-particle';
      particle.style.left = Math.random() * 100 + 'vw';
      particle.style.top = -10 + 'px';
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      const size = 4 + Math.random() * 8;
      particle.style.width = size + 'px';
      particle.style.height = size * (0.4 + Math.random() * 0.6) + 'px';
      particle.style.setProperty('--fall-duration', (2 + Math.random() * 3) + 's');
      particle.style.setProperty('--rotation', (360 + Math.random() * 720) + 'deg');
      particle.style.animationDelay = (Math.random() * 2) + 's';
      particle.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 6000);
    }
  }

  // ======================== PLAY AGAIN ========================
  DOM.result.btnAgain.addEventListener('click', () => {
    sfxClick();
    stopCelebration();
    showScreen('lobby');
    DOM.lobby.error.textContent = '';
    state.players = [];
    state.numbers = [];
    state.removedNumbers = [];
    tempSelectedNumber = null;
  });

  // ======================== INIT ========================
  function init() {
    initLobby();
    initParticles();

    // Attach remove buttons for initial 2 rows
    DOM.lobby.playerInputs.querySelectorAll('.btn-remove-player').forEach(btn => {
      btn.addEventListener('click', () => {
        sfxClick();
        const row = btn.closest('.input-row');
        row.style.opacity = '0';
        row.style.transform = 'translateX(20px) scale(0.95)';
        row.style.transition = 'all 0.3s ease';
        setTimeout(() => {
          row.remove();
          reindexPlayerInputs();
          updateRemoveButtons();
        }, 300);
      });
    });

    // Enter key on inputs to add player
    DOM.lobby.playerInputs.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const rows = DOM.lobby.playerInputs.querySelectorAll('.input-row');
        if (rows.length < 10) {
          DOM.lobby.btnAdd.click();
        }
      }
    });

    // Prevent double tap zoom on mobile
    document.addEventListener('touchend', (e) => {
      if (e.target.closest('.num-cell') || e.target.closest('.btn')) {
        e.preventDefault();
        e.target.click();
      }
    }, { passive: false });
  }

  init();
})();
