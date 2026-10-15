import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ThemeToggle from '../components/ThemeToggle'
import { ThemeProvider } from '../context/ThemeContext'

afterEach(() => {
  cleanup()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('theme selection', () => {
  it('persists the selected theme and exposes the next action accessibly', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('petrovision.theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Switch to light theme' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('petrovision.theme')).toBe('light')
  })
})
