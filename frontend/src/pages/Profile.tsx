import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useProfile } from '../App'
import { Mascot, MASCOT_NAMES } from '../components/Mascot'
import { MascotPicker } from '../components/Room'
import { TicketButton } from '../components/Ui'
import { api, ApiError, type MascotId } from '../lib/api'
import { logout } from '../lib/auth'
import { useToast } from '../lib/toast'

export default function ProfilePage() {
  const { profile, setProfile } = useProfile()
  const toast = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) setName(profile.name)
  }, [profile])

  if (!profile) return <div className="center-screen"><span className="spinner" /></div>

  const pick = async (mascot: MascotId) => {
    setProfile({ ...profile, mascot })
    try {
      setProfile(await api.updateMe({ mascot }))
    } catch {
      toast('Не вдалося зберегти', 'error')
    }
  }

  const saveName = async () => {
    setSaving(true)
    try {
      setProfile(await api.updateMe({ name }))
      toast("Ім'я збережено", 'success')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не вдалося зберегти', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile">
      <header className="profile-hero">
        <motion.div key={profile.mascot} initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
          <Mascot kind={profile.mascot} mood="love" size={140} />
        </motion.div>
        <div>
          <p className="eyebrow">твій маскот — {MASCOT_NAMES[profile.mascot]}</p>
          <h1 className="display">{profile.name}</h1>
          <p className="muted">{profile.email}</p>
        </div>
      </header>

      <section className="panel">
        <h3>Обери маскота</h3>
        <p className="muted">Він сидітиме за тебе в залі й реагуватиме на кожен твій свайп.</p>
        <MascotPicker value={profile.mascot} onChange={pick} />
      </section>

      <section className="panel">
        <h3>Як тебе звати в кімнатах</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            saveName()
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Ім'я" />
          <TicketButton type="submit" loading={saving} disabled={!name.trim() || name === profile.name}>
            Зберегти
          </TicketButton>
        </form>
      </section>

      <TicketButton variant="danger" onClick={logout}>
        Вийти з акаунта
      </TicketButton>

      <footer className="footer">
        <p>
          Дані про фільми — <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>. Цей продукт використовує TMDB API, але не
          схвалений і не сертифікований TMDB.
        </p>
      </footer>
    </div>
  )
}
