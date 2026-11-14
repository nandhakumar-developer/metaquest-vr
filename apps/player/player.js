import {
  $,
  clamp,
  formatBytes,
  formatTime,
  setConnection,
  showToast,
} from './components/ui.js';
import { createSha256, sha256Hex } from './components/sha256.js';
import { createImmersivePlayer } from './webxr/immersive.js';

const PLAYER_VERSION = '1.0.0-browser';
const PROTOCOL_VERSION = 1;
const STORAGE = {
  credentials: 'vrcc.player.credentials.v1',
  pending: 'vrcc.player.pending.v1',
  volume: 'vrcc.player.volume.v1',
  muted: 'vrcc.player.muted.v1',
  downloads: 'vrcc.player.downloads.v1',
  libraryCache: 'vrcc.player.library.v1',
};
const OFFLINE_DB_NAME = 'vrcc-offline-media';
const OFFLINE_DB_VERSION = 1;
const PROGRESS_REPORT_INTERVAL_MS = 250;
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
  tapBanner: $('#tap-banner'),
  enableAudio: $('#enable-audio'),
  libraryPanel: $('#library-panel'),
  closeLibrary: $('#close-library'),
  libraryList: $('#library-list'),
  libraryCount: $('#library-count'),
  libraryEmpty: $('#library-empty'),
  downloadsList: $('#downloads-list'),
  downloadsEmpty: $('#downloads-empty'),
  downloadsSummary: $('#downloads-summary'),

  seek: $('#seek'),
  timeCurrent: $('#time-current'),
  timeTotal: $('#time-total'),
  btnPlay: $('#btn-play'),
  playToggleLabel: $('#play-toggle-label'),
  btnReplay: $('#btn-replay'),
  btnBack: $('#btn-back'),
  btnForward: $('#btn-forward'),
  btnMute: $('#btn-mute'),
  volume: $('#volume'),
  btnFullscreen: $('#btn-fullscreen'),
  btnEnterVr: $('#btn-enter-vr'),
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
  hasConnected: false,
  heartbeatTimer: null,
  libraryRefreshTimer: null,
  sessionRefresh: null,
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
  previewSession: 0,
  previewCanvas: null,
  previewContext: null,
  previewCapturePending: false,
  lastPoseSentAt: 0,
  immersive: null,
  isImmersive: false,
  intent: 'idle',
  controlsTimer: null,
  batteryManager: null,
  downloads: {},
  downloadJobs: new Map(),
  offlineDb: null,
  localMediaUrls: new Map(),
  previewMaxFps: 30,
  libraryFromCache: false,
  storageEstimate: null,
  storageEstimateAt: 0,
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

/* -------------------------------------------------------------------------- */
/* Offline media storage                                                       */
/* -------------------------------------------------------------------------- */

function loadDownloadIndex() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.downloads) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      state.downloads = parsed;
    }
  } catch {
    state.downloads = {};
  }
}

function saveDownloadIndex() {
  writeStorage(STORAGE.downloads, JSON.stringify(state.downloads));
}

function openOfflineDb() {
  if (state.offlineDb) return state.offlineDb;
  if (!globalThis.indexedDB) {
    return Promise.reject(
      new Error('Offline storage is not available in this browser. Use Meta Quest Browser.'),
    );
  }
  state.offlineDb = new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'videoId' });
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const chunks = db.createObjectStore('chunks', { keyPath: 'key' });
        chunks.createIndex('videoId', 'videoId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      state.offlineDb = null;
      reject(request.error ?? new Error('Could not open offline storage.'));
    };
    request.onblocked = () => {
      state.offlineDb = null;
      reject(new Error('Offline storage is blocked by another player tab.'));
    };
  });
  return state.offlineDb;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline storage request failed.'));
  });
}

function idbTransactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Offline storage transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Offline storage transaction was aborted.'));
  });
}

async function getAllDownloadMeta() {
  const db = await openOfflineDb();
  const transaction = db.transaction('meta', 'readonly');
  return idbRequest(transaction.objectStore('meta').getAll());
}

async function putDownloadMeta(meta) {
  const db = await openOfflineDb();
  const transaction = db.transaction('meta', 'readwrite');
  transaction.objectStore('meta').put(meta);
  await idbTransactionDone(transaction);
}

async function putDownloadChunk(videoId, index, data) {
  const db = await openOfflineDb();
  const transaction = db.transaction('chunks', 'readwrite');
  transaction.objectStore('chunks').put({
    key: `${videoId}:${String(index).padStart(8, '0')}`,
    videoId,
    index,
    data,
  });
  await idbTransactionDone(transaction);
}

async function deleteDownloadedMedia(videoId) {
  const db = await openOfflineDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(['meta', 'chunks'], 'readwrite');
    transaction.objectStore('meta').delete(videoId);
    const chunks = transaction.objectStore('chunks');
    const cursorRequest = chunks.index('videoId').openKeyCursor(IDBKeyRange.only(videoId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      chunks.delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not delete offline media.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Offline media deletion was aborted.'));
  });
  revokeLocalMediaUrl(videoId);
}

async function buildDownloadedBlob(videoId) {
  const db = await openOfflineDb();
  const metaTransaction = db.transaction('meta', 'readonly');
  const meta = await idbRequest(metaTransaction.objectStore('meta').get(videoId));
  if (!meta) return null;
  const chunksTransaction = db.transaction('chunks', 'readonly');
  const chunks = await idbRequest(
    chunksTransaction
      .objectStore('chunks')
      .index('videoId')
      .getAll(IDBKeyRange.only(videoId)),
  );
  if (!Array.isArray(chunks) || chunks.length === 0) return null;
  chunks.sort((left, right) => left.index - right.index);
  return {
    meta,
    blob: new Blob(
      chunks.map((chunk) => chunk.data),
      { type: meta.mimeType || 'video/mp4' },
    ),
  };
}

function revokeLocalMediaUrl(videoId) {
  const url = state.localMediaUrls.get(videoId);
  if (url) {
    URL.revokeObjectURL(url);
    state.localMediaUrls.delete(videoId);
  }
}

async function getLocalVideoUrl(videoId) {
  if (state.localMediaUrls.has(videoId)) return state.localMediaUrls.get(videoId);
  const record = state.downloads[videoId];
  if (!record || record.status !== 'downloaded') return null;
  try {
    const downloaded = await buildDownloadedBlob(videoId);
    if (!downloaded) {
      delete state.downloads[videoId];
      saveDownloadIndex();
      renderDownloads();
      renderLibrary();
      return null;
    }
    const url = URL.createObjectURL(downloaded.blob);
    state.localMediaUrls.set(videoId, url);
    return url;
  } catch (error) {
    showToast(`Offline copy could not be opened: ${errorMessage(error)}`, 'error', 6000);
    return null;
  }
}

async function refreshDownloadsFromDb() {
  try {
    const metas = await getAllDownloadMeta();
    const persisted = {};
    for (const meta of metas) {
      if (meta && typeof meta.videoId === 'string') {
        persisted[meta.videoId] = { ...meta, status: 'downloaded', progress: 1 };
      }
    }
    const interrupted = Object.entries(state.downloads)
      .filter(([videoId, record]) => record?.status === 'downloading' && !persisted[videoId])
      .map(([videoId]) => videoId);
    state.downloads = persisted;
    saveDownloadIndex();
    renderDownloads();
    renderLibrary();
    for (const videoId of interrupted) {
      void deleteDownloadedMedia(videoId).catch(() => undefined);
    }
  } catch {
    // Offline storage may be unavailable; keep the localStorage index.
    renderDownloads();
  }
}

function downloadRecordToMedia(record) {
  return {
    id: record.videoId,
    name: record.name || 'Downloaded video',
    durationSeconds: record.durationSeconds ?? null,
    sizeBytes: record.sizeBytes ?? 0,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    projectionType: record.projectionType || 'flat',
    stereoLayout: record.stereoLayout || 'mono',
    compatibility: 'verified',
    compatibilityNotes: null,
    streamUrl: null,
    thumbnailUrl: null,
    offline: true,
  };
}

function findVideo(videoId) {
  const libraryVideo = state.library.find((video) => video.id === videoId);
  if (libraryVideo) return libraryVideo;
  const record = state.downloads[videoId];
  return record ? downloadRecordToMedia(record) : null;
}

function cacheLibrary() {
  writeStorage(
    STORAGE.libraryCache,
    JSON.stringify({
      videos: state.library,
      device: state.credentials
        ? {
            deviceId: state.credentials.deviceId,
            name: state.credentials.name,
            model: state.credentials.model,
          }
        : null,
      savedAt: new Date().toISOString(),
    }),
  );
}

function restoreCachedLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.libraryCache) || 'null');
    if (parsed && Array.isArray(parsed.videos)) {
      state.library = parsed.videos;
      state.libraryFromCache = true;
      renderLibrary();
    }
  } catch {
    // Ignore a corrupt cache.
  }
}

function requestPersistentStorage() {
  try {
    const request = navigator.storage?.persist?.();
    if (request && typeof request.catch === 'function') request.catch(() => undefined);
  } catch {
    // Persistence is best effort; IndexedDB still works without it.
  }
}

async function readStorageEstimate() {
  if (
    state.storageEstimate &&
    Date.now() - state.storageEstimateAt < 15_000
  ) {
    return state.storageEstimate;
  }
  let estimate = { freeBytes: null, totalBytes: null };
  try {
    if (navigator.storage?.estimate) {
      const result = await navigator.storage.estimate();
      const quota = Number(result.quota);
      const usage = Number(result.usage) || 0;
      if (Number.isFinite(quota) && quota > 0) {
        estimate = {
          freeBytes: Math.max(0, Math.round(quota - usage)),
          totalBytes: Math.round(quota),
        };
      }
    }
  } catch {
    // Keep null storage values; the browser does not expose an estimate.
  }
  state.storageEstimate = estimate;
  state.storageEstimateAt = Date.now();
  return estimate;
}

function downloadStatusText(record) {
  if (record.status === 'downloading') {
    return `Downloading ${Math.round((record.progress || 0) * 100)}%`;
  }
  return 'Downloaded';
}

function renderDownloads() {
  if (!el.downloadsList) return;
  const records = Object.values(state.downloads).sort((left, right) => {
    const leftActive = left.status === 'downloading' ? 0 : 1;
    const rightActive = right.status === 'downloading' ? 0 : 1;
    if (leftActive !== rightActive) return leftActive - rightActive;
    return String(right.downloadedAt || '').localeCompare(String(left.downloadedAt || ''));
  });
  const downloading = records.filter((record) => record.status === 'downloading').length;
  const storedBytes = records.reduce(
    (total, record) =>
      total + (record.status === 'downloaded' ? Number(record.sizeBytes) || 0 : 0),
    0,
  );

  if (el.downloadsEmpty) el.downloadsEmpty.hidden = records.length > 0;
  if (el.downloadsSummary) {
    el.downloadsSummary.textContent =
      records.length === 0
        ? 'No offline copies'
        : `${formatBytes(storedBytes)} stored${downloading > 0 ? ` · ${downloading} downloading` : ''}`;
  }

  el.downloadsList.replaceChildren();
  for (const record of records) {
    const item = document.createElement('div');
    item.className = `download-item${record.status === 'downloading' ? ' download-item--active' : ''}`;

    const head = document.createElement('div');
    head.className = 'download-item-head';
    const copy = document.createElement('div');
    copy.className = 'download-item-copy';
    const title = document.createElement('div');
    title.className = 'download-item-title';
    title.textContent = record.name || record.filename || 'Downloaded video';
    title.title = title.textContent;
    const meta = document.createElement('div');
    meta.className = 'download-item-meta';
    const size = document.createElement('span');
    size.textContent = formatBytes(Number(record.sizeBytes) || 0);
    const status = document.createElement('span');
    status.textContent = downloadStatusText(record);
    meta.append(size, status);
    if (record.projectionType && record.projectionType !== 'flat') {
      const projection = document.createElement('span');
      projection.textContent = `${record.projectionType}°`;
      meta.appendChild(projection);
    }
    copy.append(title, meta);
    head.appendChild(copy);
    item.appendChild(head);

    if (record.status === 'downloading') {
      const progress = document.createElement('div');
      progress.className = 'download-progress';
      const bar = document.createElement('div');
      bar.className = 'download-progress-bar';
      bar.style.width = `${Math.max(0, Math.min(100, (record.progress || 0) * 100))}%`;
      progress.appendChild(bar);
      item.appendChild(progress);
    }

    const actions = document.createElement('div');
    actions.className = 'download-actions';
    if (record.status === 'downloading') {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'download-button download-button--danger';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => cancelActiveDownload(record.videoId));
      actions.appendChild(cancel);
    } else {
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'download-button';
      play.textContent = 'Play offline';
      play.addEventListener('click', () => {
        state.userInteracted = true;
        void loadVideo(record.videoId)
          .then(() => {
            closeLibrary();
            armControlsHide();
          })
          .catch((error) => showToast(errorMessage(error), 'error', 6000));
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'download-button download-button--danger';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => {
        if (!window.confirm(`Delete the offline copy of "${record.name || 'this video'}"?`)) {
          return;
        }
        void removeDownload(record.videoId);
      });
      actions.append(play, remove);
    }
    item.appendChild(actions);
    el.downloadsList.appendChild(item);
  }
}

async function removeDownload(videoId) {
  try {
    await deleteDownloadedMedia(videoId);
    delete state.downloads[videoId];
    saveDownloadIndex();
    renderDownloads();
    renderLibrary();
    if (state.current?.id === videoId && !state.wsAuthenticated) {
      resetPlaybackUi();
    }
    showToast('Offline copy deleted.', 'success');
    void sendDeviceStatus();
  } catch (error) {
    showToast(`Could not delete the offline copy: ${errorMessage(error)}`, 'error', 6000);
  }
}

function cancelActiveDownload(videoId) {
  for (const job of state.downloadJobs.values()) {
    if (job.record.videoId === videoId) {
      job.cancelled = true;
      job.controller.abort();
      return;
    }
  }
}

function reportDownloadProgress(job, force = false) {
  const now = Date.now();
  if (!force && now - job.lastReportAt < PROGRESS_REPORT_INTERVAL_MS) return;
  job.lastReportAt = now;
  const total = Math.max(0, Math.round(job.totalBytes));
  const received = Math.max(0, Math.round(job.receivedBytes));
  const progress = total > 0 ? Math.min(1, received / total) : 0;
  job.record.progress = progress;
  job.record.bytesReceived = received;
  job.record.totalBytes = total;
  renderDownloads();
  const elapsedSeconds = Math.max(0.001, (now - job.startedAt) / 1000);
  send('VIDEO_DOWNLOAD_PROGRESS', {
    deploymentId: job.payload.deploymentId,
    videoId: job.payload.videoId,
    bytesReceived: received,
    totalBytes: total,
    progress,
    throughputBytesPerSecond: Math.round(received / elapsedSeconds),
  });
}

function reportDownloadFailure(payload, error) {
  const message = errorMessage(error);
  showToast(`Download failed: ${message}`, 'error', 7000);
  send('VIDEO_READY', {
    deploymentId: payload.deploymentId,
    videoId: payload.videoId,
    checksum: payload.checksum,
    sizeBytes: 0,
    checksumVerified: false,
    localFilename: payload.filename || `${payload.videoId}.mp4`,
  });
}

async function runDownload(job) {
  const { payload, controller, record } = job;
  let dbReady = false;
  try {
    await openOfflineDb();
    dbReady = true;
    await deleteDownloadedMedia(payload.videoId);
    const response = await fetch(payload.url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Gateway returned HTTP ${response.status}`);
    }
    const headerTotal = Number(response.headers.get('content-length'));
    job.totalBytes =
      Number.isFinite(headerTotal) && headerTotal > 0
        ? headerTotal
        : Number(payload.sizeBytes) || 0;
    record.sizeBytes = job.totalBytes || record.sizeBytes;
    const hasher = createSha256();
    let chunkIndex = 0;

    const reader = response.body?.getReader();
    if (!reader) {
      const buffer = new Uint8Array(await response.arrayBuffer());
      hasher.update(buffer);
      job.receivedBytes = buffer.byteLength;
      await putDownloadChunk(payload.videoId, chunkIndex, new Blob([buffer], {
        type: 'application/octet-stream',
      }));
      chunkIndex += 1;
      reportDownloadProgress(job, true);
    } else {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) throw new Error('Download cancelled.');
        if (!value || value.byteLength === 0) continue;
        hasher.update(value);
        job.receivedBytes += value.byteLength;
        await putDownloadChunk(
          payload.videoId,
          chunkIndex,
          new Blob([value], { type: 'application/octet-stream' }),
        );
        chunkIndex += 1;
        reportDownloadProgress(job);
      }
    }

    if (controller.signal.aborted) throw new Error('Download cancelled.');
    if (job.totalBytes > 0 && job.receivedBytes !== job.totalBytes) {
      throw new Error(
        `Incomplete download: received ${formatBytes(job.receivedBytes)} of ${formatBytes(
          job.totalBytes,
        )}`,
      );
    }
    const checksum = hasher.digestHex();
    const expectedChecksum = String(payload.checksum || '').toLowerCase();
    const checksumVerified = !expectedChecksum || checksum === expectedChecksum;
    if (!checksumVerified) {
      throw new Error('Checksum verification failed. The downloaded file is corrupt.');
    }

    const meta = {
      videoId: payload.videoId,
      deploymentId: payload.deploymentId,
      name: payload.name,
      filename: payload.filename,
      checksum,
      sizeBytes: job.receivedBytes,
      mimeType: response.headers.get('content-type') || 'video/mp4',
      durationSeconds: payload.durationSeconds ?? null,
      projectionType: payload.projectionType,
      stereoLayout: payload.stereoLayout,
      chunkCount: chunkIndex,
      checksumVerified,
      downloadedAt: new Date().toISOString(),
    };
    await putDownloadMeta(meta);
    state.downloads[payload.videoId] = {
      ...meta,
      status: 'downloaded',
      progress: 1,
      bytesReceived: job.receivedBytes,
      totalBytes: job.receivedBytes,
    };
    saveDownloadIndex();
    renderDownloads();
    renderLibrary();
    reportDownloadProgress(job, true);
    send('VIDEO_READY', {
      deploymentId: payload.deploymentId,
      videoId: payload.videoId,
      checksum,
      sizeBytes: job.receivedBytes,
      checksumVerified: true,
      localFilename: payload.filename || `${payload.videoId}.mp4`,
    });
    showToast(`${payload.name || 'Video'} is ready to play offline.`, 'success', 4500);
    void sendDeviceStatus();
  } catch (error) {
    state.downloadJobs.delete(payload.deploymentId);
    if (dbReady) {
      try {
        await deleteDownloadedMedia(payload.videoId);
      } catch {
        // Best effort cleanup.
      }
    }
    delete state.downloads[payload.videoId];
    saveDownloadIndex();
    renderDownloads();
    renderLibrary();
    if (!job.cancelled && !controller.signal.aborted) {
      reportDownloadFailure(payload, error);
    } else {
      showToast('Download cancelled.', 'warn');
    }
  } finally {
    state.downloadJobs.delete(payload.deploymentId);
  }
}

function startDownload(payload) {
  if (!payload || typeof payload !== 'object') return;
  const { deploymentId, videoId } = payload;
  if (typeof deploymentId !== 'string' || typeof videoId !== 'string') return;
  if (state.downloadJobs.has(deploymentId)) return;

  // Surface the on-headset download section even when this video is already
  // stored locally and the gateway can complete the request immediately.
  el.libraryPanel.hidden = false;

  const existing = state.downloads[videoId];
  if (existing?.status === 'downloaded' && existing.checksum === payload.checksum) {
    send('VIDEO_DOWNLOAD_PROGRESS', {
      deploymentId,
      videoId,
      bytesReceived: Number(existing.sizeBytes) || 0,
      totalBytes: Number(existing.sizeBytes) || 0,
      progress: 1,
    });
    send('VIDEO_READY', {
      deploymentId,
      videoId,
      checksum: existing.checksum,
      sizeBytes: Number(existing.sizeBytes) || 0,
      checksumVerified: true,
      localFilename: existing.filename || `${videoId}.mp4`,
    });
    return;
  }

  const record = {
    videoId,
    deploymentId,
    name: payload.name,
    filename: payload.filename,
    sizeBytes: payload.sizeBytes,
    totalBytes: payload.sizeBytes,
    durationSeconds: payload.durationSeconds ?? null,
    projectionType: payload.projectionType,
    stereoLayout: payload.stereoLayout,
    status: 'downloading',
    progress: 0,
    bytesReceived: 0,
    downloadedAt: null,
  };
  state.downloads[videoId] = record;
  saveDownloadIndex();
  renderDownloads();
  const controller = new AbortController();
  const job = {
    payload,
    controller,
    record,
    receivedBytes: 0,
    totalBytes: Number(payload.sizeBytes) || 0,
    startedAt: Date.now(),
    lastReportAt: 0,
    cancelled: false,
  };
  state.downloadJobs.set(deploymentId, job);
  void runDownload(job);
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

function waitForMedia(video, eventName, timeoutMs) {
  const readyState =
    eventName === 'loadedmetadata' ? 1 : eventName === 'loadeddata' ? 2 : 3;
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener('error', onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(mediaErrorMessage(video)));
    };

    if (video.error) {
      reject(new Error(mediaErrorMessage(video)));
      return;
    }
    if (video.readyState >= readyState) {
      resolve();
      return;
    }

    video.addEventListener(eventName, onEvent);
    video.addEventListener('error', onError);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Video loading timed out. Check the headset connection and gateway, then try again.'));
    }, timeoutMs);
  });
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

/**
 * The gateway builds absolute stream URLs from PUBLIC_GATEWAY_URL. That URL can
 * differ from the origin the headset is actually using (localhost, HTTPS, or a
 * different LAN address), which makes the browser reject media as mixed
 * content. Resolve player media against the current page origin instead.
 */
function playerMediaUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.href);
    if (url.pathname.startsWith('/api/player/')) {
      return `${url.pathname}${url.search}`;
    }
    return url.href;
  } catch {
    return raw;
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
  prewarmImmersive();
}

function prewarmImmersive() {
  if (!state.current) return;
  // Load Three.js and check XR support before the user presses Enter VR.
  // Requesting an immersive session must happen inside the click gesture, so
  // doing the network import here avoids losing that activation.
  void ensureImmersive()
    .then((immersive) => immersive.prepare?.())
    .catch(() => {});
}

function securePlayerUrl() {
  const host = location.hostname || 'localhost';
  const port = location.port ? `:${location.port}` : '';
  return `https://${host}${port}/player/`;
}

function updatePairingMeta() {
  el.gatewayAddress.textContent = `${location.host}`;
  el.playerVersion.textContent = `player ${PLAYER_VERSION}`;
  const secure = Boolean(window.isSecureContext);
  el.secureBadge.textContent = secure ? 'WebXR ready' : '';
  el.secureBadge.hidden = !secure;
  el.secureBadge.classList.toggle('badge--ok', secure);
  el.secureBadge.classList.toggle('badge--warn', !secure);
  el.secureBadge.title = secure
    ? 'This page is a secure context; immersive WebXR can be requested.'
    : 'WebXR requires HTTPS or localhost. Flat 2D playback still works over HTTP.';
  if (el.btnEnterVr) {
    el.btnEnterVr.title = secure
      ? 'Enter immersive VR'
      : `VR requires HTTPS. Open ${securePlayerUrl()} and accept the local certificate.`;
  }
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
    // Keep local downloads available without showing a fatal-looking error.
    // The WebSocket status pill continues to report automatic retry attempts.
    setConnection('offline', 'Offline playback');
  }
  connectWebSocket();
}

async function refreshSession(showMessage = false) {
  if (!state.credentials) return;
  if (state.sessionRefresh) return state.sessionRefresh;
  state.sessionRefresh = (async () => {
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
    } finally {
      state.sessionRefresh = null;
    }
  })();
  return state.sessionRefresh;
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
  state.libraryFromCache = false;
  cacheLibrary();
  updatePlayerIdentity();
  renderLibrary();
  renderDownloads();
  if (state.current) {
    const refreshed = state.library.find((video) => video.id === state.current.id);
    if (!refreshed) {
      if (state.downloads[state.current.id]?.status === 'downloaded') {
        state.current = downloadRecordToMedia(state.downloads[state.current.id]);
      } else {
        resetPlaybackUi();
        showToast('The video that was playing was removed from the library.', 'warn');
      }
    } else {
      state.current = refreshed;
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
  if (type === 'PREVIEW_SIGNAL' && state.ws.bufferedAmount > 120_000) return false;
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
    renderLibrary();
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
  renderLibrary();
  setConnection('offline', 'Disconnected');
}

function applyRuntimeConfig(config) {
  if (!config) return;
  if (config.heartbeatIntervalMs) {
    state.heartbeatIntervalMs = clamp(Number(config.heartbeatIntervalMs), 1000, 60000);
  }
  const nextFps = Number(config.previewMaxFps);
  if (Number.isFinite(nextFps) && nextFps > 0) {
    const clamped = clamp(nextFps, 5, 30);
    if (clamped !== state.previewMaxFps) {
      state.previewMaxFps = clamped;
      if (state.previewActive) {
        void startPreview().catch((error) =>
          showToast(`Could not restart preview: ${errorMessage(error)}`, 'error'),
        );
      }
    }
  }
}

function handleAuthOk(message) {
  state.wsAuthenticated = true;
  state.wsRetry = 0;
  renderLibrary();
  applyRuntimeConfig(message.payload?.config);
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
  if (!state.hasConnected) {
    state.hasConnected = true;
    showToast('Connected to the gateway.', 'success');
  }
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
    case 'EXIT_IMMERSIVE': {
      try {
        await exitImmersive();
        ack(message.messageId, true);
      } catch (error) {
        ack(message.messageId, false, errorMessage(error));
      }
      break;
    }
    case 'EXIT_FULLSCREEN': {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        ack(message.messageId, true);
      } catch (error) {
        ack(message.messageId, false, errorMessage(error));
      }
      break;
    }
    case 'LIBRARY_UPDATED': {
      void refreshSession(false);
      break;
    }
    case 'PROTOCOL_ERROR': {
      showToast(message.payload?.message || 'Gateway reported a protocol error.', 'error');
      break;
    }
    case 'CONFIG_UPDATE': {
      applyRuntimeConfig(message.payload);
      ack(message.messageId, true);
      break;
    }
    case 'DOWNLOAD_VIDEO': {
      try {
        startDownload(message.payload);
        ack(message.messageId, true);
      } catch (error) {
        ack(message.messageId, false, errorMessage(error));
      }
      break;
    }
    case 'CANCEL_DOWNLOAD': {
      if (message.payload?.videoId) {
        cancelActiveDownload(message.payload.videoId);
      }
      ack(message.messageId, true);
      break;
    }
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
  const [battery, storage] = await Promise.all([readBattery(), readStorageEstimate()]);
  send('DEVICE_STATUS', {
    appVersion: PLAYER_VERSION,
    model: state.model,
    batteryLevel: battery.level,
    charging: battery.charging,
    playback: playbackSnapshot(),
    // The browser player exposes the shared gateway library plus its own
    // offline-download index, so report the gateway library count.
    inventoryCount: state.library.length || Object.keys(state.downloads).length,
    // navigator.storage.estimate() reports this origin's browser quota. It is
    // the space available for offline copies on this headset.
    storage,
    uptimeSeconds: Math.max(0, Math.floor(performance.now() / 1000)),
    capabilities: capabilities(),
  });
}

async function readBattery() {
  if (typeof navigator.getBattery !== 'function') {
    return { level: null, charging: null };
  }
  try {
    // Keep the BatteryManager alive but read the level on every heartbeat: the
    // level can change without a levelchange event (sleep/resume, dock/undock),
    // which previously left the dashboard showing a stale percentage.
    state.batteryManager ??= navigator.getBattery();
    const battery = await state.batteryManager;
    const rawLevel = Number(battery.level);
    const level = Number.isFinite(rawLevel)
      ? Math.round(clamp(rawLevel <= 1 ? rawLevel * 100 : rawLevel, 0, 100))
      : null;
    return {
      level,
      charging: typeof battery.charging === 'boolean' ? battery.charging : null,
    };
  } catch {
    state.batteryManager = null;
    return { level: null, charging: null };
  }
}

function startHeartbeat() {
  stopHeartbeat();
  const interval = clamp(state.heartbeatIntervalMs, 2000, 60000);
  state.heartbeatTimer = setInterval(() => void sendDeviceStatus(), interval);
  // WebSocket invalidation is immediate; this is a safety net for missed
  // messages (sleep/resume, proxy hiccups, gateway restarts).
  state.libraryRefreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && state.wsAuthenticated) {
      void refreshSession(false);
    }
  }, 30000);
}

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
  if (state.libraryRefreshTimer) {
    clearInterval(state.libraryRefreshTimer);
    state.libraryRefreshTimer = null;
  }
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (!state.wsAuthenticated) {
    if (state.credentials) connectWebSocket();
    return;
  }
  void sendDeviceStatus();
  void refreshSession(false);
}

function onBrowserOnline() {
  if (state.credentials && !state.authPermanentFailure && !state.wsAuthenticated) {
    connectWebSocket();
  }
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
  if (next === 'playing' && !state.isImmersive) armControlsHide();
  else showControls();
}

function playbackError(message) {
  state.playbackError = message || 'Playback error';
  setPlaybackState('error');
  sendPlaybackEvent('error');
}

async function loadVideo(videoId) {
  let video = findVideo(videoId);
  if (!video) {
    // An upload can complete between the last library refresh and the admin
    // pressing Play/Load. Fetch once more before rejecting the command.
    if (state.wsAuthenticated) {
      await refreshSession(false);
      video = findVideo(videoId);
    }
  }
  if (!video && state.downloads[videoId]) {
    video = downloadRecordToMedia(state.downloads[videoId]);
  }
  if (!video) throw new Error('That video is not available in this headset library.');
  clearSchedule();

  const localCopyExpected = state.downloads[video.id]?.status === 'downloaded';
  let localUrl = null;
  if (state.current?.id === video.id && el.video.src && el.video.readyState >= 1) {
    localUrl = await getLocalVideoUrl(video.id);
    if (!state.current || state.current.id !== video.id) return;
    const currentUrl = el.video.currentSrc || el.video.src;
    if ((!localCopyExpected && !localUrl) || currentUrl === localUrl) {
      clearSchedule();
      state.intent = 'load';
      el.video.pause();
      state.intent = 'idle';
      showVideoSurface();
      updateNowPlaying();
      updateProjectionSurface();
      hideLoading();
      // Emit a confirmed ready event even when the file is already buffered so a
      // scheduled group LOAD_VIDEO command can complete without waiting for the
      // 15-second ready timeout.
      setPlaybackState('ready', { force: true, clearError: true });
      return;
    }
  }

  state.intent = 'load';
  state.current = video;
  state.playbackError = null;
  showVideoSurface();
  updateLibrarySelection();
  showLoading('Preparing video…');
  setPlaybackState('loading', { force: true, clearError: true });

  try {
    el.video.pause();
    el.video.muted = state.muted;
    el.video.volume = clamp(state.volume, 0, 1);
    localUrl = localUrl || (await getLocalVideoUrl(video.id));
    if (!state.current || state.current.id !== video.id) return;
    const sourceUrl = localUrl || (localCopyExpected ? null : playerMediaUrl(video.streamUrl));
    if (!sourceUrl) {
      throw new Error(
        localCopyExpected
          ? 'The saved offline copy is unavailable. Delete it and download the video again.'
          : 'This video is not downloaded and the headset is offline.',
      );
    }
    // Drop the previous source before attaching the next one. A media element
    // keeps its last MediaError until load() is called again, so a failed
    // codec/network load would otherwise make every later video fail too.
    el.video.removeAttribute('src');
    el.video.load();
    const metadataReady = waitForMedia(el.video, 'loadedmetadata', 25000);
    const firstFrameReady = waitForMedia(el.video, 'loadeddata', 25000);
    el.video.src = sourceUrl;
    el.video.load();
    await metadataReady;
    if (!state.current || state.current.id !== video.id) return;
    el.video.currentTime = 0;
    // WebXR needs a decoded frame to use as a texture. Wait for loadeddata so
    // pressing Enter VR immediately after loading a video still works. Keep a
    // timeout non-fatal so slow decoders do not block flat playback.
    await firstFrameReady.catch((error) => {
      if (el.video.error) throw error;
    });
    if (!state.current || state.current.id !== video.id) return;
    hideLoading();
    setPlaybackState('ready', { force: true, clearError: true });
    if (state.immersive) state.immersive.setMedia(video);
    updateTransportUi();
    prewarmImmersive();
    updateNowPlaying();
    updateProjectionSurface();
    showToast(
      `Loaded ${video.name}${localUrl ? ' (offline copy)' : ''}`,
      'success',
      2400,
    );
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
        const message = errorMessage(error);
        playbackError(message);
        showToast(message, 'error', 7000);
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
    overlayRoot: el.controls,
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
    onSessionChange: (active, hasDomOverlay = false) => {
      state.isImmersive = active;
      updateImmersiveButton();
      showControls();
      updateProjectionSurface();
      if (active) {
        showToast(
          hasDomOverlay
            ? 'Playback controls stay visible at the bottom of the view.'
            : 'Use the Quest controller trigger to pause or resume. Exit VR to seek or change volume.',
          'success',
          5000,
        );
      }
    },
    onControllerSelect: () => {
      state.userInteracted = true;
      if (['playing', 'buffering'].includes(state.playbackState)) {
        pauseVideo();
      } else {
        void playVideo().catch((error) => showToast(errorMessage(error), 'error'));
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
  state.previewSession += 1;
  const session = state.previewSession;
  const fps = clamp(Number(state.previewMaxFps) || 30, 5, 30);
  // Schedule at the requested cadence. The gateway applies a small jitter
  // tolerance so frames sent at (for example) 33 ms for a 30 FPS target are
  // not dropped as "too soon" and halve the observed frame rate.
  const intervalMs = Math.max(1, Math.round(1000 / fps));
  schedulePreviewFrame(intervalMs, 0, session);
}

// Self-scheduling loop: if encoding a frame takes longer than the target
// interval we immediately start the next one instead of skipping an entire
// interval tick, which is what previously pinned slower headsets to ~6 FPS.
function schedulePreviewFrame(intervalMs, delayMs, session) {
  if (!state.previewActive || session !== state.previewSession) return;
  state.previewTimer = setTimeout(() => {
    const startedAt = performance.now();
    void captureAndSendPreview().finally(() => {
      const elapsed = performance.now() - startedAt;
      schedulePreviewFrame(intervalMs, Math.max(0, intervalMs - elapsed), session);
    });
  }, delayMs);
}

async function captureAndSendPreview() {
  if (!state.previewActive || state.previewCapturePending) return;
  state.previewCapturePending = true;
  try {
    const frame = await captureFrame();
    if (frame && state.previewActive) sendPreviewFrame(frame);
  } finally {
    state.previewCapturePending = false;
  }
}

function stopPreview() {
  state.previewActive = false;
  state.previewSession += 1;
  if (state.previewTimer) {
    clearTimeout(state.previewTimer);
    state.previewTimer = null;
  }
}

async function captureFrame() {
  const source = el.video;
  const width = el.video.videoWidth;
  const height = el.video.videoHeight;
  if (!width || !height || el.video.readyState < 2) return null;
  const canvas = state.previewCanvas || document.createElement('canvas');
  state.previewCanvas = canvas;

  const isSbs = state.current?.stereoLayout === 'sbs';
  const isOu = state.current?.stereoLayout === 'ou';
  const srcW = isSbs ? Math.floor(width / 2) : width;
  const srcH = isOu ? Math.floor(height / 2) : height;

  // A smaller preview keeps JPEG encoding fast enough to sustain 30 FPS on the
  // headset browser; the admin modal only needs a compact status view.
  const scale = Math.min(1, 320 / srcW);
  const targetWidth = Math.max(2, Math.round(srcW * scale));
  const targetHeight = Math.max(2, Math.round(srcH * scale));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    state.previewContext = null;
  }
  const context =
    state.previewContext ?? canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!context) return null;
  state.previewContext = context;
  try {
    context.drawImage(source, 0, 0, srcW, srcH, 0, 0, canvas.width, canvas.height);
    const dataUrl = await canvasToDataUrl(canvas, 0.45);
    if (!dataUrl) return null;
    return { dataUrl, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

async function canvasToDataUrl(canvas, initialQuality) {
  if (typeof canvas.toBlob !== 'function') {
    return canvas.toDataURL('image/jpeg', initialQuality);
  }
  let quality = initialQuality;
  let blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
  if (blob && blob.size > 120_000 && quality > 0.3) {
    quality = 0.3;
    blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
  }
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
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
    const offlineCopy = state.downloads[video.id];
    const hasOfflineCopy = offlineCopy?.status === 'downloaded';
    const canStream = state.wsAuthenticated && !state.libraryFromCache;
    button.disabled = !canStream && !hasOfflineCopy;
    if (button.disabled) button.title = 'Reconnect to the gateway to stream this video.';

    const thumb = document.createElement('div');
    thumb.className = 'library-thumb';
    if (video.thumbnailUrl) {
      const image = document.createElement('img');
      image.src = playerMediaUrl(video.thumbnailUrl);
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
    if (offlineCopy?.status === 'downloaded') {
      const downloaded = document.createElement('span');
      downloaded.className = 'library-pill library-pill--offline';
      downloaded.textContent = 'Downloaded';
      meta.appendChild(downloaded);
    } else if (offlineCopy?.status === 'downloading') {
      const downloading = document.createElement('span');
      downloading.className = 'library-pill library-pill--offline';
      downloading.textContent = `Downloading ${Math.round((offlineCopy.progress || 0) * 100)}%`;
      meta.appendChild(downloading);
    } else if (button.disabled) {
      const unavailable = document.createElement('span');
      unavailable.className = 'library-pill library-pill--warn';
      unavailable.textContent = 'Reconnect to play';
      meta.appendChild(unavailable);
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

function showVideoSurface() {
  el.stage.classList.add('video-active');
  el.stageEmpty.hidden = true;
}

function updateProjectionSurface() {
  if (!state.current) {
    if (state.immersive) state.immersive.stopInline();
    el.xrCanvas.hidden = true;
    return;
  }
  const isSphere = state.current.projectionType === '360' || state.current.projectionType === '180';
  if (isSphere && !state.isImmersive) {
    void ensureImmersive()
      .then((immersive) => {
        if (!state.isImmersive && state.current && (state.current.projectionType === '360' || state.current.projectionType === '180')) {
          void immersive.startInline(state.current);
        }
      })
      .catch(() => {
        el.xrCanvas.hidden = true;
      });
  } else if (!isSphere && !state.isImmersive) {
    if (state.immersive) state.immersive.stopInline();
    el.xrCanvas.hidden = true;
  }
}

function resetPlaybackUi() {
  clearSchedule();
  stopPreview();
  state.immersive?.stopPreview();
  state.current = null;
  state.playbackState = 'idle';
  state.playbackError = null;
  state.intent = 'idle';
  state.isImmersive = false;
  if (state.immersive) state.immersive.stopInline();
  el.video.pause();
  el.video.removeAttribute('src');
  el.video.load();
  el.video.hidden = false;
  el.xrCanvas.hidden = true;
  el.stage.classList.remove('video-active');
  el.stageEmpty.hidden = false;
  el.tapBanner.hidden = true;
  updateImmersiveButton();
  hideLoading();
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
  el.btnPlay.disabled = !active;
  el.btnReplay.disabled = !active;
  el.btnBack.disabled = !active;
  el.btnForward.disabled = !active;
  el.btnEnterVr.disabled = !active && !state.isImmersive;
  el.seek.disabled = !active;
  updatePlaybackButtons();
  updateStatusLine();
}

function updateImmersiveButton() {
  const label = state.isImmersive ? 'Exit VR' : 'Enter VR';
  el.btnEnterVr.textContent = label;
  el.btnEnterVr.title = state.isImmersive ? 'Exit immersive VR' : 'Enter immersive VR';
  el.btnEnterVr.setAttribute('aria-label', label);
  el.btnEnterVr.setAttribute('aria-pressed', String(state.isImmersive));
  el.btnEnterVr.classList.toggle('is-active', state.isImmersive);
}

function updateFullscreenButton() {
  const active = Boolean(document.fullscreenElement);
  const label = active ? 'Exit fullscreen' : 'Fullscreen';
  el.btnFullscreen.textContent = label;
  el.btnFullscreen.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
  el.btnFullscreen.setAttribute('aria-label', label);
  el.btnFullscreen.setAttribute('aria-pressed', String(active));
  el.btnFullscreen.classList.toggle('is-active', active);
}

function updatePlaybackButtons() {
  const playing = state.playbackState === 'playing' || state.playbackState === 'buffering';
  const [playIcon, pauseIcon] = el.btnPlay.querySelectorAll('.control-icon');
  playIcon.hidden = playing;
  pauseIcon.hidden = !playing;
  el.playToggleLabel.textContent = playing ? 'Pause' : state.scheduledStartAt ? 'Scheduled' : 'Play';
  el.btnPlay.title = playing ? 'Pause' : 'Play';
  el.btnPlay.setAttribute('aria-label', el.btnPlay.title);
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
  if (
    !state.current ||
    !el.libraryPanel.hidden ||
    state.playbackState !== 'playing' ||
    state.isImmersive
  ) return;
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
  window.addEventListener('online', onBrowserOnline);
  document.addEventListener('visibilitychange', onVisibilityChange);
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
    if (state.playbackState === 'playing' || state.playbackState === 'buffering') {
      pauseVideo();
      return;
    }
    void playVideo(undefined, undefined).catch((error) => showToast(errorMessage(error), 'error'));
  });
  el.btnReplay.addEventListener('click', () => {
    state.userInteracted = true;
    void playVideo(0, undefined).catch((error) => showToast(errorMessage(error), 'error'));
  });
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
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  updateFullscreenButton();
  el.btnEnterVr.addEventListener('click', () => {
    state.userInteracted = true;
    const entering = !state.isImmersive;
    void (entering ? enterImmersive() : exitImmersive())
      .then(() => {
        if (entering) showToast('Entering immersive mode…', 'success');
      })
      .catch((error) => showToast(errorMessage(error), 'error', 6000));
  });

  el.video.addEventListener('loadedmetadata', updateTransportUi);
  el.video.addEventListener('durationchange', updateTransportUi);
  el.video.addEventListener('timeupdate', () => {
    updateTransportUi();
    updateStatusLine();
  });
  el.video.addEventListener('play', () => {
    if (state.current && state.immersive) state.immersive.setMedia(state.current);
    updateProjectionSurface();
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
    const message = mediaErrorMessage(el.video);
    playbackError(message);
    showToast(message, 'error', 7000);
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
  loadDownloadIndex();
  restoreCachedLibrary();
  requestPersistentStorage();
  void refreshDownloadsFromDb();
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
