// Invites and friends' open rooms. Polled every 8 s while the tab is visible — cheap, and fast enough for
// "Anna called you in". Shared between pages through a module-level cache so switching tabs is instant.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type Live } from './api'
import { useToast } from './toast'

const POLL_MS = 8000
let cache: Live | null = null

export function useLive() {
  const [live, setLive] = useState<Live | null>(cache)
  const refresh = useCallback(async () => {
    try {
      cache = await api.live()
      setLive(cache)
    } catch {
      /* keep the last known state */
    }
  }, [])

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    const tick = async () => {
      if (document.visibilityState === 'visible') await refresh()
      if (alive) timer = window.setTimeout(tick, POLL_MS)
    }
    tick()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [refresh])

  const dismiss = useCallback((code: string) => {
    if (cache) cache = { ...cache, invites: cache.invites.filter((i) => i.code !== code) }
    setLive(cache)
    api.dismissInvite(code).catch(() => {})
  }, [])

  return { live, refresh, dismiss }
}

/** Join a room straight away (no gate screen) and go there. */
export function useHopIn() {
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const hop = async (code: string) => {
    setBusy(code)
    try {
      await api.joinRoom(code)
      navigate(`/r/${code}`)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вдалося зайти', 'error')
      setBusy(null)
    }
  }
  return { hop, busy }
}
