import { useEffect, useRef } from 'react'

const LIVE_EVENT = 'sofaamy:data-changed'
const LIVE_STORAGE_KEY = 'sofaamy-live-change'

export function announceDataChange(scope = 'all') {
  if (typeof window === 'undefined') return
  const detail = { scope, at:Date.now(), nonce:Math.random().toString(36).slice(2) }
  window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail }))
  try {
    localStorage.setItem(LIVE_STORAGE_KEY, JSON.stringify(detail))
  } catch {
    // Storage can be disabled. The in-tab event and timed refresh still work.
  }
}

export function useLiveRefresh(refresh, intervalMs = 5000) {
  const refreshRef = useRef(refresh)
  const runningRef = useRef(false)
  useEffect(() => { refreshRef.current = refresh }, [refresh])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!active || runningRef.current || document.visibilityState === 'hidden') return
      runningRef.current = true
      try {
        await refreshRef.current?.()
      } catch (error) {
        console.warn('[live-refresh] refresh failed', error)
      } finally {
        runningRef.current = false
      }
    }
    const onStorage = event => {
      if (event.key === LIVE_STORAGE_KEY) run()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run()
    }
    const timer = window.setInterval(run, intervalMs)
    window.addEventListener(LIVE_EVENT, run)
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener(LIVE_EVENT, run)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
}
