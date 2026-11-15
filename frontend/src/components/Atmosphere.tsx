// The room you are sitting in: film grain, a projector beam that follows the pointer, dust in the light,
// and the velvet curtain that opens on every page change.
import { motion, useSpring, useTransform } from 'framer-motion'
import { useMemo } from 'react'
import { pointerX, pointerY, prefersReducedMotion } from '../lib/pointer'

export function Background() {
  const x = useSpring(pointerX, { stiffness: 40, damping: 18 })
  const y = useSpring(pointerY, { stiffness: 40, damping: 18 })
  const beam = useTransform([x, y], ([bx, by]) => `radial-gradient(520px circle at ${bx}px ${by}px, rgba(255, 196, 120, 0.14), transparent 60%)`)
  const cone = useTransform(x, (bx) => `${((bx as number) / (typeof window !== 'undefined' ? window.innerWidth : 1) - 0.5) * 14}deg`)
  const dust = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1 + Math.random() * 2.5,
        delay: Math.random() * 8,
        duration: 9 + Math.random() * 10,
        key: i,
      })),
    [],
  )
  const reduced = prefersReducedMotion()
  return (
    <div className="atmosphere" aria-hidden="true">
      <div className="atmo-glow" />
      <motion.div className="atmo-cone" style={{ rotate: cone }} />
      <motion.div className="atmo-beam" style={{ background: beam }} />
      {!reduced &&
        dust.map((d) => (
          <span
            key={d.key}
            className="dust"
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              animationDelay: `-${d.delay}s`,
              animationDuration: `${d.duration}s`,
            }}
          />
        ))}
      <div className="grain" />
      <div className="vignette" />
    </div>
  )
}

const EASE = [0.7, 0, 0.18, 1] as const

/**
 * Theatre curtain: velvet panels with gold fringe first gather toward the wings, then slide away,
 * while warm stage light spills through the gap; the scalloped valance lifts last.
 */
export function Curtain() {
  if (prefersReducedMotion()) return null
  const panel = (side: 'left' | 'right') => {
    const dir = side === 'left' ? -1 : 1
    return (
      <motion.div
        key={side}
        className={`curtain-panel ${side}`}
        initial={{ x: '0%', scaleX: 1 }}
        animate={{ x: ['0%', `${dir * 6}%`, `${dir * 104}%`], scaleX: [1, 0.62, 0.4] }}
        transition={{ duration: 1.15, ease: EASE, times: [0, 0.42, 1], delay: 0.08 }}
      >
        <div className="curtain-sheen" />
        <div className="curtain-fringe" />
      </motion.div>
    )
  }
  return (
    <div className="curtain" aria-hidden="true">
      <motion.div
        className="curtain-light"
        initial={{ opacity: 0, scaleX: 0.2 }}
        animate={{ opacity: [0, 1, 0], scaleX: [0.2, 1, 1.6] }}
        transition={{ duration: 1.2, times: [0, 0.35, 1], delay: 0.1 }}
      />
      {panel('left')}
      {panel('right')}
      <motion.div className="curtain-valance" initial={{ y: 0 }} animate={{ y: '-115%' }} transition={{ duration: 0.75, ease: EASE, delay: 0.62 }}>
        <div className="valance-gold" />
        <div className="valance-cloth" />
      </motion.div>
    </div>
  )
}
