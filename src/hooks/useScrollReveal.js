import { useEffect } from 'react'

export function useScrollReveal() {
  useEffect(() => {
    const elements = document.querySelectorAll('[data-aos]')

    function revealOnScroll() {
      elements.forEach((el, index) => {
        const rect = el.getBoundingClientRect()
        if (rect.top < window.innerHeight - 60) {
          setTimeout(() => el.classList.add('visible'), index * 80)
        }
      })
    }

    window.addEventListener('scroll', revealOnScroll)
    revealOnScroll()

    return () => window.removeEventListener('scroll', revealOnScroll)
  }, [])
}
