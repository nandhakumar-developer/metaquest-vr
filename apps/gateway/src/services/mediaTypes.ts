export type Compatibility = 'verified' | 'unverified' | 'unsupported';

export interface VideoProbe {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  compatibility: Compatibility;
  compatibilityNotes: string;
}
