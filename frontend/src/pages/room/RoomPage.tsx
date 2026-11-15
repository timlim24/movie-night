import confetti from 'canvas-confetti'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProfile } from '../../App'
import { Curtain } from '../../components/Atmosphere'
import { Mascot, type Mood } from '../../components/Mascot'
import { Audience, useReactions } from '../../components/Room'
import { SwipeDeck, type DeckHandle } from '../../components/SwipeDeck'
import { Countdown, TicketButton } from '../../components/Ui'
import { api, ApiError, type MovieCard, type RoomState } from '../../lib/api'
import { prefersReducedMotion } from '../../lib/pointer'
import { useRoom } from '../../lib/useRoom'
import { useToast } from '../../lib/toast'
import { Lobby } from './Lobby'

const CONFETTI_COLORS = ['#ffb547', '#ff3d57', '#3ddc97', '#8b5cf6', '#ff5fa2', '#fff4dc']

function celebrate() {
  if (prefersReducedMotion()) return
  const fire = (x: number, angle: number) =>
    confetti({ particleCount: 90, spread: 70, startVelocity: 55, angle, origin: { x, y: 0.75 }, colors: CONFETTI_COLORS, zIndex: 999 })
  fire(0.1, 60)
  fire(0.9, 120)
  window.setTimeout(() => confetti({ particleCount: 140, spread: 120, origin: { y: 0.35 }, colors: CONFETTI_COLORS, zIndex: 999 }), 250)
}

function RoomBar({ room, label }: { room: RoomState; label: string }) {
  return (
    <header className="room-bar">
      <Link to="/" className="room-back" aria-label="На головну">
        ←
      </Link>
      <div className="room-bar-mid">
        <span className="room-code-chip">{room.code}</span>
        <span className="room-status">{label}</span>
      </div>
      <span className="room-count" title="учасників">
        {room.members.length} 👥
      </span>
    </header>
  )
}

function JoinGate({ room, onJoin }: { room: RoomState; onJoin: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const host = room.members.find((m) => m.isHost)
  return (
    <section className="join-gate">
      <motion.div className="panel center" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <p className="eyebrow">запрошення в зал {room.code}</p>
        <h1 className="display">{host ? `${host.name.split(' ')[0]} кличе на кіно` : 'Тебе кличуть на кіно'}</h1>
        <Audience members={room.members} size={64} />
        {room.status === 'done' ? (
          <p className="muted">Ця компанія вже обрала фільм. Створи свою кімнату!</p>
        ) : (
          <TicketButton
            big
            loading={busy}
            onClick={async () => {
              setBusy(true)
              await onJoin()
              setBusy(false)
            }}
          >
            Зайти в зал 🎟
          </TicketButton>
        )}
      </motion.div>
    </section>
  )
}

function MatchModal({ card, isHost, onChoose, onClose, members }: { card: MovieCard; isHost: boolean; onChoose: () => void; onClose: () => void; members: RoomState['members'] }) {
  useEffect(() => {
    celebrate()
  }, [])
  return (
    <motion.div className="overlay match" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.h2 className="match-title" initial={{ scale: 3, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}>
        ЗБІГ!
      </motion.h2>
      <motion.div
        className="match-poster"
        initial={{ rotateY: 180, scale: 0.5 }}
        animate={{ rotateY: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        {card.poster && <img src={card.poster} alt={card.title} />}
      </motion.div>
      <p className="match-sub">
        «{card.title}» сподобався <b>всім</b>
      </p>
      <div className="match-mascots">
        {members.map((m) => (
          <Mascot key={m.userId} kind={m.mascot} mood="love" size={56} />
        ))}
      </div>
      <div className="match-actions" onClick={(e) => e.stopPropagation()}>
        {isHost && (
          <TicketButton big onClick={onChoose}>
            Дивимось це! 🍿
          </TicketButton>
        )}
        <TicketButton variant="ghost" onClick={onClose}>
          Свайпати далі
        </TicketButton>
      </div>
    </motion.div>
  )
}

function Swipe({ room, cards, onVote, meId, reactions }: { room: RoomState; cards: MovieCard[]; onVote: (c: MovieCard, like: boolean) => void; meId?: string; reactions: ReturnType<typeof useReactions>['reactions'] }) {
  const deckRef = useRef<DeckHandle>(null)
  const x = useMotionValue(0)
  const likeScale = useTransform(x, [0, 150], [1, 1.25])
  const nopeScale = useTransform(x, [-150, 0], [1.25, 1])
  const glow = useTransform(x, [-200, 0, 200], ['rgba(255,61,87,.28)', 'rgba(0,0,0,0)', 'rgba(61,220,151,.28)'])
  const done = room.deckSize - cards.length
  const moods: Record<string, Mood> = {}
  for (const m of room.members) {
    const r = reactions[m.userId]
    moods[m.userId] = r ? (r.like ? 'happy' : 'sad') : m.progress >= room.deckSize ? 'sleepy' : 'idle'
  }
  return (
    <section className="swipe">
      <motion.div className="swipe-glow" style={{ background: useTransform(glow, (g) => `radial-gradient(60% 50% at 50% 45%, ${g}, transparent)`) }} />
      <div className="swipe-progress" aria-label={`${done} з ${room.deckSize}`}>
        {Array.from({ length: room.deckSize }, (_, i) => (
          <span key={i} className={i < done ? 'filled' : i === done ? 'current' : ''} />
        ))}
      </div>
      <SwipeDeck ref={deckRef} cards={cards} onVote={onVote} x={x} />
      <div className="swipe-buttons">
        <motion.button type="button" className="round-btn nope" style={{ scale: nopeScale }} whileTap={{ scale: 0.8 }} onClick={() => deckRef.current?.swipe(false)} aria-label="Ні">
          ✕
        </motion.button>
        <motion.button type="button" className="round-btn info" whileTap={{ scale: 0.8 }} onClick={() => deckRef.current?.flip()} aria-label="Деталі">
          i
        </motion.button>
        <motion.button type="button" className="round-btn like" style={{ scale: likeScale }} whileTap={{ scale: 0.8 }} onClick={() => deckRef.current?.swipe(true)} aria-label="Так">
          ♥
        </motion.button>
      </div>
      <Audience members={room.members} meId={meId} moods={moods} reactions={reactions} size={54} />
    </section>
  )
}

function Waiting({ room, onShowResults, meId }: { room: RoomState; onShowResults: () => void; meId?: string }) {
  const me = room.members.find((m) => m.userId === meId)
  return (
    <section className="waiting">
      <Mascot kind={me?.mascot ?? 'popcorn'} mood="sleepy" size={120} />
      <h2 className="display small">Ти все! Чекаємо на інших</h2>
      <ul className="progress-list">
        {room.members.map((m) => (
          <li key={m.userId}>
            <Mascot kind={m.mascot} size={40} mood={m.progress >= room.deckSize ? 'happy' : 'idle'} />
            <span className="pl-name">{m.userId === meId ? 'Ти' : m.name}</span>
            <div className="progress">
              <motion.div className="progress-bar" animate={{ width: `${(m.progress / Math.max(1, room.deckSize)) * 100}%` }} />
            </div>
            <span className="pl-num">
              {m.progress}/{room.deckSize}
            </span>
          </li>
        ))}
      </ul>
      {(room.matches?.length ?? 0) > 0 && <p className="hl">Вже є збігів: {room.matches!.length} ✨</p>}
      {room.isHost && (
        <TicketButton variant="ghost" onClick={onShowResults}>
          Підбити підсумки зараз
        </TicketButton>
      )}
    </section>
  )
}

function Results({ room, onRoom }: { room: RoomState; onRoom: (r: RoomState) => void }) {
  const toast = useToast()
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const byId = useMemo(() => Object.fromEntries((room.deck ?? []).map((c) => [c.id, c])), [room.deck])
  const membersById = useMemo(() => Object.fromEntries(room.members.map((m) => [m.userId, m])), [room.members])
  const rows = room.results ?? []
  const matches = new Set(room.matches ?? [])

  const choose = async (id: number) => {
    setBusy('choose')
    try {
      onRoom(await api.choose(room.code, id))
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вийшло', 'error')
      setBusy(null)
    }
  }

  const again = async () => {
    setBusy('again')
    try {
      onRoom(await api.nextRound(room.code))
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вийшло', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="results">
      <header className="center">
        <p className="eyebrow">раунд {room.round}</p>
        <h1 className="display">Афіша вечора</h1>
        <p className="muted">
          {matches.size > 0
            ? `Всім сподобалось: ${matches.size}. ${room.isHost ? 'Обери фінальний фільм.' : 'Ведучий обирає фінальний.'}`
            : rows.length > 0
              ? `Ідеального збігу немає — ось що сподобалось хоча б комусь. ${room.isHost ? 'Обери фінальний.' : ''}`
              : 'Нікому нічого не сподобалось 🙈'}
        </p>
      </header>
      <ol className="result-list">
        {rows.map((r, i) => {
          const c = byId[r.movieId]
          if (!c) return null
          const isSel = selected === r.movieId
          return (
            <motion.li
              key={r.movieId}
              className={`result ${matches.has(r.movieId) ? 'match' : ''} ${isSel ? 'selected' : ''}`}
              initial={{ opacity: 0, y: 30, rotateX: -40 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: i * 0.07, type: 'spring', stiffness: 200, damping: 20 }}
              onClick={() => room.isHost && setSelected(isSel ? null : r.movieId)}
            >
              <span className="result-rank">{i + 1}</span>
              {c.poster ? <img src={c.poster.replace('/w500/', '/w154/')} alt="" /> : <span className="thumb-empty" />}
              <div className="result-body">
                <b>{c.title}</b>
                <small>
                  {[c.year, c.runtime ? `${c.runtime} хв` : null, c.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
                </small>
                <div className="result-likers">
                  {r.likes.map((uid) => membersById[uid] && <Mascot key={uid} kind={membersById[uid].mascot} size={26} mood="happy" />)}
                  <span className="result-count">
                    ♥ {r.likes.length}
                    {r.dislikes.length > 0 && <em> · ✕ {r.dislikes.length}</em>}
                  </span>
                </div>
              </div>
              {matches.has(r.movieId) && <span className="match-badge">ЗБІГ</span>}
              <AnimatePresence>
                {isSel && (
                  <motion.div className="result-choose" initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }}>
                    <TicketButton onClick={() => choose(r.movieId)} loading={busy === 'choose'}>
                      Дивимось!
                    </TicketButton>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          )
        })}
      </ol>
      {room.isHost ? (
        <TicketButton variant="ghost" onClick={again} loading={busy === 'again'}>
          Ще 20 нових фільмів ↻
        </TicketButton>
      ) : (
        <div className="waiting-host">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          Ведучий обирає фільм
        </div>
      )}
    </section>
  )
}

function Tonight({ room }: { room: RoomState }) {
  const card = room.chosen!
  const toast = useToast()
  const navigate = useNavigate()
  const [added, setAdded] = useState(false)
  useEffect(() => {
    celebrate()
  }, [])
  return (
    <section className="tonight">
      <div className="spotlight" aria-hidden="true" />
      <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        сьогодні дивимось
      </motion.p>
      <motion.div className="tonight-poster" initial={{ y: -300, rotate: -12, opacity: 0 }} animate={{ y: 0, rotate: -2, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 11, delay: 0.3 }}>
        {card.poster && <img src={card.poster} alt={card.title} />}
      </motion.div>
      <motion.h1 className="display" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
        {card.title}
      </motion.h1>
      <p className="muted">{[card.year, card.runtime ? `${card.runtime} хв` : null, card.genres.join(', '), card.director].filter(Boolean).join(' · ')}</p>
      <p className="tonight-overview">{card.overview}</p>
      <div className="match-mascots">
        {room.members.map((m) => (
          <Mascot key={m.userId} kind={m.mascot} mood="love" size={58} />
        ))}
      </div>
      <div className="tonight-actions">
        <TicketButton
          disabled={added}
          onClick={async () => {
            try {
              await api.addToLibrary(card.id)
              setAdded(true)
              toast('Додано у твою фільмотеку', 'success')
            } catch {
              toast('Не вдалося додати', 'error')
            }
          }}
        >
          {added ? '✓ У фільмотеці' : 'Позначити переглянутим'}
        </TicketButton>
        <a className="ticket-btn ghost" href={`https://www.themoviedb.org/movie/${card.id}/watch?locale=UA`} target="_blank" rel="noreferrer">
          <span className="ticket-btn-inner">Де подивитись ↗</span>
        </a>
        <button type="button" className="link-btn" onClick={() => navigate('/')}>
          Новий сеанс
        </button>
      </div>
    </section>
  )
}

function ScrollTop({ phase }: { phase: string }) {
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [phase])
  return null
}

export default function RoomPage() {
  const params = useParams()
  const code = (params.code ?? '').toUpperCase()
  const { room, error, merge } = useRoom(code)
  const { profile } = useProfile()
  const toast = useToast()
  const meId = profile?.id
  const [localVotes, setLocalVotes] = useState<{ round: number; votes: Record<string, boolean> }>({ round: 0, votes: {} })
  const [match, setMatch] = useState<MovieCard | null>(null)
  const [showResults, setShowResults] = useState(false)
  const seenMatches = useRef<Set<number> | null>(null)
  const { reactions, poke } = useReactions(room?.members)

  // Celebrate matches that appear while we are in the room (not the ones that existed before we opened it).
  useEffect(() => {
    if (!room || room.status !== 'swiping' || !room.deck) return
    const current = room.matches ?? []
    if (seenMatches.current === null) {
      seenMatches.current = new Set(current)
      return
    }
    const fresh = current.find((id) => !seenMatches.current!.has(id))
    current.forEach((id) => seenMatches.current!.add(id))
    if (fresh) {
      const card = room.deck.find((c) => c.id === fresh)
      if (card) setMatch(card)
    }
  }, [room])

  useEffect(() => {
    if (room && localVotes.round !== room.round) {
      setLocalVotes({ round: room.round, votes: {} })
      setShowResults(false)
      seenMatches.current = null
    }
  }, [room, localVotes.round])

  const vote = useCallback(
    (card: MovieCard, like: boolean) => {
      if (!room) return
      setLocalVotes((v) => ({ round: room.round, votes: { ...v.votes, [String(card.id)]: like } }))
      if (meId) poke(meId, like)
      api
        .vote(room.code, card.id, like)
        .then(merge)
        .catch((e) => toast(e instanceof ApiError ? e.message : 'Голос не зарахувався', 'error'))
    },
    [room, meId, poke, merge, toast],
  )

  if (error?.status === 404)
    return (
      <section className="center-screen">
        <div className="panel center">
          <Mascot kind="reel" mood="sad" size={110} />
          <h2>Зал {code} не знайдено</h2>
          <p className="muted">Перевір код — або кімната вже закрилась (вони живуть 2 дні).</p>
          <Link className="ticket-btn primary" to="/">
            <span className="ticket-btn-inner">На головну</span>
          </Link>
        </div>
      </section>
    )
  if (!room)
    return (
      <section className="center-screen">
        <Countdown label="Шукаємо зал…" />
      </section>
    )

  if (!room.isMember)
    return (
      <JoinGate
        room={room}
        onJoin={async () => {
          try {
            merge(await api.joinRoom(code))
          } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Не вдалося зайти', 'error')
          }
        }}
      />
    )

  const votes = { ...(room.myVotes ?? {}), ...(localVotes.round === room.round ? localVotes.votes : {}) }
  const remaining = (room.deck ?? []).filter((c) => !(String(c.id) in votes))

  let label = 'лобі'
  let body: React.ReactNode
  let phase = 'lobby'
  if (room.status === 'lobby') {
    body = <Lobby room={room} meId={meId} onRoom={merge} />
  } else if (room.status === 'done' && room.chosen) {
    label = 'сеанс обрано'
    phase = 'done'
    body = <Tonight room={room} />
  } else if (!room.deck) {
    body = <Countdown label="Завантажуємо плівку…" />
  } else if (remaining.length > 0 && !showResults) {
    label = 'свайпимо'
    phase = 'swipe'
    body = <Swipe room={room} cards={remaining} onVote={vote} meId={meId} reactions={reactions} />
  } else if (room.everyoneDone || showResults) {
    label = 'підсумки'
    phase = 'results'
    body = <Results room={room} onRoom={merge} />
  } else {
    label = 'чекаємо інших'
    phase = 'waiting'
    body = <Waiting room={room} meId={meId} onShowResults={() => setShowResults(true)} />
  }

  return (
    <div className="room">
      <ScrollTop phase={`${phase}-${room.round}`} />
      <Curtain key={`${room.status}-${room.round}`} />
      <RoomBar room={room} label={label} />
      {body}
      <AnimatePresence>
        {match && room.status === 'swiping' && (
          <MatchModal
            card={match}
            isHost={room.isHost}
            members={room.members}
            onClose={() => setMatch(null)}
            onChoose={async () => {
              try {
                merge(await api.choose(room.code, match.id))
              } catch (e) {
                toast(e instanceof ApiError ? e.message : 'Не вийшло', 'error')
              }
              setMatch(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
