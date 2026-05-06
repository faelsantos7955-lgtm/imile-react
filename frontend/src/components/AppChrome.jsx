/**
 * AppChrome.jsx — wrappers globais montados em main.jsx
 *  - ResponsiveToaster: top-center em mobile, top-right em desktop
 *  - GlobalFetchIndicator: barra superior enquanto há fetch/mutation ativos
 *  - OfflineBanner: aviso quando o navegador detecta perda de conexão
 */
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'

const MOBILE_QUERY = '(max-width: 640px)'

function getInitialPosition() {
  if (typeof window === 'undefined') return 'top-right'
  return window.matchMedia(MOBILE_QUERY).matches ? 'top-center' : 'top-right'
}

export function ResponsiveToaster() {
  const [position, setPosition] = useState(getInitialPosition)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => setPosition(e.matches ? 'top-center' : 'top-right')
    mq.addEventListener?.('change', onChange) || mq.addListener?.(onChange)
    return () => {
      mq.removeEventListener?.('change', onChange) || mq.removeListener?.(onChange)
    }
  }, [])
  return (
    <Toaster
      position={position}
      richColors
      toastOptions={{
        duration: 4000,
        style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '13px' },
      }}
    />
  )
}

export function GlobalFetchIndicator() {
  const fetching = useIsFetching()
  const mutating = useIsMutating()
  const [show, setShow] = useState(false)

  // Só mostra se a atividade durar mais de ~250ms — evita flash em fetch instantâneos
  useEffect(() => {
    const active = fetching > 0 || mutating > 0
    if (!active) { setShow(false); return }
    const id = setTimeout(() => setShow(true), 250)
    return () => clearTimeout(id)
  }, [fetching, mutating])

  if (!show) return null
  return <div className="global-fetch-bar" aria-hidden="true" />
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false
  )
  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])
  if (!offline) return null
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span className="offline-dot" aria-hidden="true" />
      Sem conexão — os dados podem estar desatualizados.
    </div>
  )
}
