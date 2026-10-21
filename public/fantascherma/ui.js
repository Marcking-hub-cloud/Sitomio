/* Fantascherma — componenti condivisi (React + htm). Esposti su window.UI. */
(function (root) {
  'use strict';
  var React = root.React;
  // nei template si scrive class="…" come in HTML: per gli elementi del DOM diventa className (stesso risultato, senza avvisi di React)
  function h(type, props) {
    if (props && typeof type === 'string' && props['class'] !== undefined) { props.className = props['class']; delete props['class']; }
    return React.createElement.apply(null, arguments);
  }
  var html = root.htm.bind(h);
  var E = root.FSEngine;
  var FS = root.FS;
  var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo, useRef = React.useRef;
  var UI = root.UI = { html: html };

  // --------------------------------------------------------------- formattazione
  var MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  UI.data = function (iso, conGiorno) {
    if (!iso) return '';
    var d = new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d)) return iso;
    return (conGiorno ? GIORNI[d.getDay()] + ' ' : '') + d.getDate() + ' ' + MESI[d.getMonth()] + (conGiorno ? '' : ' ' + d.getFullYear());
  };
  UI.dataOra = function (ms) {
    if (!ms) return '';
    var d = new Date(ms);
    return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  UI.finestra = function (g) {
    if (!g) return '';
    if (g.dal === g.al) return UI.data(g.dal);
    var a = new Date(g.dal + 'T12:00:00'), b = new Date(g.al + 'T12:00:00');
    if (a.getMonth() === b.getMonth()) return a.getDate() + '–' + b.getDate() + ' ' + MESI[b.getMonth()] + ' ' + b.getFullYear();
    return a.getDate() + ' ' + MESI[a.getMonth()] + ' – ' + b.getDate() + ' ' + MESI[b.getMonth()] + ' ' + b.getFullYear();
  };
  UI.fmt = function (x, dec) {
    if (x === null || x === undefined || x === '' || isNaN(x)) return '–';
    var n = Number(x);
    var d = dec === undefined ? (Math.round(n) === n ? 0 : (Math.round(n * 10) === n * 10 ? 1 : 2)) : dec;
    return n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  UI.segno = function (x) { var s = UI.fmt(x); return Number(x) > 0 ? '+' + s : s; };
  UI.ago = function (ms) {
    var s = Math.round((FS.now() - ms) / 1000);
    if (s < 60) return 'ora';
    if (s < 3600) return Math.floor(s / 60) + ' min fa';
    if (s < 86400) return Math.floor(s / 3600) + ' h fa';
    if (s < 30 * 86400) return Math.floor(s / 86400) + ' g fa';
    // oltre un mese la data si legge meglio di «398 g fa»
    var t = new Date(ms);
    return UI.data(t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'));
  };
  UI.durata = function (ms) {
    if (ms <= 0) return '0s';
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + 'gg ' + String(h).padStart(2, '0') + 'h';
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
  };
  UI.nomeAtleta = function (a, corto) {
    if (!a) return '—';
    var cg = cap(a.cognome), nm = cap(a.nome);
    if (corto) return cg + (nm ? ' ' + nm.charAt(0) + '.' : '');
    return cg + ' ' + nm;
  };
  function cap(s) { return String(s || '').toLowerCase().replace(/(^|[\s'-])([a-zàèéìòù])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  UI.cap = cap;
  UI.iniziali = function (a) { return ((a && a.cognome || '?').charAt(0) + (a && a.nome || '').charAt(0)).toUpperCase(); };

  // --------------------------------------------------------------- maschera
  // Maschera da scherma stilizzata: rete scura, bavaglino nei colori della squadra.
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  var PALETTE = ['#2448f0', '#d9480f', '#2b8a3e', '#b5205a', '#7048e8', '#0c8599', '#e67700', '#495057', '#c92a2a', '#364fc7'];
  UI.Mask = function (p) {
    var size = p.size || 48;
    var c1 = (p.colori && p.colori[0]) || PALETTE[hash(p.seed || p.label) % PALETTE.length];
    var c2 = (p.colori && p.colori[1]) || '#ffffff';
    var uid = 'm' + hash((p.seed || p.label || '') + c1 + c2 + size);
    return html`<span class="mask" style=${{ width: size + 'px', height: size + 'px' }} title=${p.title || ''}>
      <svg width=${size} height=${size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <pattern id=${uid} width="3.2" height="3.2" patternUnits="userSpaceOnUse"><rect width="3.2" height="3.2" fill="#1b1f3b"/><circle cx="1.6" cy="1.6" r="0.9" fill="#4b527e"/></pattern>
        </defs>
        <path d="M14 47 C 10 60, 54 60, 50 47 L 47 44 L 17 44 Z" fill=${c1} stroke="rgba(0,0,0,.25)" strokeWidth="1"/>
        <path d="M22 50 L 32 56 L 42 50" fill="none" stroke=${c2} strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M32 4 C 17 4 12 15 12 27 C 12 39 19 47 32 47 C 45 47 52 39 52 27 C 52 15 47 4 32 4 Z" fill=${'url(#' + uid + ')'} stroke="#d4d8ea" strokeWidth="2.6"/>
        <path d="M32 4 C 26 9 25 18 25 27 C 25 36 27 43 32 47 C 37 43 39 36 39 27 C 39 18 38 9 32 4 Z" fill="none" stroke="rgba(212,216,234,.35)" strokeWidth="1.2"/>
        <path d="M13 22 C 22 19 42 19 51 22" fill="none" stroke="#d4d8ea" strokeWidth="1.6" opacity=".7"/>
      </svg>
      ${p.label ? html`<span class="ini" style=${{ fontSize: Math.max(9, size * 0.22) + 'px' }}>${p.label}</span>` : null}
    </span>`;
  };

  UI.TeamMask = function (p) {
    var t = p.team || {};
    var ini = String(t.nome || '?').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
    return html`<${UI.Mask} size=${p.size || 44} colori=${t.colori} seed=${t.id} label=${p.noLabel ? '' : ini} title=${t.nome}/>`;
  };

  UI.AtletaMask = function (p) {
    var a = p.atleta || {};
    var cols = a.sesso === 'F' ? ['#c2255c', '#ffd8e8'] : ['#1971c2', '#d0ebff'];
    if (p.team && p.team.colori) cols = p.team.colori;
    return html`<${UI.Mask} size=${p.size || 44} colori=${cols} seed=${a.fis} label=${p.noLabel ? '' : UI.iniziali(a)} title=${UI.nomeAtleta(a)}/>`;
  };

  UI.Role = function (p) {
    var r = p.ruolo || 'SEN';
    return html`<span class=${'role ' + r} title=${E.RUOLI[r] ? E.RUOLI[r].desc : ''}>${E.RUOLI[r] ? E.RUOLI[r].short : r}</span>`;
  };

  UI.Medal = function (p) {
    var pl = Number(p.place);
    if (pl >= 1 && pl <= 3) return html`<span class=${'medal m' + pl} title=${pl + '° posto'}>${pl}</span>`;
    return html`<span class="tag">${pl ? pl + '°' : '–'}</span>`;
  };

  UI.Lamps = function (p) {
    // p.v vinti, p.s persi → lampadine del segnapunti
    var out = [];
    for (var i = 0; i < (p.v || 0); i++) out.push(html`<i class="lamp v" key=${'v' + i}></i>`);
    for (var j = 0; j < (p.s || 0); j++) out.push(html`<i class="lamp s" key=${'s' + j}></i>`);
    return html`<span class="lamps" title=${(p.v || 0) + ' vinti, ' + (p.s || 0) + ' persi'}>${out}</span>`;
  };

  UI.FV = function (p) {
    if (p.v === null || p.v === undefined) return html`<span class="fv faint">s.v.</span>`;
    var base = p.base === undefined ? 6 : p.base;
    var cls = 'fv' + (p.colore === false ? '' : p.v > base + 3 ? ' pos' : p.v < base ? ' neg' : '');
    return html`<span class=${cls}>${UI.fmt(p.v)}</span>`;
  };

  UI.Voci = function (p) {
    return html`<div>${(p.voci || []).map(function (v, i) {
      return html`<div class="voce" key=${i}><span>${v.label}${v.det ? html`<span class="faint"> · ${v.det}</span>` : null}</span><span class=${'v ' + (v.k === 'base' ? '' : v.val > 0 ? 'p' : 'n')}>${v.k === 'base' ? UI.fmt(v.val) : UI.segno(v.val)}</span></div>`;
    })}</div>`;
  };

  UI.Countdown = function (p) {
    var now = FS.useTick(1000);
    var left = p.to - now;
    if (left <= 0) return html`<span class="countdown closed">${p.chiuso || 'Chiusa'}</span>`;
    return html`<span class="countdown" title=${'Scadenza: ' + UI.dataOra(p.to)}>${UI.durata(left)}</span>`;
  };

  UI.Empty = function (p) {
    return html`<div class="empty"><div class="t">${p.title}</div><div>${p.children}</div></div>`;
  };

  UI.Card = function (p) {
    return html`<section class=${'card ' + (p.cls || '')}>
      ${p.title || p.meta || p.right ? html`<div class="card-h">${p.title ? html`<h2>${p.title}</h2>` : null}${p.meta ? html`<span class="meta">${p.meta}</span>` : null}${p.right || null}</div>` : null}
      ${p.strip ? html`<div class="card-strip">${p.strip}</div>` : null}
      <div class=${p.flush ? '' : 'card-b'}>${p.children}</div>
      ${p.footer ? html`<div class="card-f">${p.footer}</div>` : null}
    </section>`;
  };

  // ------------------------------------------------------------ telefono
  /**
   * Telefono: barra delle sezioni in basso, modali come fogli dal basso (stessa media query di styles.css e css/*.css).
   * Vale anche per il telefono in orizzontale (schermo basso e touch), che supera i 720px di larghezza.
   */
  UI.PHONE = '(max-width: 720px), (max-height: 500px) and (pointer: coarse)';
  UI.isPhone = function () { try { return !!(root.matchMedia && root.matchMedia(UI.PHONE).matches); } catch (e) { return false; } };
  /** true finché la media query è soddisfatta (si aggiorna ruotando il telefono o ridimensionando). */
  UI.useMq = function (q) {
    var st = useState(function () { try { return !!(root.matchMedia && root.matchMedia(q).matches); } catch (e) { return false; } });
    useEffect(function () {
      if (!root.matchMedia) return undefined;
      var m = root.matchMedia(q);
      function h() { st[1](!!m.matches); }
      h();
      if (m.addEventListener) m.addEventListener('change', h); else if (m.addListener) m.addListener(h);
      return function () { if (m.removeEventListener) m.removeEventListener('change', h); else if (m.removeListener) m.removeListener(h); };
    }, [q]);
    return st[0];
  };
  /** Aggiunge una classe a <html> finché il componente è montato (barre fisse, blocco dello scroll). */
  var classiRoot = {};
  UI.useRootClass = function (cls, on) {
    var useL = React.useLayoutEffect || useEffect;
    useL(function () {
      if (!on) return undefined;
      var el = document.documentElement;
      classiRoot[cls] = (classiRoot[cls] || 0) + 1;
      el.classList.add(cls);
      return function () {
        classiRoot[cls] = Math.max(0, (classiRoot[cls] || 1) - 1);
        if (!classiRoot[cls]) el.classList.remove(cls);
      };
    }, [cls, !!on]);
  };

  // Telefono: ogni foglio aperto aggiunge una voce alla cronologia (stesso indirizzo), così il tasto o il gesto «indietro»
  // chiude il foglio invece di cambiare sezione sotto di lui, come nelle app. Chiuso dal ✕ (o da un'azione) il foglio
  // toglie la propria voce. Le voci di fogli già chiusi (es. si è cambiata sezione dal foglio «Altro») si saltano.
  var fogliAperti = 0;
  function voceFoglio() { try { return (root.history.state && root.history.state.fsFoglio) || 0; } catch (e) { return 0; } }
  root.addEventListener('popstate', function () {
    if (voceFoglio() > fogliAperti) { try { root.history.back(); } catch (e) { /* niente */ } }
  });
  function useIndietroChiude(chiudi) {
    useEffect(function () {
      if (!UI.isPhone()) return undefined;
      var mio = voceFoglio() + 1, viaIndietro = false;
      try { root.history.pushState({ fsFoglio: mio }, ''); } catch (e) { return undefined; }
      fogliAperti++;
      function pop() {
        if (viaIndietro || voceFoglio() >= mio) return;
        viaIndietro = true;
        if (chiudi.current) chiudi.current();
      }
      root.addEventListener('popstate', pop);
      return function () {
        root.removeEventListener('popstate', pop);
        fogliAperti = Math.max(0, fogliAperti - 1);
        if (!viaIndietro && voceFoglio() === mio) { try { root.history.back(); } catch (e) { /* niente */ } }
      };
    }, []);
  }

  /**
   * Finestra modale; sul telefono è un foglio che sale dal basso (e il tasto «indietro» lo chiude).
   * p: { title, onClose, icon, footer (azioni fisse in fondo), noClose (sul telefono niente ✕: c'è già «Annulla»), cls }
   */
  UI.Modal = function (p) {
    var ref = useRef(null);
    var chiudi = useRef(p.onClose);
    chiudi.current = p.onClose;
    UI.useRootClass('modal-open', true);
    useIndietroChiude(chiudi);
    useEffect(function () {
      function k(e) { if (e.key === 'Escape' && chiudi.current) chiudi.current(); }
      document.addEventListener('keydown', k);
      // il focus va nella modale (o sul pulsante indicato con data-autofocus) e torna dov'era alla chiusura
      var prima = document.activeElement;
      var el = ref.current;
      if (el) {
        var f = el.querySelector('[data-autofocus]') || el;
        try { f.focus({ preventScroll: true }); } catch (e) { /* niente */ }
      }
      return function () {
        document.removeEventListener('keydown', k);
        if (prima && prima.focus && document.contains(prima)) { try { prima.focus({ preventScroll: true }); } catch (e) { /* niente */ } }
      };
    }, []);
    return html`<div class="modal-bg" onClick=${function (e) { if (e.target === e.currentTarget) p.onClose && p.onClose(); }}>
      <div ref=${ref} class=${'modal' + (p.noClose ? ' no-x' : '') + (p.cls ? ' ' + p.cls : '')} role="dialog" aria-modal="true" aria-label=${p.title} tabIndex="-1">
        <div class="modal-h">${p.icon || null}<h2>${p.title}</h2><button type="button" class="iconbtn" aria-label="Chiudi" onClick=${p.onClose}>✕</button></div>
        <div class="modal-b">${p.children}</div>
        ${p.footer ? html`<div class="modal-f">${p.footer}</div>` : null}
      </div>
    </div>`;
  };

  /** Conferma in-pagina (confirm() non funziona negli artifact). */
  UI.Confirm = function (p) {
    return html`<${UI.Modal} title=${p.title || 'Confermi?'} onClose=${p.onNo} noClose=${true}>
      <p class="confirm-txt">${p.children}</p>
      <div class="confirm-actions">
        <button type="button" class="btn ghost" data-autofocus=${p.danger ? '' : null} onClick=${p.onNo}>Annulla</button>
        <button type="button" class=${'btn ' + (p.danger ? 'danger' : '')} onClick=${p.onYes}>${p.yes || 'Conferma'}</button>
      </div>
    <//>`;
  };

  /** Pulsante che esegue un'azione asincrona mostrando l'attesa. */
  UI.AsyncBtn = function (p) {
    var st = useState(false);
    var busy = st[0];
    var cls = 'btn ' + (p.cls || '');
    return html`<button class=${cls} disabled=${busy || p.disabled} title=${p.title || ''} onClick=${async function (e) {
      e.preventDefault();
      if (busy) return;
      st[1](true);
      try { await p.onClick(); } catch (err) { /* messaggio già mostrato */ } finally { st[1](false); }
    }}>${busy ? (p.busy || 'Attendi…') : p.children}</button>`;
  };

  UI.Toasts = function () {
    var s = FS.useFS();
    // un tocco sull'avviso lo chiude (sul telefono può coprire i pulsanti in basso)
    return html`<div class="toasts" aria-live="polite">${s.toasts.map(function (t) {
      return html`<div class=${'toast ' + (t.kind === 'err' ? 'err' : '')} key=${t.id} role="status" onClick=${function () { FS.chiudiToast(t.id); }}><i class=${'lamp ' + (t.kind === 'err' ? 's' : 'v')}></i><span>${t.msg}</span></div>`;
    })}</div>`;
  };

  UI.Field = function (p) {
    return html`<div class="field" style=${p.style}><label htmlFor=${p.id}>${p.label}</label>${p.children}${p.help ? html`<span class="help">${p.help}</span>` : null}</div>`;
  };

  // ------------------------------------------------------- modalità di gioco
  /** Nome e spiegazione breve della modalità della lega: { k:'copie'|'listone', nome, breve, K (copie per atleta) }. */
  UI.modalita = function (S) {
    S = S || {};
    if (E.modalita(S) === 'listone') {
      return { k: 'listone', nome: 'Listone a budget fisso', K: Infinity,
        breve: 'Niente asta: tutti hanno lo stesso budget' + (S.crediti ? ' di ' + S.crediti + ' crediti' : '') + ' e comprano dal listone al prezzo indicato, la quotazione attuale (Qt.A), senza aste né rilanci. Lo stesso atleta può stare in più squadre: vince chi spende meglio.' };
    }
    var K = E.copiePerAtleta(S);
    return { k: 'copie', nome: 'Asta a copie', K: K,
      breve: K > 1 ? 'Asta dal vivo, a chiamata e rilanci: ogni atleta esiste in ' + K + ' copie, quindi può stare in al massimo ' + K + ' squadre, mai due volte nella stessa.'
        : 'Asta dal vivo, a chiamata e rilanci, con 1 copia per atleta: ogni atleta sta in una sola squadra (asta classica).' };
  };

  /** Etichetta della modalità (es. in testa a listone, rose, home). */
  UI.ModalitaTag = function (p) {
    var m = UI.modalita(p.settings);
    var extra = m.k === 'copie' ? (m.K === 1 ? '1 copia' : m.K + ' copie') : (p.settings && p.settings.crediti ? p.settings.crediti + ' crediti' : '');
    return html`<span class=${'tag mode-tag ' + (m.k === 'listone' ? 'green' : 'blue')} title=${m.breve}>${m.nome}${extra ? html`<span class="mode-tag-x"> · ${extra}</span>` : null}</span>`;
  };

  /**
   * Scelta della modalità: due schede con un radio ciascuna (frecce da tastiera, etichette accessibili).
   * p: { id, value:'copie'|'listone', onChange(modo), disabled, copie (copie per atleta), numeri:{ copie, listone } (riga di numeri chiave), legend }
   */
  var SCHEDE_MODO = [
    { k: 'copie', nome: 'Asta a copie', desc: function (K) { return 'Asta dal vivo: a turno si chiama un atleta e si rilancia. Ogni atleta esiste in ' + (K ? (K === 1 ? '1 copia, quindi sta in una sola squadra (asta classica).' : K + ' copie, quindi può stare in al massimo ' + K + ' squadre, mai due volte nella stessa.') : 'poche copie: può stare in poche squadre, mai due volte nella stessa.'); } },
    { k: 'listone', nome: 'Listone a budget fisso', desc: function () { return 'Niente asta: tutti hanno lo stesso budget e comprano dal listone alla quotazione, senza rilanci. Lo stesso atleta può stare in più squadre: vince chi spende meglio.'; } },
  ];
  UI.ModalitaScelta = function (p) {
    var numeri = p.numeri || {};
    return html`<fieldset class="mode-pick" disabled=${!!p.disabled}>
      <legend class="lbl">${p.legend || 'Modalità di gioco'}</legend>
      <div class="mode-cards">${SCHEDE_MODO.map(function (m) {
        var id = p.id + '-' + m.k;
        var on = p.value === m.k;
        return html`<label key=${m.k} class=${'mode-card' + (on ? ' on' : '')} htmlFor=${id}>
          <span class="mode-card-h">
            <input id=${id} type="radio" name=${p.id} value=${m.k} checked=${on} disabled=${!!p.disabled} aria-labelledby=${id + '-t'} aria-describedby=${id + '-d' + (numeri[m.k] ? ' ' + id + '-n' : '')} onChange=${function () { if (p.onChange) p.onChange(m.k); }}/>
            <span class="mode-card-t" id=${id + '-t'}>${m.nome}</span>
          </span>
          <span class="mode-card-d" id=${id + '-d'}>${m.desc(p.copie)}</span>
          ${numeri[m.k] ? html`<span class="mode-card-n" id=${id + '-n'}>${numeri[m.k]}</span>` : null}
        </label>`;
      })}</div>
    </fieldset>`;
  };

  // ---------------------------------------------------------- dati atleta
  /** Informazioni sintetiche di un atleta per la stagione corrente. */
  UI.infoAtleta = function (a, d) {
    var cat = E.categoriaPer(a.anno, d.stagione);
    return { ruolo: E.ruoloAtleta(a, d.stagione), cat: cat, catLabel: cat ? cat.short : '—' };
  };

  /** Probabilità di gareggiare nella giornata: dalle gare previste (calendario) e dai risultati già importati. */
  UI.probabile = function (a, g, s, d) {
    if (!a || !g) return { lvl: 'no', label: '—', pct: 0 };
    if (a.infermeria && a.infermeria.stato) return { lvl: 'no', label: 'Infermeria: ' + (a.infermeria.nota || a.infermeria.stato), pct: 0, inf: true };
    var gareG = E.gareDellaGiornata(g, s.gare);
    if (gareG.length) {
      var hit = gareG.filter(function (x) { return x.risultati && x.risultati[a.fis] && x.risultati[a.fis].stato !== 'assente'; })[0];
      if (hit) return { lvl: 'ok', label: 'In pedana: ' + hit.nome, pct: 100, gara: hit };
    }
    var cat = E.categoriaPer(a.anno, d.stagione);
    var previste = (g.gareAttese || []).filter(function (x) {
      var cats = x.categorie || [];
      var okCat = !cats.length || (cat && cats.some(function (c) { return (cat.gare || [cat.code]).indexOf(c) >= 0; }));
      var okSex = !x.sesso || x.sesso === 'MF' || x.sesso === a.sesso;
      var okArma = !x.arma || (a.armi || ['SP']).indexOf(x.arma) >= 0;
      return okCat && okSex && okArma;
    });
    if (previste.length) {
      var sa = d.statsAtleti && d.statsAtleti[a.fis];
      var pres = sa ? (sa.stagione.presenze || sa.tutto.presenze || 0) : 0;
      var pct = Math.min(95, 55 + pres * 8);
      return { lvl: 'ok', label: 'Gara prevista: ' + previste[0].nome, pct: pct, previste: previste };
    }
    if (gareG.length && g.al < d.oggi) return { lvl: 'no', label: 'Non ha gareggiato', pct: 0 };
    return { lvl: 'low', label: 'Nessuna gara prevista per la sua categoria', pct: 12 };
  };

  UI.ProbBar = function (p) {
    var pr = p.prob || { lvl: 'low', pct: 0 };
    return html`<span class=${'probbar ' + (pr.lvl === 'ok' ? '' : pr.lvl)} title=${pr.label}><i style=${{ width: Math.max(8, pr.pct) + '%' }}></i></span>`;
  };

  /** Righe "gara" leggibili: es. "Campionato Regionale GPG · Spada Ragazze". */
  UI.nomeGara = function (g) { return g ? (g.nome || g.evento || g.id) : ''; };

  UI.Logo = function (p) {
    // auto: logo blu su fondo chiaro, bianco su fondo scuro (segue il tema)
    var cls = p.auto ? 'logo-auto' : '';
    return html`<img class=${cls} src=${p.white ? 'assets/logo-white-240.png' : 'assets/logo-navy-240.png'} alt="ASD Scherma San Paolo" width=${p.size || 38} height=${p.size || 38} style=${{ objectFit: 'contain' }}/>`;
  };
})(window);
