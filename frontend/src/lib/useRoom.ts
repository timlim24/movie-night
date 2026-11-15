// Room state by polling every 2 s (simpler and cheaper than WebSockets for 2–12 people).
// The deck is downloaded once per round; later polls ask for ?deck=0.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type MovieCard, type RoomState } from './api'

const POLL_MS = 2000

export function useRoom(code: string) {
  const [room, setRoom] = useState<RoomState | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const deckRef = useRef<{ round: number; deck: MovieCard[] } | null>(null)
  const timer = useRef<number>()

  const merge = useCallback((s: RoomState) => {
    if (s.deck) deckRef.current = { round: s.round, deck: s.deck }
    const deck = deckRef.current && deckRef.current.round === s.round ? deckRef.current.deck : s.deck ?? null
    setRoom({ ...s, deck })
    setError(null)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const needDeck = !deckRef.current
      let s = await api.room(code, needDeck)
      if (s.isMember && s.status !== 'lobby' && s.deckSize > 0 && (!deckRef.current || deckRef.current.round !== s.round) && !s.deck) {
        s = await api.room(code, true)
      }
      merge(s)
    } catch (e) {
      if (e instanceof ApiError) setError(e)
    }
  }, [code, merge])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (!alive) return
      if (document.visibilityState === 'visible') await refresh()
      if (alive) timer.current = window.setTimeout(tick, POLL_MS)
    }
    tick()
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { room, error, refresh, merge }
}
