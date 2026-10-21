/* Vista Listone ("lista atleti"): tutti gli atleti San Paolo con ruolo, categoria, quotazioni,
 * fantamedia e squadre che lo hanno in rosa (con l'asta a copie: copie prese su quelle disponibili).
 * Con il listone a budget fisso da qui si compra (pulsante «Compra» su ogni riga).
 * Filtri, ordinamento per colonna e consigli in alto.
 * Stili extra: src/css/listone-atleta-rose.css */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useMemo = React.useMemo;
  function nCr(n) { return n + (Math.abs(Number(n)) === 1 ? ' credito' : ' crediti'); }

  var ORD_RUOLO = { U14: 0, U20: 1, SEN: 2 };
  var ORD_CAT = {};
  E.CATEGORIE.forEach(function (c, i) { ORD_CAT[c.code] = i; });

  // k = campo della riga usato per ordinare; dir = verso al primo clic; st = stagione a cui si riferisce
  // ('cur' in corso, 'prec' precedente, 'due' le due insieme); sep = linea di separazione a sinistra
  var COLONNE = [
    { k: 'nome', label: 'Atleta', dir: 'asc' },
    { k: 'oRuolo', label: 'Ruolo', dir: 'asc', cls: 'c', hide: 'ls-hide-xs', title: 'Ruolo: Under 14, Under 20 o Senior' },
    { k: 'oCat', label: 'Cat.', dir: 'asc', hide: 'ls-hide-md', title: 'Categoria agonistica della stagione' },
    { k: 'qtI', label: 'Qt.I', dir: 'desc', cls: 'r', hide: 'ls-hide-md', title: 'Quotazione iniziale (crediti)' },
    { k: 'qtA', label: 'Qt.A', dir: 'desc', cls: 'r', title: 'Quotazione attuale (crediti)' },
    { k: 'fmCur', label: 'FM', st: 'cur', sep: true, dir: 'desc', cls: 'r', title: 'Fantamedia nella stagione in corso (sotto: gare disputate)' },
    { k: 'fmPrec', label: 'FM', st: 'prec', sep: true, dir: 'desc', cls: 'r', title: 'Fantamedia nella stagione scorsa (sotto: gare disputate)' },
    { k: 'oSquadra', label: 'Squadra', dir: 'asc', sep: true, hide: 'ls-hide-xs', title: 'Squadra che lo ha in rosa' },
  ];

  var RUOLI_OPT = [['', 'Tutti'], ['U14', 'U14'], ['U20', 'U20'], ['SEN', 'SEN']];
  // ordinamento da menu (telefono: le intestazioni delle colonne sono piccole); stessi campi delle colonne
  var ORDINI = [['qtA', 'desc', 'Quotazione attuale (Qt.A)'], ['fmCur', 'desc', 'Fantamedia di questa stagione'], ['fmPrec', 'desc', 'Fantamedia della stagione scorsa'], ['nome', 'asc', 'Cognome']];
  var SESSO_OPT = [['', 'Tutti'], ['M', 'M'], ['F', 'F']];

  function norm(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function stagLabel(y) { return y ? y + '/' + String(y + 1).slice(2) : ''; }

  /** Copie per atleta con l'asta a copie (stessa lettura del motore). */
  function copieDi(st) { return E.copiePerAtleta(st); }

  function fmDi(x) { return x && x.presenze ? x.fm : null; }
  function pctDi(x) { return x && (x.vittorieGirone + x.sconfitteGirone) ? x.pctGirone : null; }

  function costruisciRighe(s, d) {
    var out = [];
    var quote = d.settings.disponibilita === 'quote';
    var listone = d.modalita === 'listone';
    var copie = quote ? copieDi(d.settings) : 0;
    Object.keys(s.atleti).forEach(function (k) {
      var a = s.atleti[k];
      if (!a) return;
      var fis = String(a.fis || k);
      var owners = d.proprietari[fis] || [];
      if (a.attivo === false && !owners.length) return;
      var info = UI.infoAtleta(a, d);
      var st = d.statsAtleti[fis] || null;
      var cur = st ? st.stagione : null, prec = st ? st.prec : null, due = st ? st.dueStagioni : null;
      var ult = st && st.tutto ? st.tutto.storico.slice(0, 3) : [];
      var nomiSq = owners.map(function (t) { return FS.nomeSquadra(t); });
      var qtBase = Number(a.quotazione) || 1;
      var mine = !!s.uid && owners.indexOf(s.uid) >= 0;
      var libere = E.copieLibere(d.settings, d.proprietari, fis);
      out.push({
        fis: fis, a: a, nome: UI.nomeAtleta(a),
        cerca: norm([a.cognome, a.nome, a.nome, a.cognome, fis].join(' ')),
        ruolo: info.ruolo, oRuolo: ORD_RUOLO[info.ruolo],
        cat: info.cat ? info.cat.code : '', catLabel: info.catLabel, oCat: info.cat ? ORD_CAT[info.cat.code] : null,
        qtI: st ? st.qtI : qtBase, qtA: st ? st.qtA : qtBase,
        fmCur: fmDi(cur), presCur: cur ? cur.presenze : 0,
        fmPrec: fmDi(prec), presPrec: prec ? prec.presenze : 0, pctVPrec: pctDi(prec), vdPrec: prec ? prec.vittorieDiretta : 0, podiPrec: prec ? prec.podi : 0,
        fmDue: fmDi(due), presDue: due ? due.presenze : 0,
        // FM di riferimento per i consigli: le due stagioni insieme
        fm: fmDi(due), pres: due ? due.presenze : 0,
        presStagione: st && st.stagione ? st.stagione.presenze : 0, presTutto: st && st.tutto ? st.tutto.presenze : 0,
        ultN: ult.length, ultMedia: ult.length ? ult.reduce(function (x, g) { return x + (Number(g.fv) || 0); }, 0) / ult.length : null,
        owners: owners, nomiSq: nomiSq, mine: mine,
        // copie: quante squadre possono averlo con l'asta a quote; libero = posso ancora prenderlo io
        quote: quote, listone: listone, copie: copie, libere: libere, libero: libere > 0 && !mine,
        // a quote si ordina per copie già prese, altrimenti per nome della squadra
        oSquadra: quote ? owners.length : nomiSq.length ? norm(nomiSq.join(' ')) : null,
        inf: a.infermeria && a.infermeria.stato ? a.infermeria : null,
      });
    });
    return out;
  }

  function filtra(rows, f) {
    var parole = norm(f.q).trim().split(/\s+/).filter(Boolean);
    return rows.filter(function (r) {
      if (f.ruolo && r.ruolo !== f.ruolo) return false;
      if (f.sesso && r.a.sesso !== f.sesso) return false;
      if (f.cat && r.cat !== f.cat) return false;
      if (f.disp === 'svincolati' && !r.libero) return false;
      if (f.disp === 'inrosa' && !r.owners.length) return false;
      if (f.disp === 'miei' && !r.mine) return false;
      for (var i = 0; i < parole.length; i++) if (r.cerca.indexOf(parole[i]) < 0) return false;
      return true;
    });
  }

  function ordina(list, sort) {
    var k = sort.k, verso = sort.dir === 'asc' ? 1 : -1;
    return list.slice().sort(function (x, y) {
      var a = x[k], b = y[k];
      var na = a === null || a === undefined, nb = b === null || b === undefined;
      if (na || nb) { if (na && nb) return x.nome.localeCompare(y.nome, 'it'); return na ? 1 : -1; } // i valori mancanti sempre in fondo
      var r = typeof a === 'string' ? a.localeCompare(b, 'it') : a - b;
      if (r) return r * verso;
      // a parità: prima chi ha la fantamedia combinata (ultime due stagioni) più alta, poi in ordine alfabetico
      var fx = x.fmDue === null || x.fmDue === undefined ? -Infinity : x.fmDue;
      var fy = y.fmDue === null || y.fmDue === undefined ? -Infinity : y.fmDue;
      return (fy - fx) || x.nome.localeCompare(y.nome, 'it');
    });
  }

  function squadraTesto(r) {
    if (r.quote) {
      var n = r.owners.length + '/' + r.copie;
      if (r.mine) return (r.a.sesso === 'F' ? 'Già tua · ' : 'Già tuo · ') + n;
      if (r.libere <= 0) return 'Copie finite · ' + n;
      return n + ' squadre';
    }
    if (!r.owners.length) return r.listone ? 'In nessuna rosa' : r.a.sesso === 'F' ? 'Svincolata' : 'Svincolato';
    if (r.owners.length === 1) return r.mine && r.listone ? (r.a.sesso === 'F' ? 'Già tua' : 'Già tuo') : r.nomiSq[0];
    return r.mine ? 'Tua + altre ' + (r.owners.length - 1) : r.owners.length + ' squadre';
  }

  /** Stato rispetto a me: 'mine' già in rosa, 'free' lo posso ancora prendere, '' no. */
  function statoSq(r) { return r.mine ? 'mine' : r.libero ? 'free' : ''; }

  function squadraTitolo(r) {
    var chi = r.nomiSq.length ? 'In rosa a: ' + r.nomiSq.join(', ') : 'Non è in nessuna rosa';
    if (!r.quote) return chi;
    var lib = r.libere <= 0 ? 'copie finite' : (r.libere === 1 ? '1 copia libera' : r.libere + ' copie libere') + ' su ' + r.copie;
    return chi + ' · ' + lib + (r.mine ? ' · è già nella tua rosa' : '');
  }

  function SquadraTag(p) {
    var r = p.r;
    var st = statoSq(r);
    var cls = 'tag ls-team' + (st === 'mine' ? ' blue' : st === 'free' ? ' green' : '');
    return html`<span class=${cls} title=${squadraTitolo(r)}>${squadraTesto(r)}</span>`;
  }

  // ------------------------------------------------------------------ consigli
  function Spunto(p) {
    var r = p.r;
    return html`<button type="button" class="li ls-tip" onClick=${function () { UI.openAtleta(r.fis); }}>
      <${UI.AtletaMask} atleta=${r.a} size=${34}/>
      <span class="body">
        <span class="title">${r.nome}</span>
        <span class="sub">${r.ruolo} · ${r.catLabel}${p.sub ? ' · ' + p.sub : ''}</span>
      </span>
      <span class="ls-tip-v">${p.val}</span>
    </button>`;
  }

  function Gruppo(p) {
    return html`<div class="ls-group">
      <div class="eyebrow">${p.title}</div>
      <div class="tiny faint">${p.desc}</div>
      ${p.items.length ? html`<div class="list">${p.items.map(function (it) {
        return html`<${Spunto} key=${it.r.fis} r=${it.r} val=${it.val} sub=${it.sub}/>`;
      })}</div>` : html`<div class="small muted" style=${{ padding: '10px 0' }}>${p.vuoto}</div>`}
    </div>`;
  }

  function Consigli(p) {
    var phone = UI.useMq(UI.PHONE);
    var s = FS.useFS();
    var d = FS.derived();
    var disp = d.settings.disponibilita;
    var rows = p.rows;
    var c = useMemo(function () {
      var vivi = rows.filter(function (r) { return r.a.attivo !== false; });
      var forma = vivi.filter(function (r) { return r.ultN >= 2; })
        .sort(function (a, b) { return b.ultMedia - a.ultMedia || b.ultN - a.ultN; }).slice(0, 3);
      // chi è in infermeria non è un'occasione: per ora non scende in pedana
      var liberi = vivi.filter(function (r) { return r.libero && !r.inf && r.fm !== null && r.qtA > 0; });
      var solidi = liberi.filter(function (r) { return r.pres >= 2; });
      var occ = (solidi.length >= 3 ? solidi : liberi).slice()
        .sort(function (a, b) { return b.fm / b.qtA - a.fm / a.qtA || b.fm - a.fm; }).slice(0, 3);
      var inStagione = vivi.some(function (r) { return r.presStagione > 0; });
      var key = inStagione ? 'presStagione' : 'presTutto';
      var pres = vivi.filter(function (r) { return r[key] > 0; })
        .sort(function (a, b) { return b[key] - a[key] || (b.fm || 0) - (a.fm || 0); }).slice(0, 3);
      var gareTot = vivi.some(function (r) { return r.presTutto > 0; });
      return { forma: forma, occ: occ, pres: pres, key: key, inStagione: inStagione, gareTot: gareTot };
    }, [rows, disp, s.uid]);
    function fmTxt(r) { return r.fm === null ? '' : 'FM ' + UI.fmt(r.fm, 2) + ' (2 stagioni)'; }
    return html`<${UI.Card} title="Consigli" meta=${phone ? 'Scorri per vedere gli altri' : 'Dai risultati importati da 4Fence'} cls="ls-consigli">
      <div class="grid grid-3">
        <${Gruppo} title="In forma" desc="Miglior media fantavoto nelle ultime 3 gare" vuoto="Servono almeno 2 gare disputate."
          items=${c.forma.map(function (r) { return { r: r, val: UI.fmt(r.ultMedia, 2), sub: 'ultime ' + r.ultN }; })}/>
        <${Gruppo} title="Occasioni" desc=${(disp === 'quote' ? 'Con copie libere e non ancora tuoi' : disp === 'multipla' ? 'Non ancora tuoi' : 'Svincolati') + ': più fantamedia (ultime due stagioni) per credito di Qt.A'}
          vuoto=${disp === 'quote' ? 'Nessun atleta con copie libere e fantamedia.' : disp === 'multipla' ? 'Nessun atleta disponibile con fantamedia.' : 'Nessuno svincolato con fantamedia.'}
          items=${c.occ.map(function (r) { return { r: r, val: 'Qt ' + r.qtA, sub: fmTxt(r) }; })}/>
        <${Gruppo} title="Più presenze" desc=${c.inStagione ? 'Gare disputate in questa stagione' : c.gareTot ? 'Gare disputate nelle stagioni precedenti' : 'Gare disputate'} vuoto="Ancora nessuna gara importata."
          items=${c.pres.map(function (r) { return { r: r, val: r[c.key], sub: fmTxt(r) }; })}/>
      </div>
    <//>`;
  }

  // ------------------------------------------------------------------- vista
  V.Listone = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var qSt = useState('');
    var ruoloSt = useState('');
    var sessoSt = useState('');
    var catSt = useState('');
    var dispSt = useState('tutti');
    var sortSt = useState({ k: 'qtA', dir: 'desc' });
    var phone = UI.useMq(UI.PHONE);
    var rows = useMemo(function () { return costruisciRighe(s, d); }, [s.version]);
    var disp = dispSt[0] === 'miei' && !d.mia ? 'tutti' : dispSt[0];
    var f = { q: qSt[0], ruolo: ruoloSt[0], sesso: sessoSt[0], cat: catSt[0], disp: disp };
    var sort = sortSt[0];
    var lista = useMemo(function () { return ordina(filtra(rows, f), sort); }, [rows, f.q, f.ruolo, f.sesso, f.cat, f.disp, sort]);
    // telefono stretto: una sola colonna FM, quella della stagione in corso appena qualcuno ha gareggiato
    var fmXs = rows.some(function (r) { return r.presCur > 0; }) ? 'cur' : 'prec';
    function hideFm(st) { return st && st !== fmXs && (sort.k !== (st === 'cur' ? 'fmCur' : 'fmPrec')) ? ' ls-hide-xs' : ''; }

    var stag = stagLabel(d.stagione);
    var stagPrec = stagLabel(d.stagione - 1);
    var multi = d.modalita === 'listone';
    var quote = d.settings.disponibilita === 'quote';
    var nCopie = copieDi(d.settings);
    var stC = useState(null); var conferma = stC[0];
    // listone a budget fisso: si compra direttamente da qui
    var mia = d.miaRosa;
    var compra = multi && !!mia && s.canWrite && d.puoComprare;
    // perché non posso comprare (i title non si vedono sui telefoni): il motivo comune a più righe (rosa completa,
    // crediti) si legge una volta sola nel riquadro in alto, gli altri sotto il pulsante
    var blocchi = {}, conta = {};
    if (compra) rows.forEach(function (r) {
      if (r.mine || r.a.attivo === false) return;
      var b = FS.bloccoAcquisto(r.fis);
      if (b) { blocchi[r.fis] = b; conta[b] = (conta[b] || 0) + 1; }
    });
    var comuni = Object.keys(conta).filter(function (b) { return conta[b] > 1; });
    function chiediAcquisto(e, r) {
      e.stopPropagation();
      stC[1]({ r: r, prezzo: FS.prezzoAcquisto(r.fis) });
    }
    var nFiltri = (f.q.trim() ? 1 : 0) + (f.ruolo ? 1 : 0) + (f.sesso ? 1 : 0) + (f.cat ? 1 : 0) + (f.disp !== 'tutti' ? 1 : 0);
    function reset() { qSt[1](''); ruoloSt[1](''); sessoSt[1](''); catSt[1](''); dispSt[1]('tutti'); }
    var crumbs = html`<div class="crumbs"><span class="c">${d.lega ? d.lega.nome : 'Fantascherma'}</span><span class="faint">›</span><span class="c on">Listone</span></div>`;

    if (!rows.length) {
      return html`<div class="stack">${crumbs}
        <${UI.Card} title="Listone"><${UI.Empty} title="Listone vuoto">Il presidente non ha ancora importato gli atleti da 4Fence.<//><//>
      </div>`;
    }

    var altriFiltri = html`<${React.Fragment}>
      <${UI.Field} id="listone-cat" label="Categoria">
        <select id="listone-cat" class="input" value=${f.cat} onChange=${function (e) { catSt[1](e.target.value); }}>
          <option value="">Tutte le categorie</option>
          ${E.CATEGORIE.map(function (c) { return html`<option key=${c.code} value=${c.code}>${c.label}</option>`; })}
        </select>
      <//>
      <${UI.Field} id="listone-disp" label="Disponibilità">
        <select id="listone-disp" class="input" value=${f.disp} onChange=${function (e) { dispSt[1](e.target.value); }}>
          <option value="tutti">Tutti</option>
          <option value="svincolati">${quote ? 'Svincolati (copie libere)' : multi ? 'Non ancora miei' : 'Svincolati'}</option>
          <option value="inrosa">In rosa</option>
          ${d.mia ? html`<option value="miei">I miei</option>` : null}
        </select>
      <//>
    <//>`;
    var ordineSel = sort.k;
    var legenda = html`<${React.Fragment}>
      <span><b>Qt.I</b> quotazione iniziale in crediti, <b>Qt.A</b> quotazione attuale: seguono i punti attesi in una giornata (fantamedia affidabile delle ultime due stagioni e frequenza in pedana). Il calcolo è spiegato nel Regolamento.</span>
      <span><b>FM</b> fantamedia: media dei fantavoti (voto base ${UI.fmt(d.settings.punteggio.base)} più bonus e malus di gironi, diretta e piazzamento).</span>
      <span><b>FM ${stag}</b> fantamedia della stagione in corso; <b>FM ${stagPrec}</b> della stagione scorsa. Sotto ogni FM, le gare su cui è calcolata.</span>
      ${quote ? html`<span><b>Squadre</b> quante squadre lo hanno in rosa su ${nCopie} copie: «Già tuo» se è nella tua rosa, «Copie finite» se nessun'altra squadra può prenderlo.</span>` : null}
      ${compra ? html`<span><b>Compra</b> aggiunge l'atleta alla tua rosa al prezzo indicato (Qt.A). Su un telefono il pulsante è sotto il nome.</span>` : null}
      <span>Tocca un atleta per aprire la sua scheda.</span>
    <//>`;

    function pills(id, label, val, set, opts) {
      return html`<div class="field">
        <span class="lbl" id=${id}>${label}</span>
        <div class="ls-pills" role="group" aria-labelledby=${id}>${opts.map(function (o) {
          return html`<button type="button" key=${o[0] || 'tutti'} class="pill" aria-pressed=${val === o[0]} title=${E.RUOLI[o[0]] ? E.RUOLI[o[0]].label : ''} onClick=${function () { set(o[0]); }}>${o[1]}</button>`;
        })}</div>
      </div>`;
    }

    function th(c) {
      if (c.k === 'oSquadra' && quote) c = Object.assign({}, c, { label: 'Squadre', dir: 'asc', title: 'Squadre che lo hanno in rosa, su ' + nCopie + ' copie' });
      if (c.k === 'oSquadra' && multi) c = Object.assign({}, c, { label: compra ? 'Rose e acquisto' : 'Rose', title: 'Squadre che lo hanno in rosa' + (compra ? '; compralo da qui' : '') });
      var on = sort.k === c.k;
      var sub = c.st === 'cur' ? stag : c.st === 'prec' ? stagPrec : c.st === 'due' ? '2 stag.' : '';
      var title = c.k === 'oCat' ? 'Categoria ' + stag : (c.title || '') + (sub && c.st !== 'due' ? ' (' + sub + ')' : '');
      return html`<th key=${c.k} class=${['sort', c.cls || '', c.hide || '', c.sep ? 'ls-sep' : '', c.st ? 'ls-st-' + c.st : ''].join(' ') + hideFm(c.st)} aria-sort=${on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title=${title}>
        <button type="button" class=${'ls-sort' + (on ? ' on' : '')} onClick=${function () { sortSt[1](on ? { k: c.k, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { k: c.k, dir: c.dir }); }}>${c.label}<span class="ar" aria-hidden="true">${on ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>${sub ? html`<span class="ls-sub">${sub}</span>` : null}</button>
      </th>`;
    }

    function fmCell(v, n) {
      if (v === null) return html`<span class="faint">–</span>`;
      return html`<span class="ls-fm"><b>${UI.fmt(v, 2)}</b><span class="ls-gare">${n === 1 ? '1 gara' : n + ' gare'}</span></span>`;
    }

    /** Pulsante «Compra» (listone): disabilitato con il motivo se non posso comprarlo adesso. dove: 'xs' (telefono) | 'tbl'. */
    function bottoneCompra(r, dove) {
      if (!compra || r.mine || r.a.attivo === false) return null;
      var blocco = blocchi[r.fis] || '';
      var prezzo = FS.prezzoAcquisto(r.fis);
      var iC = comuni.indexOf(blocco);
      var idWhy = !blocco ? null : iC >= 0 ? 'ls-why-c' + iC : 'ls-why-' + dove + '-' + r.fis;
      return html`<${React.Fragment}><button type="button" class="btn xs" disabled=${!!blocco} title=${blocco || 'Compra ' + UI.nomeAtleta(r.a) + ' per ' + nCr(prezzo)}
        aria-label=${'Compra ' + UI.nomeAtleta(r.a) + ' per ' + nCr(prezzo)} aria-describedby=${idWhy}
        onPointerDown=${function (e) { e.stopPropagation(); }}
        onClick=${function (e) { chiediAcquisto(e, r); }} onKeyDown=${function (e) { e.stopPropagation(); }}>Compra a ${prezzo}</button>${blocco && iC < 0 ? html`<span id=${idWhy} class="tiny faint ls-buy-why">${blocco}</span>` : null}<//>`;
    }

    function riga(r) {
      function apri() { UI.openAtleta(r.fis); }
      return html`<tr key=${r.fis} class=${'click' + (r.mine ? ' me' : '')} tabIndex="0" onClick=${apri}
        onKeyDown=${function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apri(); } }}>
        <td class="ls-cell-atleta">
          <div class="ls-atleta">
            <${UI.AtletaMask} atleta=${r.a} size=${34}/>
            <div class="ls-nm">
              <div class="ls-name">${r.nome}<span class="ls-only-xs"> <${UI.Role} ruolo=${r.ruolo}/></span>${r.inf ? html`<span class="tag red ls-ml" title=${'Infermeria: ' + (r.inf.nota || r.inf.stato)}>Inf.</span>` : null}</div>
              <div class="tiny muted">${r.a.anno || '—'}<span class="ls-only-md"> · ${r.catLabel}</span></div>
              <div class=${'tiny ls-sq-xs ' + statoSq(r)} title=${squadraTitolo(r)}>${squadraTesto(r)}</div>
              ${compra && !r.mine && r.a.attivo !== false ? html`<div class="ls-buy-xs">${bottoneCompra(r, 'xs')}</div>` : null}
            </div>
          </div>
        </td>
        <td class="c ls-hide-xs"><${UI.Role} ruolo=${r.ruolo}/></td>
        <td class="ls-hide-md small">${r.catLabel}</td>
        <td class="r ls-hide-md">${r.qtI}</td>
        <td class="r"><b>${r.qtA}</b></td>
        <td class=${'r ls-sep' + hideFm('cur')}>${fmCell(r.fmCur, r.presCur)}</td>
        <td class=${'r ls-sep' + hideFm('prec')}>${fmCell(r.fmPrec, r.presPrec)}</td>
        <td class="ls-hide-xs ls-sep">${compra && !r.mine && r.a.attivo !== false ? html`<div class="ls-buy"><${SquadraTag} r=${r}/>${bottoneCompra(r, 'tbl')}</div>` : html`<${SquadraTag} r=${r}/>`}</td>
      </tr>`;
    }

    return html`<div class="stack">
      ${crumbs}
      ${!multi ? (function () {
        var testo = nCopie === 1 ? 'Ogni atleta può stare in una sola squadra: accanto a ogni atleta vedi se è già in una rosa.' : 'Ogni atleta può stare in al massimo ' + nCopie + ' squadre, mai due volte nella stessa: accanto a ogni atleta vedi quante copie sono già prese.';
        // telefono: una riga (la modalità) che si apre al tocco
        return phone ? html`<div class="banner nota-fold"><details class="more"><summary><${UI.ModalitaTag} settings=${d.settings}/></summary><div class="nota-fold-b small">${testo}</div></details></div>`
          : html`<div class="banner"><${UI.ModalitaTag} settings=${d.settings}/><span>${testo}</span></div>`;
      })() : null}
      ${multi ? html`<div class="banner" style=${{ alignItems: 'flex-start' }}>
        <span class=${'lamp ' + (d.puoComprare ? 'v' : 's')} style=${{ marginTop: '5px' }}></span>
        <div class="stack grow" style=${{ gap: '6px', minWidth: '220px' }}>
          <div class="row" style=${{ gap: '8px' }}><${UI.ModalitaTag} settings=${d.settings}/>${d.composizione ? html`<b>Composizione delle rose aperta</b>` : d.mercatoAperto ? html`<b>Mercato aperto</b>` : null}</div>
          ${(function () {
            var t = UI.modalita(d.settings).breve + (d.composizione ? ' Chi toglie un atleta durante la composizione riavrà tutti i crediti.' : d.puoComprare ? '' : ' Ora si compra solo quando il presidente apre il mercato.');
            return phone ? html`<details class="more small"><summary>Come funziona</summary><p style=${{ margin: '6px 0 0' }}>${t}</p></details>` : html`<span class="small">${t}</span>`;
          })()}
          ${mia && !phone ? html`<div class="ma-kpis ls-kpis">
            <div class="ma-kpi"><div class="v">${mia.crediti}</div><div class="l">Crediti</div></div>
            <div class="ma-kpi"><div class="v">${mia.rosa.length}/${d.settings.rosa}</div><div class="l">La tua rosa</div></div>
            <div class="ma-kpi" title="Devi poter completare la rosa a 1 credito per ogni posto libero"><div class="v">${E.offertaMassima(mia, d.settings)}</div><div class="l">Spesa massima</div></div>
          </div>` : null}
          ${comuni.map(function (b, i) { return html`<span key=${b} id=${'ls-why-c' + i} class="small"><b>Pulsanti «Compra» spenti.</b> ${b}</span>`; })}
        </div>
      </div>` : null}
      ${!multi && d.mercatoAperto ? html`<div class="banner" style=${{ justifyContent: 'space-between' }}>
        <span><span class="lamp v"></span> <b>Mercato aperto.</b> ${quote ? 'Le copie libere si acquistano ' + (d.settings.prezzoSvincolati === 'uno' ? 'a 1 credito' : 'alla Qt.A') + ', purché l\'atleta non sia già tuo.' : d.settings.prezzoSvincolati === 'uno' ? 'Gli svincolati costano 1 credito.' : 'Gli svincolati si acquistano alla loro Qt.A.'}</span>
        ${p.go ? html`<button type="button" class="btn sm" onClick=${function () { p.go('mercato'); }}>Vai al mercato</button>` : null}
      </div>` : null}
      ${multi && mia && phone ? html`<div class="ma-kpis ls-kpis ls-budget" role="group" aria-label="Il tuo budget">
        <div class="ma-kpi"><div class="v">${mia.crediti}</div><div class="l">Crediti</div></div>
        <div class="ma-kpi"><div class="v">${mia.rosa.length}/${d.settings.rosa}</div><div class="l">Rosa</div></div>
        <div class="ma-kpi" title="Devi poter completare la rosa a 1 credito per ogni posto libero"><div class="v">${E.offertaMassima(mia, d.settings)}</div><div class="l">Spesa max</div></div>
      </div>` : null}
      <${Consigli} rows=${rows}/>
      <section class="card">
        <div class="card-h"><h2>Lista atleti</h2><span class="meta">${lista.length === rows.length ? rows.length + ' atleti' : lista.length + ' di ' + rows.length + ' atleti'}</span></div>
        <div class="card-b">
          <div class="ls-filters">
            <${UI.Field} id="listone-q" label="Cerca atleta">
              <input id="listone-q" class="input" type="search" placeholder="Cognome o nome" autoComplete="off" value=${f.q} onChange=${function (e) { qSt[1](e.target.value); }}/>
            <//>
            ${pills('listone-ruolo', 'Ruolo', f.ruolo, ruoloSt[1], RUOLI_OPT)}
            ${pills('listone-sesso', 'Sesso', f.sesso, sessoSt[1], SESSO_OPT)}
            ${phone ? null : altriFiltri}
          </div>
          ${phone ? html`<details class="more ls-more" open=${(f.cat || f.disp !== 'tutti') ? true : undefined}><summary>Altri filtri e ordine${f.cat || f.disp !== 'tutti' ? ' (' + ((f.cat ? 1 : 0) + (f.disp !== 'tutti' ? 1 : 0)) + ')' : ''}</summary>
            <div class="ls-filters">${altriFiltri}
              <${UI.Field} id="listone-ordina" label="Ordina per">
                <select id="listone-ordina" class="input" value=${ordineSel} onChange=${function (e) { var o = ORDINI.filter(function (x) { return x[0] === e.target.value; })[0]; if (o) sortSt[1]({ k: o[0], dir: o[1] }); }}>
                  ${ORDINI.map(function (o) { return html`<option key=${o[0]} value=${o[0]}>${o[2]}</option>`; })}
                  ${ORDINI.some(function (o) { return o[0] === sort.k; }) ? null : html`<option value=${sort.k}>Colonna scelta in tabella</option>`}
                </select>
              <//>
            </div>
          </details>` : null}
          ${nFiltri ? html`<div class="ls-reset"><span class="small muted">${nFiltri === 1 ? '1 filtro attivo' : nFiltri + ' filtri attivi'}</span><button type="button" class="linkbtn small" onClick=${reset}>Azzera i filtri</button></div>` : null}
        </div>
        ${lista.length ? html`<div class="tbl-wrap">
          <table class="tbl ls-tbl">
            <thead><tr>${COLONNE.map(th)}</tr></thead>
            <tbody>${lista.map(riga)}</tbody>
          </table>
        </div>` : html`<${UI.Empty} title="Nessun atleta trovato">Prova a cambiare o azzerare i filtri.<//>`}
        <div class="card-f">
          ${phone ? html`<details class="more ls-legend-d"><summary>Legenda</summary><div class="ls-legend">${legenda}</div></details>` : html`<div class="ls-legend">${legenda}</div>`}
        </div>
      </section>
      ${conferma ? html`<${UI.Confirm} title=${'Compri ' + UI.nomeAtleta(conferma.r.a) + '?'} yes=${'Compra a ' + conferma.prezzo}
        onNo=${function () { stC[1](null); }}
        onYes=${function () { var fis = conferma.r.fis; stC[1](null); FS.act.acquistaSvincolato(fis).catch(function () { }); }}>
        ${UI.nomeAtleta(conferma.r.a)} (${conferma.r.catLabel}) entra nella tua rosa per ${nCr(conferma.prezzo)}. Ti ${mia && mia.crediti - conferma.prezzo === 1 ? 'resterà' : 'resteranno'} ${nCr(mia ? mia.crediti - conferma.prezzo : 0)} e avrai ${mia && mia.rosa.length ? mia.rosa.length + 1 + ' atleti' : '1 atleta'} su ${d.settings.rosa}.${d.composizione ? ' Finché le rose sono in composizione puoi ' + (conferma.r.a.sesso === 'F' ? 'toglierla' : 'toglierlo') + ' e riavere tutti i crediti.' : ''}
      <//>` : null}
    </div>`;
  };
})(window);
