import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'

// ─── Game Definitions (ported from games.js) ─────────────────────────────────

function createSnakeGame(canvas, ctx, onGameOver) {
  const GRID = 20
  const W = 600, H = 600
  let snake, dx, dy, nextDx, nextDy, score, food, tickRate, lastTick, loopId

  function spawnFood() {
    food = {
      x: Math.round((Math.random() * (W - GRID)) / GRID) * GRID,
      y: Math.round((Math.random() * (H - GRID)) / GRID) * GRID,
    }
  }

  function reset() {
    snake = [{ x: 300, y: 300 }, { x: 280, y: 300 }, { x: 260, y: 300 }]
    dx = GRID; dy = 0; nextDx = GRID; nextDy = 0; score = 0; tickRate = 100
    spawnFood()
  }

  function draw() {
    ctx.fillStyle = '#111113'; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 1
    for (let i = 0; i < W; i += GRID) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke()
    }
    ctx.fillStyle = '#f472b6'; ctx.shadowBlur = 10; ctx.shadowColor = '#f472b6'
    ctx.fillRect(food.x, food.y, GRID - 1, GRID - 1); ctx.shadowBlur = 0
    snake.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#818cf8' : '#6366f1'
      ctx.fillRect(p.x, p.y, GRID - 1, GRID - 1)
    })
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '20px JetBrains Mono'
    ctx.fillText(`SCORE: ${score}`, 10, 30)
  }

  function update() {
    dx = nextDx; dy = nextDy
    const head = { x: snake[0].x + dx, y: snake[0].y + dy }
    if (head.x < 0 || head.x >= W || head.y < 0 || head.y >= H) return onGameOver(score, 'snake')
    for (const p of snake) if (p.x === head.x && p.y === head.y) return onGameOver(score, 'snake')
    snake.unshift(head)
    if (head.x === food.x && head.y === food.y) {
      score += 10; tickRate = Math.max(40, tickRate - 2); spawnFood()
    } else { snake.pop() }
  }

  function loop(time) {
    if (time - lastTick > tickRate) { update(); draw(); lastTick = time }
    loopId = requestAnimationFrame(loop)
  }

  function onKey(e) {
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault()
    const goR = dx === GRID, goL = dx === -GRID, goU = dy === -GRID, goD = dy === GRID
    if (e.key === 'ArrowLeft' && !goR) { nextDx = -GRID; nextDy = 0 }
    if (e.key === 'ArrowRight' && !goL) { nextDx = GRID; nextDy = 0 }
    if (e.key === 'ArrowUp' && !goD) { nextDx = 0; nextDy = -GRID }
    if (e.key === 'ArrowDown' && !goU) { nextDx = 0; nextDy = GRID }
  }

  return {
    title: 'Snake Classic', width: W, height: H,
    controlsHtml: '<p>Use <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> to move.</p>',
    init() { reset(); draw() },
    start() {
      reset(); lastTick = performance.now()
      window.addEventListener('keydown', onKey)
      loopId = requestAnimationFrame(loop)
    },
    stop() {
      if (loopId) cancelAnimationFrame(loopId)
      window.removeEventListener('keydown', onKey)
    },
  }
}

function createPongGame(canvas, ctx, onGameOver) {
  const W = 800, H = 500
  const PAD_W = 10, PAD_H = 80, BALL_R = 5, PAD_SPEED = 6, TARGET = 5
  let p1, p2, ball, loopId

  function resetBall() {
    const angle = (Math.random() * Math.PI / 2) - Math.PI / 4
    const dir = Math.random() > 0.5 ? 1 : -1
    ball = { x: W / 2, y: H / 2, speed: 5, dx: dir * 5 * Math.cos(angle), dy: 5 * Math.sin(angle) }
  }

  function reset() {
    p1 = { y: H / 2 - PAD_H / 2, score: 0, up: false, down: false }
    p2 = { y: H / 2 - PAD_H / 2, score: 0, up: false, down: false }
    resetBall()
  }

  function draw() {
    ctx.fillStyle = '#111113'; ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.setLineDash([10, 15])
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '72px JetBrains Mono'; ctx.textAlign = 'center'
    ctx.fillText(p1.score, W / 4, 100); ctx.fillText(p2.score, 3 * W / 4, 100); ctx.textAlign = 'left'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#818cf8'; ctx.shadowColor = '#818cf8'
    ctx.fillRect(30, p1.y, PAD_W, PAD_H)
    ctx.fillStyle = '#f472b6'; ctx.shadowColor = '#f472b6'
    ctx.fillRect(W - 30 - PAD_W, p2.y, PAD_W, PAD_H)
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
  }

  function update() {
    if (p1.up) p1.y -= PAD_SPEED; if (p1.down) p1.y += PAD_SPEED
    if (p2.up) p2.y -= PAD_SPEED; if (p2.down) p2.y += PAD_SPEED
    p1.y = Math.max(0, Math.min(H - PAD_H, p1.y))
    p2.y = Math.max(0, Math.min(H - PAD_H, p2.y))
    ball.x += ball.dx; ball.y += ball.dy
    if (ball.y - BALL_R <= 0 || ball.y + BALL_R >= H) ball.dy *= -1
    const hitP1 = ball.x - BALL_R <= 30 + PAD_W && ball.x >= 30 && ball.y >= p1.y && ball.y <= p1.y + PAD_H
    const hitP2 = ball.x + BALL_R >= W - 30 - PAD_W && ball.x <= W - 30 && ball.y >= p2.y && ball.y <= p2.y + PAD_H
    if (hitP1 || hitP2) {
      ball.dx *= -1; ball.speed += 0.5
      const padY = hitP1 ? p1.y : p2.y
      const hitPos = (ball.y - (padY + PAD_H / 2)) / (PAD_H / 2)
      ball.dy = hitPos * ball.speed
      const len = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy)
      ball.dx = (ball.dx / len) * ball.speed; ball.dy = (ball.dy / len) * ball.speed
      if (hitP1) ball.x = 30 + PAD_W + BALL_R
      if (hitP2) ball.x = W - 30 - PAD_W - BALL_R
    }
    if (ball.x < 0) { p2.score++; checkWin() }
    else if (ball.x > W) { p1.score++; checkWin() }
  }

  let winCallback = null
  function checkWin() {
    if (p1.score >= TARGET || p2.score >= TARGET) {
      const winner = p1.score >= TARGET ? 'Player 1' : 'Player 2'
      if (loopId) cancelAnimationFrame(loopId)
      if (winCallback) winCallback(winner, p1.score, p2.score)
    } else { resetBall() }
  }

  function loop() { update(); draw(); loopId = requestAnimationFrame(loop) }

  function onKey(e, isDown) {
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
    const k = e.key.toLowerCase()
    if (k === 'w') p1.up = isDown; if (k === 's') p1.down = isDown
    if (k === 'arrowup') p2.up = isDown; if (k === 'arrowdown') p2.down = isDown
  }

  return {
    title: 'Neon Pong', width: W, height: H,
    controlsHtml: `<div style='display:flex;gap:40px;justify-content:center'><div><b>Player 1</b><br><kbd>W</kbd> Up <kbd>S</kbd> Down</div><div><b>Player 2</b><br><kbd>↑</kbd> Up <kbd>↓</kbd> Down</div></div><p style='margin-top:16px;font-size:0.8em;color:var(--text-muted)'>First to 5 points wins.</p>`,
    setWinCallback(cb) { winCallback = cb },
    init() { reset(); draw() },
    start() {
      reset()
      window.addEventListener('keydown', e => onKey(e, true))
      window.addEventListener('keyup', e => onKey(e, false))
      loopId = requestAnimationFrame(loop)
    },
    stop() { if (loopId) cancelAnimationFrame(loopId) },
  }
}

function createMemoryGame(canvas, ctx, onGameOver) {
  const W = 800, H = 500
  const EMOJIS = ['🔬', '🧬', '⚛️', '🧪', '🔭', '🪐', '🛸', '🛰️']
  const CARD_W = 80, CARD_H = 100, GAP = 16, COLS = 4, ROWS = 4
  let grid, flipped, matched, moves, canClick, offsetX, offsetY

  function resetState() {
    moves = 0; matched = 0; flipped = []; canClick = true
    let deck = [...EMOJIS, ...EMOJIS]
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]]
    }
    const totalW = COLS * CARD_W + (COLS - 1) * GAP
    const totalH = ROWS * CARD_H + (ROWS - 1) * GAP
    offsetX = (W - totalW) / 2; offsetY = (H - totalH) / 2 + 20
    grid = []
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      grid.push({ emoji: deck[r * COLS + c], x: offsetX + c * (CARD_W + GAP), y: offsetY + r * (CARD_H + GAP), state: 'hidden' })
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
  }

  function draw() {
    ctx.fillStyle = '#111113'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '20px JetBrains Mono'; ctx.textAlign = 'left'
    ctx.fillText(`MOVES: ${moves}`, 20, 30)
    for (const c of grid) {
      if (c.state === 'hidden') {
        ctx.fillStyle = '#16161a'; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2
        roundRect(c.x, c.y, CARD_W, CARD_H, 8); ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(c.x + 10, c.y + 10, CARD_W - 20, CARD_H - 20)
      } else {
        ctx.fillStyle = c.state === 'matched' ? 'rgba(52,211,153,0.1)' : '#1c1c21'
        ctx.strokeStyle = c.state === 'matched' ? '#34d399' : '#818cf8'; ctx.lineWidth = 2
        roundRect(c.x, c.y, CARD_W, CARD_H, 8); ctx.fill(); ctx.stroke()
        ctx.font = '40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(c.emoji, c.x + CARD_W / 2, c.y + CARD_H / 2 + 4)
      }
    }
    ctx.textBaseline = 'alphabetic'
  }

  let clickHandler = null

  return {
    title: 'Synapse Match', width: W, height: H,
    controlsHtml: '<p>Click a card to flip it. Match all pairs in the fewest moves.</p>',
    init() { resetState(); draw(); canvas.onclick = null },
    start() {
      resetState(); draw()
      clickHandler = e => {
        if (!canClick) return
        const rect = canvas.getBoundingClientRect()
        const scaleX = W / rect.width, scaleY = H / rect.height
        const cx = (e.clientX - rect.left) * scaleX
        const cy = (e.clientY - rect.top) * scaleY
        for (const card of grid) {
          if (card.state === 'hidden' && cx >= card.x && cx <= card.x + CARD_W && cy >= card.y && cy <= card.y + CARD_H) {
            card.state = 'flipped'; flipped.push(card); draw()
            if (flipped.length === 2) {
              moves++; canClick = false
              setTimeout(() => {
                if (flipped[0].emoji === flipped[1].emoji) {
                  flipped[0].state = 'matched'; flipped[1].state = 'matched'; matched += 2
                  if (matched === grid.length) {
                    canvas.onclick = null
                    onGameOver(Math.max(0, 1000 - moves * 20), 'memory')
                  }
                } else { flipped[0].state = 'hidden'; flipped[1].state = 'hidden' }
                flipped = []; canClick = true; draw()
              }, 800)
            }
            break
          }
        }
      }
      canvas.onclick = clickHandler
    },
    stop() { canvas.onclick = null },
  }
}

function createRacerGame(canvas, ctx, onGameOver) {
  const W = 800, H = 500
  const SEG_LEN = 200, CAM_H = 1000, CAM_DEPTH = 1, DRAW_DIST = 300, ROAD_W = 2000
  let position, playerX, speed, maxSpeed, segments, keys, lastTime, score, speedFactor, loopId

  function buildRoad() {
    segments = []
    for (let n = 0; n < 5000; n++) {
      const isDark = Math.floor(n / 3) % 2 === 0
      const seg = {
        p1: { world: { z: n * SEG_LEN }, camera: {}, screen: {} },
        p2: { world: { z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
        color: isDark ? { road: '#1e1e24', grass: '#09090b', rumble: '#818cf8' }
                      : { road: '#2a2a35', grass: '#111113', rumble: '#fafafa' },
        sprites: []
      }
      if (n > 50 && Math.random() < 0.02) seg.sprites.push({ x: Math.random() * 2 - 1, width: 300, color: '#f472b6' })
      segments.push(seg)
    }
  }

  function project(p, camX, camY, camZ) {
    p.camera.x = (p.world.x || 0) - camX
    p.camera.y = (p.world.y || 0) - camY
    p.camera.z = (p.world.z || 0) - camZ
    if (p.camera.z === 0) p.camera.z = 1
    p.screen.scale = CAM_DEPTH / p.camera.z
    p.screen.x = Math.round((W / 2) + p.screen.scale * p.camera.x * W / 2)
    p.screen.y = Math.round((H / 2) - p.screen.scale * p.camera.y * H / 2)
    p.screen.w = Math.round(p.screen.scale * ROAD_W * W / 2)
  }

  function drawSeg(y1, w1, y2, w2, color) {
    ctx.fillStyle = color.grass; ctx.fillRect(0, y2, W, y1 - y2)
    ctx.fillStyle = color.rumble; ctx.beginPath()
    ctx.moveTo(W / 2 - w1 * 1.1, y1); ctx.lineTo(W / 2 + w1 * 1.1, y1)
    ctx.lineTo(W / 2 + w2 * 1.1, y2); ctx.lineTo(W / 2 - w2 * 1.1, y2); ctx.fill()
    ctx.fillStyle = color.road; ctx.beginPath()
    ctx.moveTo(W / 2 - w1, y1); ctx.lineTo(W / 2 + w1, y1)
    ctx.lineTo(W / 2 + w2, y2); ctx.lineTo(W / 2 - w2, y2); ctx.fill()
  }

  function draw() {
    ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, W, H)
    try {
      const grd = ctx.createLinearGradient(0, H / 2 - 50, 0, H / 2 + 50)
      grd.addColorStop(0, 'rgba(9,9,11,1)'); grd.addColorStop(1, 'rgba(129,140,248,0.2)')
      ctx.fillStyle = grd
    } catch { ctx.fillStyle = '#09090b' }
    ctx.fillRect(0, 0, W, H / 2 + 50)
    ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.arc(W / 2, H / 2, 60, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#09090b'
    for (let i = 0; i < 10; i++) {
      ctx.lineWidth = i * 2; ctx.beginPath()
      ctx.moveTo(W / 2 - 70, H / 2 + 10 + i * 8); ctx.lineTo(W / 2 + 70, H / 2 + 10 + i * 8); ctx.stroke()
    }

    const baseIdx = Math.floor(position / SEG_LEN)
    let maxy = H
    const camX = playerX * ROAD_W, camZ = position, camY = CAM_H

    for (let n = 0; n < DRAW_DIST; n++) {
      const idx = (baseIdx + n) % segments.length
      const seg = segments[idx]
      project(seg.p1, camX, camY, camZ)
      project(seg.p2, camX, camY, camZ - (idx < baseIdx ? SEG_LEN * segments.length : 0))
      if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= maxy) continue
      drawSeg(seg.p1.screen.y, seg.p1.screen.w, seg.p2.screen.y, seg.p2.screen.w, seg.color)
      maxy = seg.p1.screen.y
    }

    for (let n = DRAW_DIST - 1; n >= 0; n--) {
      const idx = (baseIdx + n) % segments.length
      const seg = segments[idx]
      if (seg.p1.camera.z <= CAM_DEPTH) continue
      for (const sprite of seg.sprites) {
        const sc = seg.p1.screen.scale
        const sx = seg.p1.screen.x + sc * sprite.x * ROAD_W * W / 2
        const sy = seg.p1.screen.y
        const sw = sprite.width * sc * W / 2, sh = sw * 0.8
        ctx.fillStyle = sprite.color; ctx.shadowBlur = 15; ctx.shadowColor = sprite.color
        ctx.fillRect(sx - sw / 2, sy - sh, sw, sh); ctx.shadowBlur = 0
      }
      if (n === 0) {
        const pw = 300 * 0.003 * W / 2, ph = 150 * 0.003 * H / 2
        const px = W / 2, py = H - 40 - ph
        ctx.fillStyle = '#818cf8'; ctx.shadowBlur = 20; ctx.shadowColor = '#818cf8'
        ctx.beginPath(); ctx.moveTo(px - pw / 2, py + ph); ctx.lineTo(px + pw / 2, py + ph)
        ctx.lineTo(px + pw / 3, py); ctx.lineTo(px - pw / 3, py); ctx.fill()
        ctx.fillStyle = '#111'; ctx.shadowBlur = 0
        ctx.fillRect(px - pw / 2 - 10, py + ph - 20, 10, 30)
        ctx.fillRect(px + pw / 2, py + ph - 20, 10, 30)
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '24px JetBrains Mono'
    ctx.fillText(`SCORE: ${Math.floor(score)}`, 20, 40)
    ctx.fillText(`SPEED: ${Math.floor(speed)}`, 20, 75)
  }

  function update(dt) {
    const baseIdx = Math.floor(position / SEG_LEN)
    if (keys.up) speed += 200 * dt
    else if (keys.down) speed -= 400 * dt
    else speed -= 100 * dt
    speed = Math.max(0, Math.min(speed, maxSpeed * speedFactor))
    if (speed > 0) {
      const steer = 2.0 * dt
      if (keys.left) playerX -= steer
      if (keys.right) playerX += steer
    }
    playerX = Math.max(-2, Math.min(2, playerX))
    position += speed; score += (speed * dt) / 100; speedFactor += dt * 0.01
    while (position >= SEG_LEN * segments.length) position -= SEG_LEN * segments.length
    const seg = segments[baseIdx % segments.length]
    for (const sprite of seg.sprites) {
      const w = sprite.width / ROAD_W
      if (playerX + 0.15 > sprite.x - w / 2 && playerX - 0.15 < sprite.x + w / 2) {
        speed = 0; return onGameOver(Math.floor(score), 'racer')
      }
    }
    if (Math.abs(playerX) > 1.2 && speed > 0) { speed -= 400 * dt; if (speed < 0) speed = 0 }
  }

  function onKey(e, isDown) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
    if (e.key === 'ArrowLeft') keys.left = isDown
    if (e.key === 'ArrowRight') keys.right = isDown
    if (e.key === 'ArrowUp') keys.up = isDown
    if (e.key === 'ArrowDown') keys.down = isDown
  }

  return {
    title: 'Synthwave Racer', width: W, height: H,
    controlsHtml: '<p>Use <kbd>←</kbd><kbd>→</kbd> to steer. <kbd>↑</kbd> to accelerate. Dodge the blocks!</p>',
    init() {
      position = 0; playerX = 0; speed = 0; maxSpeed = 200; score = 0; speedFactor = 1
      keys = { left: false, right: false, up: false, down: false }
      buildRoad(); draw()
    },
    start() {
      position = 0; playerX = 0; speed = 0; maxSpeed = 200; score = 0; speedFactor = 1
      keys = { left: false, right: false, up: false, down: false }
      buildRoad(); lastTime = performance.now()
      const kd = e => onKey(e, true), ku = e => onKey(e, false)
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
      const loop = time => {
        const dt = Math.min((time - lastTime) / 1000, 0.1); lastTime = time
        update(dt); draw(); loopId = requestAnimationFrame(loop)
      }
      loopId = requestAnimationFrame(loop)
    },
    stop() { if (loopId) cancelAnimationFrame(loopId) },
  }
}

// ─── Leaderboard helpers ──────────────────────────────────────────────────────

function saveScore(gameId, score) {
  const raw = localStorage.getItem(`sitomio_lb_${gameId}`)
  let scores = raw ? JSON.parse(raw) : []
  const isHigh = scores.length === 0 || score > Math.max(...scores.map(s => s.score))
  scores.push({ name: 'Player', score, date: new Date().toISOString() })
  scores.sort((a, b) => b.score - a.score)
  localStorage.setItem(`sitomio_lb_${gameId}`, JSON.stringify(scores.slice(0, 5)))
  return isHigh
}

function getScores(gameId) {
  const raw = localStorage.getItem(`sitomio_lb_${gameId}`)
  return raw ? JSON.parse(raw) : []
}

// ─── Component ────────────────────────────────────────────────────────────────

const GAME_CARDS = [
  { id: 'snake', icon: '🐍', title: 'Snake Classic', desc: 'The retro classic. Eat the glowing dots to grow longer, but don\'t crash into the walls or your own tail.', tags: [{ label: 'Arcade', type: 'genre' }, { label: '1 Player', type: 'players' }, { label: '2D Canvas', type: 'tech' }], category: 'arcade', playLabel: 'Play Now' },
  { id: 'pong', icon: '🏓', title: 'Neon Pong', desc: 'Grab a friend for local multiplayer. First to 5 points wins this fast-paced paddle game.', tags: [{ label: 'Sports', type: 'genre' }, { label: '2 Players', type: 'players' }, { label: '2D Canvas', type: 'tech' }], category: 'arcade local-multi', playLabel: 'Play Local' },
  { id: 'memory', icon: '🧠', title: 'Synapse Match', desc: 'Test your memory. Flip the cards to find matching pairs with the fewest moves possible.', tags: [{ label: 'Puzzle', type: 'genre' }, { label: '1 Player', type: 'players' }, { label: 'DOM Animation', type: 'tech' }], category: 'puzzle', playLabel: 'Play Now' },
  { id: 'racer', icon: '🏎️', title: 'Synthwave Racer', desc: 'High-speed retro pseudo-3D racing. Dodge obstacles and see how far you can travel before crashing.', tags: [{ label: 'Racing', type: 'genre' }, { label: '1 Player', type: 'players' }, { label: 'Pseudo 3D', type: 'tech' }], category: 'arcade', playLabel: 'Play Now' },
]

export default function Games() {
  const [filter, setFilter] = useState('all')
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [activeGameId, setActiveGameId] = useState(null)
  const [overlayState, setOverlayState] = useState({ visible: true, title: 'Ready?', score: '', controls: '', btnText: 'Start Game' })
  const [gameTitle, setGameTitle] = useState('')
  const [gameStatus, setGameStatus] = useState('READY')

  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const loopIdRef = useRef(null)

  const stopGame = useCallback(() => {
    if (gameRef.current) { gameRef.current.stop(); gameRef.current = null }
  }, [])

  const showOverlay = useCallback((title, score, controls, btnText) => {
    setOverlayState({ visible: true, title, score: score || '', controls: controls || '', btnText: btnText || 'Start' })
  }, [])

  const handleGameOver = useCallback((score, saveId) => {
    stopGame()
    setGameStatus('GAME OVER')
    let isHigh = false
    if (saveId && score !== null) isHigh = saveScore(saveId, score)
    const scoreStr = score !== null ? `Score: ${score}${isHigh ? ' (New High!)' : ''}` : ''
    showOverlay('Game Over', scoreStr, 'Play again to beat your score.', 'Restart')
  }, [stopGame, showOverlay])

  const openGame = useCallback((gameId) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    let game
    if (gameId === 'snake') game = createSnakeGame(canvas, ctx, handleGameOver)
    else if (gameId === 'pong') {
      game = createPongGame(canvas, ctx, handleGameOver)
      game.setWinCallback((winner, s1, s2) => {
        setGameStatus('GAME OVER')
        showOverlay(`${winner} Wins!`, `${s1} - ${s2}`, 'Play again', 'Rematch')
      })
    }
    else if (gameId === 'memory') game = createMemoryGame(canvas, ctx, handleGameOver)
    else if (gameId === 'racer') game = createRacerGame(canvas, ctx, handleGameOver)
    else return

    canvas.width = game.width; canvas.height = game.height
    gameRef.current = game
    setActiveGameId(gameId)
    setGameTitle(game.title)
    setGameStatus('READY')
    showOverlay(game.title, null, game.controlsHtml, 'Start Game')
    if (game.init) game.init()
  }, [handleGameOver, showOverlay])

  const closeGame = useCallback(() => {
    stopGame()
    setActiveGameId(null)
  }, [stopGame])

  const startGame = useCallback(() => {
    if (!gameRef.current) return
    setOverlayState(s => ({ ...s, visible: false }))
    setGameStatus('PLAYING')
    gameRef.current.start()
  }, [])

  // ESC to close
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && activeGameId) closeGame() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeGameId, closeGame])

  const filteredCards = filter === 'all' ? GAME_CARDS : GAME_CARDS.filter(c => c.category.includes(filter))

  return (
    <>
      {/* Inline styles specific to Games page */}
      <style>{`
        .games-hero{padding:120px clamp(24px,5vw,48px) 40px;text-align:center;}
        .games-hero-title{font-size:clamp(2.5rem,6vw,4rem);font-weight:700;color:var(--text-primary);letter-spacing:-.03em;margin-bottom:16px;}
        .games-hero-title .accent{background:linear-gradient(135deg,var(--text-primary) 0%,var(--accent) 50%,var(--accent-secondary) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
        .games-hero-subtitle{font-size:1.125rem;color:var(--text-secondary);max-width:500px;margin:0 auto;}
        .game-filters{display:flex;justify-content:center;gap:12px;margin:40px auto 60px;flex-wrap:wrap;}
        .filter-btn{background:rgba(255,255,255,0.03);border:1px solid var(--border);color:var(--text-secondary);padding:10px 24px;border-radius:100px;font-size:.875rem;font-weight:500;cursor:pointer;transition:all .3s var(--ease-out);backdrop-filter:blur(10px);}
        .filter-btn:hover{color:var(--text-primary);border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);}
        .filter-btn.active{background:var(--accent);color:#09090b;border-color:var(--accent);box-shadow:0 4px 16px var(--accent-glow);}
        .game-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:32px;max-width:var(--container-width);margin:0 auto 120px;padding:0 clamp(24px,5vw,48px);}
        .game-card{background:var(--bg-card);border:1px solid var(--border);border-radius:24px;padding:32px;transition:all .4s var(--ease-spring);position:relative;z-index:10;overflow:hidden;display:flex;flex-direction:column;gap:20px;cursor:pointer;user-select:none;}
        .game-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:0;transition:opacity .4s ease;}
        .game-card::after{content:'';position:absolute;bottom:-24px;left:0;right:0;height:24px;background:transparent;}
        .game-card:hover{transform:translateY(-8px);border-color:var(--border-hover);box-shadow:0 20px 40px rgba(0,0,0,.4);background:var(--bg-card-hover);}
        .game-card:hover::before{opacity:1;}
        .game-icon{font-size:3rem;line-height:1;margin-bottom:8px;filter:drop-shadow(0 4px 12px rgba(0,0,0,.2));transition:transform .4s var(--ease-spring);}
        .game-card:hover .game-icon{transform:scale(1.15) rotate(-5deg);}
        .game-info{flex-grow:1;}
        .game-title{font-size:1.25rem;font-weight:600;color:var(--text-primary);margin-bottom:8px;letter-spacing:-.01em;}
        .game-desc{font-size:.9375rem;color:var(--text-secondary);line-height:1.6;margin-bottom:16px;}
        .game-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;}
        .game-tag{font-family:var(--font-mono);font-size:.75rem;padding:4px 12px;border-radius:6px;background:rgba(255,255,255,.04);border:1px solid var(--border);color:var(--text-muted);}
        .game-tag.genre{color:var(--accent);background:var(--accent-dim);border-color:rgba(129,140,248,.2);}
        .game-tag.players{color:#f472b6;background:rgba(244,114,182,.1);border-color:rgba(244,114,182,.2);}
        .game-tag.tech{color:#34d399;background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.2);}
        .play-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;color:var(--text-primary);font-weight:600;font-size:.875rem;transition:all .3s ease;position:relative;z-index:20;cursor:pointer;}
        .game-card:hover .play-btn{background:var(--accent);color:#09090b;border-color:var(--accent);}
        .game-modal{position:fixed;inset:0;background:rgba(9,9,11,.95);backdrop-filter:blur(20px);z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .4s var(--ease-out);}
        .game-modal.active{opacity:1;pointer-events:all;}
        .modal-header{position:absolute;top:0;left:0;right:0;height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(24px,5vw,48px);border-bottom:1px solid var(--border);}
        .modal-title{font-size:1.125rem;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:12px;}
        .modal-title .status{font-family:var(--font-mono);font-size:.75rem;background:var(--accent-dim);color:var(--accent);padding:4px 10px;border-radius:100px;letter-spacing:.05em;}
        .close-btn{background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:8px;border-radius:8px;transition:all .2s ease;display:flex;align-items:center;gap:8px;font-size:.875rem;font-weight:500;}
        .close-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.05);}
        .canvas-container{position:relative;width:min(800px,90vw);max-height:calc(100vh - 120px);aspect-ratio:16/10;background:#000;border-radius:16px;border:1px solid rgba(255,255,255,.1);box-shadow:0 30px 60px rgba(0,0,0,.6);overflow:hidden;display:flex;align-items:center;justify-content:center;transform:scale(.95);transition:transform .5s var(--ease-spring);}
        .game-modal.active .canvas-container{transform:scale(1);}
        .canvas-container canvas{display:block;width:100%;height:100%;object-fit:contain;}
        .game-ui-overlay{position:absolute;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;opacity:0;pointer-events:none;transition:opacity .3s ease;}
        .game-ui-overlay.active{opacity:1;pointer-events:all;}
        .overlay-title{font-size:3rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;text-shadow:0 4px 12px rgba(0,0,0,.5);}
        .overlay-score{font-family:var(--font-mono);font-size:1.5rem;color:var(--accent);margin-bottom:32px;}
        .overlay-controls{font-size:.9375rem;color:var(--text-secondary);line-height:1.8;margin-bottom:32px;background:rgba(255,255,255,.05);padding:16px 24px;border-radius:12px;border:1px solid rgba(255,255,255,.05);}
        kbd{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-bottom-width:2px;border-radius:4px;padding:2px 6px;font-family:var(--font-mono);font-size:.8125rem;color:var(--text-primary);margin:0 2px;}
        .leaderboard-panel{max-width:var(--container-width);margin:0 auto 120px;padding:0 clamp(24px,5vw,48px);}
        .lb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:24px;}
        .lb-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:24px;}
        .lb-title{font-size:1.125rem;font-weight:600;color:var(--text-primary);margin-bottom:16px;display:flex;align-items:center;gap:8px;padding-bottom:12px;border-bottom:1px solid var(--border);}
        .lb-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.03);font-family:var(--font-mono);font-size:.875rem;}
        .lb-row:last-child{border-bottom:none;}
        .lb-rank{color:var(--text-muted);width:24px;}.lb-name{color:var(--text-secondary);flex-grow:1;text-align:left;}.lb-score{color:var(--accent);font-weight:500;}
        .lb-row.first .lb-name,.lb-row.first .lb-score{color:#fbbf24;}
        .moto-nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;height:64px;padding:0 clamp(24px,5vw,48px);background:rgba(9,9,11,0.75);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);}
        .moto-back{display:inline-flex;align-items:center;gap:8px;font-size:.875rem;font-weight:500;color:var(--text-secondary);transition:color .3s ease;}
        .moto-back:hover{color:var(--accent);}
        .moto-title{font-size:.8125rem;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:8px;}
      `}</style>

      {/* Nav */}
      <nav className="moto-nav">
        <Link to="/" className="moto-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M19 12H5M5 12l6-6M5 12l6 6" />
          </svg>
          <span>Back to Home</span>
        </Link>
        <div className="moto-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 12h4m-2-2v4" />
            <circle cx="15" cy="11" r="1" fill="currentColor" />
            <circle cx="17" cy="13" r="1" fill="currentColor" />
          </svg>
          Arcade Hub
        </div>
      </nav>

      {/* Hero */}
      <header className="games-hero">
        <h1 className="games-hero-title">The <span className="accent">Arcade</span></h1>
        <p className="games-hero-subtitle">A collection of web-based games built from scratch. Compete for the high score or challenge a friend in local multiplayer.</p>
      </header>

      {/* Filters */}
      <div className="game-filters">
        {['all', 'arcade', 'puzzle', 'local-multi', 'leaderboard'].map(f => (
          <button
            key={f}
            className={`filter-btn${filter === f || (f === 'leaderboard' && showLeaderboard) ? ' active' : ''}`}
            onClick={() => {
              if (f === 'leaderboard') { setShowLeaderboard(true); setFilter('leaderboard') }
              else { setShowLeaderboard(false); setFilter(f) }
            }}
          >
            {f === 'all' ? 'All Games' : f === 'local-multi' ? 'Multiplayer' : f === 'leaderboard' ? 'Leaderboards' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Games Grid */}
      {!showLeaderboard && (
        <main className="game-grid">
          {filteredCards.map(card => (
            <article key={card.id} className="game-card" onClick={() => openGame(card.id)}>
              <div className="game-icon">{card.icon}</div>
              <div className="game-info">
                <h2 className="game-title">{card.title}</h2>
                <p className="game-desc">{card.desc}</p>
                <div className="game-tags">
                  {card.tags.map(t => <span key={t.label} className={`game-tag ${t.type}`}>{t.label}</span>)}
                </div>
              </div>
              <button className="play-btn" onClick={e => { e.stopPropagation(); openGame(card.id) }}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
                {card.playLabel}
              </button>
            </article>
          ))}
        </main>
      )}

      {/* Leaderboards */}
      {showLeaderboard && (
        <section className="leaderboard-panel">
          <h2 className="section-title">High Scores</h2>
          <div className="lb-grid">
            {[['snake', '🐍 Snake Classic'], ['memory', '🧠 Synapse Match'], ['racer', '🏎️ Synthwave Racer']].map(([id, label]) => (
              <div key={id} className="lb-card">
                <div className="lb-title">{label}</div>
                {getScores(id).length === 0
                  ? <div className="lb-row"><span className="lb-rank">-</span><span className="lb-name">No scores yet</span><span className="lb-score">0</span></div>
                  : getScores(id).map((s, i) => (
                    <div key={i} className={`lb-row${i === 0 ? ' first' : ''}`}>
                      <span className="lb-rank">#{i + 1}</span>
                      <span className="lb-name">{s.name} {i === 0 ? '👑' : ''}</span>
                      <span className="lb-score">{s.score}</span>
                    </div>
                  ))
                }
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Game Modal */}
      <div className={`game-modal${activeGameId ? ' active' : ''}`}>
        <div className="modal-header">
          <div className="modal-title">
            {gameTitle} <span className="status">{gameStatus}</span>
          </div>
          <button className="close-btn" onClick={closeGame}>
            ESC <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="canvas-container">
          <canvas id="game-canvas" ref={canvasRef} width="800" height="500" />
          <div className={`game-ui-overlay${overlayState.visible ? ' active' : ''}`}>
            <h2 className="overlay-title">{overlayState.title}</h2>
            <div className="overlay-score">{overlayState.score}</div>
            <div className="overlay-controls" dangerouslySetInnerHTML={{ __html: overlayState.controls }} />
            <button className="btn-primary" onClick={startGame}>{overlayState.btnText}</button>
          </div>
        </div>
      </div>
    </>
  )
}
