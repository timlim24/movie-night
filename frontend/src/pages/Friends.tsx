import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { TicketButton } from '../components/Ui'
import { api, type Friend } from '../lib/api'
import { plural } from '../lib/plural'


export default function Friends() {
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const navigate = useNavigate()
  useEffect(() => {
    api.friends().then(setFriends).catch(() => setFriends([]))
  }, [])

  return (
    <div className="friends">
      <header className="page-head">
        <p className="eyebrow">друзі</p>
        <h1 className="display">Твоя компанія</h1>
        <p className="muted">Друзі з'являються самі — щойно ви разом зайдете в кімнату.</p>
      </header>
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
          {friends.map((f, i) => (
            <motion.li
              key={f.id}
              className="friend"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 220, damping: 20 }}
              whileHover={{ x: 6 }}
            >
              <Mascot kind={f.mascot} size={62} mood={i % 3 === 0 ? 'happy' : 'idle'} />
              <div>
                <b>{f.name}</b>
                <small>
                  разом у {f.roomsTogether} {plural(f.roomsTogether, ['кімнаті', 'кімнатах', 'кімнатах'])}
                </small>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
