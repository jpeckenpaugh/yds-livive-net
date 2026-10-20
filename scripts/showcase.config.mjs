export default {
  key: "yds-livive-net",
  serve: { dir: "dist", spa: true },
  viewport: { width: 1280, height: 800 },
  durationMs: 30000,
  settleMs: 1500,

  async ready(page) {
    await page.getByText("You Don't Say", { exact: false }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
  },

  async prelude(page) {
    await page.getByRole("button", { name: /^Start$/i }).first().click({ timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.getByText("Making Plans", { exact: true }).first().click({ timeout: 10000 });
    await page.waitForTimeout(1800);
    // Chromium has no Spanish voice; dismiss the warning so it doesn't cover
    // the reader in the recording.
    await page
      .getByRole("button", { name: /^Dismiss$/i })
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
    await page.waitForTimeout(500);
  },

  beats: [
    {
      label: "Listen and follow the dialogue in both languages",
      wait: 1500,
      shot: "reader",
      thumb: true,
    },
    {
      label: "Choose the next line and bend the story",
      action: { clickText: "Dinner" },
      wait: 2500,
      shot: "branch-choice",
    },
    {
      label: "Hear the chosen branch resolve",
      action: { clickText: "Next" },
      wait: 2500,
      shot: "branch-resolved",
    },
    {
      label: "Replay with one decision changed",
      action: { clickText: "Replay" },
      wait: 2000,
      shot: "replay",
    },
    {
      label: "Back to the conversation catalogue",
      action: { clickText: "Conversations" },
      wait: 1500,
      shot: "catalogue",
    },
  ],

  thumbFrom: "reader",
};
