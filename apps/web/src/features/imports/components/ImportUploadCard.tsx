import { useState, useRef, ChangeEvent } from 'react'

const MAX_BYTES = 1024 * 1024 // 1 MiB

interface ImportUploadCardProps {
  onPreview: (file: File) => void
  isLoading: boolean
  errorMessage?: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function ImportUploadCard({ onPreview, isLoading, errorMessage }: ImportUploadCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setValidationError(null)
    const file = e.target.files?.[0]
    if (!file) return

    // 1. Enforce .csv extension
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setValidationError('Please select a valid CSV file (.csv)')
      setSelectedFile(null)
      return
    }

    // 2. Early frontend validation for 1 MiB file size limit
    if (file.size > MAX_BYTES) {
      setValidationError(
        `Selected file (${formatBytes(file.size)}) exceeds the maximum allowed size of 1 MiB`
      )
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
  }

  function handleUpload() {
    if (!selectedFile) return
    onPreview(selectedFile)
  }

  function handleReset() {
    setSelectedFile(null)
    setValidationError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const effectiveError = validationError || errorMessage

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 24,
        marginBottom: 24,
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
        Upload Statement CSV
      </h3>
      <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
        Upload credit card, loan, or BNPL repayment schedules as CSV (max 1 MiB).
        Payments will be staged for preview and explicit review before committing to your financial profile.
      </p>

      {/* Upload Box */}
      <div
        style={{
          border: '2px dashed #cbd5e1',
          borderRadius: 8,
          padding: 24,
          textAlign: 'center',
          background: selectedFile ? '#f0fdfa' : '#f8fafc',
          marginBottom: 16,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="csv-file-input"
          disabled={isLoading}
        />

        {!selectedFile ? (
          <div>
            <label
              htmlFor="csv-file-input"
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: 'white',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                color: '#334155',
                marginBottom: 8,
              }}
            >
              Choose CSV File
            </label>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Standard CSV format: provider_alias, external_ref, kind, due_date, amount_inr, status
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 24 }}>📄</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
              {selectedFile.name}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {formatBytes(selectedFile.size)}
            </span>
            <button
              onClick={handleReset}
              disabled={isLoading}
              style={{
                marginTop: 6,
                background: 'none',
                border: 'none',
                color: '#b91c1c',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Choose another file
            </button>
          </div>
        )}
      </div>

      {effectiveError && (
        <div
          style={{
            padding: 12,
            borderRadius: 6,
            background: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          <strong>Upload Error:</strong> {effectiveError}
        </div>
      )}

      {selectedFile && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={handleReset}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              background: 'white',
              border: '1px solid #cbd5e1',
              color: '#475569',
              fontSize: 13,
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={isLoading}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              background: 'var(--color-primary, #0d9488)',
              color: 'white',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {isLoading ? 'Processing Preview...' : 'Preview Statement'}
          </button>
        </div>
      )}
    </div>
  )
}
