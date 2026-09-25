import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:2222";
const executablePath = process.env.CHROMIUM_EXECUTABLE
  || "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const description = `Hydration acceptance ${Date.now()}`;
const expenseDateTime = "2026-02-14T08:30";

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
  assert.match(defaultDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "the datetime defaults to browser-local YYYY-MM-DDTHH:mm");
  assert.equal(defaultDate, await browserLocalDateTime(page), "the default comes from the browser's realtime local clock");
  assert.equal(await page.locator("nav").count(), 0, "the focused tracker has no navigation chrome");
  await page.fill("#amount", "15000");
  await page.fill("#description", description);
  await page.selectOption("#category", "Transport");
  await page.fill("#date", expenseDateTime);
  await page.getByRole("button", { name: "Add expense" }).click();

  await page.getByRole("status").filter({ hasText: "Expense added." }).waitFor();
  await page.getByText(description, { exact: true }).waitFor();

  const total = await page.locator(".total").innerText();
  const addedExpense = page.locator(".expense-list li").filter({
    has: page.getByText(description, { exact: true }),
  });
  assert.equal(page.url(), initialURL, "submitting the form must not navigate");
  assert.deepEqual(postResponses, [201], "submitting the form must create an expense");
  assert.notEqual(total, initialTotal, "the refreshed total must include the saved expense");
  assert.equal(await addedExpense.count(), 1, "the refreshed list contains the newly added expense");
  assert.equal(await addedExpense.getByText("Transport", { exact: true }).count(), 1, "the refreshed expense row shows the saved category");
  assert.equal(await page.locator("#date").inputValue(), await browserLocalDateTime(page), "successful submit resets datetime to the browser's current local time");

  await page.fill("#date", expenseDateTime);
  await page.getByRole("button", { name: "Clear form" }).click();
  assert.equal(await page.locator("#date").inputValue(), await browserLocalDateTime(page), "clear resets datetime to the browser's current local time");

  await page.fill("#expense-search", "transport");
  assert.equal(await addedExpense.count(), 1, "the category search keeps the matching expense visible");
  assert.equal(await addedExpense.getByText("Transport", { exact: true }).count(), 1, "search filters already-loaded expenses by visible category text");
  await page.fill("#expense-search", "no matching expense");
  await page.getByText("No expenses match your search.", { exact: true }).waitFor();
  const clearSearch = page.getByRole("button", { name: "Clear search" });
  assert.equal(await clearSearch.count(), 1, "an active search has an accessible clear control");
  await clearSearch.click();
  assert.equal(await page.locator("#expense-search").inputValue(), "", "clear search removes the active query");

  const browserMonth = await page.evaluate(() => {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  });
  const { dayKey: expenseDayKey, month: expenseMonth } = await localCalendarDate(page, expenseDateTime);
  const monthButton = expenseMonth < browserMonth ? "Previous month" : "Next month";
  for (let index = 0; index < Math.abs(expenseMonth - browserMonth); index += 1) {
    await page.getByRole("button", { name: monthButton }).click();
  }
  const selectedExpenseDay = page.getByRole("button", {
    name: new RegExp(`^Select ${escapeRegExp(expenseDayKey)}, \\d+ expenses?$`),
  });
  await selectedExpenseDay.click();
  const selectedDay = page.locator(".selected-day");
  await selectedDay.getByRole("heading", { name: `Expenses on ${expenseDayKey}` }).waitFor();
  const selectedDayExpense = selectedDay.locator("li").filter({ hasText: description });
  assert.equal(await selectedDayExpense.count(), 1, "selected calendar day shows the matching expense in its day details");
  assert.equal(await selectedDayExpense.getByText("Transport", { exact: true }).count(), 1, "selected calendar day expense row shows the saved category");
  await selectEmptyCalendarDay(page);
  await page.getByText("No expenses recorded for this day.", { exact: true }).waitFor();

  console.log(JSON.stringify({
    url: page.url(),
    postStatuses: postResponses,
    defaultDate,
    navCount: 0,
    successMessage: "Expense added.",
    expense: description,
    total,
    search: "category filtering, no-results, and accessible clear control verified",
    calendar: "month navigation and selected-day details verified",
  }));
} finally {
  await browser.close();
}

async function expectTextToDisappear(page, text) {
  await page.getByText(text, { exact: true }).waitFor({ state: "hidden" });
}

async function browserLocalDateTime(page) {
  return page.evaluate(() => {
    const now = new Date();
    const part = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}T${part(now.getHours())}:${part(now.getMinutes())}`;
  });
}

async function localCalendarDate(page, dateTime) {
  return page.evaluate((value) => {
    const date = new Date(value);
    const part = (number) => String(number).padStart(2, "0");
    return {
      dayKey: `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`,
      month: date.getFullYear() * 12 + date.getMonth(),
    };
  }, dateTime);
}

async function selectEmptyCalendarDay(page) {
  for (let month = 0; month < 24; month += 1) {
    const emptyDay = page.locator('.calendar-day[aria-label$=", no expenses"]').first();
    if (await emptyDay.count()) {
      await emptyDay.click();
      return;
    }
    await page.getByRole("button", { name: "Next month" }).click();
  }
  assert.fail("could not find an empty calendar day in the next 24 months");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
