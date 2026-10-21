/* Vista Regolamento: il regolamento ufficiale della lega, generato dalle impostazioni vive
 * (d.settings e d.settings.punteggio), così coincide sempre con quello che calcola il motore.
 * Indice compatto (pulsanti che scorrono alla sezione, nessun routing via hash) + articolo .rules. */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useMemo = React.useMemo, useState = React.useState, useEffect = React.useEffect;

  var SEZIONI = [
    { id: 'lega', t: 'La lega' },
    { id: 'atleti', t: 'Gli atleti e i ruoli' },
    { id: 'asta', t: 'Modalità di gioco' },
    { id: 'calendario', t: 'Calendario e giornate' },
    { id: 'formazione', t: 'La formazione' },
    { id: 'punteggio', t: 'Il punteggio' },
    { id: 'sostituzioni', t: 'Sostituzioni e voto d\'ufficio' },
    { id: 'classifica', t: 'Classifica' },
    { id: 'mercato', t: 'Mercato' },
    { id: 'ricorsi', t: 'Risultati, correzioni e ricorsi' },
    { id: 'fairplay', t: 'Fair play' },
  ];

  // Esempi di fantavoto (dati fissi, calcolati dal vivo con E.fantavoto e le regole della lega).
  var ES_ORO = {
    stato: 'ok', girone: { n: 6, v: 5, s: 0, td: 21, tr: 2 }, qualificato: true, seed: 1,
    de: [
      { r: 32, opp: 'n.33', oppSeed: 33, td: 15, tr: 2, v: true },
      { r: 16, opp: 'n.17', oppSeed: 17, td: 15, tr: 2, v: true },
      { r: 8, opp: 'n.8', oppSeed: 8, td: 10, tr: 5, v: true },
      { r: 4, opp: 'n.5', oppSeed: 5, td: 15, tr: 10, v: true },
      { r: 2, opp: 'n.10', oppSeed: 10, td: 14, tr: 11, v: true },
    ],
    place: 1, of: 37, deTouches: 15,
  };
  var ES_SALITA = {
    stato: 'ok', girone: { n: 7, v: 1, s: 5, td: 14, tr: 27 }, qualificato: true, seed: 40,
    de: [{ r: 64, opp: 'n.9', oppSeed: 9, td: 6, tr: 15, v: false }],
    place: 45, of: 60, deTouches: 15,
  };

  // ------------------------------------------------------------ utilità
  function num(x, def) { var v = Number(x); return isFinite(v) ? v : (def || 0); }
  function stagioneLabel(st) { return st + '-' + String(st + 1).slice(2); }
  function pct(x) { return UI.fmt(Math.round(num(x) * 1000) / 10) + '%'; }
  function cr(x) { return UI.fmt(x) + (num(x) === 1 ? ' credito' : ' crediti'); }
  function copie(x) { return UI.fmt(x) + (num(x) === 1 ? ' copia' : ' copie'); }
  /** Modalità in vigore: 'copie' (asta a copie, anche la vecchia 'singola') | 'listone' (listone a budget fisso). */
  function modoDisp(S) { return E.modalita(S); }
  /** Copie per atleta (1 con la vecchia 'singola', Infinity con il listone): stessa lettura di E.copieLibere. */
  function nCopie(S) { return E.copiePerAtleta(S); }
  function nAttivi(atleti) { return Object.keys(atleti).filter(function (k) { return atleti[k] && atleti[k].attivo !== false; }).length; }
  /** Virgola decimale nelle descrizioni del motore («5 × 0.5» → «5 × 0,5»). */
  function virgola(x) { return String(x === undefined || x === null ? '' : x).replace(/(\d)\.(\d)/g, '$1,$2'); }
  function inItaliano(res) {
    return Object.assign({}, res, { voci: (res.voci || []).map(function (v) { return Object.assign({}, v, { label: virgola(v.label), det: virgola(v.det) }); }) });
  }
  /** Articolo davanti a una percentuale: «il 50%», ma «l'80%», «l'8%», «l'11%», «lo 0%». */
  function artPct(x) {
    var n = Math.floor(Math.round(num(x) * 1000) / 10);
    if (n === 0) return 'lo ';
    return n === 1 || n === 8 || n === 11 || (n >= 80 && n <= 89) ? 'l\'' : 'il ';
  }
  function catShort(code) { var c = E.CATEGORIE.filter(function (k) { return k.code === code; })[0]; return c ? c.short : code; }
  function anniNascita(c, st) {
    var da = st - c.eta[1], a = st - c.eta[0];
    if (c.eta[1] >= 100) return a + ' e precedenti';
    if (c.eta[0] <= 0) return da + ' e successivi';
    return da === a ? String(a) : da + '–' + a;
  }
  /** Nome della giornata senza il prefisso ripetuto «Giornata N ·». */
  function nomeBreve(g) {
    return String(g.nome || '').replace(/^\s*giornata\s+\d+\s*[·:\-–]?\s*/i, '');
  }
  /** «Dal 10°», ma «Dall'8°» e «Dall'11°» (numeri che si leggono con una vocale iniziale). */
  function dalPosto(n) {
    var vocale = n === 8 || n === 11 || (n >= 80 && n <= 89);
    return (vocale ? 'Dall\'' : 'Dal ') + n + '°';
  }
  function statoLega(l) {
    if (!l || !l.stato) return '—';
    if (l.stato === 'asta') return 'asta in corso';
    if (l.stato === 'campionato') return 'campionato in corso';
    return E.modalita(E.settingsCon(l.settings)) === 'listone' ? 'iscrizioni e composizione delle rose' : 'iscrizioni aperte';
  }
  function scrollA(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var smooth = true;
    try { smooth = !(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }
    try { el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); } catch (e) { el.scrollIntoView(); }
    try { el.focus({ preventScroll: true }); } catch (e) { }
  }

  // ------------------------------------------------------- struttura
  function Indice() {
    return html`<nav class="card reg-toc" id="reg-indice" tabIndex="-1" aria-label="Indice del regolamento">
      <div class="card-b">
        <div class="eyebrow">Indice</div>
        <ol>${SEZIONI.map(function (x, i) {
          return html`<li key=${x.id}><button type="button" onClick=${function () { scrollA('reg-' + x.id); }}><span class="n">${i + 1}</span><span>${x.t}</span></button></li>`;
        })}</ol>
      </div>
    </nav>`;
  }

  function Sezione(p) {
    return html`<section class="reg-sec" aria-labelledby=${'reg-' + p.id}>
      <h2 id=${'reg-' + p.id} tabIndex="-1"><span class="n">${p.n}.</span> ${p.titolo}</h2>
      ${p.children}
    </section>`;
  }

  /**
   * Telefono e tablet (indice non affiancato): pulsante «Indice» sempre a portata di pollice,
   * compare quando l'indice in cima è uscito dallo schermo e apre l'elenco delle sezioni in un foglio.
   */
  function IndiceMobile() {
    var st = useState(false); var visibile = st[0], setVisibile = st[1];
    var stA = useState(false); var aperto = stA[0], setAperto = stA[1];
    var stretto = UI.useMq('(max-width: 979px)');
    useEffect(function () {
      if (!stretto) return undefined;
      var el = document.getElementById('reg-indice');
      if (!el || !root.IntersectionObserver) { setVisibile(true); return undefined; }
      var io = new root.IntersectionObserver(function (ee) { setVisibile(!ee[0].isIntersecting); });
      io.observe(el);
      return function () { io.disconnect(); };
    }, [stretto]);
    if (!stretto) return null;
    return html`<${React.Fragment}>
      ${visibile ? html`<button type="button" class="btn reg-fab" aria-haspopup="dialog" onClick=${function () { setAperto(true); }}>☰ Indice</button>` : null}
      ${aperto ? html`<${UI.Modal} title="Indice del regolamento" onClose=${function () { setAperto(false); }}>
        <ol class="reg-toc-list">${SEZIONI.map(function (x, i) {
          return html`<li key=${x.id}><button type="button" onClick=${function () { setAperto(false); setTimeout(function () { scrollA('reg-' + x.id); }, 60); }}><span class="n">${i + 1}</span><span>${x.t}</span></button></li>`;
        })}</ol>
      <//>` : null}
    <//>`;
  }

  // ---------------------------------------------------------- 1 La lega
  function SezLega() {
    var s = FS.useFS();
    var d = FS.derived();
    var lega = d.lega || {};
    var pres = (lega.adminIds || []).map(function (uid) {
      var t = s.squadre[uid];
      return FS.nomeGiocatore(uid) + (t ? ' (' + t.nome + ')' : '');
    });
    var squadre = d.teamIds.map(function (t) { return s.squadre[t]; }).filter(Boolean);
    return html`<div>
      <p>Fantascherma è il fantagioco della <b>ASD Scherma San Paolo Milano</b>: ogni partecipante, il <i>manager</i>, guida una squadra di tiratori e tiratrici di spada della nostra sala e fa punti con i loro risultati veri, pubblicati su 4Fence.</p>
      <p>Si gioca in leghe di amici. Ogni manager ha <b>una sola squadra</b> per lega, legata al proprio account. Il <b>presidente</b> crea la lega e custodisce il codice d'invito, sceglie la modalità di gioco e imposta le regole, ${E.modalita(d.settings) === 'listone' ? 'avvia il campionato quando le rose sono pronte' : 'guida l\'asta'}, apre e chiude il mercato, importa i risultati e ufficializza le giornate. Può nominare altri presidenti con gli stessi poteri.</p>
      <dl class="reg-dl">
        <dt>Lega</dt><dd>${lega.nome || '—'}</dd>
        <dt>Codice d'invito</dt><dd>${lega.codice ? html`<span class="kbd">${lega.codice}</span>` : '—'}</dd>
        <dt>${pres.length > 1 ? 'Presidenti' : 'Presidente'}</dt><dd>${pres.length ? pres.join(', ') : '—'}</dd>
        <dt>Squadre</dt><dd>${squadre.length ? squadre.length + ': ' + squadre.map(function (t) { return t.nome; }).join(', ') : 'nessuna iscritta, per ora'}</dd>
        <dt>Modalità</dt><dd><${UI.ModalitaTag} settings=${d.settings}/> <span class="small muted">(sezione 3)</span></dd>
        <dt>Fase</dt><dd>${statoLega(lega)}</dd>
        <dt>Stagione</dt><dd>${stagioneLabel(d.stagione)}</dd>
      </dl>
      <h3>Lo spirito del gioco</h3>
      <p>Si gioca per divertirsi e per seguire da vicino i compagni di sala, gara dopo gara. Le regole di questa pagina sono quelle che il calcolo automatico applica davvero: se il presidente cambia un valore, il regolamento si aggiorna da solo. Nei casi che le regole non prevedono decide il presidente, con buon senso e sentite le squadre.</p>
    </div>`;
  }

  // ------------------------------------------------ 2 Atleti e ruoli
  function SezAtleti() {
    var s = FS.useFS();
    var d = FS.derived();
    var st = d.stagione;
    var nAtleti = Object.keys(s.atleti).length;
    // quotazioni reali del listone, con i numeri del modello (stessa funzione usata dall'app)
    var Vq = E.valutaQuotazioni(s.atleti, s.gare, d.settings, st);
    var Qp = Vq.param;
    var esQt = Object.keys(Vq.atleti).map(function (fis) { return { fis: fis, a: s.atleti[fis], v: Vq.atleti[fis] }; })
      .filter(function (r) { return r.a; })
      .sort(function (x, y) { return y.v.qt - x.v.qt || y.v.valore - x.v.valore; });
    var esempi = esQt.length > 6 ? [esQt[0], esQt[1], esQt[Math.floor(esQt.length / 3)], esQt[Math.floor(esQt.length / 2)], esQt[esQt.length - 1]] : esQt;
    var modo = modoDisp(d.settings), K = nCopie(d.settings);
    var mercatoQt = modo === 'listone' ? 'È il prezzo a cui si compra dal listone, prima e durante il campionato.'
      : K > 1 ? (d.settings.prezzoSvincolati === 'uno' ? 'In questa lega però le copie libere al mercato costano sempre 1 credito.' : 'È il prezzo delle copie libere al mercato.')
      : (d.settings.prezzoSvincolati === 'uno' ? 'In questa lega però gli svincolati al mercato costano sempre 1 credito.' : 'È il prezzo degli svincolati al mercato.');
    return html`<div>
      <p>Il <b>listone</b> comprende i tiratori e le tiratrici di spada della San Paolo che compaiono nei risultati di 4Fence${nAtleti ? html`<${React.Fragment}> (oggi <b>${nAtleti}</b> atleti)<//>` : null}. Il presidente può aggiungere un atleta che manca o correggerne i dati.</p>
      ${modo === 'listone' ? html`<p>In questa lega si gioca con il <b>listone a budget fisso</b>: lo stesso atleta può stare in un numero qualunque di rose, ma una volta sola per rosa, e ogni squadra che lo ha prende il suo fantavoto intero (sezione 3).</p>`
        : K === 1 ? html`<p>In questa lega ogni atleta del listone è disponibile in <b>1 copia</b>: può stare in una sola rosa, come nell'asta classica. Chi non è in nessuna rosa è uno <i>svincolato</i> (sezione 3).</p>`
        : html`<p>In questa lega ogni atleta del listone è disponibile in <b>${copie(K)}</b>, come una figurina: lo possono avere fino a ${K} squadre diverse, ognuna una volta sola. Ogni squadra che lo ha prende il suo fantavoto intero (sezione 3).</p>`}
      <h3>I ruoli</h3>
      <p>Ogni atleta ha un ruolo, che dipende dalla sua categoria nella stagione ${stagioneLabel(st)}:</p>
      <ul>${E.ORDINE_RUOLI.map(function (r) {
        var R = E.RUOLI[r];
        return html`<li key=${r}><${UI.Role} ruolo=${r}/> <b>${R.label}</b> · ${R.desc}</li>`;
      })}</ul>
      <p>La categoria si ricava dall'anno di nascita, come nelle disposizioni FIS ${stagioneLabel(st)} (anno di nascita = ${st} − età di riferimento):</p>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th scope="col">Categoria</th><th scope="col">Nati nel</th><th scope="col">Può gareggiare in</th><th scope="col" class="c">Ruolo</th></tr></thead>
        <tbody>${E.CATEGORIE.map(function (c) {
          return html`<tr key=${c.code}><td>${c.label}</td><td class="num">${anniNascita(c, st)}</td><td class="small">${(c.gare || [c.code]).map(catShort).join(', ')}</td><td class="c"><${UI.Role} ruolo=${c.ruolo}/></td></tr>`;
        })}</tbody>
      </table></div>
      <p class="small muted">In casi particolari (per esempio chi gareggia stabilmente in un'altra categoria) il presidente può assegnare a un atleta un ruolo diverso.</p>
      <h3>Le quotazioni: Qt.I e Qt.A</h3>
      <p>Il prezzo di un atleta segue il suo rendimento atteso, cioè la fantamedia, confrontato con quello di un atleta "di riserva". Così la differenza di prezzo tra due atleti corrisponde alla differenza di punti attesi, e nessuno è sopravvalutato per due gare fortunate.</p>
      <ol>
        <li><b>FM affidabile.</b> Fantamedia della stagione scorsa e di quella in corso insieme, avvicinata a un valore prudente quando le gare sono poche: è come se ogni atleta partisse con ${Qp.k} gare "di riserva" alla FM ${UI.fmt(Vq.fmPrudente, 2)} (il 30° percentile del listone). Con 12 gare conta quasi solo la sua FM, con 2 gare molto meno. Chi non ha risultati parte da qui.</li>
        <li><b>Salto di categoria.</b> Chi quest'anno passa a una fascia più grande (per esempio da Under 14 a Under 20) ha la FM affidabile avvicinata del ${Math.round((1 - Qp.salto) * 100)}% al valore prudente, perché affronta avversari più grandi.</li>
        ${Qp.espPresenza ? html`<li><b>Presenza.</b> La quota di mesi con gare della sua categoria in cui ha gareggiato, con lo stesso principio prudente: gareggiare spesso vale di più, ma grazie alla panchina un'assenza non azzera il valore.</li>` : null}
        <li><b>Prezzo.</b> Il 25% degli atleti con la FM affidabile più bassa costa <b>1 credito</b>; sopra quella soglia il prezzo cresce in proporzione, fino a <b>${Qp.qtMax} crediti</b> per l'atleta migliore. Chi gareggia poco non viene penalizzato una seconda volta: lo è già al punto 1, perché la sua FM conta come meno affidabile.</li>
      </ol>
      <ul>
        <li><b>Qt.I, quotazione iniziale:</b> calcolata così prima dell'asta o della composizione delle rose.</li>
        <li><b>Qt.A, quotazione attuale:</b> lo stesso calcolo ripetuto con i risultati arrivati durante la stagione, quindi sale o scende con le gare. ${mercatoQt}</li>
      </ul>
      ${esempi.length ? html`<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th scope="col">Atleta</th><th scope="col" class="r">Gare (2 stag.)</th><th scope="col" class="r">FM affidabile</th><th scope="col" class="r">Qt.A</th></tr></thead>
        <tbody>${esempi.map(function (r) {
          return html`<tr key=${r.fis}><td>${UI.nomeAtleta(r.a, true)}${r.v.salto ? html`<${React.Fragment}> <span class="tag">sale di categoria</span><//>` : null}</td><td class="r">${r.v.gare}</td><td class="r">${UI.fmt(r.v.fmAffidabile, 2)}</td><td class="r"><b>${r.v.qt}</b></td></tr>`;
        })}</tbody>
      </table></div>` : null}
    </div>`;
  }

  // ------------------------------------------------- 3 Modalità di gioco
  function SezAsta() {
    var s = FS.useFS();
    var d = FS.derived();
    var S = d.settings;
    var modo = modoDisp(S);
    var listone = modo === 'listone';
    var K = nCopie(S);
    var quote = !listone && K > 1;
    var nAtl = nAttivi(s.atleti);
    var nSq = d.teamIds.length;
    var rosa = num(S.rosa);
    var T = num(S.titolari, 5);
    var offMin = num(S.offertaMinima, 1);
    var maxInizio = E.offertaMassima({ crediti: num(S.crediti), rosa: [] }, S);
    var liberi = Math.min(3, rosa);
    var finta = [];
    for (var i = 0; i < rosa - liberi; i++) finta.push({ id: 'x' + i });
    var maxEsempio = E.offertaMassima({ crediti: 40, rosa: finta }, S);
    var vincoli = Object.keys(S.ruoliRosa || {}).filter(function (k) { return E.RUOLI[k] && Array.isArray(S.ruoliRosa[k]); });
    var prezzoCopie = S.prezzoSvincolati === 'uno' ? 'al prezzo fisso di 1 credito' : 'alla Qt.A dell\'atleta';
    // listone: quanto costerebbero i più quotati (il budget consigliato è il 75% di questa cifra)
    var qts = FS.qtAttivi();
    var sogni = E.costoSquadraSogni(qts, rosa, T);
    var budgetCons = E.budgetListoneConsigliato(qts, rosa, T);
    var g1 = d.giornate.filter(function (g) { return g.n >= (num(S.giornataIniziale, 1) || 1); })[0] || null;
    // conti delle copie: copie che possono davvero finire in rosa contro posti in rosa da riempire.
    // Una squadra non può avere due copie dello stesso atleta, quindi oltre nSq copie non servono.
    var kEff = nSq >= 2 ? Math.min(K, nSq) : K;
    var totCopie = nAtl * kEff, posti = nSq * rosa, avanzo = totCopie - posti;
    var minCopie = nAtl ? Math.ceil(posti / nAtl) : 0;
    var conti = !quote || !nAtl || nSq < 2 || rosa <= 0 ? null
      : avanzo < 0 ? 'Con ' + nAtl + ' atleti attivi e ' + nSq + ' squadre ci sono ' + totCopie + (K > nSq ? ' copie utili' : ' copie') + ' per ' + posti + ' posti in rosa: non bastano per completare tutte le rose. '
        + (minCopie <= nSq ? 'Ne servono almeno ' + minCopie + ' per atleta.' : 'Servono più atleti nel listone o rose più corte.')
      : K >= nSq ? 'Con ' + nSq + ' squadre e ' + copie(K) + ' per atleta, le copie bastano per tutti: ogni squadra può prendere qualunque atleta, ma una volta sola.'
      : 'Con ' + nAtl + ' atleti attivi e ' + nSq + ' squadre ci sono ' + totCopie + ' copie per ' + posti + ' posti in rosa: '
        + (avanzo === 0 ? 'a rose complete non resta nessuna copia libera per il mercato.' : 'a rose complete ' + (avanzo === 1 ? 'resta 1 copia libera' : 'restano ' + copie(avanzo) + ' libere') + ' per il mercato.');
    return html`<div>
      <p>Ogni squadra parte con <b>${cr(S.crediti)}</b>${listone ? ', uguali per tutti,' : ''} e deve comporre una rosa di <b>${S.rosa} atleti</b>: ${S.titolari} titolari più ${Math.max(0, rosa - T)} in panchina.${vincoli.length ? null : ' Non ci sono vincoli di ruolo nella rosa.'}</p>
      ${vincoli.length ? html`<p>Vincoli di ruolo nella rosa: ${vincoli.map(function (k) { return E.RUOLI[k].label + ' da ' + S.ruoliRosa[k][0] + ' a ' + S.ruoliRosa[k][1]; }).join('; ')}.</p>` : null}
      <h3>Le due modalità</h3>
      <p>Il presidente sceglie la modalità quando crea la lega e può cambiarla finché nessuna squadra ha preso atleti.</p>
      <ul>
        <li><b>Asta a copie</b>${!listone ? html`<${React.Fragment}> <span class="tag green">in vigore</span><//>` : null}: asta dal vivo, a chiamata e rilanci. Ogni atleta esiste in un numero fisso di copie${!listone ? ' (in questa lega ' + copie(K) + ')' : ''}: può stare in al massimo tante squadre quante sono le copie, mai due volte nella stessa. Con una copia sola è l'asta classica.</li>
        <li><b>Listone a budget fisso</b>${listone ? html`<${React.Fragment}> <span class="tag green">in vigore</span><//>` : null}: niente asta. Tutte le squadre hanno lo stesso budget e comprano dal listone alla quotazione attuale (Qt.A), che si aggiorna con i risultati. Lo stesso atleta può stare in un numero qualunque di squadre, ma una volta sola per squadra.</li>
      </ul>
      ${listone ? html`<div class="reg-box">
        <div class="eyebrow">In questa lega</div>
        <h3>Il listone a budget fisso</h3>
        <p>Ogni squadra ha <b>${cr(S.crediti)}</b> e compra i suoi ${S.rosa} atleti dal listone, alla <b>quotazione attuale (Qt.A)</b>. Non ci sono aste né rilanci: lo stesso atleta può stare in tutte le squadre che lo vogliono, e ognuna prende il suo fantavoto intero.</p>
        ${sogni.totale ? html`<p>${num(S.crediti) < sogni.totale
          ? html`<${React.Fragment}>Il budget non basta per prendere tutti i migliori: oggi i ${T} più quotati costano <b>${cr(sogni.titolari)}</b>, ${cr(sogni.totale)} con la panchina al prezzo minimo. Bisogna scegliere: un campione con tanti gregari, oppure una squadra equilibrata. I prezzi seguono i punti attesi (sezione 2), quindi le due strade si equivalgono: vince chi spende meglio.<//>`
          : html`Con questo budget si possono prendere i ${T} più quotati (${cr(sogni.totale)} con la panchina al prezzo minimo): è probabile che molte squadre abbiano gli stessi titolari.`}</p>` : null}
        <ul>
          <li><b>Composizione delle rose.</b> Prima del campionato ognuno compra quando vuole, anche a mercato chiuso, dalla pagina Listone o dal Mercato. Chi toglie un atleta riavrà tutti i crediti spesi e può ricomprarlo quando vuole.</li>
          <li><b>Fine della composizione.</b> Il presidente avvia il campionato quando le rose sono pronte; se non lo fa, la composizione si chiude da sola alla scadenza delle formazioni della ${g1 ? 'G' + g1.n + ' (' + UI.dataOra(d.scadenza(g1)) + ')' : 'prima giornata valida'}.</li>
          <li><b>Dopo l'inizio</b> si compra e si svincola solo nelle sessioni di mercato aperte dal presidente, con il rimborso della sezione 9. Non ci sono scambi: ogni squadra può comprare qualunque atleta.</li>
          <li><b>Spesa massima.</b> Devi sempre poter completare la rosa: puoi spendere al massimo i tuoi crediti meno ${UI.fmt(offMin)} per ogni posto che resterà ancora libero. All'inizio è di ${cr(maxInizio)}.</li>
        </ul>
        <p class="small muted">Il budget consigliato è il 75% di quanto costerebbe la squadra dei sogni, arrotondato a 5: oggi ${cr(budgetCons)}. In una simulazione della stagione 2025-26 con più crediti quasi tutte le squadre finivano per avere gli stessi titolari; con questa cifra il campione più caro non è né un obbligo né un errore.</p>
      </div>` : null}
      ${quote ? html`<div class="reg-box">
        <div class="eyebrow">In questa lega</div>
        <h3>L'asta a copie, come le figurine</h3>
        <p>Il listone della San Paolo è corto, ${nAtl ? nAtl + ' atleti attivi' : 'una trentina di atleti'}, mentre le squadre possono essere tante${nSq ? ' (oggi ' + nSq + ')' : ''}. Se ogni atleta potesse stare in una sola rosa, gli atleti non basterebbero per riempire tutte le rose e i più forti andrebbero a poche squadre. Per questo ogni atleta è come una figurina: ne esistono più copie, ognuna può finire in un album diverso, ma nessun album la può avere due volte.</p>
        <ul>
          <li><b>Fino a ${copie(K)} per atleta</b>, a ${K} squadre diverse. Ogni copia si compra a parte, all'asta o al mercato, e ha il suo prezzo.</li>
          <li><b>I punti non si dividono.</b> Ogni squadra che schiera l'atleta prende il suo fantavoto intero, come se l'avesse solo lei.</li>
          <li><b>Mai due copie nella stessa squadra.</b> Se un atleta è già tuo non puoi chiamarlo, rilanciare su di lui né comprarlo al mercato.</li>
          <li><b>Lo stesso atleta torna all'asta</b> finché ha copie libere: dopo che una copia è stata aggiudicata, un'altra squadra può chiamarlo di nuovo. Quando le copie sono finite non si può più chiamare.</li>
          <li><b>Al mercato</b> si comprano le copie rimaste, ${prezzoCopie}.</li>
        </ul>
        ${conti ? html`<p class="small muted">${conti}</p>` : null}
      </div>` : null}
      ${!listone ? html`<div>
        <h3>Come funziona l'asta</h3>
        <ol>
          <li>Il presidente fissa l'<b>ordine di chiamata</b> (per esempio a sorteggio) e apre l'asta.</li>
          <li>A turno, ogni squadra <b>chiama</b> ${quote ? 'un atleta che ha ancora copie libere, purché non sia già suo,' : 'un atleta libero'} e fa la prima offerta, di almeno <b>${cr(offMin)}</b>.</li>
          <li>Tutti possono <b>rilanciare</b> con un'offerta più alta, tranne le squadre con la rosa già completa${quote ? ' e quelle che hanno già quell\'atleta' : ''}. A ogni rilancio il <b>timer</b> riparte da <b>${S.timerAsta} secondi</b>. Non puoi rilanciare sulla tua stessa offerta.</li>
          ${quote ? html`<li>Allo scadere del timer <b>una copia</b> dell'atleta è <b>aggiudicata</b> al miglior offerente, che paga in crediti la sua offerta. Se restano copie libere, l'atleta potrà essere chiamato di nuovo in un turno successivo.</li>`
            : html`<li>Allo scadere del timer l'atleta è <b>aggiudicato</b> al miglior offerente, che paga in crediti la sua offerta.</li>`}
          <li>Il turno passa alla squadra successiva; chi ha già la rosa completa viene saltato. L'asta finisce quando tutte le rose sono complete o quando il presidente la chiude, e con la chiusura inizia il campionato.</li>
        </ol>
        <p><b>Offerta massima.</b> Non puoi spendere i crediti che ti servono per completare la rosa: l'offerta massima è <b>crediti residui − (posti liberi − 1) × ${UI.fmt(offMin)}</b>${offMin === 1 ? ', cioè crediti − posti mancanti + 1' : ''}. A inizio asta è di ${cr(maxInizio)}; con 40 crediti e ${liberi} posti liberi è di ${cr(maxEsempio)}.${vincoli.length ? ' Se un ruolo ha già il massimo di atleti, o servono posti per i minimi degli altri ruoli, l\'offerta massima scende a zero.' : ''}</p>
        <p>Il presidente può mettere l'asta in pausa, annullare un lotto in caso di errore e saltare il turno di chi non è collegato.</p>
        <h3>Chi prende i campioni vince?</h3>
        <p>Non in automatico. Hai ${cr(S.crediti)} per ${S.rosa} atleti: quello che spendi per i più forti ti manca per il resto della rosa, e in ogni giornata contano tutti i ${S.titolari} titolari, più la panchina quando qualcuno non gareggia. Pagare tanto un campione conviene solo se i punti in più che porta valgono i crediti che togli agli altri posti.</p>
        <p>Un dato, a titolo di informazione: in una simulazione della stagione 2025-26 con 120 crediti a squadra, le squadre che avevano uno dei due atleti più forti sono arrivate in media esattamente a metà classifica, e quelle che li avevano tutti e due sono finite più in basso, perché per prenderli avevano speso troppo. Non è una garanzia: ogni asta e ogni stagione fanno storia a sé.</p>
        ${quote ? html`<p>Con le copie, poi, un campione non è di una squadra sola: chi perde un'asta può riprovarci con la copia successiva, finché ce ne sono. E siccome i punti non si dividono, se un atleta è in ${kEff} squadre i suoi punti non fanno differenza tra quelle ${kEff}.</p>` : null}
        <h3>Asta dal vivo</h3>
        <p>Se preferite fare l'asta di persona, in sala o a cena, il presidente inserisce a mano ogni aggiudicazione (atleta, squadra e prezzo). Il prezzo non può superare i crediti residui della squadra e nessuna rosa può superare ${S.rosa} atleti.${quote ? ' Con le copie ogni aggiudicazione è una copia: di ogni atleta si assegnano al massimo ' + copie(K) + ' e nessuna squadra può averlo due volte.' : ''} Anche dal vivo vale la regola dell'offerta massima, così ogni squadra riesce a completare la rosa: se un prezzo la supera, l'app lo segnala al presidente.</p>
      </div>` : null}
    </div>`;
  }

  // ------------------------------------------------ 4 Calendario e giornate
  function SezCalendario() {
    var s = FS.useFS();
    var d = FS.derived();
    var S = d.settings;
    var iniz = num(S.giornataIniziale, 1) || 1;
    var righe = useMemo(function () {
      return d.giornate.map(function (g) {
        return {
          g: g, nGare: E.gareDellaGiornata(g, s.gare).length, amichevole: g.n < iniz,
          ufficiale: !!(s.esiti[g.n] && s.esiti[g.n].ufficiale), inCorso: !!(d.inCorso && d.inCorso.n === g.n),
        };
      });
    }, [s.version]);
    var amichevoli = righe.filter(function (r) { return r.amichevole; });
    var testoIniz = iniz <= 1
      ? 'Il campionato conta dalla prima giornata. Se il presidente sposta l\'inizio, le giornate precedenti diventano amichevoli: si gioca per prova, ma non contano per la classifica.'
      : 'Le giornate prima della G' + iniz + (amichevoli.length ? ' (' + amichevoli.map(function (r) { return 'G' + r.g.n; }).join(', ') + ')' : '') + ' sono amichevoli: si gioca per prova, ma non contano per la classifica.';
    return html`<div>
      <p>La stagione ${stagioneLabel(d.stagione)} è divisa in <b>giornate</b>. Ogni giornata è una <b>finestra di date</b>, di solito circa un mese, e contano tutte le gare di spada pubblicate su 4Fence, e importate dal presidente, che cadono nella finestra: regionali, interregionali, nazionali e campionati, di ogni categoria. Il presidente può escludere una gara che per qualche motivo non deve contare.</p>
      <ul>
        <li><b>Scadenza della formazione.</b> La formazione si chiude alla scadenza della giornata indicata in calendario; se il presidente non ne ha fissata una, alle 00:00 del primo giorno della finestra. Dopo la scadenza non si può più cambiare.</li>
        <li><b>Due gare nella stessa giornata.</b> Se un atleta gareggia due volte nella stessa finestra, conta solo la <b>prima gara in ordine di data</b>. Se le due gare sono nello stesso giorno, conta quella della sua categoria.</li>
        <li><b>Giornata iniziale: G${iniz}.</b> ${testoIniz}</li>
      </ul>
      <h3>Il calendario</h3>
      ${righe.length ? html`<div><div class="tbl-wrap"><table class="tbl">
        <thead><tr><th scope="col">Giornata</th><th scope="col">Date</th><th scope="col">Formazione entro</th><th scope="col" class="r">Gare</th></tr></thead>
        <tbody>${righe.map(function (r) {
          var g = r.g;
          return html`<tr key=${g.n}>
            <td><b>G${g.n}</b> ${nomeBreve(g)}${r.amichevole ? html`<${React.Fragment}> <span class="tag">amichevole</span><//>` : null}${r.inCorso ? html`<${React.Fragment}> <span class="tag gold">in corso</span><//>` : null}${r.ufficiale ? html`<${React.Fragment}> <span class="tag green">ufficiale</span><//>` : null}</td>
            <td class="small">${UI.finestra(g)}</td>
            <td class="small">${UI.dataOra(d.scadenza(g))}</td>
            <td class="r">${r.nGare}</td>
          </tr>`;
        })}</tbody>
      </table></div>
      <p class="small muted">«Gare» indica quante gare della finestra sono già state importate da 4Fence.</p></div>` : html`<p class="muted">Il presidente non ha ancora inserito il calendario delle giornate.</p>`}
    </div>`;
  }

  // ------------------------------------------------------- 5 Formazione
  function SezFormazione() {
    var s = FS.useFS();
    var d = FS.derived();
    var S = d.settings;
    var panca = Math.max(0, num(S.rosa) - num(S.titolari));
    return html`<div>
      <p>Per ogni giornata schieri <b>${S.titolari} titolari</b>. Gli altri ${panca} atleti della rosa vanno in <b>panchina, in ordine</b>: il primo della panchina è il primo a entrare se un titolare non gareggia (sezione 7).</p>
      <p>Puoi cambiare la formazione quante volte vuoi fino alla scadenza: vale l'ultima salvata.</p>
      <h3>Moduli</h3>
      <p>Il modulo conta i titolari per ruolo, nell'ordine U14-U20-SEN: per esempio 3-1-1 vuol dire tre Under 14, un Under 20 e un Senior.</p>
      ${S.moduloLibero ? html`<p><b>Modulo libero:</b> in questa lega puoi schierare i titolari con qualunque combinazione di ruoli.</p>` : html`<div>
        <p>In questa lega sono ammessi solo questi moduli:</p>
        <div class="reg-tags">${(S.moduli || []).map(function (m) { return html`<span class="tag blue" key=${m}>${m}</span>`; })}</div>
      </div>`}
      <h3>Se dimentichi la formazione</h3>
      <p>Se non salvi una formazione per la giornata, vale <b>l'ultima che hai salvato</b> in una giornata precedente, senza gli atleti che nel frattempo hanno lasciato la tua rosa: dopo il mercato controlla sempre che i titolari siano al completo. Se una squadra non ha mai salvato una formazione, in quella giornata non prende punti.</p>
      <p class="small muted">In caso di problemi tecnici il presidente può inserire la formazione per conto di un manager.</p>
    </div>`;
  }

  // -------------------------------------------------------- 6 Punteggio
  function gruppiPunteggio(P) {
    var soglia = num(P.sogliaImpresa);
    return [
      { t: 'Presenza', righe: [
        { k: 'base', nome: 'Voto base', quando: 'L\'atleta scende in pedana in una gara valida per la giornata.' },
        { nome: 'Assente', quando: 'Non gareggia nella giornata: resta senza voto e può entrare un panchinaro (sezione 7).', val: 's.v.' },
      ] },
      { t: 'Girone', righe: [
        { k: 'gironeVittoria', sigla: 'X', nome: 'Assalto vinto', quando: 'Per ogni assalto vinto nel girone.' },
        { k: 'gironeSconfitta', nome: 'Assalto perso', quando: 'Per ogni assalto perso nel girone.' },
        { k: 'indice', sigla: 'Z', alt: ['indiceMax'], nome: 'Indice', quando: 'Per ogni stoccata di differenza tra date e ricevute nel girone, in più o in meno.' + (num(P.indiceMax) > 0 ? ' Il totale di questa voce non supera ±' + UI.fmt(P.indiceMax) + '.' : ' Questa voce non ha un tetto.'), val: num(P.indice) ? '±' + UI.fmt(Math.abs(num(P.indice))) : '0' },
        { k: 'gironePerfetto', nome: 'Girone perfetto', quando: 'Tutti gli assalti del girone vinti, con almeno 4 assalti.' },
        { k: 'gironeZero', nome: 'Girone senza vittorie', quando: 'Nessun assalto vinto nel girone.' },
        { k: 'eliminatoGironi', nome: 'Fuori dopo i gironi', quando: 'Non si qualifica per l\'eliminazione diretta (nelle prove GPG regionali passano tutti).' },
      ] },
      { t: 'Eliminazione diretta', righe: [
        { k: 'direttaVittoria', sigla: 'Y', nome: 'Assalto vinto', quando: 'Per ogni assalto vinto nel tabellone.' },
        { k: 'impresa', alt: ['sogliaImpresa'], nome: 'Impresa', quando: 'Vittoria contro una testa di serie migliore di almeno ' + soglia + ' posizioni (per esempio la n. ' + (12 + soglia) + ' che batte la n. 12).' },
        { k: 'sconfittaBeffa', alt: ['sogliaImpresa'], nome: 'Sconfitta inattesa', quando: 'Sconfitta contro una testa di serie peggiore di almeno ' + soglia + ' posizioni.' },
        { k: 'vittoriaNetta', alt: ['sogliaScarto', 'sogliaScarto10'], nome: 'Vittoria netta', quando: 'Vittoria con almeno ' + UI.fmt(P.sogliaScarto) + ' stoccate di scarto negli assalti a 15, o ' + UI.fmt(P.sogliaScarto10) + ' in quelli a 10.' },
        { k: 'sconfittaNetta', alt: ['sogliaScarto', 'sogliaScarto10'], nome: 'Sconfitta netta', quando: 'Sconfitta con lo stesso scarto.' },
        { k: 'derby', nome: 'Derby San Paolo', quando: 'Vittoria in diretta contro un compagno o una compagna di sala. Chi perde il derby non ha malus.' },
      ] },
      { t: 'Piazzamento finale', nota: 'I bonus di piazzamento non si sommano tra loro: vale solo quello del posto ottenuto. Si aggiungono però ai bonus di girone e di diretta.', righe: [
        { k: 'oro', nome: 'Oro', quando: '1° posto.' },
        { k: 'argento', nome: 'Argento', quando: '2° posto.' },
        { k: 'bronzo', nome: 'Bronzo', quando: '3° posto (nella scherma i bronzi sono due: valgono entrambi).' },
        { k: 'finale8', nome: 'Finale a 8', quando: 'Dal 5° all\'8° posto.' },
        { k: 'top16', nome: 'Tra i primi 16', quando: 'Dal 9° al 16° posto, solo nelle gare con almeno 32 iscritti.' },
      ] },
      { t: 'Cartellini e ritiri', nota: 'I cartellini non sono pubblicati da 4Fence: li inserisce a mano il presidente (sezione 10).', righe: [
        { k: 'cartellinoGiallo', nome: 'Cartellino giallo', quando: 'Per ogni cartellino giallo.' },
        { k: 'cartellinoRosso', nome: 'Cartellino rosso', quando: 'Per ogni cartellino rosso.' },
        { k: 'cartellinoNero', nome: 'Cartellino nero', quando: 'Per ogni cartellino nero.' },
        { k: 'ritirato', nome: 'Ritirato/a', quando: 'Lascia la gara prima della fine.' },
        { k: 'escluso', nome: 'Escluso/a', quando: 'Viene escluso/a dalla gara.' },
      ] },
    ];
  }

  function TabellaVoci(p) {
    var P = p.P;
    return html`<div class="tbl-wrap"><table class="tbl reg-voci">
      <thead><tr><th scope="col">Voce</th><th scope="col">Quando</th><th scope="col" class="r">Valore</th></tr></thead>
      <tbody>${p.righe.map(function (r) {
        var v = r.val !== undefined ? r.val : r.k === 'base' ? UI.fmt(P.base) : num(P[r.k]) ? UI.segno(P[r.k]) : '0';
        var spento = r.k && r.k !== 'base' && !num(P[r.k]);
        var chiavi = r.k ? [r.k].concat(r.alt || []) : [];
        var mod = chiavi.filter(function (k) { return E.DEFAULT_PUNTEGGIO[k] !== undefined && num(P[k]) !== num(E.DEFAULT_PUNTEGGIO[k]); });
        var std = mod.length && mod[0] === r.k ? 'Valore standard: ' + UI.fmt(E.DEFAULT_PUNTEGGIO[r.k]) : 'Soglia modificata dal presidente';
        return html`<tr key=${r.k || r.nome}>
          <td><b>${r.nome}</b>${r.sigla ? html`<${React.Fragment}> <span class="kbd">${r.sigla}</span><//>` : null}</td>
          <td class="small">${r.quando}${spento ? html`<${React.Fragment}> <span class="faint">(non in uso)</span><//>` : null}${mod.length ? html`<${React.Fragment}> <span class="tag gold" title=${std}>regola della lega</span><//>` : null}</td>
          <td class="r"><b>${v}</b></td>
        </tr>`;
      })}</tbody>
    </table></div>`;
  }

  function Esempio(p) {
    return html`<div class="reg-ex">
      <div class="eyebrow">${p.eyebrow}</div>
      <h3>${p.titolo}</h3>
      <p class="small muted">${p.desc}</p>
      <${UI.Voci} voci=${p.res.voci}/>
      <div class="reg-tot"><span>Fantavoto</span><${UI.FV} v=${p.res.fv} base=${p.base}/></div>
      ${p.nota ? html`<p class="small" style=${{ margin: '8px 0 0' }}>${p.nota}</p>` : null}
    </div>`;
  }

  function SezPunteggio() {
    var s = FS.useFS();
    var d = FS.derived();
    var S = d.settings, P = S.punteggio;
    var es = useMemo(function () {
      return { oro: inItaliano(E.fantavoto(ES_ORO, d.settings.punteggio)), salita: inItaliano(E.fantavoto(ES_SALITA, d.settings.punteggio)) };
    }, [s.version]);
    var coeffGare = useMemo(function () {
      // stessa lettura del motore: coeff mancante o 0 vale 1
      return Object.values(s.gare).filter(function (g) {
        return g && !g.escludi && num(g.coeff || 1, 1) !== 1 && E.stagioneDaData(g.data) === d.stagione;
      }).sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    }, [s.version]);
    var gruppi = gruppiPunteggio(P);
    var modificate = Object.keys(E.DEFAULT_PUNTEGGIO).some(function (k) { return num(P[k]) !== num(E.DEFAULT_PUNTEGGIO[k]); });
    var notaSalita = es.salita.fv !== null && es.salita.fv > num(S.votoUfficio)
      ? 'Capita a tutti. E anche così vale più del voto d\'ufficio (' + UI.fmt(S.votoUfficio) + ') che prenderebbe un posto vuoto.'
      : 'Capita a tutti: si riparte dalla gara successiva.';
    return html`<div>
      <div class="reg-formula">Fantavoto = voto base + bonus − malus</div>
      <p>Ogni atleta che scende in pedana in una gara della giornata parte dal <b>voto base ${UI.fmt(P.base)}</b>. A questo si sommano i bonus e si sottraggono i malus della gara, voce per voce. Le lettere X, Y e Z sono i tre valori principali: assalto vinto nel girone, assalto vinto in diretta, indice.</p>
      ${gruppi.map(function (g) {
        return html`<div key=${g.t}>
          <h3>${g.t}</h3>
          <${TabellaVoci} righe=${g.righe} P=${P}/>
          ${g.nota ? html`<p class="small muted">${g.nota}</p>` : null}
        </div>`;
      })}
      <p class="small muted">${modificate ? 'Le voci segnate «regola della lega» sono state modificate dal presidente rispetto ai valori standard.' : 'In questa lega valgono tutti i valori standard.'}</p>
      <h3>Gare con coefficiente</h3>
      <p>Il presidente può dare un coefficiente a una gara particolarmente importante (per esempio ×1,5 a un campionato italiano): i bonus e i malus di quella gara vengono moltiplicati, il voto base no.${coeffGare.length ? null : ' In questa stagione non ci sono ancora gare con coefficiente.'}</p>
      ${coeffGare.length ? html`<ul>${coeffGare.slice(0, 12).map(function (g) {
        return html`<li key=${g.id}>${UI.nomeGara(g)} <span class="faint">· ${UI.data(g.data)}</span> <span class="tag blue">×${UI.fmt(g.coeff)}</span></li>`;
      })}</ul>` : null}
      <h3>Due esempi, calcolati con le regole di questa lega</h3>
      <${Esempio} eyebrow="Esempio A" titolo="Oro in una gara regionale" base=${P.base} res=${es.oro}
        desc="Gara regionale con 37 iscritti. Girone da 6: cinque vittorie su cinque, 21 stoccate date e 2 ricevute. Testa di serie n. 1, vince cinque assalti di diretta (15–2, 15–2, 10–5, 15–10, 14–11) e la gara."/>
      <${Esempio} eyebrow="Esempio B" titolo="Una giornata in salita" base=${P.base} res=${es.salita} nota=${notaSalita}
        desc="Gara con 60 iscritti. Girone da 7: una vittoria e cinque sconfitte, 14 stoccate date e 27 ricevute. Passa il girone come testa di serie n. 40 e perde il primo assalto di diretta 6–15 contro la n. 9: 45° posto."/>
    </div>`;
  }

  // ------------------------------------------------- 7 Sostituzioni
  function SezSostituzioni() {
    var s = FS.useFS();
    var d = FS.derived();
    var S = d.settings;
    var max = num(S.maxSostituzioni);
    return html`<div>
      <p>Un titolare che non gareggia in nessuna gara della giornata è <b>senza voto (s.v.)</b>. Al suo posto entra il <b>primo atleta della panchina</b>, nell'ordine che hai scelto, che ha gareggiato e non è già entrato${S.sostituzioniStessoRuolo ? ' e ha lo stesso ruolo del titolare' : ', di qualunque ruolo'}.</p>
      <ul>
        <li><b>Massimo ${max} ${max === 1 ? 'sostituzione' : 'sostituzioni'}</b> per giornata.</li>
        <li>Se mancano più titolari, le sostituzioni seguono l'ordine dei titolari in formazione.</li>
        <li>Se nessun panchinaro è disponibile, o le sostituzioni sono finite, il posto vuoto prende il <b>voto d'ufficio: ${UI.fmt(S.votoUfficio)}</b>.</li>
        <li>Chi scende in pedana e poi si ritira o viene escluso non è s.v.: prende il suo fantavoto, con il relativo malus, e non viene sostituito.</li>
      </ul>
      <p class="small muted">Esempio: panchina nell'ordine 1) Anna, 2) Luca. Se un titolare non gareggia e nemmeno Anna ha gareggiato, entra Luca.</p>
    </div>`;
  }

  // ------------------------------------------------------ 9 Classifica
  function SezClassifica() {
    var s = FS.useFS();
    var d = FS.derived();
    var S = d.settings;
    var f1 = S.classifica === 'f1';
    var puntiF1 = Array.isArray(S.puntiF1) ? S.puntiF1 : [];
    return html`<div>
      ${f1 ? html`<div>
        <p>In questa lega la classifica è a <b>punti Formula 1</b>. In ogni giornata le squadre si ordinano per fantapunti e prendono i punti della loro posizione:</p>
        ${puntiF1.length ? html`<div>
          <div class="reg-tags">${puntiF1.map(function (pt, i) { return html`<span class="tag blue" key=${i}>${i + 1}° · ${pt}</span>`; })}</div>
          <p>${dalPosto(puntiF1.length + 1)} posto in giù non si prendono punti. Le squadre a pari fantapunti nella giornata hanno la stessa posizione e gli stessi punti.</p>
        </div>`
          : html`<p class="muted">Il presidente non ha ancora fissato i punti per posizione: per ora nessuna squadra prende punti.</p>`}
      </div>` : html`<div>
        <p>In questa lega la classifica è a <b>punti totali</b>: conta la somma dei fantapunti di tutte le giornate giocate.</p>
        <p class="small muted">In alternativa il presidente può scegliere la classifica a punti Formula 1: in ogni giornata le squadre prendono punti in base alla posizione (al 1° posto ${puntiF1[0] !== undefined ? puntiF1[0] : '–'}, al 2° ${puntiF1[1] !== undefined ? puntiF1[1] : '–'} e così via).</p>
      </div>`}
      <h3>Spareggi</h3>
      <p>A parità di ${f1 ? 'punti' : 'fantapunti'} si guarda, in quest'ordine:</p>
      <ol>
        ${f1 ? html`<li>i fantapunti totali;</li>` : null}
        <li>le <b>giornate vinte</b> (miglior punteggio della giornata; a pari merito la vincono tutte le squadre in testa);</li>
        <li>il <b>miglior punteggio</b> ottenuto in una singola giornata.</li>
      </ol>
      <p>Se la parità resta, le squadre sono a pari merito. Le penalità e i punti extra decisi dal presidente si sommano al punteggio della giornata e contano per tutto, anche per le giornate vinte. Finché il presidente non ufficializza una giornata, i suoi punteggi sono provvisori.</p>
    </div>`;
  }

  // -------------------------------------------------------- 10 Mercato
  function SezMercato() {
    var s = FS.useFS();
    var d = FS.derived();
    var S = d.settings;
    var lega = d.lega || {};
    var modo = modoDisp(S);
    var K = nCopie(S);
    var multi = modo === 'listone', quote = !multi && K > 1;
    var rimb = num(S.rimborsoSvincolo);
    var esRimb = Math.ceil(15 * rimb);
    var prezzo = !multi && S.prezzoSvincolati === 'uno' ? 'un prezzo fisso di 1 credito' : 'la sua quotazione attuale (Qt.A)';
    var acquisti = quote
      ? 'Puoi comprare una copia libera di un atleta che non hai già in rosa, pagando ' + prezzo + '. ' + (K > 1
        ? 'Quando le copie di un atleta sono finite, cioè sono tutte in qualche rosa, l\'atleta non è in vendita finché una squadra non lo svincola.'
        : 'Se l\'atleta è già in un\'altra rosa, non è in vendita finché quella squadra non lo svincola.')
      : multi ? 'Puoi comprare qualunque atleta del listone che non hai già in rosa, anche se è in altre rose, pagando ' + prezzo + '.'
      : 'Puoi prendere uno svincolato, cioè un atleta che non è in nessuna rosa, pagando ' + prezzo + '.';
    var dopoSvincolo = quote ? ' La copia torna libera e un\'altra squadra può comprarla.' : multi ? '' : ' L\'atleta torna tra gli svincolati.';
    var stato = d.composizione ? html`<div class="banner"><span class="lamp v"></span> <span>Le rose sono <b>in composizione</b>: si compra dal listone anche a mercato chiuso.</span></div>`
      : d.mercatoAperto ? html`<div class="banner"><span class="lamp v"></span> <span>Il mercato ora è <b>aperto</b>${lega.sessioneMercato ? ' (sessione n. ' + lega.sessioneMercato + ')' : ''}.</span></div>`
      : lega.mercatoAperto && d.inCorso ? html`<div class="banner warn"><span class="lamp"></span> <span>Il mercato è <b>sospeso</b>: la giornata ${d.inCorso.n} è in corso fino al ${UI.data(d.inCorso.al)}.</span></div>`
      : html`<div class="banner"><span class="lamp s"></span> <span>Il mercato ora è <b>chiuso</b>.</span></div>`;
    return html`<div>
      ${stato}
      <p>Il presidente <b>apre e chiude le sessioni</b> di mercato. Mentre una giornata è in corso, dalla chiusura delle formazioni alla fine della finestra, il mercato resta chiuso in automatico.</p>
      <ul>
        ${multi ? html`<li><b>Composizione delle rose.</b> Prima dell'inizio del campionato le rose si compongono anche a mercato chiuso, e chi toglie un atleta riavrà tutti i crediti spesi (sezione 3). Le regole qui sotto valgono dall'inizio del campionato.</li>` : null}
        <li><b>Acquisti.</b> ${acquisti} Servono un posto libero in rosa e crediti sufficienti: vale la stessa ${multi ? 'spesa massima della composizione delle rose' : 'offerta massima dell\'asta'}.${multi ? '' : ' Un atleta che in quel momento è all\'asta non si può comprare.'}</li>
        ${rimb > 0 ? html`<li><b>Svincoli.</b> Liberi un atleta della tua rosa e ti viene restituito ${artPct(rimb)}<b>${pct(rimb)}</b> del prezzo pagato, arrotondato per eccesso: per un atleta pagato 15 crediti ne ricevi ${esRimb}. Per un atleta arrivato con uno scambio vale il prezzo pagato all'origine.${dopoSvincolo}</li>`
          : html`<li><b>Svincoli.</b> Puoi liberare un atleta della tua rosa, ma in questa lega non c'è rimborso: i crediti spesi non tornano.${dopoSvincolo}</li>`}
        <li><b>Niente riacquisti.</b> Un atleta che hai svincolato non puoi ricomprarlo nella stessa sessione di mercato.</li>
        ${multi ? html`<li><b>Scambi.</b> Nel listone a budget fisso non ci sono scambi: ogni squadra può comprare qualunque atleta, e un conguaglio in crediti cambierebbe un budget che deve restare uguale per tutti.</li>`
          : html`<li><b>Scambi.</b> Puoi proporre a un'altra squadra uno scambio di uno o più atleti, con un eventuale conguaglio in crediti in una delle due direzioni. Lo scambio si chiude quando l'altra squadra accetta, a mercato aperto. Nessuna rosa può superare ${S.rosa} atleti e nessuna squadra può andare sotto zero crediti.${quote ? ' Non puoi ricevere un atleta che hai già in rosa.' : ''}</li>`}
      </ul>
    </div>`;
  }

  // --------------------------------------------- 11 Risultati e ricorsi
  function SezRicorsi() {
    var s = FS.useFS();
    var d = FS.derived();
    var rett = useMemo(function () {
      return s.rettifiche.slice().sort(function (a, b) { return num(a.n) - num(b.n) || num(a.at) - num(b.at); });
    }, [s.version]);
    return html`<div>
      <ul>
        <li><b>Fonte.</b> I risultati sono quelli ufficiali pubblicati su <b>4Fence</b>: gironi, tabellone e classifica finale. Il presidente importa le gare e i punteggi compaiono subito, come provvisori.</li>
        <li><b>Ufficializzazione.</b> A giornata finita il presidente controlla i risultati e la ufficializza: da quel momento i punteggi della giornata sono definitivi.</li>
        <li><b>Cartellini.</b> 4Fence non li pubblica, quindi il presidente li inserisce a mano, solo quando ne ha notizia certa.</li>
        <li><b>Correzioni.</b> Il presidente può correggere un risultato importato male, escludere una gara che non deve contare o darle un coefficiente.</li>
        <li><b>Segnalazioni.</b> Chi nota un errore lo segnala in bacheca o al presidente <b>entro 48 ore dall'ufficializzazione</b>. Se la segnalazione è fondata, il presidente riapre la giornata, corregge e la ufficializza di nuovo. Passate le 48 ore il risultato resta com'è.</li>
        <li><b>Penalità e punti extra.</b> Il presidente può togliere o aggiungere punti a una squadra in una giornata, sempre con una motivazione visibile a tutti (per esempio dopo un problema tecnico che ha impedito di salvare la formazione).</li>
      </ul>
      ${rett.length ? html`<div>
        <h3>Penalità e punti extra assegnati</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th scope="col">Giornata</th><th scope="col">Squadra</th><th scope="col">Motivo</th><th scope="col" class="r">Punti</th></tr></thead>
          <tbody>${rett.map(function (r) {
            return html`<tr key=${r.id}><td>G${r.n}</td><td>${FS.nomeSquadra(r.teamId)}</td><td class="small">${r.nota || '—'}</td><td class="r"><b>${UI.segno(r.punti)}</b></td></tr>`;
          })}</tbody>
        </table></div>
      </div>` : html`<p class="small muted">${d.giocate.length ? 'Finora non ci sono penalità né punti extra.' : 'Le eventuali penalità e i punti extra compariranno qui.'}</p>`}
    </div>`;
  }

  // ------------------------------------------------------- 12 Fair play
  function SezFairPlay() {
    return html`<div>
      <p>Gli atleti del listone sono <b>ragazzi e ragazze, molti sotto i 14 anni</b>, e sono nostri compagni di sala. Per questo:</p>
      <ul>
        <li><b>Il gioco non si porta in pedana.</b> Niente pressioni, richieste o «consigli» agli atleti per far punti: in gara pensano alla loro scherma, e basta.</li>
        <li><b>Nessun commento negativo sugli atleti</b>, né in bacheca né di persona. Si scherza sulle squadre e sulle scelte dei manager, mai sugli atleti. Un fantavoto basso è solo un numero del gioco.</li>
        <li><b>Nessuna scommessa in denaro.</b> I premi sono simbolici: una coppa, una medaglia, il nome dei vincitori in bacheca.</li>
        <li>Se sei anche un atleta del listone, gioca tranquillo: in pedana dai sempre il massimo, qualunque squadra ti abbia scelto.</li>
      </ul>
      <p>Il presidente può cancellare i messaggi fuori luogo e, nei casi gravi, escludere una squadra dalla lega.</p>
    </div>`;
  }

  var CORPO = {
    lega: SezLega, atleti: SezAtleti, asta: SezAsta, calendario: SezCalendario, formazione: SezFormazione,
    punteggio: SezPunteggio, sostituzioni: SezSostituzioni, classifica: SezClassifica,
    mercato: SezMercato, ricorsi: SezRicorsi, fairplay: SezFairPlay,
  };

  // ------------------------------------------------------------ vista
  V.Regolamento = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var lega = d.lega || {};
    return html`<div class="stack">
      <div class="crumbs"><span class="c">${lega.nome || 'Lega'}</span><span class="faint">›</span><span class="c on">Regolamento</span></div>
      <div class="reg-layout">
        <${Indice}/>
        <article class="card rules reg-doc" aria-labelledby="reg-titolo">
          <header class="reg-head">
            <div class="eyebrow">Regolamento ufficiale · stagione ${stagioneLabel(d.stagione)}</div>
            <h1 class="reg-title" id="reg-titolo">${lega.nome || 'Fantascherma'}</h1>
            <p class="muted" style=${{ margin: '0 0 10px' }}>Questo regolamento è generato dalle impostazioni della lega: i numeri che leggi sono quelli che usa il calcolo dei punteggi.</p>
            ${d.isAdmin && s.canWrite && p.go ? html`<button type="button" class="btn ghost sm" onClick=${function () { p.go('presidenza'); }}>Modifica le regole</button>` : null}
          </header>
          ${SEZIONI.map(function (x, i) {
            var C = CORPO[x.id];
            return html`<${Sezione} key=${x.id} id=${x.id} n=${i + 1} titolo=${x.t}><${C}/><//>`;
          })}
        </article>
      </div>
      <${IndiceMobile}/>
    </div>`;
  };
})(window);
