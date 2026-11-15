// Small building blocks: marquee sign, magnetic ticket button, rewatch toggle, film-leader countdown.
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { prefersReducedMotion } from '../lib/pointer'

export function Marquee({ text, small = false }: { text: string; small?: boolean }) {
  const bulbs = small ? 14 : 22
  return (
    <div className={`marquee ${small ? 'marquee-small' : ''}`}>
      <div className="bulbs top">
        {Array.from({ length: bulbs }, (_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 3) * 0.25}s` }} />
        ))}
      </div>
      <h1 className="marquee-text" aria-label={text}>
        {text.split('').map((ch, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 30, rotateX: -90 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: 0.6 + i * 0.05, type: 'spring', stiffness: 300, damping: 18 }}
            className={ch === ' ' ? 'space' : i % 5 === 3 ? 'flicker' : ''}
          >
            {ch === ' ' ? ' ' : ch}
          </motion.span>
        ))}
      </h1>
      <div className="bulbs bottom">
        {Array.from({ length: bulbs }, (_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 3) * 0.25}s` }} />
        ))}
      </div>
    </div>
  )
}

type ButtonProps = {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger' | 'mint'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
  className?: string
  big?: boolean
}

/** Ticket-shaped button that leans toward the pointer and squashes on press. */
export function TicketButton({ children, onClick, variant = 'primary', disabled, loading, type = 'button', className = '', big }: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const mx = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 })
  const my = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 })
  const reduced = prefersReducedMotion()
  return (
    <motion.button
      ref={ref}
      type={type}
      className={`ticket-btn ${variant} ${big ? 'big' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      style={{ x: mx, y: my }}
      onPointerMove={(e) => {
        if (reduced || e.pointerType !== 'mouse' || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        mx.set((e.clientX - r.left - r.width / 2) * 0.18)
        my.set((e.clientY - r.top - r.height / 2) * 0.3)
      }}
      onPointerLeave={() => {
        mx.set(0)
        my.set(0)
      }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.93, rotate: -1 }}
    >
      <span className="ticket-btn-inner">{loading ? <span className="spinner" /> : children}</span>
    </motion.button>
  )
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!on)
      }}
    >
      <motion.span className="toggle-knob" layout transition={{ type: 'spring', stiffness: 700, damping: 30 }}>
        <motion.svg viewBox="0 0 24 24" width="14" height="14" animate={{ rotate: on ? 360 : 0 }} transition={{ duration: 0.5 }}>
          <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M17 2.5v4.2h-4.2M7 21.5v-4.2h4.2" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.span>
    </button>
  )
}

/** Old film leader: 3 · 2 · 1 with a sweeping hand. Used while the deck is being built. */
export function Countdown({ label }: { label: string }) {
  const [n, setN] = useState(5)
  useEffect(() => {
    const t = window.setInterval(() => setN((v) => (v <= 1 ? 5 : v - 1)), 900)
    return () => window.clearInterval(t)
  }, [])
  return (
    <div className="countdown" role="status">
      <div className="countdown-frame">
        <svg viewBox="0 0 200 200" className="countdown-svg">
          <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.5" />
          <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <line x1="100" y1="0" x2="100" y2="200" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <line x1="0" y1="100" x2="200" y2="100" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <motion.path
            key={n}
            d="M100 100 L100 12 A88 88 0 1 1 99.9 12 Z"
            fill="currentColor"
            opacity={0.18}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: 'linear' }}
          />
        </svg>
        <motion.span key={`n${n}`} className="countdown-num" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          {n}
        </motion.span>
      </div>
      <p className="countdown-label">{label}</p>
    </div>
  )
}

export function Stars({ value, onChange, size = 22 }: { value?: number; onChange?: (v: number) => void; size?: number }) {
  const uid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <div className="stars" onPointerLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = shown >= i ? 1 : shown >= i - 0.5 ? 0.5 : 0
        return (
          <motion.button
            key={i}
            type="button"
            className="star-btn"
            whileTap={{ scale: 0.8, rotate: -15 }}
            disabled={!onChange}
            aria-label={`${i} зірок`}
            onPointerMove={(e) => {
              if (!onChange) return
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setHover(e.clientX - r.left < r.width / 2 ? i - 0.5 : i)
            }}
            onClick={(e) => {
              if (!onChange) return
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onChange(e.clientX - r.left < r.width / 2 ? i - 0.5 : i)
            }}
          >
            <svg viewBox="0 0 24 24" width={size} height={size}>
              <defs>
                <linearGradient id={`${uid}h${i}`}>
                  <stop offset={`${fill * 100}%`} stopColor="var(--amber)" />
                  <stop offset={`${fill * 100}%`} stopColor="transparent" />
                </linearGradient>
              </defs>
              <path
                d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"
                fill={`url(#${uid}h${i})`}
                stroke="var(--amber)"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </motion.button>
        )
      })}
    </div>
  )
}
