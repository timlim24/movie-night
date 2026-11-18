// The room you are sitting in: film grain, a projector beam that follows the pointer, dust in the light.
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
