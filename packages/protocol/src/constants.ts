/** Wire protocol version. Bump for breaking envelope or message changes. */
export const PROTOCOL_VERSION = 1 as const;

/** Heartbeat cadence requested from Quest devices. */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;

/** No heartbeat for this long => device marked offline. */
export const DEFAULT_OFFLINE_THRESHOLD_MS = 18_000;

/** How long the gateway waits for COMMAND_ACK before reporting a timeout. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 6_000;

/** Short-lived pairing window. */
export const DEFAULT_PAIRING_TTL_SECONDS = 180;

/** Maximum failed code attempts per pairing challenge. */
export const DEFAULT_PAIRING_MAX_ATTEMPTS = 5;

/** Maximum supported snapshot preview cadence. */
export const MAX_PREVIEW_FPS = 30;

/** Preview snapshots target smooth live viewing on a capable LAN and headset. */
export const DEFAULT_PREVIEW_MAX_FPS = MAX_PREVIEW_FPS;

export const MAX_PREVIEW_JPEG_BYTES = 250_000;

export const WS_PATH = '/ws';

/** Command types that may be addressed to one specific device. */
export const DEVICE_COMMAND_TYPES = [
  'PLAY',
  'PAUSE',
  'STOP',
  'SEEK',
  'LOAD_VIDEO',
  'SET_VOLUME',
  'GET_STATUS',
  'REQUEST_PREVIEW',
  'STOP_PREVIEW',
  'RELOAD_PLAYER',
  'ENTER_IMMERSIVE',
  'EXIT_IMMERSIVE',
  'EXIT_FULLSCREEN',
  'PING',
] as const;

/** Messages the Quest application may send upstream. */
export const QUEST_MESSAGE_TYPES = [
  'DEVICE_AUTH',
  'DEVICE_REGISTER',
  'DEVICE_STATUS',
  'HEARTBEAT',
  'VIDEO_INVENTORY',
  'VIDEO_DOWNLOAD_PROGRESS',
  'VIDEO_READY',
  'PLAYBACK_EVENT',
  'COMMAND_ACK',
  'COMMAND_ERROR',
  'HEAD_POSE',
  'PREVIEW_SIGNAL',
  'PING',
  'PONG',
] as const;

/** Messages the gateway may send to a Quest application. */
export const GATEWAY_DEVICE_MESSAGE_TYPES = [
  'AUTH_OK',
  'AUTH_ERROR',
  'PLAY',
  'PAUSE',
  'STOP',
  'SEEK',
  'LOAD_VIDEO',
  'SET_VOLUME',
  'GET_STATUS',
  'REQUEST_PREVIEW',
  'STOP_PREVIEW',
  'RELOAD_PLAYER',
  'ENTER_IMMERSIVE',
  'EXIT_IMMERSIVE',
  'EXIT_FULLSCREEN',
  'PING',
  'PONG',
  'STATUS_REQUEST',
  'CONFIG_UPDATE',
  'DOWNLOAD_VIDEO',
  'CANCEL_DOWNLOAD',
  'PROTOCOL_ERROR',
] as const;

export type DeviceCommandType = (typeof DEVICE_COMMAND_TYPES)[number];
export type QuestMessageType = (typeof QUEST_MESSAGE_TYPES)[number];
export type GatewayDeviceMessageType = (typeof GATEWAY_DEVICE_MESSAGE_TYPES)[number];

/** Close codes used by the gateway WebSocket server. */
export const WS_CLOSE_CODES = {
  normal: 1000,
  unauthorized: 4001,
  invalidMessage: 4002,
  replaced: 4003,
  rateLimited: 4004,
  serverShutdown: 1001,
} as const;
