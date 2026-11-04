import { expect, test } from "@playwright/test";
import { openApp } from "./helpers.js";

test("AC-UPDATE-02 web never asks for the minimum version or shows the update screen", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/app/minimum-version")) asked.push(request.url());
  });
  await page.route("**/app/minimum-version", (route) => route.fulfill({ json: { ios: "999.0.0" } }));
  await openApp(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(asked).toEqual([]);
  await expect(page.getByText("Please update StoryStitch")).toHaveCount(0);
});
