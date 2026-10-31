import { useMutation } from '@tanstack/react-query'
import { importsApi } from './api'

export function useImportPreview() {
  return useMutation({ mutationFn: (file: File) => importsApi.preview(file) })
}
