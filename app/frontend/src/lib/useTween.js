import { useEffect, useRef, useState } from 'react'

/** Smoothly tweens a displayed number toward `value` (display only - the real value is untouched). */
export function useTween(value, ms = 420, disabled = false) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (value === null || value === undefined || disabled) { setShown(value); from.current = value; return undefined }
    const start = performance.now()
    const a = from.current ?? value
    let raf
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms)
      const v = a + (value - a) * (1 - (1 - k) ** 3)
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms, disabled])
  return shown
}
