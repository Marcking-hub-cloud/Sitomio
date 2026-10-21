/* Vista Asta: asta online "a chiamata con rilanci", preparazione, comandi del presidente e asta dal vivo. */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useMemo = React.useMemo, useEffect = React.useEffect;

  var ORD_KEY = 'fs:asta:ordine:';

  // ------------------------------------------------------------- utilità
  function norm(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function atletaDi(fis, s) { return s.atleti[fis] || { fis: fis, cognome: String(fis), nome: '' }; }
  function nomeA(fis, s) { return UI.nomeAtleta(atletaDi(fis, s)); }
  function qtDi(fis, s, d) {
    var st = d.statsAtleti[fis];
    var a = s.atleti[fis];
    var qi = st ? st.qtI : Math.max(1, Number(a && a.quotazione) || 1);
    return { qtI: qi, qtA: st ? st.qtA : qi };
  }
  function fmDi(st) {
    if (!st) return null;
    if (st.stagione && st.stagione.presenze) return st.stagione.fm;
    if (st.tutto && st.tutto.presenze) return st.tutto.fm;
    return null;
  }
  function fmTxt(fm) { return fm === null || fm === undefined ? '–' : UI.fmt(fm, 2); }
  function nCr(n) { return n + (Math.abs(Number(n)) === 1 ? ' credito' : ' crediti'); }
  function idsRosa(r) { return r ? r.rosa.map(function (x) { return x.id; }) : []; }
  /** Asta a copie: ogni atleta ha più copie, al massimo una per squadra. */
  function quote(d) { return d.settings.disponibilita === 'quote'; }
  /** Copie totali di ogni atleta con l'asta a copie (stesso calcolo di E.copieLibere). */
  function copieTot(d) { return E.copiePerAtleta(d.settings); }
  function possiede(team, fis, d) { return !!team && (d.proprietari[fis] || []).indexOf(team) >= 0; }
  function txtCopie(n, k) { return (n === 1 ? '1 copia libera' : n + ' copie libere') + ' su ' + k + (n === 1 ? ': è l\'ultima' : ''); }
  /** "copia 2 di 5": la copia che si assegnerebbe adesso. */
  function copiaN(fis, d) { return (d.proprietari[fis] || []).length + 1; }

  /**
   * Atleti chiamabili che corrispondono alla ricerca, per Qt.A decrescente: con copie ancora libere
   * (con la disponibilità singola: non in nessuna rosa) e che `perTeam`, se indicata, non ha già.
   */
  function cercaLiberi(s, d, q, ruolo, max, perTeam) {
    var nq = norm(q).trim();
    var out = [];
    // l'atleta del lotto aperto non è ancora assegnato, ma non si può chiamare di nuovo
    var inAsta = s.asta && s.asta.attiva && s.asta.lotto ? s.asta.lotto.atletaId : null;
    Object.values(s.atleti).forEach(function (a) {
      if (!a || !a.fis || a.attivo === false || a.fis === inAsta) return;
      var copie = FS.copieLibere(a.fis);
      if (!(copie > 0) || possiede(perTeam, a.fis, d)) return;
      var inf = UI.infoAtleta(a, d);
      if (ruolo && inf.ruolo !== ruolo) return;
      if (nq && norm(a.cognome + ' ' + a.nome).indexOf(nq) < 0 && norm(a.nome + ' ' + a.cognome).indexOf(nq) < 0) return;
      var qt = qtDi(a.fis, s, d);
      out.push({ fis: a.fis, a: a, inf: inf, qtA: qt.qtA, qtI: qt.qtI, fm: fmDi(d.statsAtleti[a.fis]), copie: copie });
    });
    out.sort(function (x, y) {
      var u = norm(x.a.cognome + ' ' + x.a.nome), v = norm(y.a.cognome + ' ' + y.a.nome);
      return y.qtA - x.qtA || (y.fm === null ? -99 : y.fm) - (x.fm === null ? -99 : x.fm) || (u < v ? -1 : u > v ? 1 : 0);
    });
    return { tot: out.length, lista: out.slice(0, max || 30) };
  }

  /** Ordine di chiamata valido: quello scelto (solo squadre esistenti) + le squadre nuove in coda. */
  function ordineCompleto(base, teamIds) {
    base = base || [];
    return base.filter(function (t) { return teamIds.indexOf(t) >= 0; }).concat(teamIds.filter(function (t) { return base.indexOf(t) < 0; }));
  }

  /** Conferma in-pagina: [nodo da rendere, ask({title, body, yes, danger, run})]. */
  function useConfirm() {
    var st = useState(null);
    var c = st[0], setC = st[1];
    var node = c ? html`<${UI.Confirm} title=${c.title} yes=${c.yes} danger=${c.danger}
      onNo=${function () { setC(null); }}
      onYes=${function () { var run = c.run; setC(null); Promise.resolve().then(function () { return run(); }).catch(function () { }); }}>${c.body}<//>` : null;
    return [node, function (o) { setC(o); }];
  }

  // ------------------------------------------------------ regole in breve
  function RegoleAsta() {
    var s = FS.useFS();
    var d = FS.derived();
    var S = d.settings;
    var lim = S.ruoliRosa || {};
    var vincoli = E.ORDINE_RUOLI.filter(function (r) { return lim[r]; });
    var Q = quote(d), K = copieTot(d);
    // consiglio su rosa e copie in base agli atleti attivi e alle squadre iscritte
    var nAtl = Object.values(s.atleti).filter(function (a) { return a && a.fis && a.attivo !== false; }).length;
    var nSq = d.teamIds.length;
    var cons = Q && nAtl && nSq ? E.quoteConsigliate(nAtl, nSq, S.titolari) : null;
    var diverso = !!cons && (cons.rosa !== S.rosa || cons.copie !== K);
    return html`<div class="stack" style=${{ gap: '10px' }}>
      <div class="ma-kpis">
        <div class="ma-kpi"><div class="v">${S.crediti}</div><div class="l">Crediti a squadra</div></div>
        <div class="ma-kpi"><div class="v">${S.rosa}</div><div class="l">Atleti in rosa (${S.titolari} + ${Math.max(0, S.rosa - S.titolari)})</div></div>
        <div class="ma-kpi"><div class="v">${S.offertaMinima}</div><div class="l">Offerta minima</div></div>
        <div class="ma-kpi"><div class="v">${S.timerAsta}s</div><div class="l">Timer per rilancio</div></div>
        ${Q ? html`<div class="ma-kpi"><div class="v">${K}</div><div class="l">Copie per atleta</div></div>` : null}
      </div>
      ${diverso ? html`<div class="banner small"><span>Consiglio per ${nAtl === 1 ? '1 atleta attivo' : nAtl + ' atleti attivi'} e ${nSq === 1 ? '1 squadra' : nSq + ' squadre'}: rose da <b>${cons.rosa}</b> atleti e <b>${cons.copie}</b> ${cons.copie === 1 ? 'copia' : 'copie'} per atleta (ora ${S.rosa} e ${K}).${d.isAdmin ? ' Puoi cambiarle dalle regole in Presidenza prima di avviare l\'asta.' : ''}</span></div>` : null}
      <ul class="small muted ma-rules">
        ${Q ? html`<li><b>Asta a copie</b>: ogni atleta in massimo ${K} ${K === 1 ? 'squadra' : 'squadre'}, mai due volte nella stessa. Così i più forti non finiscono tutti in una sola rosa.</li>` : null}
        <li>${Q ? 'A turno ogni squadra chiama un atleta che ha ancora copie libere (e che non ha già) e fa la prima offerta.' : 'A turno ogni squadra chiama un atleta svincolato e fa la prima offerta.'}</li>
        <li>${Q ? 'Possono rilanciare tutti tranne chi ha già quell\'atleta' : 'Tutti possono rilanciare'}: ogni rilancio fa ripartire il timer di ${S.timerAsta} secondi.</li>
        <li>${Q ? 'Allo scadere del tempo la copia va al miglior offerente; poi chiama la squadra successiva. Lo stesso atleta si può chiamare di nuovo finché restano copie.' : 'Allo scadere del tempo l\'atleta va al miglior offerente; poi chiama la squadra successiva.'}</li>
        <li>Devi sempre poter completare la rosa: puoi offrire al massimo i tuoi crediti meno ${S.offertaMinima} per ogni posto che resterà ancora libero.</li>
        <li>Chi ha già la rosa completa salta il turno di chiamata.</li>
        ${vincoli.length ? html`<li>Vincoli di ruolo: ${vincoli.map(function (r) { return E.RUOLI[r].label + ' da ' + lim[r][0] + ' a ' + lim[r][1]; }).join(', ')}.</li>` : null}
      </ul>
    </div>`;
  }

  // ------------------------------------------------- listone a budget fisso
  /** Nel listone non c'è l'asta: qui si vede come procede la composizione delle rose e il presidente avvia il campionato. */
  function AstaListone(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var cf = useConfirm();
    var S = d.settings;
    var R = S.rosa;
    var mia = d.miaRosa;
    var incomplete = d.teamIds.filter(function (t) { return d.rose[t] && d.rose[t].rosa.length < R; });
    var campionato = d.lega.stato === 'campionato';
    var g1 = d.prossima;
    function avvia() {
      cf[1]({
        title: 'Iniziare il campionato?', yes: 'Inizia il campionato',
        body: 'Le rose si chiudono: da qui in poi si compra e si svincola solo nelle sessioni di mercato aperte dal presidente, con un rimborso del ' + Math.round(S.rimborsoSvincolo * 100) + '% allo svincolo.'
          + (incomplete.length ? ' ' + (incomplete.length === 1 ? '1 squadra ha ancora la rosa incompleta: potrà completarla' : incomplete.length + ' squadre hanno ancora la rosa incompleta: potranno completarla') + ' al mercato.' : ''),
        run: function () { return FS.act.iniziaCampionato(); },
      });
    }
    var stato = campionato ? 'Il campionato è iniziato: le rose si ritoccano nelle sessioni di mercato aperte dal presidente.'
      : d.composizione ? 'Composizione delle rose aperta' + (g1 ? ' fino all\'avvio del campionato, al più tardi fino alla scadenza della ' + (g1.nome || 'giornata ' + g1.n) + ' (' + UI.dataOra(d.scadenza(g1)) + ').' : ' fino all\'avvio del campionato.') + ' Chi toglie un atleta riavrà tutti i crediti spesi.'
      : 'La composizione delle rose si è chiusa alla scadenza della prima giornata valida: da ora si compra e si svincola nelle sessioni di mercato.';
    return html`<div class="stack">
      <${UI.Card} title="Composizione delle rose" meta=${html`<${UI.ModalitaTag} settings=${S}/>`}
        footer=${html`<${React.Fragment}>
          <button class="btn ma-go" onClick=${function () { p.go('listone'); }}>Vai al listone</button>
          <button class="btn ghost ma-go2" onClick=${function () { p.go('mercato'); }}>Vai al mercato</button>
        <//>`}>
        <p style=${{ marginTop: 0 }}>${UI.modalita(S).breve}</p>
        <div class="ma-kpis">
          <div class="ma-kpi"><div class="v">${S.crediti}</div><div class="l">Budget per squadra</div></div>
          <div class="ma-kpi"><div class="v">${R}</div><div class="l">Atleti in rosa (${S.titolari} + ${Math.max(0, R - S.titolari)})</div></div>
          <div class="ma-kpi"><div class="v">${d.teamIds.length - incomplete.length}/${d.teamIds.length}</div><div class="l">Rose complete</div></div>
          ${mia ? html`<div class="ma-kpi"><div class="v">${mia.crediti}</div><div class="l">I tuoi crediti</div></div>` : null}
        </div>
        <div class=${'banner small' + (d.puoComprare ? '' : ' warn')} style=${{ marginTop: '12px', flexWrap: 'nowrap', alignItems: 'flex-start' }}><span class=${'lamp ' + (d.puoComprare ? 'v' : 's')} style=${{ flex: 'none', marginTop: '4px' }}></span><span>${stato}</span></div>
      <//>
      ${d.isAdmin && s.canWrite && !campionato ? html`<${UI.Card} title="Presidente" footer=${html`<button class="btn ok ma-go" onClick=${avvia}>Inizia il campionato</button>`}>
        <p class="small" style=${{ margin: 0 }}>Quando le rose sono pronte avvia il campionato: da lì si compra e si svincola solo nelle sessioni di mercato.${incomplete.length ? ' ' + (incomplete.length === 1 ? '1 rosa è ancora incompleta.' : incomplete.length + ' rose sono ancora incomplete.') : ''}</p>
      <//>` : null}
      <${UI.Card} title="Squadre" meta=${'rosa da ' + R}>
        ${d.teamIds.length ? html`<div class="list">${d.teamIds.map(function (t) {
          var r = d.rose[t];
          return html`<div class="li" key=${t}>
            <${UI.TeamMask} team=${s.squadre[t]} size=${34}/>
            <div class="body"><div class="title">${FS.nomeSquadra(t)}</div><div class="sub">${FS.nomeGiocatore(t)}${t === s.uid ? ' · tu' : ''} · ${r.crediti} crediti rimasti</div></div>
            <span class=${'tag ' + (r.rosa.length >= R ? 'green' : '')}>${r.rosa.length}/${R}</span>
          </div>`;
        })}</div>` : html`<div class="small muted">Ancora nessuna squadra: condividi il codice ${d.lega.codice}.</div>`}
      <//>
      ${cf[0]}
    </div>`;
  }

  // ------------------------------------------------------------ preparazione
  function Preparazione(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var cf = useConfirm();
    var stO = useState(function () {
      var prev = s.asta && s.asta.ordine;
      if (prev && prev.length) return prev;
      try { var x = JSON.parse(localStorage.getItem(ORD_KEY + s.legaId) || 'null'); if (Array.isArray(x)) return x; } catch (e) { }
      return null;
    });
    var ordine = ordineCompleto(stO[0], d.teamIds);
    var admin = d.isAdmin;

    function salva(o) { stO[1](o); try { localStorage.setItem(ORD_KEY + s.legaId, JSON.stringify(o)); } catch (e) { } }
    function mescola() {
      var o = ordine.slice();
      for (var i = o.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = o[i]; o[i] = o[j]; o[j] = t; }
      salva(o);
    }
    function sposta(i, dir) {
      var j = i + dir;
      if (j < 0 || j >= ordine.length) return;
      var o = ordine.slice(); var t = o[i]; o[i] = o[j]; o[j] = t;
      salva(o);
    }
    function avvia() {
      cf[1]({
        title: 'Avvii l\'asta?',
        yes: 'Avvia l\'asta',
        body: 'Tutte le squadre vedranno l\'asta in diretta. Il primo turno di chiamata è di ' + FS.nomeSquadra(ordine[0]) + '.',
        run: function () { return FS.act.avviaAsta(ordine); },
      });
    }

    return html`<div class="grid grid-main">
      <div class="stack">
        <${UI.Card} title=${admin ? 'Prepara l\'asta' : 'L\'asta non è ancora iniziata'} meta=${d.teamIds.length + (d.teamIds.length === 1 ? ' squadra iscritta' : ' squadre iscritte')}>
          ${d.lega.stato === 'campionato' ? html`<div class="banner small" style=${{ marginBottom: '10px' }}>Il campionato è già iniziato: l'asta online serve come asta di riparazione per chi ha la rosa incompleta.</div>` : null}
          ${!admin ? html`<p class="small" style=${{ marginTop: 0 }}>Il presidente avvierà l'asta quando ci saranno tutti. Tieni aperta questa pagina: il primo lotto comparirà da solo.</p>` : null}
          <${RegoleAsta}/>
        <//>
        ${admin ? html`<${UI.Card} title="Ordine di chiamata" right=${html`<button class="btn ghost sm" style=${{ marginLeft: 'auto' }} disabled=${ordine.length < 2} onClick=${mescola}>Mescola</button>`}
          footer=${html`<${React.Fragment}><${UI.AsyncBtn} disabled=${!s.canWrite || !ordine.length} onClick=${avvia}>Avvia l'asta<//><span class="tiny faint">${ordine.length < 2 ? 'Con una sola squadra non ci saranno rilanci: aspetta che entrino gli altri.' : 'Puoi metterla in pausa in qualunque momento.'}</span><//>`}>
          ${ordine.length ? html`<div class="list ma-order">${ordine.map(function (t, i) {
            return html`<div class="li" key=${t}>
              <span class="ma-n">${i + 1}</span>
              <${UI.TeamMask} team=${s.squadre[t]} size=${34}/>
              <div class="body"><div class="title">${FS.nomeSquadra(t)}</div><div class="sub">${FS.nomeGiocatore(t)}</div></div>
              <button class="iconbtn" aria-label=${'Sposta su ' + FS.nomeSquadra(t)} disabled=${i === 0} onClick=${function () { sposta(i, -1); }}>↑</button>
              <button class="iconbtn" aria-label=${'Sposta giù ' + FS.nomeSquadra(t)} disabled=${i === ordine.length - 1} onClick=${function () { sposta(i, 1); }}>↓</button>
            </div>`;
          })}</div>` : html`<${UI.Empty} title="Nessuna squadra">Condividi il codice ${d.lega.codice} per far entrare gli amici.<//>`}
        <//>` : null}
      </div>
      <div class="stack">
        <${UI.Card} title="Squadre iscritte" footer=${html`<${React.Fragment}><span class="small muted">Codice lega</span><span class="kbd" style=${{ fontSize: '15px', userSelect: 'all' }}>${d.lega.codice}</span><//>`}>
          ${d.teamIds.length ? html`<div class="list">${d.teamIds.map(function (t) {
            return html`<div class="li" key=${t}>
              <${UI.TeamMask} team=${s.squadre[t]} size=${34}/>
              <div class="body"><div class="title">${FS.nomeSquadra(t)}</div><div class="sub">${FS.nomeGiocatore(t)}${t === s.uid ? ' · tu' : ''}</div></div>
              <span class="tag">${d.rose[t] ? d.rose[t].rosa.length : 0}/${d.settings.rosa}</span>
            </div>`;
          })}</div>` : html`<div class="small muted">Ancora nessuna squadra.</div>`}
        <//>
        ${admin ? html`<${AstaDalVivo}/>` : null}
      </div>
      ${cf[0]}
    </div>`;
  }

  // -------------------------------------------------------------- lotto live
  function LottoLive() {
    var s = FS.useFS();
    var d = FS.derived();
    var now = FS.useTick(250);
    var stV = useState(''); var custom = stV[0];
    var stX = useState(false); var altra = stX[0], setAltra = stX[1];
    var phone = UI.useMq(UI.PHONE);
    var a = s.asta || {};
    var L = a.lotto;
    var lotN = L ? L.n : 0;
    useEffect(function () { stV[1](''); setAltra(false); }, [lotN]);
    UI.useRootClass('ma-live', !!(L && phone && d.rose[s.uid] && s.canWrite));
    if (!L) return null;

    var atl = atletaDi(L.atletaId, s);
    var inf = UI.infoAtleta(atl, d);
    var qt = qtDi(L.atletaId, s, d);
    var fm = fmDi(d.statsAtleti[L.atletaId]);
    var timer = Math.max(1, d.settings.timerAsta) * 1000;
    var pausa = !!a.pausa;
    var rem = Math.max(0, (L.scadenza || 0) - now);
    var scaduto = !pausa && rem <= 0;
    var pct = pausa ? 1 : Math.max(0, Math.min(1, rem / timer));
    var hot = !pausa && rem < 5000;
    var secs = Math.ceil(rem / 1000);
    var team = s.squadre[L.offerente];
    var mia = d.rose[s.uid];
    var R = d.settings.rosa;
    var cap = mia ? E.offertaMassima(mia, d.settings, atl, s.atleti, d.stagione) : 0;
    var sonoIo = L.offerente === s.uid;
    // asta a quote: chi ha già l'atleta non può rilanciare
    var Q = quote(d), K = copieTot(d);
    var gia = d.proprietari[L.atletaId] || [];
    var giaMio = possiede(s.uid, L.atletaId, d);
    var bloccato = !mia || !s.canWrite || sonoIo || giaMio || pausa || scaduto;
    var customN = Math.floor(Number(custom));
    var customOk = custom !== '' && customN > L.offerta && customN <= cap;

    var msg;
    if (!mia) msg = html`<span class="muted">Stai seguendo l'asta da spettatore.</span>`;
    else if (!s.canWrite) msg = html`<span class="muted">Sei in sola lettura: non puoi rilanciare.</span>`;
    else if (giaMio) msg = html`<span><b>Hai già questo atleta</b>: non puoi rilanciare.</span>`;
    else if (sonoIo) msg = html`<span class="muted">Sei in testa: se qualcuno rilancia potrai rispondere.</span>`;
    else if (cap <= L.offerta) msg = html`<span class="muted">Non puoi rilanciare: ${mia.rosa.length >= R ? 'la tua rosa è completa.' : cap > 0 ? 'puoi offrire al massimo ' + nCr(cap) + '.' : 'questo atleta non rispetterebbe i vincoli di ruolo o i crediti della tua rosa.'}</span>`;
    else msg = html`<span>Puoi offrire al massimo <b>${cap}</b> ${cap === 1 ? 'credito' : 'crediti'} <span class="muted">(ne hai ${mia.crediti}; dopo questo ${R - mia.rosa.length - 1 === 1 ? 'resta 1 posto da riempire' : 'restano ' + Math.max(0, R - mia.rosa.length - 1) + ' posti da riempire'})</span>.</span>`;

    function rilanci(cls) {
      return [1, 5, 10].map(function (inc) {
        var v = L.offerta + inc;
        return html`<${UI.AsyncBtn} key=${inc} cls=${cls} busy="…" disabled=${bloccato || v > cap} title=${'Offri ' + nCr(v)} onClick=${function () { return FS.act.rilancia(v); }}>+${inc} <span class="ma-inc-v">· ${v}</span><//>`;
      });
    }
    var formOfferta = html`<form class="ma-bids ma-bb-f" onSubmit=${function (e) { e.preventDefault(); }}>
      <${UI.Field} id="asta-rilancio" label="La tua offerta">
        <input id="asta-rilancio" class="input num" type="number" inputMode="numeric" pattern="[0-9]*" enterKeyHint="send" step="1" min=${L.offerta + 1} max=${Math.max(cap, L.offerta + 1)} placeholder=${String(L.offerta + 1)} value=${custom} disabled=${bloccato} onInput=${function (e) { stV[1](e.target.value); }}/>
      <//>
      <${UI.AsyncBtn} disabled=${bloccato || !customOk} onClick=${function () { return FS.act.rilancia(customN).then(function () { stV[1](''); }); }}>${customOk ? 'Offri ' + customN : 'Offri'}<//>
    </form>`;
    var anello = function (cls) {
      return html`<div class=${'timer-ring' + (hot ? ' hot' : '') + (cls ? ' ' + cls : '')} style=${{ '--p': pct }} role="timer" aria-label=${pausa ? 'Timer in pausa' : secs + ' secondi rimasti'}><span>${pausa ? '‖' : secs}</span></div>`;
    };
    // telefono: offerta, timer e rilanci sempre sotto il pollice. «nota»: il messaggio dice perché non si può rilanciare
    // (sui telefoni stretti si mostra solo allora, al posto dei rilanci; altrimenti timer, offerta e rilanci stanno su una riga)
    var nota = pausa || scaduto || (!sonoIo && (bloccato || cap <= L.offerta));
    var barra = phone && mia && s.canWrite ? html`<div class=${'ma-bidbar' + (nota ? ' ma-bb-no' : '')} role="region" aria-label="Rilanci">
      ${anello('mini')}
      <div class="ma-bb-t">
        <div class="ma-bb-o"><b class="num">${L.offerta}</b> <span class="ma-ellip">${sonoIo ? 'la tua offerta' : FS.nomeSquadra(L.offerente)}</span></div>
        <div class="tiny ma-bb-m">${scaduto ? 'Aggiudicazione in corso…' : pausa ? 'Asta in pausa' : msg}</div>
      </div>
      ${scaduto || pausa ? null : html`<div class="ma-incs">${rilanci('ghost ma-inc')}<button type="button" class="btn ghost ma-inc" aria-expanded=${altra ? 'true' : 'false'} disabled=${bloccato} onClick=${function () { setAltra(!altra); }}>${altra ? 'Chiudi' : 'Altro'}</button></div>`}
      ${altra && !scaduto && !pausa ? formOfferta : null}
    </div>` : null;

    return html`<${UI.Card} cls=${barra ? 'ma-has-bar' : ''} title=${'Lotto n. ' + L.n} meta=${'Chiamato da ' + FS.nomeSquadra(L.chiamante) + ' · ' + (L.rilanci || 0) + (L.rilanci === 1 ? ' rilancio' : ' rilanci')}>
      <div class="lot">
        <${UI.AtletaMask} atleta=${atl} size=${phone ? 64 : 88}/>
        <div style=${{ minWidth: 0 }}>
          <div class="eyebrow">${inf.catLabel} · ${atl.anno || '—'}</div>
          <div class="ma-lotname"><button class="ma-name" onClick=${function () { UI.openAtleta(L.atletaId); }}>${UI.nomeAtleta(atl)}</button></div>
          <div class="row" style=${{ gap: '6px' }}>
            <${UI.Role} ruolo=${inf.ruolo}/>
            <span class="tag">Qt.I ${qt.qtI}</span>
            <span class="tag blue">Qt.A ${qt.qtA}</span>
            <span class="tag">FM ${fmTxt(fm)}</span>
            ${Q ? html`<span class="tag gold">Copia ${gia.length + 1} di ${K}</span>` : null}
            ${giaMio ? html`<span class="tag blue">Già tuo</span>` : null}
          </div>
          ${Q && gia.length ? html`<div class="row ma-owners">
            <span class="tiny faint">Ce l'hanno già, non possono rilanciare:</span>
            ${gia.map(function (t) { return html`<span key=${t} class=${'tag' + (t === s.uid ? ' blue' : '')}>${FS.nomeSquadra(t)}</span>`; })}
          </div>` : null}
        </div>
        <div class="bidbox ma-bidbox">
          ${anello('')}
          <div style=${{ minWidth: 0 }}>
            <div class="eyebrow">Offerta attuale</div>
            <div class="bid-amount">${L.offerta}</div>
            <div class="row" style=${{ gap: '6px', marginTop: '4px', flexWrap: 'nowrap' }}>
              <${UI.TeamMask} team=${team} size=${26} noLabel=${true}/>
              <span class="small ma-ellip"><b>${FS.nomeSquadra(L.offerente)}</b></span>
            </div>
            ${sonoIo ? html`<span class="tag green" style=${{ marginTop: '4px' }}>Sei il miglior offerente</span>` : null}
          </div>
        </div>
      </div>
      ${scaduto ? html`<div class="banner" style=${{ marginTop: '14px', justifyContent: 'center' }}><span class="lamp v"></span><b>Aggiudicazione in corso…</b></div>`
        : pausa ? html`<div class="banner warn small" style=${{ marginTop: '14px' }}>Asta in pausa: i rilanci riprendono quando il presidente fa ripartire il timer.</div>`
        : mia && s.canWrite && !phone ? html`<div class="stack" style=${{ gap: '10px', marginTop: '14px' }}>
          <div class="ma-bids">${rilanci('ghost')}</div>
          ${formOfferta}
          <div class="small">${msg}</div>
        </div>`
        : html`<div class="small" style=${{ marginTop: '14px' }}>${msg}</div>`}
      ${barra}
    <//>`;
  }

  // ---------------------------------------------------------------- chiamata
  function Chiamata() {
    var s = FS.useFS();
    var d = FS.derived();
    var stQ = useState(''); var q = stQ[0];
    var stR = useState(''); var ruolo = stR[0];
    var stS = useState(null); var sel = stS[0];
    var stO = useState(String(Math.max(d.settings.offertaMinima, 1))); var off = stO[0];
    var stN = useState(12); var quanti = stN[0];
    var phone = UI.useMq(UI.PHONE);
    var a = s.asta || {};
    var chiamante = a.ordine ? a.ordine[a.turno] || null : null;
    var tocca = !!chiamante && chiamante === s.uid;
    var puo = !!chiamante && (tocca || d.isAdmin) && s.canWrite;
    // solo atleti con copie libere che la squadra di turno non ha già
    var res = useMemo(function () { return puo ? cercaLiberi(s, d, q, ruolo, 30, chiamante) : { tot: 0, lista: [] }; }, [s.version, q, ruolo, puo, chiamante]);
    var offDefault = String(Math.max(d.settings.offertaMinima, 1));
    // a ogni cambio di turno si riparte da zero: nessun atleta scelto, offerta minima
    useEffect(function () { stS[1](null); stO[1](offDefault); }, [a.turno, a.nLotti]);
    var conBarra = !!(phone && puo && sel && s.atleti[sel]);
    UI.useRootClass('ma-live', conBarra);

    var rT = chiamante ? d.rose[chiamante] : null;
    var R = d.settings.rosa;
    var Q = quote(d), K = copieTot(d);
    var selA = sel && s.atleti[sel] && FS.copieLibere(sel) > 0 && !possiede(chiamante, sel, d) ? s.atleti[sel] : null;
    var cap = selA && rT ? E.offertaMassima(rT, d.settings, selA, s.atleti, d.stagione) : 0;
    var offN = Math.floor(Number(off) || 0);
    var min = d.settings.offertaMinima;
    var chi = tocca ? 'te' : FS.nomeSquadra(chiamante);
    var errore = !selA ? '' : a.pausa ? 'L\'asta è in pausa.'
      : offN < min ? 'L\'offerta minima è ' + min + '.'
      : offN > cap ? (cap > 0 ? 'Il massimo per ' + chi + ' è ' + nCr(cap) + '.' : 'Questo atleta non entra nella rosa di ' + chi + ' (posti, ruoli o crediti).') : '';
    async function chiama() { await FS.act.chiamaAtleta(selA.fis, offN); stS[1](null); stO[1](offDefault); }
    // ultima aggiudicazione, se il presidente non l'ha annullata
    var ultimo = a.ultimo && a.ultimo.atletaId && !s.movimenti.some(function (m) { return m.id === 'asta-' + a.ultimo.n && m.annullato; }) ? a.ultimo : null;

    return html`<${UI.Card} title="Chiamata" meta=${'Lotti battuti: ' + (a.nLotti || 0)}>
      ${ultimo && ultimo.atletaId ? html`<div class="banner small" style=${{ marginBottom: '12px' }}><span class="lamp v"></span><span>Lotto ${ultimo.n}: <b>${UI.nomeAtleta(atletaDi(ultimo.atletaId, s))}</b> va a ${FS.nomeSquadra(ultimo.teamId)} per <b>${ultimo.prezzo}</b> ${ultimo.prezzo === 1 ? 'credito' : 'crediti'}.</span></div>` : null}
      ${chiamante ? html`<div class="row" style=${{ gap: '12px', flexWrap: 'nowrap' }}>
          <${UI.TeamMask} team=${s.squadre[chiamante]} size=${56}/>
          <div class="grow">
            <div class="eyebrow">Turno di chiamata</div>
            <div class="ma-lotname">${tocca ? 'Tocca a te!' : 'Tocca a ' + FS.nomeSquadra(chiamante)}</div>
            <div class="small muted">${tocca ? (Q ? 'Scegli un atleta con copie libere che non hai già e fai la prima offerta.' : 'Scegli un atleta svincolato e fai la prima offerta.') : d.isAdmin ? 'Da presidente puoi chiamare per conto di questa squadra (ad esempio se non è collegata).' : 'In attesa che chiami un atleta…'}</div>
          </div>
        </div>` : html`<div class="small muted">Nessuna squadra deve ancora chiamare: le rose sono complete. Il presidente può chiudere l'asta.</div>`}
      ${rT && rT.rosa.length >= R ? html`<div class="banner warn small" style=${{ marginTop: '10px' }}>La rosa di ${FS.nomeSquadra(chiamante)} è già completa: il presidente può saltare il turno.</div>` : null}
      ${puo ? html`<div class="stack" style=${{ gap: '10px', marginTop: '14px' }}>
        <div class="ma-filters">
          <${UI.Field} id="asta-cerca" label=${Q ? 'Cerca un atleta' : 'Cerca uno svincolato'}><input id="asta-cerca" type="search" class="input" placeholder="Cognome o nome" value=${q} onInput=${function (e) { stQ[1](e.target.value); }}/><//>
          <${UI.Field} id="asta-ruolo" label="Ruolo">
            <select id="asta-ruolo" class="input" value=${ruolo} onChange=${function (e) { stR[1](e.target.value); }}>
              <option value="">Tutti</option>
              ${E.ORDINE_RUOLI.map(function (r) { return html`<option key=${r} value=${r}>${E.RUOLI[r].label}</option>`; })}
            </select>
          <//>
        </div>
        <div class="tiny faint">${Q
          ? res.tot + (res.tot === 1 ? ' atleta con copie libere' : ' atleti con copie libere') + (tocca ? ' che non hai già' : ' che ' + FS.nomeSquadra(chiamante) + ' non ha già')
          : res.tot + (res.tot === 1 ? ' svincolato' : ' svincolati')}${res.tot > res.lista.length ? ' · i primi ' + res.lista.length + ' per quotazione' : ''}</div>
        ${res.lista.length ? html`<div class="list ma-results">${(phone ? res.lista.slice(0, quanti) : res.lista).map(function (r) {
          var on = sel === r.fis;
          return html`<div class=${'li ma-pick' + (on ? ' ma-sel' : '')} key=${r.fis}>
            <button type="button" class="ma-pick-b" aria-pressed=${on ? 'true' : 'false'} onClick=${function () { stS[1](on ? null : r.fis); }}>
              <${UI.AtletaMask} atleta=${r.a} size=${34}/>
              <span class="body">
                <span class="ma-name">${UI.nomeAtleta(r.a)}</span>
                <span class="sub">${r.inf.catLabel} · ${r.a.anno || '—'} · FM ${fmTxt(r.fm)} · Qt.A ${r.qtA}</span>
                ${Q ? html`<span class=${'tiny ma-copie' + (r.copie === 1 ? ' ultima' : '')}>${txtCopie(r.copie, K)}</span>` : null}
              </span>
              <${UI.Role} ruolo=${r.inf.ruolo}/>
              <span class=${'tag ma-pick-t' + (on ? ' blue' : '')}>${on ? 'Scelto' : 'Scegli'}</span>
            </button>
            <button type="button" class="iconbtn ma-info" aria-label=${'Scheda di ' + UI.nomeAtleta(r.a)} title="Scheda atleta" onClick=${function () { UI.openAtleta(r.fis); }}>i</button>
          </div>`;
        })}</div>` : html`<div class="small muted">${Q ? 'Nessun atleta con copie libere corrisponde alla ricerca.' : 'Nessuno svincolato corrisponde alla ricerca.'}</div>`}
        ${phone && res.lista.length > quanti ? html`<button type="button" class="btn ghost block" onClick=${function () { stN[1](quanti + 12); }}>Mostra altri (${res.lista.length - quanti})</button>` : null}
        ${selA && !phone ? html`<div class="banner" style=${{ alignItems: 'flex-end' }}>
          <div class="grow" style=${{ minWidth: '160px' }}>
            <div class="eyebrow">Atleta chiamato</div>
            <div><b>${UI.nomeAtleta(selA)}</b> <span class="small muted">Qt.A ${qtDi(selA.fis, s, d).qtA}${Q ? ' · copia ' + copiaN(selA.fis, d) + ' di ' + K : ''}</span></div>
            <div class=${'tiny ' + (errore ? '' : 'faint')}>${errore || 'Massimo per ' + chi + ': ' + nCr(cap) + '.'}</div>
          </div>
          <form class="ma-bids" onSubmit=${function (e) { e.preventDefault(); }}>
            <${UI.Field} id="asta-prima-offerta" label="Prima offerta">
              <input id="asta-prima-offerta" class="input num" type="number" inputMode="numeric" pattern="[0-9]*" enterKeyHint="send" step="1" min=${min} max=${Math.max(cap, min)} value=${off} onInput=${function (e) { stO[1](e.target.value); }}/>
            <//>
            <${UI.AsyncBtn} disabled=${!!errore} onClick=${chiama}>Chiama a ${offN}<//>
          </form>
        </div>` : selA ? null : html`<div class="small muted">Scegli un atleta dall'elenco per chiamarlo all'asta.</div>`}
        ${selA && phone ? html`<div class="ma-bidbar ma-callbar" role="region" aria-label="Chiamata">
          <div class="ma-bb-t">
            <div class="ma-bb-o"><span class="ma-ellip"><b>${UI.nomeAtleta(selA, true)}</b></span></div>
            <div class=${'tiny ' + (errore ? 'ma-err' : 'muted')}>${errore || 'Qt.A ' + qtDi(selA.fis, s, d).qtA + (Q ? ' · copia ' + copiaN(selA.fis, d) + ' di ' + K : '') + ' · max ' + cap}</div>
          </div>
          <button type="button" class="iconbtn" aria-label="Annulla la scelta" onClick=${function () { stS[1](null); }}>✕</button>
          <form class="ma-step" onSubmit=${function (e) { e.preventDefault(); }}>
            <button type="button" class="iconbtn" aria-label="Offerta meno 1" disabled=${offN <= min} onClick=${function () { stO[1](String(Math.max(min, offN - 1))); }}>−</button>
            <label class="sr-only" htmlFor="asta-prima-offerta">Prima offerta</label>
            <input id="asta-prima-offerta" class="input num" type="number" inputMode="numeric" pattern="[0-9]*" enterKeyHint="send" step="1" min=${min} max=${Math.max(cap, min)} value=${off} onInput=${function (e) { stO[1](e.target.value); }}/>
            <button type="button" class="iconbtn" aria-label="Offerta più 1" disabled=${offN >= cap} onClick=${function () { stO[1](String(offN + 1)); }}>+</button>
            <${UI.AsyncBtn} cls="ma-chiama" disabled=${!!errore} onClick=${chiama}>Chiama a ${offN}<//>
          </form>
        </div>` : null}
      </div>` : null}
    <//>`;
  }

  // ---------------------------------------------------------- tabella squadre
  function SquadreAsta() {
    var s = FS.useFS();
    var d = FS.derived();
    var a = s.asta || {};
    var ord = (a.ordine || []).filter(function (t) { return d.rose[t]; });
    var tutte = ord.concat(d.teamIds.filter(function (t) { return ord.indexOf(t) < 0; }));
    var turno = a.attiva && a.ordine ? a.ordine[a.turno] : null;
    var R = d.settings.rosa;
    return html`<${UI.Card} title="Squadre" meta=${'rosa da ' + R} flush=${true}>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th class="c">#</th><th>Squadra</th><th class="r">Crediti</th><th class="r">Rosa</th><th class="r" title="Offerta più alta che la squadra può fare ora">Max</th><th class="c ma-hide-xs" title="Under 14 · Under 20 · Senior">Ruoli</th></tr></thead>
        <tbody>${tutte.map(function (t) {
          var r = d.rose[t];
          var c = E.contaRuoli(idsRosa(r), s.atleti, d.stagione);
          var i = ord.indexOf(t);
          return html`<tr key=${t} class=${(t === s.uid ? 'ma-me' : '') + (t === turno ? ' ma-turn' : '')}>
            <td class="c">${i >= 0 ? i + 1 : '–'}</td>
            <td><div class="row" style=${{ gap: '6px', flexWrap: 'nowrap' }}>
              <${UI.TeamMask} team=${s.squadre[t]} size=${26} noLabel=${true}/>
              <span class="ma-sq-t"><span class="ma-ellip">${FS.nomeSquadra(t)}</span><span class="ma-only-xs tiny"><span class="ma-rc U14">${c.U14}</span>·<span class="ma-rc U20">${c.U20}</span>·<span class="ma-rc SEN">${c.SEN}</span></span></span>
              ${t === turno ? html`<span class="lamp v" title="Turno di chiamata"></span>` : null}
            </div></td>
            <td class="r">${r.crediti}</td>
            <td class="r">${r.rosa.length}/${R}</td>
            <td class="r"><b>${E.offertaMassima(r, d.settings)}</b></td>
            <td class="c ma-hide-xs" style=${{ whiteSpace: 'nowrap' }}><span class="ma-rc U14">${c.U14}</span>·<span class="ma-rc U20">${c.U20}</span>·<span class="ma-rc SEN">${c.SEN}</span></td>
          </tr>`;
        })}</tbody>
      </table></div>
      <div class="card-b tiny faint" style=${{ paddingTop: '8px' }}>Ruoli: <span class="ma-rc U14">U14</span> · <span class="ma-rc U20">U20</span> · <span class="ma-rc SEN">SEN</span>. Max = offerta più alta possibile adesso, lasciando ${d.settings.offertaMinima} ${d.settings.offertaMinima === 1 ? 'credito' : 'crediti'} per ogni posto ancora libero.</div>
    <//>`;
  }

  // ------------------------------------------------------ storico aggiudicazioni
  function StoricoAsta() {
    var s = FS.useFS();
    var d = FS.derived();
    var stT = useState(false); var tutti = stT[0];
    var lista = useMemo(function () {
      return s.movimenti.filter(function (m) { return m.tipo === 'asta'; })
        .sort(function (x, y) { return (y.at || 0) - (x.at || 0) || (y.lotto || 0) - (x.lotto || 0); });
    }, [s.version]);
    var vis = tutti ? lista : lista.slice(0, 12);
    var valide = lista.filter(function (m) { return !m.annullato; }).length;
    return html`<${UI.Card} title="Aggiudicazioni" meta=${lista.length ? valide + (valide === 1 ? ' atleta aggiudicato' : ' atleti aggiudicati') : ''} flush=${lista.length > 0}
      footer=${lista.length > 12 ? html`<button class="linkbtn" style=${{ margin: '0 auto' }} onClick=${function () { stT[1](!tutti); }}>${tutti ? 'Mostra solo le ultime' : 'Mostra tutte (' + lista.length + ')'}</button>` : null}>
      ${lista.length ? html`<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th class="r">Lotto</th><th>Atleta</th><th>Squadra</th><th class="r">Prezzo</th><th class="r ma-hide-xs">Rilanci</th></tr></thead>
        <tbody>${vis.map(function (m) {
          // tutta la riga apre la scheda (il nome resta un pulsante per la tastiera: il clic risale alla riga)
          return html`<tr key=${m.id} class=${'click' + (m.annullato ? ' ma-strike' : '') + (m.teamId === s.uid ? ' ma-me' : '')} onClick=${function () { UI.openAtleta(m.atletaId); }}>
            <td class="r">${m.lotto || '–'}</td>
            <td><button class="ma-name">${UI.nomeAtleta(atletaDi(m.atletaId, s), true)}</button>${m.annullato ? html`<span class="tag">annullata</span>` : null}</td>
            <td>${FS.nomeSquadra(m.teamId)}</td>
            <td class="r"><b>${m.prezzo}</b></td>
            <td class="r ma-hide-xs">${m.rilanci || 0}</td>
          </tr>`;
        })}</tbody>
      </table></div>` : html`<div class="small muted">Ancora nessun atleta aggiudicato.</div>`}
    <//>`;
  }

  // ------------------------------------------------------ comandi presidente
  function ComandiPresidente() {
    var s = FS.useFS();
    var d = FS.derived();
    var cf = useConfirm();
    var ultimo = useMemo(function () {
      return s.movimenti.filter(function (m) { return !m.annullato && String(m.id).indexOf('asta-') === 0; })
        .sort(function (x, y) { return (y.at || 0) - (x.at || 0); })[0] || null;
    }, [s.version]);
    var a = s.asta || {};
    var no = !s.canWrite;
    var turnoDi = a.ordine ? a.ordine[a.turno] : null;
    var incomplete = d.teamIds.filter(function (t) { return d.rose[t] && d.rose[t].rosa.length < d.settings.rosa; });
    var Q = quote(d);

    function salta() {
      cf[1]({ title: 'Saltare il turno?', yes: 'Salta turno', body: 'Il turno di chiamata passa da ' + FS.nomeSquadra(turnoDi) + ' alla prossima squadra con la rosa incompleta.', run: function () { return FS.act.saltaTurno(); } });
    }
    function annullaLotto() {
      cf[1]({ title: 'Annullare il lotto?', yes: 'Annulla il lotto', danger: true, body: 'Il lotto di ' + nomeA(a.lotto.atletaId, s) + ' viene annullato senza assegnazione: ' + (Q ? 'la copia resta libera' : 'l\'atleta resta tra gli svincolati') + ' e il turno di chiamata non cambia.', run: function () { return FS.act.annullaLotto(); } });
    }
    function annullaUltima() {
      var chi = FS.nomeSquadra(ultimo.teamId);
      cf[1]({ title: 'Annullare l\'ultima aggiudicazione?', yes: 'Annulla aggiudicazione', danger: true, body: 'Lotto ' + (ultimo.lotto || '') + ': ' + nomeA(ultimo.atletaId, s) + (Q ? ' esce dalla rosa di ' + chi + ' (la copia torna libera) e la squadra recupera ' : ' torna svincolato/a e ' + chi + ' recupera ') + nCr(ultimo.prezzo) + '. Il turno di chiamata non cambia.', run: function () { return FS.act.annullaMovimento(ultimo.id); } });
    }
    function termina() {
      cf[1]({
        title: 'Terminare l\'asta?', yes: 'Termina l\'asta', danger: true,
        body: (d.lega.stato === 'campionato' ? 'L\'asta si chiude per tutti.' : 'L\'asta si chiude per tutti e inizia il campionato.') + (a.lotto ? ' Il lotto in corso viene annullato.' : '') + (incomplete.length ? ' ' + (incomplete.length === 1 ? '1 squadra ha ancora la rosa incompleta: potrà completarla' : incomplete.length + ' squadre hanno ancora la rosa incompleta: potranno completarla') + ' al mercato ' + (Q ? 'con le copie rimaste.' : 'degli svincolati.') : ''),
        run: function () { return FS.act.terminaAsta(); },
      });
    }

    return html`<${UI.Card} title="Comandi del presidente">
      <div class="row ma-cmds" style=${{ gap: '8px' }}>
        <${UI.AsyncBtn} cls=${'sm ma-cmd-main ' + (a.pausa ? 'ok' : 'ghost')} disabled=${no} onClick=${function () { return FS.act.pausaAsta(!a.pausa); }}>${a.pausa ? 'Riprendi' : 'Pausa'}<//>
        <button class=${'btn sm ghost' + (no || !!a.lotto || !turnoDi ? ' ma-cmd-off' : '')} disabled=${no || !!a.lotto || !turnoDi} onClick=${salta}>Salta turno</button>
        <button class=${'btn sm ghost' + (no || !a.lotto ? ' ma-cmd-off' : '')} disabled=${no || !a.lotto} onClick=${annullaLotto}>Annulla lotto</button>
        <button class=${'btn sm ghost' + (no || !ultimo ? ' ma-cmd-off' : '')} disabled=${no || !ultimo} onClick=${annullaUltima}>Annulla ultima aggiudicazione</button>
        <button class="btn sm danger ma-cmd-end" disabled=${no} onClick=${termina}>Termina asta</button>
      </div>
      <p class="tiny faint" style=${{ marginBottom: 0 }}>${ultimo ? 'Ultima aggiudicazione: ' + nomeA(ultimo.atletaId, s) + ' a ' + FS.nomeSquadra(ultimo.teamId) + ' per ' + ultimo.prezzo + '. ' : ''}La pausa ferma il timer; alla ripresa il lotto riparte da ${d.settings.timerAsta} secondi.</p>
      ${cf[0]}
    <//>`;
  }

  // --------------------------------------------------------- asta dal vivo
  function AstaDalVivo() {
    var s = FS.useFS();
    var d = FS.derived();
    var stT = useState(''); var team = stT[0];
    var stQ = useState(''); var q = stQ[0];
    var stS = useState(null); var sel = stS[0];
    var stP = useState(''); var prezzo = stP[0];
    // atleti con copie libere che la squadra scelta non ha già
    var res = useMemo(function () { return norm(q).trim().length >= 2 ? cercaLiberi(s, d, q, '', 8, team || null) : { tot: 0, lista: [] }; }, [s.version, q, team]);
    var R = d.settings.rosa;
    var lim = d.settings.ruoliRosa || {};
    var Q = quote(d), K = copieTot(d);
    var t = team ? d.rose[team] : null;
    var selA = sel && s.atleti[sel] && FS.copieLibere(sel) > 0 ? s.atleti[sel] : null;
    // l'atleta del lotto aperto si assegna solo alla chiusura del lotto (l'assegnazione manuale la renderebbe non valida)
    var inAsta = s.asta && s.asta.attiva && s.asta.lotto ? s.asta.lotto.atletaId : null;
    var pN = Math.floor(Number(prezzo));
    var err = !t ? 'Scegli la squadra.'
      : !selA ? 'Cerca e scegli l\'atleta.'
      : selA.fis === inAsta ? UI.nomeAtleta(selA) + ' è all\'asta in questo momento: aspetta la fine del lotto.'
      : possiede(team, selA.fis, d) ? FS.nomeSquadra(team) + ' ha già ' + UI.nomeAtleta(selA) + ': scegli un altro atleta.'
      : t.rosa.length >= R ? 'La rosa di ' + FS.nomeSquadra(team) + ' è già completa.'
      : prezzo === '' || !(pN >= 0) ? 'Indica il prezzo di aggiudicazione.'
      : pN > t.crediti ? FS.nomeSquadra(team) + ' ha solo ' + nCr(t.crediti) + '.' : '';
    var max = t && selA ? E.offertaMassima(t, d.settings, selA, s.atleti, d.stagione) : null;
    var avviso = !err && max !== null && pN > max ? 'Supera il massimo consigliato (' + max + '): la squadra potrebbe non riuscire a completare la rosa.' : '';
    async function assegna() {
      await FS.act.assegnaManuale(team, selA.fis, pN, 'manuale');
      stS[1](null); stQ[1](''); stP[1]('');
    }

    var bisogni = d.teamIds.map(function (id) {
      var r = d.rose[id];
      var c = E.contaRuoli(idsRosa(r), s.atleti, d.stagione);
      var mins = Object.keys(lim).filter(function (k) { return lim[k] && c[k] < lim[k][0]; }).map(function (k) { return (lim[k][0] - c[k]) + ' ' + k; });
      return { id: id, manc: R - r.rosa.length, crediti: r.crediti, max: E.offertaMassima(r, d.settings), mins: mins };
    });

    return html`<${UI.Card} title="Asta dal vivo" meta="solo presidente">
      <p class="small muted" style=${{ marginTop: 0 }}>Se fate l'asta di persona, in sala, registra qui ogni aggiudicazione: squadra, atleta e prezzo battuto.</p>
      <div class="stack" style=${{ gap: '10px' }}>
        <${UI.Field} id="vivo-squadra" label="Squadra">
          <select id="vivo-squadra" class="input" value=${team} onChange=${function (e) { stT[1](e.target.value); }}>
            <option value="">Scegli la squadra…</option>
            ${d.teamIds.map(function (id) { return html`<option key=${id} value=${id}>${FS.nomeSquadra(id)} · ${d.rose[id].rosa.length}/${R} · ${d.rose[id].crediti} cr</option>`; })}
          </select>
        <//>
        <${UI.Field} id="vivo-cerca" label="Atleta" help=${Q ? 'Solo atleti con copie libere che la squadra scelta non ha già.' : null}>
          <input id="vivo-cerca" type="search" class="input" placeholder="Scrivi almeno 2 lettere" value=${q} onInput=${function (e) { stQ[1](e.target.value); }}/>
        <//>
        ${res.lista.length ? html`<div class="list">${res.lista.map(function (r) {
          var on = sel === r.fis;
          return html`<div class=${'li' + (on ? ' ma-sel' : '')} key=${r.fis} style=${{ padding: '6px 2px' }}>
            <${UI.Role} ruolo=${r.inf.ruolo}/>
            <div class="body"><div class="title small">${UI.nomeAtleta(r.a)}</div><div class="sub tiny">${r.inf.catLabel} · Qt.A ${r.qtA}${Q ? html`<${React.Fragment}> · <span class=${'ma-copie' + (r.copie === 1 ? ' ultima' : '')}>${txtCopie(r.copie, K)}</span><//>` : null}</div></div>
            <button class=${'btn xs' + (on ? '' : ' ghost')} aria-pressed=${on} onClick=${function () { stS[1](on ? null : r.fis); if (!on && prezzo === '') stP[1](String(r.qtA)); }}>${on ? 'Scelto' : 'Scegli'}</button>
          </div>`;
        })}</div>` : norm(q).trim().length >= 2 ? html`<div class="small muted">${Q ? 'Nessun atleta con copie libere trovato' + (team ? ' per questa squadra.' : '.') : 'Nessuno svincolato trovato.'}</div>` : null}
        ${selA ? html`<div class="small">Atleta: <b>${UI.nomeAtleta(selA)}</b>${Q ? ' (copia ' + copiaN(selA.fis, d) + ' di ' + K + ')' : ''}${t ? html`<${React.Fragment}> → <b>${FS.nomeSquadra(team)}</b><//>` : null}</div>` : null}
        <form class="ma-bids" onSubmit=${function (e) { e.preventDefault(); }}>
          <${UI.Field} id="vivo-prezzo" label="Prezzo">
            <input id="vivo-prezzo" class="input num" type="number" inputMode="numeric" pattern="[0-9]*" min="0" step="1" value=${prezzo} onInput=${function (e) { stP[1](e.target.value); }}/>
          <//>
          <${UI.AsyncBtn} disabled=${!!err || !s.canWrite} onClick=${assegna}>Assegna<//>
        </form>
        ${err && (team || sel || prezzo) ? html`<div class="tiny faint">${err}</div>` : null}
        ${avviso ? html`<div class="banner warn small">${avviso}</div>` : null}
      </div>
      <div class="eyebrow" style=${{ marginTop: '16px' }}>Cosa manca a ogni squadra</div>
      <div class="list">${bisogni.map(function (b) {
        return html`<div class="li" key=${b.id} style=${{ padding: '6px 2px' }}>
          <${UI.TeamMask} team=${s.squadre[b.id]} size=${26} noLabel=${true}/>
          <div class="body">
            <div class="title small">${FS.nomeSquadra(b.id)}</div>
            <div class="sub tiny">${b.manc > 0 ? (b.manc === 1 ? 'Manca 1 atleta' : 'Mancano ' + b.manc + ' atleti') + ' · ' + nCr(b.crediti) + ' · max ' + b.max : nCr(b.crediti) + (b.crediti === 1 ? ' avanzato' : ' avanzati')}${b.mins.length ? ' · servono ancora ' + b.mins.join(', ') : ''}</div>
          </div>
          ${b.manc > 0 ? html`<span class="tag gold">${b.manc}</span>` : html`<span class="tag green">Completa</span>`}
        </div>`;
      })}</div>
    <//>`;
  }

  // -------------------------------------------------------------- conclusa
  function RosaMini(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var r = d.rose[p.teamId];
    var t = s.squadre[p.teamId];
    if (!r) return null;
    var righe = r.rosa.slice().sort(function (x, y) { return y.prezzo - x.prezzo; });
    return html`<section class=${'card' + (p.teamId === s.uid ? ' ma-mine' : '')}>
      <div class="card-h" style=${{ flexWrap: 'nowrap' }}>
        <${UI.TeamMask} team=${t} size=${36}/>
        <h3 class="ma-ellip" style=${{ fontSize: '20px' }}>${t ? t.nome : 'Squadra'}</h3>
        <span class="meta" style=${{ whiteSpace: 'nowrap' }}>${r.crediti} cr</span>
      </div>
      <div class="card-b">
        ${righe.length ? html`<div class="list">${righe.map(function (x) {
          var a = atletaDi(x.id, s);
          return html`<div class="li ma-tap" key=${x.id} style=${{ padding: '5px 0', gap: '8px' }}>
            <${UI.Role} ruolo=${E.ruoloAtleta(a, d.stagione)}/>
            <div class="body"><button class="ma-name small" onClick=${function () { UI.openAtleta(x.id); }}>${UI.nomeAtleta(a, true)}</button></div>
            <span class="tag">${x.prezzo}</span>
          </div>`;
        })}</div>` : html`<div class="small muted">Nessun atleta.</div>`}
        ${r.rosa.length < d.settings.rosa ? html`<div class="tiny faint" style=${{ marginTop: '6px' }}>${d.settings.rosa - r.rosa.length === 1 ? 'Manca 1 atleta' : 'Mancano ' + (d.settings.rosa - r.rosa.length) + ' atleti'}: si completa al mercato.</div>` : null}
      </div>
    </section>`;
  }

  function AstaConclusa(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var cf = useConfirm();
    var stat = useMemo(function () {
      var lotti = s.movimenti.filter(function (m) { return m.tipo === 'asta' && !m.annullato; });
      var spesa = lotti.reduce(function (t, m) { return t + (Number(m.prezzo) || 0); }, 0);
      var top = lotti.slice().sort(function (x, y) { return (Number(y.prezzo) || 0) - (Number(x.prezzo) || 0); })[0] || null;
      return { n: lotti.length, spesa: spesa, top: top };
    }, [s.version]);
    var a = s.asta || {};
    var incomplete = d.teamIds.filter(function (t) { return d.rose[t] && d.rose[t].rosa.length < d.settings.rosa; });
    var base = ordineCompleto(a.ordine, d.teamIds);
    // alla riapertura chiamano per prime le squadre con la rosa incompleta
    var ordineRiapertura = base.filter(function (t) { return incomplete.indexOf(t) >= 0; }).concat(base.filter(function (t) { return incomplete.indexOf(t) < 0; }));

    function riapri() {
      cf[1]({ title: 'Riaprire l\'asta?', yes: 'Riapri l\'asta', body: 'Si riparte con la chiamata a turno tra le squadre con la rosa incompleta (' + incomplete.length + '). Le aggiudicazioni già fatte restano valide.', run: function () { return FS.act.avviaAsta(ordineRiapertura); } });
    }
    function chiudi() {
      cf[1]({ title: 'Iniziare il campionato?', yes: 'Inizia il campionato', body: 'La lega passa alla fase di campionato: da qui in poi si schierano le formazioni e le rose si ritoccano al mercato.', run: function () { return FS.act.terminaAsta(); } });
    }

    return html`<div class="stack">
      <${UI.Card} title="Asta conclusa" meta=${stat.n + (stat.n === 1 ? ' aggiudicazione' : ' aggiudicazioni')}
        footer=${html`<${React.Fragment}>
          <button class="btn" onClick=${function () { p.go('rose'); }}>Vai alle rose</button>
          ${d.isAdmin && s.canWrite && d.lega.stato === 'asta' ? html`<button class="btn ok" onClick=${chiudi}>Inizia il campionato</button>` : null}
          ${d.isAdmin && s.canWrite && incomplete.length ? html`<button class="btn ghost" onClick=${riapri}>Riapri l'asta</button>` : null}
        <//>`}>
        <div class="ma-kpis">
          <div class="ma-kpi"><div class="v">${stat.n}</div><div class="l">Atleti aggiudicati</div></div>
          <div class="ma-kpi"><div class="v">${stat.spesa}</div><div class="l">Crediti spesi</div></div>
          ${stat.top ? html`<div class="ma-kpi"><div class="v">${stat.top.prezzo}</div><div class="l">Prezzo più alto: ${UI.nomeAtleta(atletaDi(stat.top.atletaId, s), true)}</div></div>` : null}
        </div>
        <p class="small muted" style=${{ marginBottom: 0 }}>${incomplete.length ? 'Rosa ancora da completare per ' + incomplete.map(function (t) { return FS.nomeSquadra(t); }).join(', ') + ': si completa al mercato ' + (quote(d) ? 'con le copie rimaste.' : 'degli svincolati.') : 'Tutte le rose sono complete. In guardia: si parte!'}</p>
      <//>
      <div class="grid grid-3">${d.teamIds.map(function (t) { return html`<${RosaMini} key=${t} teamId=${t}/>`; })}</div>
      ${cf[0]}
    </div>`;
  }

  // ------------------------------------------------------------------ vista
  V.Asta = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var a = s.asta;
    var crumbs = html`<div class="crumbs"><span class="c">${d.lega.nome}</span><span class="faint">›</span><span class="c on">${d.modalita === 'listone' ? 'Composizione delle rose' : 'Asta'}</span></div>`;

    // listone a budget fisso: niente asta (la scheda resta raggiungibile da link e home)
    if (d.modalita === 'listone') {
      return html`<div class="stack">${crumbs}<${AstaListone} go=${p.go}/></div>`;
    }

    if (a && a.attiva) {
      return html`<div class="stack">
        ${crumbs}
        ${a.pausa ? html`<div class="banner warn"><span class="lamp s"></span><span><b>Asta in pausa.</b> Il timer è fermo: si riparte quando il presidente riprende.</span></div>` : null}
        <div class="grid grid-main">
          <div class="stack">
            ${a.lotto ? html`<${LottoLive}/>` : html`<${Chiamata}/>`}
            ${d.isAdmin ? html`<${ComandiPresidente}/>` : null}
            <${StoricoAsta}/>
          </div>
          <div class="stack">
            <${SquadreAsta}/>
            ${d.isAdmin ? html`<${AstaDalVivo}/>` : null}
          </div>
        </div>
      </div>`;
    }

    if (a && a.conclusa) {
      return html`<div class="stack">
        ${crumbs}
        <${AstaConclusa} go=${p.go}/>
        <div class="grid grid-main">
          <div class="stack"><${StoricoAsta}/></div>
          <div class="stack">${d.isAdmin ? html`<${AstaDalVivo}/>` : null}</div>
        </div>
      </div>`;
    }

    return html`<div class="stack">${crumbs}<${Preparazione} go=${p.go}/></div>`;
  };
})(window);
