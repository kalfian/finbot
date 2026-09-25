import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:2222";
const executablePath = process.env.CHROMIUM_EXECUTABLE
  || "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const description = `Hydration acceptance ${Date.now()}`;

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage();
const postResponses = [];

page.on("response", (response) => {
  if (response.request().method() === "POST" && new URL(response.url()).pathname === "/api/expenses") {
    postResponses.push(response.status());
  }
});

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await expectTextToDisappear(page, "Loading expenses…");

  const initialURL = page.url();
  const initialTotal = await page.locator(".total").innerText();
  const defaultDate = await page.locator("#date").inputValue();
  assert.match(defaultDate, /^\d{4}-\d{2}-\d{2}$/, "the date defaults to browser-local YYYY-MM-DD");
  assert.equal(await page.locator("nav").count(), 0, "the focused tracker has no navigation chrome");
  await page.fill("#amount", "15000");
  await page.fill("#description", description);
  await page.getByRole("button", { name: "Add expense" }).click();

  await page.getByRole("status").filter({ hasText: "Expense added." }).waitFor();
  await page.getByText(description, { exact: true }).waitFor();

  const total = await page.locator(".total").innerText();
  assert.equal(page.url(), initialURL, "submitting the form must not navigate");
  assert.deepEqual(postResponses, [201], "submitting the form must create an expense");
  assert.notEqual(total, initialTotal, "the refreshed total must include the saved expense");

  console.log(JSON.stringify({
    url: page.url(),
    postStatuses: postResponses,
    defaultDate,
    navCount: 0,
    successMessage: "Expense added.",
    expense: description,
    total,
  }));
} finally {
  await browser.close();
}

async function expectTextToDisappear(page, text) {
  await page.getByText(text, { exact: true }).waitFor({ state: "hidden" });
}
