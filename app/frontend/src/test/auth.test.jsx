import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import Login from '../pages/Login'
import AdminUsers from '../pages/AdminUsers'

const admin = { id: 'admin-1', email: 'admin@example.test', role: 'admin', is_active: true, created_at: 1_750_000_000 }
const member = { id: 'member-1', email: 'member@example.test', role: 'user', is_active: true, created_at: 1_750_000_000 }
const respond = (body, status = 200) => ({
  ok: status < 400,
  status,
  statusText: status === 401 ? 'Unauthorized' : 'Error',
  text: async () => JSON.stringify(body),
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('authentication screens', () => {
  it('signs in through the server session and returns to the requested page', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (String(url) === '/api/auth/session') return respond({ detail: 'Sign in to continue.' }, 401)
      if (String(url) === '/api/auth/login' && options.method === 'POST') return respond({ user: admin })
      return respond({ error: { message: 'Unexpected request' } }, 404)
    }))
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<div>Workspace ready</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: admin.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'server-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Workspace ready')).toBeTruthy()
  })

  it('reports a rejected login without storing a client-side password', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url) === '/api/auth/session') return respond({ detail: 'Sign in to continue.' }, 401)
      return respond({ detail: 'Email or password is incorrect.' }, 401)
    }))
    render(<MemoryRouter><AuthProvider><Login /></AuthProvider></MemoryRouter>)
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'wrong@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Email or password is incorrect.')
  })

  it('creates an account and revokes its access from the admin list', async () => {
    const fetch = vi.fn(async (url, options = {}) => {
      const path = String(url)
      if (path === '/api/auth/session') return respond({ user: admin })
      if (path === '/api/admin/users' && options.method === 'POST') return respond({ user: member })
      if (path === '/api/admin/users') return respond({ users: [admin] })
      if (path === `/api/admin/users/${member.id}`) return respond({ user: { ...member, is_active: false } })
      return respond({ error: { message: 'Unexpected request' } }, 404)
    })
    vi.stubGlobal('fetch', fetch)
    render(<MemoryRouter><AuthProvider><AdminUsers /></AuthProvider></MemoryRouter>)

    fireEvent.change(await screen.findByLabelText('Work email'), { target: { value: member.email } })
    fireEvent.change(screen.getByLabelText('Initial password'), { target: { value: 'initial-password-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add access' }))
    await screen.findByText(member.email)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/admin/users', expect.objectContaining({ method: 'POST' })))

    const memberRow = screen.getByText(member.email).closest('tr')
    fireEvent.click(within(memberRow).getByRole('button', { name: 'Revoke access' }))
    expect(await screen.findByText('Revoked')).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(`/api/admin/users/${member.id}`, expect.objectContaining({ method: 'PATCH' }))
  })
})
