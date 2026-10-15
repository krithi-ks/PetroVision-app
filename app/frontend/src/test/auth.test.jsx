import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import Login from '../pages/Login'
import Register from '../pages/Register'
import AdminUsers from '../pages/AdminUsers'
import AnalyticsDashboard from '../pages/AnalyticsDashboard'

vi.mock('recharts', async (importOriginal) => {
  const module = await importOriginal()
  return { ...module, ResponsiveContainer: ({ children }) => <div>{children}</div> }
})

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

  it('submits registration for admin review instead of signing the visitor in', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url) === '/api/auth/session') return respond({ detail: 'Sign in to continue.' }, 401)
      if (String(url) === '/api/auth/register') return respond({
        message: 'Registration submitted. An administrator must approve your access before you can sign in.',
      }, 202)
      return respond({ error: { message: 'Unexpected request' } }, 404)
    }))
    render(<MemoryRouter><AuthProvider><Register /></AuthProvider></MemoryRouter>)
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'pending@example.test' } })
    fireEvent.change(screen.getByLabelText('Create password'), { target: { value: 'registration-password-123' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'registration-password-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request an account' }))
    expect((await screen.findByRole('status')).textContent).toContain('Request sent for review')
    expect(screen.getByText(/administrator approval/i)).toBeTruthy()
  })

  it('creates an account and revokes its access from the admin list', async () => {
    const fetch = vi.fn(async (url, options = {}) => {
      const path = String(url)
      if (path === '/api/auth/session') return respond({ user: admin })
      if (path === '/api/admin/users' && options.method === 'POST') return respond({ user: member })
      if (path === '/api/admin/users') return respond({ users: [admin] })
      if (path === '/api/admin/registration-requests') return respond({ requests: [] })
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

  it('lets administrators approve pending registrations', async () => {
    const registration = { id: 'request-1', email: member.email, requested_at: 1_750_000_000 }
    const fetch = vi.fn(async (url, options = {}) => {
      const path = String(url)
      if (path === '/api/auth/session') return respond({ user: admin })
      if (path === '/api/admin/users') return respond({ users: [admin] })
      if (path === '/api/admin/registration-requests') return respond({ requests: [registration] })
      if (path === `/api/admin/registration-requests/${registration.id}/approve`) return respond({ user: member })
      return respond({ error: { message: 'Unexpected request' } }, 404)
    })
    vi.stubGlobal('fetch', fetch)
    render(<MemoryRouter><AuthProvider><AdminUsers /></AuthProvider></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve access' }))
    expect(await screen.findByText(`Registration approved for ${member.email}. They can now sign in.`)).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(
      `/api/admin/registration-requests/${registration.id}/approve`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows saved image, model metrics and trends on the analytics dashboard', async () => {
    const record = {
      id: '20261015-100000-000001',
      created_at: '2026-10-15T10:00:00+00:00',
      model: { id: 'yolo', label: 'YOLO11n-Seg' },
      image: { filename: 'coast.jpg', width: 640, height: 480 },
      urls: { source: '/api/history/scan/source', labels: '/api/history/scan/labels' },
      measurements: {
        coverage_percent: 12.5, petroleum_pixels: 38400, total_pixels: 307200,
        perimeter_px: 260, largest_region_pixels: 24000,
        centroid: { x: 200, y: 150 }, bounding_box: { width: 200, height: 120 },
      },
      timing: { inference_ms: 42, total_ms: 49 },
      instance_count: 1,
      instances: [{
        index: 1, id: '01', kind: 'instance', class_name: 'oil', area_px: 38400,
        coverage_percent: 12.5, confidence: 0.91, centroid: { x: 200, y: 150 },
      }],
    }
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url) === '/api/history?limit=300') return respond({ items: [{
        id: record.id, created_at: record.created_at, model: record.model, filename: 'coast.jpg',
        instance_count: 1, coverage_percent: 12.5, inference_ms: 42,
      }] })
      if (String(url) === `/api/history/${record.id}`) return respond(record)
      return respond({ error: { message: 'Unexpected request' } }, 404)
    }))
    render(<MemoryRouter><AuthProvider><AnalyticsDashboard /></AuthProvider></MemoryRouter>)
    expect((await screen.findByRole('option')).textContent).toContain('coast.jpg')
    expect(screen.getByRole('img', { name: 'Analysed source image: coast.jpg' })).toBeTruthy()
    expect(screen.getByText('Region details')).toBeTruthy()
    expect(screen.getAllByText('YOLO11n-Seg').length).toBeGreaterThan(0)
    expect(screen.getByText('38,400 px')).toBeTruthy()
  })
})
