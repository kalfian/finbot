import { requireToken } from "@/lib/api-tokens";
import { getDatabase } from "@/lib/db";
import { handleExpenseMcp } from "@/lib/expense-mcp";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

type McpMetadata = { rpcMethod: string | null; toolName: string | null; rpcId: unknown };

async function requestMetadata(request: Request): Promise<McpMetadata> {
  try {
    const body = await request.clone().json() as { id?: unknown; method?: unknown; params?: { name?: unknown } };
    return {
      rpcMethod: typeof body.method === "string" ? body.method : null,
      toolName: typeof body.params?.name === "string" ? body.params.name : null,
      rpcId: body.id ?? null,
    };
  } catch {
    return { rpcMethod: null, toolName: null, rpcId: null };
  }
}

async function withRequestId(response: Response, requestId: string): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set("X-MCP-Request-ID", requestId);
  headers.delete("Content-Length");
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = await response.clone().json().catch(() => null) as {
      error?: unknown;
      requestId?: unknown;
      result?: { isError?: unknown; content?: Array<{ type?: unknown; text?: unknown }> };
    } | null;
    if (body) {
      if (body.error && !("jsonrpc" in body)) body.requestId = requestId;
      if (body.result?.isError === true) {
        for (const content of body.result.content ?? []) {
          if (content.type !== "text" || typeof content.text !== "string") continue;
          try {
            const detail = JSON.parse(content.text) as Record<string, unknown>;
            content.text = JSON.stringify({ ...detail, requestId });
          } catch {
            content.text = JSON.stringify({ error: content.text, code: "MCP_TOOL_REJECTED",
              hint: "Inspect the finbot server log using this request ID.", requestId });
          }
        }
      }
      return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function logMcp(level: "info" | "warn" | "error", fields: Record<string, unknown>): void {
  console[level](`[mcp] ${JSON.stringify(fields)}`);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const metadata = await requestMetadata(request);
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        logMcp("warn", { requestId, ...metadata, status: 403, error: "cross_origin" });
        return Response.json({ error: "MCP requests from another browser origin are not allowed.", requestId },
          { status: 403, headers: { "X-MCP-Request-ID": requestId } });
      }
    } catch {
      logMcp("warn", { requestId, ...metadata, status: 403, error: "invalid_origin" });
      return Response.json({ error: "The MCP Origin header is invalid.", requestId },
        { status: 403, headers: { "X-MCP-Request-ID": requestId } });
    }
  }
  const database = getDatabase();
  const auth = requireToken(request, database);
  if ("response" in auth) {
    logMcp("warn", { requestId, ...metadata, status: auth.response.status, error: "authentication_failed" });
    return await withRequestId(auth.response, requestId);
  }
  try {
    const response = await handleExpenseMcp(request, database, auth.user.id);
    const body = await response.clone().json().catch(() => null) as { error?: unknown; result?: { isError?: unknown } } | null;
    const rejected = !!body?.error || body?.result?.isError === true;
    logMcp(rejected ? "warn" : "info", { requestId, ...metadata, userId: auth.user.id,
      status: response.status, outcome: rejected ? "rejected" : "ok", durationMs: Math.round(performance.now() - startedAt) });
    return await withRequestId(response, requestId);
  } catch (error) {
    logMcp("error", { requestId, ...metadata, userId: auth.user.id, status: 500,
      error: error instanceof Error ? error.name : "UnknownError", durationMs: Math.round(performance.now() - startedAt) });
    return Response.json({
      jsonrpc: "2.0",
      id: metadata.rpcId,
      error: { code: -32603, message: "Finbot could not process this MCP request.",
        data: { requestId, hint: "Check the finbot server log for the matching MCP request ID." } },
    }, { status: 500, headers: { "X-MCP-Request-ID": requestId } });
  }
}

export function GET(request: Request): Response {
  const auth = requireToken(request, getDatabase());
  return "response" in auth ? auth.response : Response.json({ error: "Use POST for MCP JSON-RPC requests." },
    { status: 405, headers: { Allow: "POST" } });
}

export function DELETE(request: Request): Response {
  const auth = requireToken(request, getDatabase());
  return "response" in auth ? auth.response : Response.json({ error: "This MCP endpoint is stateless; there is no session to delete." },
    { status: 405, headers: { Allow: "POST" } });
}
