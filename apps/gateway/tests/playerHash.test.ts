import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSha256, sha256Hex } from '../../player/components/sha256.js';

describe('browser player SHA-256', () => {
  it('hashes pairing secrets', () => {
    expect(sha256Hex('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });

  it('hashes data incrementally for offline downloads', () => {
    const hasher = createSha256();
    hasher.update(new TextEncoder().encode('a'));
    hasher.update(new TextEncoder().encode('bc'));
    expect(hasher.digestHex()).toBe(createHash('sha256').update('abc').digest('hex'));
  });
});
