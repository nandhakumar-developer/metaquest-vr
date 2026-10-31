import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { GatewayConfig } from '../config.js';
import type { Compatibility, VideoProbe } from './mediaTypes.js';

const execFileAsync = promisify(execFile);

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
}

interface FfprobeFormat {
  duration?: string;
  format_name?: string;
}

interface FfprobeJson {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

function parseRational(value: string | undefined): number | null {
  if (!value) return null;
  if (value.includes('/')) {
    const [numRaw, denRaw] = value.split('/');
    const num = Number(numRaw);
    const den = Number(denRaw);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return Math.round((num / den) * 1000) / 1000;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1000) / 1000 : null;
}

const BROWSER_SAFE_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov']);
const KNOWN_VIDEO_CODECS = new Set(['h264', 'hevc', 'vp9', 'vp8', 'av1', 'mpeg4']);
const KNOWN_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'ac3', 'eac3', 'flac']);

/**
 * FFprobe-based metadata inspection and thumbnail extraction. FFmpeg is
 * optional: uploads still work and are flagged "unverified" when unavailable.
 */
export class MediaService {
  available = false;
  version: string | null = null;

  constructor(private readonly config: GatewayConfig) {}

  async detect(): Promise<void> {
    try {
      const { stdout } = await execFileAsync(this.config.ffprobePath, ['-version'], {
        timeout: 5_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      this.available = true;
      this.version = stdout.split('\n')[0]?.trim() ?? null;
    } catch {
      this.available = false;
      this.version = null;
    }
  }

  async probe(filePath: string, originalFilename: string): Promise<VideoProbe> {
    const extension = path.extname(originalFilename).toLowerCase();
    if (!this.available) {
      return {
        durationSeconds: null,
        width: null,
        height: null,
        frameRate: null,
        videoCodec: null,
        audioCodec: null,
        compatibility: 'unverified',
        compatibilityNotes:
          'FFprobe is not installed on the gateway. Metadata was not inspected; verify the file on a Quest 2 before relying on it.',
      };
    }
    try {
      const { stdout } = await execFileAsync(
        this.config.ffprobePath,
        [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          filePath,
        ],
        {
          timeout: this.config.ffprobeTimeoutMs,
          windowsHide: true,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      const parsed = JSON.parse(stdout) as FfprobeJson;
      const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video');
      const audioStream = parsed.streams?.find((stream) => stream.codec_type === 'audio');
      const videoCodec = videoStream?.codec_name ?? null;
      const audioCodec = audioStream?.codec_name ?? null;
      const width = videoStream?.width ?? null;
      const height = videoStream?.height ?? null;
      const frameRate =
        parseRational(videoStream?.avg_frame_rate) ?? parseRational(videoStream?.r_frame_rate);
      const duration =
        parseSeconds(parsed.format?.duration) ?? parseSeconds(videoStream?.duration);
      const { compatibility, notes } = assessCompatibility({
        videoCodec,
        audioCodec,
        width,
        height,
        extension,
      });
      return {
        durationSeconds: duration,
        width,
        height,
        frameRate,
        videoCodec,
        audioCodec,
        compatibility,
        compatibilityNotes: notes,
      };
    } catch (error) {
      return {
        durationSeconds: null,
        width: null,
        height: null,
        frameRate: null,
        videoCodec: null,
        audioCodec: null,
        compatibility: 'unverified',
        compatibilityNotes: `FFprobe could not inspect this file: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      };
    }
  }

  async generateThumbnail(
    filePath: string,
    outputPath: string,
    atSeconds = 2,
  ): Promise<boolean> {
    try {
      await execFileAsync(
        this.config.ffmpegPath,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          String(Math.max(0, atSeconds)),
          '-i',
          filePath,
          '-frames:v',
          '1',
          '-vf',
          'scale=480:-2',
          '-y',
          outputPath,
        ],
        {
          timeout: 30_000,
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function assessCompatibility(input: {
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  extension: string;
}): { compatibility: Compatibility; notes: string } {
  const notes: string[] = [];
  let compatibility: Compatibility = 'unverified';
  if (!input.videoCodec) {
    return {
      compatibility: 'unsupported',
      notes: 'No video stream was detected in this file.',
    };
  }
  if (input.videoCodec === 'av1') {
    return {
      compatibility: 'unsupported',
      notes: 'AV1 decoding is not supported by Meta Quest 2 hardware. Transcode with FFmpeg to H.264.',
    };
  }
  if (input.videoCodec === 'h264') {
    notes.push('H.264 detected. Unity VideoPlayer on Quest 2 still requires a hardware test.');
  } else if (input.videoCodec === 'hevc') {
    notes.push('H.265/HEVC detected. Verify decoder support on the installed Quest firmware.');
  } else if (KNOWN_VIDEO_CODECS.has(input.videoCodec)) {
    notes.push(`${input.videoCodec} detected; Quest 2 decode support is not guaranteed.`);
  } else {
    compatibility = 'unsupported';
    notes.push(`Unknown video codec "${input.videoCodec}".`);
  }

  if (input.audioCodec && !KNOWN_AUDIO_CODECS.has(input.audioCodec)) {
    compatibility = 'unsupported';
    notes.push(`Audio codec "${input.audioCodec}" may not be supported by the Quest player.`);
  }
  if (!BROWSER_SAFE_EXTENSIONS.has(input.extension)) {
    notes.push(
      `Container "${input.extension}" is not in the verified list (${[...BROWSER_SAFE_EXTENSIONS].join(
        ', ',
      )}); remux with FFmpeg if playback fails.`,
    );
  }
  if (input.width && input.height) {
    if (input.width > 4096 || input.height > 4096) {
      notes.push(
        `Resolution ${input.width}x${input.height} exceeds 4096 px; Quest 2 may refuse or stutter.`,
      );
    }
    if (Math.min(input.width, input.height) >= 3840) {
      notes.push('4K playback is not verified on Quest 2 hardware.');
    }
  }
  return { compatibility, notes: notes.join(' ') };
}
