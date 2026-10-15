import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { audio } from '../audio/AudioManager'
import SoundControl from './SoundControl'
import { IconChevron, IconClose, IconMenu, Logo } from './icons'

const PRIMARY = [
  { to: '/', label: 'Overview', end: true },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/analyze', label: 'Analyze' },
  { to: '/live', label: 'Live Scan' },
  { to: '/results', label: 'Results' },
  { to: '/3d', label: 'Visualize' },
]
const SECONDARY = [
  { to: '/research', label: 'Research' },
  { to: '/about', label: 'About' },
]

function SystemState() {
  const { status, statusError } = useApp()
  let tone = 'bg-warn'
  let text = 'Connecting'
  if (statusError) { tone = 'bg-bad'; text = 'System offline' }
  else if (status) {
    if (status.ready) { tone = 'bg-ok'; text = 'System ready' }
    else { tone = 'bg-warn'; text = 'No models available' }
  }
  return (
    <span className="hidden items-center gap-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-2 md:inline-flex" role="status">
      <span className="relative grid h-3 w-3 place-items-center">
        <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
        <span className="absolute inset-0 rounded-full border border-line-strong" />
      </span>
      {text}
    </span>
  )
}

function MoreMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="relative hidden lg:block" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className="flex h-9 items-center gap-1 rounded px-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink-2 hover:text-ink">
        More <IconChevron width={14} height={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-40 rounded border border-line-strong bg-surface py-1 shadow-sm">
          {SECONDARY.map((n) => (
            <NavLink key={n.to} to={n.to} role="menuitem" onClick={() => setOpen(false)}
              className={({ isActive }) => `block px-3 py-2 font-mono text-[11.5px] uppercase tracking-[0.1em] ${isActive ? 'text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
              {n.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const { pathname } = useLocation()
  const { status } = useApp()
  const { user, logout } = useAuth()
  const fullBleed = pathname === '/live'

  // Browsers only allow audio after a user gesture: unlock on the first interaction anywhere.
  useEffect(() => {
    const unlock = () => audio.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])
  useEffect(() => setOpen(false), [pathname])
  // short boot cue the first time the system is ready AND the browser has allowed audio (after a first click/key)
  const bootDone = useRef(false)
  useEffect(() => {
    if (!status?.ready || bootDone.current || sessionStorage.getItem('petrovision.booted')) return undefined
    const t = setInterval(() => {
      if (audio.snapshot?.unlocked || audio.getSnapshot().unlocked) {
        clearInterval(t); bootDone.current = true
        try { sessionStorage.setItem('petrovision.booted', '1') } catch { /* private mode */ }
        setTimeout(() => audio.play('system_ready'), 250)
      }
    }, 400)
    return () => clearInterval(t)
  }, [status?.ready])

  const link = ({ isActive }) =>
    `relative flex h-14 items-center px-3.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.12em] transition-colors ${
      isActive ? 'text-ink after:absolute after:inset-x-3.5 after:bottom-0 after:h-[2px] after:bg-accent' : 'text-ink-3 hover:text-ink'}`

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="PetroVision overview">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight text-ink">PetroVision</span>
          </Link>
          <nav className="hidden items-center lg:flex" aria-label="Primary">
            {PRIMARY.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}>{n.label}</NavLink>)}
          </nav>
          <div className="flex items-center gap-3">
            <SystemState />
            {!fullBleed && <SoundControl />}
            <MoreMenu />
            {user?.role === 'admin' && (
              <NavLink to="/admin" className={({ isActive }) => `hidden rounded border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] sm:inline-flex ${isActive ? 'border-teal-600 bg-teal-700 text-white' : 'border-line-strong text-ink-2 hover:border-teal-600 hover:text-teal-800'}`}>
                Access
              </NavLink>
            )}
            <button
              type="button"
              onClick={async () => {
                setSignOutError('')
                try { await logout() } catch (err) { setSignOutError(err.message || 'Could not sign out.') }
              }}
              title={user?.email}
              className="hidden h-9 rounded border border-line-strong px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 hover:border-ink hover:text-ink sm:block"
            >
              Sign out
            </button>
            <button className="grid h-9 w-9 place-items-center rounded border border-line-strong lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
              {open ? <IconClose /> : <IconMenu />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line bg-surface px-4 py-2 lg:hidden" aria-label="Mobile">
            {[...PRIMARY, ...SECONDARY].map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => `block py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] ${isActive ? 'text-accent' : 'text-ink-2'}`}>{n.label}</NavLink>
            ))}
            {user?.role === 'admin' && <NavLink to="/admin" className={({ isActive }) => `block py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] ${isActive ? 'text-accent' : 'text-ink-2'}`}>People & access</NavLink>}
            <button type="button" onClick={async () => {
              setSignOutError('')
              try { await logout() } catch (err) { setSignOutError(err.message || 'Could not sign out.') }
            }} className="block py-2.5 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-2">Sign out</button>
          </nav>
        )}
      </header>
      {signOutError && <div role="alert" className="border-b border-bad/30 bg-bad/10 px-4 py-2 text-center text-xs text-bad">{signOutError}</div>}

      <main className={fullBleed ? 'flex-1' : 'mx-auto w-full max-w-[1500px] flex-1 px-4 py-8 sm:px-6'}>
        <div key={pathname} className="animate-page"><Outlet /></div>
      </main>
    </div>
  )
}
