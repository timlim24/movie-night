import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { MovieCard } from '../lib/api'

export type DeckHandle = { swipe: (like: boolean) => void; flip: () => void }

const fmtRuntime = (m: number | null) => (m ? `${Math.floor(m / 60)} год ${m % 60 ? `${m % 60} хв` : ''}`.trim() : null)

function CardFace({ card, flipped }: { card: MovieCard; flipped: boolean }) {
  return (
    <motion.div className="card-inner" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
      <div className="card-front">
        {card.poster ? <img src={card.poster} alt="" draggable={false} /> : <div className="card-noposter">{card.title}</div>}
        <div className="card-chip rating">★ {card.rating.toFixed(1)}</div>
        {card.runtime && <div className="card-chip runtime">{fmtRuntime(card.runtime)}</div>}
        <div className="card-shade">
          {card.rewatchBy && card.rewatchBy.length > 0 && <div className="card-rewatch">↻ {card.rewatchBy.join(', ')} — передивляться</div>}
          <h2 className="card-title">{card.title}</h2>
          <p className="card-meta">
            {[card.year, card.genres.slice(0, 3).join(' · ')].filter(Boolean).join(' — ')}
          </p>
          {card.proposedBy?.length ? (
            <p className="card-proposed">💡 Пропонує {card.proposedBy.join(', ')}</p>
          ) : (
            card.reasons && card.reasons[0] && <p className="card-reason">✦ {card.reasons[0]}</p>
          )}
        </div>
      </div>
      <div className="card-back">
        {card.backdrop && <img className="card-back-bg" src={card.backdrop} alt="" draggable={false} />}
        <div className="card-back-content">
          <h2 className="card-title small">{card.title}</h2>
          {card.originalTitle && card.originalTitle !== card.title && <p className="muted">{card.originalTitle}</p>}
          {card.tagline && <p className="card-tagline">«{card.tagline}»</p>}
          <div className="card-facts">
            <span>★ {card.rating.toFixed(1)} TMDB</span>
            {card.year && <span>{card.year}</span>}
            {card.runtime && <span>{fmtRuntime(card.runtime)}</span>}
          </div>
          <p className="card-genres">{card.genres.join(' · ')}</p>
          <p className="card-overview">{card.overview || 'Опису поки немає.'}</p>
          {card.director && (
            <p className="card-crew">
              <b>Режисер:</b> {card.director}
            </p>
          )}
          {card.cast.length > 0 && (
            <p className="card-crew">
              <b>У ролях:</b> {card.cast.join(', ')}
            </p>
          )}
          {card.reasons && card.reasons.length > 0 && (
            <ul className="card-reasons">
              {card.reasons.map((r) => (
                <li key={r}>✦ {r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </motion.div>
  )
}

type TopProps = { card: MovieCard; x: MotionValue<number>; onDecide: (like: boolean) => void; flipped: boolean; onFlip: () => void }

const TopCard = forwardRef<DeckHandle, TopProps>(function TopCard({ card, x, onDecide, flipped, onFlip }, ref) {
  const controls = useAnimationControls()
  const rotate = useTransform(x, [-320, 320], [-24, 24])
  const yes = useTransform(x, [25, 130], [0, 1])
  const no = useTransform(x, [-130, -25], [1, 0])
  const busy = useRef(false)
  const dragging = useRef(false)

  const fly = async (like: boolean) => {
    if (busy.current) return
    busy.current = true
    const w = Math.max(window.innerWidth, 600)
    await controls.start({ x: like ? w : -w, y: 60, rotate: like ? 34 : -34, opacity: 0, transition: { duration: 0.38, ease: [0.4, 0, 1, 1] } })
    onDecide(like)
  }

  useImperativeHandle(ref, () => ({ swipe: fly, flip: onFlip }))

  useEffect(() => {
    controls.start({ scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } })
  }, [controls])

  return (
    <motion.div
      className="swipe-card top"
      style={{ x, rotate }}
      drag="x"
      dragElastic={0.9}
      dragConstraints={{ left: 0, right: 0 }}
      animate={controls}
      initial={{ scale: 0.95, y: 16 }}
      whileTap={{ cursor: 'grabbing' }}
      onTap={() => {
        if (!dragging.current) onFlip()
      }}
      onDragStart={() => {
        dragging.current = true
      }}
      onDragEnd={(_, info) => {
        window.setTimeout(() => (dragging.current = false), 80)
        if (info.offset.x > 110 || info.velocity.x > 650) fly(true)
        else if (info.offset.x < -110 || info.velocity.x < -650) fly(false)
        else controls.start({ x: 0, transition: { type: 'spring', stiffness: 500, damping: 30 } })
      }}
    >
      <CardFace card={card} flipped={flipped} />
      <motion.div className="stamp yes" style={{ opacity: yes }}>
        ТАК!
      </motion.div>
      <motion.div className="stamp no" style={{ opacity: no }}>
        НІ
      </motion.div>
    </motion.div>
  )
})

type DeckProps = {
  cards: MovieCard[]
  onVote: (card: MovieCard, like: boolean) => void
  x: MotionValue<number>
}

export const SwipeDeck = forwardRef<DeckHandle, DeckProps>(function SwipeDeck({ cards, onVote, x }, ref) {
  const [flipped, setFlipped] = useState(false)
  const [hinted, setHinted] = useState(() => {
    try {
      return localStorage.getItem('mn.swipeHint') === '1'
    } catch {
      return false
    }
  })
  const top = cards[0]
  const inner = useRef<DeckHandle>(null)

  useEffect(() => {
    setFlipped(false)
    x.set(0)
  }, [top?.id, x])

  useImperativeHandle(ref, () => ({
    swipe: (like) => inner.current?.swipe(like),
    flip: () => setFlipped((f) => !f),
  }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') inner.current?.swipe(true)
      else if (e.key === 'ArrowLeft') inner.current?.swipe(false)
      else if (e.key === 'ArrowUp' || e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const decide = (like: boolean) => {
    if (!hinted) {
      setHinted(true)
      try {
        localStorage.setItem('mn.swipeHint', '1')
      } catch {
        /* ignore */
      }
    }
    onVote(top, like)
  }

  return (
    <div className="deck">
      <AnimatePresence initial={false}>
        {cards
          .slice(1, 3)
          .reverse()
          .map((c) => {
            const depth = cards.indexOf(c)
            return (
              <motion.div
                key={c.id}
                className="swipe-card under"
                initial={{ scale: 0.8, y: 60, opacity: 0 }}
                animate={{ scale: 1 - depth * 0.05, y: depth * 16, opacity: 1 - depth * 0.25 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              >
                <CardFace card={c} flipped={false} />
              </motion.div>
            )
          })}
      </AnimatePresence>
      {top && <TopCard key={top.id} ref={inner} card={top} x={x} onDecide={decide} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />}
      {top && !hinted && (
        <motion.div className="swipe-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
          <motion.span animate={{ x: [-40, 40, -40] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}>
            👆
          </motion.span>
          <small>свайп вправо — так, вліво — ні, тап — деталі</small>
        </motion.div>
      )}
    </div>
  )
})
