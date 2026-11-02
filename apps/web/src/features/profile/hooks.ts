import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import {
  profileApi,
  ProfileIn,
  CashflowRuleIn,
  CashflowRuleUpdate,
  CashflowDirection,
} from './api'

export function useProfile(userId: string) {
  return useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: ({ signal }) => profileApi.get(signal),
    enabled: Boolean(userId),
    retry: (failureCount, error) => {
      // Don't retry 404 (user simply hasn't created profile yet)
      if ((error as { status?: number })?.status === 404) return false
      return failureCount < 2
    },
  })
}

export function useCreateProfile(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ProfileIn) => profileApi.create(body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.profile(userId), data)
      qc.invalidateQueries({ queryKey: queryKeys.cashflowRules(userId) })
    },
  })
}

export function useUpdateProfile(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ProfileIn) => profileApi.update(body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.profile(userId), data)
      qc.invalidateQueries({ queryKey: queryKeys.cashflowRules(userId) })
    },
  })
}

export function useCashflowRules(userId: string, direction?: CashflowDirection) {
  return useQuery({
    queryKey: direction
      ? [...queryKeys.cashflowRules(userId), direction]
      : queryKeys.cashflowRules(userId),
    queryFn: ({ signal }) => profileApi.listCashflowRules(direction, signal),
    enabled: Boolean(userId),
  })
}

export function useCreateCashflowRule(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CashflowRuleIn) => profileApi.createCashflowRule(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cashflowRules(userId) })
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    },
  })
}

export function useUpdateCashflowRule(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CashflowRuleUpdate }) =>
      profileApi.updateCashflowRule(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cashflowRules(userId) })
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    },
  })
}

export function useDeleteCashflowRule(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedDataVersion }: { id: string; expectedDataVersion: number }) =>
      profileApi.deleteCashflowRule(id, expectedDataVersion),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cashflowRules(userId) })
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    },
  })
}

export function useFinancialSnapshot(userId: string) {
  return useQuery({
    queryKey: queryKeys.financialSnapshot(userId),
    queryFn: ({ signal }) => profileApi.getSnapshot(signal),
    enabled: Boolean(userId),
    retry: (failureCount, error) => {
      if ((error as { status?: number })?.status === 404) return false
      return failureCount < 2
    },
  })
}
