import { expect, test } from "@playwright/test";

test("starts and controls the acceptance Session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today's focus" })).toBeVisible();
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("heading", { name: "Stretching" })).toBeVisible();
  await expect(page.getByText("1:00")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "+5 seconds" }).click();
  await expect(page.getByText(/1:0[45]/)).toBeVisible();
});

test("uses the responsive Library navigation", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).first().click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await page.getByRole("tab", { name: "Blocks" }).click();
  await expect(page.getByRole("heading", { name: "Bodyweight circuit" })).toBeVisible();
  if (testInfo.project.name === "webkit-iphone") {
    await expect(page.locator(".bottom-nav")).toBeVisible();
  } else {
    await expect(page.locator(".desktop-nav")).toBeVisible();
  }
});
