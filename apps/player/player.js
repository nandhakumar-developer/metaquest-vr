import {
  $,
  clamp,
  formatBytes,
  formatTime,
  setConnection,
  showToast,
} from './components/ui.js';
import { sha256Hex } from './components/sha256.js';
import { createImmersivePlayer } from './webxr/immersive.js';

const PLAYER_VERSION = '1.0.0-browser';
const PROTOCOL_VERSION = 1;
const STORAGE = {
  credentials: 'vrcc.player.credentials.v1',
  pending: 'vrcc.player.pending.v1',
  volume: 'vrcc.player.volume.v1',
  muted: 'vrcc.player.muted.v1',
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[0-9a-f]{64}$/i;

const el = {
  pairingScreen: $('#pairing-screen'),
  pairingIdle: $('#pairing-idle'),
  pairingActive: $('#pairing-active'),
  pairingResume: $('#pairing-resume'),
  pairingResumeMessage: $('#pairing-resume-message'),
  pairingError: $('#pairing-error'),
  pairingCode: $('#pairing-code'),
  pairingStatus: $('#pairing-status'),
  pairingCountdown: $('#pairing-countdown'),
  startPairing: $('#start-pairing'),
  cancelPairing: $('#cancel-pairing'),
  repairHeadset: $('#repair-headset'),
  gatewayAddress: $('#gateway-address'),
  playerVersion: $('#player-version'),
  secureBadge: $('#secure-badge'),

  playerScreen: $('#player-screen'),
  deviceName: $('#device-name'),
  deviceMeta: $('#device-meta'),
  toggleLibrary: $('#toggle-library'),
  refreshPlayer: $('#refresh-player'),
  resetPairing: $('#reset-pairing'),

  stage: $('#stage'),
  video: $('#video'),
  xrCanvas: $('#xr-canvas'),
  stageEmpty: $('#stage-empty'),
  emptyOpenLibrary: $('#empty-open-library'),
  loadingOverlay: $('#loading-overlay'),
  loadingMessage: $('#loading-message'),
  errorOverlay: $('#error-overlay'),
  errorMessage: $('#error-message'),
  dismissError: $('#dismiss-error'),
  tapBanner: $('#tap-banner'),
  enableAudio: $('#enable-audio'),
  titleOverlay: $('#title-overlay'),
  nowPlayingTitle: $('#now-playing-title'),
  nowPlayingMeta: $('#now-playing-meta'),

  libraryPanel: $('#library-panel'),
  closeLibrary: $('#close-library'),
  libraryList: $('#library-list'),
  libraryCount: $('#library-count'),
  libraryEmpty: $('#library-empty'),

  seek: $('#seek'),
  timeCurrent: $('#time-current'),
  timeTotal: $('#time-total'),
  btnPlay: $('#btn-play'),
  btnPause: $('#btn-pause'),
  btnStop: $('#btn-stop'),
  btnBack: $('#btn-back'),
  btnForward: $('#btn-forward'),
  btnMute: $('#btn-mute'),
  volume: $('#volume'),
  btnFullscreen: $('#btn-fullscreen'),
  btnEnterVr: $('#btn-enter-vr'),
  btnExitVr: $('#btn-exit-vr'),
  statusLine: $('#status-line'),
};

const state = {
  credentials: null,
  pendingPairing: null,
  library: [],
  current: null,
  model: detectQuestModel(),
  heartbeatIntervalMs: 5000,
  serverOffsetMs: 0,
  rttMs: null,
  lastClockSampleAt: 0,
  ws: null,
  wsAuthenticated: false,
  wsExpectedClose: false,
  wsRetry: 0,
  wsRetryTimer: null,
  heartbeatTimer: null,
  authPermanentFailure: false,
  pairingPollTimer: null,
  pairingCountdownTimer: null,
  playbackState: 'idle',
  playbackError: null,
  volume: readNumber(STORAGE.volume, 1),
  muted: readBoolean(STORAGE.muted, false),
  autoMuted: false,
  userInteracted: false,
  scheduleTimer: null,
  scheduledStartAt: null,
  scheduleBaseSeconds: 0,
  previewTimer: null,
  previewActive: false,
  lastPoseSentAt: 0,
  immersive: null,
  isImmersive: false,
  intent: 'idle',
  controlsTimer: null,
  battery: null,
};

/* -------------------------------------------------------------------------- */
/* Small utilities                                                             */
/* -------------------------------------------------------------------------- */

function readNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readBoolean(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be disabled in private browsing; the player still works in
    // this tab but cannot remember the device after a reload.
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function randomHex(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('This browser cannot generate a secure device secret.');
  }
  crypto.getRandomValues(buffer);
  return [...buffer].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const text = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

function detectQuestModel() {
  const ua = navigator.userAgent || '';
  if (/Quest 3S/i.test(ua)) return 'Meta Quest 3S';
  if (/Quest 3/i.test(ua)) return 'Meta Quest 3';
  if (/Quest 2/i.test(ua)) return 'Meta Quest 2';
  if (/Quest Pro/i.test(ua)) return 'Meta Quest Pro';
  if (/Quest/i.test(ua)) return 'Meta Quest';
  return 'Meta Quest Browser';
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function waitForMedia(video, eventName, timeoutMs) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const onEvent = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(mediaErrorMessage(video)));
      };
      const cleanup = () => {
        video.removeEventListener(eventName, onEvent);
        video.removeEventListener('error', onError);
      };
      video.addEventListener(eventName, onEvent, { once: true });
      video.addEventListener('error', onError, { once: true });
    }),
    timeoutMs,
    'Timed out while loading the video. Check that the gateway is still running.',
  );
}

function mediaErrorMessage(video) {
  const error = video.error;
  if (!error) return 'The browser could not load this video.';
  switch (error.code) {
    case 1:
      return 'Video loading was aborted.';
    case 2:
      return 'Network error while streaming this video.';
    case 3:
      return 'The browser could not decode this video container.';
    case 4:
      return 'The browser does not support this video codec.';
    default:
      return 'The browser could not play this video.';
  }
}

function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set('Accept', 'application/json');
  let body = options.body;
  if (body && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  return fetch(path, {
    ...options,
    body,
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  }).then(async (response) => {
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: { message: text } };
      }
    }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Request failed (${response.status})`);
      error.statusCode = response.status;
      error.code = payload?.error?.code;
      throw error;
    }
    return payload;
  });
}

/* -------------------------------------------------------------------------- */
/* Credentials + pairing                                                       */
/* -------------------------------------------------------------------------- */

function loadCredentials() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.credentials) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    if (!UUID_RE.test(parsed.deviceUuid) || !SECRET_RE.test(parsed.secret)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCredentials(credentials) {
  state.credentials = credentials;
  writeStorage(STORAGE.credentials, JSON.stringify(credentials));
  state.authPermanentFailure = false;
}

function loadPendingPairing() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.pending) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.pairingId || !parsed.pollToken || !SECRET_RE.test(parsed.secret)) return null;
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      removeStorage(STORAGE.pending);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePendingPairing(pending) {
  state.pendingPairing = pending;
  writeStorage(STORAGE.pending, JSON.stringify(pending));
}

function clearPendingPairing() {
  state.pendingPairing = null;
  removeStorage(STORAGE.pending);
  stopPairingTimers();
}

function stopPairingTimers() {
  if (state.pairingPollTimer) {
    clearTimeout(state.pairingPollTimer);
    state.pairingPollTimer = null;
  }
  if (state.pairingCountdownTimer) {
    clearInterval(state.pairingCountdownTimer);
    state.pairingCountdownTimer = null;
  }
}

function setPairingView(view, message = '') {
  el.pairingIdle.hidden = view !== 'idle';
  el.pairingActive.hidden = view !== 'active';
  el.pairingResume.hidden = view !== 'resume';
  if (message) {
    if (view === 'resume') {
      el.pairingResumeMessage.textContent = message;
    } else {
      el.pairingError.hidden = false;
      el.pairingError.textContent = message;
    }
  }
}

function showPairing(message = '', mode = 'idle') {
  stopPairingTimers();
  el.playerScreen.hidden = true;
  el.pairingScreen.hidden = false;
  setPairingView(mode, message);
  if (message) {
    if (mode === 'resume') {
      el.pairingResumeMessage.textContent = message;
    } else {
      el.pairingError.hidden = false;
      el.pairingError.textContent = message;
    }
  } else {
    el.pairingError.hidden = true;
    el.pairingError.textContent = '';
  }
  updatePairingMeta();
}

function showPlayer() {
  el.pairingScreen.hidden = true;
  el.playerScreen.hidden = false;
  updatePlayerIdentity();
}

function updatePairingMeta() {
  el.gatewayAddress.textContent = `${location.host}`;
  el.playerVersion.textContent = `player ${PLAYER_VERSION}`;
  const secure = Boolean(window.isSecureContext);
  el.secureBadge.textContent = secure ? 'WebXR ready' : 'HTTP · flat only';
  el.secureBadge.classList.toggle('badge--ok', secure);
  el.secureBadge.classList.toggle('badge--warn', !secure);
  el.secureBadge.title = secure
    ? 'This page is a secure context; immersive WebXR can be requested.'
    : 'WebXR requires HTTPS or localhost. Flat 2D playback still works over HTTP.';
}

async function startPairing() {
  if (state.pendingPairing) {
    showActivePairing();
    return;
  }
  el.startPairing.disabled = true;
  el.pairingError.hidden = true;
  try {
    const secret = randomHex(32);
    const secretHash = sha256Hex(secret);
    const result = await api('/api/player/pair/start', {
      method: 'POST',
      body: {
        secretHash,
        model: state.model,
        appVersion: PLAYER_VERSION,
      },
    });
    const pending = {
      pairingId: result.pairingId,
      code: result.code,
      pollToken: result.pollToken,
      secret,
      model: state.model,
      appVersion: PLAYER_VERSION,
      expiresAt: result.expiresAt,
      claimIntervalMs: Math.max(750, Number(result.claimIntervalMs) || 1500),
      startedAt: new Date().toISOString(),
    };
    savePendingPairing(pending);
    el.pairingError.hidden = true;
    showActivePairing();
    schedulePairingPoll(800);
  } catch (error) {
    el.pairingError.hidden = false;
    el.pairingError.textContent = errorMessage(error);
  } finally {
    el.startPairing.disabled = false;
  }
}

function showActivePairing() {
  if (!state.pendingPairing) return;
  setPairingView('active');
  el.pairingCode.textContent = state.pendingPairing.code;
  el.pairingStatus.textContent = 'Waiting for an administrator to approve this code…';
  updatePairingCountdown();
  stopPairingTimers();
  state.pairingCountdownTimer = setInterval(updatePairingCountdown, 1000);
  schedulePairingPoll(350);
}

function updatePairingCountdown() {
  if (!state.pendingPairing) return;
  const remaining = Math.max(0, Math.floor((Date.parse(state.pendingPairing.expiresAt) - Date.now()) / 1000));
  el.pairingCountdown.textContent = formatTime(remaining);
  if (remaining === 0) {
    el.pairingStatus.textContent = 'This code expired. Generate a new pairing code.';
  }
}

function schedulePairingPoll(delay) {
  if (!state.pendingPairing) return;
  if (state.pairingPollTimer) clearTimeout(state.pairingPollTimer);
  state.pairingPollTimer = setTimeout(() => void pollPairing(), delay);
}

async function pollPairing() {
  const pending = state.pendingPairing;
  if (!pending) return;
  try {
    const claim = await api('/api/player/pair/claim', {
      method: 'POST',
      body: { pairingId: pending.pairingId, pollToken: pending.pollToken },
    });
    if (!state.pendingPairing || state.pendingPairing.pairingId !== pending.pairingId) return;
    if (claim?.status === 'paired' && claim.device) {
      clearPendingPairing();
      const credentials = {
        deviceUuid: claim.device.deviceUuid,
        deviceId: claim.device.deviceId,
        secret: pending.secret,
        name: claim.device.name,
        wsUrl: claim.device.wsUrl,
        pairedAt: new Date().toISOString(),
      };
      saveCredentials(credentials);
      showToast('Headset paired successfully.', 'success');
      showPlayer();
      await resumeWithCredentials(credentials);
      return;
    }
    if (claim?.status === 'expired') {
      clearPendingPairing();
      clearPlayerCredential(false);
      setPairingView('idle', 'Pairing code expired. Generate a new code.');
      return;
    }
    if (claim?.status === 'cancelled') {
      clearPendingPairing();
      clearPlayerCredential(false);
      setPairingView('idle', 'Pairing was cancelled by the administrator.');
      return;
    }
    schedulePairingPoll(pending.claimIntervalMs || 1500);
  } catch (error) {
    if (error.statusCode === 404) {
      clearPendingPairing();
      clearPlayerCredential(false);
      setPairingView('idle', 'This pairing request is no longer available. Start again.');
      return;
    }
    el.pairingStatus.textContent = 'Gateway unreachable. Retrying…';
    schedulePairingPoll(2500);
  }
}

function cancelPairing() {
  clearPendingPairing();
  clearPlayerCredential(false);
  setPairingView('idle');
  el.pairingError.hidden = true;
}

function clearPlayerCredential(showMessage = true) {
  state.credentials = null;
  removeStorage(STORAGE.credentials);
  disconnectSocket();
  stopHeartbeat();
  stopPreview();
  clearSchedule();
  if (state.immersive) {
    void state.immersive.exit();
  }
  resetPlaybackUi();
  if (showMessage) {
    showPairing('This headset is no longer paired. Generate a new pairing code.', 'resume');
  }
}

async function resumeWithCredentials(credentials) {
  state.credentials = credentials;
  state.authPermanentFailure = false;
  updatePlayerIdentity();
  try {
    await loadSession(credentials);
  } catch (error) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      clearPlayerCredential(false);
      showPairing(errorMessage(error), 'resume');
      return;
    }
    showToast('Gateway is unreachable. Will keep retrying the live connection.', 'warn');
    setConnection('offline', 'Gateway offline');
  }
  connectWebSocket();
}

async function refreshSession(showMessage = false) {
  if (!state.credentials) return;
  try {
    await loadSession(state.credentials);
    if (showMessage) showToast('Video library refreshed.', 'success');
  } catch (error) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      clearPlayerCredential(false);
      showPairing(errorMessage(error), 'resume');
      return;
    }
    if (showMessage) showToast(errorMessage(error), 'error');
  }
}

async function loadSession(credentials) {
  const session = await api('/api/player/session', {
    method: 'POST',
    body: { deviceUuid: credentials.deviceUuid, secret: credentials.secret },
  });
  state.library = Array.isArray(session.videos) ? session.videos : [];
  state.heartbeatIntervalMs = Number(session.heartbeatIntervalMs) || 5000;
  state.model = session.device?.model || state.model;
  state.credentials = {
    ...credentials,
    deviceId: session.device?.id || credentials.deviceId,
    name: session.device?.name || credentials.name,
    model: session.device?.model || credentials.model,
    secret: credentials.secret,
  };
  saveCredentials(state.credentials);
  updatePlayerIdentity();
  renderLibrary();
  if (state.current) {
    const refreshed = state.library.find((video) => video.id === state.current.id);
    if (!refreshed) {
      resetPlaybackUi();
      showToast('The video that was playing was removed from the library.', 'warn');
    } else {
      state.current = refreshed;
      updateNowPlaying();
      if (state.immersive) state.immersive.setMedia(refreshed);
    }
  }
}

async function sampleClock() {
  let best = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const start = Date.now();
    try {
      const payload = await api('/api/player/bootstrap');
      const end = Date.now();
      const serverTime = Date.parse(payload.serverTime);
      if (!Number.isFinite(serverTime)) continue;
      const rtt = end - start;
      const offset = serverTime - (start + end) / 2;
      if (!best || rtt < best.rtt) best = { offset, rtt };
    } catch {
      // Try again.
    }
  }
  if (best) {
    state.serverOffsetMs = best.offset;
    state.rttMs = best.rtt;
    state.lastClockSampleAt = Date.now();
  }
}

function serverNow() {
  return Date.now() + state.serverOffsetMs;
}

/* -------------------------------------------------------------------------- */
/* WebSocket protocol                                                          */
/* -------------------------------------------------------------------------- */

function websocketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws?role=device`;
}

function envelope(type, payload, messageId = uuid()) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId,
    type,
    deviceId: state.credentials?.deviceUuid,
    timestamp: new Date().toISOString(),
    payload,
  };
}

function send(type, payload) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.credentials) return false;
  try {
    state.ws.send(JSON.stringify(envelope(type, payload)));
    return true;
  } catch {
    return false;
  }
}

function connectWebSocket() {
  if (!state.credentials || state.authPermanentFailure) return;
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (state.wsRetryTimer) {
    clearTimeout(state.wsRetryTimer);
    state.wsRetryTimer = null;
  }

  state.wsExpectedClose = false;
  setConnection('connecting', 'Connecting');
  const socket = new WebSocket(websocketUrl());
  state.ws = socket;

  const authTimeout = setTimeout(() => {
    if (!state.wsAuthenticated) {
      setConnection('offline', 'Auth timeout');
      socket.close();
    }
  }, 12000);

  socket.addEventListener('open', () => {
    setConnection('connecting', 'Authenticating');
    send('DEVICE_AUTH', {
      secret: state.credentials.secret,
      appVersion: PLAYER_VERSION,
      model: state.model,
      capabilities: capabilities(),
    });
  });

  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message?.protocolVersion !== PROTOCOL_VERSION) {
      showToast('Gateway protocol version does not match this player.', 'error');
      return;
    }
    if (message.type === 'AUTH_OK') {
      clearTimeout(authTimeout);
      handleAuthOk(message);
      return;
    }
    if (message.type === 'AUTH_ERROR') {
      clearTimeout(authTimeout);
      handleAuthError(message);
      return;
    }
    if (!state.wsAuthenticated) return;
    void handleGatewayMessage(message);
  });

  socket.addEventListener('close', (event) => {
    clearTimeout(authTimeout);
    if (state.ws !== socket) return;
    state.ws = null;
    state.wsAuthenticated = false;
    stopHeartbeat();
    setConnection('offline', 'Disconnected');
    if (event.code === 4001) {
      clearPlayerCredential(false);
      showPairing('This headset was unpaired from the dashboard.', 'resume');
      return;
    }
    if (!state.wsExpectedClose && state.credentials && !state.authPermanentFailure) {
      scheduleReconnect();
    }
  });

  socket.addEventListener('error', () => {
    // The close event handles reconnects and status updates.
  });
}

function scheduleReconnect() {
  if (state.wsRetryTimer || !state.credentials || state.authPermanentFailure) return;
  state.wsRetry = Math.min(state.wsRetry + 1, 6);
  const delay = Math.min(15000, 900 * 2 ** (state.wsRetry - 1));
  setConnection('offline', `Retrying in ${Math.ceil(delay / 1000)}s`);
  state.wsRetryTimer = setTimeout(() => {
    state.wsRetryTimer = null;
    connectWebSocket();
  }, delay);
}

function disconnectSocket() {
  state.wsExpectedClose = true;
  state.wsAuthenticated = false;
  if (state.wsRetryTimer) {
    clearTimeout(state.wsRetryTimer);
    state.wsRetryTimer = null;
  }
  if (state.ws) {
    try {
      state.ws.close(1000, 'Player signing out');
    } catch {
      // Ignore.
    }
    state.ws = null;
  }
  setConnection('offline', 'Disconnected');
}

function handleAuthOk(message) {
  state.wsAuthenticated = true;
  state.wsRetry = 0;
  const config = message.payload?.config;
  if (config?.heartbeatIntervalMs) {
    state.heartbeatIntervalMs = clamp(Number(config.heartbeatIntervalMs), 1000, 60000);
  }
  if (message.payload?.serverTime) {
    const serverTime = Date.parse(message.payload.serverTime);
    if (Number.isFinite(serverTime)) state.serverOffsetMs = serverTime - Date.now();
  }
  if (message.payload?.displayName) {
    state.credentials.name = message.payload.displayName;
    saveCredentials(state.credentials);
    updatePlayerIdentity();
  }
  setConnection('online', 'Live');
  showToast('Connected to the gateway.', 'success');
  startHeartbeat();
  void sendDeviceStatus();
  void sampleClock();
  void refreshSession(false);
}

function handleAuthError(message) {
  const code = message.payload?.code;
  const text = message.payload?.message || 'Authentication failed';
  state.authPermanentFailure = true;
  state.wsAuthenticated = false;
  stopHeartbeat();
  setConnection('offline', 'Not paired');
  if (code === 'REVOKED' || code === 'UNKNOWN_DEVICE' || code === 'BAD_CREDENTIAL') {
    clearPlayerCredential(false);
    showPairing(text, 'resume');
  } else {
    showToast(text, 'error');
    scheduleReconnect();
  }
}

async function handleGatewayMessage(message) {
  switch (message.type) {
    case 'PING':
      send('PONG', {
        clientTime: message.payload?.clientTime,
        serverTime: new Date().toISOString(),
      });
      break;
    case 'PONG':
      break;
    case 'STATUS_REQUEST':
      void sendDeviceStatus();
      break;
    case 'PLAY': {
      const commandId = message.messageId;
      try {
        const result = await playVideo(
          message.payload?.positionSeconds,
          message.payload?.scheduledAt,
        );
        ack(commandId, true, result.scheduled ? 'Playback scheduled.' : undefined);
      } catch (error) {
        ack(commandId, false, errorMessage(error));
      }
      break;
    }
    case 'PAUSE': {
      pauseVideo();
      ack(message.messageId, true);
      break;
    }
    case 'STOP': {
      stopVideo();
      ack(message.messageId, true);
      break;
    }
    case 'SEEK': {
      seekTo(Number(message.payload?.positionSeconds));
      ack(message.messageId, true);
      break;
    }
    case 'LOAD_VIDEO': {
      try {
        await loadVideo(message.payload?.videoId);
        ack(message.messageId, true);
      } catch (error) {
        ack(message.messageId, false, errorMessage(error));
      }
      break;
    }
    case 'SET_VOLUME': {
      setVolume(Number(message.payload?.volume), false);
      ack(message.messageId, true);
      break;
    }
    case 'GET_STATUS': {
      ack(message.messageId, true);
      void sendDeviceStatus();
      break;
    }
    case 'REQUEST_PREVIEW': {
      try {
        await startPreview();
        ack(message.messageId, true);
      } catch (error) {
        ack(message.messageId, false, errorMessage(error));
      }
      break;
    }
    case 'STOP_PREVIEW': {
      stopPreview();
      ack(message.messageId, true);
      break;
    }
    case 'RELOAD_PLAYER': {
      ack(message.messageId, true);
      setTimeout(() => location.reload(), 350);
      break;
    }
    case 'ENTER_IMMERSIVE': {
      try {
        await enterImmersive();
        ack(message.messageId, true);
      } catch (error) {
        ack(
          message.messageId,
          false,
          `${errorMessage(error)} Tap Enter VR on the headset to allow immersive mode.`,
        );
      }
      break;
    }
    case 'PROTOCOL_ERROR': {
      showToast(message.payload?.message || 'Gateway reported a protocol error.', 'error');
      break;
    }
    case 'CONFIG_UPDATE':
    case 'DOWNLOAD_VIDEO':
    case 'CANCEL_DOWNLOAD':
      break;
    default:
      break;
  }
}

function ack(commandId, success, detail) {
  if (!commandId) return;
  const payload = { commandId, success };
  if (detail) payload.detail = String(detail).slice(0, 2000);
  if (success) payload.playback = playbackSnapshot();
  send('COMMAND_ACK', payload);
}

function capabilities() {
  return {
    projection360: true,
    projection180: true,
    stereoscopic: true,
    snapshotPreview: true,
    webrtcPreview: false,
    headPose: true,
    resumableDownloads: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Device status + clock                                                       */
/* -------------------------------------------------------------------------- */

function playbackSnapshot() {
  const duration = Number.isFinite(el.video.duration) && el.video.duration > 0 ? el.video.duration : null;
  return {
    state: state.playbackState,
    videoId: state.current?.id ?? null,
    videoName: state.current?.name ?? null,
    positionSeconds: Number.isFinite(el.video.currentTime) ? Math.max(0, el.video.currentTime) : 0,
    durationSeconds: duration,
    volume: clamp(Number(state.volume), 0, 1),
    positionConfirmed: true,
    error: state.playbackError,
    updatedAt: new Date().toISOString(),
  };
}

function playbackEventName(value = state.playbackState) {
  if (value === 'idle') return 'stopped';
  if (value === 'buffering') return 'buffering';
  return value;
}

function sendPlaybackEvent(event = playbackEventName()) {
  const snapshot = playbackSnapshot();
  send('PLAYBACK_EVENT', {
    event,
    videoId: snapshot.videoId,
    videoName: snapshot.videoName,
    positionSeconds: snapshot.positionSeconds,
    durationSeconds: snapshot.durationSeconds,
    volume: snapshot.volume,
    error: state.playbackError,
  });
}

async function sendDeviceStatus() {
  if (!state.wsAuthenticated) return;
  const battery = await readBattery();
  send('DEVICE_STATUS', {
    appVersion: PLAYER_VERSION,
    model: state.model,
    batteryLevel: battery.level,
    charging: battery.charging,
    playback: playbackSnapshot(),
    // The browser player streams from the gateway, so its "inventory" is the
    // shared library exposed by /api/player/session.
    inventoryCount: state.library.length,
    // navigator.storage.estimate() reports this origin's browser quota, not
    // the headset's free disk. Report null instead of a misleading value.
    storage: { freeBytes: null, totalBytes: null },
    uptimeSeconds: Math.max(0, Math.floor(performance.now() / 1000)),
    capabilities: capabilities(),
  });
}

async function readBattery() {
  if (state.battery) return state.battery;
  if (typeof navigator.getBattery !== 'function') {
    state.battery = { level: null, charging: null };
    return state.battery;
  }
  try {
    const battery = await navigator.getBattery();
    const update = () => {
      state.battery = {
        level: Math.round(clamp(battery.level, 0, 1) * 100),
        charging: Boolean(battery.charging),
      };
    };
    update();
    battery.addEventListener?.('levelchange', update);
    battery.addEventListener?.('chargingchange', update);
    return state.battery;
  } catch {
    state.battery = { level: null, charging: null };
    return state.battery;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  const interval = clamp(state.heartbeatIntervalMs, 2000, 60000);
  state.heartbeatTimer = setInterval(() => void sendDeviceStatus(), interval);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') void sendDeviceStatus();
}

/* -------------------------------------------------------------------------- */
/* Video playback                                                              */
/* -------------------------------------------------------------------------- */

function setPlaybackState(next, options = {}) {
  if (!next) return;
  const changed = state.playbackState !== next;
  state.playbackState = next;
  if (next !== 'error') state.playbackError = options.clearError === false ? state.playbackError : null;
  updateTransportUi();
  if (changed || options.force) sendPlaybackEvent(playbackEventName(next));
  if (next === 'playing') armControlsHide();
  else showControls();
}

function playbackError(message) {
  state.playbackError = message || 'Playback error';
  setPlaybackState('error');
  showVideoError(state.playbackError);
  sendPlaybackEvent('error');
}

async function loadVideo(videoId) {
  const video = state.library.find((item) => item.id === videoId);
  if (!video) throw new Error('That video is not available in this headset library.');
  clearSchedule();
  if (state.current?.id === video.id && el.video.src && el.video.readyState >= 1) {
    clearSchedule();
    state.intent = 'load';
    el.video.pause();
    state.intent = 'idle';
    showVideoSurface();
    updateNowPlaying();
    hideLoading();
    hideVideoError();
    // Emit a confirmed ready event even when the file is already buffered so a
    // scheduled group LOAD_VIDEO command can complete without waiting for the
    // 15-second ready timeout.
    setPlaybackState('ready', { force: true, clearError: true });
    return;
  }

  state.intent = 'load';
  state.current = video;
  state.playbackError = null;
  showVideoSurface();
  updateNowPlaying();
  updateLibrarySelection();
  showLoading('Preparing video…');
  setPlaybackState('loading', { force: true, clearError: true });

  try {
    el.video.pause();
    el.video.muted = state.muted;
    el.video.volume = clamp(state.volume, 0, 1);
    el.video.src = video.streamUrl;
    el.video.load();
    await waitForMedia(el.video, 'loadedmetadata', 25000);
    if (!state.current || state.current.id !== video.id) return;
    el.video.currentTime = 0;
    hideLoading();
    hideVideoError();
    setPlaybackState('ready', { force: true, clearError: true });
    if (state.immersive) state.immersive.setMedia(video);
    updateTransportUi();
    updateNowPlaying();
    showToast(`Loaded ${video.name}`, 'success', 2400);
  } catch (error) {
    hideLoading();
    if (!state.current || state.current.id !== video.id) return;
    playbackError(errorMessage(error));
    throw error;
  } finally {
    state.intent = 'idle';
  }
}

async function playVideo(positionSeconds, scheduledAt) {
  if (!state.current) throw new Error('No video is loaded on this headset.');
  if (el.video.readyState < 2) {
    await waitForMedia(el.video, 'canplay', 15000);
  }
  state.userInteracted = true;
  clearSchedule();

  const startAt = Number(scheduledAt);
  const basePosition =
    Number.isFinite(Number(positionSeconds)) && Number(positionSeconds) >= 0
      ? Number(positionSeconds)
      : el.video.currentTime;

  if (Number.isFinite(startAt) && startAt > serverNow() + 40) {
    const delay = startAt - serverNow();
    state.scheduledStartAt = startAt;
    state.scheduleBaseSeconds = basePosition;
    setPlaybackState('ready', { clearError: true });
    updateStatusLine(`Scheduled start in ${(delay / 1000).toFixed(1)}s`);
    state.scheduleTimer = setTimeout(() => {
      const lateSeconds = Math.max(0, (serverNow() - startAt) / 1000);
      void startPlayback(basePosition + lateSeconds).catch((error) => {
        playbackError(errorMessage(error));
      });
    }, Math.max(0, delay));
    return { scheduled: true };
  }

  const lateSeconds =
    Number.isFinite(startAt) && startAt > 0 ? Math.max(0, (serverNow() - startAt) / 1000) : 0;
  await startPlayback(basePosition + lateSeconds);
  return { scheduled: false };
}

async function startPlayback(positionSeconds) {
  clearSchedule();
  state.intent = 'play';
  const duration = Number.isFinite(el.video.duration) ? el.video.duration : null;
  let target = Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : el.video.currentTime;
  if (duration && target > Math.max(0, duration - 0.15)) target = Math.max(0, duration - 0.15);
  try {
    if (Math.abs(el.video.currentTime - target) > 0.08) {
      el.video.currentTime = target;
    }
    if (state.autoMuted) {
      el.video.muted = true;
    } else {
      el.video.muted = state.muted;
    }
    el.video.volume = clamp(state.volume, 0, 1);
    try {
      await el.video.play();
    } catch (error) {
      if (error?.name === 'NotAllowedError' || error?.name === 'NotSupportedError') {
        // Browser autoplay policy: keep the group timeline moving muted and
        // let the wearer restore audio with a tap.
        state.autoMuted = true;
        el.video.muted = true;
        await el.video.play();
        el.tapBanner.hidden = false;
        updateMuteUi();
        showToast('Audio is muted until you tap the screen.', 'warn', 5000);
      } else {
        throw error;
      }
    }
    if (!state.scheduledStartAt || serverNow() >= state.scheduledStartAt) {
      state.scheduledStartAt = null;
    }
    hideVideoError();
    setPlaybackState('playing');
    updatePlaybackButtons();
    updateTransportUi();
  } finally {
    state.intent = 'idle';
  }
}

function pauseVideo() {
  clearSchedule();
  state.intent = 'pause';
  el.video.pause();
  if (state.playbackState !== 'ended') setPlaybackState('paused');
  updatePlaybackButtons();
  state.intent = 'idle';
}

function stopVideo() {
  clearSchedule();
  state.intent = 'stop';
  el.video.pause();
  try {
    el.video.currentTime = 0;
  } catch {
    // Metadata may not be ready.
  }
  state.scheduledStartAt = null;
  setPlaybackState('idle', { clearError: true });
  state.intent = 'idle';
  updateTransportUi();
  updatePlaybackButtons();
}

function seekTo(positionSeconds) {
  if (!Number.isFinite(positionSeconds)) return;
  const duration = Number.isFinite(el.video.duration) ? el.video.duration : 0;
  const target = clamp(positionSeconds, 0, duration || Number.MAX_SAFE_INTEGER);
  try {
    el.video.currentTime = target;
  } catch {
    return;
  }
  if (state.playbackState === 'ended') setPlaybackState('paused');
  updateTransportUi();
}

function setVolume(value, persist = true) {
  if (!Number.isFinite(value)) return;
  state.volume = clamp(value, 0, 1);
  el.video.volume = state.volume;
  if (state.volume > 0) {
    state.muted = false;
    state.autoMuted = false;
    el.video.muted = false;
    el.tapBanner.hidden = true;
  } else {
    state.muted = true;
    el.video.muted = true;
  }
  el.volume.value = String(state.volume);
  if (persist) {
    writeStorage(STORAGE.volume, String(state.volume));
    writeStorage(STORAGE.muted, String(state.muted));
  }
  updateMuteUi();
}

function toggleMute() {
  if (state.muted || state.autoMuted) {
    state.autoMuted = false;
    state.muted = false;
    el.video.muted = false;
    if (!state.volume) {
      state.volume = 0.8;
      el.video.volume = state.volume;
      el.volume.value = String(state.volume);
    }
    el.tapBanner.hidden = true;
  } else {
    state.muted = true;
    el.video.muted = true;
  }
  writeStorage(STORAGE.muted, String(state.muted));
  writeStorage(STORAGE.volume, String(state.volume));
  updateMuteUi();
}

function clearSchedule() {
  if (state.scheduleTimer) {
    clearTimeout(state.scheduleTimer);
    state.scheduleTimer = null;
  }
  state.scheduledStartAt = null;
}

/* -------------------------------------------------------------------------- */
/* Immersive mode                                                              */
/* -------------------------------------------------------------------------- */

async function ensureImmersive() {
  if (state.immersive) return state.immersive;
  state.immersive = await createImmersivePlayer({
    video: el.video,
    canvas: el.xrCanvas,
    onHeadPose: (pose) => {
      if (!state.previewActive) return;
      const now = Date.now();
      if (now - state.lastPoseSentAt < 250) return;
      state.lastPoseSentAt = now;
      send('HEAD_POSE', {
        rotation: { x: pose.x, y: pose.y, z: pose.z, w: pose.w },
        sampleTimestamp: pose.sampleTimestamp,
        sessionActive: true,
      });
    },
    onSessionChange: (active) => {
      state.isImmersive = active;
      el.btnEnterVr.hidden = active;
      el.btnExitVr.hidden = !active;
      el.titleOverlay.hidden = active || !state.current;
      showControls();
      if (active) {
        showToast('Immersive mode active. Exit from the Quest browser menu.', 'success', 5000);
      }
    },
    onError: (message) => {
      playbackError(message);
    },
  });
  return state.immersive;
}

async function enterImmersive() {
  if (!state.current) throw new Error('Load a video before entering VR.');
  const immersive = await ensureImmersive();
  await immersive.enter(state.current);
  state.isImmersive = true;
  setPlaybackState(state.playbackState === 'playing' ? 'playing' : state.playbackState);
}

async function exitImmersive() {
  if (state.immersive) await state.immersive.exit();
}

/* -------------------------------------------------------------------------- */
/* Preview frames                                                              */
/* -------------------------------------------------------------------------- */

async function startPreview() {
  if (!state.current) throw new Error('Load a video before requesting a preview.');
  stopPreview();
  state.previewActive = true;
  const first = captureFrame();
  if (first) sendPreviewFrame(first);
  state.previewTimer = setInterval(() => {
    const frame = captureFrame();
    if (frame) sendPreviewFrame(frame);
  }, 1000);
}

function stopPreview() {
  state.previewActive = false;
  if (state.previewTimer) {
    clearInterval(state.previewTimer);
    state.previewTimer = null;
  }
}

function captureFrame() {
  if (state.isImmersive && state.immersive) {
    const dataUrl = state.immersive.capture();
    if (!dataUrl) return null;
    return {
      dataUrl,
      width: el.xrCanvas.width,
      height: el.xrCanvas.height,
    };
  }
  const width = el.video.videoWidth;
  const height = el.video.videoHeight;
  if (!width || !height || el.video.readyState < 2) return null;

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 960 / width);
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  try {
    context.drawImage(el.video, 0, 0, canvas.width, canvas.height);
    let quality = 0.72;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 1_700_000 && quality > 0.32) {
      quality -= 0.15;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return { dataUrl, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

function sendPreviewFrame(frame) {
  const comma = frame.dataUrl.indexOf(',');
  if (comma < 0) return;
  const dataBase64 = frame.dataUrl.slice(comma + 1);
  if (dataBase64.length > 2_000_000) return;
  send('PREVIEW_SIGNAL', {
    mode: 'snapshot',
    mimeType: 'image/jpeg',
    dataBase64,
    width: Math.max(1, Math.round(frame.width)),
    height: Math.max(1, Math.round(frame.height)),
    capturedAt: new Date().toISOString(),
    includesUserInterface: false,
  });
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

function updatePlayerIdentity() {
  const credentials = state.credentials;
  el.deviceName.textContent = credentials?.name || credentials?.deviceId || 'Quest headset';
  const model = credentials?.model || state.model;
  el.deviceMeta.textContent = `${model} · Browser player`;
  document.title = credentials?.name
    ? `${credentials.name} · VR Control Center Player`
    : 'VR Control Center · Quest Player';
}

function renderLibrary() {
  el.libraryList.replaceChildren();
  el.libraryCount.textContent = `${state.library.length} video${state.library.length === 1 ? '' : 's'}`;
  el.libraryEmpty.hidden = state.library.length > 0;

  for (const video of state.library) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'library-item';
    button.setAttribute('aria-current', state.current?.id === video.id ? 'true' : 'false');

    const thumb = document.createElement('div');
    thumb.className = 'library-thumb';
    if (video.thumbnailUrl) {
      const image = document.createElement('img');
      image.src = video.thumbnailUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => image.remove(), { once: true });
      thumb.appendChild(image);
    } else {
      thumb.textContent = 'VIDEO';
    }

    const copy = document.createElement('div');
    copy.className = 'library-item-copy';
    const title = document.createElement('div');
    title.className = 'library-item-title';
    title.textContent = video.name;
    title.title = video.name;
    const meta = document.createElement('div');
    meta.className = 'library-item-meta';
    const projection = document.createElement('span');
    projection.className = 'library-pill';
    projection.textContent = video.projectionType === 'flat' ? 'Flat' : `${video.projectionType}°`;
    meta.appendChild(projection);
    if (video.stereoLayout !== 'mono') {
      const stereo = document.createElement('span');
      stereo.className = 'library-pill';
      stereo.textContent = video.stereoLayout.toUpperCase();
      meta.appendChild(stereo);
    }
    const duration = document.createElement('span');
    duration.textContent = formatTime(video.durationSeconds);
    meta.appendChild(duration);
    const size = document.createElement('span');
    size.textContent = formatBytes(video.sizeBytes);
    meta.appendChild(size);
    if (video.compatibility === 'unverified') {
      const warning = document.createElement('span');
      warning.className = 'library-pill library-pill--warn';
      warning.textContent = 'Unverified';
      meta.appendChild(warning);
    }

    copy.append(title, meta);
    button.append(thumb, copy);
    button.addEventListener('click', () => {
      state.userInteracted = true;
      void loadVideo(video.id)
        .then(() => {
          closeLibrary();
          armControlsHide();
        })
        .catch((error) => showToast(errorMessage(error), 'error', 6000));
    });
    el.libraryList.appendChild(button);
  }
}

function updateLibrarySelection() {
  for (const button of el.libraryList.querySelectorAll('.library-item')) {
    const index = [...el.libraryList.children].indexOf(button);
    const video = state.library[index];
    button.setAttribute('aria-current', video?.id === state.current?.id ? 'true' : 'false');
  }
}

function updateNowPlaying() {
  if (!state.current) {
    el.titleOverlay.hidden = true;
    return;
  }
  el.titleOverlay.hidden = state.isImmersive;
  el.nowPlayingTitle.textContent = state.current.name;
  const projection = state.current.projectionType === 'flat' ? 'Flat 2D' : `${state.current.projectionType}° immersive`;
  const stereo = state.current.stereoLayout === 'mono' ? 'mono' : state.current.stereoLayout.toUpperCase();
  el.nowPlayingMeta.textContent = `${projection} · ${stereo} · ${formatTime(state.current.durationSeconds)}`;
}

function showVideoSurface() {
  el.stage.classList.add('video-active');
  el.stageEmpty.hidden = true;
}

function resetPlaybackUi() {
  clearSchedule();
  stopPreview();
  state.current = null;
  state.playbackState = 'idle';
  state.playbackError = null;
  state.intent = 'idle';
  state.isImmersive = false;
  el.video.pause();
  el.video.removeAttribute('src');
  el.video.load();
  el.video.hidden = false;
  el.xrCanvas.hidden = true;
  el.stage.classList.remove('video-active');
  el.stageEmpty.hidden = false;
  el.titleOverlay.hidden = true;
  el.tapBanner.hidden = true;
  el.btnEnterVr.hidden = false;
  el.btnExitVr.hidden = true;
  hideLoading();
  hideVideoError();
  updateLibrarySelection();
  updateTransportUi();
  updatePlaybackButtons();
  setConnection(state.wsAuthenticated ? 'online' : 'offline', state.wsAuthenticated ? 'Live' : 'Disconnected');
}

function updateTransportUi() {
  const duration = Number.isFinite(el.video.duration) && el.video.duration > 0 ? el.video.duration : 0;
  el.seek.max = String(Math.max(0, duration));
  el.seek.value = String(clamp(el.video.currentTime || 0, 0, duration || 0));
  el.timeCurrent.textContent = formatTime(el.video.currentTime);
  el.timeTotal.textContent = formatTime(duration);
  const active = Boolean(state.current);
  el.btnPlay.disabled = !active || state.playbackState === 'playing' || state.playbackState === 'buffering';
  el.btnPause.disabled = !active || !['playing', 'buffering', 'ready'].includes(state.playbackState);
  el.btnStop.disabled = !active;
  el.btnBack.disabled = !active;
  el.btnForward.disabled = !active;
  el.seek.disabled = !active;
  updatePlaybackButtons();
  updateStatusLine();
}

function updatePlaybackButtons() {
  const playing = state.playbackState === 'playing' || state.playbackState === 'buffering';
  el.btnPlay.dataset.active = playing ? 'false' : 'true';
  el.btnPlay.textContent = state.scheduledStartAt ? 'Scheduled' : 'Play';
  el.btnPause.dataset.active = playing ? 'true' : 'false';
}

function updateStatusLine(message) {
  if (message) {
    el.statusLine.textContent = message;
    return;
  }
  if (!state.current) {
    el.statusLine.textContent = 'Idle · choose a video';
    return;
  }
  const stateText = {
    idle: 'Stopped',
    loading: 'Loading',
    buffering: 'Buffering',
    ready: 'Ready',
    playing: 'Playing',
    paused: 'Paused',
    ended: 'Ended',
    error: 'Error',
  }[state.playbackState] || state.playbackState;
  const schedule = state.scheduledStartAt
    ? ` · starts in ${Math.max(0, (state.scheduledStartAt - serverNow()) / 1000).toFixed(1)}s`
    : '';
  const sync = state.rttMs === null ? '' : ` · clock ${Math.round(state.rttMs)} ms`;
  el.statusLine.textContent = `${stateText}${schedule}${sync}`;
}

function updateMuteUi() {
  const muted = state.muted || state.autoMuted;
  el.btnMute.textContent = muted ? 'Unmute' : 'Mute';
  el.btnMute.dataset.active = muted ? 'true' : 'false';
  el.video.muted = muted;
}

function showLoading(message) {
  el.loadingMessage.textContent = message || 'Loading…';
  el.loadingOverlay.hidden = false;
}

function hideLoading() {
  el.loadingOverlay.hidden = true;
}

function showVideoError(message) {
  if (!message) return;
  el.errorMessage.textContent = message;
  el.errorOverlay.hidden = false;
}

function hideVideoError() {
  el.errorOverlay.hidden = true;
}

function openLibrary() {
  el.libraryPanel.hidden = false;
  void refreshSession(false);
}

function closeLibrary() {
  el.libraryPanel.hidden = true;
}

function showControls() {
  el.stage.classList.remove('controls-hidden');
  armControlsHide();
}

function armControlsHide() {
  if (state.controlsTimer) {
    clearTimeout(state.controlsTimer);
    state.controlsTimer = null;
  }
  if (!state.current || !el.libraryPanel.hidden || state.playbackState !== 'playing') return;
  state.controlsTimer = setTimeout(() => {
    if (state.playbackState === 'playing' && el.libraryPanel.hidden) {
      el.stage.classList.add('controls-hidden');
    }
  }, 4200);
}

/* -------------------------------------------------------------------------- */
/* Event wiring                                                                */
/* -------------------------------------------------------------------------- */

function bindUi() {
  el.startPairing.addEventListener('click', () => void startPairing());
  el.cancelPairing.addEventListener('click', () => cancelPairing());
  el.repairHeadset.addEventListener('click', () => {
    state.authPermanentFailure = false;
    setPairingView('idle');
    el.pairingError.hidden = true;
  });
  el.toggleLibrary.addEventListener('click', () => {
    if (el.libraryPanel.hidden) openLibrary();
    else closeLibrary();
  });
  el.closeLibrary.addEventListener('click', closeLibrary);
  el.emptyOpenLibrary.addEventListener('click', openLibrary);
  el.refreshPlayer.addEventListener('click', () => void refreshSession(true));
  el.resetPairing.addEventListener('click', () => {
    if (window.confirm('Unpair this headset from the browser? You will need a new pairing code.')) {
      clearPlayerCredential(true);
    }
  });
  el.dismissError.addEventListener('click', () => {
    hideVideoError();
    if (state.playbackState === 'error') setPlaybackState(state.current ? 'ready' : 'idle');
  });
  el.enableAudio.addEventListener('click', () => {
    state.userInteracted = true;
    state.autoMuted = false;
    state.muted = false;
    el.video.muted = false;
    el.tapBanner.hidden = true;
    updateMuteUi();
    if (el.video.paused) void el.video.play().catch(() => undefined);
  });

  el.btnPlay.addEventListener('click', () => {
    state.userInteracted = true;
    void playVideo(undefined, undefined).catch((error) => showToast(errorMessage(error), 'error'));
  });
  el.btnPause.addEventListener('click', pauseVideo);
  el.btnStop.addEventListener('click', stopVideo);
  el.btnBack.addEventListener('click', () => seekTo(el.video.currentTime - 10));
  el.btnForward.addEventListener('click', () => seekTo(el.video.currentTime + 10));
  el.btnMute.addEventListener('click', toggleMute);
  el.volume.addEventListener('input', () => setVolume(Number(el.volume.value)));
  el.seek.addEventListener('input', () => {
    if (!state.current) return;
    el.timeCurrent.textContent = formatTime(Number(el.seek.value));
  });
  el.seek.addEventListener('change', () => seekTo(Number(el.seek.value)));
  el.seek.addEventListener('pointerup', () => seekTo(Number(el.seek.value)));

  el.btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {
        showToast('Fullscreen was not available in this browser.', 'warn');
      });
    } else {
      void document.exitFullscreen?.();
    }
  });
  el.btnEnterVr.addEventListener('click', () => {
    state.userInteracted = true;
    void enterImmersive()
      .then(() => showToast('Entering immersive mode…', 'success'))
      .catch((error) => showToast(errorMessage(error), 'error', 6000));
  });
  el.btnExitVr.addEventListener('click', () => void exitImmersive());

  el.video.addEventListener('loadedmetadata', updateTransportUi);
  el.video.addEventListener('durationchange', updateTransportUi);
  el.video.addEventListener('timeupdate', () => {
    updateTransportUi();
    updateStatusLine();
  });
  el.video.addEventListener('play', () => {
    if (state.current && state.immersive) state.immersive.setMedia(state.current);
    if (state.current) setPlaybackState('playing');
  });
  el.video.addEventListener('playing', () => {
    updateTransportUi();
    if (state.current) setPlaybackState('playing');
  });
  el.video.addEventListener('pause', () => {
    if (
      state.current &&
      !el.video.ended &&
      ['playing', 'buffering'].includes(state.playbackState) &&
      state.intent !== 'load' &&
      state.intent !== 'stop'
    ) {
      setPlaybackState('paused');
    }
    updateTransportUi();
  });
  el.video.addEventListener('waiting', () => {
    if (state.current && ['playing', 'buffering'].includes(state.playbackState)) {
      setPlaybackState('buffering');
    }
  });
  el.video.addEventListener('stalled', () => {
    if (state.current && state.playbackState === 'playing') setPlaybackState('buffering');
  });
  el.video.addEventListener('ended', () => {
    clearSchedule();
    if (state.current) setPlaybackState('ended');
    showControls();
  });
  el.video.addEventListener('error', () => {
    if (!state.current || state.intent === 'load') return;
    playbackError(mediaErrorMessage(el.video));
  });
  el.video.addEventListener('volumechange', updateMuteUi);

  window.addEventListener('pointerdown', onFirstPointer, { capture: true });
  window.addEventListener('pointermove', () => {
    if (state.current) showControls();
  }, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  el.stage.addEventListener('click', (event) => {
    if (event.target.closest('button, input, select, .library-panel')) return;
    showControls();
  });
}

function onFirstPointer() {
  state.userInteracted = true;
  if (state.autoMuted) {
    state.autoMuted = false;
    state.muted = false;
    el.video.muted = false;
    el.tapBanner.hidden = true;
    updateMuteUi();
    if (state.playbackState === 'playing') {
      el.video.play().catch(() => undefined);
    }
  }
}

function onKeyDown(event) {
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (event.code === 'Space') {
    event.preventDefault();
    state.userInteracted = true;
    if (state.playbackState === 'playing' || state.playbackState === 'buffering') pauseVideo();
    else void playVideo().catch((error) => showToast(errorMessage(error), 'error'));
  } else if (event.code === 'ArrowLeft') {
    event.preventDefault();
    seekTo(el.video.currentTime - 10);
  } else if (event.code === 'ArrowRight') {
    event.preventDefault();
    seekTo(el.video.currentTime + 10);
  } else if (event.key.toLowerCase() === 'f') {
    el.btnFullscreen.click();
  } else if (event.key.toLowerCase() === 'l') {
    if (el.libraryPanel.hidden) openLibrary();
    else closeLibrary();
  } else if (event.key === 'Escape' && !el.libraryPanel.hidden) {
    closeLibrary();
  }
}

/* -------------------------------------------------------------------------- */
/* Startup                                                                     */
/* -------------------------------------------------------------------------- */

async function init() {
  bindUi();
  updatePairingMeta();
  el.volume.value = String(state.volume);
  el.video.volume = state.volume;
  el.video.muted = state.muted;
  updateMuteUi();
  updateTransportUi();

  const bootstrap = api('/api/player/bootstrap')
    .then((payload) => {
      if (payload?.playerUrl) el.gatewayAddress.textContent = new URL(payload.playerUrl).host;
      if (payload?.serverTime) state.serverOffsetMs = Date.parse(payload.serverTime) - Date.now();
    })
    .catch(() => undefined);
  await bootstrap;
  void sampleClock();

  const credentials = loadCredentials();
  if (credentials) {
    state.credentials = credentials;
    showPlayer();
    updatePlayerIdentity();
    setConnection('connecting', 'Connecting');
    await resumeWithCredentials(credentials);
    return;
  }

  const pending = loadPendingPairing();
  if (pending) {
    state.pendingPairing = pending;
    showActivePairing();
    return;
  }

  showPairing();
  setConnection('offline', 'Not paired');
}

void init();
