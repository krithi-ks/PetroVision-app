import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      aria-pressed={theme === 'dark'}
      onClick={toggleTheme}
      className={`flex h-9 items-center gap-2 rounded border border-line-strong bg-surface px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-2 transition hover:border-accent hover:text-accent ${className}`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '◐'}</span>
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  )
}
