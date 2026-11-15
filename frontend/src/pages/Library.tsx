import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Mascot } from '../components/Mascot'
import { Stars, TicketButton, Toggle } from '../components/Ui'
import { api, ApiError, type LibraryItem, type MovieSummary } from '../lib/api'
import { readLetterboxdFile } from '../lib/letterboxd'
import { useToast } from '../lib/toast'
import { useProfile } from '../App'

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

function Search({ owned, onAdd }: { owned: Set<number>; onAdd: (m: MovieSummary) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MovieSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)
  const dq = useDebounced(q.trim(), 300)

  useEffect(() => {
    if (dq.length < 2) {
      setResults([])
      return
    }
    let alive = true
    setLoading(true)
    api
      .search(dq)
      .then((r) => alive && setResults(r))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [dq])

  return (
    <div className="search">
      <div className="search-box">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Знайти фільм, який ти бачив…" aria-label="Пошук фільму" />
        {loading && <span className="spinner small" />}
        {q && (
          <button type="button" className="search-clear" onClick={() => setQ('')} aria-label="Очистити">
            ✕
          </button>
        )}
      </div>
      <AnimatePresence>
        {results.length > 0 && (
          <motion.ul className="search-results" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {results.map((m, i) => {
              const has = owned.has(m.id)
              return (
                <motion.li key={m.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <button
                    type="button"
                    disabled={has || adding === m.id}
                    onClick={async () => {
                      setAdding(m.id)
                      await onAdd(m)
                      setAdding(null)
                    }}
                  >
                    {m.poster ? <img src={m.poster.replace('/w500/', '/w92/')} alt="" /> : <span className="thumb-empty" />}
                    <span className="sr-title">
                      <b>{m.title}</b>
                      <small>
                        {m.year ?? '—'} · {m.genres.slice(0, 2).join(', ')}
                      </small>
                    </span>
                    <motion.span className={`sr-add ${has ? 'done' : ''}`} whileTap={{ scale: 0.7 }}>
                      {adding === m.id ? <span className="spinner small" /> : has ? '✓' : '+'}
                    </motion.span>
                  </button>
                </motion.li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function Importer({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const viaRss = async () => {
    if (!username.trim()) return
    setBusy(true)
    try {
      const r = await api.importLetterboxd(username.trim())
      toast(r.note ?? `Додано ${r.imported} фільмів з Letterboxd`, 'success')
      onDone()
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вийшло', 'error')
    } finally {
      setBusy(false)
    }
  }

  const viaFile = async (file: File) => {
    setBusy(true)
    try {
      const entries = await readLetterboxdFile(file)
      if (!entries.length) throw new Error('У файлі не знайшлося фільмів')
      let imported = 0
      const missing: string[] = []
      setProgress({ done: 0, total: entries.length })
      for (let i = 0; i < entries.length; i += 40) {
        const r = await api.importTitles(entries.slice(i, i + 40))
        imported += r.imported
        missing.push(...r.notFound)
        setProgress({ done: Math.min(i + 40, entries.length), total: entries.length })
      }
      toast(`Імпортовано ${imported} з ${entries.length}${missing.length ? ` · не знайшли ${missing.length}` : ''}`, 'success')
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не вийшло прочитати файл', 'error')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className={`importer ${open ? 'open' : ''}`}>
      <button type="button" className="importer-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="lb-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>Підключити Letterboxd</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}>⌄</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="importer-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="importer-row">
              <label>
                <span className="label">Швидко: останні ~50 переглядів за нікнеймом</span>
                <div className="inline-form">
                  <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="нікнейм або посилання на профіль" />
                  <TicketButton onClick={viaRss} loading={busy && !progress} disabled={!username.trim()}>
                    Підтягнути
                  </TicketButton>
                </div>
              </label>
            </div>
            <div className="importer-row">
              <span className="label">Повністю: файл експорту (Letterboxd → Settings → Data → Export your data)</span>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,.csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) viaFile(f)
                  e.target.value = ''
                }}
              />
              <TicketButton variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
                Завантажити .zip або .csv
              </TicketButton>
              {progress && (
                <div className="progress">
                  <motion.div className="progress-bar" animate={{ width: `${(progress.done / progress.total) * 100}%` }} />
                  <span>
                    {progress.done} / {progress.total}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PosterTile({ item, onChange, onRemove }: { item: LibraryItem; onChange: (p: Partial<LibraryItem>) => void; onRemove: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 })
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 })
  const [glare, setGlare] = useState({ x: 50, y: 50 })
  return (
    <motion.article
      layout
      className={`poster-tile ${item.rewatch ? 'rewatch' : ''}`}
      initial={{ opacity: 0, scale: 0.8, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.6, rotate: -8 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <motion.div
        ref={ref}
        className="poster-frame"
        style={{ rotateX: rx, rotateY: ry }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse' || !ref.current) return
          const r = ref.current.getBoundingClientRect()
          const px = (e.clientX - r.left) / r.width
          const py = (e.clientY - r.top) / r.height
          ry.set((px - 0.5) * 18)
          rx.set(-(py - 0.5) * 18)
          setGlare({ x: px * 100, y: py * 100 })
        }}
        onPointerLeave={() => {
          rx.set(0)
          ry.set(0)
        }}
      >
        {item.poster ? <img src={item.poster} alt={item.title} loading="lazy" /> : <div className="poster-empty">{item.title}</div>}
        <div className="poster-glare" style={{ background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,.25), transparent 55%)` }} />
        <button type="button" className="poster-remove" onClick={onRemove} aria-label={`Прибрати ${item.title}`}>
          ✕
        </button>
        {item.source === 'letterboxd' && <span className="poster-badge">LB</span>}
      </motion.div>
      <div className="poster-info">
        <b title={item.title}>{item.title}</b>
        <small>{item.year ?? ''}</small>
        <Stars value={item.myRating} size={15} onChange={(v) => onChange({ myRating: v })} />
        <label className="rewatch-row">
          <Toggle on={item.rewatch} onChange={(v) => onChange({ rewatch: v })} label="Готовий передивитись" />
          <span>{item.rewatch ? 'передивлюсь' : 'не повторювати'}</span>
        </label>
      </div>
    </motion.article>
  )
}

export default function Library() {
  const toast = useToast()
  const { profile } = useProfile()
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'rewatch'>('all')

  const load = () => api.library().then(setItems).catch(() => setItems([]))
  useEffect(() => {
    load()
  }, [])

  const owned = useMemo(() => new Set(items?.map((i) => i.movieId)), [items])
  const shown = (items ?? []).filter((i) => filter === 'all' || i.rewatch)

  const add = async (m: MovieSummary) => {
    try {
      const item = await api.addToLibrary(m.id)
      setItems((list) => [item, ...(list ?? []).filter((i) => i.movieId !== item.movieId)])
      toast(`«${m.title}» у фільмотеці`, 'success')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вдалося додати', 'error')
    }
  }

  const patch = async (item: LibraryItem, p: Partial<LibraryItem>) => {
    setItems((list) => list?.map((i) => (i.movieId === item.movieId ? { ...i, ...p } : i)) ?? null)
    try {
      await api.patchLibrary(item.movieId, { rewatch: p.rewatch, myRating: p.myRating })
    } catch {
      toast('Не вдалося зберегти', 'error')
      load()
    }
  }

  const remove = async (item: LibraryItem) => {
    setItems((list) => list?.filter((i) => i.movieId !== item.movieId) ?? null)
    try {
      await api.removeFromLibrary(item.movieId)
    } catch {
      load()
    }
  }

  return (
    <div className="library">
      <header className="page-head">
        <div>
          <p className="eyebrow">фільмотека</p>
          <h1 className="display">Що ти бачив</h1>
          <p className="muted">
            Ми не пропонуватимемо ці фільми — хіба що ти ввімкнеш <span className="hl">«передивлюсь»</span>.
          </p>
        </div>
      </header>

      <Search owned={owned} onAdd={add} />
      <Importer onDone={load} />

      <div className="filter-tabs" role="tablist">
        {(['all', 'rewatch'] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {filter === f && <motion.span layoutId="lib-tab" className="tab-pill" />}
            <span>{f === 'all' ? `Усі · ${items?.length ?? 0}` : `Передивлюсь · ${items?.filter((i) => i.rewatch).length ?? 0}`}</span>
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="poster-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="poster-skeleton" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <Mascot kind={profile?.mascot ?? 'popcorn'} mood="sleepy" size={110} />
          <p>{filter === 'all' ? 'Поки порожньо. Знайди фільм вище або підтягни історію з Letterboxd.' : 'Ще немає фільмів, які ти готовий передивитись.'}</p>
        </div>
      ) : (
        <motion.div className="poster-grid" layout>
          <AnimatePresence>
            {shown.map((item) => (
              <PosterTile key={item.movieId} item={item} onChange={(p) => patch(item, p)} onRemove={() => remove(item)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}
