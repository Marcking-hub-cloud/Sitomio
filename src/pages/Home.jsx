import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import EasterEggCat from '../components/EasterEggCat'
import { useTypewriter } from '../hooks/useTypewriter'

const PHRASES = [
  'exploring organic reaction mechanisms.',
  'fascinated by spectrophotometry.',
  'curious about enzyme kinetics.',
  'decoding molecules with UV-Vis.',
  'diving into biochemistry.',
  'turning coffee into lab reports.',
]

export default function Home() {
  const rotatingRef = useRef(null)
  const heroTiltRef = useRef(null)
  const [emailRevealed, setEmailRevealed] = useState(false)
  const [emailText, setEmailText] = useState('Contact')
  const [showToast, setShowToast] = useState(false)

  useTypewriter(rotatingRef, PHRASES, 1600)

  // Hero parallax tilt
  useEffect(() => {
    const tilt = heroTiltRef.current
    if (!tilt || !window.matchMedia('(pointer: fine)').matches) return

    const onMove = e => {
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const dx = (e.clientX - cx) / cx
      const dy = (e.clientY - cy) / cy
      tilt.style.transform = `translate(${dx * 6}px, ${dy * 4}px)`
    }
    const onLeave = () => { tilt.style.transform = '' }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Cursor glow
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    const glow = document.createElement('div')
    glow.style.cssText = `
      position:fixed;width:400px;height:400px;border-radius:50%;
      background:radial-gradient(circle,rgba(129,140,248,0.06) 0%,transparent 70%);
      pointer-events:none;z-index:0;transform:translate(-50%,-50%);
      transition:opacity 0.3s ease;
    `
    document.body.appendChild(glow)
    const onMove = e => { glow.style.left = e.clientX + 'px'; glow.style.top = e.clientY + 'px' }
    document.addEventListener('mousemove', onMove)
    return () => { document.removeEventListener('mousemove', onMove); glow.remove() }
  }, [])

  // Magnetic buttons
  useEffect(() => {
    const btns = document.querySelectorAll('.btn-primary, .btn-secondary')
    const handlers = []
    btns.forEach(btn => {
      const onMove = e => {
        const rect = btn.getBoundingClientRect()
        const x = e.clientX - rect.left - rect.width / 2
        const y = e.clientY - rect.top - rect.height / 2
        btn.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px)`
      }
      const onLeave = () => { btn.style.transform = '' }
      btn.addEventListener('mousemove', onMove)
      btn.addEventListener('mouseleave', onLeave)
      handlers.push({ btn, onMove, onLeave })
    })
    return () => {
      handlers.forEach(({ btn, onMove, onLeave }) => {
        btn.removeEventListener('mousemove', onMove)
        btn.removeEventListener('mouseleave', onLeave)
      })
    }
  }, [])

  const handleEmail = () => {
    const email = 'marco.strada2@studenti.unimi.it'
    if (!emailRevealed) {
      setEmailText(email)
      setEmailRevealed(true)
    } else {
      navigator.clipboard.writeText(email).then(() => {
        setShowToast(true)
        setEmailText('Copied!')
        setTimeout(() => { setEmailText(email); setShowToast(false) }, 2000)
      })
    }
  }

  return (
    <>
      <ThemeToggle />
      <EasterEggCat />

      <header id="hero" className="fullscreen-hero">
        <div className="hero-content" id="hero-tilt" ref={heroTiltRef}>
          <div className="hero-badge">
            <span className="badge-dot"></span>
            University of Milan — Department of Chemistry
          </div>

          <h1 className="hero-title" style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
            <span className="line line-1">Marco</span>
            <span className="line line-2">Strada</span>
          </h1>

          <p className="hero-subtitle">
            B.Sc. student in Chemistry —{' '}
            <span ref={rotatingRef} className="rotating-text"></span>
            <span className="cursor-blink">|</span>
          </p>

          <div className="hero-actions">
            <Link to="/resume" className="btn-secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8M16 17H8M10 9H8" />
              </svg>
              Resume
            </Link>

            <a href="https://www.linkedin.com/in/marco-strada-556180340/" target="_blank" rel="noopener" className="btn-secondary">
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              LinkedIn
            </a>

            <button type="button" id="email-reveal-btn" className="btn-secondary" onClick={handleEmail}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 4L12 13 2 4" />
              </svg>
              <span id="email-text">{emailText}</span>
            </button>

            <Link to="/motorbike" className="btn-secondary btn-square" aria-label="Motorbike adventures">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="18.5" cy="17.5" r="3.5" />
                <path d="M15 6h2l3 5h-4" />
                <path d="M5.5 17.5h4l2-5H7l-2 3" />
                <path d="M11.5 12.5L13 8h3" />
              </svg>
            </Link>
          </div>

          <div className="status-bar">
            <div className="status-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>Milan, Italy</span>
            </div>
            <div className="status-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <span id="status-activity">Studying for finals</span>
            </div>
          </div>

          <div id="email-toast" className={`email-toast${showToast ? ' show' : ''}`}>
            <span>Copied to clipboard!</span>
          </div>
        </div>

        <div className="scroll-indicator">
          <div className="scroll-line"></div>
        </div>
      </header>
    </>
  )
}
