import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const port = 31_000 + (randomBytes(2).readUInt16BE() % 10_000);
const directory = mkdtempSync(join(tmpdir(), "financial-tracker-e2e-"));
const environment = {
  ...process.env,
  DATABASE_PATH: join(directory, "ledger.db"),
  FINANCIAL_TRACKER_SESSION_SECRET: randomBytes(48).toString("base64url"),
};
const password = randomBytes(24).toString("base64url");
const changedPassword = randomBytes(24).toString("base64url");
const server = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
  cwd: process.cwd(),
  detached: true,
  env: environment,
  stdio: "ignore",
});
const baseURL = `http://127.0.0.1:${port}`;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function ready() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseURL)).ok) return;
    } catch {
      // Wait for Next to accept connections.
    }
    await delay(250);
  }
  throw new Error("The browser test server did not start.");
}

async function stopServer() {
  if (!server.pid || server.exitCode !== null) return;
  const exited = once(server, "exit").then(() => true);
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
  if (await Promise.race([exited, delay(5_000).then(() => false)])) return;
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    server.kill("SIGKILL");
  }
  await Promise.race([exited, delay(2_000)]);
}

async function waitForHeading(page, name) {
  await page.getByRole("heading", { name }).waitFor({ state: "visible" });
}

async function requestApi(page, path, method, expectedStatus) {
  const response = page.waitForResponse((candidate) => {
    const request = candidate.request();
    return (
      new URL(candidate.url()).pathname === path && request.method() === method
    );
  });
  const status = await page.evaluate(
    async ({ path: target, method: requestMethod }) => {
      return (
        await fetch(target, {
          method: requestMethod,
          credentials: "same-origin",
        })
      ).status;
    },
    { path, method },
  );
  assert.equal(
    status,
    expectedStatus,
    `${method} ${path} returned an unexpected status.`,
  );
  assert.equal(
    (await response).status(),
    expectedStatus,
    `${method} ${path} response did not match the browser result.`,
  );
}

async function submitAndWaitForApi(page, button, path, expectedStatus) {
  const response = page.waitForResponse((candidate) => {
    const request = candidate.request();
    return (
      new URL(candidate.url()).pathname === path && request.method() === "POST"
    );
  });
  await button.click();
  assert.equal(
    (await response).status(),
    expectedStatus,
    `POST ${path} returned an unexpected status.`,
  );
}

async function assertNoHorizontalOverflow(page) {
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "The document overflows horizontally.",
  );
}

async function assertLayout(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await assertNoHorizontalOverflow(page);
  await page.locator(".overview-heading button").click();
  for (const selector of [".recorder-fields", ".category-chips"]) {
    assert.equal(
      await page
        .locator(selector)
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      true,
      `${selector} clips content at ${width}px.`,
    );
  }
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Add expense", exact: true })
    .waitFor({ state: "visible" });
  for (let index = 0; index < 15; index += 1) {
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest("dialog[open]")),
      ),
      true,
      "Focus escaped the composer.",
    );
  }
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(
    await page
      .locator(".overview-heading button")
      .evaluate((el) => el === document.activeElement),
    true,
    "Focus did not return to the opener.",
  );
}

let browser;
try {
  await ready();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const consoleErrors = [];
  const expectedServiceErrors = [];
  const expectedUnauthorizedConsoleErrors = [];
  const pageErrors = [];
  const apiRequests = [];
  const urls = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.text().includes("status of 401"))
      expectedUnauthorizedConsoleErrors.push(message.type());
    else if (message.text().includes("status of 503"))
      expectedServiceErrors.push(message.type());
    else consoleErrors.push(`${message.text()} (${message.location().url})`);
  });
  page.on("pageerror", (error) => pageErrors.push(error.name));
  page.on("response", (response) => {
    const request = response.request();
    const url = new URL(response.url());
    if (url.origin === baseURL && url.pathname.startsWith("/api/")) {
      apiRequests.push({
        method: request.method(),
        path: url.pathname,
        status: response.status(),
      });
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) urls.push(new URL(frame.url()).pathname);
  });

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await waitForHeading(page, "Create your local administrator");
  assert.equal(
    await page
      .getByRole("heading", { name: "Your money, at a glance." })
      .count(),
    0,
    "The dashboard must not render before login.",
  );
  await requestApi(page, "/api/expenses", "GET", 401);

  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await submitAndWaitForApi(
    page,
    page.getByRole("button", { name: "Create administrator" }),
    "/api/auth/setup",
    200,
  );
  await waitForHeading(page, "Your money, at a glance.");
  await requestApi(page, "/api/expenses", "GET", 200);

  await page.locator(".overview-heading button").click();
  await page.locator("#quick-amount").fill("10000");
  await page.getByLabel("What was it?").fill("Browser quick add");
  await page.route("**/api/expenses", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporarily unavailable. Please retry." }),
    }),
  );
  await submitAndWaitForApi(
    page,
    page
      .locator("dialog[open]")
      .getByRole("button", { name: "Add expense", exact: true }),
    "/api/expenses",
    503,
  );
  await page
    .getByRole("alert")
    .filter({ hasText: "Temporarily unavailable" })
    .waitFor();
  assert.equal(
    await page.locator("#quick-amount").inputValue(),
    "10000",
    "Failed save lost the draft.",
  );
  assert.equal(
    await page
      .locator("dialog[open]")
      .getByRole("button", { name: "Add expense", exact: true })
      .isEnabled(),
    true,
  );
  await page.unroute("**/api/expenses");
  await submitAndWaitForApi(
    page,
    page
      .locator("dialog[open]")
      .getByRole("button", { name: "Add expense", exact: true }),
    "/api/expenses",
    201,
  );
  await page
    .locator("[role='status']")
    .filter({ hasText: "Expense added." })
    .first()
    .waitFor({ state: "visible" });
  await page
    .getByText("Browser quick add", { exact: true })
    .waitFor({ state: "visible" });

  await page
    .getByRole("button", { name: "Edit Browser quick add", exact: true })
    .click();
  await page.getByLabel("What was it?").fill("Browser edited expense");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Expense updated.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Delete Browser edited expense", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep it", exact: true }).click();
  await page.getByText("Browser edited expense", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Delete Browser edited expense", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete expense", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByText("Expense restored.", { exact: true }).waitFor();
  await page.locator(".overview-heading button").click();
  await page.locator(".custom-category-details summary").click();
  await page.getByLabel("New category", { exact: true }).fill("Books");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByRole("button", { name: "Books", exact: true }).waitFor();
  await page.keyboard.press("Escape");

  const seeded = await page.evaluate(async () => {
    const token = document.querySelector('meta[name="csrf-token"]').content;
    const statuses = [];
    for (let index = 0; index < 9; index += 1) {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": token },
        body: JSON.stringify({
          description: `Synthetic item ${index}`,
          amountCents: 125000,
          category: "Food",
          date: new Date().toISOString(),
        }),
      });
      statuses.push(response.status);
    }
    return statuses;
  });
  assert.ok(seeded.every((status) => status === 201));
  await page.reload();
  await page.getByText("Page 1 of 2", { exact: true }).waitFor();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download HTML", exact: true })
    .click();
  const download = await downloaded;
  const exportPath = join(directory, "export.html");
  await download.saveAs(exportPath);
  assert.match(readFileSync(exportPath, "utf8"), /10 expenses/);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Page 2 of 2", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".ledger-row").length === 2,
  );
  for (let index = 0; index < 2; index += 1) {
    await page.locator(".ledger-row .delete-button").first().click();
    await page
      .getByRole("button", { name: "Delete expense", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        !document.querySelector("dialog[open]") &&
        document.querySelector(".overview-grid")?.getAttribute("aria-busy") ===
          "false",
    );
  }
  await page.waitForFunction(
    () => document.querySelectorAll(".ledger-row").length === 8,
  );
  assert.equal(
    await page.getByRole("navigation", { name: "Expense pages" }).count(),
    0,
  );

  await page.getByLabel("Search descriptions").fill("no-match-zzz");
  await page.getByText("Nothing here just yet.", { exact: true }).waitFor();
  await page.locator(".state button").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".ledger-row").length === 8,
  );
  let slowFinished = false;
  await page.route("**/api/expenses?**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("search") ===
      "slow-missing"
    ) {
      const response = await route.fetch();
      await delay(350);
      await route.fulfill({ response });
      slowFinished = true;
    } else await route.continue();
  });
  const slowStarted = page.waitForRequest((request) =>
    request.url().includes("search=slow-missing"),
  );
  await page.getByLabel("Search descriptions").fill("slow-missing");
  await slowStarted;
  await page.getByLabel("Search descriptions").fill("Synthetic item");
  await page.waitForFunction(
    () => document.querySelectorAll(".ledger-row").length > 0,
  );
  for (let attempt = 0; !slowFinished && attempt < 60; attempt += 1)
    await delay(50);
  assert.ok(slowFinished, "The delayed response did not finish.");
  await delay(50);
  assert.ok(
    (await page.locator(".ledger-row").count()) > 0,
    "A stale search response replaced the latest results.",
  );
  await page.unroute("**/api/expenses?**");
  await page.getByLabel("Search descriptions").fill("");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".overview-heading")
      .evaluate((element) => getComputedStyle(element).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });

  for (const width of [1440, 768, 390, 320]) await assertLayout(page, width);
  await page.locator(".theme-toggle").click();
  for (const width of [1440, 390, 320]) await assertLayout(page, width);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByLabel("Current password").fill(password);
  await page.getByLabel("New password").fill(changedPassword);
  await submitAndWaitForApi(
    page,
    page.getByRole("button", { name: "Update password" }),
    "/api/auth/password",
    200,
  );
  await waitForHeading(page, "Sign in to your ledger");

  await page.getByLabel("Password").fill(changedPassword);
  await submitAndWaitForApi(
    page,
    page.getByRole("button", { name: "Sign in" }),
    "/api/auth/login",
    200,
  );
  await waitForHeading(page, "Your money, at a glance.");

  await page.getByRole("button", { name: "Account", exact: true }).click();
  await submitAndWaitForApi(
    page,
    page.getByRole("button", { name: "Log out" }),
    "/api/auth/logout",
    200,
  );
  await waitForHeading(page, "Sign in to your ledger");
  assert.equal(
    await page
      .getByRole("heading", { name: "Your money, at a glance." })
      .count(),
    0,
    "The dashboard must not render after logout.",
  );
  await requestApi(page, "/api/expenses", "GET", 401);

  await page.getByLabel("Password").fill(changedPassword);
  await submitAndWaitForApi(
    page,
    page.getByRole("button", { name: "Sign in" }),
    "/api/auth/login",
    200,
  );
  await waitForHeading(page, "Your money, at a glance.");

  assert.equal(
    expectedServiceErrors.length,
    1,
    "Expected one synthetic save failure.",
  );
  assert.deepEqual(consoleErrors, [], "The browser reported console errors.");
  assert.equal(
    expectedUnauthorizedConsoleErrors.length,
    2,
    "The expected unauthenticated API failures were not captured by the browser.",
  );
  assert.deepEqual(pageErrors, [], "The page raised uncaught errors.");
  assert.ok(
    apiRequests.some(
      (request) =>
        request.method === "POST" &&
        request.path === "/api/expenses" &&
        request.status === 201,
    ),
    "Quick Add POST /api/expenses was not captured as a successful request.",
  );
  assert.ok(
    apiRequests.filter(
      (request) =>
        request.method === "GET" &&
        request.path === "/api/expenses" &&
        request.status === 401,
    ).length >= 2,
    "Unauthenticated API requests were not captured before login and after logout.",
  );
  assert.ok(
    urls.length >= 5 && urls.every((path) => path === "/"),
    "The expected auth lifecycle URL changes were not captured.",
  );
  process.stdout.write("Auth browser E2E passed.\n");
} finally {
  await browser?.close();
  await stopServer();
  rmSync(directory, { recursive: true, force: true });
}
