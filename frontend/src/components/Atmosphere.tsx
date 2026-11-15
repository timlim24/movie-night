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

export function Curtain() {
  if (prefersReducedMotion()) return null
  const t = { duration: 1.05, ease: [0.76, 0, 0.24, 1] as const, delay: 0.08 }
  return (
    <div className="curtain" aria-hidden="true">
      <motion.div className="curtain-panel left" initial={{ x: '0%' }} animate={{ x: '-102%' }} transition={t} />
      <motion.div className="curtain-panel right" initial={{ x: '0%' }} animate={{ x: '102%' }} transition={t} />
      <motion.div className="curtain-valance" initial={{ y: 0 }} animate={{ y: '-110%' }} transition={{ ...t, delay: 0.45 }} />
    </div>
  )
}
