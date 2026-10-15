// Thin client for the PetroVision FastAPI backend. Same-origin by default (Vite proxies /api in dev).
const BASE = import.meta.env.VITE_API_BASE ?? ''

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', hint = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.hint = hint
  }
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, { credentials: 'include', ...options })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError('PetroVision is offline. Start the application and try again.', {
      code: 'network',
    })
  }
  let body = null
  const text = await res.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  if (!res.ok) {
    const err = body?.error
    const detail = typeof body?.detail === 'string' ? body.detail : null
    throw new ApiError(err?.message || detail || `Request failed (${res.status} ${res.statusText})`, {
      status: res.status,
      code: err?.code || 'http_error',
      hint: err?.hint || null,
    })
  }
  return body
}



export const api = {
  login: (credentials) => request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  }),
  register: (credentials) => request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  }),
  session: () => request('/api/auth/session'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  adminUsers: () => request('/api/admin/users'),
  registrationRequests: () => request('/api/admin/registration-requests'),
  approveRegistration: (id) => request(`/api/admin/registration-requests/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  rejectRegistration: (id) => request(`/api/admin/registration-requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createUser: (user) => request('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  }),
  setUserAccess: (id, active) => request(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  }),
  status: () => request('/api/status'),
  models: () => request('/api/models'),
  loadModel: (id) => request(`/api/models/${encodeURIComponent(id)}/load`, { method: 'POST' }),
  inferImage: (file, modelId) => {
    const form = new FormData()
    form.append('file', file)
    form.append('model_id', modelId)
    return request('/api/infer/image', { method: 'POST', body: form })
  },
  inferFrame: (blob, modelId, signal) =>
    request(`/api/infer/frame?model_id=${encodeURIComponent(modelId)}`, {
      method: 'POST',
      body: blob,
      headers: { 'Content-Type': 'image/jpeg' },
      signal,
    }),
      sendTelegramIncident: ({ image, incidentId, timestamp, modelId, summary }) => {
    const form = new FormData()
    form.append('file', image, 'incident-evidence.jpg')
    form.append('incident_id', incidentId)
    form.append('timestamp', timestamp)
    form.append('model_id', modelId)
    form.append('summary', summary)

    return request('/api/incidents/telegram', {
      method: 'POST',
      body: form,
    })
  },
  history: (limit = 60) => request(`/api/history?limit=${limit}`),
  latest: () => request('/api/history/latest'),
  analysis: (id) => request(`/api/history/${encodeURIComponent(id)}`),
  deleteAnalysis: (id) => request(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  clearHistory: () => request('/api/history', { method: 'DELETE' }),
  saveViz: (id, viz) => request(`/api/history/${encodeURIComponent(id)}/viz`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(viz) }),
  dekerf: () => request('/api/results/dekerf'),
  comparison: () => request('/api/results/comparison'),
  benchmark: () => request('/api/results/benchmark'),
  summary: () => request('/api/results/summary'),
  history_: (id) => request(`/api/results/history/${encodeURIComponent(id)}`),

  geocode: (query) =>
  request(`/api/geocode?query=${encodeURIComponent(query)}`),

marine: (latitude, longitude) =>
  request(
    `/api/marine?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`
  )
}
