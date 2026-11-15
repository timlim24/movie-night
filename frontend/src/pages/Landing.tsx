import { motion } from 'framer-motion'
import { useState } from 'react'
import { Mascot, type Mood } from '../components/Mascot'
import { Marquee, TicketButton } from '../components/Ui'
import type { MascotId } from '../lib/api'
import { startLogin } from '../lib/auth'
import { getConfig } from '../lib/config'

const PARADE: MascotId[] = ['ticket', 'popcorn', 'clapper', 'reel', 'soda', 'star']

const STEPS = [
  { n: '01', title: 'Збери компанію', text: 'Створи кімнату — друзі заходять за кодом або QR. Без встановлення, просто з телефона.', mascot: 'ticket' as MascotId },
  { n: '02', title: 'Свайпайте', text: 'Кожен гортає підбірку під смаки всієї компанії: вправо — «так», вліво — «ні». Переглянуте не повторюється.', mascot: 'clapper' as MascotId },
  { n: '03', title: 'Збіг!', text: 'Щойно фільм сподобався всім — конфеті, фанфари, сеанс. Немає збігу — покажемо, що сподобалось більшості.', mascot: 'star' as MascotId },
]

export default function Landing({ returnTo }: { returnTo?: string }) {
  const { googleEnabled } = getConfig()
  const [hovered, setHovered] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const invite = returnTo?.startsWith('/r/') ? returnTo.slice(3) : null

  const login = (opts: Parameters<typeof startLogin>[0]) => {
    setBusy(true)
    startLogin({ ...opts, returnTo }).catch(() => setBusy(false))
  }

  return (
    <div className="landing">
      <section className="hero">
        {invite && (
          <motion.div className="invite-banner" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.2 }}>
            🎟 Тебе запросили в зал <b>{invite}</b> — увійди, щоб приєднатись
          </motion.div>
        )}
        <Marquee text="MOVIE NIGHT" />
        <motion.p className="hero-tagline" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }}>
          Обрати фільм на компанію — за три хвилини. <span className="hl">Без суперечок.</span>
        </motion.p>

        <div className="parade">
          {PARADE.map((m, i) => {
            const mood: Mood = hovered === i ? 'excited' : hovered !== null ? 'happy' : 'idle'
            return (
              <motion.div
                key={m}
                className="parade-item"
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 1.5 + i * 0.09, type: 'spring', stiffness: 200, damping: 14 }}
                onPointerEnter={() => setHovered(i)}
                onPointerLeave={() => setHovered(null)}
              >
                <Mascot kind={m} mood={mood} size={i === 2 || i === 3 ? 92 : 76} />
              </motion.div>
            )
          })}
        </div>

        <motion.div className="hero-cta" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 }}>
          {googleEnabled && (
            <TicketButton big onClick={() => login({ provider: 'Google' })} loading={busy}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
              </svg>
              Увійти через Google
            </TicketButton>
          )}
          <TicketButton big={!googleEnabled} variant={googleEnabled ? 'ghost' : 'primary'} onClick={() => login({})} loading={busy && !googleEnabled}>
            Увійти поштою
          </TicketButton>
          <button type="button" className="link-btn" onClick={() => login({ signup: true })}>
            Ще немає акаунта? Зареєструватись
          </button>
        </motion.div>
        <motion.div className="scroll-cue" animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}>
          як це працює ↓
        </motion.div>
      </section>

      <section className="steps">
        {STEPS.map((s, i) => (
          <motion.article
            key={s.n}
            className="step"
            initial={{ opacity: 0, y: 60, rotate: i % 2 ? 3 : -3 }}
            whileInView={{ opacity: 1, y: 0, rotate: i % 2 ? 1 : -1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ type: 'spring', stiffness: 120, damping: 16 }}
          >
            <span className="step-n">{s.n}</span>
            <div className="step-body">
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
            <Mascot kind={s.mascot} size={84} mood={i === 2 ? 'love' : 'happy'} />
          </motion.article>
        ))}
      </section>

      <footer className="footer">
        <p>
          Дані про фільми — <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>. Цей продукт використовує TMDB API, але не
          схвалений і не сертифікований TMDB. Імпорт переглядів — з публічного RSS та експорту{' '}
          <a href="https://letterboxd.com" target="_blank" rel="noreferrer">Letterboxd</a>.
        </p>
        <p className="muted">Movie Night · навчальний проєкт УКУ, 2026</p>
      </footer>
    </div>
  )
}
