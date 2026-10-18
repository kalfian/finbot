import { requestSession } from "@/lib/auth-guard";
export async function GET(request: Request): Promise<Response> { const active = await requestSession(request); return active ? Response.json({ csrfToken: active.csrf_token }) : Response.json({ error: "Authentication required." }, { status: 401 }); }
