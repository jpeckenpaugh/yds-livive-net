import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * The M1 smoke path (AC-TOOL-18) over the built artifact.
 *
 * Headless Chromium has no Spanish voice, so the G1 `no-l2-voice` state is the
 * one CI sees on every run. The init script makes that deterministic: one
 * English voice, no Spanish one.
 */

async function installEnglishOnlyVoices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const voices = [
      {
        name: 'Samantha',
        lang: 'en-US',
        localService: true,
        default: true,
        voiceURI: 'Samantha',
      },
    ];
    Object.defineProperty(globalThis, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        speak: () => undefined,
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
      },
    });
    (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      lang = '';
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };
  });
}

/**
 * Skip onboarding: the specs below are about the conversation screen. The
 * Welcome flow has its own test.
 */
async function seedLearner(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'yds.v1',
      JSON.stringify({ seenWelcome: true, native: 'en', study: 'es', prefs: {}, sessions: {} }),
    );
  });
}

/** Seed onboarding, open the conversation, and land on the transcript. */
async function gotoConversation(page: Page): Promise<void> {
  await seedLearner(page);
  await page.goto('/');
  await page.locator('.conversation-open').first().click();
  await expect(page.locator('.transcript')).toBeVisible();
}

test('AC-TOOL-18: the welcome flow reaches the conversation list and a conversation', async ({
  page,
}) => {
  await installEnglishOnlyVoices(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.locator('.conversation-open').first()).toBeVisible();
  await page.locator('.conversation-open').first().click();

  await expect(page.locator('.transcript')).toBeVisible();
  await expect(page.locator('.choice-cards').first()).toBeVisible();
});

test('AC-TOOL-18: smoke over the built artifact, including the G1 no-l2-voice state', async ({
  page,
}) => {
  mkdirSync('test-artifacts', { recursive: true });
  await installEnglishOnlyVoices(page);
  await gotoConversation(page);
  await expect(page.locator('h1')).toHaveText('Making Plans');
  await page.screenshot({ path: 'test-artifacts/01-transcript.png', fullPage: true });

  // G1: an L1 voice exists, no L2 voice, so the actionable notice renders.
  await expect(page.locator('.audio-notice')).toContainText('No Spanish voice');
  await page.screenshot({ path: 'test-artifacts/02-g1-no-l2-voice.png', fullPage: true });

  // Play the first beat, then choose an option.
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.screenshot({ path: 'test-artifacts/03-playing.png', fullPage: true });

  await page.locator('.option-choose').filter({ hasText: 'Dinner' }).click();
  await expect(page.locator('.ghost-option')).toBeVisible();
  await page.screenshot({ path: 'test-artifacts/04-chosen-and-ghost.png', fullPage: true });

  // The What-if panel is read-only until "make this real".
  await page.getByRole('button', { name: 'Keyboard help' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'test-artifacts/05-keyboard-help.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('AC-TOOL-18: the Licences surface names licences by purpose', async ({ page }) => {
  await installEnglishOnlyVoices(page);
  await gotoConversation(page);
  await page.getByRole('button', { name: 'Licences' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('OpenRAIL-M');
  await expect(dialog).toContainText('MIT');
  await expect(dialog).toContainText('Apache-2.0');
  await page.screenshot({ path: 'test-artifacts/06-licences.png', fullPage: true });
});
