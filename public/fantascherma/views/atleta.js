/* Scheda atleta (modale, aperta con UI.openAtleta(fis)): anagrafica e categoria, quotazioni, squadre
 * proprietarie, numeri di stagione/carriera, prossima giornata, andamento del fantavoto e storico gare 4Fence.
 * Stili extra: src/css/listone-atleta-rose.css */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useMemo = React.useMemo;
  var CLUB = 'MISPM';
  var ARMI = { SP: 'Spada', FL: 'Fioretto', SC: 'Sciabola' };

  function stagLabel(y) { return y ? y + '/' + String(y + 1).slice(2) : ''; }
  function eF(a, m, f) { return a && a.sesso === 'F' ? f : m; }
  function maiusc(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  function n0(x) { return Number(x) || 0; }

  /** Assalti di diretta in ordine di turno (dal tabellone più ampio alla finale). */
  function diretta(raw) {
    var de = (raw.de || []).slice().sort(function (x, y) { return n0(y.r) - n0(x.r); });
    if (!de.length) return null;
    return { de: de, last: de[de.length - 1], vinti: de.filter(function (b) { return b.v; }).length };
  }

  // ------------------------------------------------------------------ numeri
  function Tile(p) {
    return html`<div class="at-tile">
      <div class="v">${p.v}</div>
      <div class="l">${p.l}</div>
      ${p.children || null}
      ${p.x ? html`<div class="x">${p.x}</div>` : null}
    </div>`;
  }

  function Numeri(p) {
    var sc = p.scope === 'stagione' ? p.stats.stagione : p.stats.tutto;
    var assalti = sc.vittorieGirone + sc.sconfitteGirone;
    var pct = assalti ? Math.round(100 * sc.vittorieGirone / assalti) : 0;
    return html`<section class="at-sec">
      <div class="at-sec-h">
        <h3>Numeri</h3>
        <div class="at-pills" role="group" aria-label="Periodo delle statistiche">
          <button type="button" class="pill" aria-pressed=${p.scope === 'stagione'} onClick=${function () { p.setScope('stagione'); }}>Stagione ${stagLabel(p.stagione)}</button>
          <button type="button" class="pill" aria-pressed=${p.scope === 'tutto'} onClick=${function () { p.setScope('tutto'); }}>Tutte le gare</button>
        </div>
      </div>
      <div class="at-tiles">
        <${Tile} v=${sc.presenze} l="Presenze"/>
        <${Tile} v=${sc.presenze ? UI.fmt(sc.fm, 2) : '–'} l="Fantamedia"/>
        <${Tile} v=${assalti ? pct + '%' : '–'} l="Vinti nei gironi" x=${assalti ? sc.vittorieGirone + ' V · ' + sc.sconfitteGirone + ' S' : ''}>
          ${assalti ? html`<div class="at-ratio" aria-hidden="true"><i class="v" style=${{ width: pct + '%' }}></i><i class="s" style=${{ width: (100 - pct) + '%' }}></i></div>` : null}
        <//>
        <${Tile} v=${sc.vittorieDiretta} l="Vinti in diretta"/>
        <${Tile} v=${sc.podi} l="Podi"/>
        <${Tile} v=${sc.ori} l="Ori"/>
      </div>
      ${!sc.presenze ? html`<p class="small muted" style=${{ margin: '10px 0 0' }}>${p.scope === 'stagione'
        ? 'Nessuna gara ancora disputata nella stagione ' + stagLabel(p.stagione) + ': i numeri arrivano con i primi risultati importati da 4Fence.'
        : 'Nessuna gara importata da 4Fence per questo atleta.'}</p>` : null}
    </section>`;
  }

  // -------------------------------------------------------- prossima giornata
  function Prossima(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var g = d.prossima;
    if (!g) {
      return html`<section class="at-sec">
        <div class="at-sec-h"><h3>Prossima giornata</h3></div>
        <div class="small muted">Nessuna giornata in calendario per ora.</div>
      </section>`;
    }
    // le presenze di stagione affinano la stima della probabilità
    var pr = UI.probabile(Object.assign({}, p.atleta, { stats: { presenze: p.presenze } }), g, s, d);
    var tag = pr.lvl === 'ok' ? ['green', pr.pct >= 100 ? 'In pedana' : 'Probabile'] : pr.lvl === 'no' ? ['red', 'Non disponibile'] : ['', 'In dubbio'];
    return html`<section class="at-sec">
      <div class="at-sec-h"><h3>Prossima giornata</h3><span class="small muted">${g.nome || 'Giornata ' + g.n} · ${UI.finestra(g)}</span></div>
      <div class="at-box">
        <div class="row between">
          <div class="row at-prob"><${UI.ProbBar} prob=${pr}/><b class="num">${pr.pct}%</b><span class=${'tag ' + tag[0]}>${tag[1]}</span></div>
          <span class="tiny muted">Formazione entro ${UI.dataOra(d.scadenza(g))}</span>
        </div>
        <div class="small" style=${{ marginTop: '8px' }}>${pr.label}</div>
        ${pr.previste && pr.previste.length > 1 ? html`<ul class="at-previste">${pr.previste.slice(0, 4).map(function (x, i) {
          return html`<li key=${i} class="small muted">${x.nome}${x.data ? ' · ' + UI.data(x.data, true) : ''}${x.luogo ? ' · ' + x.luogo : ''}</li>`;
        })}</ul>` : null}
        <div class="tiny faint" style=${{ marginTop: '6px' }}>Stima dal calendario delle gare previste per la sua categoria. Se disputa più gare nella giornata, vale la prima in ordine di data.</div>
      </div>
    </section>`;
  }

  // ---------------------------------------------------------------- andamento
  function Andamento(p) {
    var pts = p.punti;
    if (pts.length < 2) return null;
    var W = 600, H = 130, PX = 12, PY = 14, base = p.base;
    var vals = pts.map(function (x) { return x.fv; });
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    var lo = Math.min(base - 1, min), hi = Math.max(base + 1, max);
    function X(i) { return PX + (W - 2 * PX) * i / (pts.length - 1); }
    function Y(v) { return PY + (H - 2 * PY) * (1 - (v - lo) / (hi - lo)); }
    var linea = pts.map(function (x, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x.fv).toFixed(1); }).join(' ');
    var area = linea + ' L' + X(pts.length - 1).toFixed(1) + ' ' + (H - PY) + ' L' + X(0).toFixed(1) + ' ' + (H - PY) + ' Z';
    var media = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    return html`<section class="at-sec">
      <div class="at-sec-h"><h3>Andamento</h3><span class="small muted">Fantavoto nelle ultime ${pts.length} gare · migliore ${UI.fmt(max)} · media ${UI.fmt(media, 2)}</span></div>
      <figure class="at-spark">
        <svg viewBox=${'0 0 ' + W + ' ' + H} role="img" aria-label=${'Fantavoto gara per gara: da ' + UI.fmt(vals[0]) + ' a ' + UI.fmt(vals[vals.length - 1]) + ', migliore ' + UI.fmt(max)} style=${{ display: 'block', width: '100%', height: 'auto' }}>
          <path d=${area} style=${{ fill: 'var(--accent-soft)', stroke: 'none' }}/>
          <line x1=${PX} x2=${W - PX} y1=${Y(base).toFixed(1)} y2=${Y(base).toFixed(1)} style=${{ stroke: 'var(--faint)', strokeWidth: 1.5, strokeDasharray: '5 5' }}/>
          <path d=${linea} style=${{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' }}/>
          ${pts.map(function (x, i) {
            var col = x.fv > base + 3 ? 'var(--lamp-green)' : x.fv < base ? 'var(--lamp-red)' : 'var(--accent)';
            return html`<circle key=${i} cx=${X(i).toFixed(1)} cy=${Y(x.fv).toFixed(1)} r="5" style=${{ fill: col, stroke: 'var(--card)', strokeWidth: 2 }}><title>${UI.data(x.data) + ' · ' + x.nome + ': ' + UI.fmt(x.fv)}</title></circle>`;
          })}
        </svg>
        <figcaption class="row between tiny muted"><span>${UI.data(pts[0].data)}</span><span>tratteggio = voto base ${UI.fmt(base)}</span><span>${UI.data(pts[pts.length - 1].data)}</span></figcaption>
      </figure>
    </section>`;
  }

  // ------------------------------------------------------------ storico gare
  function Assalto(p) {
    var b = p.b;
    var derby = b.oppClub === CLUB;
    var compagno = derby && b.oppFis && p.atleti[String(b.oppFis)];
    return html`<div class="at-bout">
      <span class="at-turno">${maiusc(E.nomeTurno(b.r))}</span>
      <span class="at-opp">
        ${compagno ? html`<button type="button" class="linkbtn" onClick=${function () { UI.openAtleta(String(b.oppFis)); }}>${b.opp || UI.nomeAtleta(compagno)}</button>` : (b.opp || 'Avversario')}
        ${b.oppSeed ? html`<span class="tiny muted ls-ml">TdS n.${b.oppSeed}</span>` : null}
        ${derby ? html`<span class="tag gold ls-ml">Derby San Paolo</span>` : null}
      </span>
      <span class="at-score">${n0(b.td)}–${n0(b.tr)}</span>
      <span class=${'tag ' + (b.v ? 'green' : 'red')}>${b.v ? 'V' : 'S'}</span>
    </div>`;
  }

  function GaraRow(p) {
    var x = p.x, g = x.gara, raw = x.raw || {}, a = p.atleta;
    var gir = raw.girone;
    var conGirone = !!gir && n0(gir.v) + n0(gir.s) > 0;
    var ind = conGirone ? n0(gir.td) - n0(gir.tr) : 0;
    var dir = diretta(raw);
    var detId = 'at-det-' + p.idx;
    var u = p.uso;
    var statoTag = raw.stato === 'ritirato' ? eF(a, 'Ritirato', 'Ritirata') : raw.stato === 'escluso' ? eF(a, 'Escluso', 'Esclusa') : '';
    return html`<div class="at-gara">
      <div class="at-gara-main">
        <div class="at-date">${UI.data(g.data)}</div>
        <div>
          <div class="at-gara-nome">${g.url ? html`<a href=${g.url} target="_blank" rel="noopener noreferrer" title="Apri i risultati su 4Fence">${UI.nomeGara(g)}</a>` : UI.nomeGara(g)}</div>
          <div class="at-gara-meta">
            ${conGirone ? html`<span class="at-chip" title=${'Girone: ' + n0(gir.v) + ' vinti e ' + n0(gir.s) + ' persi, stoccate date ' + n0(gir.td) + ' e ricevute ' + n0(gir.tr)}>Girone <b>${n0(gir.v)}–${n0(gir.s)}</b><span class="num">ind. ${ind > 0 ? '+' + ind : ind}</span><${UI.Lamps} v=${n0(gir.v)} s=${n0(gir.s)}/></span>` : null}
            ${dir ? html`<span class="at-chip" title=${dir.vinti + (dir.vinti === 1 ? ' assalto vinto' : ' assalti vinti') + ' in diretta'}>Diretta: <b>${maiusc(E.nomeTurno(dir.last.r))}</b><i class=${'lamp ' + (dir.last.v ? 'v' : 's')}></i></span>`
              : raw.qualificato === false ? html`<span class="at-chip">Si ferma ai gironi</span>` : null}
            ${raw.place ? html`<span class="at-chip"><${UI.Medal} place=${raw.place}/>${raw.of ? 'su ' + raw.of : ''}</span>` : null}
            ${statoTag ? html`<span class="tag red">${statoTag}</span>` : null}
            ${u ? (u.conta
              ? html`<span class="tag blue" title=${'Fantavoto valido per la giornata ' + u.n}>G${u.n}</span>`
              : html`<span class="tag" title=${'Seconda gara nella giornata ' + u.n + ': vale la prima in ordine di data'}>G${u.n} · non conta</span>`) : null}
          </div>
        </div>
        <button type="button" class="at-fvbtn" aria-expanded=${!!p.aperto} aria-controls=${detId} title="Bonus e malus del fantavoto" onClick=${p.onToggle}>
          <${UI.FV} v=${x.fv} base=${p.base}/><span class="at-chev" aria-hidden="true">▾</span>
        </button>
      </div>
      ${p.aperto ? html`<div class="at-det" id=${detId}>
        <div>
          <div class="eyebrow" style=${{ marginBottom: '4px' }}>Come nasce il fantavoto</div>
          <${UI.Voci} voci=${x.voci}/>
          <div class="at-tot"><span>Fantavoto</span><span>${UI.fmt(x.fv)}</span></div>
        </div>
        <div>
          <div class="eyebrow" style=${{ marginBottom: '4px' }}>Eliminazione diretta${raw.seed ? ' · testa di serie n.' + raw.seed : ''}</div>
          ${dir ? dir.de.map(function (b, i) { return html`<${Assalto} key=${i} b=${b} atleti=${p.atleti}/>`; })
            : html`<div class="small muted">${raw.qualificato === false ? 'Non ha disputato la diretta.' : 'Nessun assalto di diretta registrato.'}</div>`}
          ${conGirone ? html`<div class="tiny muted" style=${{ marginTop: '8px' }}>Girone${gir.num ? ' n.' + gir.num : ''}: stoccate date ${n0(gir.td)}, ricevute ${n0(gir.tr)}${gir.pos ? ' · ' + gir.pos + '° dopo i gironi' + (gir.of ? ' su ' + gir.of : '') : ''}</div>` : null}
        </div>
      </div>` : null}
    </div>`;
  }

  // -------------------------------------------------------------------- vista
  // Chiave = fis: aprendo un altro atleta dalla scheda (es. un derby) la modale riparte dall'alto,
  // con periodo e righe espanse azzerati.
  V.Atleta = function (p) {
    return html`<${Scheda} key=${String(p.fis || '')} fis=${p.fis} onClose=${p.onClose}/>`;
  };

  function Scheda(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var scopeSt = useState(null);
    var apertiSt = useState({});
    var compraSt = useState(false); // listone: conferma d'acquisto in linea (niente seconda modale sopra la scheda)
    var phone = UI.useMq(UI.PHONE);
    var fis = String(p.fis || '');
    var a = s.atleti[fis] || Object.values(s.atleti).filter(function (x) { return String(x.fis) === fis; })[0] || null;
    var stats = useMemo(function () {
      if (!a) return null;
      if (d.statsAtleti[fis]) return d.statsAtleti[fis];
      var tutto = E.statisticheAtleta(a, s.gare, d.settings);
      var stag = E.statisticheAtleta(a, s.gare, d.settings, d.stagione);
      var qtI = Number(a.quotazione) || 1;
      return { tutto: tutto, stagione: stag, qtI: qtI, qtA: qtI };
    }, [s.version, fis]);
    // per ogni gara: in quale giornata conta (la prima in ordine di data) o se è stata scartata
    var uso = useMemo(function () {
      var m = {};
      if (!a) return m;
      d.attive.forEach(function (g) {
        if (!g || !g.dal || !g.al) return;
        var pr = E.prestazione(a, g, s.gare, d.settings, d.stagione);
        if (pr.gara && !m[pr.gara.id]) m[pr.gara.id] = { n: g.n, conta: true };
        (pr.altre || []).forEach(function (id) { if (!m[id]) m[id] = { n: g.n, conta: false }; });
      });
      return m;
    }, [s.version, fis]);

    if (!a || !stats) {
      return html`<${UI.Modal} title="Scheda atleta" onClose=${p.onClose}>
        <${UI.Empty} title="Atleta non trovato">Potrebbe essere stato tolto dal listone.<//>
      <//>`;
    }

    var info = UI.infoAtleta(a, d);
    var stS = stats.stagione, stT = stats.tutto;
    var scope = scopeSt[0] || (stS.presenze ? 'stagione' : 'tutto');
    var owners = d.proprietari[fis] || [];
    var base = d.settings.punteggio.base;
    var storico = stT.storico;
    var punti = storico.slice(0, 30).reverse().map(function (x) { return { fv: x.fv, data: x.gara.data, nome: UI.nomeGara(x.gara) }; });
    var inf = a.infermeria && a.infermeria.stato ? a.infermeria : null;
    var delta = stats.qtA - stats.qtI;
    var club = !a.club || a.club === CLUB ? 'Scherma San Paolo Milano' : a.club;
    var armi = (a.armi && a.armi.length ? a.armi : ['SP']).map(function (x) { return ARMI[x] || x; }).join(', ');
    var aperti = apertiSt[0];
    /** Listone a budget fisso: si compra anche dalla scheda (stesse regole del mercato), dal fondo fisso della scheda. */
    function compraBox() {
      if (d.modalita !== 'listone' || !d.miaRosa || !s.canWrite || !d.puoComprare || owners.indexOf(s.uid) >= 0) return null;
      var blocco = FS.bloccoAcquisto(fis);
      var prezzo = FS.prezzoAcquisto(fis);
      var resto = d.miaRosa.crediti - prezzo;
      var dopo = resto === 1 ? 'ti resta 1 credito' : 'ti restano ' + resto + ' crediti';
      if (!compraSt[0]) {
        return html`<${React.Fragment}>
          ${blocco ? html`<span id="at-compra-why" class="small muted at-buy-why">${blocco}</span>` : null}
          <button type="button" class="btn at-buy" disabled=${!!blocco} title=${blocco || 'Compra per ' + prezzo + (prezzo === 1 ? ' credito' : ' crediti')} aria-describedby=${blocco ? 'at-compra-why' : null} onClick=${function () { compraSt[1](true); }}>Compra a ${prezzo}${blocco ? '' : html`<span class="at-buy-x">· ${dopo}</span>`}</button>
        <//>`;
      }
      return html`<${React.Fragment}>
        <span class="small at-buy-why">Compri ${UI.nomeAtleta(a)} per ${prezzo === 1 ? '1 credito' : prezzo + ' crediti'}: ${dopo}.</span>
        <button type="button" class="btn ghost" onClick=${function () { compraSt[1](false); }}>Annulla</button>
        <${UI.AsyncBtn} cls="ok" onClick=${function () { return FS.act.acquistaSvincolato(fis).then(function () { compraSt[1](false); }); }}>Conferma l'acquisto<//>
      <//>`;
    }
    function toggle(id) { var o = Object.assign({}, aperti); o[id] = !o[id]; apertiSt[1](o); }

    var gruppi = [];
    storico.forEach(function (x, i) {
      var st = E.stagioneDaData(x.gara.data);
      var ultimo = gruppi[gruppi.length - 1];
      if (!ultimo || ultimo.st !== st) { ultimo = { st: st, items: [] }; gruppi.push(ultimo); }
      ultimo.items.push({ x: x, i: i });
    });

    var piede = compraBox();
    return html`<${UI.Modal} title=${phone ? UI.nomeAtleta(a) : 'Scheda atleta'} onClose=${p.onClose} footer=${piede}>
      ${inf ? html`<div class="banner warn" style=${{ marginBottom: '14px' }}><span class="lamp s"></span><span><b>In infermeria</b>: ${inf.stato}${inf.nota ? ' · ' + inf.nota : ''}${inf.al ? ' · rientro previsto ' + UI.data(inf.al) : ''}</span></div>` : null}
      <div class="at-head">
        <${UI.AtletaMask} atleta=${a} size=${phone ? 64 : 96}/>
        <div class="at-id">
          <div class="at-name">${UI.nomeAtleta(a)}</div>
          <div class="row" style=${{ gap: '8px' }}>
            <${UI.Role} ruolo=${info.ruolo}/>
            <span class="small"><b>${info.cat ? info.cat.label : 'Categoria da definire'}</b> <span class="muted">· categoria ${stagLabel(d.stagione)}</span></span>
          </div>
          <div class="small muted">${E.RUOLI[info.ruolo] ? E.RUOLI[info.ruolo].label + ' · ' : ''}${eF(a, 'Nato', 'Nata')} nel ${a.anno || '—'} · ${a.sesso === 'F' ? 'Femminile' : 'Maschile'} · ${armi}</div>
          <div class="small muted">${club}</div>
        </div>
        <div class="at-qt">
          <div class="at-q" title="Quotazione iniziale in crediti"><span class="l">Qt.I</span><span class="v">${stats.qtI}</span></div>
          <div class="at-q qa" title="Quotazione attuale in crediti"><span class="l">Qt.A</span><span class="v">${stats.qtA}</span>${delta ? html`<span class=${'d ' + (delta > 0 ? 'up' : 'down')}>${delta > 0 ? '▲ +' + delta : '▼ ' + delta}</span>` : null}</div>
        </div>
      </div>
      <div class="at-owners">
        <span class="eyebrow">${owners.length > 1 ? 'Nelle rose di' : owners.length ? 'In rosa' : 'Squadra'}</span>
        ${owners.length ? owners.map(function (t) {
          var team = s.squadre[t];
          var it = d.rose[t] ? d.rose[t].rosa.filter(function (x) { return x.id === fis; })[0] : null;
          return html`<span class=${'at-owner' + (t === s.uid ? ' mine' : '')} key=${t}>
            <${UI.TeamMask} team=${team} size=${26}/><b>${team ? team.nome : FS.nomeSquadra(t)}</b>${it ? html`<span class="tiny muted">pagato ${it.prezzo}</span>` : null}
          </span>`;
        }) : html`<span class="tag green">${d.modalita === 'listone' ? 'In nessuna rosa' : eF(a, 'Svincolato', 'Svincolata')}</span>`}
      </div>
      <${Numeri} stats=${stats} scope=${scope} setScope=${scopeSt[1]} stagione=${d.stagione}/>
      <${Prossima} atleta=${a} presenze=${stS.presenze}/>
      <${Andamento} punti=${punti} base=${base}/>
      <section class="at-sec">
        <div class="at-sec-h"><h3>Storico gare</h3>${storico.length ? html`<span class="small muted">${storico.length === 1 ? '1 gara' : storico.length + ' gare'} da 4Fence</span>` : null}</div>
        ${storico.length ? html`<div class="at-gare">${gruppi.map(function (gr) {
          return html`<${React.Fragment} key=${'st' + gr.st}>
            <div class="at-stag">${gr.st ? 'Stagione ' + stagLabel(gr.st) : 'Data non indicata'} · ${gr.items.length === 1 ? '1 gara' : gr.items.length + ' gare'}</div>
            ${gr.items.map(function (it) {
              var id = fis + '|' + it.x.gara.id;
              return html`<${GaraRow} key=${id} x=${it.x} idx=${it.i} base=${base} uso=${uso[it.x.gara.id]} aperto=${!!aperti[id]}
                onToggle=${function () { toggle(id); }} atleta=${a} atleti=${s.atleti}/>`;
            })}
          <//>`;
        })}</div>` : html`<${UI.Empty} title="Nessuna gara ancora">Appena il presidente importa da 4Fence una gara a cui ha partecipato, la trovi qui con il suo fantavoto.<//>`}
        ${storico.length ? html`<p class="tiny faint" style=${{ margin: '10px 0 0' }}>Tocca il fantavoto per vedere bonus e malus. I tag G indicano la giornata in cui la gara vale.</p>` : null}
      </section>
    <//>`;
  }
})(window);
