// The lobby: everyone sets their own mood (up to 3 genres, runtime, era), sees what the room adds up to,
// and can call friends in. The host only decides when the show starts.
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mascot, type Mood } from '../../components/Mascot'
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

const ERAS: { label: string; short: string; value: Era | null }[] = [
  { label: 'Будь-які', short: 'будь-які', value: null },
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

const prefsOf = (m?: RoomMember): Prefs => ({ ...EMPTY_PREFS, ...(m?.prefs ?? {}) })
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

function MoodPanel({ room, meId, prefs, onChange }: { room: RoomState; meId?: string; prefs: Prefs; onChange: (p: Prefs) => void }) {
  const genres = useGenres()
  const [full, setFull] = useState(false)
  const shake = useAnimationControls()
  const others = room.members.filter((m) => m.userId !== meId)
  const pickedBy = (id: number) => others.filter((m) => prefsOf(m).genres.includes(id))

  const toggleGenre = (id: number) => {
    const on = prefs.genres.includes(id)
    if (!on && prefs.genres.length >= MAX_GENRES) {
      setFull(true)
      shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.4 } })
      window.setTimeout(() => setFull(false), 1800)
      return
    }
    onChange({ ...prefs, genres: on ? prefs.genres.filter((g) => g !== id) : [...prefs.genres, id] })
  }

  return (
    <section className="panel mood">
      <div className="mood-head">
        <div>
          <p className="eyebrow">твій настрій</p>
          <h3>Що хочеш сьогодні?</h3>
        </div>
        <motion.div className={`mood-counter ${full ? 'full' : ''}`} animate={shake}>
          {Array.from({ length: MAX_GENRES }, (_, i) => (
            <motion.i key={i} className={i < prefs.genres.length ? 'on' : ''} animate={i < prefs.genres.length ? { scale: [1.5, 1] } : { scale: 1 }} />
          ))}
          <span>{full ? 'максимум 3' : `${prefs.genres.length}/${MAX_GENRES} жанри`}</span>
        </motion.div>
      </div>
      <div className="chips">
        {genres.map((g) => {
          const on = prefs.genres.includes(g.id)
          const fans = pickedBy(g.id)
          return (
            <motion.button
              key={g.id}
              type="button"
              className={`chip ${on ? 'on' : ''} ${fans.length ? 'shared' : ''} ${on && fans.length ? 'together' : ''}`}
              whileTap={{ scale: 0.88 }}
              animate={on ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              onClick={() => toggleGenre(g.id)}
              aria-pressed={on}
            >
              <span>{g.name}</span>
              {fans.length > 0 && (
                <span className="chip-fans" title={fans.map((f) => f.name).join(', ')}>
                  {fans.slice(0, 3).map((f) => (
                    <Mascot key={f.userId} kind={f.mascot} size={18} />
                  ))}
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
        <span className="label">Епоха</span>
        <div className="segmented">
          {ERAS.map((e) => (
            <button key={e.label} type="button" className={prefs.era === e.value ? 'on' : ''} onClick={() => onChange({ ...prefs, era: e.value })}>
              {prefs.era === e.value && <motion.span layoutId="seg-era" className="seg-pill" />}
              <span>{e.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function Together({ room, meId, myPrefs, onRewatch }: { room: RoomState; meId?: string; myPrefs: Prefs; onRewatch: (v: boolean) => void }) {
  const genres = useGenres()
  const name = (id: number) => genres.find((g) => g.id === id)?.name ?? '…'
  // My own picks are shown from local state, so the summary reacts instantly.
  const members = room.members.map((m) => ({ ...m, p: m.userId === meId ? myPrefs : prefsOf(m) }))
  const pickers = members.filter((m) => m.p.genres.length)
  const cover = coverSet(pickers.map((m) => m.p.genres))
  const runtimes = members.filter((m) => m.p.maxRuntime)
  const strictest = runtimes.sort((a, b) => a.p.maxRuntime! - b.p.maxRuntime!)[0]
  const eras = [...new Set(members.map((m) => m.p.era).filter(Boolean))] as Era[]

  return (
    <section className="panel together">
      <p className="eyebrow">разом виходить</p>
      <ul className="together-people">
        {members.map((m) => (
          <motion.li key={m.userId} layout className={m.userId === meId ? 'me' : ''}>
            <Mascot kind={m.mascot} size={34} mood={m.p.genres.length ? 'happy' : 'idle'} />
            <b>{m.userId === meId ? 'Ти' : firstName(m.name)}</b>
            <span className="together-picks">
              <AnimatePresence initial={false}>
                {m.p.genres.length ? (
                  m.p.genres.map((g) => (
                    <motion.em key={g} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className={cover.includes(g) ? 'key' : ''}>
                      {name(g)}
                    </motion.em>
                  ))
                ) : (
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
        <div>
          <span className="label">Шукаємо</span>
          <b>
            {pickers.length > 1 && cover.length > 1
              ? `${cover.map(name).join(' + ')} — щоб пасувало всім`
              : cover.length
                ? cover.map(name).join(', ')
                : 'Під ваші смаки з фільмотек'}
          </b>
        </div>
        <div>
          <span className="label">Тривалість</span>
          <b>{strictest ? `${RUNTIMES.find((r) => r.value === strictest.p.maxRuntime)?.label} · ${strictest.userId === meId ? 'твоє' : `так хоче ${firstName(strictest.name)}`}` : 'будь-яка'}</b>
        </div>
        <div>
          <span className="label">Епоха</span>
          <b>{eras.length ? eras.map((e) => ERAS.find((x) => x.value === e)?.short).join(' або ') : 'будь-яка'}</b>
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

  const ready = room.members.filter((m) => (m.userId === meId ? prefs : prefsOf(m)).genres.length > 0).length
  const moods: Record<string, Mood> = Object.fromEntries(
    room.members.map((m) => [m.userId, (m.userId === meId ? prefs : prefsOf(m)).genres.length ? 'excited' : m.isHost ? 'happy' : 'idle']),
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
