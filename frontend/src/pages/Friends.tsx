import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FriendRooms, Invites } from '../components/LiveRooms'
import { Mascot } from '../components/Mascot'
import { TicketButton } from '../components/Ui'
import { api, type Friend } from '../lib/api'
import { plural } from '../lib/plural'
import { useHopIn, useLive } from '../lib/useLive'


export default function Friends() {
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const navigate = useNavigate()
  const { live, dismiss } = useLive()
  const { hop, busy } = useHopIn()
  const roomOf = (id: string) => live?.friendRooms.find((r) => r.friends.some((f) => f.id === id))
  useEffect(() => {
    api.friends().then(setFriends).catch(() => setFriends([]))
  }, [])

  return (
    <div className="friends">
      <header className="page-head">
        <p className="eyebrow">друзі</p>
        <h1 className="display">Твоя компанія</h1>
        <p className="muted">Друзі з'являються самі — щойно ви разом зайдете в кімнату. Потім їх можна кликати в зал або заходити до них.</p>
      </header>
      {live && live.invites.length > 0 && (
        <section className="invites">
          <Invites invites={live.invites} onDismiss={dismiss} />
        </section>
      )}
      {live && <FriendRooms rooms={live.friendRooms} invites={live.invites} />}
      {friends === null ? (
        <div className="spinner" />
      ) : friends.length === 0 ? (
        <div className="empty">
          <div className="empty-row">
            <Mascot kind="reel" mood="sad" size={90} />
            <Mascot kind="soda" mood="sleepy" size={80} />
          </div>
          <p>Тут поки тихо. Створи кімнату й поклич когось — і вони опиняться тут.</p>
          <TicketButton onClick={() => navigate('/')}>До залу</TicketButton>
        </div>
      ) : (
        <ul className="friend-list">
          {friends.map((f, i) => {
            const room = roomOf(f.id)
            return (
            <motion.li
              key={f.id}
              className="friend"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 220, damping: 20 }}
              whileHover={{ x: 6 }}
            >
              <Mascot kind={f.mascot} size={62} mood={room ? 'excited' : i % 3 === 0 ? 'happy' : 'idle'} />
              <div className="friend-text">
                <b>{f.name}</b>
                <small>
                  {room ? (
                    <span className="friend-live">
                      <span className="live-dot" /> зараз у залі {room.code}
                    </span>
                  ) : (
                    <>
                      разом у {f.roomsTogether} {plural(f.roomsTogether, ['кімнаті', 'кімнатах', 'кімнатах'])}
                    </>
                  )}
                </small>
              </div>
              {room && !room.joined && (
                <button type="button" className="call-btn" disabled={busy === room.code} onClick={() => hop(room.code)}>
                  {busy === room.code ? <span className="spinner small" /> : 'До них →'}
                </button>
              )}
            </motion.li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
