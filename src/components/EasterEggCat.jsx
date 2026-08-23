import { useEffect, useRef } from 'react'

const CAT_CSS = `
.easter-cat{position:fixed;bottom:16px;left:-120px;z-index:9999;width:80px;height:50px;animation:catWalk 5s linear forwards;pointer-events:none;filter:drop-shadow(0 0 6px rgba(129,140,248,.3))}
@keyframes catWalk{0%{left:-120px}100%{left:calc(100vw + 120px)}}
.cat-body{position:absolute;bottom:12px;left:15px;width:45px;height:22px;background:#3a3a42;border-radius:20px 24px 8px 8px;border:1px solid rgba(129,140,248,.2)}
.cat-head{position:absolute;bottom:22px;right:0;width:22px;height:20px;background:#3a3a42;border-radius:50% 50% 40% 40%;border:1px solid rgba(129,140,248,.2)}
.cat-ear-l,.cat-ear-r{position:absolute;top:-7px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid #3a3a42}
.cat-ear-l{left:1px;transform:rotate(-10deg)}.cat-ear-r{right:1px;transform:rotate(10deg)}
.cat-eye-l,.cat-eye-r{position:absolute;top:7px;width:5px;height:5px;background:#818cf8;border-radius:50%;box-shadow:0 0 6px #818cf8,0 0 12px rgba(129,140,248,.4)}
.cat-eye-l{left:3px}.cat-eye-r{right:3px}
.cat-tail{position:absolute;bottom:20px;left:5px;width:24px;height:3px;background:#3a3a42;border-radius:3px;transform-origin:right center;animation:tailSwing .4s ease-in-out infinite alternate}
@keyframes tailSwing{0%{transform:rotate(-15deg)}100%{transform:rotate(15deg)}}
.cat-leg{position:absolute;bottom:0;width:5px;height:12px;background:#3a3a42;border-radius:0 0 2px 2px}
.cat-leg-fl{left:42px;animation:legMove .25s ease-in-out infinite alternate}
.cat-leg-fr{left:50px;animation:legMove .25s ease-in-out infinite alternate-reverse}
.cat-leg-bl{left:18px;animation:legMove .25s ease-in-out infinite alternate-reverse}
.cat-leg-br{left:26px;animation:legMove .25s ease-in-out infinite alternate}
@keyframes legMove{0%{height:12px}100%{height:9px}}
`

export default function EasterEggCat() {
  const activeRef = useRef(false)
  const tapsRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    // Inject CSS once
    if (!document.getElementById('cat-css')) {
      const s = document.createElement('style')
      s.id = 'cat-css'
      s.textContent = CAT_CSS
      document.head.appendChild(s)
    }

    function handleClick(e) {
      if (e.target.closest('a,button')) return
      if (activeRef.current) return
      tapsRef.current++
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => { tapsRef.current = 0 }, 8000)

      if (tapsRef.current >= 10) {
        tapsRef.current = 0
        activeRef.current = true

        const cat = document.createElement('div')
        cat.className = 'easter-cat'
        cat.innerHTML = '<div class="cat-tail"></div><div class="cat-body"><div class="cat-head"><div class="cat-ear-l"></div><div class="cat-ear-r"></div><div class="cat-eye-l"></div><div class="cat-eye-r"></div></div></div><div class="cat-leg cat-leg-bl"></div><div class="cat-leg cat-leg-br"></div><div class="cat-leg cat-leg-fl"></div><div class="cat-leg cat-leg-fr"></div>'
        document.body.appendChild(cat)
        cat.addEventListener('animationend', () => {
          cat.remove()
          activeRef.current = false
        })
      }
    }

    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
      clearTimeout(timerRef.current)
    }
  }, [])

  return null
}
