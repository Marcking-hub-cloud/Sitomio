/* Vista Classifica: classifica generale, punteggi per giornata, andamento e albo dei vincitori. */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useMemo = React.useMemo, useEffect = React.useEffect, useRef = React.useRef;

  var SEL_KEY = 'FSGiornataSel'; // root[SEL_KEY] = {n, at}: letto dalla vista Giornate per aprire la giornata scelta qui
  var RISERVA = ['#2448f0', '#d9480f', '#2b8a3e', '#b5205a', '#7048e8', '#0c8599', '#e67700', '#495057', '#c92a2a', '#364fc7'];

  function formClass(r) {
    if (!r.di || r.di < 2) return 'mid';
    if (r.pos <= Math.ceil(r.di / 3)) return 'top';
    if (r.pos > r.di - Math.ceil(r.di / 3)) return 'low';
    return 'mid';
  }

  /** Numeri delle giornate con almeno un punteggio (rettifiche incluse), in ordine. */
  function giornateConPunti(d) {
    return Object.keys(d.esitiTot).map(Number).filter(function (n) {
      var e = d.esitiTot[n] || {};
      return d.teamIds.some(function (t) { return e[t] !== undefined && e[t] !== null; });
    }).sort(function (a, b) { return a - b; });
  }

  function apriGiornata(n, go) {
    // passaggio in memoria (stessa pagina): localStorage negli artifact può essere bloccato
    root[SEL_KEY] = { n: n, at: Date.now() };
    if (go) go('giornate');
  }

  function elenco(arr) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
  }

  function nomeG(s, n) { var g = s.giornate[n]; return g ? (g.nome || 'Giornata ' + n) : 'Giornata ' + n; }

  // ---------------------------------------------------------- colori del grafico
  function hex6(c) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return '#' + h.toLowerCase();
  }
  function luminanza(hex) {
    var n = parseInt(hex.slice(1), 16);
    var ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  /** Colore della squadra (colori[0]); se manca, uno di riserva stabile. */
  function coloreSquadra(t, i) { return hex6(t && t.colori && t.colori[0]) || RISERVA[i % RISERVA.length]; }
  /** I colori molto scuri o molto chiari spariscono su uno dei due temi: li bordiamo. */
  function serveBordo(hex) { var l = luminanza(hex); return l < 0.07 || l > 0.7; }
  /** Tema scuro attivo (preferenza del sistema o data-theme). */
  function temaScuro() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    try { return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; }
  }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  /** Il colore si vede sullo sfondo del tema? (nel tema scuro niente quasi neri, nel chiaro niente quasi bianchi) */
  function leggibile(hex, scuro) { var l = luminanza(hex); return scuro ? l >= 0.07 : l <= 0.7; }
  /** Stessa tinta e saturazione, luminosità portata a `L` (0…1): un blu notte resta blu, non diventa grigio. */
  function conLuce(hex, L) {
    var c = rgb(hex).map(function (x) { return x / 255; });
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), l = (mx + mn) / 2, h = 0, sat = 0, dd = mx - mn;
    if (dd) {
      sat = dd / (1 - Math.abs(2 * l - 1));
      h = mx === c[0] ? ((c[1] - c[2]) / dd) % 6 : mx === c[1] ? (c[2] - c[0]) / dd + 2 : (c[0] - c[1]) / dd + 4;
      h *= 60; if (h < 0) h += 360;
    }
    var k = (1 - Math.abs(2 * L - 1)) * Math.min(1, sat), x = k * (1 - Math.abs((h / 60) % 2 - 1)), m = L - k / 2;
    var t = h < 60 ? [k, x, 0] : h < 120 ? [x, k, 0] : h < 180 ? [0, k, x] : h < 240 ? [0, x, k] : h < 300 ? [x, 0, k] : [k, 0, x];
    return '#' + t.map(function (v) { return ('0' + Math.round((v + m) * 255).toString(16)).slice(-2); }).join('');
  }
  /** Distanza percepita tra due colori («redmean», 0…~765): sotto DIST_MIN due linee del grafico si confondono. */
  var DIST_MIN = 90;
  function distanza(a, b) {
    var p = rgb(a), q = rgb(b), r = (p[0] + q[0]) / 2, dr = p[0] - q[0], dg = p[1] - q[1], db = p[2] - q[2];
    return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
  }
  /**
   * Colore della linea di una squadra: il primo colore se si vede sul tema, altrimenti il secondo, altrimenti il primo
   * schiarito (o scurito) nella stessa tinta; se è troppo vicino a una linea già scelta si passa al candidato successivo
   * e poi a un colore di riserva libero. Così un blu notte e un quasi nero non diventano lo stesso grigio.
   */
  function coloreSerie(t, i, scuro, usati) {
    var c0 = coloreSquadra(t, i), c1 = hex6(t && t.colori && t.colori[1]);
    var cand = [c0, c1, conLuce(c0, scuro ? 0.62 : 0.4)].concat(RISERVA.slice(i % RISERVA.length), RISERVA);
    var vis = cand.filter(function (c) { return c && leggibile(c, scuro); });
    var ok = vis.filter(function (c) { return usati.every(function (u) { return distanza(c, u) >= DIST_MIN; }); })[0];
    return ok || vis[0] || c0;
  }

  /** Tacche "tonde" per l'asse y. */
  function tacche(min, max, quante) {
    if (max <= min) max = min + 1;
    var grezzo = (max - min) / Math.max(1, quante);
    var p10 = Math.pow(10, Math.floor(Math.log(grezzo) / Math.LN10));
    var err = grezzo / p10;
    var passo = p10 * (err >= 7.07 ? 10 : err >= 3.16 ? 5 : err >= 1.41 ? 2 : 1);
    var lo = Math.floor(min / passo) * passo, hi = Math.ceil(max / passo) * passo;
    var out = [];
    for (var v = lo; v <= hi + passo / 2; v += passo) out.push(E.r2(v));
    return out;
  }

  // ------------------------------------------------------- classifica generale
  function Generale(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var f1 = d.settings.classifica === 'f1';
    var meta = f1 ? 'Formula 1: ' + (d.settings.puntiF1 || []).join('-') : 'Classifica a punti totali';
    var giocato = d.classifica.some(function (r) { return r.giocate; });
    var footer = html`<span class="tiny muted">${f1 ? 'Ogni giornata assegna punti in base al piazzamento (a pari merito, stessi punti). ' : 'Pt = somma dei fantapunti di tutte le giornate. '}A parità di punti contano fantapunti, giornate vinte e punteggio migliore.</span>`;
    return html`<${UI.Card} title="Classifica generale" meta=${meta} flush=${true} footer=${footer}>
      ${!giocato ? html`<div class="banner" style=${{ margin: '0 16px 12px' }}>La classifica si muove dopo la prima giornata con i risultati importati da 4Fence.</div>` : null}
      <div class="tbl-wrap">
        <table class="tbl gc-rank">
          <thead><tr>
            <th class="c">Pos</th>
            <th>Squadra</th>
            <th class="r" title=${f1 ? 'Punti Formula 1' : 'Fantapunti totali'}>Pt</th>
            ${f1 ? html`<th class="r gc-hide-sm" title="Somma dei fantapunti">Fantapunti</th>` : null}
            <th class="r gc-hide-sm" title="Giornate giocate">G</th>
            <th class="r gc-hide-sm" title="Giornate vinte (anche a pari merito)">Vinte</th>
            <th class="r gc-hide-sm" title="Media fantapunti per giornata">Media</th>
            <th class="r gc-hide-sm" title="Miglior punteggio in una giornata">Migliore</th>
            <th class="gc-hide-sm" title="Piazzamento nelle ultime 5 giornate">Ultime 5</th>
          </tr></thead>
          <tbody>${d.classifica.map(function (r) {
            var t = s.squadre[r.id];
            var ult = r.ultimi.slice(-5);
            var minis = ult.length ? html`<div class="gc-minis">${ult.map(function (u) {
              return html`<span key=${u.n} class=${'gc-mini ' + formClass(u)} title=${'G' + u.n + ': ' + UI.fmt(u.v) + ' fantapunti, ' + u.pos + '° di ' + u.di}>${u.pos}°</span>`;
            })}</div>` : null;
            return html`<tr key=${r.id} class=${r.id === s.uid ? 'gc-me' : ''}>
              <td class="c"><span class="pos">${r.giocate ? r.pos : '–'}</span></td>
              <td><div class="gc-sq">
                <${UI.TeamMask} team=${t} size=${32}/>
                <div class="gc-sq-t"><b>${t ? t.nome : '—'}</b><span>${FS.nomeGiocatore(r.id)}</span>
                  <div class="gc-only-sm gc-sq-x">${r.giocate} G · ${r.vinte} ${r.vinte === 1 ? 'vinta' : 'vinte'} · media ${r.giocate ? UI.fmt(r.media) : '–'}${f1 ? ' · ' + UI.fmt(r.fantapunti) + ' fp' : ''}</div>
                  ${minis ? html`<div class="gc-only-sm gc-sq-f">${minis}</div>` : null}
                </div>
              </div></td>
              <td class="r"><span class="gc-pt">${UI.fmt(r.punti)}</span></td>
              ${f1 ? html`<td class="r gc-hide-sm">${UI.fmt(r.fantapunti)}</td>` : null}
              <td class="r gc-hide-sm">${r.giocate}</td>
              <td class="r gc-hide-sm">${r.vinte}</td>
              <td class="r gc-hide-sm">${r.giocate ? UI.fmt(r.media) : '–'}</td>
              <td class="r gc-hide-sm">${r.migliore === null ? '–' : UI.fmt(r.migliore)}</td>
              <td class="gc-hide-sm">${minis || html`<span class="faint">–</span>`}</td>
            </tr>`;
          })}</tbody>
        </table>
      </div>
    <//>`;
  }

  // ------------------------------------------------------ punteggi per giornata
  function Matrice(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var data = useMemo(function () {
      var ns = giornateConPunti(d);
      var best = {};
      ns.forEach(function (n) {
        var e = d.esitiTot[n] || {};
        var vals = d.teamIds.filter(function (t) { return e[t] !== undefined && e[t] !== null; }).map(function (t) { return Number(e[t]); });
        best[n] = vals.length ? Math.max.apply(null, vals) : null;
      });
      var note = {};
      s.rettifiche.forEach(function (r) {
        var k = Number(r.n) + '__' + r.teamId;
        (note[k] = note[k] || []).push(UI.segno(r.punti) + (r.nota ? ' (' + r.nota + ')' : ''));
      });
      return { ns: ns, best: best, note: note };
    }, [s.version]);
    var f1 = d.settings.classifica === 'f1';
    if (!data.ns.length) {
      return html`<${UI.Card} title="Punteggi per giornata">
        <${UI.Empty} title="Ancora nessuna giornata">I risultati arrivano da 4Fence dopo ogni gara: il presidente li importa.<//>
      <//>`;
    }
    var conRett = [];
    s.rettifiche.forEach(function (r) { if (d.teamIds.indexOf(r.teamId) >= 0 && data.ns.indexOf(Number(r.n)) >= 0) conRett.push(r); });
    conRett.sort(function (a, b) { return Number(a.n) - Number(b.n) || (a.at || 0) - (b.at || 0); });
    var provv = data.ns.some(function (n) { return !(s.esiti[n] && s.esiti[n].ufficiale); });
    var piede = conRett.length ? html`<div class="gc-note small">${conRett.map(function (r) {
      return html`<div key=${r.id}><span class="gc-ast">*</span> G${r.n} · ${FS.nomeSquadra(r.teamId)}: ${UI.segno(r.punti)}${r.nota ? ' (' + r.nota + ')' : ''}</div>`;
    })}</div>` : null;
    return html`<${UI.Card} title="Punteggi per giornata" meta=${html`<span>In verde il migliore di ogni giornata · * rettifica${provv ? html`<span> · <i class="gc-dot live" aria-hidden="true"></i> provvisoria</span>` : null}</span>`} flush=${true} footer=${piede}>
      <div class="tbl-wrap">
        <table class="tbl gc-matrix">
          <thead><tr>
            <th class="gc-stick">Squadra</th>
            ${data.ns.map(function (n) {
              var g = s.giornate[n];
              var uff = !!(s.esiti[n] && s.esiti[n].ufficiale);
              return html`<th class="r" key=${n}>
                <button type="button" class="linkbtn gc-colbtn" title=${nomeG(s, n) + (g ? ' · ' + UI.finestra(g) : '') + (uff ? ' · ufficiale' : ' · provvisoria') + ' · apri la giornata'} onClick=${function () { apriGiornata(n, p.go); }}>G${n}</button>
                ${uff ? null : html`<span class="gc-prov" title="Provvisoria"><i class="gc-dot live" aria-hidden="true"></i><span class="sr-only">provvisoria</span></span>`}
              </th>`;
            })}
            <th class="r">Totale</th>
          </tr></thead>
          <tbody>${d.classifica.map(function (r) {
            var t = s.squadre[r.id];
            return html`<tr key=${r.id} class=${r.id === s.uid ? 'gc-me' : ''}>
              <td class="gc-stick"><div class="gc-sq"><${UI.TeamMask} team=${t} size=${26} noLabel=${true}/><div class="gc-sq-t"><b>${t ? t.nome : '—'}</b></div></div></td>
              ${data.ns.map(function (n) {
                var e = d.esitiTot[n] || {};
                var v = e[r.id];
                if (v === undefined || v === null) return html`<td class="r faint" key=${n} title="Nessuna formazione valida">–</td>`;
                var rt = (d.rettifiche[n] || {})[r.id];
                var isBest = data.best[n] !== null && Number(v) === data.best[n];
                var tip = rt ? 'Include una rettifica del presidente: ' + (data.note[n + '__' + r.id] || [UI.segno(rt)]).join(', ') : '';
                var u = f1 ? r.ultimi.filter(function (x) { return x.n === n; })[0] : null;
                return html`<td class="r" key=${n} title=${tip}>
                  ${isBest ? html`<span class="tag green">${UI.fmt(v)}</span>` : UI.fmt(v)}${rt ? html`<span class="gc-ast" aria-label="con rettifica">*</span>` : null}
                  ${u ? html`<span class="gc-f1">+${d.settings.puntiF1[u.pos - 1] || 0} pt</span>` : null}
                </td>`;
              })}
              <td class="r"><b>${UI.fmt(r.fantapunti)}</b></td>
            </tr>`;
          })}</tbody>
        </table>
      </div>
    <//>`;
  }

  // ----------------------------------------------------------------- andamento
  function Andamento(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var ref = useRef(null);
    var wst = useState(640); var w = wst[0], setW = wst[1];
    var fst = useState(null); var focus = fst[0], setFocus = fst[1];
    var hst = useState(null); var hover = hst[0], setHover = hst[1];
    var cst = useState(null); var cross = cst[0], setCross = cst[1];
    useEffect(function () {
      var el = ref.current;
      if (!el) return undefined;
      function misura() {
        var cw = Math.round(el.clientWidth);
        if (cw > 0) setW(function (prev) { return Math.abs(prev - cw) > 2 ? cw : prev; });
      }
      misura();
      if (root.ResizeObserver) {
        var ro = new root.ResizeObserver(misura);
        ro.observe(el);
        return function () { ro.disconnect(); };
      }
      root.addEventListener('resize', misura);
      return function () { root.removeEventListener('resize', misura); };
    }, []);
    var f1 = d.settings.classifica === 'f1';
    UI.useMq('(prefers-color-scheme: dark)'); // ridisegna quando cambia il tema del sistema
    var scuro = temaScuro();
    var data = useMemo(function () {
      var ns = giornateConPunti(d);
      var punti = d.settings.puntiF1 || [];
      var conta = {}, usati = [];
      var series = d.classifica.map(function (r, i) {
        var t = s.squadre[r.id] || {};
        var col = coloreSerie(t, i, scuro, usati);
        usati.push(col);
        conta[col] = (conta[col] || 0) + 1;
        var dup = conta[col];
        var perN = {};
        r.ultimi.forEach(function (u) { perN[u.n] = u; });
        var acc = 0;
        var vals = ns.map(function (n) {
          var u = perN[n];
          if (u) acc += f1 ? (punti[u.pos - 1] || 0) : (Number(u.v) || 0);
          return E.r2(acc);
        });
        return { id: r.id, team: t, color: col, dash: dup === 1 ? null : dup === 2 ? '7 4' : '2 4', bordo: serveBordo(col), vals: vals };
      });
      var tutti = [0];
      series.forEach(function (x) { tutti = tutti.concat(x.vals); });
      return { ns: ns, series: series, min: Math.min.apply(null, tutti), max: Math.max.apply(null, tutti) };
    }, [s.version, scuro]);
    var ok = data.ns.length >= 2;
    var titoloY = f1 ? 'Punti F1 cumulati' : 'Fantapunti cumulati';
    var emph = hover || focus || s.uid;
    var dim = !!(hover || focus);

    function grafico() {
      var W = Math.max(280, w);
      var H = W < 480 ? 236 : 296;
      var m = { l: 46, r: 18, t: 30, b: 42 };
      var pw = W - m.l - m.r, ph = H - m.t - m.b;
      var tk = tacche(data.min, data.max, W < 480 ? 4 : 6);
      var y0 = tk[0], y1 = tk[tk.length - 1];
      var nn = data.ns.length;
      var passo = pw / (nn - 1);
      var ogni = Math.max(1, Math.ceil(34 / passo));
      function X(i) { return m.l + i * passo; }
      function Y(v) { return m.t + ph - (v - y0) / ((y1 - y0) || 1) * ph; }
      function indiceDa(e) {
        var svg = e.currentTarget;
        var rc = svg.getBoundingClientRect();
        if (!rc.width) return null;
        var px = (e.clientX - rc.left) * (W / rc.width);
        return Math.max(0, Math.min(nn - 1, Math.round((px - m.l) / passo)));
      }
      var ordinate = data.series.filter(function (x) { return x.id !== emph; }).concat(data.series.filter(function (x) { return x.id === emph; }));
      var ci = cross === null ? null : Math.min(cross, nn - 1);
      var tip = null;
      if (ci !== null) {
        var righe = data.series.map(function (x) { return { x: x, v: x.vals[ci] }; }).sort(function (a, b) { return b.v - a.v; });
        var aDestra = X(ci) > W / 2;
        var spazio = Math.round(aDestra ? X(ci) - 12 : W - X(ci) - 12);
        var pos = aDestra ? { right: Math.round(W - X(ci) + 12) + 'px' } : { left: Math.round(X(ci) + 12) + 'px' };
        pos.maxWidth = Math.min(260, Math.max(120, spazio)) + 'px';
        tip = html`<div class="gc-tip" style=${pos} role="status">
          <div class="h">G${data.ns[ci]} · ${nomeG(s, data.ns[ci])}</div>
          ${righe.map(function (rr) {
            return html`<div class=${'r' + (rr.x.id === s.uid ? ' gc-me' : '')} key=${rr.x.id}>
              <span class=${'k' + (rr.x.bordo ? ' cased' : '')} style=${{ borderTopColor: rr.x.color, borderTopStyle: rr.x.dash ? (rr.x.dash === '7 4' ? 'dashed' : 'dotted') : 'solid' }}></span>
              <b>${UI.fmt(rr.v)}</b><span class="nm">${rr.x.team.nome || 'Squadra'}</span>
            </div>`;
          })}
        </div>`;
      }
      /** Posizione dell'etichetta finale della squadra evidenziata: sopra o sotto il punto, lontano dagli altri arrivi. */
      var lblAlto = function (x) {
        var y = Y(x.vals[nn - 1]);
        var altri = data.series.filter(function (o) { return o.id !== x.id; }).map(function (o) { return Y(o.vals[nn - 1]); });
        var cand = [y - 10, y + 20].filter(function (c) { return c - 12 >= m.t && c <= m.t + ph; });
        var libero = cand.filter(function (c) { return altri.every(function (oy) { return Math.abs(oy - (c - 4)) > 12; }); })[0];
        return libero === undefined ? null : libero;
      };
      return html`<div class="gc-plot">
        <svg viewBox=${'0 0 ' + W + ' ' + H} width=${W} height=${H} tabIndex="0" role="img"
          aria-label=${titoloY + ' giornata per giornata. Usa le frecce per scorrere le giornate; i valori sono anche nella tabella dei punteggi.'}
          onPointerDown=${function (e) { var i = indiceDa(e); if (i !== null) setCross(i); }}
          onPointerMove=${function (e) { var i = indiceDa(e); if (i !== null && i !== cross) setCross(i); }}
          onPointerLeave=${function (e) { if (e.pointerType !== 'touch') setCross(null); }}
          onBlur=${function () { setCross(null); }}
          onKeyDown=${function (e) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              var cur = cross === null ? (e.key === 'ArrowRight' ? -1 : nn) : cross;
              setCross(Math.max(0, Math.min(nn - 1, cur + (e.key === 'ArrowRight' ? 1 : -1))));
            } else if (e.key === 'Escape') setCross(null);
          }}>
          <g class="gc-grid">${tk.map(function (v) {
            return html`<line key=${'g' + v} x1=${m.l} x2=${W - m.r} y1=${Y(v)} y2=${Y(v)}/>`;
          })}</g>
          <g class="gc-ax">
            ${tk.map(function (v) { return html`<text key=${'y' + v} x=${m.l - 8} y=${Y(v) + 4} textAnchor="end">${UI.fmt(v)}</text>`; })}
            ${data.ns.map(function (n, i) {
              if ((nn - 1 - i) % ogni !== 0) return null;
              return html`<text key=${'x' + n} x=${X(i)} y=${m.t + ph + 18} textAnchor="middle">G${n}</text>`;
            })}
            <text class="ttl" x=${m.l + pw / 2} y=${H - 4} textAnchor="middle">Giornata</text>
            <text class="ttl" x=${4} y=${14} textAnchor="start">${titoloY}</text>
          </g>
          <line class="gc-base" x1=${m.l} x2=${W - m.r} y1=${Y(Math.max(y0, Math.min(0, y1)))} y2=${Y(Math.max(y0, Math.min(0, y1)))}/>
          ${ci !== null ? html`<line class="gc-cross" x1=${X(ci)} x2=${X(ci)} y1=${m.t} y2=${m.t + ph}/>` : null}
          ${ordinate.map(function (x) {
            var isE = x.id === emph;
            var dpath = x.vals.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
            var sw = isE ? 3.5 : 2;
            var ultimo = x.vals[nn - 1];
            var yl = isE ? lblAlto(x) : null;
            return html`<g key=${x.id} opacity=${dim && !isE ? 0.25 : 1}>
              ${x.bordo ? html`<path class="gc-casing" d=${dpath} fill="none" strokeWidth=${sw + 2.5} strokeLinejoin="round" strokeLinecap="round"/>` : null}
              <path d=${dpath} fill="none" stroke=${x.color} strokeWidth=${sw} strokeLinejoin="round" strokeLinecap="round" strokeDasharray=${x.dash || undefined}/>
              ${x.vals.map(function (v, i) {
                var on = isE || ci === i;
                if (!on && i !== nn - 1) return null;
                return html`<circle key=${i} class=${'gc-dotp' + (x.bordo ? ' cased' : '')} cx=${X(i)} cy=${Y(v)} r=${isE ? 4.5 : 4} fill=${x.color}/>`;
              })}
              ${yl !== null ? html`<text class="gc-endlbl" x=${X(nn - 1) - 8} y=${yl} textAnchor="end">${UI.fmt(ultimo)}</text>` : null}
            </g>`;
          })}
        </svg>
        ${tip}
      </div>`;
    }

    return html`<${UI.Card} title="Andamento" cls="gc-and">
      <div ref=${ref} class="gc-chart">
        ${ok ? grafico() : html`<${UI.Empty} title="Il grafico arriva presto">Servono almeno due giornate giocate per disegnare l'andamento della classifica.<//>`}
      </div>
      ${ok ? html`<div class="gc-legend" role="group" aria-label="Evidenzia una squadra">${data.series.map(function (x) {
        return html`<button type="button" key=${x.id} class=${'gc-leg' + (x.id === s.uid ? ' gc-me' : '')} aria-pressed=${focus === x.id}
          title=${focus === x.id ? 'Togli l\'evidenza' : 'Evidenzia nel grafico'}
          onClick=${function () { setFocus(focus === x.id ? null : x.id); }}
          onMouseEnter=${function () { setHover(x.id); }} onMouseLeave=${function () { setHover(null); }}
          onFocus=${function () { setHover(x.id); }} onBlur=${function () { setHover(null); }}>
          <span class=${'sw' + (x.bordo ? ' cased' : '')} style=${{ borderTopColor: x.color, borderTopStyle: x.dash ? (x.dash === '7 4' ? 'dashed' : 'dotted') : 'solid' }}></span>
          <${UI.TeamMask} team=${x.team} size=${22} noLabel=${true}/>
          <span class="nm">${x.team.nome || 'Squadra'}</span>
        </button>`;
      })}</div>` : null}
    <//>`;
  }

  // ------------------------------------------------------------------- albo
  function Albo(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var ns = giornateConPunti(d);
    if (!ns.length) {
      return html`<${UI.Card} title="Albo delle giornate">
        <${UI.Empty} title="Albo ancora vuoto">Qui compariranno le squadre che vincono ogni giornata.<//>
      <//>`;
    }
    return html`<${UI.Card} title="Albo delle giornate" meta=${ns.length + (ns.length === 1 ? ' giornata' : ' giornate')}>
      <div class="list">${ns.map(function (n) {
        var e = d.esitiTot[n] || {};
        var ids = d.teamIds.filter(function (t) { return e[t] !== undefined && e[t] !== null; });
        var max = Math.max.apply(null, ids.map(function (t) { return Number(e[t]); }));
        var win = ids.filter(function (t) { return Number(e[t]) === max; });
        var g = s.giornate[n];
        var uff = !!(s.esiti[n] && s.esiti[n].ufficiale);
        var mia = win.indexOf(s.uid) >= 0;
        return html`<button type="button" key=${n} class=${'li gc-li-btn' + (mia ? ' gc-me' : '')} title="Apri la giornata" onClick=${function () { apriGiornata(n, p.go); }}>
          <span class="gc-albo-n">G${n}</span>
          <span class="gc-masks">${win.map(function (t) { return html`<${UI.TeamMask} key=${t} team=${s.squadre[t]} size=${30} noLabel=${win.length > 1}/>`; })}</span>
          <span class="body">
            <span class="title">${elenco(win.map(function (t) { return FS.nomeSquadra(t); }))}</span>
            <span class="sub">${uff ? null : html`<${React.Fragment}><i class="gc-dot live" title="Provvisoria" aria-hidden="true"></i> <//>`}${g ? UI.finestra(g) : nomeG(s, n)}${win.length > 1 ? ' · pari merito' : ''}${uff ? '' : html`<span class="sr-only"> · provvisoria</span>`}</span>
          </span>
          ${mia ? html`<span class="tag blue gc-tua">La tua</span>` : null}
          <span class="gc-albo-v">${UI.fmt(max)}</span>
        </button>`;
      })}</div>
    <//>`;
  }

  // ------------------------------------------------------------------- vista
  V.Classifica = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var crumbs = html`<div class="crumbs"><span class="c">${d.lega.nome}</span><span class="faint">›</span><span class="c on">Classifica</span></div>`;
    if (!d.teamIds.length) {
      return html`<div class="stack">${crumbs}
        <${UI.Card} title="Classifica"><${UI.Empty} title="Nessuna squadra iscritta">Condividi il codice ${d.lega.codice} per far entrare gli amici nella lega.<//><//>
      </div>`;
    }
    return html`<div class="stack">
      ${crumbs}
      <${Generale}/>
      <div class="grid grid-main">
        <div class="stack">
          <${Andamento}/>
          <${Matrice} go=${p.go}/>
        </div>
        <div class="stack">
          <${Albo} go=${p.go}/>
        </div>
      </div>
    </div>`;
  };
})(window);
