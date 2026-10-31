import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from './providers'
import { router } from './router'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
