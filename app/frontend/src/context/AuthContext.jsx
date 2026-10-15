import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'

const AuthContext = createContext(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

export function useOptionalAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(null)

  const refreshSession = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.session()
      setUser(result.user)
      setSessionError(null)
    } catch (error) {
      setUser(null)
      setSessionError(error instanceof ApiError && error.status === 401 ? null : error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshSession() }, [refreshSession])

  const login = useCallback(async (credentials) => {
    const result = await api.login(credentials)
    setUser(result.user)
    setSessionError(null)
    return result.user
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, sessionError, login, logout, refreshSession }),
    [user, loading, sessionError, login, logout, refreshSession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
