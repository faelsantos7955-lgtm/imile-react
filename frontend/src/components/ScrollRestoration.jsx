/**
 * ScrollRestoration.jsx — preserva o scroll por location.key.
 *
 * Em PUSH/REPLACE (link clicado), volta pro topo da página.
 * Em POP (back/forward do browser), restaura a posição salva.
 * Usado dentro do <BrowserRouter> em main.jsx.
 */
import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const positions = new Map()

export default function ScrollRestoration() {
  const location = useLocation()
  const navType = useNavigationType()
  const currentKey = useRef(location.key)

  // Mantém a posição da location atual sempre fresca
  useEffect(() => {
    currentKey.current = location.key
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        positions.set(currentKey.current, window.scrollY)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
    }
  }, [location.key])

  // Restaura ou reseta no início de cada navegação
  useEffect(() => {
    if (navType === 'POP') {
      const y = positions.get(location.key)
      window.scrollTo({ top: y ?? 0, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
    }
  }, [location.key, navType])

  return null
}
