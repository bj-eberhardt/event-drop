import { expect, test } from "@playwright/test";
import { buildEventUrl, getEventId, getMode } from "./support/urls";

const mode = getMode();
const eventId = getEventId();

test("event route missing state is shown", async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  testInfo.skip(!baseURL, "baseURL required");

  const url = buildEventUrl(baseURL as string, mode, eventId);
  await page.goto(url);

  await expect(page.getByRole("heading", { name: /nicht gefunden/i })).toBeVisible();
});
