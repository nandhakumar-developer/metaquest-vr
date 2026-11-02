export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

/** Clears local dashboard state when the gateway reports an expired session. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  let url = endpoint;
  if (options.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }
    const query = searchParams.toString();
    if (query) {
      url += (url.includes('?') ? '&' : '?') + query;
    }
  }

  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (csrfToken && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(options.method?.toUpperCase() ?? 'GET')) {
    headers.set('x-vrcc-csrf', csrfToken);
  }

  // If body is not FormData or Buffer and Content-Type not set, assume JSON
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // send session cookies
  });

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    if (response.status === 401) unauthorizedHandler?.();
    if (isJson) {
      const errorJson = await response.json();
      const err = errorJson.error || errorJson;
      throw new ApiError(
        response.status,
        err.code || 'REQUEST_FAILED',
        err.message || 'Request failed',
        err.details,
      );
    }
    const errorText = await response.text();
    throw new ApiError(response.status, 'REQUEST_FAILED', errorText || `HTTP ${response.status}`);
  }

  if (isJson) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

