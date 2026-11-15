import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProfile } from '../App'
import { Mascot } from '../components/Mascot'
import { CodeInput } from '../components/Room'
import { TicketButton } from '../components/Ui'
import { api, ApiError, type Friend } from '../lib/api'
import { getConfig } from '../lib/config'
import { plural } from '../lib/plural'
import { useToast } from '../lib/toast'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 5) return 'Нічний сеанс'
  if (h < 12) return 'Доброго ранку'
  if (h < 18) return 'Добрий день'
  return 'Добрий вечір'
}

export default function Home() {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [libCount, setLibCount] = useState<number | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const { donateUrl } = getConfig()

  useEffect(() => {
    api.library().then((l) => setLibCount(l.length)).catch(() => {})
    api.friends().then(setFriends).catch(() => {})
  }, [])

  const create = async () => {
    setCreating(true)
    try {
      const room = await api.createRoom({})
      navigate(`/r/${room.code}`)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вдалося створити кімнату', 'error')
      setCreating(false)
    }
  }

  return (
    <div className="home">
      <header className="home-hero">
        {profile && <Mascot kind={profile.mascot} mood="happy" size={110} />}
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1 className="display">{profile ? profile.name.split(' ')[0] : '…'}</h1>
          <p className="muted">Що дивимось сьогодні?</p>
        </div>
      </header>

      <motion.section
        className="home-actions"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 0.5 } } }}
      >
        <motion.div className="action-card create" variants={{ hidden: { opacity: 0, y: 40, rotate: -4 }, show: { opacity: 1, y: 0, rotate: -1.5 } }}>
          <span className="action-kicker">новий сеанс</span>
          <h2>Створити кімнату</h2>
          <p>Отримаєш код і QR — кидай друзям у чат.</p>
          <TicketButton big onClick={create} loading={creating}>
            Відкрити зал 🎬
          </TicketButton>
        </motion.div>

        <motion.div className="action-card join" variants={{ hidden: { opacity: 0, y: 40, rotate: 4 }, show: { opacity: 1, y: 0, rotate: 1.5 } }}>
          <span className="action-kicker">є код?</span>
          <h2>Приєднатись</h2>
          <CodeInput onSubmit={(c) => navigate(`/r/${c}`)} />
        </motion.div>
      </motion.section>

      <motion.section className="home-tiles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
        <Link to="/library" className="tile">
          <span className="tile-num">{libCount ?? '–'}</span>
          <span className="tile-label">{plural(libCount ?? 0, ['фільм', 'фільми', 'фільмів'])} у фільмотеці</span>
          {libCount === 0 && <span className="tile-cta">Додай переглянуте або підключи Letterboxd →</span>}
        </Link>
        <Link to="/friends" className="tile">
          <div className="tile-mascots">
            {friends.slice(0, 4).map((f) => (
              <Mascot key={f.id} kind={f.mascot} size={38} />
            ))}
            {friends.length === 0 && <span className="tile-num">0</span>}
          </div>
          <span className="tile-label">{friends.length ? `${friends.length} ${plural(friends.length, ['друг', 'друзі', 'друзів'])} у кіно` : 'друзів поки немає'}</span>
        </Link>
      </motion.section>

      {donateUrl && (
        <a className="donate" href={donateUrl} target="_blank" rel="noreferrer">
          <span>💛💙</span>
          <div>
            <b>Квиток на добру справу</b>
            <p>Сподобався сервіс? Задонать на ЗСУ — це наша «ціна квитка».</p>
          </div>
          <span className="donate-arrow">→</span>
        </a>
      )}
    </div>
  )
}
