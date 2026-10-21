/* Vista Mercato: svincolati, la mia rosa (svincoli), scambi tra squadre e registro dei movimenti. */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useMemo = React.useMemo, useEffect = React.useEffect, useRef = React.useRef;

  var TAB_KEY = 'fs:mercato:tab';
  var PAGINA = 40;
  var PAGINA_MOV = 60;
  var TABS = [['svincolati', 'Svincolati'], ['rosa', 'La mia rosa'], ['scambi', 'Scambi'], ['movimenti', 'Movimenti']];
  var TIPI = {
    asta: { label: 'Asta', cls: 'blue' },
    acquisto: { label: 'Acquisto', cls: 'green' },
    manuale: { label: 'Manuale', cls: 'gold' },
    svincolo: { label: 'Svincolo', cls: 'red' },
    scambio: { label: 'Scambio', cls: 'blue' },
    crediti: { label: 'Crediti', cls: 'gold' },
  };
  var ARRIVO = { asta: 'all\'asta', acquisto: 'dal mercato', manuale: 'assegnato dal presidente', scambio: 'con uno scambio' };
  var ORD_RUOLO = { U14: 0, U20: 1, SEN: 2 };

  // ------------------------------------------------------------- utilità
  function norm(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  /** Listone a budget fisso: niente asta, stesso atleta in più squadre. */
  function multipla(d) { return d.modalita === 'listone'; }
  /** Asta a copie: ogni atleta ha più copie, al massimo una per squadra. */
  function quote(d) { return d.settings.disponibilita === 'quote'; }
  /** Copie totali di ogni atleta con l'asta a copie (stesso calcolo di E.copieLibere). */
  function copieTot(d) { return E.copiePerAtleta(d.settings); }
  function txtCopie(n, k) { return (n === 1 ? '1 copia libera' : n + ' copie libere') + ' su ' + k + (n === 1 ? ': è l\'ultima' : ''); }
  /** Acquisti e svincoli consentiti (stessa regola di FS.act.acquistaSvincolato / svincola): mercato aperto o composizione delle rose. */
  function puoOperare(d) { return d.puoComprare; }
  function sessione(d) { return (d.lega && d.lega.sessioneMercato) || 0; }
  function possiede(team, fis, d) { return (d.proprietari[fis] || []).indexOf(team) >= 0; }
  /** Svincolato da me in questa sessione (non si può ricomprare); durante la composizione delle rose non vale. */
  function svincolatoOra(fis, d) {
    if (d.composizione) return false;
    var sess = sessione(d);
    return !!(d.miaRosa && d.miaRosa.svincolati.some(function (x) { return x.id === fis && !x.pieno && (x.sessione || 0) === sess; }));
  }
  function atletaDi(fis, s) { return s.atleti[fis] || { fis: fis, cognome: String(fis), nome: '' }; }
  function nomeA(fis, s) { return UI.nomeAtleta(atletaDi(fis, s)); }
  function qtDi(fis, s, d) {
    var st = d.statsAtleti[fis];
    var a = s.atleti[fis];
    var qi = st ? st.qtI : Math.max(1, Number(a && a.quotazione) || 1);
    return { qtI: qi, qtA: st ? st.qtA : qi };
  }
  /** Prezzo d'acquisto (come in FS.act.acquistaSvincolato). */
  function prezzoDi(fis) { return FS.prezzoAcquisto(fis); }
  /** Fantamedia della stagione o, se non ha ancora gareggiato, quella storica. */
  function fmDi(st) {
    if (!st) return null;
    if (st.stagione && st.stagione.presenze) return st.stagione.fm;
    if (st.tutto && st.tutto.presenze) return st.tutto.fm;
    return null;
  }
  function fmTxt(fm) { return fm === null || fm === undefined ? '–' : UI.fmt(fm, 2); }
  function nCr(n) { return n + (Math.abs(Number(n)) === 1 ? ' credito' : ' crediti'); }
  /** Rimborso allo svincolo (pieno durante la composizione delle rose del listone). */
  function rimborsoDi(prezzo) { return FS.rimborsoSvincolo(prezzo); }
  function pct(x) { return Math.round(Number(x || 0) * 100) + '%'; }
  function dataMs(ms) {
    if (!ms) return '';
    var t = new Date(ms);
    return UI.data(t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'));
  }
  function nomeT(t, uid) { return t === uid ? 'La tua squadra' : FS.nomeSquadra(t); }
  /** Desinenza per il sesso dell'atleta («riprenderlo» / «riprenderla»). */
  function eF(a, m, f) { return a && a.sesso === 'F' ? f : m; }

  /** Conferma in-pagina: [nodo da rendere, ask({title, body, yes, danger, run})]. */
  function useConfirm() {
    var st = useState(null);
    var c = st[0], setC = st[1];
    var node = c ? html`<${UI.Confirm} title=${c.title} yes=${c.yes} danger=${c.danger}
      onNo=${function () { setC(null); }}
      onYes=${function () { var run = c.run; setC(null); Promise.resolve().then(function () { return run(); }).catch(function () { }); }}>${c.body}<//>` : null;
    return [node, function (o) { setC(o); }];
  }

  /** Fattibilità di uno scambio: rose, crediti, possesso degli atleti, vincoli di ruolo. */
  function verifica(s, d, da, a, daA, daB, crediti) {
    var errori = [], avvisi = [];
    var A = d.rose[da], B = d.rose[a];
    if (!A || !B) return { errori: ['Una delle due squadre non esiste più.'], avvisi: avvisi, vuoto: false };
    var R = d.settings.rosa;
    // con l'asta a quote (o la disponibilità multipla) chi riceve non deve avere già l'atleta
    var doppio = '. Nessuna squadra può avere due volte lo stesso atleta.';
    daA.forEach(function (id) {
      if (!possiede(da, id, d)) errori.push(nomeA(id, s) + ' non è più nella rosa di ' + nomeT(da, s.uid) + '.');
      else if (possiede(a, id, d)) errori.push(nomeT(a, s.uid) + ' ha già ' + nomeA(id, s) + ' in rosa' + doppio);
    });
    daB.forEach(function (id) {
      if (!possiede(a, id, d)) errori.push(nomeA(id, s) + ' non è più nella rosa di ' + nomeT(a, s.uid) + '.');
      else if (possiede(da, id, d)) errori.push(nomeT(da, s.uid) + ' ha già ' + nomeA(id, s) + ' in rosa' + doppio);
    });
    var nA = A.rosa.length - daA.length + daB.length;
    var nB = B.rosa.length - daB.length + daA.length;
    var cA = A.crediti - crediti, cB = B.crediti + crediti;
    if (nA > R) errori.push(nomeT(da, s.uid) + ' avrebbe ' + nA + ' atleti in rosa (massimo ' + R + ').');
    if (nB > R) errori.push(nomeT(a, s.uid) + ' avrebbe ' + nB + ' atleti in rosa (massimo ' + R + ').');
    if (cA < 0) errori.push(nomeT(da, s.uid) + ' non ha crediti sufficienti per il conguaglio (ne ha ' + A.crediti + ').');
    if (cB < 0) errori.push(nomeT(a, s.uid) + ' non ha crediti sufficienti per il conguaglio (ne ha ' + B.crediti + ').');
    if (nA < A.rosa.length) avvisi.push(nomeT(da, s.uid) + ' scenderebbe a ' + nA + ' atleti su ' + R + ': potrà completare la rosa al mercato.');
    if (nB < B.rosa.length) avvisi.push(nomeT(a, s.uid) + ' scenderebbe a ' + nB + ' atleti su ' + R + ': potrà completare la rosa al mercato.');
    var lim = d.settings.ruoliRosa || {};
    if (Object.keys(lim).length) {
      [[da, A, daA, daB], [a, B, daB, daA]].forEach(function (x) {
        var ids = x[1].rosa.map(function (r) { return r.id; }).filter(function (id) { return x[2].indexOf(id) < 0; }).concat(x[3]);
        var c = E.contaRuoli(ids, s.atleti, d.stagione);
        Object.keys(lim).forEach(function (r) {
          var l = lim[r];
          if (!l) return;
          if (c[r] > l[1]) avvisi.push(nomeT(x[0], s.uid) + ' supererebbe il massimo di ' + l[1] + ' atleti ' + r + '.');
          else if (c[r] < l[0]) avvisi.push(nomeT(x[0], s.uid) + ' scenderebbe sotto il minimo di ' + l[0] + ' atleti ' + r + '.');
        });
      });
    }
    return { errori: errori, avvisi: avvisi, vuoto: !daA.length && !daB.length, nA: nA, nB: nB, cA: cA, cB: cB };
  }

  // ------------------------------------------------------- stato mercato
  function StatoMercato() {
    var s = FS.useFS();
    var d = FS.derived();
    var phone = UI.useMq(UI.PHONE);
    var multi = multipla(d);
    var Q = quote(d), K = copieTot(d);
    var uno = !multi && d.settings.prezzoSvincolati === 'uno';
    var sess = sessione(d);
    var sospeso = !!(d.lega.mercatoAperto && d.inCorso);
    var label, testo, cls = '', lamp = '';
    if (d.composizione) {
      // listone prima del campionato: le rose si compongono anche a mercato chiuso (stessa regola dello store)
      label = 'Composizione delle rose'; lamp = 'v';
      var manca = d.settings.rosa - (d.miaRosa ? d.miaRosa.rosa.length : 0);
      testo = 'Hai ' + nCr(d.miaRosa ? d.miaRosa.crediti : d.settings.crediti) + ' su ' + d.settings.crediti + ' (budget uguale per tutti). '
        + (manca > 0 ? (manca === 1 ? 'Ti manca 1 atleta' : 'Ti mancano ' + manca + ' atleti') + ', da comprare al prezzo del listone (Qt.A).' : 'La tua rosa è completa.')
        + ' Se togli un atleta riavrai tutti i crediti spesi, finché il presidente non avvia il campionato'
        + (d.prossima ? ' (al più tardi alla scadenza della ' + (d.prossima.nome || 'giornata ' + d.prossima.n) + ', ' + UI.dataOra(d.scadenza(d.prossima)) + ').' : '.');
    } else if (d.mercatoAperto) {
      label = 'Mercato aperto'; lamp = 'v';
      testo = multi
        ? 'Puoi comprare gli atleti del listone che non hai già, alla quotazione (Qt.A), e svincolare con rimborso del ' + pct(d.settings.rimborsoSvincolo) + ' del prezzo pagato. Quando una giornata è in corso (dalla chiusura delle formazioni alla fine della giornata) il mercato si sospende da solo.'
        : 'Puoi acquistare ' + (Q ? 'le copie libere degli atleti' : 'svincolati') + (uno ? ' a 1 credito' : ' a quotazione (Qt.A)') + ', svincolare con rimborso del ' + pct(d.settings.rimborsoSvincolo) + ' del prezzo pagato e proporre scambi alle altre squadre. Quando una giornata è in corso (dalla chiusura delle formazioni alla fine della giornata) il mercato si sospende da solo.';
    } else if (d.composizioneChiusa && !sospeso) {
      label = 'Rose chiuse'; cls = 'warn'; lamp = 's';
      testo = 'La composizione delle rose si è chiusa alla scadenza della prima giornata valida: da ora si compra e si svincola nelle sessioni di mercato aperte dal presidente.';
    } else if (sospeso) {
      label = 'Mercato sospeso'; cls = 'warn'; lamp = 's';
      testo = 'È in corso ' + (d.inCorso.nome || 'la giornata ' + d.inCorso.n) + ' (' + UI.finestra(d.inCorso) + '): il mercato si chiude da solo durante la giornata e riapre quando finisce.';
    } else {
      label = 'Mercato chiuso'; cls = 'warn'; lamp = 's';
      testo = 'Lo apre il presidente tra una giornata e l\'altra. Intanto puoi studiare ' + (multi ? 'gli atleti del listone' : Q ? 'le copie disponibili' : 'gli svincolati') + ' e il registro dei movimenti.';
    }
    var spieg = html`<span><${UI.ModalitaTag} settings=${d.settings}/> ${multi
      ? 'Lo stesso atleta può stare in più squadre: non c\'è asta e non ci sono scambi, si compra alla quotazione attuale.'
      : (K > 1 ? 'Ogni atleta può stare in al massimo ' + K + ' squadre, mai due volte nella stessa.' : 'Ogni atleta sta in una sola rosa.') + ' Le rose nascono all\'asta; al mercato si ' + (K > 1 ? 'comprano le copie rimaste ' : 'prendono gli svincolati ') + (uno ? 'a 1 credito' : 'alla Qt.A') + '.'}</span>`;
    var comando = d.isAdmin && s.canWrite && !d.composizione ? html`<${UI.AsyncBtn} cls="sm ghost ma-apri" onClick=${function () { return FS.act.apriMercato(!d.lega.mercatoAperto); }}>${d.lega.mercatoAperto ? 'Chiudi il mercato' : 'Apri il mercato'}<//>` : null;
    return html`<div class=${'banner ma-stato ' + cls} style=${{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div class="stack grow" style=${{ gap: '4px', minWidth: phone ? 0 : '240px' }}>
        <div class="row" style=${{ gap: '8px' }}><span class=${'lamp ' + lamp}></span><b>${label}</b>${sess ? html`<span class="tag blue">Sessione ${sess}</span>` : null}</div>
        ${phone ? html`<div class="ma-stato-2"><details class="more small ma-regole"><summary>Regole del mercato</summary><div style=${{ marginTop: '6px' }}>${testo}</div><div class="muted" style=${{ marginTop: '6px' }}>${spieg}</div></details>${comando}</div>`
          : html`<${React.Fragment}><div class="small">${testo}</div><div class="small muted">${spieg}</div><//>`}
      </div>
      ${phone ? null : comando}
    </div>`;
  }

  function Budget() {
    var s = FS.useFS();
    var d = FS.derived();
    var mia = d.miaRosa;
    if (!mia) return null;
    return html`<div class="ma-kpis ma-budget">
      <div class="ma-kpi"><div class="v">${mia.crediti}</div><div class="l">Crediti</div></div>
      <div class="ma-kpi"><div class="v">${mia.rosa.length}/${d.settings.rosa}</div><div class="l"><span class="ma-l-lg">Atleti in rosa</span><span class="ma-l-sm">Rosa</span></div></div>
      <div class="ma-kpi" title=${multipla(d) ? 'Devi poter completare la rosa a 1 credito per ogni posto libero' : 'Devi poter completare la rosa con l\'offerta minima per ogni posto libero'}><div class="v">${E.offertaMassima(mia, d.settings)}</div><div class="l"><span class="ma-l-lg">Spesa massima</span><span class="ma-l-sm">Max</span></div></div>
      <div class="ma-kpi"><div class="v">${mia.spesi}</div><div class="l"><span class="ma-l-lg">Crediti spesi</span><span class="ma-l-sm">Spesi</span></div></div>
    </div>`;
  }

  // ---------------------------------------------------------- svincolati
  function Svincolati() {
    var s = FS.useFS();
    var d = FS.derived();
    var cf = useConfirm();
    var stQ = useState(''); var q = stQ[0];
    var stR = useState(''); var ruolo = stR[0];
    var stX = useState(''); var sesso = stX[0];
    var stO = useState('qta'); var ord = stO[0];
    var stK = useState(false); var soloOk = stK[0];
    var stN = useState(PAGINA); var quanti = stN[0], setQuanti = stN[1];
    var multi = multipla(d);
    var Q = quote(d), K = copieTot(d);
    var mia = d.miaRosa;

    var lista = useMemo(function () {
      var nq = norm(q).trim();
      var out = [];
      // l'atleta all'asta in questo momento non è ancora assegnato ma non si può comprare (stessa regola dello store)
      var inAsta = s.asta && s.asta.lotto ? s.asta.lotto.atletaId : null;
      Object.values(s.atleti).forEach(function (a) {
        if (!a || !a.fis || a.attivo === false) return;
        var fis = a.fis;
        // copie libere: 1/0 con la disponibilità singola, Infinity con la multipla; mai un atleta che ho già
        var copie = FS.copieLibere(fis);
        if (possiede(s.uid, fis, d) || !(copie > 0)) return;
        if (fis === inAsta) return;
        var inf = UI.infoAtleta(a, d);
        if (ruolo && inf.ruolo !== ruolo) return;
        if (sesso && a.sesso !== sesso) return;
        if (nq && norm(a.cognome + ' ' + a.nome).indexOf(nq) < 0 && norm(a.nome + ' ' + a.cognome).indexOf(nq) < 0) return;
        var qt = qtDi(fis, s, d);
        var prezzo = prezzoDi(fis, s, d);
        var cap = mia ? E.offertaMassima(mia, d.settings, a, s.atleti, d.stagione) : 0;
        if (soloOk && (prezzo > cap || svincolatoOra(fis, d))) return;
        out.push({ fis: fis, a: a, inf: inf, prezzo: prezzo, cap: cap, qtI: qt.qtI, qtA: qt.qtA, fm: fmDi(d.statsAtleti[fis]), nRose: (d.proprietari[fis] || []).length, copie: copie });
      });
      function byName(x, y) { var u = norm(x.a.cognome + ' ' + x.a.nome), v = norm(y.a.cognome + ' ' + y.a.nome); return u < v ? -1 : u > v ? 1 : 0; }
      function fmv(x) { return x.fm === null ? -99 : x.fm; }
      var cmp = {
        qta: function (x, y) { return y.qtA - x.qtA || fmv(y) - fmv(x) || byName(x, y); },
        fm: function (x, y) { return fmv(y) - fmv(x) || y.qtA - x.qtA || byName(x, y); },
        prezzo: function (x, y) { return x.prezzo - y.prezzo || y.qtA - x.qtA || byName(x, y); },
        nome: byName,
      }[ord] || byName;
      out.sort(cmp);
      return out;
    }, [s.version, q, ruolo, sesso, ord, soloOk]);

    var aperto = puoOperare(d);
    var piena = !!(mia && mia.rosa.length >= d.settings.rosa);
    var vincoli = Object.keys(d.settings.ruoliRosa || {}).length > 0;
    var bloccoGlobale = !mia ? '' : !s.canWrite ? 'Sei in sola lettura: puoi consultare ' + (multi ? 'gli atleti' : Q ? 'le copie disponibili' : 'gli svincolati') + ' ma non acquistare.'
      : !aperto ? (d.composizioneChiusa ? 'La composizione delle rose è chiusa: potrai acquistare quando il presidente apre il mercato.' : 'Il mercato è chiuso: potrai acquistare quando il presidente lo riapre.')
      : piena ? (d.composizione ? 'La tua rosa è completa: per cambiare un atleta toglilo prima dalla rosa (riavrai tutti i crediti).' : 'La tua rosa è completa: per acquistare devi prima svincolare un atleta.') : '';
    function motivo(r) {
      if (svincolatoOra(r.fis, d)) return eF(r.a, 'Svincolato', 'Svincolata') + ' da te in questa sessione: potrai ' + eF(r.a, 'riprenderlo', 'riprenderla') + ' dalla prossima';
      if (r.prezzo > r.cap) {
        if (r.cap > 0) return 'Puoi spendere al massimo ' + nCr(r.cap) + ' per questo atleta';
        return vincoli ? 'Non rispetterebbe i vincoli di ruolo della rosa' : 'Crediti insufficienti';
      }
      return '';
    }
    function compra(r) {
      cf[1]({
        title: 'Compri ' + UI.nomeAtleta(r.a) + '?',
        yes: 'Compra a ' + r.prezzo,
        body: UI.nomeAtleta(r.a) + ' (' + r.inf.catLabel + (Q && K > 1 ? ', copia ' + (r.nRose + 1) + ' di ' + K : '') + ') entra nella tua rosa per ' + nCr(r.prezzo) + '. Ti ' + (mia.crediti - r.prezzo === 1 ? 'resterà ' : 'resteranno ') + nCr(mia.crediti - r.prezzo) + ' e avrai ' + (mia.rosa.length ? (mia.rosa.length + 1) + ' atleti' : '1 atleta') + ' su ' + d.settings.rosa + '.' + (d.composizione ? ' Finché le rose sono in composizione puoi ' + (r.a.sesso === 'F' ? 'toglierla' : 'toglierlo') + ' e riavere tutti i crediti.' : ''),
        run: function () { return FS.act.acquistaSvincolato(r.fis); },
      });
    }
    function setF(set) { return function (e) { set(e.target.value); setQuanti(PAGINA); }; }

    var vis = lista.slice(0, quanti);
    var phone = UI.useMq(UI.PHONE);
    var cerca = html`<${UI.Field} id="merc-cerca" label="Cerca"><input id="merc-cerca" class="input" type="search" placeholder="Cognome o nome" value=${q} onInput=${setF(stQ[1])}/><//>`;
    var altriFiltri = html`<${React.Fragment}>
          <${UI.Field} id="merc-ruolo" label="Ruolo">
            <select id="merc-ruolo" class="input" value=${ruolo} onChange=${setF(stR[1])}>
              <option value="">Tutti</option>
              ${E.ORDINE_RUOLI.map(function (r) { return html`<option key=${r} value=${r}>${E.RUOLI[r].label}</option>`; })}
            </select>
          <//>
          <${UI.Field} id="merc-sesso" label="Gare">
            <select id="merc-sesso" class="input" value=${sesso} onChange=${setF(stX[1])}>
              <option value="">Tutte</option>
              <option value="M">Maschili</option>
              <option value="F">Femminili</option>
            </select>
          <//>
          <${UI.Field} id="merc-ordine" label="Ordina per">
            <select id="merc-ordine" class="input" value=${ord} onChange=${setF(stO[1])}>
              <option value="qta">Quotazione (Qt.A)</option>
              <option value="fm">Fantamedia (FM)</option>
              <option value="prezzo">Prezzo più basso</option>
              <option value="nome">Cognome</option>
            </select>
          <//>
        <//>`;
    var soloOkEl = mia ? html`<label class="check small" style=${{ marginTop: '10px' }}><input id="merc-solo-ok" type="checkbox" checked=${soloOk} onChange=${function (e) { stK[1](e.target.checked); setQuanti(PAGINA); }}/> Solo quelli che posso permettermi</label>` : null;
    // telefono: la ricerca resta in vista, filtri e ordine in un riquadro richiudibile (come nel listone)
    var nFiltri = (ruolo ? 1 : 0) + (sesso ? 1 : 0) + (ord !== 'qta' ? 1 : 0) + (soloOk ? 1 : 0);
    var filtri = phone ? html`<${React.Fragment}>
        <div class="ma-filters">${cerca}</div>
        <details class="more small ma-more" open=${nFiltri ? true : undefined}><summary>Filtri e ordine${nFiltri ? ' (' + nFiltri + ')' : ''}</summary>
          <div class="ma-filters">${altriFiltri}</div>
          ${soloOkEl}
        </details>
      <//>` : html`<${React.Fragment}><div class="ma-filters">${cerca}${altriFiltri}</div>${soloOkEl}<//>`;
    var prezzoTesto = !multi && d.settings.prezzoSvincolati === 'uno'
      ? 'In questa lega ogni svincolato costa 1 credito.'
      : 'Il prezzo è la quotazione attuale (Qt.A): parte dalla Qt.I e si aggiorna con la fantamedia della stagione.';
    return html`<div class="stack">
      <${Budget}/>
      <${UI.Card} title=${multi ? 'Atleti del listone' : Q ? 'Copie disponibili' : 'Svincolati'} meta=${lista.length + (lista.length === 1 ? ' atleta' : ' atleti')}>
        <p class="small muted ma-intro" style=${{ marginTop: 0 }}>${prezzoTesto}${multi ? ' Puoi prendere anche atleti che sono già in altre rose.' : Q ? ' Ogni atleta può stare in al massimo ' + (K === 1 ? '1 squadra' : K + ' squadre') + ': qui trovi quelli che hanno ancora copie libere e che non hai già.' : ''}</p>
        ${bloccoGlobale ? html`<div class="banner warn small" style=${{ marginBottom: '10px' }}>${bloccoGlobale}</div>` : null}
        ${filtri}
        ${vis.length ? html`<div class="list" style=${{ marginTop: '6px' }}>${vis.map(function (r) {
          var m = mia ? motivo(r) : '';
          var off = !!bloccoGlobale || !!m;
          return html`<div class="li ma-row" key=${r.fis}>
            <${UI.AtletaMask} atleta=${r.a} size=${38}/>
            <div class="body">
              <button class="ma-name" onClick=${function () { UI.openAtleta(r.fis); }}>${UI.nomeAtleta(r.a)}</button>
              <div class="sub"><span class="ma-role-in"><${UI.Role} ruolo=${r.inf.ruolo}/> </span>${r.inf.catLabel}<span class="ma-x"> · ${r.a.anno || '—'}</span> · FM ${fmTxt(r.fm)} · Qt.A ${r.qtA}<span class="ma-x">${r.qtA !== r.qtI ? ' (Qt.I ' + r.qtI + ')' : ''}</span>${multi && r.nRose ? ' · in ' + r.nRose + (r.nRose === 1 ? ' rosa' : ' rose') : ''}</div>
              ${Q ? html`<div class=${'tiny ma-copie' + (r.copie === 1 ? ' ultima' : '')}>${txtCopie(r.copie, K)}</div>` : null}
              ${m && !bloccoGlobale ? html`<div class="tiny muted">${m}</div>` : null}
            </div>
            <span class="ma-role-out"><${UI.Role} ruolo=${r.inf.ruolo}/></span>
            ${mia && !bloccoGlobale ? html`<button class="btn sm" disabled=${off} title=${m || ('Compra per ' + nCr(r.prezzo))} onClick=${function () { compra(r); }}>Compra a ${r.prezzo}</button>`
              : html`<span class="tag blue ma-prezzo" title=${bloccoGlobale || ''}>${r.prezzo} cr</span>`}
          </div>`;
        })}</div>` : html`<${UI.Empty} title="Nessun atleta">${q || ruolo || sesso || soloOk ? 'Nessuno corrisponde ai filtri scelti.' : Q ? 'Al momento non ci sono copie libere di atleti che non hai già.' : 'Al momento non ci sono atleti liberi.'}<//>`}
        ${lista.length > quanti ? html`<div class="row" style=${{ justifyContent: 'center', marginTop: '10px' }}><button class="btn ghost sm" onClick=${function () { setQuanti(quanti + PAGINA); }}>Mostra altri (${lista.length - quanti})</button></div>` : null}
      <//>
      ${cf[0]}
    </div>`;
  }

  // ---------------------------------------------------------- la mia rosa
  function MiaRosa() {
    var s = FS.useFS();
    var d = FS.derived();
    var cf = useConfirm();
    var mia = d.miaRosa;
    if (!mia) return html`<${UI.Card} title="La mia rosa"><${UI.Empty} title="Nessuna squadra">Iscrivi una squadra alla lega per comporre la tua rosa.<//><//>`;

    var aperto = puoOperare(d) && s.canWrite;
    var prox = d.prossima ? FS.formazioneEffettiva(s.uid, d.prossima.n) : null;
    var schierati = prox ? prox.titolari.concat(prox.panchina) : [];
    var righe = mia.rosa.map(function (x) {
      var a = atletaDi(x.id, s);
      return { x: x, a: a, inf: UI.infoAtleta(a, d), qt: qtDi(x.id, s, d), fm: fmDi(d.statsAtleti[x.id]), rimborso: rimborsoDi(x.prezzo) };
    }).sort(function (u, v) { return ORD_RUOLO[u.inf.ruolo] - ORD_RUOLO[v.inf.ruolo] || v.x.prezzo - u.x.prezzo; });
    var conta = E.contaRuoli(mia.rosa.map(function (x) { return x.id; }), s.atleti, d.stagione);
    var lim = d.settings.ruoliRosa || {};
    var sess = sessione(d);
    var giaSvincolati = d.composizione ? [] : mia.svincolati.filter(function (x) { return !x.pieno && (x.sessione || 0) === sess; });

    function svincola(r) {
      var inForm = schierati.indexOf(r.x.id) >= 0;
      if (d.composizione) {
        cf[1]({
          title: 'Togli ' + UI.nomeAtleta(r.a) + ' dalla rosa?',
          yes: 'Togli (+' + r.rimborso + ')',
          body: UI.nomeAtleta(r.a) + ' lascia la tua rosa e ' + (r.rimborso === 1 ? 'riavrai l\'unico credito che hai speso' : 'riavrai tutti i ' + r.rimborso + ' crediti che hai speso') + ': durante la composizione delle rose il rimborso è pieno e puoi ' + eF(r.a, 'ricomprarlo', 'ricomprarla') + ' quando vuoi.' + (inForm ? ' Attenzione: è nella tua formazione per la prossima giornata, ricordati di aggiornarla.' : ''),
          run: function () { return FS.act.svincola(r.x.id); },
        });
        return;
      }
      cf[1]({
        title: 'Svincoli ' + UI.nomeAtleta(r.a) + '?',
        yes: 'Svincola (+' + r.rimborso + ')',
        danger: true,
        body: UI.nomeAtleta(r.a) + (quote(d) ? ' lascia la tua rosa (la sua copia torna libera al mercato) e ricevi ' : multipla(d) ? ' lascia la tua rosa e ricevi ' : ' torna tra gli svincolati e ricevi ') + nCr(r.rimborso) + ' (' + pct(d.settings.rimborsoSvincolo) + ' dei ' + r.x.prezzo + ' pagati, arrotondato per eccesso). Non potrai ' + eF(r.a, 'riprenderlo', 'riprenderla') + ' finché non si apre una nuova sessione di mercato.' + (inForm ? ' Attenzione: è nella tua formazione per la prossima giornata, ricordati di aggiornarla.' : ''),
        run: function () { return FS.act.svincola(r.x.id); },
      });
    }

    return html`<div class="stack">
      <${Budget}/>
      <${UI.Card} title="La mia rosa" meta=${mia.rosa.length + ' di ' + d.settings.rosa + ' atleti'}>
        <div class="row small" style=${{ gap: '14px', marginBottom: '8px' }}>${E.ORDINE_RUOLI.map(function (r) {
          var l = lim[r];
          return html`<span key=${r} class="row" style=${{ gap: '5px' }}><${UI.Role} ruolo=${r}/><b>${conta[r]}</b>${l ? html`<span class="faint">(min ${l[0]}, max ${l[1]})</span>` : null}</span>`;
        })}</div>
        ${!aperto && s.canWrite ? html`<div class="banner warn small" style=${{ marginBottom: '8px' }}>Gli svincoli sono possibili solo a mercato aperto.</div>` : null}
        ${d.composizione && s.canWrite ? html`<div class="banner small" style=${{ marginBottom: '8px' }}>Composizione delle rose: se togli un atleta riavrai tutti i crediti spesi.</div>` : null}
        ${righe.length ? html`<div class="list">${righe.map(function (r) {
          return html`<div class="li ma-tap ma-rosa-li" key=${r.x.id}>
            <${UI.AtletaMask} atleta=${r.a} team=${d.mia} size=${40}/>
            <div class="body">
              <button class="ma-name" onClick=${function () { UI.openAtleta(r.x.id); }}>${UI.nomeAtleta(r.a)}</button>
              <div class="sub">${r.inf.catLabel} · pagato <b>${r.x.prezzo}</b> ${r.x.tipo === 'acquisto' && multipla(d) ? 'dal listone' : ARRIVO[r.x.tipo] || ''}${r.x.dal ? ' il ' + dataMs(r.x.dal) : ''}</div>
              <div class="tiny faint">FM ${fmTxt(r.fm)} · Qt.A ${r.qt.qtA}${schierati.indexOf(r.x.id) >= 0 ? ' · in formazione' : ''}</div>
            </div>
            <${UI.Role} ruolo=${r.inf.ruolo}/>
            ${s.canWrite ? html`<button class="btn sm ghost" disabled=${!aperto} title=${aperto ? 'Rimborso: ' + nCr(r.rimborso) : 'Mercato chiuso'} onClick=${function () { svincola(r); }}>${d.composizione ? 'Togli' : 'Svincola'} +${r.rimborso}</button>` : null}
          </div>`;
        })}</div>` : html`<${UI.Empty} title="Rosa vuota">${multipla(d) ? 'Compra i tuoi atleti dal listone, alla quotazione: ' + d.settings.crediti + ' crediti per ' + d.settings.rosa + ' atleti.' : quote(d) ? 'La rosa si compone all\'asta; dopo potrai completarla al mercato con le copie rimaste.' : 'La rosa si compone all\'asta; dopo potrai completarla con gli svincolati.'}<//>`}
        <p class="tiny faint" style=${{ marginBottom: 0 }}>${d.composizione ? 'Finché le rose sono in composizione chi toglie un atleta riavrà tutti i crediti; dopo l\'avvio del campionato allo svincolo si riceve il ' + pct(d.settings.rimborsoSvincolo) + ' del prezzo pagato.' : 'Allo svincolo ricevi il ' + pct(d.settings.rimborsoSvincolo) + ' del prezzo pagato, arrotondato per eccesso. Un atleta svincolato non si può riacquistare nella stessa sessione di mercato.'}</p>
      <//>
      ${giaSvincolati.length ? html`<${UI.Card} title="Svincolati da te in questa sessione">
        <p class="small muted" style=${{ marginTop: 0 }}>Potrai riprenderli dalla prossima sessione di mercato.</p>
        <div class="row" style=${{ gap: '6px' }}>${giaSvincolati.map(function (x, i) {
          return html`<button key=${x.id + '-' + i} class="pill" onClick=${function () { UI.openAtleta(x.id); }}>${UI.nomeAtleta(atletaDi(x.id, s), true)}</button>`;
        })}</div>
      <//>` : null}
      ${cf[0]}
    </div>`;
  }

  // ---------------------------------------------------------------- scambi
  function Pacchetto(p) {
    var s = FS.useFS();
    var chi = p.chi === s.uid ? 'Tu cedi' : FS.nomeSquadra(p.chi) + ' cede';
    return html`<div class="small" style=${{ marginTop: '4px' }}><b>${chi}:</b> ${p.ids.length ? p.ids.map(function (id) {
      return html`<button key=${id} class="pill ma-pill" onClick=${function () { UI.openAtleta(id); }}>${UI.nomeAtleta(atletaDi(id, s), true)}</button>`;
    }) : html`<span class="faint">nessun atleta</span>`}</div>`;
  }

  function testoConguaglio(sc, uid) {
    var cr = Number(sc.crediti) || 0;
    if (!cr) return '';
    var paga = cr > 0 ? sc.da : sc.a, riceve = cr > 0 ? sc.a : sc.da;
    return (paga === uid ? 'Versi ' : FS.nomeSquadra(paga) + ' versa ') + nCr(Math.abs(cr)) + (riceve === uid ? ' a te' : ' a ' + FS.nomeSquadra(riceve));
  }

  function ScambioRiga(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var sc = p.sc;
    var daA = sc.daA || [], daB = sc.daB || [];
    var pendente = sc.stato === 'proposto';
    var ver = pendente ? verifica(s, d, sc.da, sc.a, daA, daB, Number(sc.crediti) || 0) : null;
    var altro = sc.da === s.uid ? sc.a : sc.da;
    var titolo = p.tipo === 'ricevuta' ? 'Da ' + FS.nomeSquadra(sc.da) : p.tipo === 'inviata' ? 'A ' + FS.nomeSquadra(sc.a) : FS.nomeSquadra(sc.da) + ' ⇄ ' + FS.nomeSquadra(sc.a);
    var stato = { accettato: ['green', 'Accettato'], rifiutato: ['red', 'Rifiutato'], annullato: ['', 'Ritirato'], proposto: ['gold', 'In attesa'] }[sc.stato] || ['', sc.stato];
    // scambio accettato ma poi annullato dal presidente nel registro movimenti
    if (sc.stato === 'accettato' && s.movimenti.some(function (m) { return m.id === 'scambio-' + sc.id && m.annullato; })) stato = ['', 'Annullato dal presidente'];
    var cong = testoConguaglio(sc, s.uid);
    var puoAccettare = s.canWrite && d.mercatoAperto && ver && !ver.errori.length;
    return html`<div class="li" style=${{ alignItems: 'flex-start' }}>
      <${UI.TeamMask} team=${s.squadre[altro] || { id: altro, nome: '?' }} size=${40}/>
      <div class="body">
        <div class="row between" style=${{ gap: '6px', flexWrap: 'nowrap' }}><span class="title">${titolo}</span><span class=${'tag ' + stato[0]}>${stato[1]}</span></div>
        <${Pacchetto} chi=${sc.da} ids=${daA}/>
        <${Pacchetto} chi=${sc.a} ids=${daB}/>
        ${cong ? html`<div class="small" style=${{ marginTop: '4px' }}><b>Conguaglio:</b> ${cong}</div>` : null}
        ${sc.nota ? html`<div class="small muted" style=${{ marginTop: '4px', whiteSpace: 'normal' }}>«${sc.nota}»</div>` : null}
        <div class="tiny faint" style=${{ marginTop: '4px' }}>Proposta ${UI.ago(sc.at)}${sc.chiusoAt && !pendente ? ' · chiusa ' + UI.ago(sc.chiusoAt) : ''}</div>
        ${ver && ver.errori.length ? html`<div class="banner err small" style=${{ marginTop: '6px' }}>${ver.errori[0]}</div>` : null}
        ${p.tipo === 'ricevuta' && pendente && !d.mercatoAperto ? html`<div class="tiny faint" style=${{ marginTop: '4px' }}>Potrai accettarla quando il mercato è aperto.</div>` : null}
        ${p.tipo === 'ricevuta' && pendente && s.canWrite ? html`<div class="row" style=${{ marginTop: '8px', gap: '8px' }}>
          <button class="btn ok sm" disabled=${!puoAccettare} onClick=${p.onSi}>Accetta</button>
          <button class="btn ghost sm" onClick=${p.onNo}>Rifiuta</button>
        </div>` : null}
        ${p.tipo === 'inviata' && pendente && s.canWrite ? html`<div class="row" style=${{ marginTop: '8px' }}><button class="btn ghost sm" onClick=${p.onRitira}>Ritira la proposta</button></div>` : null}
      </div>
    </div>`;
  }

  function NuovaProposta() {
    var s = FS.useFS();
    var d = FS.derived();
    var stP = useState(''); var partner = stP[0];
    var stD = useState([]); var dai = stD[0];
    var stR = useState([]); var ricevi = stR[0];
    var stC = useState(''); var crediti = stC[0];
    var stN = useState(''); var nota = stN[0];
    var mia = d.miaRosa || { rosa: [], crediti: 0 };
    var altri = d.teamIds.filter(function (t) { return t !== s.uid; });
    var loro = partner && d.rose[partner] ? d.rose[partner] : null;
    var daiOk = dai.filter(function (id) { return mia.rosa.some(function (x) { return x.id === id; }); });
    var ricOk = ricevi.filter(function (id) { return !!loro && loro.rosa.some(function (x) { return x.id === id; }); });
    var cr = Math.trunc(Number(crediti) || 0);
    var ver = loro ? verifica(s, d, s.uid, partner, daiOk, ricOk, cr) : null;
    var aperto = d.mercatoAperto && s.canWrite;
    var R = d.settings.rosa;

    function toggle(list, set, id) { set(list.indexOf(id) >= 0 ? list.filter(function (x) { return x !== id; }) : list.concat([id])); }
    async function invia() {
      await FS.act.proponiScambio({ a: partner, daA: daiOk, daB: ricOk, crediti: cr, nota: nota.trim() });
      stD[1]([]); stR[1]([]); stC[1](''); stN[1]('');
    }
    /** Elenco con spunta; `giaDi` è la squadra che riceverebbe: chi ha già l'atleta non può riceverlo. */
    function checks(rosa, sel, set, pre, giaDi) {
      if (!rosa.length) return html`<div class="small muted">Nessun atleta in rosa.</div>`;
      return html`<div class="ma-checks">${rosa.map(function (x) {
        var a = atletaDi(x.id, s);
        var inf = UI.infoAtleta(a, d);
        var gia = !!giaDi && possiede(giaDi, x.id, d);
        var on = sel.indexOf(x.id) >= 0;
        var mio = giaDi === s.uid;
        // se è già spuntato (rose cambiate nel frattempo) resta togglabile per poterlo togliere
        return html`<label class="check small" key=${x.id} title=${gia ? (mio ? 'Ce l\'hai già nella tua rosa' : 'È già nella rosa di ' + FS.nomeSquadra(giaDi)) : ''}>
          <input id=${pre + x.id} type="checkbox" checked=${on} disabled=${!aperto || (gia && !on)} onChange=${function () { toggle(sel, set, x.id); }}/>
          <${UI.Role} ruolo=${inf.ruolo}/>
          <span class="grow ma-ellip">${UI.nomeAtleta(a, true)}</span>
          ${gia ? html`<span class=${'tag' + (mio ? ' blue' : '')}>${mio ? 'Già tuo' : 'Ce l\'ha già'}</span>` : html`<span class="tiny faint">Qt.A ${qtDi(x.id, s, d).qtA}</span>`}
        </label>`;
      })}</div>`;
    }
    // atleti che non si possono scambiare perché chi li riceverebbe li ha già (asta a quote o disponibilità multipla)
    var nDoppi = loro ? mia.rosa.filter(function (x) { return possiede(partner, x.id, d); }).length + loro.rosa.filter(function (x) { return possiede(s.uid, x.id, d); }).length : 0;

    if (!altri.length) return html`<${UI.Card} title="Proponi uno scambio"><${UI.Empty} title="Nessun'altra squadra">Gli scambi saranno possibili quando altri amici entrano nella lega con il codice ${d.lega.codice}.<//><//>`;
    return html`<${UI.Card} title="Proponi uno scambio">
      ${!d.mercatoAperto ? html`<div class="banner warn small" style=${{ marginBottom: '10px' }}>Le proposte di scambio si inviano e si accettano solo a mercato aperto.</div>` : null}
      <div class="stack" style=${{ gap: '12px' }}>
        <${UI.Field} id="sc-partner" label="Squadra con cui scambiare">
          <select id="sc-partner" class="input" value=${partner} disabled=${!aperto} onChange=${function (e) { stP[1](e.target.value); stR[1]([]); }}>
            <option value="">Scegli una squadra…</option>
            ${altri.map(function (t) { return html`<option key=${t} value=${t}>${FS.nomeSquadra(t)} (${FS.nomeGiocatore(t)})</option>`; })}
          </select>
        <//>
        ${loro ? html`<div class="stack" style=${{ gap: '12px' }}>
          <div class="grid grid-2">
            <div class="stack" style=${{ gap: '6px' }}><div class="lbl">Cedi (${daiOk.length})</div>${checks(mia.rosa, dai, stD[1], 'sc-dai-', partner)}</div>
            <div class="stack" style=${{ gap: '6px' }}><div class="lbl">Ricevi da ${FS.nomeSquadra(partner)} (${ricOk.length})</div>${checks(loro.rosa, ricevi, stR[1], 'sc-ricevi-', s.uid)}</div>
          </div>
          ${nDoppi ? html`<div class="tiny faint">Nessuna squadra può avere due volte lo stesso atleta${quote(d) && copieTot(d) > 1 ? ' (asta a copie)' : ''}: chi è segnato «Già tuo» o «Ce l'ha già» non si può scambiare.</div>` : null}
          <div class="form-grid">
            <${UI.Field} id="sc-crediti" label="Conguaglio in crediti" help="Positivo: paghi tu. Negativo: paga l'altra squadra.">
              <input id="sc-crediti" class="input num" type="number" step="1" placeholder="0" value=${crediti} disabled=${!aperto} onInput=${function (e) { stC[1](e.target.value); }}/>
            <//>
            <${UI.Field} id="sc-nota" label="Messaggio (facoltativo)">
              <input id="sc-nota" class="input" maxLength="200" placeholder="Es. ti serve un Under 20?" value=${nota} disabled=${!aperto} onInput=${function (e) { stN[1](e.target.value); }}/>
            <//>
          </div>
          ${ver && !ver.vuoto ? html`<div class="stack" style=${{ gap: '6px' }}>
            <div class="small">Dopo lo scambio: <b>tu</b> ${ver.nA}/${R} atleti e ${nCr(ver.cA)} · <b>${FS.nomeSquadra(partner)}</b> ${ver.nB}/${R} atleti e ${nCr(ver.cB)}.</div>
            ${ver.errori.map(function (e, i) { return html`<div key=${'e' + i} class="banner err small">${e}</div>`; })}
            ${ver.avvisi.map(function (e, i) { return html`<div key=${'a' + i} class="banner warn small">${e}</div>`; })}
          </div>` : html`<div class="small muted">Spunta almeno un atleta da cedere o da ricevere.</div>`}
          <div class="row">
            <${UI.AsyncBtn} disabled=${!aperto || !ver || ver.vuoto || ver.errori.length > 0} onClick=${invia}>Invia la proposta<//>
            <span class="tiny faint">Lo scambio diventa effettivo solo quando l'altra squadra accetta.</span>
          </div>
        </div>` : null}
      </div>
    <//>`;
  }

  function Scambi() {
    var s = FS.useFS();
    var d = FS.derived();
    var cf = useConfirm();
    var tutti = useMemo(function () {
      return Object.values(s.scambi).slice().sort(function (x, y) { return (y.chiusoAt || y.at || 0) - (x.chiusoAt || x.at || 0); });
    }, [s.version]);
    if (!d.mia) return html`<${UI.Card} title="Scambi"><${UI.Empty} title="Nessuna squadra">Solo chi ha una squadra nella lega può proporre scambi.<//><//>`;

    var ricevute = tutti.filter(function (x) { return x.stato === 'proposto' && x.a === s.uid; });
    var inviate = tutti.filter(function (x) { return x.stato === 'proposto' && x.da === s.uid; });
    var storico = tutti.filter(function (x) { return x.stato !== 'proposto' && (x.da === s.uid || x.a === s.uid || x.stato === 'accettato'); });

    function rispondi(sc, si) {
      cf[1]({
        title: si ? 'Accetti lo scambio?' : 'Rifiuti la proposta?',
        yes: si ? 'Accetta' : 'Rifiuta',
        danger: !si,
        body: si ? 'Lo scambio con ' + FS.nomeSquadra(sc.da) + ' diventa effettivo subito: rose e crediti di entrambe le squadre si aggiornano.' : FS.nomeSquadra(sc.da) + ' vedrà la proposta come rifiutata.',
        run: function () { return FS.act.rispondiScambio(sc.id, si); },
      });
    }
    function ritira(sc) {
      cf[1]({ title: 'Ritiri la proposta?', yes: 'Ritira', body: 'La proposta a ' + FS.nomeSquadra(sc.a) + ' verrà annullata.', run: function () { return FS.act.annullaScambio(sc.id); } });
    }

    return html`<div class="stack">
      <${NuovaProposta}/>
      <${UI.Card} title="Proposte ricevute" meta=${ricevute.length ? ricevute.length + ' in attesa' : ''}>
        ${ricevute.length ? html`<div class="list">${ricevute.map(function (sc) {
          return html`<${ScambioRiga} key=${sc.id} sc=${sc} tipo="ricevuta" onSi=${function () { rispondi(sc, true); }} onNo=${function () { rispondi(sc, false); }}/>`;
        })}</div>` : html`<div class="small muted">Nessuna proposta in attesa.</div>`}
      <//>
      <${UI.Card} title="Proposte inviate" meta=${inviate.length ? inviate.length + ' in attesa di risposta' : ''}>
        ${inviate.length ? html`<div class="list">${inviate.map(function (sc) {
          return html`<${ScambioRiga} key=${sc.id} sc=${sc} tipo="inviata" onRitira=${function () { ritira(sc); }}/>`;
        })}</div>` : html`<div class="small muted">Non hai proposte in sospeso.</div>`}
      <//>
      <${UI.Card} title="Storico scambi" meta=${storico.length ? storico.length + '' : ''}>
        ${storico.length ? html`<div class="list">${storico.slice(0, 30).map(function (sc) {
          return html`<${ScambioRiga} key=${sc.id} sc=${sc} tipo="storico"/>`;
        })}</div>` : html`<div class="small muted">Ancora nessuno scambio concluso nella lega.</div>`}
      <//>
      ${cf[0]}
    </div>`;
  }

  // ------------------------------------------------------------- movimenti
  function nomiAtleti(ids, s) {
    ids = ids || [];
    return ids.length ? ids.map(function (id) { return UI.nomeAtleta(atletaDi(id, s), true); }).join(', ') : 'nessuno';
  }

  function Movimenti() {
    var s = FS.useFS();
    var d = FS.derived();
    var cf = useConfirm();
    var stT = useState(''); var tipo = stT[0];
    var stS = useState(''); var squadra = stS[0];
    var stA = useState(true); var annullati = stA[0];
    var stN = useState(PAGINA_MOV); var quanti = stN[0], setQuanti = stN[1];
    var errori = useMemo(function () {
      var o = {};
      (d.erroriRose || []).forEach(function (e) { if (e.m && e.m.id) o[e.m.id] = e.err; });
      return o;
    }, [s.version]);
    var lista = useMemo(function () {
      return s.movimenti.filter(function (m) {
        if (tipo && m.tipo !== tipo) return false;
        if (!annullati && m.annullato) return false;
        if (squadra && m.teamId !== squadra && m.teamA !== squadra && m.teamB !== squadra) return false;
        return true;
      }).sort(function (x, y) { return (y.at || 0) - (x.at || 0) || (String(y.id) < String(x.id) ? -1 : 1); });
    }, [s.version, tipo, squadra, annullati]);
    var nErr = Object.keys(errori).length;

    function annulla(m) {
      var t = TIPI[m.tipo] ? TIPI[m.tipo].label.toLowerCase() : m.tipo;
      cf[1]({
        title: 'Annullare questo movimento?',
        yes: 'Sì, annullalo',
        danger: true,
        body: 'Il movimento (' + t + ' del ' + UI.dataOra(m.at) + ') resta nel registro, barrato, e non conta più: rose e crediti si ricalcolano subito. I movimenti successivi che dipendono da questo potrebbero non essere più validi.',
        run: function () { return FS.act.annullaMovimento(m.id); },
      });
    }
    function setF(set) { return function (e) { set(e.target.value); setQuanti(PAGINA_MOV); }; }

    var vis = lista.slice(0, quanti);
    return html`<div class="stack">
      <${UI.Card} title="Registro dei movimenti" meta=${lista.length + ' movimenti'}>
        <p class="small muted" style=${{ marginTop: 0 }}>Ogni acquisto, svincolo, scambio e rettifica di crediti della lega. Rose e crediti si ricalcolano da questo registro.</p>
        ${d.isAdmin && nErr ? html`<div class="banner warn small" style=${{ marginBottom: '10px' }}>${nErr === 1 ? '1 movimento non è stato applicato' : nErr + ' movimenti non sono stati applicati'} (ad esempio atleta già in rosa): sono segnati nel registro.</div>` : null}
        <div class="ma-filters">
          <${UI.Field} id="mov-tipo" label="Tipo">
            <select id="mov-tipo" class="input" value=${tipo} onChange=${setF(stT[1])}>
              <option value="">Tutti</option>
              ${Object.keys(TIPI).map(function (k) { return html`<option key=${k} value=${k}>${TIPI[k].label}</option>`; })}
            </select>
          <//>
          <${UI.Field} id="mov-squadra" label="Squadra">
            <select id="mov-squadra" class="input" value=${squadra} onChange=${setF(stS[1])}>
              <option value="">Tutte</option>
              ${d.teamIds.map(function (t) { return html`<option key=${t} value=${t}>${FS.nomeSquadra(t)}</option>`; })}
            </select>
          <//>
        </div>
        <label class="check small" style=${{ marginTop: '10px' }}><input id="mov-annullati" type="checkbox" checked=${annullati} onChange=${function (e) { stA[1](e.target.checked); setQuanti(PAGINA_MOV); }}/> Mostra anche i movimenti annullati</label>
      <//>
      <${UI.Card} flush=${true}>
        ${vis.length ? html`<div class="tbl-wrap"><table class="tbl ma-mov">
          <thead><tr><th>Data</th><th>Tipo</th><th>Squadra</th><th>Atleti</th><th class="r">Crediti</th>${d.isAdmin ? html`<th class="r"><span class="faint">Azioni</span></th>` : null}</tr></thead>
          <tbody>${vis.map(function (m) {
            var t = TIPI[m.tipo] || { label: m.tipo || '—', cls: '' };
            var sq, atl, cred;
            if (m.tipo === 'scambio') {
              sq = FS.nomeSquadra(m.teamA) + ' ⇄ ' + FS.nomeSquadra(m.teamB);
              atl = html`<${React.Fragment}><div>${nomiAtleti(m.daA, s)} <span class="faint">→ ${FS.nomeSquadra(m.teamB)}</span></div><div>${nomiAtleti(m.daB, s)} <span class="faint">→ ${FS.nomeSquadra(m.teamA)}</span></div><//>`;
              var c = Number(m.creditiAversoB) || 0;
              cred = c ? Math.abs(c) + ' a ' + FS.nomeSquadra(c > 0 ? m.teamB : m.teamA) : '—';
            } else if (m.tipo === 'svincolo') {
              sq = FS.nomeSquadra(m.teamId);
              atl = UI.nomeAtleta(atletaDi(m.atletaId, s));
              cred = '+' + (Number(m.rimborso) || 0);
            } else if (m.tipo === 'crediti') {
              sq = FS.nomeSquadra(m.teamId);
              atl = html`<span class="muted">${m.nota || 'Rettifica dei crediti'}</span>`;
              cred = UI.segno(Number(m.delta) || 0);
            } else {
              sq = FS.nomeSquadra(m.teamId);
              atl = UI.nomeAtleta(atletaDi(m.atletaId, s)) + (m.tipo === 'asta' && m.lotto ? ' · lotto ' + m.lotto : '');
              cred = '−' + (Number(m.prezzo) || 0);
            }
            var err = errori[m.id];
            var mine = m.teamId === s.uid || m.teamA === s.uid || m.teamB === s.uid;
            return html`<tr key=${m.id} class=${(m.annullato ? 'ma-strike' : '') + (mine ? ' ma-me' : '')}>
              <td class="small ma-mov-d" style=${{ whiteSpace: 'nowrap' }}>${UI.dataOra(m.at)}</td>
              <td class="ma-mov-t"><span class=${'tag ' + t.cls}>${t.label}</span>${m.annullato ? html`<${React.Fragment}> <span class="tag">annullato</span><//>` : null}${err && !m.annullato ? html`<${React.Fragment}> <span class="tag red" title=${err}>non applicato</span><//>` : null}<span class="ma-mov-dt small muted"> · ${UI.dataOra(m.at)}</span></td>
              <td class="ma-mov-s">${sq}</td>
              <td class="small ma-mov-a">${atl}</td>
              <td class="r ma-mov-c" style=${{ whiteSpace: 'nowrap' }}>${cred}</td>
              ${d.isAdmin ? html`<td class="r ma-act">${!m.annullato && s.canWrite ? html`<button class="btn xs ghost" onClick=${function () { annulla(m); }}>Annulla</button>` : null}</td>` : null}
            </tr>`;
          })}</tbody>
        </table></div>` : html`<${UI.Empty} title="Nessun movimento">${tipo || squadra ? 'Nessun movimento con questi filtri.' : 'Il registro si riempie con l\'asta e il mercato.'}<//>`}
        ${lista.length > quanti ? html`<div class="card-f" style=${{ justifyContent: 'center' }}><button class="btn ghost sm" onClick=${function () { setQuanti(quanti + PAGINA_MOV); }}>Mostra altri (${lista.length - quanti})</button></div>` : null}
      <//>
      ${cf[0]}
    </div>`;
  }

  // ------------------------------------------------------------------ vista
  V.Mercato = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var st = useState(function () {
      try { return localStorage.getItem(TAB_KEY) || 'svincolati'; } catch (e) { return 'svincolati'; }
    });
    // listone: niente scambi (ogni squadra può comprare qualunque atleta)
    var tabs = multipla(d) ? TABS.filter(function (t) { return t[0] !== 'scambi'; }) : TABS;
    var tab = tabs.some(function (t) { return t[0] === st[0]; }) ? st[0] : 'svincolati';
    function setTab(t) { st[1](t); try { localStorage.setItem(TAB_KEY, t); } catch (e) { } }
    var nRic = Object.values(s.scambi).filter(function (x) { return x.stato === 'proposto' && x.a === s.uid; }).length;
    var subRef = useRef(null);
    useEffect(function () {
      var box = subRef.current;
      if (!box || box.scrollWidth <= box.clientWidth) return;
      var el = box.querySelector('[aria-pressed="true"]');
      if (el) box.scrollLeft = Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2);
    }, [tab]);
    var body = tab === 'rosa' ? html`<${MiaRosa}/>`
      : tab === 'scambi' ? html`<${Scambi}/>`
      : tab === 'movimenti' ? html`<${Movimenti}/>`
      : html`<${Svincolati}/>`;
    return html`<div class="stack">
      <div class="crumbs"><span class="c">${d.lega.nome}</span><span class="faint">›</span><span class="c on">Mercato</span></div>
      <${StatoMercato}/>
      <div class="subtabs" ref=${subRef} role="group" aria-label="Sezioni del mercato" style=${{ marginBottom: 0 }}>${tabs.map(function (t) {
        return html`<button key=${t[0]} class="pill" aria-pressed=${tab === t[0]} onClick=${function () { setTab(t[0]); }}>${t[0] === 'svincolati' && multipla(d) ? 'Acquista' : t[0] === 'svincolati' && quote(d) && copieTot(d) > 1 ? 'Copie disponibili' : t[1]}${t[0] === 'scambi' && nRic ? html`<${React.Fragment}> <span class="tag red">${nRic}</span><//>` : null}</button>`;
      })}</div>
      ${body}
    </div>`;
  };
})(window);
