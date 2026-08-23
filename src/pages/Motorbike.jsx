import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import ThemeToggle from '../components/ThemeToggle'

const MOTO_COUNTRIES = new Set(['Italy','Austria','Germany','Denmark','Sweden','Norway','France','Switzerland'])
const TRAVEL_COUNTRIES = new Set(['Japan','Spain','United Kingdom','Ireland','Iceland','Slovenia','Croatia','Greece','Egypt','Luxembourg','Belgium','Netherlands'])
const MOTO_COLOR = '#818cf8', MOTO_HOVER = '#a78bfa'
const TRAVEL_COLOR = '#f472b6', TRAVEL_HOVER = '#f9a8d4'

function getType(name) {
  if (MOTO_COUNTRIES.has(name)) return 'moto'
  if (TRAVEL_COUNTRIES.has(name)) return 'travel'
  return null
}
function getColor(t) { return t === 'moto' ? MOTO_COLOR : TRAVEL_COLOR }
function getHover(t) { return t === 'moto' ? MOTO_HOVER : TRAVEL_HOVER }
function getIcon(t) { return t === 'moto' ? '🏍️' : '✈️' }

const MOTO_TRIPS = [
  { label: 'Norway', color: MOTO_COLOR, panel: { title: 'Italy → Norway', route: 'Summer Road Trip', desc: 'Riding from Milan through the Alps, across Germany and Scandinavia, all the way to the Norwegian fjords.', stats: [{ val: '6', label: 'Countries' }, { val: '~4,000', label: 'Km' }] } },
  { label: 'France', color: MOTO_COLOR, panel: { title: 'Italy → France', route: 'Weekend Escape', desc: 'Crossing the border through the Riviera and exploring the south of France on two wheels.', stats: [{ val: '2', label: 'Countries' }, { val: '~1,200', label: 'Km' }] } },
  { label: 'Swiss', color: MOTO_COLOR, panel: { title: 'Italy → Switzerland', route: 'Alpine Adventure', desc: 'Crossing the Gotthard and Simplon passes, riding through the Swiss Alps and lakeside roads.', stats: [{ val: '2', label: 'Countries' }, { val: '~800', label: 'Km' }] } },
]

const TRAVEL_ITEMS = [
  { flag: '🇯🇵', name: 'Japan' }, { flag: '🇪🇸', name: 'Spain' }, { flag: '🇬🇧', name: 'United Kingdom' },
  { flag: '🇮🇪', name: 'Ireland' }, { flag: '🇮🇸', name: 'Iceland' }, { flag: '🇸🇮', name: 'Slovenia' },
  { flag: '🇭🇷', name: 'Croatia' }, { flag: '🇬🇷', name: 'Greece' }, { flag: '🇪🇬', name: 'Egypt' },
  { flag: '🇱🇺', name: 'Luxembourg' }, { flag: '🇧🇪', name: 'Belgium' }, { flag: '🇳🇱', name: 'Netherlands' },
]

export default function Motorbike() {
  const { theme } = useTheme()
  const mapRef = useRef(null)
  const leafletMapRef = useRef(null)
  const baseLayerRef = useRef(null)
  const labelsLayerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [cat, setCat] = useState('moto')
  const [tripIdx, setTripIdx] = useState(0)

  // Update tile layers when theme changes
  useEffect(() => {
    if (!baseLayerRef.current || !labelsLayerRef.current) return
    const mode = theme
    baseLayerRef.current.setUrl(`https://{s}.basemaps.cartocdn.com/${mode}_nolabels/{z}/{x}/{y}{r}.png`)
    labelsLayerRef.current.setUrl(`https://{s}.basemaps.cartocdn.com/${mode}_only_labels/{z}/{x}/{y}{r}.png`)
  }, [theme])

  useEffect(() => {
    // Guard: if the container div is already a Leaflet map, skip (happens in Strict Mode re-run)
    if (mapRef.current && mapRef.current._leaflet_id) return

    const mode = document.documentElement.getAttribute('data-theme') || 'dark'
    const map = L.map(mapRef.current, {
      center: [40, 20], zoom: 3, minZoom: 2, maxZoom: 7, zoomControl: true, worldCopyJump: true,
    })
    leafletMapRef.current = map

    baseLayerRef.current = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${mode}_nolabels/{z}/{x}/{y}{r}.png`,
      { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>', subdomains: 'abcd', maxZoom: 19 }
    ).addTo(map)

    labelsLayerRef.current = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/${mode}_only_labels/{z}/{x}/{y}{r}.png`,
      { subdomains: 'abcd', maxZoom: 19, pane: 'overlayPane' }
    ).addTo(map)

    let cancelled = false
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        setLoading(false)
        L.geoJSON(data, {
          style: f => {
            const name = f.properties.name || f.properties.ADMIN || ''
            const type = getType(name)
            if (type) return { fillColor: getColor(type), fillOpacity: 0.35, color: getColor(type), weight: 1.5 }
            return { fillColor: 'rgba(255,255,255,0.02)', fillOpacity: 0.3, color: 'rgba(255,255,255,0.08)', weight: 0.4 }
          },
          onEachFeature: (f, layer) => {
            const name = f.properties.name || f.properties.ADMIN || 'Unknown'
            const type = getType(name)
            layer.bindTooltip(`${name}${type ? ' ' + getIcon(type) : ''}`, { className: 'country-tip', sticky: true })
            layer.on('mouseover', function () {
              if (type) this.setStyle({ fillOpacity: 0.55, weight: 2, color: getHover(type) })
              else this.setStyle({ fillOpacity: 0.5, fillColor: 'rgba(255,255,255,0.06)' })
            })
            layer.on('mouseout', function () {
              if (type) this.setStyle({ fillOpacity: 0.35, weight: 1.5, color: getColor(type) })
              else this.setStyle({ fillOpacity: 0.3, fillColor: 'rgba(255,255,255,0.02)' })
            })
          },
        }).addTo(map)
      })
      .catch(err => {
        if (cancelled) return
        console.error('GeoJSON load error:', err)
        setLoading(false)
        setLoadError(true)
      })

    return () => {
      cancelled = true
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
      }
    }
  }, [])

  return (
    <>
      <style>{`
        body{overflow:hidden;}
        .moto-nav{position:fixed;top:0;left:0;right:0;z-index:1000;display:flex;align-items:center;justify-content:space-between;height:64px;padding:0 clamp(24px,5vw,48px);background:rgba(9,9,11,.75);backdrop-filter:blur(20px) saturate(180%);border-bottom:1px solid rgba(255,255,255,.06);}
        [data-theme="light"] .moto-nav{background:rgba(248,250,252,.75);border-bottom-color:rgba(0,0,0,.08);}
        .moto-back{display:inline-flex;align-items:center;gap:8px;font-size:.875rem;font-weight:500;color:#a1a1aa;transition:color .3s ease;}
        .moto-back:hover{color:#818cf8;}
        .moto-back svg{transition:transform .3s cubic-bezier(.16,1,.3,1);}
        .moto-back:hover svg{transform:translateX(-3px);}
        [data-theme="light"] .moto-back{color:#0f172a;font-weight:600;}
        [data-theme="light"] .moto-back:hover{color:#4f46e5;}
        .moto-title{font-size:.8125rem;font-weight:600;color:#fafafa;letter-spacing:.02em;display:flex;align-items:center;gap:8px;position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;}
        .moto-title svg{color:#818cf8;}
        [data-theme="light"] .moto-title{color:#0f172a;}
        [data-theme="light"] .moto-title svg{color:#4f46e5;}
        #map-container{position:fixed;top:0;left:0;width:100%;height:100%;z-index:1;background:#09090b;}
        [data-theme="light"] #map-container{background:#f8fafc;}
        .leaflet-container{background:#09090b !important;}
        [data-theme="light"] .leaflet-container{background:#f8fafc !important;}
        .leaflet-top{margin-top:80px;}
        .leaflet-control-zoom{border:none !important;z-index:1001 !important;}
        .leaflet-control-zoom a{background:rgba(22,22,26,.9) !important;color:#a1a1aa !important;border:1px solid rgba(255,255,255,.06) !important;width:36px !important;height:36px !important;line-height:36px !important;font-size:16px !important;}
        .leaflet-control-zoom a:hover{background:rgba(22,22,26,1) !important;color:#fafafa !important;}
        .leaflet-control-zoom-in{border-radius:10px 10px 0 0 !important;border-bottom:none !important;}
        .leaflet-control-zoom-out{border-radius:0 0 10px 10px !important;}
        .leaflet-control-attribution{background:rgba(9,9,11,.7) !important;color:#63636e !important;font-size:.625rem !important;}
        .leaflet-control-attribution a{color:#818cf8 !important;}
        [data-theme="light"] .leaflet-control-zoom a{background:rgba(255,255,255,.9) !important;color:#475569 !important;border-color:rgba(0,0,0,.08) !important;}
        [data-theme="light"] .leaflet-control-zoom a:hover{background:#fff !important;color:#0f172a !important;}
        [data-theme="light"] .leaflet-control-attribution{background:rgba(248,250,252,.7) !important;color:#64748b !important;}
        [data-theme="light"] .leaflet-control-attribution a{color:#4f46e5 !important;}
        .country-tip{background:rgba(22,22,26,.95) !important;border:1px solid rgba(129,140,248,.3) !important;border-radius:8px !important;padding:8px 14px !important;font-family:'Inter',sans-serif !important;font-size:.8125rem !important;font-weight:500 !important;color:#fafafa !important;box-shadow:0 8px 32px rgba(0,0,0,.4) !important;}
        [data-theme="light"] .country-tip{background:rgba(255,255,255,.95) !important;border-color:rgba(79,70,229,.3) !important;color:#0f172a !important;box-shadow:0 4px 16px rgba(0,0,0,.1) !important;}
        .panel{position:fixed;z-index:1000;background:rgba(22,22,26,.92);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.06);border-radius:16px;opacity:0;transform:translateY(16px);animation:panelIn .6s cubic-bezier(.16,1,.3,1) forwards;}
        [data-theme="light"] .panel{background:rgba(255,255,255,.92);border-color:rgba(0,0,0,.08);box-shadow:0 4px 20px rgba(0,0,0,.05);}
        @keyframes panelIn{to{opacity:1;transform:translateY(0)}}
        .map-legend{bottom:32px;left:32px;padding:20px 24px;min-width:220px;animation-delay:.8s;}
        .legend-title{font-size:.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:#818cf8;margin-bottom:14px;}
        [data-theme="light"] .legend-title{color:#4f46e5;}
        .legend-item{display:flex;align-items:center;gap:10px;padding:4px 0;}
        .legend-swatch{width:14px;height:14px;border-radius:4px;flex-shrink:0;}
        .legend-label{font-size:.8125rem;color:#a1a1aa;}
        [data-theme="light"] .legend-label{color:#475569;}
        .trip-cards{bottom:32px;right:32px;padding:0;max-width:300px;animation-delay:1s;overflow:hidden;}
        .category-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.08);}
        [data-theme="light"] .category-tabs{border-bottom-color:rgba(0,0,0,.08);}
        .cat-tab{flex:1;padding:14px 8px;background:transparent;border:none;color:#63636e;font-family:'Inter',sans-serif;font-size:.75rem;font-weight:700;cursor:pointer;transition:all .2s ease;text-align:center;}
        .cat-tab:hover{color:#a1a1aa;}
        [data-theme="light"] .cat-tab{color:#64748b;}
        [data-theme="light"] .cat-tab:hover{color:#475569;}
        .cat-tab.active{color:#fafafa;background:rgba(255,255,255,.04);}
        [data-theme="light"] .cat-tab.active{color:#0f172a;background:rgba(0,0,0,.03);}
        .trip-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.06);}
        .trip-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 8px;background:transparent;border:none;color:#63636e;font-family:'Inter',sans-serif;font-size:.6875rem;font-weight:600;cursor:pointer;transition:all .2s ease;}
        .trip-tab:hover{color:#a1a1aa;}
        .trip-tab.active{color:#fafafa;background:rgba(255,255,255,.03);}
        .tab-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .trip-panel{display:none;padding:20px 24px;}
        .trip-panel.active{display:block;}
        .trip-panel h3{font-size:1.125rem;font-weight:700;color:#fafafa;margin-bottom:4px;}
        [data-theme="light"] .trip-panel h3{color:#0f172a;}
        .trip-route{font-size:.8125rem;color:#818cf8;font-weight:500;margin-bottom:12px;}
        [data-theme="light"] .trip-route{color:#4f46e5;}
        .trip-panel p{font-size:.8125rem;color:#a1a1aa;line-height:1.6;margin-bottom:12px;}
        [data-theme="light"] .trip-panel p{color:#475569;}
        .trip-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);}
        [data-theme="light"] .trip-stats{border-top-color:rgba(0,0,0,.08);}
        .trip-stat-value{font-size:1.25rem;font-weight:700;color:#fafafa;}
        [data-theme="light"] .trip-stat-value{color:#0f172a;}
        .trip-stat-label{font-size:.6875rem;color:#63636e;text-transform:uppercase;letter-spacing:.06em;}
        [data-theme="light"] .trip-stat-label{color:#64748b;}
        .travel-list{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:8px 16px;}
        .travel-item{display:flex;align-items:center;gap:8px;padding:8px 10px;font-size:.8125rem;color:#a1a1aa;border-radius:8px;transition:background .2s ease;}
        .travel-item:hover{background:rgba(255,255,255,.03);color:#fafafa;}
        [data-theme="light"] .travel-item{color:#475569;}
        [data-theme="light"] .travel-item:hover{background:rgba(0,0,0,.03);color:#0f172a;}
        .travel-flag{font-size:1.125rem;}
        .travel-summary{display:flex;align-items:baseline;padding:12px 20px;border-top:1px solid rgba(255,255,255,.06);}
        [data-theme="light"] .travel-summary{border-top-color:rgba(0,0,0,.08);}
        .map-loading{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:500;text-align:center;color:#63636e;font-size:.875rem;transition:opacity .5s ease;}
        .map-loading.hidden{opacity:0;pointer-events:none;}
        .map-loading-spinner{width:32px;height:32px;border:2px solid rgba(255,255,255,.06);border-top-color:#818cf8;border-radius:50%;margin:0 auto 12px;animation:spin .8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){
          .moto-nav{height:52px;padding:0 16px;}
          .leaflet-top{margin-top:60px;}
          .moto-title{font-size:.75rem;gap:6px;position:static;transform:none;margin:0 auto;}
          .trip-cards{bottom:0;left:0;right:0;top:auto;max-width:none;border-radius:20px 20px 0 0;border-bottom:none;}
          .trip-tab{padding:14px 12px;font-size:.75rem;white-space:nowrap;min-height:44px;}
          .trip-panel{padding:16px 20px 24px;}
          .map-legend{bottom:auto;top:60px;left:12px;right:auto;min-width:auto;padding:10px 14px;border-radius:12px;}
          .legend-title{margin-bottom:8px;font-size:.625rem;}
          .legend-swatch{width:10px;height:10px;border-radius:3px;}
          .legend-label{font-size:.6875rem;}
        }
        @media(max-width:480px){
          .moto-nav{height:48px;padding:0 12px;}
          .moto-back span{display:none;}
          .trip-tab{font-size:.6875rem;padding:12px 8px;}
          .trip-panel{padding:14px 16px 20px;}
          .trip-panel p{font-size:.6875rem;line-height:1.5;}
          .map-legend{top:54px;left:8px;padding:8px 10px;}
        }
      `}</style>

      <nav className="moto-nav">
        <Link to="/" className="moto-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M19 12H5M5 12l6-6M5 12l6 6" />
          </svg>
          <span>Back</span>
        </Link>
        <div className="moto-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <circle cx="5.5" cy="17.5" r="3.5" />
            <circle cx="18.5" cy="17.5" r="3.5" />
            <path d="M15 6h2l3 5h-4" />
            <path d="M5.5 17.5h4l2-5H7l-2 3" />
            <path d="M11.5 12.5L13 8h3" />
          </svg>
          Motorbike &amp; Travel Map
        </div>
        <ThemeToggle className="theme-toggle" />
      </nav>

      <div id="map-container" ref={mapRef}></div>

      {loading && (
        <div className="map-loading">
          <div className="map-loading-spinner"></div>
          Loading countries...
        </div>
      )}
      {loadError && (
        <div className="map-loading">Failed to load map data. Check your connection.</div>
      )}

      {/* Legend */}
      <div className="map-legend panel">
        <div className="legend-title">Legend</div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: '#818cf8' }}></div>
          <span className="legend-label">🏍️ Motorcycle trip</span>
        </div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: '#f472b6' }}></div>
          <span className="legend-label">✈️ Other travel</span>
        </div>
        <div className="legend-item" style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="legend-swatch" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}></div>
          <span className="legend-label">Not yet explored</span>
        </div>
      </div>

      {/* Trip Cards */}
      <div className="trip-cards panel">
        <div className="category-tabs">
          <button className={`cat-tab${cat === 'moto' ? ' active' : ''}`} onClick={() => setCat('moto')}>🏍️ Motorcycle</button>
          <button className={`cat-tab${cat === 'travel' ? ' active' : ''}`} onClick={() => setCat('travel')}>✈️ Travel</button>
        </div>

        {cat === 'moto' && (
          <>
            <div className="trip-tabs">
              {MOTO_TRIPS.map((t, i) => (
                <button key={i} className={`trip-tab${tripIdx === i ? ' active' : ''}`} onClick={() => setTripIdx(i)}>
                  <span className="tab-dot" style={{ background: t.color }}></span>
                  {t.label}
                </button>
              ))}
            </div>
            {MOTO_TRIPS.map((t, i) => (
              <div key={i} className={`trip-panel${tripIdx === i ? ' active' : ''}`}>
                <h3>{t.panel.title}</h3>
                <div className="trip-route">{t.panel.route}</div>
                <p>{t.panel.desc}</p>
                <div className="trip-stats">
                  {t.panel.stats.map(s => (
                    <div key={s.label}>
                      <div className="trip-stat-value">{s.val}</div>
                      <div className="trip-stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {cat === 'travel' && (
          <>
            <div className="travel-list">
              {TRAVEL_ITEMS.map(item => (
                <div key={item.name} className="travel-item">
                  <span className="travel-flag">{item.flag}</span>
                  {item.name}
                </div>
              ))}
            </div>
            <div className="travel-summary">
              <span className="trip-stat-value">12</span>
              <span className="trip-stat-label" style={{ marginLeft: 8 }}>countries explored</span>
            </div>
          </>
        )}
      </div>
    </>
  )
}
