/**
 * Stable keys and utterance identity (D3 §3.2, §7.7; AC-ENG-03).
 *
 * `sha256` needs `crypto.subtle`, which is absent in a non-secure context (a LAN
 * preview over `http://` is the realistic case, and `speechSynthesis` works
 * there). `fnv1a64` is the documented non-cryptographic fallback. The key is
 * algorithm-prefixed so a store populated under one algorithm can never be
 * misread under another.
 */

import {
  SPEED_CACHE_PRECISION,
  type StableKey,
  type StableKeyAlgorithm,
  type UtteranceKeyOf,
} from '../ports.ts';

export function utf8Bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

export function hexOf(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** 64-bit FNV-1a over UTF-8 bytes, hex, zero-padded. Not a security boundary. */
export function fnv1a64Hex(input: string): string {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of utf8Bytes(input)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** `sha256` where `crypto.subtle` exists, `fnv1a64` otherwise (AC-ENG-03). */
export function preferredAlgorithm(): StableKeyAlgorithm {
  return globalThis.crypto?.subtle ? 'sha256' : 'fnv1a64';
}

export const stableKey: StableKey = async (algorithm, input) => {
  const subtle = globalThis.crypto?.subtle;
  if (algorithm === 'sha256' && subtle) {
    const digest = await subtle.digest('SHA-256', utf8Bytes(input) as unknown as BufferSource);
    return `sha256:${hexOf(new Uint8Array(digest))}`;
  }
  return `fnv1a64:${fnv1a64Hex(input)}`;
};

/**
 * Identity is the speech tuple — engine, revision, authored voice, language,
 * speed and text — never the variant and never the text alone (D3 §3.2).
 */
export const utteranceKey: UtteranceKeyOf = async (input) => {
  const material = [
    input.engineId,
    input.engineRevision,
    input.voiceId,
    input.lang,
    input.speed.toFixed(SPEED_CACHE_PRECISION),
    input.text,
  ].join('\u0000');
  return stableKey(preferredAlgorithm(), material);
};
