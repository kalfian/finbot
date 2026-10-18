export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !headers.has("x-csrf-token")) headers.set("x-csrf-token", document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ?? "");
  return fetch(input, { ...init, headers });
}
