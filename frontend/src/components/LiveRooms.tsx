// "Anna is calling you" tickets and "your friends are in a room right now" cards.
import { AnimatePresence, motion } from 'framer-motion'
import type { FriendRoom, Invite } from '../lib/api'
import { useHopIn } from '../lib/useLive'
import { Mascot } from './Mascot'

const STATUS: Record<string, string> = { lobby: 'збираються в лобі', swiping: 'вже свайпають', done: 'обрали фільм' }
const first = (n: string) => n.split(' ')[0]

export function Invites({ invites, onDismiss }: { invites: Invite[]; onDismiss: (code: string) => void }) {
  const { hop, busy } = useHopIn()
  return (
    <AnimatePresence initial={false}>
      {invites.map((inv, i) => (
        <motion.div
          key={inv.code}
          className="invite-ticket"
          layout
          initial={{ opacity: 0, y: -30, rotate: -3, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, rotate: i % 2 ? 0.8 : -0.8, scale: 1 }}
          exit={{ opacity: 0, x: 120, rotate: 8 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          <div className="invite-ticket-main">
            <Mascot kind={inv.from.mascot} size={58} mood="excited" />
            <div>
              <span className="invite-kicker">запрошення · зал {inv.code}</span>
              <b>{first(inv.from.name)} кличе тебе на кіно</b>
              <small>{STATUS[inv.status]}</small>
            </div>
          </div>
          <div className="invite-ticket-stub">
            <button type="button" className="stub-go" disabled={busy === inv.code} onClick={() => hop(inv.code)}>
              {busy === inv.code ? <span className="spinner small" /> : 'Зайти'}
            </button>
            <button type="button" className="stub-no" onClick={() => onDismiss(inv.code)} aria-label="Відхилити запрошення">
              не зараз
            </button>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  )
}

/** Rooms my friends are in. Rooms I already have an invite to are skipped — the invite ticket covers them. */
export function FriendRooms({ rooms: all, invites = [] }: { rooms: FriendRoom[]; invites?: Invite[] }) {
  const { hop, busy } = useHopIn()
  const invited = new Set(invites.map((i) => i.code))
  const rooms = all.filter((r) => !invited.has(r.code))
  if (!rooms.length) return null
  return (
    <section className="friend-rooms">
      <h3 className="section-title">
        <span className="live-dot" /> Друзі зараз у залі
      </h3>
      <div className="friend-rooms-list">
        {rooms.map((r, i) => (
          <motion.button
            key={r.code}
            type="button"
            className={`friend-room ${r.joined ? 'joined' : ''}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.97 }}
            disabled={busy === r.code}
            onClick={() => hop(r.code)}
          >
            <span className="friend-room-mascots">
              {r.friends.slice(0, 4).map((f) => (
                <Mascot key={f.id} kind={f.mascot} size={40} mood="happy" />
              ))}
            </span>
            <span className="friend-room-text">
              <b>{r.friends.map((f) => first(f.name)).join(', ')}</b>
              <small>
                зал {r.code} · {STATUS[r.status]}
              </small>
            </span>
            <span className="friend-room-go">{busy === r.code ? <span className="spinner small" /> : r.joined ? 'Повернутись' : 'Приєднатись →'}</span>
          </motion.button>
        ))}
      </div>
    </section>
  )
}
