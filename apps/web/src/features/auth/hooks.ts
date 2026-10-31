import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { authApi } from './api'

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) => authApi.me(signal),
    retry: false,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (user) => {
      sessionStorage.setItem('csrf_token', user.csrf_token)
      qc.setQueryData(queryKeys.me(), user)
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      sessionStorage.removeItem('csrf_token')
      qc.clear()
      window.location.href = '/login'
    },
  })
}
