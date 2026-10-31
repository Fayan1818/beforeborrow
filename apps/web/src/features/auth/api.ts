import { api } from '@/lib/api'

export interface UserOut {
  id: string
  email_normalized: string
  created_at: string
  csrf_token: string
}

export const authApi = {
  me: (signal?: AbortSignal) => api.get<UserOut>('/auth/me', signal),
  signup: (email: string, password: string) =>
    api.post<UserOut>('/auth/signup', { email, password }),
  login: (email: string, password: string) =>
    api.post<UserOut>('/auth/login', { email, password }),
  logout: () => api.post<void>('/auth/logout', {}),
}
