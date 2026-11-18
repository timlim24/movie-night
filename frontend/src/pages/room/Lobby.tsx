// The lobby: everyone sets their own mood (up to 3 genres, runtime, era), sees what the room adds up to,
// and can call friends in. The host only decides when the show starts.
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mascot, type Mood } from '../../components/Mascot'
import { Proposals } from '../../components/Proposals'
import { Audience, RoomTicket } from '../../components/Room'
import { Countdown, TicketButton, Toggle } from '../../components/Ui'
import { api, ApiError, EMPTY_PREFS, MASCOTS, type Era, type Friend, type Genre, type Prefs, type RoomMember, type RoomState } from '../../lib/api'
import { useToast } from '../../lib/toast'

const MAX_GENRES = 3

const RUNTIMES: { label: string; value: number | null }[] = [
  { label: 'Будь-яка', value: null },
  { label: 'до 1,5 год', value: 95 },
  { label: 'до 2 год', value: 120 },
  { label: 'до 2,5 год', value: 150 },
]

const ERAS: { label: string; short: string; value: Era }[] = [
  { label: 'Класика · до 1990', short: 'класика', value: 'classic' },
  { label: '1990–2009', short: '1990–2009', value: 'modern' },
  { label: 'Нові · 2010+', short: 'нові', value: 'new' },
]

let genreCache: Genre[] | null = null
function useGenres() {
  const [genres, setGenres] = useState<Genre[]>(genreCache ?? [])
  useEffect(() => {
    if (!genreCache)
      api
        .genres()
        .then((g) => {
          genreCache = g
          setGenres(g)
        })
        .catch(() => {})
  }, [])
  return genres
}

const prefsOf = (m?: RoomMember): Prefs => {
  const p = m?.prefs ?? {}
  return {
    genres: p.genres ?? [],
    veto: p.veto ?? [],
    maxRuntime: p.maxRuntime ?? null,
    eras: p.eras ?? (p.era ? [p.era] : EMPTY_PREFS.eras),
  }
}
const firstName = (name: string) => name.split(' ')[0]

/** Smallest set of genres that touches every member's picks — what an ideal film would mix. */
function coverSet(picks: number[][]): number[] {
  const freq = new Map<number, number>()
  picks.forEach((p) => new Set(p).forEach((g) => freq.set(g, (freq.get(g) ?? 0) + 1)))
  let open = picks.map((_, i) => i)
  const out: number[] = []
  while (open.length && out.length < 3) {
    let best = -1
    let bestScore = -1
    for (const [g, f] of freq) {
      const s = open.filter((i) => picks[i].includes(g)).length * 100 + f
      if (s > bestScore) [best, bestScore] = [g, s]
    }
    if (best < 0) break
    out.push(best)
    open = open.filter((i) => !picks[i].includes(best))
  }
  return out
}

type ChipState = 'want' | 'veto' | null

function MoodPanel({ room, meId, prefs, onChange }: { room: RoomState; meId?: string; prefs: Prefs; onChange: (p: Prefs) => void }) {
  const genres = useGenres()
  const [warn, setWarn] = useState<string | null>(null)
  const shake = useAnimationControls()
  const others = room.members.filter((m) => m.userId !== meId)
  const wantedBy = (id: number) => others.filter((m) => prefsOf(m).genres.includes(id))
  const vetoedBy = (id: number) => others.filter((m) => prefsOf(m).veto.includes(id))
  const stateOf = (id: number): ChipState => (prefs.genres.includes(id) ? 'want' : prefs.veto.includes(id) ? 'veto' : null)

  const bump = (msg: string) => {
    setWarn(msg)
    shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.4 } })
    window.setTimeout(() => setWarn(null), 1800)
  }

  // Tap cycles: nothing → ♥ хочу → ✕ точно ні → nothing. A full list is skipped over.
  const cycle = (id: number) => {
    const genresNoId = prefs.genres.filter((g) => g !== id)
    const vetoNoId = prefs.veto.filter((g) => g !== id)
    const st = stateOf(id)
    let next: ChipState = st === null ? 'want' : st === 'want' ? 'veto' : null
    if (next === 'want' && prefs.genres.length >= MAX_GENRES) next = 'veto'
    if (next === 'veto' && prefs.veto.length >= MAX_GENRES) {
      if (st === null) return bump('максимум по 3')
      next = null
    }
    onChange({ ...prefs, genres: next === 'want' ? [...genresNoId, id] : genresNoId, veto: next === 'veto' ? [...vetoNoId, id] : vetoNoId })
  }

  const toggleEra = (e: Era) =>
    onChange({ ...prefs, eras: prefs.eras.includes(e) ? prefs.eras.filter((x) => x !== e) : ERAS.map((x) => x.value).filter((x) => x === e || prefs.eras.includes(x)) })

  return (
    <section className="panel mood">
      <div className="mood-head">
        <div>
          <p className="eyebrow">твій настрій</p>
          <h3>Що хочеш сьогодні?</h3>
        </div>
        <motion.div className={`mood-counter ${warn ? 'full' : ''}`} animate={shake}>
          {warn ?? (
            <>
              <b className="want">♥ {prefs.genres.length}/3</b>
              <b className="veto">✕ {prefs.veto.length}/3</b>
            </>
          )}
        </motion.div>
      </div>
      <p className="mood-hint">
        Тап — <b className="want">♥ хочу</b>, ще тап — <b className="veto">✕ точно ні</b>, ще раз — скинути. Чуже «точно ні» прибирає жанр для всіх.
      </p>
      <div className="chips">
        {genres.map((g) => {
          const st = stateOf(g.id)
          const fans = wantedBy(g.id)
          const haters = vetoedBy(g.id)
          return (
            <motion.button
              key={g.id}
              type="button"
              className={`chip ${st === 'want' ? 'on' : ''} ${st === 'veto' ? 'veto' : ''} ${fans.length && st !== 'veto' ? 'shared' : ''} ${st === 'want' && fans.length ? 'together' : ''} ${haters.length ? 'banned' : ''}`}
              whileTap={{ scale: 0.88 }}
              animate={st ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              onClick={() => cycle(g.id)}
              aria-label={`${g.name}: ${st === 'want' ? 'хочу' : st === 'veto' ? 'точно ні' : 'без різниці'}`}
              title={haters.length ? `Не хоче: ${haters.map((h) => h.name).join(', ')}` : undefined}
            >
              {st === 'want' && <span className="chip-mark">♥</span>}
              {st === 'veto' && <span className="chip-mark">✕</span>}
              <span className="chip-label">{g.name}</span>
              {(fans.length > 0 || haters.length > 0) && (
                <span className="chip-fans">
                  {fans.slice(0, 3).map((f) => (
                    <Mascot key={f.userId} kind={f.mascot} size={18} />
                  ))}
                  {haters.length > 0 && <span className="chip-ban">✕{haters.length > 1 ? haters.length : ''}</span>}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
      <div className="filter-row">
        <span className="label">Тривалість</span>
        <div className="segmented">
          {RUNTIMES.map((r) => (
            <button key={r.label} type="button" className={prefs.maxRuntime === r.value ? 'on' : ''} onClick={() => onChange({ ...prefs, maxRuntime: r.value })}>
              {prefs.maxRuntime === r.value && <motion.span layoutId="seg-runtime" className="seg-pill" />}
              <span>{r.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="filter-row">
        <span className="label">Які роки тобі ок? {prefs.eras.length === 0 && <em className="muted">· будь-які</em>}</span>
        <div className="chips eras">
          {ERAS.map((e) => (
            <motion.button key={e.value} type="button" whileTap={{ scale: 0.9 }} className={`chip ${prefs.eras.includes(e.value) ? 'on' : ''}`} onClick={() => toggleEra(e.value)}>
              {e.label}
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  )
}

function Together({ room, meId, myPrefs, onRewatch }: { room: RoomState; meId?: string; myPrefs: Prefs; onRewatch: (v: boolean) => void }) {
  const genres = useGenres()
  const name = (id: number) => genres.find((g) => g.id === id)?.name ?? '…'
  const lower = (id: number) => name(id).toLowerCase()
  // Mirrors rooms/logic.combine; my own picks come from local state so the summary reacts instantly.
  const members = room.members.map((m) => ({ ...m, p: m.userId === meId ? myPrefs : prefsOf(m) }))
  const vetoers = new Map<number, string[]>()
  members.forEach((m) => m.p.veto.forEach((g) => vetoers.set(g, [...(vetoers.get(g) ?? []), m.userId === meId ? 'ти' : firstName(m.name)])))
  const picks = members.map((m) => m.p.genres.filter((g) => !vetoers.has(g))).filter((p) => p.length)
  const shared = picks.length ? picks.reduce((acc, p) => acc.filter((g) => p.includes(g))) : []
  const cover = coverSet(picks)
  const strictest = members.filter((m) => m.p.maxRuntime).sort((a, b) => a.p.maxRuntime! - b.p.maxRuntime!)[0]
  const eraSets = members.map((m) => m.p.eras).filter((e) => e.length)
  const eraOverlap = eraSets.length ? ERAS.filter((e) => eraSets.every((s) => s.includes(e.value))) : []
  const eraConflict = eraSets.length > 0 && eraOverlap.length === 0
  const eraShown = eraConflict ? ERAS.filter((e) => eraSets.some((s) => s.includes(e.value))) : eraOverlap

  let looking: string
  let hint: string | null = null
  if (!picks.length) looking = 'Під ваші смаки з фільмотек'
  else if (picks.length === 1) looking = picks[0].map(name).join(', ')
  else if (shared.length) {
    looking = shared.map(name).join(', ')
    hint = shared.length > 1 ? 'хочуть усі' : 'хочуть усі — найкращий варіант'
  } else {
    looking = cover.map(name).join(' + ')
    hint = 'спільного жанру немає — спершу фільми, де є все це разом'
  }

  return (
    <section className="panel together-panel">
      <p className="eyebrow">разом виходить</p>
      <ul className="together-people">
        {members.map((m) => (
          <motion.li key={m.userId} layout className={m.userId === meId ? 'me' : ''}>
            <Mascot kind={m.mascot} size={34} mood={m.p.genres.length ? 'happy' : 'idle'} />
            <b>{m.userId === meId ? 'Ти' : firstName(m.name)}</b>
            <span className="together-picks">
              <AnimatePresence initial={false}>
                {m.p.genres.map((g) => (
                  <motion.em
                    key={`w${g}`}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className={vetoers.has(g) ? 'lost' : shared.includes(g) || cover.includes(g) ? 'key' : ''}
                    title={vetoers.has(g) ? `Не хоче: ${vetoers.get(g)!.join(', ')}` : undefined}
                  >
                    ♥ {name(g)}
                  </motion.em>
                ))}
                {m.p.veto.map((g) => (
                  <motion.em key={`v${g}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="no">
                    ✕ {name(g)}
                  </motion.em>
                ))}
                {!m.p.genres.length && !m.p.veto.length && (
                  <motion.small key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    будь-що
                  </motion.small>
                )}
              </AnimatePresence>
            </span>
          </motion.li>
        ))}
      </ul>
      <div className="together-result">
        <div className="wide">
          <span className="label">Шукаємо</span>
          <b>{looking}</b>
          {hint && <small className="together-hint">{hint}</small>}
          {vetoers.size > 0 && (
            <small className="together-veto">
              без: {[...vetoers.entries()].map(([g, who]) => `${lower(g)} (${who.join(', ')})`).join(', ')}
            </small>
          )}
        </div>
        <div>
          <span className="label">Тривалість</span>
          <b>{strictest ? RUNTIMES.find((r) => r.value === strictest.p.maxRuntime)?.label : 'будь-яка'}</b>
          {strictest && <small className="together-hint">{strictest.userId === meId ? 'твій ліміт' : `так хоче ${firstName(strictest.name)}`}</small>}
        </div>
        <div>
          <span className="label">Роки</span>
          <b>{eraShown.length ? eraShown.map((e) => e.short).join(' або ') : 'будь-які'}</b>
          {eraConflict && <small className="together-veto">не перетинаються — беремо всі обрані</small>}
        </div>
      </div>
      <label className="filter-row rewatch-row">
        <Toggle on={room.filters.includeRewatch} disabled={!room.isHost} onChange={onRewatch} label="Додавати фільми, які всі готові передивитись" />
        <span>
          Додавати фільми «на передивитись»
          {!room.isHost && <small className="muted"> · вирішує ведучий</small>}
        </span>
      </label>
    </section>
  )
}

function InviteFriends({ room }: { room: RoomState }) {
  const toast = useToast()
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  useEffect(() => {
    api.friends().then(setFriends).catch(() => setFriends([]))
  }, [])
  const inside = new Set(room.members.map((m) => m.userId))
  const outside = (friends ?? []).filter((f) => !inside.has(f.id))
  if (!friends || outside.length === 0) return null

  const call = async (ids: string[]) => {
    try {
      const r = await api.invite(room.code, ids)
      setSent((s) => new Set([...s, ...r.invited]))
      toast(r.invited.length > 1 ? 'Запрошення надіслано' : 'Запрошення надіслано — побачить на головній', 'success')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вдалося запросити', 'error')
    }
  }
  const left = outside.filter((f) => !sent.has(f.id))

  return (
    <section className="panel invite-friends">
      <div className="mood-head">
        <div>
          <p className="eyebrow">друзі</p>
          <h3>Поклич своїх</h3>
        </div>
        {left.length > 1 && (
          <button type="button" className="chip-btn ghost" onClick={() => call(left.map((f) => f.id))}>
            Усіх · {left.length}
          </button>
        )}
      </div>
      <ul className="friend-strip">
        {outside.map((f, i) => {
          const done = sent.has(f.id)
          return (
            <motion.li key={f.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Mascot kind={f.mascot} size={50} mood={done ? 'excited' : 'idle'} />
              <b>{firstName(f.name)}</b>
              <motion.button type="button" className={`call-btn ${done ? 'done' : ''}`} disabled={done} whileTap={{ scale: 0.9 }} onClick={() => call([f.id])}>
                {done ? '✓ покликано' : 'Покликати'}
              </motion.button>
            </motion.li>
          )
        })}
      </ul>
    </section>
  )
}

export function Lobby({ room, meId, onRoom }: { room: RoomState; meId?: string; onRoom: (r: RoomState) => void }) {
  const toast = useToast()
  const [starting, setStarting] = useState(false)
  const me = room.members.find((m) => m.userId === meId)
  const [prefs, setPrefs] = useState<Prefs>(() => prefsOf(me))
  const pending = useRef<{ timer?: number; prefs?: Prefs }>({})
  const [rewatch, setRewatch] = useState(room.filters.includeRewatch)
  const view = useMemo(() => ({ ...room, filters: { includeRewatch: room.isHost ? rewatch : room.filters.includeRewatch } }), [room, rewatch])

  const savePrefs = async (p: Prefs) => {
    pending.current = {}
    try {
      onRoom(await api.setPrefs(room.code, p))
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не збереглось', 'error')
    }
  }

  const changePrefs = (p: Prefs) => {
    setPrefs(p)
    window.clearTimeout(pending.current.timer)
    pending.current = { prefs: p, timer: window.setTimeout(() => savePrefs(p), 450) }
  }

  const changeRewatch = (v: boolean) => {
    setRewatch(v)
    api.setSettings(room.code, { includeRewatch: v }).then(onRoom).catch((e) => toast(e instanceof ApiError ? e.message : 'Не збереглось', 'error'))
  }

  const cycleMascot = async () => {
    if (!me) return
    const next = MASCOTS[(MASCOTS.indexOf(me.mascot) + 1) % MASCOTS.length]
    try {
      onRoom(await api.setRoomMascot(room.code, next))
    } catch {
      /* ignore */
    }
  }

  const start = async () => {
    setStarting(true)
    try {
      if (pending.current.prefs) {
        window.clearTimeout(pending.current.timer)
        await api.setPrefs(room.code, pending.current.prefs)
        pending.current = {}
      }
      onRoom(await api.start(room.code))
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вдалося стартувати', 'error')
      setStarting(false)
    }
  }

  const picked = (p: Prefs) => p.genres.length + p.veto.length > 0
  const ready = room.members.filter((m) => picked(m.userId === meId ? prefs : prefsOf(m))).length
  const moods: Record<string, Mood> = Object.fromEntries(
    room.members.map((m) => [m.userId, picked(m.userId === meId ? prefs : prefsOf(m)) ? 'excited' : m.isHost ? 'happy' : 'idle']),
  )

  return (
    <section className="lobby">
      <RoomTicket code={room.code} />
      <div className="lobby-audience">
        <Audience members={room.members} meId={meId} moods={moods} onTapMe={cycleMascot} />
        <p className="muted small center">Торкнись свого маскота, щоб змінити його</p>
      </div>
      <MoodPanel room={room} meId={meId} prefs={prefs} onChange={changePrefs} />
      <Together room={view} meId={meId} myPrefs={prefs} onRewatch={changeRewatch} />
      <Proposals room={room} meId={meId} onRoom={onRoom} title="Є свій фільм на сьогодні?" />
      <InviteFriends room={room} />
      <Link to="/library" className="link-btn center">
        Додай переглянуті фільми — підбірка буде точнішою →
      </Link>
      <div className="lobby-cta">
        {room.members.length > 1 && (
          <span className="ready-note">
            обрали настрій: {ready} з {room.members.length}
          </span>
        )}
        {room.isHost ? (
          <TicketButton big onClick={start} loading={starting}>
            {room.members.length > 1 ? `Почати сеанс · ${room.members.length} глядачів` : 'Почати сеанс самому'}
          </TicketButton>
        ) : (
          <div className="waiting-host">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            Обирай настрій — ведучий скоро почне
          </div>
        )}
      </div>
      <AnimatePresence>
        {starting && (
          <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Countdown label="Проєктор розігрівається — шукаємо фільми під настрій кожного…" />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
