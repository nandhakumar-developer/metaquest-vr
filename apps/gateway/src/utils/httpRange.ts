export interface ByteRange {
  start: number;
  end: number;
}

export type RangeParseResult =
  | { kind: 'none' }
  | { kind: 'range'; range: ByteRange }
  | { kind: 'invalid' };

/**
 * Parses a single HTTP Range header. Multi-range requests are rejected (416)
 * because the Quest downloader and browser preview only need one range.
 */
export function parseRangeHeader(header: string | undefined, size: number): RangeParseResult {
  if (!header) return { kind: 'none' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return { kind: 'invalid' };
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return { kind: 'invalid' };

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { kind: 'invalid' };
    return { kind: 'range', range: { start: Math.max(0, size - suffixLength), end: size - 1 } };
  }

  const start = Number(startRaw);
  if (!Number.isFinite(start) || start >= size) return { kind: 'invalid' };
  const end = endRaw ? Number(endRaw) : size - 1;
  if (!Number.isFinite(end) || end < start) return { kind: 'invalid' };
  return { kind: 'range', range: { start, end: Math.min(end, size - 1) } };
}

export function contentTypeForFilename(filename: string): string {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  switch (extension) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.mkv':
      return 'video/x-matroska';
    case '.webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}
