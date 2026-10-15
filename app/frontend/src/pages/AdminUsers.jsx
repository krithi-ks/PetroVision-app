import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const PASSWORD_MIN_LENGTH = 12

function Avatar({ email, active }) {
  const initials = email.split('@')[0].split(/[._-]/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border text-xs font-semibold ${active ? 'border-teal-100 bg-teal-50 text-teal-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
      {initials || 'U'}
    </span>
  )
}

function AccessPill({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {active ? 'Active' : 'Revoked'}
    </span>
  )
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState(null)
  const [requestActionId, setRequestActionId] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    setRequestError('')
    const [userResult, requestResult] = await Promise.allSettled([
      api.adminUsers(),
      api.registrationRequests(),
    ])
    if (userResult.status === 'fulfilled') setUsers(userResult.value.users)
    else setLoadError(userResult.reason.message || 'Could not load user accounts.')
    if (requestResult.status === 'fulfilled') setRequests(requestResult.value.requests)
    else setRequestError(requestResult.reason.message || 'Could not load registration requests.')
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return users
    return users.filter((person) => person.email.toLowerCase().includes(term) || person.role.includes(term))
  }, [users, search])

  const activeCount = users.filter((person) => person.is_active).length
  const adminCount = users.filter((person) => person.is_active && person.role === 'admin').length

  const addUser = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api.createUser({ email, password, role })
      setUsers((existing) => [result.user, ...existing])
      setEmail('')
      setPassword('')
      setRole('user')
      setNotice(`Access created for ${result.user.email}. Share the initial password securely.`)
    } catch (err) {
      setError(err.message || 'Could not create this account.')
    } finally {
      setSaving(false)
    }
  }

  const changeAccess = async (person) => {
    setActionId(person.id)
    setError('')
    setNotice('')
    try {
      const result = await api.setUserAccess(person.id, !person.is_active)
      setUsers((existing) => existing.map((item) => item.id === person.id ? result.user : item))
      setNotice(result.user.is_active ? `Access restored for ${person.email}.` : `Access revoked for ${person.email}.`)
    } catch (err) {
      setError(err.message || 'Could not update this account.')
    } finally {
      setActionId(null)
    }
  }

  const reviewRequest = async (request, approve) => {
    setRequestActionId(request.id)
    setError('')
    setNotice('')
    try {
      if (approve) {
        const result = await api.approveRegistration(request.id)
        setUsers((existing) => [result.user, ...existing.filter((person) => person.id !== result.user.id)])
        setNotice(`Registration approved for ${result.user.email}. They can now sign in.`)
      } else {
        await api.rejectRegistration(request.id)
        setNotice(`Registration request from ${request.email} was declined.`)
      }
      setRequests((existing) => existing.filter((item) => item.id !== request.id))
    } catch (err) {
      setError(err.message || 'Could not review this registration.')
    } finally {
      setRequestActionId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-teal-700">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Workspace administration
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">People & access</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Invite trusted team members and manage who can enter the PetroVision workspace.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{currentUser?.email?.slice(0, 1).toUpperCase()}</span>
          <div className="pr-2">
            <div className="text-xs font-medium text-slate-800">{currentUser?.email}</div>
            <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-teal-700">Administrator</div>
          </div>
        </div>
      </div>

      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Team members</div>
          <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight text-slate-900">{users.length}</span><span className="text-xs text-slate-400">accounts</span></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Active access</div>
          <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight text-teal-700">{activeCount}</span><span className="text-xs text-slate-400">people can sign in</span></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Administrators</div>
          <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight text-slate-900">{adminCount}</span><span className="text-xs text-slate-400">active admins</span></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">Awaiting review</div>
          <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight text-amber-600">{requests.length}</span><span className="text-xs text-slate-400">registration requests</span></div>
        </div>
      </div>

      <section className="mb-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Registration requests</h2>
            <p className="mt-1 text-xs text-slate-400">Approve a request to grant workspace access, or decline it.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-mono text-[10px] font-medium text-amber-700">{requests.length} pending</span>
        </div>
        {loading ? (
          <div className="px-6 py-9 text-center text-sm text-slate-400">Loading registration requests…</div>
        ) : requests.length === 0 ? (
          <div className="px-6 py-9 text-center text-sm text-slate-400">No registration requests to review.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-3">
                  <Avatar email={request.email} active />
                  <div>
                    <div className="text-sm font-medium text-slate-800">{request.email}</div>
                    <div className="mt-1 text-xs text-slate-400">Requested {new Date(request.requested_at * 1000).toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <button type="button" disabled={requestActionId === request.id} onClick={() => reviewRequest(request, false)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">{requestActionId === request.id ? 'Saving…' : 'Decline'}</button>
                  <button type="button" disabled={requestActionId === request.id} onClick={() => reviewRequest(request, true)} className="h-9 rounded-lg bg-teal-700 px-3 text-xs font-medium text-white transition hover:bg-teal-800 disabled:opacity-50">{requestActionId === request.id ? 'Saving…' : 'Approve access'}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(error || notice || loadError) && (
        <div role={error || loadError ? 'alert' : 'status'} className={`mb-5 rounded-xl border px-4 py-3 text-sm ${error || loadError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-teal-100 bg-teal-50 text-teal-800'}`}>
          {error || loadError || notice}
        </div>
      )}

      {requestError && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load registration requests: {requestError}</div>}

      <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.03)] sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          </span>
          <div><h2 className="text-base font-semibold text-slate-900">Add a team member</h2><p className="mt-1 text-xs leading-5 text-slate-500">Create an account with an initial password. Share it with the user privately.</p></div>
        </div>
        <form onSubmit={addUser} className="grid gap-4 md:grid-cols-[1.1fr_1.1fr_0.8fr_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Work email</span>
            <input type="email" required maxLength={254} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@organization.org" className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Initial password</span>
            <input type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={1024} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10">
              <option value="user">Team member</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[#0c4c57] px-5 text-sm font-semibold text-white transition hover:bg-[#0a6267] disabled:cursor-wait disabled:opacity-60">{saving ? 'Adding…' : 'Add access'}</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Workspace accounts</h2>
            <p className="mt-1 text-xs text-slate-400">Revoked accounts remain listed for auditability.</p>
          </div>
          <label className="relative block w-full sm:w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" strokeLinecap="round" /></svg>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search accounts" placeholder="Search people…" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none placeholder:text-slate-400 focus:border-teal-500 focus:bg-white" />
          </label>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Loading workspace accounts…</div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">{users.length ? 'No accounts match your search.' : 'No accounts yet.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead><tr className="border-b border-slate-100 bg-slate-50/70 font-mono text-[9px] uppercase tracking-[0.13em] text-slate-400">
                <th className="px-6 py-3 font-medium">Member</th><th className="px-5 py-3 font-medium">Role</th><th className="px-5 py-3 font-medium">Access</th><th className="px-5 py-3 font-medium">Added</th><th className="px-6 py-3 text-right font-medium">Manage</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((person) => (
                  <tr key={person.id} className="transition hover:bg-slate-50/70">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3"><Avatar email={person.email} active={person.is_active} /><div><div className="text-sm font-medium text-slate-800">{person.email}</div>{person.id === currentUser?.id && <div className="mt-0.5 text-[10px] text-slate-400">You</div>}</div></div>
                    </td>
                    <td className="px-5 py-4"><span className={`rounded-md px-2 py-1 text-[11px] font-medium ${person.role === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{person.role === 'admin' ? 'Administrator' : 'Team member'}</span></td>
                    <td className="px-5 py-4"><AccessPill active={person.is_active} /></td>
                    <td className="px-5 py-4 text-xs text-slate-500">{new Date(person.created_at * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className="px-6 py-4 text-right">
                      <button type="button" disabled={actionId === person.id || person.id === currentUser?.id} onClick={() => changeAccess(person)} className={`rounded-lg px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${person.is_active ? 'text-rose-600 hover:bg-rose-50' : 'text-teal-700 hover:bg-teal-50'}`}>
                        {actionId === person.id ? 'Saving…' : person.is_active ? 'Revoke access' : 'Restore access'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-4 text-center text-[11px] text-slate-400">Passwords are stored as one-way hashes. Revoking access immediately ends active sessions.</p>
    </div>
  )
}
