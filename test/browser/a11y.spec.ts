import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The real-browser half of AC-UI-22 (D4 §12.1): contrast, control boundaries,
 * targets ≥24 px, 200% zoom and reflow. jsdom cannot compute any of these.
 */

async function installEnglishOnlyVoices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const voices = [
      { name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 'Samantha' },
    ];
    Object.defineProperty(globalThis, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        speak: () => undefined,
        cancel: () => undefined,
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
 * Skip onboarding: these specs are about the conversation screen's layout,
 * contrast and reflow.
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

test('AC-UI-22: automated a11y checks pass at AA in Chromium', async ({ page }) => {
  await installEnglishOnlyVoices(page);
  await gotoConversation(page);
  await expect(page.locator('h1')).toHaveText('Making Plans');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: 'test-artifacts/07-a11y.png', fullPage: true });
});

test('AC-UI-22: 200% zoom and a 320 px reflow keep the app functional', async ({ page }) => {
  await installEnglishOnlyVoices(page);
  await gotoConversation(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(page.locator('h1')).toBeVisible();
  await page.screenshot({ path: 'test-artifacts/08-zoom-200.png', fullPage: true });

  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.locator('h1')).toBeVisible();
  await page.screenshot({ path: 'test-artifacts/09-reflow-320.png', fullPage: true });
});
