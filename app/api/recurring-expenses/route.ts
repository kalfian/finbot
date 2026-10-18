import { completeRecurringExpense, deleteRecurringExpense, getRecurringExpenses, postRecurringExpense, putRecurringExpense } from "@/lib/recurring-expense-api";
import { createRecurringExpenseRepository } from "@/lib/recurring-expenses";
import { getDatabase } from "@/lib/db";
import { requireApi } from "@/lib/auth-guard";

export const runtime = "nodejs";
function repository() { return createRecurringExpenseRepository(getDatabase()); }
export async function GET(request: Request): Promise<Response> { const denied = await requireApi(request); if (denied) return denied; try { return getRecurringExpenses(repository(), request); } catch { return Response.json({ error: "We couldn't load recurring expenses. Please try again." }, { status: 500 }); } }
export async function POST(request: Request): Promise<Response> { const denied = await requireApi(request, true); if (denied) return denied; try { return await postRecurringExpense(request, repository()); } catch { return Response.json({ error: "We couldn't save this recurring expense. Please try again." }, { status: 500 }); } }
export async function PUT(request: Request): Promise<Response> { const denied = await requireApi(request, true); if (denied) return denied; try { return await putRecurringExpense(request, repository()); } catch { return Response.json({ error: "We couldn't update this recurring expense. Please try again." }, { status: 500 }); } }
export async function DELETE(request: Request): Promise<Response> { const denied = await requireApi(request, true); if (denied) return denied; try { return await deleteRecurringExpense(request, repository()); } catch { return Response.json({ error: "We couldn't delete this planned expense. Please try again." }, { status: 500 }); } }
export async function PATCH(request: Request): Promise<Response> { const denied = await requireApi(request, true); if (denied) return denied; try { return await completeRecurringExpense(request, repository()); } catch { return Response.json({ error: "We couldn't record this planned expense. Please try again." }, { status: 500 }); } }
