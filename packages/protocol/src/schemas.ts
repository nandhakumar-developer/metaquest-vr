import { z } from "zod";
import {
  DEFAULT_CAPABILITIES,
  PLAYBACK_STATES,
  PROJECTION_TYPES,
  STEREO_LAYOUTS,
  type DeviceCapabilities,
  type PlaybackState,
  type ProjectionType,
  type StereoLayout,
} from "@vrcc/shared-types";
import { PROTOCOL_VERSION } from "./constants.js";

/* -------------------------------------------------------------------------- */
/* Primitive schemas                                                           */
/* -------------------------------------------------------------------------- */

const HEX_64 = /^[0-9a-f]{64}$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().regex(UUID_RE, "Must be a UUID");
export const checksumSchema = z
  .string()
  .regex(HEX_64, "Must be a SHA-256 hex digest");
export const deviceSecretSchema = z
  .string()
  .regex(HEX_64, "Must be a 64 character hex secret");
export const messageIdSchema = z.string().min(8).max(96);
export const isoTimestampSchema = z
  .string()
  .min(10)
  .max(40)
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "Must be an ISO-8601 timestamp",
  );

export const projectionTypeSchema = z.enum(PROJECTION_TYPES);
export const stereoLayoutSchema = z.enum(STEREO_LAYOUTS);
export const playbackStateSchema = z.enum(PLAYBACK_STATES);

export const quaternionSchema = z
  .object({
    x: z.number().finite().min(-1).max(1),
    y: z.number().finite().min(-1).max(1),
    z: z.number().finite().min(-1).max(1),
    w: z.number().finite().min(-1).max(1),
  })
  .strict();

export const vector3Schema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
  })
  .strict();

export const capabilitiesSchema = z
  .object({
    projection360: z.boolean(),
    projection180: z.boolean(),
    stereoscopic: z.boolean(),
    snapshotPreview: z.boolean(),
    webrtcPreview: z.boolean(),
    headPose: z.boolean(),
    resumableDownloads: z.boolean(),
  })
  .strict()
  .default(DEFAULT_CAPABILITIES as DeviceCapabilities);

export const playbackSnapshotSchema = z
  .object({
    state: playbackStateSchema,
    videoId: uuidSchema.nullable(),
    videoName: z.string().max(512).nullable(),
    positionSeconds: z.number().finite().min(0),
    durationSeconds: z.number().finite().min(0).nullable(),
    volume: z.number().finite().min(0).max(1),
    positionConfirmed: z.boolean().default(true),
    error: z.string().max(2000).nullable(),
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const storageInfoSchema = z
  .object({
    freeBytes: z.number().int().min(0).nullable(),
    totalBytes: z.number().int().min(0).nullable(),
  })
  .strict()
  .default({ freeBytes: null, totalBytes: null });

const emptyPayload = z.object({}).strict();

/* -------------------------------------------------------------------------- */
/* Envelope                                                                   */
/* -------------------------------------------------------------------------- */

export interface MessageEnvelope<
  TType extends string = string,
  TPayload = unknown,
> {
  protocolVersion: typeof PROTOCOL_VERSION;
  messageId: string;
  type: TType;
  deviceId: string;
  timestamp: string;
  payload: TPayload;
}

const envelopeShape = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  messageId: messageIdSchema,
  deviceId: uuidSchema,
  timestamp: isoTimestampSchema,
};

function message<TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) {
  return z.object({
    ...envelopeShape,
    type: z.literal(type),
    payload,
  });
}

export const protocolEnvelopeSchema = z
  .object({
    protocolVersion: z.number().int(),
    messageId: messageIdSchema,
    type: z.string().min(1).max(64),
    deviceId: uuidSchema,
    timestamp: isoTimestampSchema,
    payload: z.unknown(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Command payloads (admin -> gateway -> Quest)                               */
/* -------------------------------------------------------------------------- */

export const playPayloadSchema = z
  .object({
    positionSeconds: z.number().finite().min(0).optional(),
    /**
     * Server epoch time (ms) at which playback should begin. Used for
     * scheduled group starts; clients wait until their synced clock passes it.
     */
    scheduledAt: z.number().int().min(0).optional(),
  })
  .strict();
export const pausePayloadSchema = emptyPayload;
export const stopPayloadSchema = emptyPayload;
export const seekPayloadSchema = z
  .object({ positionSeconds: z.number().finite().min(0) })
  .strict();
export const loadVideoPayloadSchema = z
  .object({
    videoId: uuidSchema,
    /** Never autoplay on load; operator must press Play explicitly. */
    autoplay: z.literal(false).optional(),
  })
  .strict();
export const setVolumePayloadSchema = z
  .object({ volume: z.number().finite().min(0).max(1) })
  .strict();
export const getStatusPayloadSchema = emptyPayload;
export const requestPreviewPayloadSchema = z
  .object({ mode: z.enum(["snapshot", "webrtc"]).default("snapshot") })
  .strict();
export const stopPreviewPayloadSchema = emptyPayload;
export const reloadPlayerPayloadSchema = emptyPayload;
export const enterImmersivePayloadSchema = emptyPayload;
export const exitImmersivePayloadSchema = emptyPayload;
export const exitFullscreenPayloadSchema = emptyPayload;
export const pingPayloadSchema = emptyPayload;

/* -------------------------------------------------------------------------- */
/* Quest -> gateway                                                           */
/* -------------------------------------------------------------------------- */

export const deviceAuthPayloadSchema = z
  .object({
    /** Raw device secret generated on the headset. Only its SHA-256 is stored. */
    secret: deviceSecretSchema,
    appVersion: z.string().min(1).max(64),
    model: z.string().min(1).max(96),
    capabilities: capabilitiesSchema.optional(),
  })
  .strict();

export const deviceRegisterPayloadSchema = z
  .object({
    appVersion: z.string().min(1).max(64),
    model: z.string().min(1).max(96),
    capabilities: capabilitiesSchema,
    storage: storageInfoSchema.optional(),
  })
  .strict();

export const heartbeatPayloadSchema = z
  .object({
    appVersion: z.string().min(1).max(64),
    model: z.string().min(1).max(96),
    batteryLevel: z.number().int().min(0).max(100).nullable(),
    charging: z.boolean().nullable().default(null),
    playback: playbackSnapshotSchema,
    inventoryCount: z.number().int().min(0),
    storage: storageInfoSchema,
    uptimeSeconds: z.number().finite().min(0),
    capabilities: capabilitiesSchema.optional(),
  })
  .strict();

export const deviceStatusPayloadSchema = heartbeatPayloadSchema;

export const videoInventoryPayloadSchema = z
  .object({
    videos: z
      .array(
        z
          .object({
            videoId: uuidSchema,
            name: z.string().min(1).max(512),
            filename: z.string().min(1).max(255),
            sizeBytes: z.number().int().min(0),
            checksum: checksumSchema,
            durationSeconds: z.number().finite().min(0).nullable(),
            downloadedAt: isoTimestampSchema.nullable(),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();

export const videoDownloadProgressPayloadSchema = z
  .object({
    deploymentId: uuidSchema,
    videoId: uuidSchema,
    bytesReceived: z.number().int().min(0),
    totalBytes: z.number().int().min(0),
    progress: z.number().finite().min(0).max(1),
    throughputBytesPerSecond: z.number().finite().min(0).optional(),
  })
  .strict();

export const videoReadyPayloadSchema = z
  .object({
    deploymentId: uuidSchema,
    videoId: uuidSchema,
    checksum: checksumSchema,
    sizeBytes: z.number().int().min(0),
    checksumVerified: z.boolean(),
    localFilename: z.string().min(1).max(255),
  })
  .strict();

export const playbackEventPayloadSchema = z
  .object({
    event: z.enum([
      "loading",
      "buffering",
      "ready",
      "playing",
      "paused",
      "stopped",
      "ended",
      "error",
    ]),
    videoId: uuidSchema.nullable(),
    videoName: z.string().max(512).nullable(),
    positionSeconds: z.number().finite().min(0),
    durationSeconds: z.number().finite().min(0).nullable(),
    volume: z.number().finite().min(0).max(1),
    error: z.string().max(2000).nullable().default(null),
  })
  .strict();

export const commandAckPayloadSchema = z
  .object({
    commandId: messageIdSchema,
    success: z.boolean(),
    detail: z.string().max(2000).optional(),
    /** Optional state observed after applying the command. */
    playback: playbackSnapshotSchema.optional(),
  })
  .strict();

export const commandErrorPayloadSchema = z
  .object({
    commandId: messageIdSchema,
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(2000),
    retryable: z.boolean().default(false),
  })
  .strict();

export const headPosePayloadSchema = z
  .object({
    rotation: quaternionSchema,
    position: vector3Schema.optional(),
    sampleTimestamp: isoTimestampSchema,
    sessionActive: z.boolean().default(true),
  })
  .strict();

export const previewSignalPayloadSchema = z
  .object({
    mode: z.literal("snapshot"),
    mimeType: z.literal("image/jpeg"),
    dataBase64: z.string().min(32).max(2_000_000),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    capturedAt: isoTimestampSchema,
    /** True if the snapshot includes the headset UI, false for camera-only view. */
    includesUserInterface: z.boolean().default(false),
  })
  .strict();

export const questPingPayloadSchema = z
  .object({ clientTime: isoTimestampSchema.optional() })
  .strict();
export const questPongPayloadSchema = z
  .object({
    clientTime: isoTimestampSchema.optional(),
    serverTime: isoTimestampSchema.optional(),
  })
  .strict();

export const questMessageSchema = z.discriminatedUnion("type", [
  message("DEVICE_AUTH", deviceAuthPayloadSchema),
  message("DEVICE_REGISTER", deviceRegisterPayloadSchema),
  message("DEVICE_STATUS", deviceStatusPayloadSchema),
  message("HEARTBEAT", heartbeatPayloadSchema),
  message("VIDEO_INVENTORY", videoInventoryPayloadSchema),
  message("VIDEO_DOWNLOAD_PROGRESS", videoDownloadProgressPayloadSchema),
  message("VIDEO_READY", videoReadyPayloadSchema),
  message("PLAYBACK_EVENT", playbackEventPayloadSchema),
  message("COMMAND_ACK", commandAckPayloadSchema),
  message("COMMAND_ERROR", commandErrorPayloadSchema),
  message("HEAD_POSE", headPosePayloadSchema),
  message("PREVIEW_SIGNAL", previewSignalPayloadSchema),
  message("PING", questPingPayloadSchema),
  message("PONG", questPongPayloadSchema),
]);

/* -------------------------------------------------------------------------- */
/* Admin -> gateway                                                           */
/* -------------------------------------------------------------------------- */

export const adminCommandSchema = z.discriminatedUnion("type", [
  message("PLAY", playPayloadSchema),
  message("PAUSE", pausePayloadSchema),
  message("STOP", stopPayloadSchema),
  message("SEEK", seekPayloadSchema),
  message("LOAD_VIDEO", loadVideoPayloadSchema),
  message("SET_VOLUME", setVolumePayloadSchema),
  message("GET_STATUS", getStatusPayloadSchema),
  message("REQUEST_PREVIEW", requestPreviewPayloadSchema),
  message("STOP_PREVIEW", stopPreviewPayloadSchema),
  message("RELOAD_PLAYER", reloadPlayerPayloadSchema),
  message("ENTER_IMMERSIVE", enterImmersivePayloadSchema),
  message("EXIT_IMMERSIVE", exitImmersivePayloadSchema),
  message("EXIT_FULLSCREEN", exitFullscreenPayloadSchema),
  message("PING", pingPayloadSchema),
]);

/* -------------------------------------------------------------------------- */
/* Gateway -> Quest                                                           */
/* -------------------------------------------------------------------------- */

export const authOkPayloadSchema = z
  .object({
    deviceId: uuidSchema,
    deviceUuid: uuidSchema,
    displayName: z.string().min(1).max(120),
    serverTime: isoTimestampSchema,
    config: z
      .object({
        heartbeatIntervalMs: z.number().int().min(1000).max(60_000),
        previewMaxFps: z.number().int().min(5).max(15),
        timeoutsMs: z.number().int().min(1000).max(120_000),
      })
      .strict(),
  })
  .strict();

export const authErrorPayloadSchema = z
  .object({
    code: z.enum([
      "UNKNOWN_DEVICE",
      "BAD_CREDENTIAL",
      "REVOKED",
      "ALREADY_CONNECTED",
    ]),
    message: z.string().min(1).max(500),
  })
  .strict();

export const downloadVideoPayloadSchema = z
  .object({
    deploymentId: uuidSchema,
    videoId: uuidSchema,
    name: z.string().min(1).max(512),
    filename: z.string().min(1).max(255),
    url: z.string().url().max(2048),
    checksum: checksumSchema,
    sizeBytes: z.number().int().min(0),
    durationSeconds: z.number().finite().min(0).nullable(),
    projectionType: projectionTypeSchema,
    stereoLayout: stereoLayoutSchema,
  })
  .strict();

export const cancelDownloadPayloadSchema = z
  .object({ deploymentId: uuidSchema, videoId: uuidSchema })
  .strict();

export const configUpdatePayloadSchema = authOkPayloadSchema.shape.config;
/** Tells a connected browser player that its shared library changed. */
export const libraryUpdatedPayloadSchema = emptyPayload;

export const protocolErrorPayloadSchema = z
  .object({
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(500),
  })
  .strict();

export const deviceCommandMessageSchema = z.discriminatedUnion("type", [
  message("AUTH_OK", authOkPayloadSchema),
  message("AUTH_ERROR", authErrorPayloadSchema),
  message("PLAY", playPayloadSchema),
  message("PAUSE", pausePayloadSchema),
  message("STOP", stopPayloadSchema),
  message("SEEK", seekPayloadSchema),
  message("LOAD_VIDEO", loadVideoPayloadSchema),
  message("SET_VOLUME", setVolumePayloadSchema),
  message("GET_STATUS", getStatusPayloadSchema),
  message("REQUEST_PREVIEW", requestPreviewPayloadSchema),
  message("STOP_PREVIEW", stopPreviewPayloadSchema),
  message("RELOAD_PLAYER", reloadPlayerPayloadSchema),
  message("ENTER_IMMERSIVE", enterImmersivePayloadSchema),
  message("EXIT_IMMERSIVE", exitImmersivePayloadSchema),
  message("EXIT_FULLSCREEN", exitFullscreenPayloadSchema),
  message("PING", pingPayloadSchema),
  message("PONG", questPongPayloadSchema),
  message("STATUS_REQUEST", emptyPayload),
  message("CONFIG_UPDATE", configUpdatePayloadSchema),
  message("LIBRARY_UPDATED", libraryUpdatedPayloadSchema),
  message("DOWNLOAD_VIDEO", downloadVideoPayloadSchema),
  message("CANCEL_DOWNLOAD", cancelDownloadPayloadSchema),
  message("PROTOCOL_ERROR", protocolErrorPayloadSchema),
]);

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type QuestMessage = z.infer<typeof questMessageSchema>;
export type AdminCommand = z.infer<typeof adminCommandSchema>;
export type DeviceCommandMessage = z.infer<typeof deviceCommandMessageSchema>;
export type PlaybackSnapshotPayload = z.infer<typeof playbackSnapshotSchema>;
export type DeviceCapabilitiesPayload = z.infer<typeof capabilitiesSchema>;
export type ProjectionTypePayload = ProjectionType;
export type StereoLayoutPayload = StereoLayout;
export type PlaybackStatePayload = PlaybackState;

export type MessageType =
  QuestMessage["type"] | AdminCommand["type"] | DeviceCommandMessage["type"];

/* -------------------------------------------------------------------------- */
/* Parsing helpers                                                            */
/* -------------------------------------------------------------------------- */

export type ParseResult<T> =
  { ok: true; data: T } | { ok: false; error: string; details?: unknown };

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Message validation failed",
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  return { ok: true, data: parsed.data };
}

function parseJson(raw: string): ParseResult<unknown> {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "Empty message" };
  }
  if (raw.length > 4_000_000) {
    return { ok: false, error: "Message exceeds maximum size" };
  }
  try {
    return { ok: true, data: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, error: "Message is not valid JSON" };
  }
}

export function parseEnvelope(
  raw: unknown,
): ParseResult<z.infer<typeof protocolEnvelopeSchema>> {
  return parseWith(protocolEnvelopeSchema, raw);
}

export function parseQuestMessage(
  raw: string | unknown,
): ParseResult<QuestMessage> {
  const json =
    typeof raw === "string" ? parseJson(raw) : { ok: true as const, data: raw };
  if (!json.ok) return json;
  return parseWith(questMessageSchema, json.data);
}

export function parseAdminCommand(
  raw: string | unknown,
): ParseResult<AdminCommand> {
  const json =
    typeof raw === "string" ? parseJson(raw) : { ok: true as const, data: raw };
  if (!json.ok) return json;
  return parseWith(adminCommandSchema, json.data);
}

export function parseDeviceCommandMessage(
  raw: string | unknown,
): ParseResult<DeviceCommandMessage> {
  const json =
    typeof raw === "string" ? parseJson(raw) : { ok: true as const, data: raw };
  if (!json.ok) return json;
  return parseWith(deviceCommandMessageSchema, json.data);
}

/** Build a wire message with the correct version + timestamp. */
export function makeMessage<TType extends MessageType, TPayload>(
  type: TType,
  deviceId: string,
  payload: TPayload,
  messageId: string = globalThis.crypto.randomUUID(),
  timestamp: string = new Date().toISOString(),
): MessageEnvelope<TType, TPayload> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageId,
    type,
    deviceId,
    timestamp,
    payload,
  };
}
