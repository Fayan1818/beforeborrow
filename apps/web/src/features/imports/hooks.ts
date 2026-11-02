import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { importsApi, ImportCommitRequest, ImportPreviewResult, ImportCommitResult, ImportBatchOut } from './api'

export function useImportBatches(userId: string | undefined) {
  return useQuery<ImportBatchOut[]>({
    queryKey: userId ? queryKeys.imports(userId) : ['imports'],
    queryFn: ({ signal }) => importsApi.list(signal),
    enabled: Boolean(userId),
  })
}

export function useImportPreview() {
  return useMutation<ImportPreviewResult, Error, File>({
    mutationFn: (file: File) => importsApi.preview(file),
  })
}

export function useCommitImport(userId: string | undefined) {
  const qc = useQueryClient()
  return useMutation<ImportCommitResult, Error, ImportCommitRequest>({
    mutationFn: (body: ImportCommitRequest) => importsApi.commit(body),
    onSuccess: () => {
      if (userId) {
        qc.invalidateQueries({ queryKey: queryKeys.imports(userId) })
        qc.invalidateQueries({ queryKey: queryKeys.obligations(userId) })
        qc.invalidateQueries({ queryKey: queryKeys.profile(userId) })
        qc.invalidateQueries({ queryKey: [userId, 'calendar'] })
      }
    },
  })
}
