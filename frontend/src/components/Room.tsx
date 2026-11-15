import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import type { MascotId, RoomMember } from '../lib/api'
import { useToast } from '../lib/toast'
import { Mascot, type Mood } from './Mascot'

export const roomUrl = (code: string) => `${window.location.origin}/r/${code}`

/** The room code as a cinema ticket with a QR stub. Tilts in 3D toward the pointer. */
export function RoomTicket({ code }: { code: string }) {
  const toast = useToast()
  const ref = useRef<HTMLDivElement>(null)
  const rx = useSpring(useMotionValue(0), { stiffness: 150, damping: 15 })
  const ry = useSpring(useMotionValue(0), { stiffness: 150, damping: 15 })
  const url = roomUrl(code)

  const share = async () => {
    const data = { title: 'Movie Night', text: `Заходь обирати фільм! Код кімнати: ${code}`, url }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(url)
        toast('Посилання скопійовано', 'success')
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <motion.div
      ref={ref}
      className="room-ticket"
      style={{ rotateX: rx, rotateY: ry }}
      initial={{ y: -40, opacity: 0, rotate: -6 }}
      animate={{ y: 0, opacity: 1, rotate: -2 }}
      transition={{ type: 'spring', stiffness: 160, damping: 14 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 16)
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 16)
      }}
      onPointerLeave={() => {
        rx.set(0)
        ry.set(0)
      }}
    >
      <div className="room-ticket-main">
        <span className="room-ticket-label">ЗАЛ · КОД КІМНАТИ</span>
        <div className="room-ticket-code">
          {code.split('').map((ch, i) => (
            <motion.span key={i} initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.08 }}>
              {ch}
            </motion.span>
          ))}
        </div>
        <div className="room-ticket-actions">
          <button
            type="button"
            className="chip-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code)
                toast('Код скопійовано', 'success')
              } catch {
                toast(code)
              }
            }}
          >
            Копіювати код
          </button>
          <button type="button" className="chip-btn accent" onClick={share}>
            Запросити ↗
          </button>
        </div>
      </div>
      <div className="room-ticket-stub">
        <div className="qr">
          <QRCodeSVG value={url} size={112} bgColor="transparent" fgColor="#1b1424" level="M" />
        </div>
        <span>скануй, щоб зайти</span>
      </div>
    </motion.div>
  )
}

export type Reaction = { like: boolean; title?: string; key: number }

/** Members as mascots peeking over cinema seats. */
export function Audience({
  members,
  meId,
  moods,
  reactions,
  onTapMe,
  size = 74,
}: {
  members: RoomMember[]
  meId?: string
  moods?: Record<string, Mood>
  reactions?: Record<string, Reaction | undefined>
  onTapMe?: () => void
  size?: number
}) {
  return (
    <div className="audience">
      <div className="audience-row">
        <AnimatePresence>
          {members.map((m, i) => {
            const r = reactions?.[m.userId]
            return (
              <motion.div
                key={m.userId}
                className={`audience-seat ${m.userId === meId ? 'me' : ''}`}
                initial={{ y: -120, opacity: 0, rotate: -20 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16, delay: i * 0.06 }}
                onClick={m.userId === meId ? onTapMe : undefined}
              >
                <Mascot
                  kind={m.mascot}
                  size={size}
                  mood={moods?.[m.userId] ?? 'idle'}
                  bubble={r ? (r.like ? '♥' : '✕') : undefined}
                  title={m.name}
                />
                <div className="seat-back" />
                <span className="audience-name">
                  {m.isHost && <span className="crown">♛</span>}
                  {m.userId === meId ? 'Ти' : m.name.split(' ')[0]}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Watches members' lastVote and turns new votes into short-lived reactions. */
export function useReactions(members: RoomMember[] | undefined) {
  const seen = useRef<Record<string, string>>({})
  const [reactions, setReactions] = useState<Record<string, Reaction | undefined>>({})
  const first = useRef(true)
  useEffect(() => {
    if (!members) return
    const fresh: Record<string, Reaction> = {}
    for (const m of members) {
      const at = m.lastVote?.at
      if (at && seen.current[m.userId] !== at) {
        if (!first.current) fresh[m.userId] = { like: m.lastVote!.like, key: Date.now() }
        seen.current[m.userId] = at
      }
    }
    first.current = false
    if (Object.keys(fresh).length) {
      setReactions((r) => ({ ...r, ...fresh }))
      const ids = Object.keys(fresh)
      window.setTimeout(() => setReactions((r) => {
        const next = { ...r }
        ids.forEach((id) => {
          if (next[id] && fresh[id] && next[id]!.key === fresh[id].key) delete next[id]
        })
        return next
      }), 2400)
    }
  }, [members])
  const poke = (userId: string, like: boolean) => {
    const key = Date.now()
    setReactions((r) => ({ ...r, [userId]: { like, key } }))
    window.setTimeout(() => setReactions((r) => (r[userId]?.key === key ? { ...r, [userId]: undefined } : r)), 1600)
  }
  return { reactions, poke }
}

export function CodeInput({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const len = 5
  return (
    <form
      className="code-input"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.length === len) onSubmit(value)
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        value={value}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        aria-label="Код кімнати"
        maxLength={len}
        onChange={(e) => {
          const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len)
          setValue(v)
          if (v.length === len) onSubmit(v)
        }}
      />
      {Array.from({ length: len }, (_, i) => (
        <motion.span
          key={i}
          className={`code-cell ${i === value.length ? 'active' : ''} ${value[i] ? 'filled' : ''}`}
          animate={value[i] ? { scale: [1.25, 1], rotate: [8, 0] } : { scale: 1 }}
        >
          {value[i] ?? ''}
        </motion.span>
      ))}
    </form>
  )
}

export function MascotPicker({ value, onChange }: { value: MascotId; onChange: (m: MascotId) => void }) {
  const all: MascotId[] = ['popcorn', 'reel', 'clapper', 'ticket', 'soda', 'star']
  return (
    <div className="mascot-picker">
      {all.map((m) => (
        <motion.button
          key={m}
          type="button"
          className={`mascot-pick ${m === value ? 'selected' : ''}`}
          onClick={() => onChange(m)}
          whileHover={{ y: -6 }}
          whileTap={{ scale: 0.9 }}
          aria-pressed={m === value}
        >
          <Mascot kind={m} size={78} mood={m === value ? 'excited' : 'idle'} />
          {m === value && <motion.div layoutId="mascot-ring" className="mascot-ring" />}
        </motion.button>
      ))}
    </div>
  )
}
