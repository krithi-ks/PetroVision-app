import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError, api } from '../lib/api'

const PASSWORD_MIN_LENGTH = 12

export default function Register() {
  const { user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#061522] text-sm text-cyan-50/70">Preparing secure registration…</div>
  if (user) return <Navigate to="/" replace />

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await api.register({ email, password })
      setSubmitted(true)
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to submit your registration. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_0%,rgba(13,148,136,0.22),transparent_45%),linear-gradient(145deg,#082b3c,#061522_60%)] px-5 py-12 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(165,243,252,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(165,243,252,0.15)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <section className="relative z-10 w-full max-w-[460px] rounded-3xl border border-cyan-50/10 bg-[#092333]/85 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-10">
        <Link to="/login" className="mb-10 inline-flex items-center gap-2 text-xs text-cyan-50/60 transition hover:text-white">
          <span aria-hidden="true">←</span> Back to sign in
        </Link>
        <div className="mb-7">
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-teal-300">Join the workspace</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Request access</h1>
          <p className="mt-2 text-sm leading-6 text-cyan-50/60">Create your registration request. An administrator will review it before your account can access the ocean intelligence workspace.</p>
        </div>

        {submitted ? (
          <div role="status" className="rounded-2xl border border-teal-300/20 bg-teal-300/[0.08] p-5">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-teal-300/15 text-teal-200">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h2 className="font-semibold text-white">Request sent for review</h2>
            <p className="mt-2 text-sm leading-6 text-cyan-50/65">Your registration is pending administrator approval. You can sign in after your access has been approved.</p>
            <Link to="/login" className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-teal-400 px-4 text-sm font-semibold text-[#04242b] transition hover:bg-teal-300">Return to sign in</Link>
          </div>
        ) : (
          <>
            {error && <div role="alert" className="mb-5 rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-cyan-50/80">Email address</span>
                <input autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@organization.org" className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-teal-300 focus:ring-4 focus:ring-teal-300/10" />
              </label>
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-cyan-50/80">Create password</span>
                <span className="relative block">
                  <input autoComplete="new-password" type={showPassword ? 'text' : 'password'} required minLength={PASSWORD_MIN_LENGTH} maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`} className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 pr-20 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-teal-300 focus:ring-4 focus:ring-teal-300/10" />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-3 text-xs font-medium text-cyan-100/70 hover:text-white">{showPassword ? 'Hide' : 'Show'}</button>
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-[13px] font-medium text-cyan-50/80">Confirm password</span>
                <input autoComplete="new-password" type={showPassword ? 'text' : 'password'} required minLength={PASSWORD_MIN_LENGTH} maxLength={1024} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-teal-300 focus:ring-4 focus:ring-teal-300/10" />
              </label>
              <p className="text-[11px] leading-5 text-cyan-50/45">Registration does not grant access immediately. An administrator must approve each request.</p>
              <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-400 text-sm font-semibold text-[#04242b] shadow-[0_8px_24px_rgba(20,184,166,0.16)] transition hover:bg-teal-300 disabled:cursor-wait disabled:opacity-60">{submitting ? 'Submitting request…' : 'Request an account'} {!submitting && <span aria-hidden="true">→</span>}</button>
            </form>
          </>
        )}
        <div className="mt-8 border-t border-white/10 pt-5 text-center text-xs text-cyan-50/50">
          Already have access? <Link to="/login" className="font-medium text-teal-200 hover:text-teal-100">Sign in</Link>
        </div>
      </section>
    </main>
  )
}
