import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import ScrollRestoration from './components/ScrollRestoration'
import { ResponsiveToaster, GlobalFetchIndicator, OfflineBanner } from './components/AppChrome'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // dados frescos por 5 min
      gcTime:    30 * 60 * 1000,   // cache sobrevive 30 min em background
      retry: 1,
    },
  },
})

// Browser scroll-restoration nativo: deixa o React assumir
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ScrollRestoration />
          <OfflineBanner />
          <GlobalFetchIndicator />
          <App />
          <ResponsiveToaster />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
