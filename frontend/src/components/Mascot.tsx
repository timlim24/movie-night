// Six original sticker-style mascots. Each one blinks, follows the pointer with its eyes
// and acts out a mood: idle · happy · excited · sad · love · sleepy.
import { AnimatePresence, motion, useMotionValue, useSpring, type Transition } from 'framer-motion'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { MascotId } from '../lib/api'
import { pointerX, pointerY, prefersReducedMotion } from '../lib/pointer'

export type Mood = 'idle' | 'happy' | 'excited' | 'sad' | 'love' | 'sleepy'

const INK = '#1b1424'
const LIMB = '#f3e7d3'
const SW = 3

export const MASCOT_NAMES: Record<MascotId, string> = {
  popcorn: 'Попкорн',
  reel: 'Котушка',
  clapper: 'Хлопавка',
  ticket: 'Квиток',
  soda: 'Содова',
  star: 'Зірка',
}

type Spec = {
  face: [number, number]
  shoulders?: [[number, number], [number, number]]
  feet?: number
  body: (ctx: { clip: string; clapOpen: boolean }) => ReactNode
}

const starPoints = (() => {
  const pts: string[] = []
  for (let k = 0; k < 10; k++) {
    const a = ((-90 + 36 * k) * Math.PI) / 180
    const r = k % 2 === 0 ? 54 : 26
    pts.push(`${(60 + r * Math.cos(a)).toFixed(1)},${(84 + r * Math.sin(a)).toFixed(1)}`)
  }
  return pts.join(' ')
})()

const bucketStripes = [1, 3, 5].map((k) => {
  const t = (i: number) => [28 + (64 * i) / 7, 37 + (46 * i) / 7]
  const [a1, b1] = t(k)
  const [a2, b2] = t(k + 1)
  return `M${a1} 60 L${a2} 60 L${b2} 130 L${b1} 130 Z`
})

const SPECS: Record<MascotId, Spec> = {
  popcorn: {
    face: [60, 96],
    shoulders: [
      [33, 96],
      [87, 96],
    ],
    feet: 130,
    body: ({ clip }) => (
      <>
        <defs>
          <clipPath id={clip}>
            <path d="M28 60 L92 60 L83 130 L37 130 Z" />
          </clipPath>
        </defs>
        {[
          [36, 58, 10],
          [49, 49, 11],
          [63, 45, 12],
          [77, 50, 11],
          [88, 58, 9],
          [56, 58, 9],
          [71, 59, 9],
        ].map(([cx, cy, r], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill="#fff4dc" stroke={INK} strokeWidth={SW} />
            <circle cx={cx - r / 3} cy={cy - r / 3} r={r / 3} fill="#ffd166" opacity={0.8} />
          </g>
        ))}
        <path d="M28 60 L92 60 L83 130 L37 130 Z" fill="#ff3d57" />
        <g clipPath={`url(#${clip})`}>
          {bucketStripes.map((d, i) => (
            <path key={i} d={d} fill="#fff4f0" />
          ))}
        </g>
        <path d="M28 60 L92 60 L83 130 L37 130 Z" fill="none" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        <rect x={24} y={57} width={72} height={9} rx={4} fill="#ff3d57" stroke={INK} strokeWidth={SW} />
      </>
    ),
  },
  reel: {
    face: [60, 84],
    shoulders: [
      [16, 92],
      [104, 92],
    ],
    feet: 126,
    body: () => (
      <>
        <circle cx={60} cy={82} r={46} fill="#5b5270" stroke={INK} strokeWidth={SW} />
        <circle cx={60} cy={82} r={39} fill="none" stroke="#7d7396" strokeWidth={3} />
        {[0, 72, 144, 216, 288].map((deg) => {
          const a = ((deg - 90) * Math.PI) / 180
          return <circle key={deg} cx={60 + 33 * Math.cos(a)} cy={82 + 33 * Math.sin(a)} r={7} fill="#241d31" stroke={INK} strokeWidth={2} />
        })}
        <path d="M100 104 C112 116 104 130 92 134" fill="none" stroke="#2b2236" strokeWidth={9} strokeLinecap="round" />
        <path d="M100 104 C112 116 104 130 92 134" fill="none" stroke="#ffb547" strokeWidth={2} strokeDasharray="3 4" />
      </>
    ),
  },
  clapper: {
    face: [60, 100],
    shoulders: [
      [28, 100],
      [92, 100],
    ],
    feet: 128,
    body: ({ clip, clapOpen }) => (
      <>
        <defs>
          <clipPath id={clip}>
            <rect x={28} y={66} width={64} height={12} />
            <rect x={27} y={50} width={66} height={12} />
          </clipPath>
        </defs>
        <rect x={28} y={66} width={64} height={62} rx={7} fill="#2c2537" stroke={INK} strokeWidth={SW} />
        <rect x={28} y={66} width={64} height={12} fill="#f5f0ff" />
        <g clipPath={`url(#${clip})`}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <path key={i} d={`M${20 + i * 14} 80 L${30 + i * 14} 64 L${37 + i * 14} 64 L${27 + i * 14} 80 Z`} fill="#2c2537" />
          ))}
        </g>
        <rect x={28} y={66} width={64} height={12} fill="none" stroke={INK} strokeWidth={SW} />
        <motion.g
          style={{ originX: '27px', originY: '62px' }}
          animate={{ rotate: clapOpen ? -24 : 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 14 }}
        >
          <rect x={27} y={50} width={66} height={12} rx={2} fill="#f5f0ff" stroke={INK} strokeWidth={SW} />
          <g clipPath={`url(#${clip})`}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <path key={i} d={`M${24 + i * 14} 62 L${34 + i * 14} 50 L${41 + i * 14} 50 L${31 + i * 14} 62 Z`} fill="#2c2537" />
            ))}
          </g>
        </motion.g>
        <path d="M38 120 H56 M64 120 H82" stroke="#f5f0ff" strokeWidth={2} opacity={0.55} strokeLinecap="round" />
      </>
    ),
  },
  ticket: {
    face: [60, 88],
    shoulders: [
      [27, 112],
      [93, 112],
    ],
    feet: 128,
    body: () => (
      <g transform="rotate(-5 60 93)">
        <path
          d="M34 58 H86 Q94 58 94 66 V85 A8 8 0 0 0 94 101 V120 Q94 128 86 128 H34 Q26 128 26 120 V101 A8 8 0 0 0 26 85 V66 Q26 58 34 58 Z"
          fill="#ffb547"
          stroke={INK}
          strokeWidth={SW}
          strokeLinejoin="round"
        />
        <path d="M32 110 H88" stroke={INK} strokeWidth={2} strokeDasharray="4 4" opacity={0.6} />
        <text x={60} y={122} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={INK} fontFamily="Unbounded, sans-serif" letterSpacing={1}>
          ADMIT ONE
        </text>
      </g>
    ),
  },
  soda: {
    face: [60, 96],
    shoulders: [
      [37, 98],
      [83, 98],
    ],
    feet: 130,
    body: ({ clip }) => (
      <>
        <defs>
          <clipPath id={clip}>
            <path d="M34 62 L86 62 L78 130 L42 130 Z" />
          </clipPath>
        </defs>
        <path d="M66 58 L74 22 L88 16" fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M66 58 L74 22 L88 16" fill="none" stroke="#ff3d57" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M66 58 L74 22 L88 16" fill="none" stroke="#fff" strokeWidth={5} strokeDasharray="4 5" strokeLinejoin="round" />
        <path d="M34 62 L86 62 L78 130 L42 130 Z" fill="#3fc6ee" />
        <g clipPath={`url(#${clip})`}>
          <path d="M30 116 Q45 106 60 116 T90 116 V135 H30 Z" fill="#1e93c4" />
          <path d="M30 74 Q45 66 60 74 T90 74 V80 Q75 72 60 80 T30 80 Z" fill="#fff" opacity={0.85} />
        </g>
        <path d="M34 62 L86 62 L78 130 L42 130 Z" fill="none" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        <rect x={29} y={54} width={62} height={11} rx={5} fill="#f4f1f8" stroke={INK} strokeWidth={SW} />
      </>
    ),
  },
  star: {
    face: [60, 90],
    body: () => (
      <>
        <polygon points={starPoints} fill="#ffd34d" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        <polygon points={starPoints} fill="none" stroke="#fff3b0" strokeWidth={2} strokeLinejoin="round" transform="translate(60 84) scale(0.8) translate(-60 -84)" opacity={0.7} />
      </>
    ),
  },
}

function Heart({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 4 C-8 -4 -12 4 -6 9 L0 14 L6 9 C12 4 8 -4 0 4 Z"
      fill="#ff3d57"
      stroke={INK}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  )
}

function Face({ x, y, mood, pupil }: { x: number; y: number; mood: Mood; pupil: { x: any; y: any } }) {
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    let t: number
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true)
        window.setTimeout(() => setBlink(false), 130)
        loop()
      }, 2200 + Math.random() * 3200)
    }
    loop()
    return () => window.clearTimeout(t)
  }, [])

  const closed = mood === 'sleepy'
  const cheeks = mood === 'happy' || mood === 'love' || mood === 'excited'
  return (
    <g>
      {cheeks && (
        <>
          <ellipse cx={x - 21} cy={y + 9} rx={6} ry={4} fill="#ff7aa8" opacity={0.75} />
          <ellipse cx={x + 21} cy={y + 9} rx={6} ry={4} fill="#ff7aa8" opacity={0.75} />
        </>
      )}
      {mood === 'love' ? (
        <>
          <Heart x={x - 13} y={y - 9} s={1.1} />
          <Heart x={x + 13} y={y - 9} s={1.1} />
        </>
      ) : closed ? (
        <>
          <path d={`M${x - 20} ${y - 2} Q${x - 13} ${y + 4} ${x - 6} ${y - 2}`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d={`M${x + 6} ${y - 2} Q${x + 13} ${y + 4} ${x + 20} ${y - 2}`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        </>
      ) : (
        <motion.g
          animate={{ scaleY: blink ? 0.1 : 1 }}
          transition={{ duration: 0.08 }}
          style={{ originX: `${x}px`, originY: `${y - 2}px` }}
        >
          {[-13, 13].map((dx) => (
            <g key={dx}>
              <ellipse cx={x + dx} cy={y - 2} rx={8.5} ry={mood === 'excited' ? 10.5 : 9.5} fill="#fff" stroke={INK} strokeWidth={2.5} />
              <motion.g style={{ x: pupil.x, y: pupil.y }}>
                <circle cx={x + dx} cy={y - 1} r={mood === 'excited' ? 5 : 4.2} fill={INK} />
                <circle cx={x + dx + 1.6} cy={y - 3} r={1.4} fill="#fff" />
              </motion.g>
            </g>
          ))}
        </motion.g>
      )}
      {mood === 'sad' && (
        <>
          <path d={`M${x - 21} ${y - 15} L${x - 8} ${y - 18}`} stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d={`M${x + 21} ${y - 15} L${x + 8} ${y - 18}`} stroke={INK} strokeWidth={3} strokeLinecap="round" />
        </>
      )}
      {mood === 'happy' || mood === 'love' ? (
        <g>
          <path d={`M${x - 9} ${y + 9} Q${x} ${y + 24} ${x + 9} ${y + 9} Z`} fill="#3a0f1a" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
          <path d={`M${x - 4} ${y + 15} Q${x} ${y + 12} ${x + 4} ${y + 15} Q${x} ${y + 19} ${x - 4} ${y + 15}`} fill="#ff7aa8" />
        </g>
      ) : mood === 'excited' ? (
        <ellipse cx={x} cy={y + 15} rx={6} ry={7.5} fill="#3a0f1a" stroke={INK} strokeWidth={2.5} />
      ) : mood === 'sad' ? (
        <path d={`M${x - 7} ${y + 17} Q${x} ${y + 10} ${x + 7} ${y + 17}`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      ) : mood === 'sleepy' ? (
        <ellipse cx={x} cy={y + 13} rx={3} ry={3.5} fill="#3a0f1a" />
      ) : (
        <path d={`M${x - 7} ${y + 11} Q${x} ${y + 17} ${x + 7} ${y + 11}`} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      )}
    </g>
  )
}

const bodyMotion: Record<Mood, { animate: any; transition: Transition }> = {
  idle: { animate: { y: [0, -3, 0], rotate: [0, -1.5, 0, 1.5, 0], scaleY: 1 }, transition: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' } },
  happy: { animate: { y: [0, -16, 0, -8, 0], scaleY: [1, 1.04, 0.94, 1.02, 1], rotate: 0 }, transition: { duration: 0.9, repeat: Infinity, repeatDelay: 0.6 } },
  excited: { animate: { y: [0, -12, 0], rotate: [-6, 6, -6], scaleY: [0.95, 1.05, 0.95] }, transition: { duration: 0.45, repeat: Infinity } },
  sad: { animate: { y: 5, rotate: -5, scaleY: 0.95 }, transition: { type: 'spring', stiffness: 120, damping: 12 } },
  love: { animate: { scale: [1, 1.07, 1], y: [0, -4, 0], rotate: 0 }, transition: { duration: 0.8, repeat: Infinity } },
  sleepy: { animate: { rotate: [0, 4, 0], y: [0, 2, 0] }, transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' } },
}

function Arm({ at, side, mood }: { at: [number, number]; side: -1 | 1; mood: Mood }) {
  const [sx, sy] = at
  const up = mood === 'happy' || mood === 'excited' || mood === 'love'
  const rot = up ? side * -125 : mood === 'sad' ? side * 12 : side * -18
  return (
    <motion.g
      style={{ originX: `${sx}px`, originY: `${sy}px` }}
      animate={up ? { rotate: [rot, rot + side * 25, rot] } : { rotate: rot }}
      transition={up ? { duration: 0.5, repeat: Infinity } : { type: 'spring', stiffness: 200, damping: 14 }}
    >
      <path d={`M${sx} ${sy} Q${sx + side * 10} ${sy + 8} ${sx + side * 12} ${sy + 20}`} fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />
      <path d={`M${sx} ${sy} Q${sx + side * 10} ${sy + 8} ${sx + side * 12} ${sy + 20}`} fill="none" stroke={LIMB} strokeWidth={3.5} strokeLinecap="round" />
      <circle cx={sx + side * 12} cy={sy + 22} r={5.5} fill="#fff" stroke={INK} strokeWidth={2.5} />
    </motion.g>
  )
}

type Props = {
  kind: MascotId
  mood?: Mood
  size?: number
  bubble?: ReactNode
  className?: string
  title?: string
}

export function Mascot({ kind, mood = 'idle', size = 96, bubble, className, title }: Props) {
  const spec = SPECS[kind] ?? SPECS.popcorn
  const clip = useId().replace(/:/g, '')
  const ref = useRef<SVGSVGElement>(null)
  const px = useSpring(useMotionValue(0), { stiffness: 300, damping: 25 })
  const py = useSpring(useMotionValue(0), { stiffness: 300, damping: 25 })
  const reduced = prefersReducedMotion()

  useEffect(() => {
    const update = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const dx = pointerX.get() - (r.left + r.width / 2)
      const dy = pointerY.get() - (r.top + r.height * 0.6)
      const d = Math.hypot(dx, dy) || 1
      const k = Math.min(3.2, d / 40) / d
      px.set(dx * k)
      py.set(dy * k)
    }
    update()
    const a = pointerX.on('change', update)
    const b = pointerY.on('change', update)
    return () => {
      a()
      b()
    }
  }, [px, py])

  const clapOpen = kind === 'clapper' && (mood === 'happy' || mood === 'excited' || mood === 'love')
  const motionCfg = reduced ? { animate: {}, transition: {} } : bodyMotion[mood]
  const [fx, fy] = spec.face

  return (
    <div className={`mascot ${className ?? ''}`} style={{ width: size }} title={title ?? MASCOT_NAMES[kind]}>
      <AnimatePresence>
        {bubble && (
          <motion.div
            key={String(bubble)}
            className="mascot-bubble"
            initial={{ scale: 0, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          >
            {bubble}
          </motion.div>
        )}
      </AnimatePresence>
      <svg ref={ref} viewBox="0 0 120 140" width={size} height={(size * 140) / 120} aria-hidden="true">
        <ellipse cx={60} cy={136} rx={30} ry={4} fill="#000" opacity={0.35} />
        <motion.g animate={motionCfg.animate} transition={motionCfg.transition} style={{ originX: '60px', originY: '134px' }}>
          {spec.feet && (
            <g>
              {[48, 72].map((lx) => (
                <g key={lx}>
                  <path d={`M${lx} ${spec.feet! - 2} V${132}`} stroke={INK} strokeWidth={7} strokeLinecap="round" />
                  <path d={`M${lx} ${spec.feet! - 2} V${132}`} stroke={LIMB} strokeWidth={3.5} strokeLinecap="round" />
                  <ellipse cx={lx + (lx < 60 ? -3 : 3)} cy={134} rx={7.5} ry={4} fill="#ff3d57" stroke={INK} strokeWidth={2.5} />
                </g>
              ))}
            </g>
          )}
          {spec.shoulders && (
            <>
              <Arm at={spec.shoulders[0]} side={-1} mood={mood} />
              <Arm at={spec.shoulders[1]} side={1} mood={mood} />
            </>
          )}
          {spec.body({ clip, clapOpen })}
          <Face x={fx} y={fy} mood={mood} pupil={{ x: px, y: py }} />
          {mood === 'sleepy' && (
            <motion.text
              x={92}
              y={40}
              fontSize={16}
              fontWeight={900}
              fill="#c9b8ff"
              fontFamily="Unbounded, sans-serif"
              animate={{ y: [44, 24], opacity: [0, 1, 0] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            >
              z
            </motion.text>
          )}
        </motion.g>
      </svg>
    </div>
  )
}
