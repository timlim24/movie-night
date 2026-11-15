import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Countdown, TicketButton } from '../components/Ui'
import { finishLogin } from '../lib/auth'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    finishLogin(window.location.search)
      .then((to) => navigate(to, { replace: true }))
      .catch((e: Error) => setError(e.message))
  }, [navigate])
  return (
    <section className="center-screen">
      {error ? (
        <div className="panel">
          <h2>Не вдалося увійти</h2>
          <p className="muted">{error}</p>
          <TicketButton onClick={() => navigate('/', { replace: true })}>На головну</TicketButton>
        </div>
      ) : (
        <Countdown label="Відкриваємо зал…" />
      )}
    </section>
  )
}
