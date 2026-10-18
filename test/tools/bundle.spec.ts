import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const ALLOWED_URLS = new Set([
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/2000/svg',
]);

beforeAll(() => {
  if (!existsSync(join(DIST, 'index.html'))) {
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe' });
  }
}, 180_000);

function emitted(): Array<[string, string]> {
  const dir = join(DIST, 'assets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => [file, readFileSync(join(dir, file), 'utf8')]);
}

describe('the built bundle (D5 §6.3, AC-TOOL-09/19, AC-ARCH-03, AC-ENG-20)', () => {
  it('AC-TOOL-09: check:bundle passes every §6.3 condition', () => {
    expect(() =>
      execFileSync('node', ['tools/check-bundle.mjs'], { cwd: ROOT, stdio: 'pipe' }),
    ).not.toThrow();
  });

  it('AC-TOOL-19: no absolute origin appears except the allow-listed namespace identifiers', () => {
    const urlRe = /https?:\/\/[^\s"'`<>()\\,;]+/gi;
    const files = emitted();
    expect(files.length).toBeGreaterThan(0);
    for (const [file, text] of files) {
      for (const match of text.matchAll(urlRe)) {
        expect(ALLOWED_URLS.has(match[0]), `${file}: ${match[0]}`).toBe(true);
      }
    }
  });

  it('AC-ARCH-03: index.html references no absolute origin and the build contains no worker', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(html).not.toMatch(/https?:\/\/(?!localhost)/);
    for (const [, text] of emitted()) expect(text).not.toMatch(/new\s+Worker\s*\(/);
  });

  it('AC-ENG-20: the production bundle contains none of the forbidden engine strings', () => {
    for (const [file, text] of emitted()) {
      for (const needle of ['transformers', 'onnxruntime', 'opus-mt', 'supertonic', 'sherpa']) {
        expect(text.toLowerCase(), `${file}: ${needle}`).not.toContain(needle);
      }
    }
  });
});
