import { motion } from 'framer-motion'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Background } from './components/Atmosphere'
import { api, type Profile } from './lib/api'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './lib/toast'
import AuthCallback from './pages/AuthCallback'
import Friends from './pages/Friends'
import Home from './pages/Home'
import Landing from './pages/Landing'
import Library from './pages/Library'
import ProfilePage from './pages/Profile'
import RoomPage from './pages/room/RoomPage'

type ProfileCtx = { profile: Profile | null; setProfile: (p: Profile) => void; reload: () => void }
const ProfileContext = createContext<ProfileCtx>({ profile: null, setProfile: () => {}, reload: () => {} })
export const useProfile = () => useContext(ProfileContext)

function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { signedIn } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const reload = useCallback(() => {
    if (signedIn) api.me().then(setProfile).catch(() => {})
  }, [signedIn])
  useEffect(() => {
    if (signedIn) reload()
    else setProfile(null)
  }, [signedIn, reload])
  return <ProfileContext.Provider value={{ profile, setProfile, reload }}>{children}</ProfileContext.Provider>
}

const NAV = [
  { to: '/', label: 'Зал', icon: 'M4 10l8-6 8 6v10H4z M10 20v-6h4v6' },
  { to: '/library', label: 'Фільмотека', icon: 'M5 4h3v16H5z M10.5 4h3v16h-3z M16 5l3 .8-3.5 15-3-.8z' },
  { to: '/friends', label: 'Друзі', icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c.8-3.6 3.4-6 6.5-6s5.7 2.4 6.5 6 M16 4.5a3.3 3.3 0 0 1 0 6.4 M18 14c2 .8 3.2 2.9 3.6 6' },
  { to: '/profile', label: 'Я', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c1-4 4.2-6.5 8-6.5s7 2.5 8 6.5' },
]

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Навігація">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d={n.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{n.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { signedIn } = useAuth()
  const location = useLocation()
  if (!signedIn) return <Landing returnTo={location.pathname + location.search} />
  return children
}

function Shell() {
  const location = useLocation()
  const { signedIn } = useAuth()
  const inRoom = location.pathname.startsWith('/r/')
  const showNav = signedIn && !inRoom && location.pathname !== '/auth/callback'
  return (
    <>
      <Background />
      <main className={`page ${showNav ? 'with-nav' : ''}`}>
        <Routes location={location}>
          <Route path="/" element={signedIn ? <Home /> : <Landing />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/library" element={<RequireAuth><Library /></RequireAuth>} />
          <Route path="/friends" element={<RequireAuth><Friends /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/r/:code" element={<RequireAuth><RoomPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showNav && <BottomNav />}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </ProfileProvider>
    </AuthProvider>
  )
}
