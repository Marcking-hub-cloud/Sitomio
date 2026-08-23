import { useEffect, useRef } from 'react'

export function useTypewriter(elementRef, phrases, startDelay = 1600) {
  const stateRef = useRef({ phraseIdx: 0, charIdx: 0, isDeleting: false, pauseTimer: 0 })
  const timerRef = useRef(null)

  useEffect(() => {
    const el = elementRef.current
    if (!el) return

    const state = stateRef.current

    function typewrite() {
      const current = phrases[state.phraseIdx]

      if (!state.isDeleting) {
        el.textContent = current.substring(0, state.charIdx + 1)
        state.charIdx++
        if (state.charIdx === current.length) {
          state.pauseTimer = 40
          state.isDeleting = true
        }
      } else {
        if (state.pauseTimer > 0) {
          state.pauseTimer--
          timerRef.current = setTimeout(typewrite, 50)
          return
        }
        el.textContent = current.substring(0, state.charIdx - 1)
        state.charIdx--
        if (state.charIdx === 0) {
          state.isDeleting = false
          state.phraseIdx = (state.phraseIdx + 1) % phrases.length
        }
      }

      const speed = state.isDeleting ? 30 : 55
      timerRef.current = setTimeout(typewrite, speed)
    }

    const startTimer = setTimeout(typewrite, startDelay)

    return () => {
      clearTimeout(startTimer)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [elementRef, phrases, startDelay])
}
