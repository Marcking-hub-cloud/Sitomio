/* Fantascherma — guscio dell'app: avvio, scelta lega, iscrizione squadra, navigazione. */
(function (root) {
  'use strict';
  var React = root.React, ReactDOM = root.ReactDOM;
  var html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;

  var ROUTES = [
    { id: 'home', label: 'Home' },
    { id: 'formazione', label: 'Formazione' },
    { id: 'giornate', label: 'Giornate' },
    { id: 'classifica', label: 'Classifica' },
    { id: 'listone', label: 'Listone' },
    { id: 'rose', label: 'Rose' },
    { id: 'mercato', label: 'Mercato' },
    { id: 'asta', label: 'Asta' },
    { id: 'regolamento', label: 'Regolamento' },
    { id: 'presidenza', label: 'Presidenza', admin: true },
  ];
  function hashRoute() { var h = (location.hash || '').replace('#', ''); return ROUTES.some(function (r) { return r.id === h; }) ? h : 'home'; }
  function go(id) { if (location.hash.replace('#', '') !== id) location.hash = id; root.scrollTo(0, 0); }
  root.FSGo = go;

  // ---------------------------------------------------------------- splash
  function Splash(p) {
    return html`<div class="splash"><div class="stack" style=${{ alignItems: 'center' }}>
      <${UI.Logo} size=${120} auto=${true}/>
      <div class="brand-name" style=${{ fontSize: '34px', color: 'var(--ink)' }}>Fantascherma</div>
      <div class="muted">${p.msg || 'Caricamento della lega…'}</div>
      ${p.children || null}
    </div></div>`;
  }

  function NoDb() {
    if (root.FS_BACKEND) {
      return html`<${Splash} msg="Non riesco a collegarmi al database.">
        <p class="small muted" style=${{ maxWidth: '46ch' }}>Controlla la connessione e ricarica la pagina. Se il problema resta, avvisa il presidente della lega.</p>
        <button class="btn" onClick=${function () { location.reload(); }}>Ricarica</button>
      <//>`;
    }
    return html`<${Splash} msg="Per giocare devi aprire Fantascherma da claude.ai con il tuo account.">
      <p class="small muted" style=${{ maxWidth: '46ch' }}>Il proprietario della pagina può invitarti dal menu Condividi: scegli il livello Editor perché tu possa schierare la formazione e partecipare all'asta.</p>
    <//>`;
  }

  /** Versione web: accesso tramite il backend (FS_BACKEND.signIn; testi personalizzabili con loginTesto/loginPulsante). */
  function Login() {
    var b = root.FS_BACKEND || {};
    return html`<${Splash} msg="Il fantagioco della ASD Scherma San Paolo Milano.">
      <p class="small muted" style=${{ maxWidth: '46ch' }}>${b.loginTesto || 'Accedi per iscrivere la tua squadra, partecipare all\'asta e schierare la formazione. Agli altri giocatori della lega mostriamo solo il tuo nome.'}</p>
      <button class="btn" onClick=${function () { FS.login(); }}>${b.loginPulsante || 'Accedi'}</button>
    <//>`;
  }

  /** Versione web, primo avvio: il proprietario carica atleti, gare e calendario. */
  function DatiIniziali() {
    var s = FS.useFS();
    if (!s.web || Object.keys(s.atleti).length) return null;
    return html`<div class="banner warn" style=${{ margin: '0 0 16px' }}>
      ${s.isOwner
        ? html`<span class="grow">Il database è vuoto: carica gli atleti San Paolo, le gare 2025-26 e il calendario 2026-27.</span><${UI.AsyncBtn} cls="sm" onClick=${function () { return FS.act.caricaDatiIniziali(); }} busy="Caricamento…">Carica dati iniziali<//>`
        : html`<span>Il listone è ancora vuoto: il proprietario del sito deve caricare i dati iniziali.</span>`}
    </div>`;
  }

  // ------------------------------------------------------- scelta della lega
  function Onboarding() {
    var s = FS.useFS();
    var d = FS.derived();
    var st = useState(''); var code = st[0], setCode = st[1];
    var st2 = useState(''); var nome = st2[0], setNome = st2[1];
    var st3 = useState('copie'); var modo = st3[0], setModo = st3[1];
    var mie = Object.values(s.leghe).filter(function (l) { return (l.membri || []).indexOf(s.uid) >= 0 || (l.adminIds || []).indexOf(s.uid) >= 0; });
    // regole consigliate per le due modalità con il listone di adesso (le squadre non ci sono ancora)
    var regole = { copie: FS.impostazioniModalita('copie'), listone: FS.impostazioniModalita('listone') };
    var numeri = {
      copie: regole.copie.crediti + ' crediti · rosa ' + regole.copie.rosa + ' · ' + regole.copie.copieAtleta + ' copie per atleta',
      listone: regole.listone.crediti + ' crediti · rosa ' + regole.listone.rosa + ' · copie illimitate',
    };
    return html`<div class="page" style=${{ maxWidth: '920px' }}>
      <div class="row onb-hero">
        <${UI.Logo} size=${84} auto=${true}/>
        <div class="grow">
          <div class="eyebrow">ASD Scherma San Paolo Milano</div>
          <h1 class="brand-name onb-title">Fantascherma</h1>
          <div class="muted">Il fantagioco della nostra sala: una rosa di atleti, all'asta o dal listone, cinque in pedana a ogni gara, punti dai risultati di 4Fence.</div>
        </div>
      </div>
      <${DatiIniziali}/>
      ${!s.canWrite ? html`<div class="banner warn" style=${{ marginBottom: '16px' }}>Sei in sola lettura: puoi guardare classifiche e rose, ma per giocare chiedi al proprietario di invitarti come Editor.</div>` : null}
      ${mie.length ? html`<${UI.Card} title="Le tue leghe">
        <div class="list">${mie.map(function (l) {
          // tutta la riga è il pulsante (sul telefono «Entra» da solo era un bersaglio piccolo)
          return html`<button type="button" class="li li-btn onb-lega" key=${l.id} onClick=${function () { FS.selectLega(l.id); }}>
            <span class="body"><span class="title">${l.nome}</span><span class="sub">${(l.membri || []).length} squadre · ${UI.modalita(E.settingsCon(l.settings)).nome} · ${statoLega(l)}</span></span>
            <span class="onb-entra" aria-hidden="true">Entra ›</span>
          </button>`;
        })}</div>
      <//>` : null}
      <div class="grid grid-2" style=${{ marginTop: '16px' }}>
        <${UI.Card} title="Entra con il codice">
          <p class="small muted">Il presidente della lega ti ha mandato un codice di 6 caratteri.</p>
          <form class="row" onSubmit=${function (e) {
            e.preventDefault();
            var l = FS.act.trovaLegaDaCodice(code);
            if (!l) { FS.toast('Nessuna lega con il codice ' + code.toUpperCase() + '. Controlla e riprova.', 'err'); return; }
            FS.selectLega(l.id);
          }}>
            <input id="codice-lega" class="input grow onb-code" maxLength="6" placeholder="ES. K7PQ2M" aria-label="Codice della lega"
              autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck=${false} enterKeyHint="go"
              value=${code} onInput=${function (e) { setCode(e.target.value.toUpperCase()); }}/>
            <button class="btn" disabled=${code.trim().length < 6}>Entra</button>
          </form>
        <//>
        <${UI.Card} title="Crea una nuova lega">
          <p class="small muted">Diventi il presidente: inviti gli amici con il codice, scegli la modalità di gioco e ufficializzi le giornate.</p>
          <form class="stack" style=${{ gap: '12px' }} onSubmit=${async function (e) { e.preventDefault(); if (nome.trim()) await FS.act.creaLega({ nome: nome.trim(), settings: FS.impostazioniModalita(modo) }); }}>
            <${UI.Field} id="nome-lega" label="Nome della lega">
              <input id="nome-lega" class="input" placeholder="Es. Lega del Martedì" autoCapitalize="words" enterKeyHint="done" value=${nome} maxLength="40" onInput=${function (e) { setNome(e.target.value); }}/>
            <//>
            <${UI.ModalitaScelta} id="nuova-lega-modalita" value=${modo} onChange=${setModo} copie=${regole.copie.copieAtleta} numeri=${numeri}/>
            <div class="row between onb-crea">
              <span class="tiny faint grow">Potrai cambiarla dalle regole finché nessuna squadra ha preso atleti.</span>
              <button class="btn" disabled=${!nome.trim() || !s.canWrite}>Crea la lega</button>
            </div>
          </form>
        <//>
      </div>
      ${Object.keys(s.leghe).length && !mie.length ? html`<p class="small faint" style=${{ marginTop: '14px' }}>Leghe attive in questo Fantascherma: ${Object.keys(s.leghe).length}. Per entrare serve il codice.</p>` : null}
      <div style=${{ marginTop: '22px' }}><${AnteprimaListone}/></div>
    </div>`;
  }

  function AnteprimaListone() {
    var s = FS.useFS();
    var d = FS.derived();
    var atleti = Object.values(s.atleti).filter(function (a) { return a.attivo !== false; })
      .sort(function (a, b) { return (b.quotazione || 0) - (a.quotazione || 0); }).slice(0, 8);
    if (!atleti.length) return null;
    return html`<${UI.Card} title="I più quotati del listone" meta=${Object.keys(s.atleti).length + ' atleti San Paolo'}>
      <div class="list">${atleti.map(function (a) {
        var inf = UI.infoAtleta(a, d);
        return html`<div class="li" key=${a.fis}><${UI.AtletaMask} atleta=${a} size=${38}/><div class="body"><div class="title">${UI.nomeAtleta(a)}</div><div class="sub">${inf.catLabel} · ${a.anno}</div></div><${UI.Role} ruolo=${inf.ruolo}/><span class="tag blue">Qt ${a.quotazione || 1}</span></div>`;
      })}</div>
    <//>`;
  }

  function statoLega(l) {
    if (l.stato === 'asta') return 'asta in corso';
    if (l.stato === 'campionato') return 'campionato in corso';
    return E.modalita(E.settingsCon(l.settings)) === 'listone' ? 'iscrizioni e composizione delle rose' : 'iscrizioni aperte';
  }
  root.FSStatoLega = statoLega;

  // ------------------------------------------------------ creazione squadra
  var COMBO = [['#0b1150', '#f2c94c'], ['#c92a2a', '#ffffff'], ['#2b8a3e', '#ffffff'], ['#1971c2', '#ffd43b'], ['#212529', '#ff922b'], ['#7048e8', '#e5dbff'], ['#e8590c', '#212529'], ['#0c8599', '#ffffff'], ['#b5205a', '#ffe3ec'], ['#495057', '#74c0fc']];
  function NuovaSquadra() {
    var s = FS.useFS();
    var d = FS.derived();
    var st = useState(''); var nome = st[0], setNome = st[1];
    var st2 = useState(''); var motto = st2[0], setMotto = st2[1];
    var st3 = useState(COMBO[Math.floor(Math.random() * COMBO.length)]); var col = st3[0], setCol = st3[1];
    return html`<div class="page" style=${{ maxWidth: '760px' }}>
      <div class="crumbs"><button class="linkbtn" onClick=${function () { FS.selectLega(null); }}>← Leghe</button><span class="c on">${d.lega.nome}</span></div>
      <${UI.Card} title="Iscrivi la tua squadra" meta=${'Codice lega: ' + d.lega.codice}>
        ${!s.canWrite ? html`<div class="banner warn">Sei in sola lettura: puoi seguire la lega ma non iscrivere una squadra.</div>` : null}
        <div class="row ns-row">
          <div class="stack ns-avatar">
            <${UI.TeamMask} team=${{ nome: nome || 'Tu', colori: col, id: s.uid }} size=${110}/>
            <div class="ns-swatches" role="group" aria-label="Colori della squadra">${COMBO.map(function (c, i) {
              return html`<button type="button" key=${i} class="ns-sw" aria-label=${'Colori ' + (i + 1)} aria-pressed=${col === c ? 'true' : 'false'} onClick=${function () { setCol(c); }} style=${{ backgroundImage: 'linear-gradient(135deg,' + c[0] + ' 55%,' + c[1] + ' 55%)' }}></button>`;
            })}</div>
          </div>
          <form class="stack grow ns-form" onSubmit=${async function (e) { e.preventDefault(); await FS.act.creaSquadra({ nome: nome, motto: motto, colori: col }); }}>
            <${UI.Field} id="nome-squadra" label="Nome della squadra"><input id="nome-squadra" class="input" maxLength="40" placeholder="Es. Stoccata Vincente" autoCapitalize="words" enterKeyHint="next" value=${nome} onInput=${function (e) { setNome(e.target.value); }}/><//>
            <${UI.Field} id="motto-squadra" label="Motto (facoltativo)"><input id="motto-squadra" class="input" maxLength="80" placeholder="Es. In guardia, sempre." enterKeyHint="done" value=${motto} onInput=${function (e) { setMotto(e.target.value); }}/><//>
            <div class="small muted">${d.modalita === 'listone'
              ? 'Modalità «' + UI.modalita(d.settings).nome + '»: riceverai ' + d.settings.crediti + ' crediti, uguali per tutti, per comprare dal listone una rosa di ' + d.settings.rosa + ' atleti.'
              : 'Modalità «' + UI.modalita(d.settings).nome + '»: riceverai ' + d.settings.crediti + ' crediti per l\'asta e dovrai comporre una rosa di ' + d.settings.rosa + ' atleti.'}</div>
            <div class="ns-submit"><button class="btn" disabled=${!nome.trim() || !s.canWrite}>Iscrivi la squadra</button></div>
          </form>
        </div>
      <//>
    </div>`;
  }

  // ----------------------------------------------------------------- guscio
  function Topbar(p) {
    var s = FS.useFS();
    var mie = Object.values(s.leghe).filter(function (l) { return (l.membri || []).indexOf(s.uid) >= 0 || (l.adminIds || []).indexOf(s.uid) >= 0 || l.id === s.legaId; });
    return html`<header class="topbar"><div class="topbar-in">
      <a class="brand" href="#home" onClick=${function () { go('home'); }}>
        <${UI.Logo} white=${true} size=${38}/>
        <span class="brand-txt"><span class="brand-name">Fantascherma</span><span class="brand-sub">San Paolo · ${s.demo ? 'anteprima' : s.mock ? 'demo locale' : 'stagione ' + (FS.derived().stagione) + '/' + String(FS.derived().stagione + 1).slice(2)}</span></span>
      </a>
      <span class="spacer"></span>
      <select id="lega-switch" class="lega-switch" aria-label="Lega" value=${s.legaId || ''} onChange=${function (e) { FS.selectLega(e.target.value || null); }}>
        ${mie.map(function (l) { return html`<option key=${l.id} value=${l.id}>${l.nome}</option>`; })}
        <option value="">+ Altra lega…</option>
      </select>
      ${s.me ? html`<span class="me"><img src=${s.me.avatarUrl} alt="" title=${s.me.name || ''}/></span>` : null}
      ${s.web ? html`<button class="btn xs ghost" onClick=${function () { FS.logout(); }}>Esci</button>` : null}
    </div></header>`;
  }

  /** Sezioni visibili a questo utente (Presidenza solo ai presidenti, niente Asta nel listone). */
  function rotteVisibili(d) {
    return ROUTES.filter(function (r) { return (!r.admin || d.isCommissario) && !(r.id === 'asta' && d.modalita === 'listone'); });
  }
  /** Pallini rossi sulle sezioni: proposte di scambio da guardare, asta in corso. */
  function avvisiSezioni(s) {
    var nScambi = Object.values(s.scambi).filter(function (x) { return x.stato === 'proposto' && x.a === s.uid; }).length;
    return {
      mercato: nScambi ? (nScambi === 1 ? '1 proposta di scambio' : nScambi + ' proposte di scambio') : '',
      asta: s.asta && s.asta.attiva ? 'asta in corso' : '',
    };
  }

  function Tabs(p) {
    var d = FS.derived();
    var s = FS.useFS();
    var ref = useRef(null);
    var avvisi = avvisiSezioni(s);
    // la sezione aperta resta in vista quando la barra scorre (tablet e finestre strette)
    useEffect(function () {
      var box = ref.current;
      if (!box || box.scrollWidth <= box.clientWidth) return;
      var el = box.querySelector('[aria-current="page"]');
      if (!el) return;
      box.scrollLeft += el.getBoundingClientRect().left - box.getBoundingClientRect().left - (box.clientWidth - el.offsetWidth) / 2;
    }, [p.route]);
    return html`<nav class="tabs" aria-label="Sezioni"><div class="tabs-in" ref=${ref}>
      ${rotteVisibili(d).map(function (r) {
        var dot = avvisi[r.id];
        return html`<button key=${r.id} class="tab" aria-current=${p.route === r.id ? 'page' : null} onClick=${function () { go(r.id); }}>${r.label}${dot ? html`<${React.Fragment}><span class="dot"></span><span class="sr-only"> (${dot})</span><//>` : null}</button>`;
      })}
    </div></nav>`;
  }

  // icone della barra in basso (24x24, tratto: currentColor)
  var ICONE = {
    home: ['M3 10.5 12 3l9 7.5', 'M5 9v11h5v-6h4v6h5V9'],
    formazione: ['M2 7h20v10H2z', 'M12 7v10', 'M6 12h.01', 'M18 12h.01', 'M8.5 9.5v5', 'M15.5 9.5v5'],
    classifica: ['M3 20h18', 'M4 20v-7h5v7', 'M9.5 20V8h5v12', 'M15 20v-5h5v5'],
    mercato: ['M4 8h15', 'M15 4l4 4-4 4', 'M20 16H5', 'M9 12l-4 4 4 4'],
    altro: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
    giornate: ['M4 5h16v16H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4', 'M8 14h3', 'M13 14h3', 'M8 17h3'],
    listone: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
    rose: ['M12 3l8 3v6c0 4.6-3.4 7.9-8 9-4.6-1.1-8-4.4-8-9V6z', 'M9 12l2 2 4-4'],
    asta: ['M14.5 3.5l6 6-3 3-6-6z', 'M13 8 4.5 16.5a1.5 1.5 0 0 0 2 2.1L15 10', 'M12 21h9'],
    regolamento: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h11', 'M9 8h6'],
    presidenza: ['M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z'],
  };
  function Icona(p) {
    return html`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      ${(ICONE[p.k] || ICONE.altro).map(function (d, i) { return html`<path key=${i} d=${d}/>`; })}
    </svg>`;
  }

  /** Telefono: barra delle sezioni in basso (sotto il pollice); «Altro» apre il foglio con le altre sezioni. */
  var PRINCIPALI = ['home', 'formazione', 'classifica', 'mercato'];
  function BottomNav(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var st = useState(false); var aperto = st[0], setAperto = st[1];
    UI.useRootClass('fs-nav', true);
    var avvisi = avvisiSezioni(s);
    var vis = rotteVisibili(d);
    var altre = vis.filter(function (r) { return PRINCIPALI.indexOf(r.id) < 0; });
    var qui = altre.filter(function (r) { return r.id === p.route; })[0] || null;
    var avvisiAltre = altre.filter(function (r) { return avvisi[r.id]; }).map(function (r) { return avvisi[r.id]; });
    function vai(id) { setAperto(false); go(id); }
    return html`<${React.Fragment}>
      <nav class="botnav" aria-label="Sezioni principali">
        ${PRINCIPALI.map(function (id) {
          var r = ROUTES.filter(function (x) { return x.id === id; })[0];
          return html`<button type="button" key=${id} aria-current=${p.route === id ? 'page' : null} onClick=${function () { go(id); }}>
            <${Icona} k=${id}/><span class="l">${r.label}</span>
            ${avvisi[id] ? html`<${React.Fragment}><span class="dot" aria-hidden="true"></span><span class="sr-only"> (${avvisi[id]})</span><//>` : null}
          </button>`;
        })}
        <button type="button" aria-current=${qui ? 'page' : null} aria-haspopup="dialog" aria-expanded=${aperto ? 'true' : 'false'} onClick=${function () { setAperto(true); }}>
          <${Icona} k=${qui ? qui.id : 'altro'}/><span class="l">Altro</span>${qui ? html`<span class="sr-only"> (sezione aperta: ${qui.label})</span>` : null}
          ${avvisiAltre.length ? html`<${React.Fragment}><span class="dot" aria-hidden="true"></span><span class="sr-only"> (${avvisiAltre.join(', ')})</span><//>` : null}
        </button>
      </nav>
      ${aperto ? html`<${UI.Modal} title="Altre sezioni" onClose=${function () { setAperto(false); }}>
        <div class="more-nav">${altre.map(function (r) {
          return html`<button type="button" key=${r.id} aria-current=${p.route === r.id ? 'page' : null} onClick=${function () { vai(r.id); }}>
            <${Icona} k=${r.id}/><span class="grow">${r.label}</span>
            ${avvisi[r.id] ? html`<span class="tag red">${avvisi[r.id]}</span>` : null}
            <span class="chev" aria-hidden="true">›</span>
          </button>`;
        })}</div>
      <//>` : null}
    <//>`;
  }

  /** Telefono, asta in corso e si è in un'altra sezione: barra «Asta live» sopra la navigazione. */
  function AstaLive() {
    var s = FS.useFS();
    var now = FS.useTick(1000);
    UI.useRootClass('fs-pill', true);
    var a = s.asta || {};
    var L = a.lotto;
    var turno = a.ordine ? a.ordine[a.turno] : null;
    var testo = L ? UI.nomeAtleta(s.atleti[L.atletaId], true) + ' · ' + L.offerta
      : turno === s.uid ? 'Tocca a te chiamare' : turno ? 'Chiama ' + FS.nomeSquadra(turno) : 'In attesa della chiamata';
    var secs = L && !a.pausa ? Math.max(0, Math.ceil(((L.scadenza || 0) - now) / 1000)) : null;
    return html`<button type="button" class="live-pill" onClick=${function () { go('asta'); }}>
      <span class="lamp v" aria-hidden="true"></span>
      <b>Asta</b>
      <span class="lp-t">${testo}</span>
      ${a.pausa ? html`<span class="lp-s">in pausa</span>` : secs !== null ? html`<span class="lp-s num" aria-label=${secs + ' secondi'}>${secs}s</span>` : null}
      <span class="lp-c" aria-hidden="true">›</span>
    </button>`;
  }

  function Band(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var t = d.mia;
    var tick = FS.useTick(30000);
    var narrow = UI.useMq(UI.PHONE);
    if (!t) return html`<div class="band"><div class="band-in"><div class="band-t"><h1>${d.lega.nome}</h1><div class="sub">Spettatore</div></div></div></div>`;
    var pos = d.classifica.filter(function (r) { return r.id === t.id; })[0];
    // listone: finché la rosa non è completa l'azione principale è comprare dal listone
    var componi = d.composizione && d.miaRosa && d.miaRosa.rosa.length < d.settings.rosa;
    var azione = d.lega.stato === 'asta' && d.modalita !== 'listone' ? ['asta', 'Vai all\'asta'] : componi ? ['listone', 'Componi la rosa'] : ['formazione', 'Inserisci formazione'];
    // niente pulsante verso la sezione in cui si è già
    var azioni = [['mercato', 'Mercato'], azione].filter(function (x) { return x[0] !== p.route; });
    return html`<div class="band"><div class="band-in">
      <${UI.TeamMask} team=${t} size=${narrow ? 44 : 64}/>
      <div class="band-t">
        <h1>${t.nome}</h1>
        <div class="sub">${FS.nomeGiocatore(s.uid)}${t.motto ? html`<span class="band-motto"> · «${t.motto}»</span>` : null} · ${d.miaRosa ? d.miaRosa.crediti : d.settings.crediti} crediti${pos && pos.giocate ? html`<span> · ${pos.pos}°<span class="band-x"> in classifica</span></span>` : null}</div>
      </div>
      ${azioni.length ? html`<div class="actions">${azioni.map(function (x) {
        return html`<button key=${x[0]} class="btn light sm" onClick=${function () { go(x[0]); }}>${x[1]}</button>`;
      })}</div>` : null}
    </div></div>`;
  }

  /** Chiusura automatica dei lotti d'asta scaduti, da qualunque client aperto. */
  function AstaWatcher() {
    var s = FS.useFS();
    useEffect(function () {
      var jitter = 300 + Math.random() * 1200;
      var t = setInterval(function () {
        var a = FS.getState().asta;
        if (a && a.lotto && !a.pausa && FS.now() > a.lotto.scadenza + 1500 + jitter) FS.act.chiudiLottoSeScaduto();
      }, 700);
      return function () { clearInterval(t); };
    }, [s.legaId]);
    return null;
  }

  var currentAtleta = null;
  function App() {
    var s = FS.useFS();
    var st = useState(hashRoute()); var route = st[0], setRoute = st[1];
    var st2 = useState(null); var atleta = st2[0], setAtleta = st2[1];
    useEffect(function () {
      // cambiando sezione (anche col tasto «indietro») la scheda atleta aperta si chiude: appartiene alla pagina di prima
      function h() { setRoute(hashRoute()); setAtleta(null); }
      root.addEventListener('hashchange', h);
      UI.openAtleta = function (fis) { setAtleta(fis); };
      return function () { root.removeEventListener('hashchange', h); };
    }, []);
    useEffect(function () { setAtleta(null); }, [s.legaId]);
    // Presidenza aperta da chi non è presidente (link condiviso, cronologia): si mostra la Home e lo dice anche l'indirizzo
    var vietata = route === 'presidenza' && s.phase === 'ready' && !!s.legaId && !!s.legaLoaded && !!FS.derived().lega && !FS.derived().isCommissario;
    useEffect(function () {
      if (!vietata) return;
      try { root.location.replace('#home'); } catch (e) { setRoute('home'); }
    }, [vietata]);
    if (s.phase === 'loading') return html`<${Splash}/>`;
    if (s.phase === 'nodb') return html`<${NoDb}/>`;
    if (s.phase === 'login') return html`<${React.Fragment}><${Login}/><${UI.Toasts}/><//>`;
    var d = FS.derived();
    var body;
    if (!s.legaId || !d.lega) body = html`<${Onboarding}/>`;
    else if (!s.legaLoaded) body = html`<${Splash}/>`;
    else if (!d.mia && s.canWrite) body = html`<${NuovaSquadra}/>`;
    else {
      var View = V[cap(route)] || V.Home;
      if (route === 'presidenza' && !d.isCommissario) View = V.Home;
      var astaLive = !!(s.asta && s.asta.attiva) && route !== 'asta' && d.modalita !== 'listone';
      body = html`<${React.Fragment}>
        <${Band} route=${route}/>
        <${Tabs} route=${route}/>
        <main class="page">${View ? html`<${View} go=${go}/>` : html`<${UI.Empty} title="Sezione in arrivo"/>`}</main>
        ${astaLive ? html`<${AstaLive}/>` : null}
        <${BottomNav} route=${route}/>
        <${AstaWatcher}/>
      <//>`;
    }
    return html`<${React.Fragment}>
      <${Topbar}/>
      ${s.demo ? html`<${DemoBanner}/>` : s.mock ? html`<div class="banner warn flat" style=${{ justifyContent: 'center' }}>Demo locale: i dati restano in questo browser. Utente: <b>${s.uid}</b> <span class="small muted">(apri un'altra scheda con ?u=u_dev2 per provare il multiplayer)</span> <button class="btn xs ghost" onClick=${function () { root.FSMock.reset(); location.reload(); }}>Azzera demo</button></div>` : null}
      ${!s.canWrite && s.phase === 'ready' ? html`<div class="banner warn flat" style=${{ justifyContent: 'center' }}>Sola lettura: chiedi al proprietario di invitarti come Editor per giocare.</div>` : null}
      ${body}
      ${atleta && V.Atleta ? html`<${V.Atleta} fis=${atleta} onClose=${function () { setAtleta(null); }}/>` : null}
      <${UI.Toasts}/>
    <//>`;
  }
  function cap(r) { return r.charAt(0).toUpperCase() + r.slice(1); }

  /** Anteprima pubblica: si gioca nei panni dei quattro presidenti della lega di prova, i dati restano nel browser. */
  var GIOCATORI_DEMO = ['u_dev1', 'u_dev2', 'u_dev3', 'u_dev4'];
  var TESTO_DEMO = 'È una lega di prova: quello che fai resta solo nel tuo browser.';
  function DemoBanner() {
    var s = FS.useFS();
    var st = useState(false); var chiedi = st[0], setChiedi = st[1];
    function diventa(uid) { root.FSMock.setUser(uid); location.reload(); }
    function ricomincia() { root.FSMock.reset(); location.reload(); }
    var nomi = (root.FSMock && root.FSMock.NOMI) || {};
    function nome(uid) { return (nomi[uid] || uid) + (uid === 'u_dev1' ? ' (presidente)' : ''); }
    // computer: frase e un pulsante per giocatore; telefono: una riga sola con un menu «Gioca come»
    return html`<div class="banner warn flat demo-banner">
      <span class="demo-txt"><b>Anteprima di Fantascherma.</b> ${TESTO_DEMO} Gioca come:</span>
      <span class="row demo-btns">
        ${GIOCATORI_DEMO.map(function (uid) {
          var sq = s.squadre && s.squadre[uid] ? s.squadre[uid].nome : '';
          var io = uid === s.uid;
          return html`<button key=${uid} type="button" class=${'btn xs' + (io ? '' : ' ghost')} aria-pressed=${io ? 'true' : 'false'}
            title=${sq ? 'Squadra: ' + sq : ''} onClick=${io ? null : function () { diventa(uid); }}>${nome(uid)}</button>`;
        })}
      </span>
      <span class="demo-pick">
        <span class="tag gold">Anteprima</span>
        <label class="lbl demo-lbl" htmlFor="demo-gioca">Gioca come</label>
        <select id="demo-gioca" class="input" value=${s.uid} onChange=${function (e) { if (e.target.value !== s.uid) diventa(e.target.value); }}>
          ${GIOCATORI_DEMO.map(function (uid) { return html`<option key=${uid} value=${uid}>${nome(uid)}</option>`; })}
        </select>
      </span>
      <button type="button" class="btn xs ghost demo-reset" aria-label="Ricomincia l'anteprima" onClick=${function () { setChiedi(true); }}><span class="demo-ico" aria-hidden="true">↺</span><span class="demo-reset-l">Ricomincia</span></button>
      ${chiedi ? html`<${UI.Confirm} title="Ricominciare l'anteprima?" yes="Ricomincia" danger=${true} onNo=${function () { setChiedi(false); }} onYes=${ricomincia}>${TESTO_DEMO} Si riparte dalla lega di prova iniziale e le modifiche fatte si perdono.<//>` : null}
    </div>`;
  }

  root.FSBoot = function () {
    var el = document.getElementById('app');
    ReactDOM.createRoot(el).render(html`<${App}/>`);
    FS.init();
  };
})(window);
