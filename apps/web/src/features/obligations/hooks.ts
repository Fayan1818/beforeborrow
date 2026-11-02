import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import {
  obligationsApi,
  ObligationIn,
  ObligationUpdate,
  ObligationPaymentIn,
  PaymentStatusUpdate,
} from './api'

export function useObligations(
  userId: string,
  filters?: { status?: string; kind?: string }
) {
  return useQuery({
    queryKey: [...queryKeys.obligations(userId), filters?.status ?? 'all', filters?.kind ?? 'all'],
    queryFn: ({ signal }) => obligationsApi.list(filters, signal),
    enabled: Boolean(userId),
  })
}

export function useObligation(userId: string, id: string) {
  return useQuery({
    queryKey: queryKeys.obligation(userId, id),
    queryFn: ({ signal }) => obligationsApi.get(id, signal),
    enabled: Boolean(userId && id),
  })
}

export function useCreateObligation(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ObligationIn) => obligationsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.obligations(userId) })
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    },
  })
}

export function useUpdateObligation(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ObligationUpdate }) =>
      obligationsApi.update(id, body),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.obligations(userId) })
      qc.invalidateQueries({ queryKey: queryKeys.obligation(userId, variables.id) })
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    },
  })
}

export function useDeleteObligation(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      obligationsApi.delete(id, expectedVersion),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.obligations(userId) })
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    },
  })
}

export function useCreatePayment(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      obligationId,
      body,
    }: {
      obligationId: string
      body: ObligationPaymentIn
    }) => obligationsApi.createPayment(obligationId, body),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.obligations(userId) })
      qc.invalidateQueries({ queryKey: queryKeys.obligation(userId, variables.obligationId) })
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    },
  })
}

export function useUpdatePaymentStatus(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      obligationId,
      paymentId,
      body,
    }: {
      obligationId: string
      paymentId: string
      body: PaymentStatusUpdate
    }) => obligationsApi.updatePaymentStatus(obligationId, paymentId, body),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.obligations(userId) })
      qc.invalidateQueries({ queryKey: queryKeys.obligation(userId, variables.obligationId) })
      qc.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    },
  })
}
