import { useState, useEffect } from 'react'

// ─── BEARD HISTORY LOG ───────────────────────────────────────────────────────
// This is the sacred chronicle of Marco's facial hair situation.
// To update: add a new entry at the TOP of the array (most recent first).
// Status options: 'niente' | 'stubble' | 'incipiente' | 'maestosa' | 'rip'

const BEARD_HISTORY = [
  {
    date: '2026-08-23',
    status: 'niente',
    level: 0,
    title: 'Anno Zero',
    desc: 'Nessuna barba. Il viso è liscio come il coperchio di una petri dish. La situazione è critica ma stabile.',
    emoji: '🪒',
    diagnosis: 'Viso clinicamente privo di pelo. Continuare a monitorare.',
  },
]

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  niente:     { label: 'Assente',    color: '#f472b6', bar: 0,   icon: '🪒', severity: 'CRITICO' },
  stubble:    { label: 'Stubble',    color: '#fbbf24', bar: 25,  icon: '🌱', severity: 'STABILE' },
  incipiente: { label: 'Incipiente', color: '#34d399', bar: 55,  icon: '🌿', severity: 'PROMETTENTE' },
  maestosa:   { label: 'Maestosa',   color: '#818cf8', bar: 90,  icon: '🧔', severity: 'ECCELLENTE' },
  rip:        { label: 'Rasata RIP', color: '#f472b6', bar: 0,   icon: '💀', severity: 'LUTTO' },
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function daysSince(dateStr) {
  const then = new Date(dateStr)
  const now = new Date()
  return Math.floor((now - then) / (1000 * 60 * 60 * 24))
}

function getStreak() {
  // Days since the oldest continuous "niente" streak
  const current = BEARD_HISTORY[0]
  if (current.status !== 'niente') return null
  const days = daysSince(current.date)
  return days
}

export default function Barba() {
  const [tick, setTick] = useState(0)
  const [showEasterEgg, setShowEasterEgg] = useState(false)
  const [clickCount, setClickCount] = useState(0)

  const current = BEARD_HISTORY[0]
  const cfg = STATUS_CONFIG[current.status]
  const days = daysSince(current.date)
  const streak = getStreak()

  // Subtle blinking cursor effect
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Easter egg: click the emoji 5 times
  const handleEmojiClick = () => {
    const next = clickCount + 1
    setClickCount(next)
    if (next >= 5) { setShowEasterEgg(true); setClickCount(0) }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Inter',sans-serif;background:#09090b;color:#a1a1aa;min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
        ::selection{background:rgba(129,140,248,.2);color:#818cf8}

        .barba-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:40px clamp(20px,5vw,48px) 80px}

        /* ── Header ── */
        .barba-header{width:100%;max-width:700px;margin-bottom:48px;text-align:center}
        .barba-lab-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 16px;background:rgba(244,114,182,.08);border:1px solid rgba(244,114,182,.2);border-radius:100px;font-family:'JetBrains Mono',monospace;font-size:.6875rem;font-weight:500;color:#f472b6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:24px}
        .blink{animation:blink 1s step-end infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        .barba-title{font-size:clamp(2rem,5vw,3.25rem);font-weight:700;color:#fafafa;letter-spacing:-.03em;line-height:1.1;margin-bottom:12px}
        .barba-title span{background:linear-gradient(135deg,#f472b6,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .barba-subtitle{font-size:.9375rem;color:#63636e;max-width:480px;margin:0 auto;line-height:1.7}

        /* ── Status Card ── */
        .status-card{width:100%;max-width:700px;background:#16161a;border:1px solid rgba(255,255,255,.06);border-radius:24px;padding:40px;margin-bottom:24px;position:relative;overflow:hidden}
        .status-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${cfg.color},transparent)}
        .status-card-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:32px;gap:20px}
        .status-severity{font-family:'JetBrains Mono',monospace;font-size:.6875rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;padding:4px 12px;border-radius:6px;border:1px solid;color:${cfg.color};background:${cfg.color}18;border-color:${cfg.color}33}
        .status-date{font-family:'JetBrains Mono',monospace;font-size:.6875rem;color:#3f3f46}
        .status-emoji{font-size:5rem;line-height:1;cursor:pointer;user-select:none;transition:transform .2s cubic-bezier(.34,1.56,.64,1);text-align:center;margin-bottom:16px}
        .status-emoji:hover{transform:scale(1.15) rotate(-8deg)}
        .status-emoji:active{transform:scale(.92)}
        .status-main{text-align:center;margin-bottom:32px}
        .status-label-row{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:8px}
        .status-label{font-size:1.75rem;font-weight:700;color:#fafafa;letter-spacing:-.02em}
        .status-dot{width:10px;height:10px;border-radius:50%;background:${cfg.color};box-shadow:0 0 10px ${cfg.color}88;animation:statusPulse 2s ease-in-out infinite}
        @keyframes statusPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.6}}
        .status-diagnosis{font-size:.875rem;color:#63636e;line-height:1.6;max-width:440px;margin:0 auto}

        /* ── Beard Level Bar ── */
        .beard-level{margin-bottom:32px}
        .beard-level-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
        .beard-level-label{font-family:'JetBrains Mono',monospace;font-size:.6875rem;text-transform:uppercase;letter-spacing:.1em;color:#3f3f46}
        .beard-level-pct{font-family:'JetBrains Mono',monospace;font-size:.875rem;font-weight:700;color:${cfg.color}}
        .beard-bar-track{width:100%;height:8px;background:rgba(255,255,255,.04);border-radius:100px;overflow:hidden}
        .beard-bar-fill{height:100%;width:${cfg.bar}%;background:linear-gradient(90deg,${cfg.color}88,${cfg.color});border-radius:100px;transition:width 1.5s cubic-bezier(.16,1,.3,1)}
        .beard-ticks{display:flex;justify-content:space-between;margin-top:8px;padding:0 2px}
        .beard-tick{font-size:.625rem;color:#27272a;font-family:'JetBrains Mono',monospace}

        /* ── Stats Row ── */
        .stats-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
        .stat-box{background:#111113;border:1px solid rgba(255,255,255,.04);border-radius:12px;padding:16px;text-align:center}
        .stat-box-value{font-family:'JetBrains Mono',monospace;font-size:1.5rem;font-weight:700;color:#fafafa;margin-bottom:4px}
        .stat-box-label{font-size:.6875rem;text-transform:uppercase;letter-spacing:.08em;color:#3f3f46}

        /* ── History ── */
        .history-section{width:100%;max-width:700px;margin-bottom:24px}
        .section-title{font-family:'JetBrains Mono',monospace;font-size:.6875rem;text-transform:uppercase;letter-spacing:.12em;color:#3f3f46;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.04)}
        .history-list{display:flex;flex-direction:column;gap:2px}
        .history-item{display:flex;align-items:flex-start;gap:20px;padding:16px;border-radius:10px;transition:background .2s ease}
        .history-item:hover{background:rgba(255,255,255,.02)}
        .history-date{font-family:'JetBrains Mono',monospace;font-size:.6875rem;color:#27272a;min-width:90px;padding-top:2px;white-space:nowrap}
        .history-emoji-sm{font-size:1.125rem;flex-shrink:0;margin-top:-2px}
        .history-content h4{font-size:.875rem;font-weight:600;color:#a1a1aa;margin-bottom:2px}
        .history-content p{font-size:.8125rem;color:#3f3f46;line-height:1.5}

        /* ── Footer ── */
        .barba-footer{width:100%;max-width:700px;text-align:center;padding-top:24px;border-top:1px solid rgba(255,255,255,.04)}
        .barba-footer p{font-family:'JetBrains Mono',monospace;font-size:.6875rem;color:#27272a;line-height:1.8}
        .barba-footer a{color:#3f3f46;transition:color .2s ease}
        .barba-footer a:hover{color:#63636e}

        /* ── Easter Egg ── */
        .easter-overlay{position:fixed;inset:0;background:rgba(9,9,11,.96);z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;animation:fadeIn .4s ease}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .easter-title{font-size:4rem;margin-bottom:16px}
        .easter-msg{font-size:1.5rem;font-weight:700;color:#fafafa;margin-bottom:8px}
        .easter-sub{font-size:.9375rem;color:#63636e;margin-bottom:32px}
        .easter-close{background:none;border:1px solid rgba(255,255,255,.1);color:#a1a1aa;padding:10px 24px;border-radius:10px;cursor:pointer;font-family:'Inter',sans-serif;font-size:.875rem;transition:all .2s ease}
        .easter-close:hover{border-color:rgba(255,255,255,.2);color:#fafafa}

        @media(max-width:600px){
          .stats-row{grid-template-columns:1fr 1fr}
          .stats-row .stat-box:last-child{grid-column:1/-1}
          .status-card{padding:28px 20px}
          .status-emoji{font-size:3.5rem}
        }
      `}</style>

      {showEasterEgg && (
        <div className="easter-overlay">
          <div className="easter-title">🪒✨</div>
          <p className="easter-msg">Hai trovato l'easter egg!</p>
          <p className="easter-sub">Purtroppo non sblocca la barba di Marco.<br/>Non funziona così.</p>
          <button className="easter-close" onClick={() => setShowEasterEgg(false)}>
            Capito, purtroppo.
          </button>
        </div>
      )}

      <main className="barba-page">
        {/* Header */}
        <header className="barba-header">
          <div className="barba-lab-badge">
            <span className="blink">●</span>
            LIVE — Ultimo aggiornamento: {current.date}
          </div>
          <h1 className="barba-title">
            Beard <span>Status</span> Monitor
          </h1>
          <p className="barba-subtitle">
            Il portale di monitoraggio in tempo reale della situazione pilifera facciale di Marco Strada.
            Dati aggiornati con cadenza irregolare e altamente soggettiva.
          </p>
        </header>

        {/* Main Status Card */}
        <section className="status-card">
          <div className="status-card-header">
            <span className="status-severity">{cfg.severity}</span>
            <span className="status-date">UPDATE #{String(BEARD_HISTORY.length).padStart(3, '0')} · {current.date}</span>
          </div>

          <div
            className="status-emoji"
            onClick={handleEmojiClick}
            title="Clicca 5 volte..."
          >
            {cfg.icon}
          </div>

          <div className="status-main">
            <div className="status-label-row">
              <span className="status-dot"></span>
              <span className="status-label">{current.title}</span>
            </div>
            <p className="status-diagnosis">{current.diagnosis}</p>
          </div>

          {/* Beard level bar */}
          <div className="beard-level">
            <div className="beard-level-header">
              <span className="beard-level-label">Livello Barba</span>
              <span className="beard-level-pct">{cfg.bar}%</span>
            </div>
            <div className="beard-bar-track">
              <div className="beard-bar-fill"></div>
            </div>
            <div className="beard-ticks">
              <span className="beard-tick">🪒</span>
              <span className="beard-tick">🌱</span>
              <span className="beard-tick">🌿</span>
              <span className="beard-tick">🧔</span>
            </div>
          </div>

          {/* Stats */}
          <div className="stats-row">
            <div className="stat-box">
              <div className="stat-box-value">{cfg.bar}%</div>
              <div className="stat-box-label">Copertura</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-value">{streak !== null ? `${streak}g` : 'N/A'}</div>
              <div className="stat-box-label">Streak no-barba</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-value">{BEARD_HISTORY.length}</div>
              <div className="stat-box-label">Aggiornamenti</div>
            </div>
          </div>
        </section>

        {/* Current detailed report */}
        <section className="history-section">
          <p className="section-title">🔬 Report clinico attuale</p>
          <div style={{ background: '#16161a', border: '1px solid rgba(255,255,255,.06)', borderRadius: 16, padding: '24px 28px' }}>
            <p style={{ fontSize: '.9375rem', lineHeight: 1.8, color: '#63636e' }}>{current.desc}</p>
          </div>
        </section>

        {/* History */}
        {BEARD_HISTORY.length > 1 && (
          <section className="history-section">
            <p className="section-title">📋 Storico aggiornamenti</p>
            <div className="history-list">
              {BEARD_HISTORY.map((entry, i) => {
                const c = STATUS_CONFIG[entry.status]
                return (
                  <div key={i} className="history-item">
                    <span className="history-date">{entry.date}</span>
                    <span className="history-emoji-sm">{c.icon}</span>
                    <div className="history-content">
                      <h4>{entry.title} — <span style={{ color: c.color }}>{c.label}</span></h4>
                      <p>{entry.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="barba-footer">
          <p>
            Beard Status Monitor™ — Un progetto inutile ma sincero<br />
            Nessun pelo è stato maltrattato nella creazione di questo sito<br />
            <a href="https://www.fda.gov" target="_blank" rel="noopener">Non approvato dalla FDA</a>
            {' · '}
            <a href="https://www.who.int" target="_blank" rel="noopener">Non approvato dall&apos;OMS</a>
            {' · '}
            Non approvato neanche da Marco
          </p>
        </footer>
      </main>
    </>
  )
}
