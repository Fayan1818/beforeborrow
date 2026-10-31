/**
 * Global API client.
 * Owner: A — do NOT create a second API client elsewhere.
 *
 * - Includes credentials on every request
 * - Parses JSON responses
 * - Supports AbortSignal
 * - Normalises errors (code, message, fields, request_id)
 * - On 401: clears TanStack Query cache and redirects to /login
 */
import { queryClient } from '@/app/providers'

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export interface ApiError {
  code: string
  message: string
  fields?: Record<string, string>
  request_id?: string
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message)
    this.name = 'ApiRequestError'
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  // CSRF token is retrieved from auth/me and stored per session
  const csrf = sessionStorage.getItem('csrf_token')
  if (csrf && method !== 'GET') {
    headers['X-CSRF-Token'] = csrf
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (res.status === 401) {
    queryClient.clear()
    window.location.href = '/login'
    throw new ApiRequestError(401, { code: 'UNAUTHORIZED', message: 'Session expired' })
  }

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    const err: ApiError = json?.error ?? { code: 'UNKNOWN', message: res.statusText }
    if (json?.request_id) err.request_id = json.request_id
    throw new ApiRequestError(res.status, err)
  }

  return json as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, undefined, signal),
  post: <T>(path: string, body: unknown, signal?: AbortSignal) => request<T>('POST', path, body, signal),
  put: <T>(path: string, body: unknown, signal?: AbortSignal) => request<T>('PUT', path, body, signal),
  patch: <T>(path: string, body: unknown, signal?: AbortSignal) => request<T>('PATCH', path, body, signal),
  delete: <T>(path: string, signal?: AbortSignal) => request<T>('DELETE', path, undefined, signal),
}
