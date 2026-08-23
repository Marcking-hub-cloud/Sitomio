import { useEffect, useRef } from 'react'

export function useMolecularCanvas(canvasRef) {
  const mouseRef = useRef({ x: null, y: null })
  const animIdRef = useRef(null)
  const particlesRef = useRef([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const mouse = mouseRef.current

    const CONNECT_DIST = 130
    const GRID_SIZE = CONNECT_DIST

    function resizeCanvas() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width
        this.y = Math.random() * canvas.height
        this.baseSize = Math.random() * 2 + 0.5
        this.size = this.baseSize
        this.speedX = (Math.random() - 0.5) * 0.4
        this.speedY = (Math.random() - 0.5) * 0.4
        this.baseOpacity = Math.random() * 0.5 + 0.1
        this.opacity = this.baseOpacity
      }

      update() {
        this.x += this.speedX
        this.y += this.speedY
        if (this.x > canvas.width) this.x = 0
        if (this.x < 0) this.x = canvas.width
        if (this.y > canvas.height) this.y = 0
        if (this.y < 0) this.y = canvas.height

        if (mouse.x !== null) {
          const dx = this.x - mouse.x
          const dy = this.y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const WARP_RADIUS = 200
          if (dist < WARP_RADIUS) {
            const force = (WARP_RADIUS - dist) / WARP_RADIUS
            this.x += dx * force * 0.05
            this.y += dy * force * 0.05
            this.size = this.baseSize + force * 3
            this.opacity = Math.min(1, this.baseOpacity + force * 0.6)
          } else {
            this.size += (this.baseSize - this.size) * 0.1
            this.opacity += (this.baseOpacity - this.opacity) * 0.1
          }
        } else {
          this.size += (this.baseSize - this.size) * 0.1
          this.opacity += (this.baseOpacity - this.opacity) * 0.1
        }
      }

      draw() {
        ctx.fillStyle = `rgba(129, 140, 248, ${this.opacity})`
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    function initParticles() {
      particlesRef.current = []
      const count = Math.min(Math.floor((canvas.width * canvas.height) / 4000), 300)
      for (let i = 0; i < count; i++) {
        particlesRef.current.push(new Particle())
      }
    }

    function drawConnections() {
      const particles = particlesRef.current
      const cols = Math.ceil(canvas.width / GRID_SIZE) + 1
      const rows = Math.ceil(canvas.height / GRID_SIZE) + 1
      const grid = new Array(cols * rows)

      for (let i = 0; i < particles.length; i++) {
        const col = Math.floor(particles[i].x / GRID_SIZE)
        const row = Math.floor(particles[i].y / GRID_SIZE)
        const idx = row * cols + col
        if (!grid[idx]) grid[idx] = []
        grid[idx].push(i)
      }

      const distSq = CONNECT_DIST * CONNECT_DIST
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = grid[row * cols + col]
          if (!cell) continue
          const neighbors = [
            [row, col], [row, col + 1],
            [row + 1, col - 1], [row + 1, col], [row + 1, col + 1],
          ]
          for (const [nr, nc] of neighbors) {
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
            const neighbor = grid[nr * cols + nc]
            if (!neighbor) continue
            const sameCell = (nr === row && nc === col)
            for (let a = 0; a < cell.length; a++) {
              const startB = sameCell ? a + 1 : 0
              for (let b = startB; b < neighbor.length; b++) {
                const p1 = particles[cell[a]]
                const p2 = particles[neighbor[b]]
                const dx = p1.x - p2.x
                const dy = p1.y - p2.y
                const d2 = dx * dx + dy * dy
                if (d2 < distSq) {
                  const opacity = (1 - Math.sqrt(d2) / CONNECT_DIST) * 0.12
                  ctx.strokeStyle = `rgba(129, 140, 248, ${opacity})`
                  ctx.lineWidth = 0.5
                  ctx.beginPath()
                  ctx.moveTo(p1.x, p1.y)
                  ctx.lineTo(p2.x, p2.y)
                  ctx.stroke()
                }
              }
            }
          }
        }
      }
    }

    function animateCanvas() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (mouse.x !== null) {
        const glow = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 200)
        glow.addColorStop(0, 'rgba(129, 140, 248, 0.08)')
        glow.addColorStop(0.5, 'rgba(129, 140, 248, 0.03)')
        glow.addColorStop(1, 'rgba(129, 140, 248, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(mouse.x - 200, mouse.y - 200, 400, 400)
      }
      particlesRef.current.forEach(p => { p.update(); p.draw() })
      drawConnections()
      animIdRef.current = requestAnimationFrame(animateCanvas)
    }

    resizeCanvas()
    initParticles()
    animateCanvas()

    const onResize = () => { resizeCanvas(); initParticles() }
    const onMouseMove = e => { mouse.x = e.clientX; mouse.y = e.clientY }
    const onMouseLeave = () => { mouse.x = null; mouse.y = null }
    const onTouchStart = e => { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY }
    const onTouchMove = e => { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY }
    const onTouchEnd = () => { setTimeout(() => { mouse.x = null; mouse.y = null }, 500) }

    window.addEventListener('resize', onResize)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true, capture: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true })

    return () => {
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      document.removeEventListener('touchstart', onTouchStart, { capture: true })
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      document.removeEventListener('touchend', onTouchEnd, { capture: true })
    }
  }, [canvasRef])
}
