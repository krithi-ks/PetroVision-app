import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'

function OceanMark() {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-100/20 bg-cyan-100/10 text-cyan-100 shadow-[0_8px_30px_rgba(20,184,166,0.15)]">
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2.8c3.2 4.3 5.8 7 5.8 10.4a5.8 5.8 0 1 1-11.6 0C6.2 9.8 8.8 7.1 12 2.8Z" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 18.5c1.3-.8 2.5-.8 3.8 0s2.5.8 3.8 0 2.5-.8 3.8 0 2.5.8 3.8 0 2.5-.8 3.8 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export default function Login() {
  const { user, loading, sessionError, login } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#061522] text-sm text-cyan-50/70">Establishing secure connection…</div>
  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login({ email, password })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#061522] text-white">
      <section className="relative hidden min-h-screen flex-1 flex-col justify-between overflow-hidden px-14 py-12 lg:flex xl:px-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_65%_42%,rgba(15,118,110,0.25),transparent_48%),linear-gradient(135deg,#061522_10%,#082b3c_58%,#0a4350)]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(165,243,252,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(165,243,252,0.14)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
        <svg className="pointer-events-none absolute -bottom-5 -left-8 w-[110%] text-cyan-200/20" viewBox="0 0 1200 420" fill="none" aria-hidden="true">
          <path d="M-50 230c150-82 242 60 390-8 154-70 229-81 359-11 133 72 238 58 374-14 119-63 188-12 223 8" stroke="currentColor" strokeWidth="2" />
          <path d="M-50 278c150-82 242 60 390-8 154-70 229-81 359-11 133 72 238 58 374-14 119-63 188-12 223 8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M-50 326c150-82 242 60 390-8 154-70 229-81 359-11 133 72 238 58 374-14 119-63 188-12 223 8" stroke="currentColor" strokeWidth="1" />
          <circle cx="820" cy="112" r="115" stroke="currentColor" strokeWidth="1" />
          <circle cx="820" cy="112" r="86" stroke="currentColor" strokeWidth="1" strokeDasharray="3 7" />
        </svg>
        <div className="relative z-10 flex items-center gap-3">
          <OceanMark />
          <div>
            <div className="text-[17px] font-semibold tracking-tight">PetroVision</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-cyan-100/55">Ocean intelligence</div>
          </div>
        </div>
        <div className="relative z-10 max-w-xl pb-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-100/15 bg-cyan-100/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-100/80">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300 shadow-[0_0_12px_#5eead4]" />
            Protecting what lies beneath
          </div>
          <h1 className="text-4xl font-medium leading-[1.13] tracking-[-0.035em] text-white xl:text-[52px]">
            See the surface.<br /><span className="text-cyan-200">Safeguard the sea.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-cyan-50/65">
            A clearer view of petroleum contamination, powered by intelligent imaging and a deeper respect for our oceans.
          </p>
          <div className="mt-9 flex gap-8 border-t border-white/10 pt-5">
            <div><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-100/45">Observe</div><div className="mt-1 text-sm text-cyan-50/80">Coastal waters</div></div>
            <div><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-100/45">Understand</div><div className="mt-1 text-sm text-cyan-50/80">Oil signatures</div></div>
            <div><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-100/45">Protect</div><div className="mt-1 text-sm text-cyan-50/80">Marine life</div></div>
          </div>
        </div>
        <div className="relative z-10 font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-100/35">PetroVision · Secure workspace</div>
      </section>

      <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-5 py-12 sm:px-10 lg:w-[46%] lg:flex-none lg:bg-[#f8fbfc] lg:text-slate-900 xl:w-[43%]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_15%,rgba(20,184,166,0.16),transparent_35%),linear-gradient(145deg,#082b3c,#061522)] lg:hidden" />
        <div className="relative z-10 w-full max-w-[390px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <OceanMark />
            <div className="text-lg font-semibold tracking-tight">PetroVision</div>
          </div>
          <div className="mb-8">
            <div className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-teal-600 lg:text-teal-700">Secure access</div>
            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-white lg:text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm text-white/60 lg:text-slate-500">Sign in to continue to your PetroVision workspace.</p>
          </div>
          {(error || sessionError) && (
            <div role="alert" className="mb-5 rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100 lg:border-rose-200 lg:bg-rose-50 lg:text-rose-700">
              {error || `Could not verify your session: ${sessionError}`}
            </div>
          )}
          <form onSubmit={submit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-white/80 lg:text-slate-700">Email address</span>
              <input
                autoComplete="username"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@organization.org"
                className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-teal-300 focus:ring-4 focus:ring-teal-300/10 lg:border-slate-200 lg:bg-white lg:text-slate-900 lg:placeholder:text-slate-400 lg:focus:border-teal-500 lg:focus:ring-teal-500/10"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-white/80 lg:text-slate-700">Password</span>
              <span className="relative block">
                <input
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  maxLength={1024}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 pr-20 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-teal-300 focus:ring-4 focus:ring-teal-300/10 lg:border-slate-200 lg:bg-white lg:text-slate-900 lg:placeholder:text-slate-400 lg:focus:border-teal-500 lg:focus:ring-teal-500/10"
                />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-3 text-xs font-medium text-cyan-100/70 hover:text-white lg:text-teal-700 lg:hover:text-teal-900">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-500 text-sm font-semibold text-[#04242b] shadow-[0_8px_24px_rgba(20,184,166,0.2)] transition hover:bg-teal-400 disabled:cursor-wait disabled:opacity-60">
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <span aria-hidden="true">→</span>}
            </button>
          </form>
          <div className="mt-7 flex items-center justify-center gap-2 text-[11px] text-white/45 lg:text-slate-400">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" /><path d="M5.5 7V4.8a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeLinecap="round" /></svg>
            Your session is protected by server-managed access controls.
          </div>
          <div className="mt-10 text-center text-xs text-white/45 lg:text-slate-500">
            Need an account? <Link to="/register" className="font-medium text-teal-200 hover:text-white lg:text-teal-700 lg:hover:text-teal-900">Request access</Link>
          </div>
          <div className="mt-5 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-white/30 lg:text-slate-400">
            Registration is subject to administrator approval
          </div>
        </div>
      </section>
    </main>
  )
}
