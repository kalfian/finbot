/** REST v1 uses the HttpOnly login cookie and server-side same-origin checks. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
