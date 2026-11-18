// "Є свій варіант?" — every member can put up to 3 of their own films into the next deck.
// Proposals skip all filters and are spread over the top of the deck, marked "Пропонує Анна".
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { api, ApiError, type MovieSummary, type RoomState } from '../lib/api'
import { useToast } from '../lib/toast'
import { Mascot } from './Mascot'

const MAX = 3
const thumb = (url: string | null) => url?.replace('/w500/', '/w185/') ?? null

export function Proposals({ room, meId, onRoom, title }: { room: RoomState; meId?: string; onRoom: (r: RoomState) => void; title: string }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MovieSummary[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const all = room.members.flatMap((m) => (m.proposals ?? []).map((p) => ({ ...p, by: m })))
  const mine = all.filter((p) => p.by.userId === meId)
  const proposed = new Set(all.map((p) => p.id))

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setResults([])
      return
    }
    let alive = true
    const t = window.setTimeout(() => {
      api
        .search(query)
        .then((r) => alive && setResults(r.slice(0, 6)))
        .catch(() => alive && setResults([]))
    }, 300)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [q])

  const run = async (id: number, fn: () => Promise<RoomState>) => {
    setBusy(id)
    try {
      onRoom(await fn())
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вийшло', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel proposals">
      <div className="mood-head">
        <div>
          <p className="eyebrow">пропозиції</p>
          <h3>{title}</h3>
        </div>
        <span className="mood-counter">
          <b className="want">
            {mine.length}/{MAX}
          </b>
        </span>
      </div>
      <p className="mood-hint">Твої фільми точно потраплять у наступну колоду — решта свайпне, чи згодна.</p>

      {all.length > 0 && (
        <ul className="proposal-list">
          <AnimatePresence initial={false}>
            {all.map((p) => (
              <motion.li key={`${p.by.userId}-${p.id}`} layout initial={{ opacity: 0, scale: 0.8, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }}>
                <div className="proposal-poster">
                  {p.poster ? <img src={thumb(p.poster)!} alt="" /> : <span>{p.title}</span>}
                  {p.by.userId === meId && (
                    <button type="button" className="proposal-remove" disabled={busy === p.id} onClick={() => run(p.id, () => api.unpropose(room.code, p.id))} aria-label={`Прибрати ${p.title}`}>
                      ✕
                    </button>
                  )}
                </div>
                <b title={p.title}>{p.title}</b>
                <small>
                  <Mascot kind={p.by.mascot} size={16} /> {p.by.userId === meId ? 'ти' : p.by.name.split(' ')[0]}
                </small>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {mine.length < MAX && (
        <div className="search proposal-search">
          <div className="search-box">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Назва фільму…" aria-label="Запропонувати фільм" />
            {q && (
              <button type="button" className="search-clear" onClick={() => setQ('')} aria-label="Очистити">
                ✕
              </button>
            )}
          </div>
          <AnimatePresence>
            {results.length > 0 && (
              <motion.ul className="search-results" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {results.map((m) => {
                  const has = proposed.has(m.id)
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        disabled={has || busy === m.id}
                        onClick={() =>
                          run(m.id, async () => {
                            const r = await api.propose(room.code, m.id)
                            setQ('')
                            return r
                          })
                        }
                      >
                        {m.poster ? <img src={m.poster.replace('/w500/', '/w92/')} alt="" /> : <span className="thumb-empty" />}
                        <span className="sr-title">
                          <b>{m.title}</b>
                          <small>
                            {m.year ?? '—'} · {m.genres.slice(0, 2).join(', ')}
                          </small>
                        </span>
                        <span className={`sr-add ${has ? 'done' : ''}`}>{busy === m.id ? <span className="spinner small" /> : has ? '✓' : '+'}</span>
                      </button>
                    </li>
                  )
                })}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}
