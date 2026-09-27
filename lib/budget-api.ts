import type Database from "better-sqlite3";
import { budgetSnapshot, createBudgetRepository, validBudgetDate } from "./budget";

export function getBudget(request: Request, database: Database.Database): Response {
  const date = new URL(request.url).searchParams.get("date");
  if (date !== null && !validBudgetDate(date)) return Response.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  return Response.json({ budget: budgetSnapshot(database, date ?? new Date().toISOString()) }, { headers: { "Cache-Control": "no-store" } });
}

export async function putBudget(request: Request, database: Database.Database): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Valid JSON is required." }, { status: 400 }); }
  const value = body && typeof body === "object" && !Array.isArray(body) && "monthlyLimitCents" in body
    ? body.monthlyLimitCents : undefined;
  if (value !== null && (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)) {
    return Response.json({ error: "monthlyLimitCents must be a positive integer or null." }, { status: 400 });
  }
  createBudgetRepository(database).setMonthlyLimitCents(value);
  return Response.json({ budget: budgetSnapshot(database) }, { headers: { "Cache-Control": "no-store" } });
}
