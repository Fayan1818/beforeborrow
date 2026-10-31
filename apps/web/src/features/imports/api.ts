export const importsApi = {
  preview: async (file: File): Promise<object> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/v1/imports/preview', {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) throw new Error('Preview failed')
    return res.json()
  },

  commit: async (batchId: string, selectedRows: number[]): Promise<object> => {
    const res = await fetch(`/api/v1/imports/${batchId}/commit`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selected_rows: selectedRows }),
    })
    if (!res.ok) throw new Error('Commit failed')
    return res.json()
  },
}
