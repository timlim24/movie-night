// One global pointer position as motion values: the projector beam and the mascots' eyes follow it.
import { motionValue } from 'framer-motion'

export const pointerX = motionValue(typeof window !== 'undefined' ? window.innerWidth / 2 : 0)
export const pointerY = motionValue(typeof window !== 'undefined' ? window.innerHeight / 3 : 0)

if (typeof window !== 'undefined') {
  const set = (x: number, y: number) => {
    pointerX.set(x)
    pointerY.set(y)
  }
  window.addEventListener('pointermove', (e) => set(e.clientX, e.clientY), { passive: true })
  window.addEventListener('touchmove', (e) => e.touches[0] && set(e.touches[0].clientX, e.touches[0].clientY), {
    passive: true,
  })
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
