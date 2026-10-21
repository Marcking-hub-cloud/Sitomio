/* Vista Presidenza: l'area del presidente di lega.
 * Sottosezioni: Lega, Regole, Squadre, Calendario, Risultati (import da 4Fence), Atleti, Giornate.
 * Calendario, gare e listone sono dati comuni a tutte le leghe: li cura ogni presidente (o il proprietario della pagina).
 * Regole, squadre, formazioni d'ufficio, rettifiche e ufficializzazioni riguardano solo questa lega e richiedono d.isAdmin.
 */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo, useRef = React.useRef;

  // ------------------------------------------------------------ costanti
  var TAB_KEY = 'fs:presidenza:tab';
  var TABS = [
    { id: 'lega', label: 'Lega' },
    { id: 'regole', label: 'Regole' },
    { id: 'squadre', label: 'Squadre' },
    { id: 'calendario', label: 'Calendario' },
    { id: 'risultati', label: 'Risultati' },
    { id: 'atleti', label: 'Atleti' },
    { id: 'giornate', label: 'Giornate' },
  ];
  var STATI_LEGA = [
    { v: 'iscrizioni', l: 'Iscrizioni aperte', listone: 'Iscrizioni e composizione delle rose' },
    { v: 'asta', l: 'Asta' },
    { v: 'campionato', l: 'Campionato in corso' },
  ];
  var LIVELLI = [
    { v: 'regionale', l: 'Regionale' },
    { v: 'interregionale', l: 'Interregionale' },
    { v: 'nazionale', l: 'Nazionale' },
    { v: 'campionato-regionale', l: 'Campionato regionale' },
    { v: 'campionato-italiano', l: 'Campionato italiano' },
  ];
  var ARMI = [{ v: 'SP', l: 'Spada' }, { v: 'F', l: 'Fioretto' }, { v: 'SC', l: 'Sciabola' }];
  var STATI_RIS = [
    { v: 'ok', l: 'In pedana' },
    { v: 'ritirato', l: 'Ritirato/a' },
    { v: 'escluso', l: 'Escluso/a' },
    { v: 'assente', l: 'Assente (s.v.)' },
  ];
  var INFERMERIA = ['', 'Infortunato', 'Indisponibile', 'In dubbio'];
  var TURNI = [128, 64, 32, 16, 8, 4, 2];

  // stili strutturali (solo token del tema)
  var BLOCK = { border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--card-2)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px', minWidth: 0 };
  var MINI = { gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '8px' };
  var P_GRID = { gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' };
  var SPAN2 = { gridColumn: 'span 2' };
  var FULL = { gridColumn: '1 / -1' };
  var ACTIONS = { justifyContent: 'flex-end', marginTop: '12px' };
  var PILL_SM = { fontSize: '13px', padding: '3px 9px' };
  var STEPS = { margin: '4px 0 12px', paddingLeft: '20px', lineHeight: 1.55 };
  var ERR_LIST = { color: 'var(--lamp-red)', margin: '10px 0 0', paddingLeft: '18px' };

  // ------------------------------------------------------------- utilità
  function num(x, def) {
    if (x === '' || x === null || x === undefined) return def === undefined ? 0 : def;
    var n = Number(x);
    return isFinite(n) ? n : (def === undefined ? 0 : def);
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoLocale(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
  function parseIso(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addGiorni(iso, k) { var dt = parseIso(iso); if (!dt) return ''; dt.setDate(dt.getDate() + k); return isoLocale(dt); }
  /** ms → valore di <input type="datetime-local"> nell'ora locale del browser. */
  function msToLocal(ms) {
    if (!ms) return '';
    var dt = new Date(ms);
    if (isNaN(dt.getTime())) return '';
    return isoLocale(dt) + 'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }
  function localToMs(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(str || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null;
  }
  /** Scadenza predefinita: il giorno prima dell'inizio alle 23:59 (ora locale). */
  function scadenzaDefault(dal) {
    var dt = parseIso(dal);
    if (!dt) return null;
    dt.setDate(dt.getDate() - 1);
    dt.setHours(23, 59, 0, 0);
    return dt.getTime();
  }
  function norm(x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function codiceDa(x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function idSafe(x) { return String(x).replace(/[^A-Za-z0-9_-]/g, '_'); }
  function giornataDi(data, giornate) {
    var x = String(data || '').slice(0, 10);
    if (!x) return null;
    return giornate.filter(function (g) { return x >= g.dal && x <= g.al; })[0] || null;
  }
  function nomeGiornata(g) { return g ? (g.nome || 'Giornata ' + g.n) : ''; }
  function livelloLabel(v) { var x = LIVELLI.filter(function (l) { return l.v === v; })[0]; return x ? x.l : (v || '—'); }
  function statoLegaLabel(v, listone) { var x = STATI_LEGA.filter(function (o) { return o.v === v; })[0]; return x ? (listone && x.listone) || x.l : (v || '—'); }
  function nomeAtl(s, fis, corto) { var a = s.atleti[fis]; return a ? UI.nomeAtleta(a, corto) : 'Atleta ' + fis; }
  function cmpAtleti(a, b) { return (String(a.cognome) + ' ' + a.nome).localeCompare(String(b.cognome) + ' ' + b.nome, 'it'); }
  function maiuscola(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  /** Primo turno di diretta plausibile: la potenza di 2 che contiene gli iscritti. */
  function primoTurno(n) { n = Math.round(num(n, 0)); if (n < 2) return 32; var t = 2; while (t < n && t < 256) t *= 2; return t; }
  /** Solo link http(s): un JSON incollato non deve poter inserire link javascript:. */
  function urlSicuro(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }

  /** Nota di contesto in testa a una sezione: sul telefono una riga sola (p.breve) che si apre al tocco. */
  function Nota(p) {
    var phone = UI.useMq(UI.PHONE);
    if (!phone) return html`<div class="banner small">${p.children}</div>`;
    return html`<div class="banner small nota-fold"><details class="more"><summary>${p.breve}</summary><div class="nota-fold-b">${p.children}</div></details></div>`;
  }
  function silenzio(pr) { return Promise.resolve(pr).catch(function () { }); }
  function errore(msg) { FS.toast(msg, 'err'); }
  function codiceUnico(base, atleti) {
    if (!atleti[base]) return base;
    for (var i = 2; i < 100; i++) if (!atleti[base + '-' + i]) return base + '-' + i;
    return base + '-' + FS.rid(4).toUpperCase();
  }

  function seleziona(el) {
    if (!el) return;
    try {
      if (typeof el.select === 'function') { el.focus(); el.select(); return; }
      var r = document.createRange();
      r.selectNodeContents(el);
      var sel = root.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    } catch (e) { /* niente */ }
  }
  /** Copia negli appunti dentro il click; se il browser rifiuta, seleziona il testo per la copia a mano. */
  function copia(testo, el, ok) {
    var fallita = function () { seleziona(el); FS.toast('Copia non riuscita: il testo è selezionato, copialo a mano (Ctrl/Cmd+C).', 'err'); };
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) { fallita(); return; }
      navigator.clipboard.writeText(testo).then(function () { FS.toast(ok || 'Copiato'); }, fallita);
    } catch (e) { fallita(); }
  }

  /** Conferma in pagina: [elemento da rendere, apri({title, text, yes, danger, run})]. */
  function useAsk() {
    var st = useState(null);
    var ask = st[0], setAsk = st[1];
    var el = ask ? html`<${UI.Confirm} title=${ask.title} yes=${ask.yes} danger=${!!ask.danger}
        onNo=${function () { setAsk(null); }}
        onYes=${function () { var run = ask.run; setAsk(null); silenzio(Promise.resolve().then(run)); }}>${ask.text}<//>` : null;
    return [el, setAsk];
  }

  /** Stato di una giornata per questa lega. */
  function statoGiornata(g, s, d, now) {
    if (s.esiti[g.n] && s.esiti[g.n].ufficiale) return { k: 'uff', label: 'Ufficiale', cls: 'green' };
    if (g.n < (d.settings.giornataIniziale || 1)) return { k: 'pre', label: 'Prima dell\'inizio', cls: '' };
    if (d.scadenza(g) > now) return { k: 'aperta', label: 'Formazioni aperte', cls: 'blue' };
    if (g.al >= d.oggi) return { k: 'corso', label: 'In corso', cls: 'gold' };
    return { k: 'fine', label: 'Da ufficializzare', cls: 'red' };
  }


  // ------------------------------------------------------ campi riusabili
  function testoNum(v) { return v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v)) ? '' : String(v); }
  function leggiNum(t) { t = String(t).trim().replace(',', '.'); if (t === '') return null; var n = Number(t); return isFinite(n) ? n : NaN; }

  /**
   * Input numerico che tollera la digitazione parziale ("-", "0,") e si riallinea ai reset esterni.
   * È un campo di testo: su iPhone il tastierino decimale non ha il meno, quindi i campi che ammettono
   * valori negativi (malus, rettifiche) usano la tastiera normale.
   */
  function NumInput(p) {
    var st = useState(testoNum(p.value));
    var txt = st[0], setTxt = st[1];
    useEffect(function () {
      var cur = leggiNum(txt);
      var vuoto = p.value === null || p.value === undefined || p.value === '';
      if (vuoto ? cur !== null : cur !== Number(p.value)) setTxt(testoNum(p.value));
    }, [p.value]);
    var positivo = p.min !== undefined && p.min !== null && Number(p.min) >= 0;
    var intero = Number(p.step || 1) % 1 === 0;
    return html`<input id=${p.id} class="input num" type="text" inputMode=${positivo ? (intero ? 'numeric' : 'decimal') : 'text'}
      autoComplete="off" autoCorrect="off" spellCheck=${false} enterKeyHint="done" pattern=${positivo ? (intero ? '[0-9]*' : '[0-9]*[.,]?[0-9]*') : null}
      value=${txt} disabled=${!!p.disabled} readOnly=${!!p.readOnly} placeholder=${p.placeholder || ''}
      onInput=${function (e) {
        var t = e.target.value;
        setTxt(t);
        var n = leggiNum(t);
        if (n === null) { if (p.allowEmpty) p.onChange(null); } else if (!isNaN(n)) p.onChange(n);
      }}
      onBlur=${function () { var n = leggiNum(txt); if ((n === null && !p.allowEmpty) || (n !== null && isNaN(n))) setTxt(testoNum(p.value)); }}/>`;
  }

  /** Elenco separato da virgole (moduli, punti F1). */
  function ListInput(p) {
    var val = (p.value || []).join(', ');
    var st = useState(val);
    var txt = st[0], setTxt = st[1];
    useEffect(function () { if (p.parse(txt).join(', ') !== val) setTxt(val); }, [val]);
    return html`<input id=${p.id} class="input" value=${txt} disabled=${!!p.disabled} placeholder=${p.placeholder || ''}
      onInput=${function (e) { setTxt(e.target.value); p.onChange(p.parse(e.target.value)); }}/>`;
  }
  function parseModuli(t) { return String(t).split(/[\s,;]+/).map(function (x) { return x.trim(); }).filter(function (x) { return /^\d+-\d+-\d+$/.test(x); }); }
  function parseNumeri(t) { return String(t).split(/[\s,;]+/).filter(function (x) { return x.trim() !== ''; }).map(Number).filter(function (n) { return isFinite(n) && n >= 0; }); }

  // ================================================================ 1. LEGA
  function TabLega() {
    var s = FS.useFS();
    var d = FS.derived();
    var stN = useState(null);
    var stS = useState(null);
    var stG = useState(null);
    var stV = useState('');
    var codRef = useRef(null);
    var askS = useAsk();
    var ask = askS[1];
    var lega = d.lega;
    var canAdmin = d.isAdmin && s.canWrite;
    var nome = stN[0] === null ? (lega.nome || '') : stN[0];
    var stato = stS[0] === null ? (lega.stato || 'iscrizioni') : stS[0];
    var gIniLive = d.settings.giornataIniziale || 1;
    var gIni = stG[0] === null ? gIniLive : stG[0];
    var gIniDoc = s.giornate[gIni];
    var admins = lega.adminIds || [];
    var candidati = d.teamIds.map(function (t) {
      var sq = s.squadre[t];
      return { uid: (sq && sq.ownerId) || t, team: sq };
    }).filter(function (c) { return admins.indexOf(c.uid) < 0; });
    var vice = candidati.some(function (c) { return c.uid === stV[0]; }) ? stV[0] : '';
    var datiCambiati = nome.trim() !== (lega.nome || '') || stato !== (lega.stato || 'iscrizioni');
    var listone = d.modalita === 'listone';
    var R = d.settings.rosa;
    var incomplete = d.teamIds.filter(function (t) { return d.rose[t] && d.rose[t].rosa.length < R; });

    function salvaDati() {
      var patch = {};
      if (nome.trim() !== lega.nome) patch.nome = nome.trim().slice(0, 40);
      if (stato !== lega.stato) patch.stato = stato;
      if (!Object.keys(patch).length) return null;
      return FS.act.aggiornaLega(patch).then(function () { stN[1](null); stS[1](null); });
    }
    function onSalvaDati() {
      if (!nome.trim()) { errore('Il nome della lega non può essere vuoto.'); return null; }
      if (stato !== lega.stato) {
        ask({
          title: 'Cambiare lo stato della lega?', yes: 'Cambia stato', run: salvaDati,
          text: 'La lega passa da «' + statoLegaLabel(lega.stato, listone) + '» a «' + statoLegaLabel(stato, listone) + '». ' + (listone
            ? 'Di solito lo stato cambia da solo (il campionato si avvia con il pulsante «Inizia il campionato»): usa questo comando solo per correggere.'
            : 'Di solito lo stato cambia da solo (l\'asta si avvia e si chiude dalla sezione Asta): usa questo comando solo per correggere.'),
        });
        return null;
      }
      return salvaDati();
    }
    function avviaCampionato() {
      ask({
        title: 'Iniziare il campionato?', yes: 'Inizia il campionato',
        text: 'Le rose si chiudono: da qui in poi si compra e si svincola solo nelle sessioni di mercato che apri tu, con un rimborso del ' + UI.fmt(d.settings.rimborsoSvincolo * 100) + '% allo svincolo.'
          + (incomplete.length ? ' ' + (incomplete.length === 1 ? '1 squadra ha ancora la rosa incompleta: potrà completarla' : incomplete.length + ' squadre hanno ancora la rosa incompleta: potranno completarla') + ' al mercato.' : ''),
        run: function () { return FS.act.iniziaCampionato(); },
      });
    }
    function salvaGIni() {
      var x = FS.clone(d.settings);
      x.giornataIniziale = Math.max(1, Math.round(num(gIni, 1)));
      return FS.act.salvaSettings(x).then(function () { stG[1](null); });
    }
    function nomina() {
      var c = candidati.filter(function (x) { return x.uid === vice; })[0];
      if (!c) return;
      ask({
        title: 'Nominare un vicepresidente?', yes: 'Nomina',
        text: FS.nomeGiocatore(c.uid) + (c.team ? ' (' + c.team.nome + ')' : '') + ' potrà modificare regole e squadre, inserire formazioni d\'ufficio e ufficializzare le giornate di questa lega.',
        run: function () { return FS.act.aggiungiAdmin(c.uid).then(function () { stV[1](''); }); },
      });
    }
    function revoca(uid) {
      ask({
        title: 'Revocare il vicepresidente?', yes: 'Revoca', danger: true,
        text: FS.nomeGiocatore(uid) + ' tornerà un giocatore come gli altri: la sua squadra resta in lega.',
        run: function () { return FS.act.aggiornaLega({ adminIds: admins.filter(function (x) { return x !== uid; }) }); },
      });
    }

    var mercatoTag = lega.mercatoAperto
      ? (d.mercatoAperto ? html`<span class="tag green">Aperto</span>` : html`<span class="tag gold">Sospeso: giornata in corso</span>`)
      : html`<span class="tag">Chiuso</span>`;

    return html`<div class="stack">
      <div class="grid grid-2">
        <${UI.Card} title="Dati della lega">
          <div class="stack" style=${{ gap: '12px' }}>
            <${UI.Field} id="lega-nome" label="Nome della lega">
              <input id="lega-nome" class="input" maxLength="40" value=${nome} disabled=${!canAdmin} onInput=${function (e) { stN[1](e.target.value); }}/>
            <//>
            <${UI.Field} id="lega-codice" label="Codice di invito" help="Mandalo agli amici: lo inseriscono nella schermata iniziale per entrare.">
              <div class="row" style=${{ flexWrap: 'nowrap' }}>
                <input id="lega-codice" ref=${codRef} class="input grow" readOnly=${true} value=${lega.codice || ''} style=${{ letterSpacing: '.2em', fontWeight: 700 }}/>
                <button type="button" class="btn sm ghost" onClick=${function () { copia(lega.codice || '', codRef.current, 'Codice copiato'); }}>Copia</button>
              </div>
            <//>
            <${UI.Field} id="lega-stato" label="Stato" help=${listone ? 'Il campionato si avvia dalla scheda «Inizio del campionato»: qui puoi correggere lo stato a mano.' : 'L\'asta si avvia e si chiude dalla sezione Asta: qui puoi correggere lo stato a mano.'}>
              <select id="lega-stato" class="input" value=${stato} disabled=${!canAdmin} onChange=${function (e) { stS[1](e.target.value); }}>
                ${STATI_LEGA.filter(function (o) { return !(listone && o.v === 'asta' && stato !== 'asta'); }).map(function (o) { return html`<option key=${o.v} value=${o.v}>${statoLegaLabel(o.v, listone)}</option>`; })}
              </select>
            <//>
            <div class="small">Modalità: <${UI.ModalitaTag} settings=${d.settings}/> <span class="tiny faint">(si sceglie nella scheda Regole)</span></div>
            <div class="row">
              <${UI.AsyncBtn} cls="sm" disabled=${!canAdmin || !datiCambiati} onClick=${onSalvaDati}>Salva<//>
              ${datiCambiati ? html`<button type="button" class="btn sm ghost" onClick=${function () { stN[1](null); stS[1](null); }}>Annulla</button>` : null}
            </div>
          </div>
        <//>

        <${UI.Card} title="Mercato" meta=${mercatoTag}>
          <p class="small muted" style=${{ marginTop: 0 }}>${listone
            ? 'Con il mercato aperto le squadre comprano gli atleti del listone che non hanno già, alla quotazione attuale (Qt.A), e svincolano con un rimborso del ' + UI.fmt(d.settings.rimborsoSvincolo * 100) + '% del prezzo pagato. Nel listone a budget fisso non ci sono scambi. Prima del campionato le rose si compongono anche a mercato chiuso. Mentre una giornata è in corso il mercato resta chiuso da solo.'
            : 'Con il mercato aperto le squadre comprano ' + (E.copiePerAtleta(d.settings) > 1 ? 'le copie libere degli atleti che non hanno già,' : 'svincolati') + ' ' + (d.settings.prezzoSvincolati === 'uno' ? 'a 1 credito' : 'alla quotazione attuale (Qt.A)') + ', svincolano con un rimborso del ' + UI.fmt(d.settings.rimborsoSvincolo * 100) + '% del prezzo pagato e si scambiano atleti. Mentre una giornata è in corso il mercato resta chiuso da solo.'}</p>
          <div class="small">Sessione di mercato n. <b>${lega.sessioneMercato || 0}</b>${d.inCorso ? html`<span> · giornata in corso: <b>${nomeGiornata(d.inCorso)}</b></span>` : null}</div>
          <p class="tiny faint">A ogni nuova sessione chi ha svincolato un atleta può ricomprarlo.</p>
          <${UI.AsyncBtn} cls=${lega.mercatoAperto ? 'sm ghost' : 'sm ok'} disabled=${!canAdmin} onClick=${function () { return FS.act.apriMercato(!lega.mercatoAperto); }}>${lega.mercatoAperto ? 'Chiudi il mercato' : 'Apri una nuova sessione'}<//>
        <//>

        <${UI.Card} title="Inizio del campionato">
          <${UI.Field} id="lega-giornata-iniziale" label="Prima giornata valida" help=${gIniDoc ? nomeGiornata(gIniDoc) + ' · ' + UI.finestra(gIniDoc) : 'Nel calendario non c\'è una giornata con questo numero.'}>
            <${NumInput} id="lega-giornata-iniziale" value=${gIni} min="1" step="1" disabled=${!canAdmin} onChange=${function (v) { stG[1](Math.max(1, Math.round(v))); }}/>
          <//>
          <p class="small muted">Le giornate precedenti restano nel calendario ma non contano per la classifica di questa lega.${listone && lega.stato !== 'campionato' ? ' Con il listone le rose si compongono fino alla scadenza della prima giornata valida.' : ''}</p>
          <${UI.AsyncBtn} cls="sm" disabled=${!canAdmin || gIni === gIniLive} onClick=${salvaGIni}>Salva<//>
          ${listone && lega.stato !== 'campionato' ? html`<div style=${Object.assign({}, BLOCK, { marginTop: '14px', marginBottom: 0 })}>
            <div class="eyebrow">Composizione delle rose</div>
            <div class="small">Rose complete: <b>${d.teamIds.length - incomplete.length}/${d.teamIds.length}</b>${incomplete.length ? html`<span class="muted"> · da completare: ${incomplete.map(function (t) { return FS.nomeSquadra(t) + ' (' + d.rose[t].rosa.length + '/' + R + ')'; }).join(', ')}</span>` : null}</div>
            <div class="small muted">${d.composizione
              ? (d.prossima ? 'Le squadre comprano dal listone finché non avvii il campionato, al più tardi fino alla scadenza della ' + nomeGiornata(d.prossima) + ' (' + UI.dataOra(d.scadenza(d.prossima)) + ').' : 'Le squadre comprano dal listone finché non avvii il campionato.')
              : 'La composizione si è chiusa alla scadenza della prima giornata valida: da ora si compra nelle sessioni di mercato. Avvia il campionato per renderlo ufficiale, oppure sposta più avanti la prima giornata valida per riaprirla.'}</div>
            <div><button type="button" class="btn sm ok" disabled=${!canAdmin} onClick=${avviaCampionato}>Inizia il campionato</button></div>
          </div>` : null}
        <//>

        <${UI.Card} title="Presidenza" meta=${admins.length === 1 ? '1 presidente' : admins.length + ' presidenti'}>
          <div class="list">${admins.map(function (uid, i) {
            var sq = s.squadre[uid];
            var fondatore = lega.creatoDa ? uid === lega.creatoDa : i === 0;
            return html`<div class="li" key=${uid}>
              <${UI.TeamMask} team=${sq || { nome: FS.nomeGiocatore(uid), id: uid }} size=${36}/>
              <div class="body"><div class="title">${FS.nomeGiocatore(uid)}${uid === s.uid ? ' (tu)' : ''}</div><div class="sub">${sq ? sq.nome : 'Nessuna squadra in questa lega'}</div></div>
              <span class=${'tag ' + (fondatore ? 'gold' : 'blue')}>${fondatore ? 'Presidente' : 'Vice'}</span>
              ${canAdmin && !fondatore && uid !== s.uid ? html`<button type="button" class="btn xs ghost" onClick=${function () { revoca(uid); }}>Revoca</button>` : null}
            </div>`;
          })}</div>
          <div class="stack" style=${{ gap: '8px', marginTop: '10px' }}>
            <${UI.Field} id="nomina-vice" label="Nomina vicepresidente" help="Avrà gli stessi poteri del presidente in questa lega.">
              <select id="nomina-vice" class="input" value=${vice} disabled=${!canAdmin || !candidati.length} onChange=${function (e) { stV[1](e.target.value); }}>
                <option value="">${candidati.length ? 'Scegli un giocatore…' : 'Nessun altro giocatore iscritto'}</option>
                ${candidati.map(function (c) { return html`<option key=${c.uid} value=${c.uid}>${FS.nomeGiocatore(c.uid) + (c.team ? ' · ' + c.team.nome : '')}</option>`; })}
              </select>
            <//>
            <div><button type="button" class="btn sm" disabled=${!canAdmin || !vice} onClick=${nomina}>Nomina</button></div>
          </div>
        <//>
      </div>
      ${askS[0]}
    </div>`;
  }

  // ============================================================== 2. REGOLE
  var ETICHETTE_P = {
    base: ['Voto base', 'chi scende in pedana parte da qui'],
    gironeVittoria: ['Assalto vinto nel girone', 'X, per ogni vittoria'],
    gironeSconfitta: ['Assalto perso nel girone', 'per ogni sconfitta'],
    indice: ['Indice, per stoccata', 'Z, per stoccata di differenza'],
    indiceMax: ['Tetto dell\'indice', 'massimo, in più o in meno'],
    gironePerfetto: ['Girone perfetto', 'tutti vinti, almeno 4 assalti'],
    gironeZero: ['Girone senza vittorie', ''],
    eliminatoGironi: ['Eliminato/a nei gironi', 'non qualificato/a al tabellone'],
    direttaVittoria: ['Assalto vinto in diretta', 'Y, per ogni turno superato'],
    impresa: ['Impresa', 'vittoria su una testa di serie migliore'],
    sconfittaBeffa: ['Sconfitta inattesa', 'con una testa di serie peggiore'],
    sogliaImpresa: ['Soglia impresa', 'posizioni di testa di serie'],
    vittoriaNetta: ['Vittoria netta in diretta', ''],
    sconfittaNetta: ['Sconfitta netta in diretta', ''],
    sogliaScarto: ['Scarto netto, assalti a 15', 'stoccate di differenza'],
    sogliaScarto10: ['Scarto netto, assalti a 10', 'stoccate di differenza'],
    derby: ['Derby San Paolo vinto', 'in diretta, contro un compagno di sala'],
    oro: ['Oro (1° posto)', ''],
    argento: ['Argento (2° posto)', ''],
    bronzo: ['Bronzo (3° posto)', ''],
    finale8: ['Finale a 8 (5°–8°)', ''],
    top16: ['Primi 16 (9°–16°)', 'con almeno 32 iscritti'],
    cartellinoGiallo: ['Cartellino giallo', 'per cartellino'],
    cartellinoRosso: ['Cartellino rosso', 'per cartellino'],
    cartellinoNero: ['Cartellino nero', ''],
    ritirato: ['Ritirato/a durante la gara', ''],
    escluso: ['Escluso/a dalla gara', ''],
  };
  var SOGLIE = { sogliaImpresa: 1, sogliaScarto: 1, sogliaScarto10: 1 };
  var GRUPPI_P = [
    { t: 'Base', k: ['base'] },
    { t: 'Girone', k: ['gironeVittoria', 'gironeSconfitta', 'indice', 'indiceMax', 'gironePerfetto', 'gironeZero', 'eliminatoGironi'] },
    { t: 'Eliminazione diretta', k: ['direttaVittoria', 'impresa', 'sconfittaBeffa', 'sogliaImpresa', 'vittoriaNetta', 'sconfittaNetta', 'sogliaScarto', 'sogliaScarto10', 'derby'] },
    { t: 'Piazzamento finale', k: ['oro', 'argento', 'bronzo', 'finale8', 'top16'] },
    { t: 'Disciplina', k: ['cartellinoGiallo', 'cartellinoRosso', 'cartellinoNero', 'ritirato', 'escluso'] },
  ];

  var ESEMPI = [
    {
      id: 'tipo', label: 'Gara tipo',
      desc: 'Girone chiuso 4 vinti e 2 persi (24 date, 17 ricevute), un turno superato in diretta, 13° su 40.',
      raw: { stato: 'ok', girone: { n: 7, v: 4, s: 2, td: 24, tr: 17 }, seed: 9, qualificato: true, deTouches: 15,
        de: [{ r: 32, opp: 'Avversario', oppSeed: 24, td: 15, tr: 11, v: true }, { r: 16, opp: 'Avversario', oppSeed: 8, td: 12, tr: 15, v: false }], place: 13, of: 40 },
    },
    {
      id: 'podio', label: 'Argento',
      desc: 'Girone 5 su 6, quattro assalti vinti in diretta (uno 15–4), finale persa 11–15: 2° su 36.',
      raw: { stato: 'ok', girone: { n: 7, v: 5, s: 1, td: 28, tr: 14 }, seed: 3, qualificato: true, deTouches: 15,
        de: [{ r: 32, oppSeed: 30, td: 15, tr: 4, v: true }, { r: 16, oppSeed: 14, td: 15, tr: 12, v: true }, { r: 8, oppSeed: 6, td: 15, tr: 13, v: true }, { r: 4, oppSeed: 2, td: 15, tr: 14, v: true }, { r: 2, oppSeed: 1, td: 11, tr: 15, v: false }], place: 2, of: 36 },
    },
    {
      id: 'impresa', label: 'Impresa e derby',
      desc: 'Testa di serie n.21: vince il derby con un compagno di sala, poi batte la n.5 (impresa) e chiude 7° su 48.',
      raw: { stato: 'ok', girone: { n: 7, v: 3, s: 3, td: 20, tr: 21 }, seed: 21, qualificato: true, deTouches: 15,
        de: [{ r: 32, opp: 'Compagno di sala', oppSeed: 14, oppClub: 'MISPM', td: 15, tr: 13, v: true }, { r: 16, oppSeed: 5, td: 15, tr: 14, v: true }, { r: 8, oppSeed: 4, td: 9, tr: 15, v: false }], place: 7, of: 48 },
    },
    {
      id: 'u14', label: 'Under 14, assalti a 10',
      desc: 'Girone 3 vinti e 2 persi, vittoria netta 10–3 in diretta, poi fuori ai quarti: 6° su 20.',
      raw: { stato: 'ok', girone: { n: 6, v: 3, s: 2, td: 17, tr: 15 }, seed: 8, qualificato: true, deTouches: 10,
        de: [{ r: 16, oppSeed: 9, td: 10, tr: 3, v: true }, { r: 8, oppSeed: 1, td: 4, tr: 10, v: false }], place: 6, of: 20 },
    },
    {
      id: 'brutta', label: 'Brutta giornata',
      desc: 'Girone difficile, 1 vinto e 5 persi: non passa al tabellone, 31° su 34.',
      raw: { stato: 'ok', girone: { n: 7, v: 1, s: 5, td: 13, tr: 28 }, seed: 31, qualificato: false, de: [], place: 31, of: 34 },
    },
  ];

  function erroriRegole(cur, d) {
    var e = [];
    var T = num(cur.titolari, 5);
    var listone = E.modalita(cur) === 'listone';
    if (!(num(cur.crediti) > 0)) e.push('I crediti devono essere più di zero.');
    if (num(cur.rosa) < T) e.push('La rosa deve avere almeno ' + T + ' atleti (i titolari).');
    if (num(cur.offertaMinima) < 0) e.push('L\'offerta minima non può essere negativa.');
    if (num(cur.offertaMinima) * num(cur.rosa) > num(cur.crediti)) e.push('Con questi crediti non si riesce a completare la rosa all\'offerta minima.');
    if (!listone && num(cur.timerAsta) < 5) e.push('Il timer dell\'asta deve essere di almeno 5 secondi.');
    // meno crediti di quelli già spesi: qualche squadra andrebbe sotto zero (i crediti si ricalcolano dal registro)
    var delta = d ? num(cur.crediti) - num(d.settings.crediti) : 0;
    var sotto = delta < 0 ? d.teamIds.filter(function (t) { return d.rose[t] && d.rose[t].crediti + delta < 0; }) : [];
    if (sotto.length) e.push('Con ' + num(cur.crediti) + ' crediti ' + (sotto.length === 1 ? 'la squadra ' + FS.nomeSquadra(sotto[0]) + ' andrebbe' : sotto.length + ' squadre andrebbero') + ' sotto zero: hanno già speso di più.');
    if (cur.disponibilita === 'quote') {
      var cp = num(cur.copieAtleta, 5);
      if (cp < 1 || cp > 15 || Math.round(cp) !== cp) e.push('Le copie per atleta vanno da 1 a 15 (numero intero).');
    }
    if (num(cur.rimborsoSvincolo) < 0 || num(cur.rimborsoSvincolo) > 1) e.push('Il rimborso allo svincolo va da 0 a 100%.');
    if (num(cur.maxSostituzioni) < 0) e.push('Le sostituzioni non possono essere negative.');
    if (!cur.moduloLibero) {
      var mod = cur.moduli || [];
      if (!mod.length) e.push('Indica almeno un modulo ammesso (o scegli il modulo libero).');
      var bad = mod.filter(function (m) { return m.split('-').reduce(function (a, x) { return a + Number(x); }, 0) !== T; });
      if (bad.length) e.push('Moduli con un numero di titolari diverso da ' + T + ': ' + bad.join(', ') + '.');
    }
    if (cur.classifica === 'f1' && !(cur.puntiF1 || []).length) e.push('Indica i punti F1 per piazzamento.');
    var rr = cur.ruoliRosa || {};
    var minimi = 0;
    E.ORDINE_RUOLI.forEach(function (r) {
      var l = rr[r];
      if (!l) return;
      minimi += num(l[0]);
      if (num(l[0]) > num(l[1])) e.push('Vincolo ' + r + ': il minimo supera il massimo.');
      if (num(l[1]) > num(cur.rosa)) e.push('Vincolo ' + r + ': il massimo supera gli atleti in rosa.');
    });
    if (minimi > num(cur.rosa)) e.push('La somma dei minimi per ruolo supera gli atleti in rosa.');
    return e;
  }

  /** Minimo e massimo di un ruolo in rosa (vuoto = nessun vincolo). */
  function RuoloLimiti(p) {
    var lim = p.lim || null;
    var key = lim ? lim[0] + '-' + lim[1] : '';
    var stMin = useState(lim ? String(lim[0]) : '');
    var stMax = useState(lim ? String(lim[1]) : '');
    function calcola(a, b) {
      a = String(a).trim(); b = String(b).trim();
      if (a === '' && b === '') return null;
      var mn = a === '' ? 0 : Number(a), mx = b === '' ? num(p.rosa, 7) : Number(b);
      if (!isFinite(mn) || !isFinite(mx)) return lim;
      return [Math.max(0, Math.round(mn)), Math.max(0, Math.round(mx))];
    }
    useEffect(function () {
      var cur = calcola(stMin[0], stMax[0]);
      if ((cur ? cur[0] + '-' + cur[1] : '') !== key) { stMin[1](lim ? String(lim[0]) : ''); stMax[1](lim ? String(lim[1]) : ''); }
    }, [key]);
    function cambia(a, b) { stMin[1](a); stMax[1](b); p.onChange(calcola(a, b)); }
    var R = E.RUOLI[p.ruolo];
    var idp = 'rr-' + p.ruolo;
    return html`<div style=${BLOCK}>
      <div class="row" style=${{ gap: '8px' }}><${UI.Role} ruolo=${p.ruolo}/><span class="tiny muted">${R ? R.desc : ''}</span></div>
      <div class="form-grid" style=${MINI}>
        <${UI.Field} id=${idp + '-min'} label="Minimo">
          <input id=${idp + '-min'} class="input num" type="number" inputMode="numeric" pattern="[0-9]*" min="0" step="1" placeholder="—" value=${stMin[0]} disabled=${!!p.disabled} onInput=${function (e) { cambia(e.target.value, stMax[0]); }}/>
        <//>
        <${UI.Field} id=${idp + '-max'} label="Massimo">
          <input id=${idp + '-max'} class="input num" type="number" inputMode="numeric" pattern="[0-9]*" min="0" step="1" placeholder="—" value=${stMax[0]} disabled=${!!p.disabled} onInput=${function (e) { cambia(stMin[0], e.target.value); }}/>
        <//>
      </div>
    </div>`;
  }

  function TabRegole() {
    var s = FS.useFS();
    var d = FS.derived();
    var stD = useState(null);
    var stEs = useState('tipo');
    var askS = useAsk();
    var ask = askS[1];
    var draft = stD[0], setDraft = stD[1];
    var dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(d.settings);
    var cur = dirty ? draft : d.settings; // una bozza identica alle regole salvate segue gli aggiornamenti in tempo reale
    var canAdmin = d.isAdmin && s.canWrite;
    var dis = !canAdmin;
    var es = ESEMPI.filter(function (x) { return x.id === stEs[0]; })[0] || ESEMPI[0];
    var pKey = JSON.stringify(cur.punteggio || {});
    var anteprima = useMemo(function () { return E.fantavoto(es.raw, cur.punteggio, { coeff: 1 }); }, [es.id, pKey]);
    var nAttivi = Object.values(s.atleti).filter(function (a) { return a.attivo !== false; }).length;
    var nSq = d.teamIds.length;
    var T = num(cur.titolari, 5);
    // modalità di gioco in modifica: asta a copie (anche la vecchia 'singola') o listone a budget fisso
    var modo = E.modalita(cur);
    var listone = modo === 'listone';
    var K = E.copiePerAtleta(cur);
    var bloccoModo = FS.bloccoModalita();
    var consModo = { copie: FS.impostazioniModalita('copie'), listone: FS.impostazioniModalita('listone') };
    // listone: budget consigliato e costo della "squadra dei sogni" con la rosa in modifica
    var qts = FS.qtAttivi();
    var budgetCons = E.budgetListoneConsigliato(qts, num(cur.rosa, 8), T);
    var sogni = E.costoSquadraSogni(qts, num(cur.rosa, 8), T);
    // con il listone vuoto (database appena creato) o più corto della rosa il calcolo non ha senso
    var sogniOk = sogni.totale > 0 && qts.length >= num(cur.rosa, 8);
    var consQuote = !listone && nSq && nAttivi ? E.quoteConsigliate(nAttivi, nSq, T) : null;
    // posti in rosa e copie con le regole in modifica (asta a copie): un atleta non può stare in più squadre di quante ce ne sono
    var posti = nSq * num(cur.rosa);
    var copieTot = nAttivi * Math.min(K, nSq);
    // acquisti già fatti che supererebbero il limite di squadre per atleta con le regole in modifica
    var limite = K;
    var esuberi = 0;
    Object.keys(d.proprietari || {}).forEach(function (k) { var n = (d.proprietari[k] || []).length; if (n > limite) esuberi += n - limite; });

    function set(k, v) { var x = FS.clone(cur); x[k] = v; setDraft(x); }
    function setMolti(o) { var x = FS.clone(cur); Object.keys(o).forEach(function (k) { x[k] = o[k]; }); setDraft(x); }
    /** Cambio di modalità: crediti, rosa e copie passano ai valori consigliati (o a quelli salvati, se si torna alla modalità della lega). */
    function cambiaModo(m) {
      if (m === modo) return;
      var patch = consModo[m];
      var src = m === d.modalita ? d.settings : patch;
      var o = {};
      Object.keys(patch).forEach(function (k) { o[k] = src[k]; });
      setMolti(o);
    }
    function numeriModo(m) {
      var x = m === modo ? cur : consModo[m];
      if (m === 'listone') return x.crediti + ' crediti · rosa ' + x.rosa + ' · copie illimitate';
      var k = E.copiePerAtleta(x);
      return x.crediti + ' crediti · rosa ' + x.rosa + ' · ' + (k === 1 ? '1 copia' : k + ' copie') + ' per atleta';
    }
    function setP(k, v) { var x = FS.clone(cur); x.punteggio = Object.assign({}, x.punteggio); x.punteggio[k] = v; setDraft(x); }
    function setRuolo(r, lim) { var x = FS.clone(cur); x.ruoliRosa = Object.assign({}, x.ruoliRosa || {}); if (lim) x.ruoliRosa[r] = lim; else delete x.ruoliRosa[r]; setDraft(x); }

    var errs = erroriRegole(cur, d);
    var base = num(cur.punteggio && cur.punteggio.base, 6);
    var chiaviP = Object.keys(E.DEFAULT_PUNTEGGIO);
    Object.keys(cur.punteggio || {}).forEach(function (k) { if (chiaviP.indexOf(k) < 0) chiaviP.push(k); });
    var raggruppate = {};
    GRUPPI_P.forEach(function (g) { g.k.forEach(function (k) { raggruppate[k] = 1; }); });
    var altre = chiaviP.filter(function (k) { return !raggruppate[k]; });
    var gruppi = GRUPPI_P.map(function (g) { return { t: g.t, k: g.k.filter(function (k) { return chiaviP.indexOf(k) >= 0; }) }; });
    if (altre.length) gruppi.push({ t: 'Altre voci', k: altre });

    function salva() {
      var out = FS.clone(cur);
      out.giornataIniziale = d.settings.giornataIniziale || 1; // si modifica dalla scheda Lega
      // la vecchia disponibilità 'singola' è l'asta a copie con 1 copia; il listone si compra sempre a quotazione
      if (out.disponibilita === 'singola') { out.disponibilita = 'quote'; out.copieAtleta = 1; }
      if (E.modalita(out) === 'listone') out.prezzoSvincolati = 'quotazione';
      return FS.act.salvaSettings(out).then(function () { setDraft(null); });
    }
    function onSalva() {
      if (errs.length) { errore(errs[0]); return null; }
      if (d.lega.stato !== 'iscrizioni') {
        ask({
          title: 'Salvare le nuove regole?', yes: 'Salva regole', run: salva,
          text: 'La lega è già partita: i punteggi delle giornate non ancora ufficiali si ricalcolano subito con le nuove regole. Le giornate ufficiali restano come sono finché non le riapri.',
        });
        return null;
      }
      return salva();
    }
    function ripristina() {
      var patch = FS.impostazioniModalita(modo, true);
      ask({
        title: 'Ripristinare i valori consigliati?', yes: 'Ripristina',
        text: 'Tutte le regole tornano ai valori consigliati per la modalità «' + UI.modalita(cur).nome + '»: ' + (listone
          ? patch.crediti + ' crediti di budget (il 75% della squadra dei sogni) e rosa da ' + patch.rosa
          : patch.crediti + ' crediti' + (nSq && nAttivi ? ', rosa e copie per atleta adatte a ' + nAttivi + ' atleti e ' + nSq + (nSq === 1 ? ' squadra' : ' squadre') : ', rosa da ' + patch.rosa + ' e ' + patch.copieAtleta + ' copie per atleta'))
          + '. Le modifiche diventano effettive solo dopo «Salva regole».',
        run: function () {
          var x = FS.clone(E.DEFAULT_SETTINGS);
          Object.keys(patch).forEach(function (k) { x[k] = patch[k]; });
          x.giornataIniziale = d.settings.giornataIniziale || 1;
          setDraft(x);
        },
      });
    }

    function numField(id, label, k, opts) {
      opts = opts || {};
      return html`<${UI.Field} id=${id} label=${label} help=${opts.help || ''}>
        <${NumInput} id=${id} value=${cur[k]} step=${opts.step || 1} min=${opts.min} disabled=${dis || !!opts.disabled}
          onChange=${function (v) { set(k, opts.int ? Math.round(v) : v); }}/>
      <//>`;
    }
    function checkField(id, label, k, help) {
      return html`<div class="field">
        <label class="check" htmlFor=${id} style=${{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--f-body)', fontSize: '14px', color: 'var(--ink)', fontWeight: 500 }}>
          <input id=${id} type="checkbox" checked=${!!cur[k]} disabled=${dis} onChange=${function (e) { set(k, e.target.checked); }}/> ${label}
        </label>
        ${help ? html`<span class="help">${help}</span>` : null}
      </div>`;
    }

    return html`<div class="stack">
      ${!canAdmin ? html`<div class="banner warn">Solo il presidente della lega può modificare le regole: qui le vedi in sola lettura.</div>` : null}
      ${dirty ? html`<div class="banner warn pz-dirty" style=${{ justifyContent: 'space-between' }}>
        <span><b>Modifiche non salvate.</b> Diventano effettive solo dopo «Salva regole».</span>
        <span class="row">
          <button type="button" class="btn sm ghost" onClick=${function () { setDraft(null); }}>Annulla modifiche</button>
          <${UI.AsyncBtn} cls="sm" disabled=${!canAdmin || errs.length > 0} onClick=${onSalva}>Salva regole<//>
        </span>
      </div>` : null}
      ${dirty ? html`<div class="pz-savebar" role="region" aria-label="Modifiche non salvate">
        <button type="button" class="pz-sb-fv" onClick=${function () { var el = document.getElementById('pz-anteprima'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }}>
          <span class="tiny muted">FV esempio</span><b>${anteprima.sv ? 's.v.' : UI.fmt(anteprima.fv)}</b>
        </button>
        ${errs.length ? html`<span class="tag red">${errs.length === 1 ? '1 errore' : errs.length + ' errori'}</span>` : null}
        <button type="button" class="btn ghost" onClick=${function () { setDraft(null); }}>Annulla</button>
        <${UI.AsyncBtn} disabled=${!canAdmin || errs.length > 0} onClick=${onSalva}>Salva regole<//>
      </div>` : null}
      <div class="grid grid-main">
        <div class="stack">
          <${UI.Card} title="Modalità, rosa e crediti">
            <${UI.ModalitaScelta} id="r-modalita" value=${modo} onChange=${cambiaModo} disabled=${dis || !!bloccoModo} copie=${listone ? consModo.copie.copieAtleta : K} numeri=${{ copie: numeriModo('copie'), listone: numeriModo('listone') }}/>
            <p class="tiny faint" style=${{ margin: '8px 0 0' }}>${bloccoModo
              ? html`<${React.Fragment}><b>La modalità non si può più cambiare</b> (si sceglie prima che le squadre prendano atleti). ${bloccoModo}<//>`
              : 'Si sceglie prima che le squadre prendano atleti. Cambiando modalità, crediti e rosa passano ai valori consigliati per quella modalità.'}</p>
            <div class="form-grid" style=${{ marginTop: '14px' }}>
              ${numField('r-crediti', listone ? 'Budget per squadra (crediti)' : 'Crediti per squadra', 'crediti', { min: 1, int: true, help: listone ? 'Uguale per tutti.' : '' })}
              ${numField('r-rosa', 'Atleti in rosa', 'rosa', { min: 1, int: true, help: 'Titolari più panchina.' })}
              <${UI.Field} id="r-titolari" label="Titolari" help="Fisso: cinque in pedana.">
                <input id="r-titolari" class="input num" type="number" readOnly=${true} value=${cur.titolari}/>
              <//>
              ${!listone ? html`<${UI.Field} id="regole-copie" label="Copie per atleta" help="In quante squadre al massimo può stare lo stesso atleta (mai due volte nella stessa). 1 = asta classica.">
                <${NumInput} id="regole-copie" value=${K} min="1" max="15" step="1" disabled=${dis} onChange=${function (v) { setMolti({ disponibilita: 'quote', copieAtleta: Math.round(v) }); }}/>
              <//>` : null}
              ${!listone ? numField('r-offerta-minima', 'Offerta minima', 'offertaMinima', { min: 0, int: true, help: 'Crediti.' }) : null}
              ${!listone ? numField('r-timer', 'Timer d\'asta (secondi)', 'timerAsta', { min: 5, int: true, help: 'Riparte a ogni rilancio.' }) : null}
              ${!listone ? html`<${UI.Field} id="r-prezzo-svincolati" label="Prezzo al mercato" help=${K > 1 ? 'Anche per le copie libere.' : ''}>
                <select id="r-prezzo-svincolati" class="input" value=${cur.prezzoSvincolati} disabled=${dis} onChange=${function (e) { set('prezzoSvincolati', e.target.value); }}>
                  <option value="quotazione">Quotazione attuale (Qt.A)</option>
                  <option value="uno">1 credito</option>
                </select>
              <//>` : null}
              <${UI.Field} id="r-rimborso" label="Rimborso allo svincolo (%)" help=${listone ? 'Durante la composizione delle rose il rimborso è sempre pieno.' : 'Quota del prezzo pagato restituita.'}>
                <${NumInput} id="r-rimborso" value=${Math.round(num(cur.rimborsoSvincolo) * 100)} min="0" max="100" step="5" disabled=${dis} onChange=${function (v) { set('rimborsoSvincolo', v / 100); }}/>
              <//>
            </div>
            ${consQuote ? html`<div class="small muted" style=${{ marginTop: '12px' }}>
              <p style=${{ margin: 0 }}>Con ${nAttivi} atleti attivi e ${nSq} squadre si consigliano rose da <b>${consQuote.rosa}</b> atleti e <b>${consQuote.copie}</b> ${consQuote.copie === 1 ? 'copia' : 'copie'} per atleta.${canAdmin && (num(cur.rosa) !== consQuote.rosa || K !== consQuote.copie) ? html`<${React.Fragment}> <button type="button" class="linkbtn small" onClick=${function () { setMolti({ disponibilita: 'quote', rosa: consQuote.rosa, copieAtleta: consQuote.copie }); }}>Usa questi valori</button><//>` : null}</p>
              <p style=${{ margin: '4px 0 0' }} class=${copieTot < posti ? 'pz-alert' : ''}>${copieTot < posti
                ? 'Con queste regole servono ' + posti + ' posti in rosa ma le copie sono solo ' + copieTot + ': non tutte le rose si potranno completare.'
                : 'Con queste regole: ' + posti + ' posti in rosa su ' + copieTot + ' copie, ne restano ' + (copieTot - posti) + ' libere per il mercato.'}</p>
            </div>` : null}
            ${listone ? html`<div class="small muted" style=${{ marginTop: '12px' }}>
              <p style=${{ margin: 0 }}>Budget consigliato: <b>${budgetCons} crediti</b>. ${sogniOk ? 'È il 75% di quanto costerebbe la squadra dei sogni: i ' + T + ' più quotati (' + sogni.titolari + ' crediti) con la panchina al prezzo più basso (' + (sogni.panchina === 1 ? '1 credito' : sogni.panchina + ' crediti') + '). Così nessuno può comprare tutti i migliori: o un campione con tanti gregari, o una squadra equilibrata.' : 'Il listone non ha ancora abbastanza atleti attivi per calcolarlo dalle quotazioni: ricontrollalo dopo aver importato gli atleti da 4Fence.'}${canAdmin && num(cur.crediti) !== budgetCons ? html`<${React.Fragment}> <button type="button" class="linkbtn small" onClick=${function () { set('crediti', budgetCons); }}>Usa questo valore</button><//>` : null}</p>
            </div>` : null}
            ${listone && sogniOk && num(cur.crediti) >= sogni.totale ? html`<div class="banner warn small" style=${{ marginTop: '12px' }}><span><b>Attenzione:</b> con ${num(cur.crediti)} crediti ogni squadra può comprare i ${T} più quotati (${sogni.totale} crediti con la panchina): le squadre rischiano di essere tutte uguali.</span></div>` : null}
            ${listone && d.lega.stato !== 'campionato' && d.giocate.length ? html`<div class="banner warn small" style=${{ marginTop: '12px' }}><span>La prima giornata valida (G${d.settings.giornataIniziale || 1}) ha già chiuso le formazioni: con il listone le rose si compongono solo fino a quella scadenza. Sposta più avanti la prima giornata valida nella scheda Lega.</span></div>` : null}
            ${esuberi ? html`<div class="banner warn small" style=${{ marginTop: '12px' }}><span><b>Attenzione:</b> con queste copie ${esuberi === 1 ? '1 acquisto già fatto supera' : esuberi + ' acquisti già fatti superano'} il numero di squadre consentito per atleta. Dopo il salvataggio ${esuberi === 1 ? 'verrebbe ignorato' : 'i più recenti verrebbero ignorati'} e i crediti tornerebbero alle squadre.</span></div>` : null}
          <//>

          <${UI.Card} title="Vincoli di ruolo in rosa" meta="vuoto = nessun vincolo">
            <div class="grid grid-3">${E.ORDINE_RUOLI.map(function (r) {
              return html`<${RuoloLimiti} key=${r} ruolo=${r} lim=${(cur.ruoliRosa || {})[r]} rosa=${cur.rosa} disabled=${dis} onChange=${function (lim) { setRuolo(r, lim); }}/>`;
            })}</div>
          <//>

          <${UI.Card} title="Formazione e sostituzioni">
            <div class="form-grid">
              ${checkField('r-modulo-libero', 'Modulo libero', 'moduloLibero', 'Qualunque combinazione di ruoli tra i titolari.')}
              <${UI.Field} id="r-moduli" label="Moduli ammessi (U14-U20-SEN)" help="Separati da virgola, es. 3-1-1, 2-2-1." style=${FULL}>
                <${ListInput} id="r-moduli" value=${cur.moduli} parse=${parseModuli} disabled=${dis || cur.moduloLibero} placeholder="3-1-1, 2-2-1" onChange=${function (v) { set('moduli', v); }}/>
              <//>
              ${numField('r-max-sost', 'Sostituzioni massime', 'maxSostituzioni', { min: 0, int: true, help: 'Dalla panchina, in ordine.' })}
              ${checkField('r-stesso-ruolo', 'Sostituzioni solo nello stesso ruolo', 'sostituzioniStessoRuolo', '')}
              ${numField('r-voto-ufficio', 'Voto d\'ufficio', 'votoUfficio', { step: 0.5, help: 'Titolare assente senza sostituto.' })}
            </div>
          <//>

          <${UI.Card} title="Classifica">
            <div class="form-grid">
              <${UI.Field} id="r-classifica" label="Tipo di classifica">
                <select id="r-classifica" class="input" value=${cur.classifica} disabled=${dis} onChange=${function (e) { set('classifica', e.target.value); }}>
                  <option value="punti">Somma dei fantapunti</option>
                  <option value="f1">Punti Formula 1 per giornata</option>
                </select>
              <//>
              <${UI.Field} id="r-punti-f1" label="Punti F1 (1°, 2°, 3°…)" help="A parità: fantapunti, giornate vinte, miglior punteggio.">
                <${ListInput} id="r-punti-f1" value=${cur.puntiF1} parse=${parseNumeri} disabled=${dis || cur.classifica !== 'f1'} placeholder="25, 18, 15, 12, 10" onChange=${function (v) { set('puntiF1', v); }}/>
              <//>
            </div>
          <//>

          <${UI.Card} title="Punteggio (fantavoto)" meta="bonus positivi, malus negativi">
            ${gruppi.map(function (g) {
              if (!g.k.length) return null;
              return html`<div key=${g.t}>
                <div class="eyebrow" style=${{ margin: '12px 0 8px', color: 'var(--accent)' }}>${g.t}</div>
                <div class="form-grid" style=${P_GRID}>${g.k.map(function (k) {
                  var et = ETICHETTE_P[k] || [k, ''];
                  return html`<${UI.Field} key=${k} id=${'p-' + k} label=${et[0]} help=${et[1]}>
                    <${NumInput} id=${'p-' + k} value=${(cur.punteggio || {})[k]} step=${SOGLIE[k] || 0.05} disabled=${dis} onChange=${function (v) { setP(k, v); }}/>
                  <//>`;
                })}</div>
              </div>`;
            })}
          <//>
        </div>

        <div style=${{ alignSelf: 'stretch' }}>
          <div class="stack pz-side" id="pz-anteprima">
            <${UI.Card} title="Anteprima fantavoto" meta="con le regole in modifica" cls="pz-anteprima">
              <${UI.Field} id="anteprima-esempio" label="Esempio di gara">
                <select id="anteprima-esempio" class="input" value=${es.id} onChange=${function (e) { stEs[1](e.target.value); }}>
                  ${ESEMPI.map(function (x) { return html`<option key=${x.id} value=${x.id}>${x.label}</option>`; })}
                </select>
              <//>
              <p class="small muted">${es.desc}</p>
              <div class="row between" style=${{ marginBottom: '8px' }}><span class="eyebrow">Fantavoto</span><${UI.FV} v=${anteprima.sv ? null : anteprima.fv} base=${base}/></div>
              <${UI.Voci} voci=${anteprima.voci}/>
            <//>
            <${UI.Card} title="Salva">
              ${errs.length ? html`<ul class="small" style=${ERR_LIST}>${errs.map(function (e, i) { return html`<li key=${i}>${e}</li>`; })}</ul>` : null}
              <div class="stack" style=${{ gap: '8px', marginTop: errs.length ? '12px' : 0 }}>
                <${UI.AsyncBtn} cls="block" disabled=${!canAdmin || !dirty || errs.length > 0} onClick=${onSalva}>Salva regole<//>
                <button type="button" class="btn ghost block" disabled=${!canAdmin} title=${'Valori consigliati per la modalità «' + UI.modalita(cur).nome + '»'} onClick=${ripristina}>Ripristina valori consigliati</button>
                ${dirty ? html`<button type="button" class="btn ghost block" onClick=${function () { setDraft(null); }}>Annulla modifiche</button>` : null}
              </div>
            <//>
          </div>
        </div>
      </div>
      ${askS[0]}
    </div>`;
  }

  // ============================================================= 3. SQUADRE
  function RettificaCrediti(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var stD = useState(null);
    var stN = useState('');
    var askS = useAsk();
    var canAdmin = d.isAdmin && s.canWrite;
    var sq = s.squadre[p.teamId];
    var r = d.rose[p.teamId];
    var delta = stD[0];
    var storico = s.movimenti.filter(function (m) { return m.tipo === 'crediti' && m.teamId === p.teamId; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    if (!sq || !r) return html`<${UI.Modal} title="Rettifica crediti" onClose=${p.onClose}><${UI.Empty} title="Squadra non trovata"/><//>`;
    function applica() {
      if (!delta) { errore('Indica di quanti crediti correggere (positivo o negativo).'); return null; }
      return FS.act.rettificaCrediti(p.teamId, delta, stN[0].trim()).then(p.onClose);
    }
    function annulla(m) {
      askS[1]({
        title: 'Annullare la rettifica?', yes: 'Annulla rettifica', danger: true,
        text: 'La correzione di ' + UI.segno(m.delta) + ' crediti' + (m.nota ? ' («' + m.nota + '»)' : '') + ' non verrà più conteggiata.',
        run: function () { return FS.act.annullaMovimento(m.id); },
      });
    }
    return html`<${UI.Modal} title=${'Crediti · ' + sq.nome} onClose=${p.onClose} footer=${html`<${React.Fragment}>
        <button type="button" class="btn ghost" onClick=${p.onClose}>Chiudi</button>
        <${UI.AsyncBtn} disabled=${!canAdmin || !delta} onClick=${applica}>Applica<//>
      <//>`}>
      <div class="form-grid">
        <${UI.Field} id="rett-cr-delta" label="Correzione (crediti)" help="Positiva per aggiungere, negativa per togliere.">
          <${NumInput} id="rett-cr-delta" value=${delta} step="1" allowEmpty=${true} disabled=${!canAdmin} onChange=${function (v) { stD[1](v === null ? null : Math.round(v)); }}/>
        <//>
        <${UI.Field} id="rett-cr-nota" label="Motivo">
          <input id="rett-cr-nota" class="input" maxLength="120" placeholder="Es. errore nel lotto 12" value=${stN[0]} disabled=${!canAdmin} onInput=${function (e) { stN[1](e.target.value); }}/>
        <//>
      </div>
      <p class="small">Crediti attuali: <b>${r.crediti}</b>${delta ? html`<span> → dopo la correzione: <b>${r.crediti + delta}</b></span>` : null}</p>
      ${storico.length ? html`<div>
        <div class="eyebrow" style=${{ margin: '6px 0' }}>Rettifiche precedenti</div>
        <div class="list">${storico.map(function (m) {
          return html`<div class="li" key=${m.id} style=${{ padding: '6px 2px' }}>
            <span class=${'tag ' + (m.annullato ? '' : m.delta > 0 ? 'green' : 'red')}>${UI.segno(m.delta)}</span>
            <div class="body"><div class="small" style=${{ textDecoration: m.annullato ? 'line-through' : 'none' }}>${m.nota || 'Senza motivo'}</div><div class="tiny faint">${m.at ? UI.dataOra(m.at) : ''}${m.annullato ? ' · annullata' : ''}</div></div>
            ${m.annullato ? null : html`<button type="button" class="btn xs ghost" disabled=${!canAdmin} onClick=${function () { annulla(m); }}>Annulla</button>`}
          </div>`;
        })}</div>
      </div>` : null}
      ${askS[0]}
    <//>`;
  }

  function formazioneIniziale(team, n, rosaIds) {
    var eff = team && n ? FS.formazioneEffettiva(team, n) : null;
    var inRosa = function (id) { return rosaIds.indexOf(id) >= 0; };
    var tit = eff ? (eff.titolari || []).filter(inRosa) : [];
    var pan = eff ? (eff.panchina || []).filter(function (id) { return inRosa(id) && tit.indexOf(id) < 0; }) : [];
    rosaIds.forEach(function (id) { if (tit.indexOf(id) < 0 && pan.indexOf(id) < 0) pan.push(id); });
    return { f: { titolari: tit, panchina: pan }, eff: eff };
  }

  function FormazioneUfficio() {
    var s = FS.useFS();
    var d = FS.derived();
    var stT = useState('');
    var stG = useState('');
    var stF = useState({ key: '', f: null });
    var canAdmin = d.isAdmin && s.canWrite;
    var gDef = d.prossima || d.inCorso || d.ultima || d.giornate[0] || null;
    var team = d.teamIds.indexOf(stT[0]) >= 0 ? stT[0] : (d.teamIds[0] || '');
    var n = stG[0] && s.giornate[stG[0]] ? Number(stG[0]) : (gDef ? gDef.n : 0);
    var key = team + '|' + n;
    var rosaIds = team && d.rose[team] ? d.rose[team].rosa.map(function (x) { return x.id; }) : [];
    var iniz = useMemo(function () { return formazioneIniziale(team, n, rosaIds); }, [key, s.version]);

    if (!d.teamIds.length) return html`<${UI.Card} title="Formazione d'ufficio"><${UI.Empty} title="Nessuna squadra">Servono squadre iscritte.<//><//>`;
    if (!d.giornate.length) return html`<${UI.Card} title="Formazione d'ufficio"><${UI.Empty} title="Calendario vuoto">Crea prima le giornate nella sezione Calendario.<//><//>`;

    var modificata = stF[0].key === key && !!stF[0].f;
    var f = modificata ? stF[0].f : iniz.f;
    var T = d.settings.titolari;
    function setF(x) { stF[1]({ key: key, f: x }); }
    function toggle(id) {
      var x = { titolari: f.titolari.slice(), panchina: f.panchina.slice() };
      var i = x.titolari.indexOf(id);
      if (i >= 0) {
        x.titolari.splice(i, 1);
        x.panchina.push(id);
      } else {
        if (x.titolari.length >= T) { errore('Ci sono già ' + T + ' titolari: togline uno prima.'); return; }
        x.panchina = x.panchina.filter(function (b) { return b !== id; });
        x.titolari.push(id);
      }
      setF(x);
    }
    function sposta(i, dir) {
      var j = i + dir;
      if (j < 0 || j >= f.panchina.length) return;
      var pan = f.panchina.slice();
      var t = pan[i]; pan[i] = pan[j]; pan[j] = t;
      setF(Object.assign({}, f, { panchina: pan }));
    }
    function salva() {
      return FS.act.salvaFormazioneAdmin(team, n, { titolari: f.titolari, panchina: f.panchina })
        .then(function () { stF[1]({ key: '', f: null }); });
    }
    var errs = team && n ? E.validaFormazione(f, rosaIds, s.atleti, d.settings, d.stagione) : [];
    var salvata = s.formazioni[n + '__' + team];
    var eff = iniz.eff;
    var origine = salvata
      ? (salvata.daAdmin ? html`<span class="tag blue">Inserita dalla presidenza</span>` : html`<span class="tag green">Salvata dal giocatore</span>`)
      : eff ? html`<span class="tag gold">Vale l'ultima formazione (G${eff.salvataPer})</span>` : html`<span class="tag red">Nessuna formazione</span>`;
    var g = s.giornate[n];
    var scad = g ? d.scadenza(g) : 0;
    var uff = s.esiti[n] && s.esiti[n].ufficiale;
    var nomeT = function (id) { return nomeAtl(s, id, true); };

    return html`<${UI.Card} title="Formazione d'ufficio" meta="per chi non è riuscito a schierarla">
      <p class="small muted" style=${{ marginTop: 0 }}>Inserisci o correggi la formazione di una squadra per una giornata: vale come se l'avesse salvata il giocatore, anche dopo la scadenza.</p>
      <div class="form-grid">
        <${UI.Field} id="uff-team" label="Squadra">
          <select id="uff-team" class="input" value=${team} onChange=${function (e) { stT[1](e.target.value); }}>
            ${d.teamIds.map(function (t) { return html`<option key=${t} value=${t}>${(s.squadre[t] && s.squadre[t].nome) || 'Squadra'}</option>`; })}
          </select>
        <//>
        <${UI.Field} id="uff-giornata" label="Giornata">
          <select id="uff-giornata" class="input" value=${String(n)} onChange=${function (e) { stG[1](e.target.value); }}>
            ${d.giornate.map(function (x) { return html`<option key=${x.n} value=${String(x.n)}>${'G' + x.n + ' · ' + nomeGiornata(x)}</option>`; })}
          </select>
        <//>
      </div>
      <div class="row" style=${{ margin: '10px 0' }}>
        ${origine}
        ${scad ? html`<span class="tiny muted">${scad > FS.now() ? 'Scadenza: ' : 'Scaduta: '}${UI.dataOra(scad)}</span>` : null}
      </div>
      ${uff ? html`<div class="banner warn small">Questa giornata è già ufficiale: dopo aver salvato, riaprila e ufficializzala di nuovo (sezione Giornate) per aggiornare i punteggi.</div>` : null}
      ${!rosaIds.length ? html`<div class="small muted">La rosa di questa squadra è vuota.</div>` : html`<div>
        <div class="eyebrow" style=${{ margin: '12px 0 6px' }}>Titolari ${f.titolari.length}/${T}${f.titolari.length === T ? ' · modulo ' + E.moduloDi(f.titolari, s.atleti, d.stagione) : ''}</div>
        <div class="row" style=${{ gap: '6px' }}>${rosaIds.map(function (id) {
          var a = s.atleti[id];
          var on = f.titolari.indexOf(id) >= 0;
          return html`<button type="button" key=${id} class="pill" aria-pressed=${on} disabled=${!canAdmin} onClick=${function () { toggle(id); }}>
            ${a ? html`<${UI.Role} ruolo=${E.ruoloAtleta(a, d.stagione)}/>` : null}${nomeT(id)}
          </button>`;
        })}</div>
        <div class="tiny faint" style=${{ marginTop: '4px' }}>Tocca un atleta per metterlo tra i titolari o in panchina.</div>
        <div class="eyebrow" style=${{ margin: '14px 0 6px' }}>Panchina · ordine di ingresso</div>
        ${f.panchina.length ? html`<div class="list">${f.panchina.map(function (id, i) {
          return html`<div class="li" key=${id} style=${{ padding: '6px 2px' }}>
            <span class="pos" style=${{ width: '24px' }}>${i + 1}</span>
            <div class="body"><div class="title small">${nomeT(id)}</div></div>
            <button type="button" class="iconbtn" aria-label=${'Sposta su ' + nomeT(id)} disabled=${!canAdmin || i === 0} onClick=${function () { sposta(i, -1); }}>↑</button>
            <button type="button" class="iconbtn" aria-label=${'Sposta giù ' + nomeT(id)} disabled=${!canAdmin || i === f.panchina.length - 1} onClick=${function () { sposta(i, 1); }}>↓</button>
          </div>`;
        })}</div>` : html`<div class="small muted">Nessun atleta in panchina.</div>`}
      </div>`}
      ${errs.length ? html`<ul class="small" style=${ERR_LIST}>${errs.map(function (e, i) { return html`<li key=${i}>${e}</li>`; })}</ul>` : null}
      <div class="row" style=${ACTIONS}>
        ${modificata ? html`<button type="button" class="btn ghost sm" onClick=${function () { stF[1]({ key: '', f: null }); }}>Annulla modifiche</button>` : null}
        <${UI.AsyncBtn} cls="sm" disabled=${!canAdmin || errs.length > 0 || !rosaIds.length} onClick=${salva}>Salva formazione d'ufficio<//>
      </div>
    <//>`;
  }

  function TabSquadre() {
    var s = FS.useFS();
    var d = FS.derived();
    var stR = useState(null);
    var askS = useAsk();
    var canAdmin = d.isAdmin && s.canWrite;
    var admins = d.lega.adminIds || [];
    function elimina(t) {
      var sq = s.squadre[t];
      askS[1]({
        title: 'Eliminare la squadra?', danger: true, yes: 'Elimina squadra',
        text: (t === s.uid ? 'È la tua squadra. ' : '') + '«' + (sq ? sq.nome : 'Squadra') + '» di ' + FS.nomeGiocatore((sq && sq.ownerId) || t) + ' esce dalla lega: ' + (d.settings.disponibilita === 'quote' ? 'le copie dei suoi atleti tornano libere' : d.settings.disponibilita === 'multipla' ? 'la sua rosa si svuota' : 'i suoi atleti tornano svincolati') + ' e le sue formazioni non contano più. L\'operazione non si può annullare.',
        run: function () { return FS.act.eliminaSquadra(t); },
      });
    }
    var errRose = d.erroriRose || [];
    return html`<div class="stack">
      ${errRose.length ? html`<div class="banner warn small"><div><b>${errRose.length} movimenti di mercato ignorati</b> perché non più validi (atleta già in rosa, copie finite o scambio superato).
        <details class="more"><summary>Dettagli</summary><ul style=${{ margin: '6px 0 0', paddingLeft: '18px' }}>${errRose.slice(0, 20).map(function (x, i) {
          var m = x.m || {};
          return html`<li key=${i}>${m.tipo || 'movimento'}${m.atletaId ? ' · ' + nomeAtl(s, m.atletaId) : ''}${m.teamId ? ' · ' + FS.nomeSquadra(m.teamId) : ''}: ${x.err === 'copie esaurite' ? 'copie finite' : x.err}</li>`;
        })}</ul></details></div></div>` : null}
      <${UI.Card} title="Squadre iscritte" meta=${d.teamIds.length === 1 ? '1 squadra' : d.teamIds.length + ' squadre'}>
        ${d.teamIds.length ? html`<div class="list">${d.teamIds.map(function (t) {
          var sq = s.squadre[t];
          var r = d.rose[t] || { crediti: d.settings.crediti, rosa: [], spesi: 0 };
          var owner = (sq && sq.ownerId) || t;
          return html`<div class="li" key=${t} style=${{ alignItems: 'flex-start' }}>
            <${UI.TeamMask} team=${sq} size=${44}/>
            <div class="body">
              <div class="row between" style=${{ gap: '6px' }}>
                <div style=${{ minWidth: 0 }}>
                  <div class="title">${sq ? sq.nome : 'Squadra'}</div>
                  <div class="sub">${FS.nomeGiocatore(owner)}${admins.indexOf(owner) >= 0 ? ' · presidenza' : ''}</div>
                </div>
                <span class="tag blue">${r.crediti} crediti</span>
              </div>
              <div class="tiny muted" style=${{ margin: '4px 0' }}>Rosa ${r.rosa.length}/${d.settings.rosa} · spesi ${r.spesi} crediti</div>
              ${r.rosa.length ? html`<div class="row pz-rosa" style=${{ gap: '4px' }}>${r.rosa.map(function (x) {
                return html`<button type="button" key=${x.id} class="tag" style=${{ cursor: 'pointer' }} title="Apri la scheda" onClick=${function () { if (UI.openAtleta) UI.openAtleta(x.id); }}>${nomeAtl(s, x.id, true)} · ${x.prezzo}</button>`;
              })}</div>` : null}
              <div class="row pz-sq-act" style=${{ marginTop: '8px', gap: '6px' }}>
                <button type="button" class="btn xs ghost" disabled=${!canAdmin} onClick=${function () { stR[1](t); }}>Rettifica crediti</button>
                <button type="button" class="btn xs danger" disabled=${!canAdmin} onClick=${function () { elimina(t); }}>Elimina</button>
              </div>
            </div>
          </div>`;
        })}</div>` : html`<${UI.Empty} title="Nessuna squadra iscritta">Condividi il codice ${d.lega.codice} per far entrare gli amici.<//>`}
      <//>
      <${FormazioneUfficio}/>
      ${stR[0] ? html`<${RettificaCrediti} teamId=${stR[0]} onClose=${function () { stR[1](null); }}/>` : null}
      ${askS[0]}
    </div>`;
  }

  // ========================================================== 4. CALENDARIO
  function nuovaGiornata(d) {
    var last = d.giornate[d.giornate.length - 1];
    var dal = last ? addGiorni(last.al, 1) : d.oggi;
    var dt = parseIso(dal);
    var al = dt && dt.getDate() === 1 ? isoLocale(new Date(dt.getFullYear(), dt.getMonth() + 1, 0)) : addGiorni(dal, 29);
    var n = last ? last.n + 1 : 1;
    return { n: n, nome: 'Giornata ' + n, dal: dal, al: al, scadenza: scadenzaDefault(dal), note: '', gareAttese: [] };
  }

  function GaraAttesaRow(p) {
    var x = p.x, idp = 'ga-' + p.i;
    var cats = x.categorie || [];
    function toggleCat(c) { p.onChange({ categorie: cats.indexOf(c) >= 0 ? cats.filter(function (k) { return k !== c; }) : cats.concat([c]) }); }
    return html`<div style=${BLOCK}>
      <div class="row between"><b class="small">Gara prevista ${p.i + 1}</b><button type="button" class="btn xs ghost" onClick=${p.onRemove}>Rimuovi</button></div>
      <div class="form-grid">
        <${UI.Field} id=${idp + '-nome'} label="Nome" style=${FULL}>
          <input id=${idp + '-nome'} class="input" maxLength="100" placeholder="Es. 1ª prova regionale GPG" value=${x.nome || ''} onInput=${function (e) { p.onChange({ nome: e.target.value }); }}/>
        <//>
        <${UI.Field} id=${idp + '-data'} label="Data">
          <input id=${idp + '-data'} class="input" type="date" value=${x.data || ''} onInput=${function (e) { p.onChange({ data: e.target.value }); }}/>
        <//>
        <${UI.Field} id=${idp + '-luogo'} label="Luogo">
          <input id=${idp + '-luogo'} class="input" maxLength="60" placeholder="Es. Vigevano (PV)" value=${x.luogo || ''} onInput=${function (e) { p.onChange({ luogo: e.target.value }); }}/>
        <//>
        <${UI.Field} id=${idp + '-livello'} label="Livello">
          <select id=${idp + '-livello'} class="input" value=${x.livello || 'regionale'} onChange=${function (e) { p.onChange({ livello: e.target.value }); }}>
            ${LIVELLI.map(function (l) { return html`<option key=${l.v} value=${l.v}>${l.l}</option>`; })}
          </select>
        <//>
        <${UI.Field} id=${idp + '-sesso'} label="Sesso">
          <select id=${idp + '-sesso'} class="input" value=${x.sesso || 'MF'} onChange=${function (e) { p.onChange({ sesso: e.target.value }); }}>
            <option value="MF">Maschile e femminile</option>
            <option value="M">Maschile</option>
            <option value="F">Femminile</option>
          </select>
        <//>
        <${UI.Field} id=${idp + '-arma'} label="Arma">
          <select id=${idp + '-arma'} class="input" value=${x.arma || 'SP'} onChange=${function (e) { p.onChange({ arma: e.target.value }); }}>
            ${ARMI.map(function (a) { return html`<option key=${a.v} value=${a.v}>${a.l}</option>`; })}
          </select>
        <//>
      </div>
      <div>
        <div class="lbl" id=${idp + '-cat-l'}>Categorie</div>
        <div class="row" role="group" aria-labelledby=${idp + '-cat-l'} style=${{ gap: '5px', marginTop: '5px' }}>
          ${E.CATEGORIE.map(function (c) {
            return html`<button type="button" key=${c.code} class="pill" style=${PILL_SM} aria-pressed=${cats.indexOf(c.code) >= 0} title=${c.label} onClick=${function () { toggleCat(c.code); }}>${c.short}</button>`;
          })}
        </div>
        <div class="tiny faint" style=${{ marginTop: '4px' }}>Nessuna selezionata = tutte le categorie.</div>
      </div>
    </div>`;
  }

  function GiornataEditor(p) {
    var s = FS.useFS();
    var d = FS.derived();
    // giornate vecchie senza scadenza: si parte dal valore predefinito (il giorno prima dell'inizio alle 23:59)
    var stG = useState(function () { var g = FS.clone(p.g); g.gareAttese = g.gareAttese || []; if (!g.scadenza && g.dal) g.scadenza = scadenzaDefault(g.dal); return g; });
    var stA = useState(!!p.nuova || !p.g.scadenza);
    var canComm = d.gestisceCircuito && s.canWrite;
    var g = stG[0];
    var n = Math.round(num(g.n, 0));
    function set(k, v) {
      var x = Object.assign({}, g);
      x[k] = v;
      if (k === 'dal' && stA[0]) x.scadenza = scadenzaDefault(v);
      stG[1](x);
    }
    function setGa(i, patch) { var list = g.gareAttese.slice(); list[i] = Object.assign({}, list[i], patch); set('gareAttese', list); }
    function addGa() { set('gareAttese', g.gareAttese.concat([{ nome: '', data: g.dal || '', luogo: '', livello: 'regionale', categorie: [], sesso: 'MF', arma: 'SP' }])); }
    function delGa(i) { set('gareAttese', g.gareAttese.filter(function (_, j) { return j !== i; })); }

    var errs = [];
    if (!(n >= 1)) errs.push('Il numero della giornata deve essere almeno 1.');
    if (p.nuova && s.giornate[n]) errs.push('Esiste già la giornata ' + n + ': scegli un altro numero o modifica quella.');
    if (!g.dal || !g.al) errs.push('Indica inizio e fine della finestra.');
    else if (g.al < g.dal) errs.push('La fine deve venire dopo l\'inizio.');
    if (!g.scadenza) errs.push('Indica la scadenza delle formazioni.');
    var finestraOk = g.dal && g.al && g.al >= g.dal;
    var sovrapposte = finestraOk ? d.giornate.filter(function (o) { return o.n !== n && o.dal <= g.al && o.al >= g.dal; }) : [];
    var gareDentro = finestraOk ? E.gareDellaGiornata(g, s.gare) : [];
    var inizioMs = g.dal ? (parseIso(g.dal) || new Date(0)).getTime() : 0;
    var scadTardi = g.scadenza && inizioMs && g.scadenza > inizioMs;

    function salva() {
      if (errs.length) { errore(errs[0]); return null; }
      var out = FS.clone(g);
      delete out._id;
      out.n = n;
      out.nome = String(out.nome || '').trim() || 'Giornata ' + n;
      out.note = String(out.note || '').trim();
      out.gareAttese = (out.gareAttese || []).filter(function (x) { return String(x.nome || '').trim() || x.data; }).map(function (x) {
        return { nome: String(x.nome || '').trim(), data: x.data || '', luogo: String(x.luogo || '').trim(), livello: x.livello || 'regionale', categorie: x.categorie || [], sesso: x.sesso || 'MF', arma: x.arma || 'SP' };
      });
      return FS.act.salvaGiornata(out).then(p.onClose);
    }

    return html`<${UI.Modal} title=${p.nuova ? 'Nuova giornata' : 'Giornata ' + p.g.n} onClose=${p.onClose} footer=${html`<${React.Fragment}>
        ${errs.length ? html`<span class="tag red pz-f-err">${errs.length === 1 ? '1 errore' : errs.length + ' errori'}</span>` : null}
        <button type="button" class="btn ghost" onClick=${p.onClose}>Annulla</button>
        <${UI.AsyncBtn} disabled=${!canComm || errs.length > 0} onClick=${salva}>Salva giornata<//>
      <//>`}>
      <div class="form-grid">
        <${UI.Field} id="gio-n" label="Numero" help=${p.nuova ? '' : 'Per cambiare numero crea una nuova giornata.'}>
          <${NumInput} id="gio-n" value=${g.n} min="1" step="1" readOnly=${!p.nuova} onChange=${function (v) { set('n', Math.round(v)); }}/>
        <//>
        <${UI.Field} id="gio-nome" label="Nome">
          <input id="gio-nome" class="input" maxLength="60" placeholder=${'Giornata ' + n} value=${g.nome || ''} onInput=${function (e) { set('nome', e.target.value); }}/>
        <//>
        <${UI.Field} id="gio-dal" label="Dal">
          <input id="gio-dal" class="input" type="date" value=${g.dal || ''} onInput=${function (e) { set('dal', e.target.value); }}/>
        <//>
        <${UI.Field} id="gio-al" label="Al">
          <input id="gio-al" class="input" type="date" min=${g.dal || undefined} value=${g.al || ''} onInput=${function (e) { set('al', e.target.value); }}/>
        <//>
        <${UI.Field} id="gio-scadenza" label="Scadenza formazioni" style=${FULL} help=${stA[0] ? 'Automatica: il giorno prima dell\'inizio alle 23:59 (ora locale).' : 'Ora locale del tuo dispositivo.'}>
          <div class="row" style=${{ flexWrap: 'nowrap' }}>
            <input id="gio-scadenza" class="input grow" type="datetime-local" value=${msToLocal(g.scadenza)} onInput=${function (e) { stA[1](false); set('scadenza', localToMs(e.target.value)); }}/>
            <button type="button" class="btn sm ghost" disabled=${!g.dal} onClick=${function () { stA[1](true); stG[1](Object.assign({}, g, { scadenza: scadenzaDefault(g.dal) })); }}>Giorno prima</button>
          </div>
        <//>
        <${UI.Field} id="gio-note" label="Note" style=${FULL}>
          <textarea id="gio-note" class="input" maxLength="300" style=${{ minHeight: '60px', fontFamily: 'var(--f-body)', fontSize: '14px' }} value=${g.note || ''} onInput=${function (e) { set('note', e.target.value); }}></textarea>
        <//>
      </div>
      ${sovrapposte.length ? html`<div class="banner warn small" style=${{ marginTop: '10px' }}>La finestra si sovrappone a ${sovrapposte.map(function (o) { return 'G' + o.n + ' (' + UI.finestra(o) + ')'; }).join(', ')}: le gare nei giorni in comune conterebbero in entrambe.</div>` : null}
      ${scadTardi ? html`<div class="banner warn small" style=${{ marginTop: '10px' }}>La scadenza è dopo l'inizio della finestra: le gare dei primi giorni potrebbero essere già cominciate.</div>` : null}
      ${finestraOk ? html`<p class="small muted">Gare già importate in questa finestra: <b>${gareDentro.length}</b>${gareDentro.length ? ' (' + gareDentro.slice(0, 4).map(UI.nomeGara).join('; ') + (gareDentro.length > 4 ? '…' : '') + ')' : ''}.</p>` : null}

      <div class="row between" style=${{ margin: '16px 0 8px' }}>
        <div><div class="eyebrow">Gare previste</div><div class="tiny muted">Servono per le «probabili»: chi ha una gara della sua categoria in calendario.</div></div>
        <button type="button" class="btn sm ghost" onClick=${addGa}>+ Aggiungi gara</button>
      </div>
      ${g.gareAttese.length ? g.gareAttese.map(function (x, i) {
        return html`<${GaraAttesaRow} key=${i} i=${i} x=${x} onChange=${function (patch) { setGa(i, patch); }} onRemove=${function () { delGa(i); }}/>`;
      }) : html`<div class="small muted">Nessuna gara prevista.</div>`}

      ${errs.length ? html`<ul class="small" style=${ERR_LIST}>${errs.map(function (e, i) { return html`<li key=${i}>${e}</li>`; })}</ul>` : null}
    <//>`;
  }

  function TabCalendario() {
    var s = FS.useFS();
    var d = FS.derived();
    var stE = useState(null);
    var askS = useAsk();
    var canComm = d.gestisceCircuito && s.canWrite;
    var conteggi = useMemo(function () {
      var o = {};
      d.giornate.forEach(function (g) { o[g.n] = E.gareDellaGiornata(g, s.gare).length; });
      return o;
    }, [s.version]);
    var gIni = d.settings.giornataIniziale || 1;
    function elimina(g) {
      var nF = Object.values(s.formazioni).filter(function (f) { return Number(f.n) === g.n; }).length;
      var uff = s.esiti[g.n] && s.esiti[g.n].ufficiale;
      askS[1]({
        title: 'Eliminare la giornata?', danger: true, yes: 'Elimina giornata',
        text: '«' + nomeGiornata(g) + '» (' + UI.finestra(g) + ') sparisce dal calendario di tutte le leghe. I risultati delle gare restano, ma non conteranno più per questa giornata.'
          + (uff ? ' In questa lega la giornata è già ufficiale.' : '') + (nF ? ' Ci sono ' + nF + ' formazioni salvate per questa giornata.' : ''),
        run: function () { return FS.act.eliminaGiornata(g.n); },
      });
    }
    function apri(g) { stE[1]({ g: g, nuova: false }); }
    return html`<div class="stack">
      <${Nota} breve="Calendario comune a tutte le leghe">Il calendario è comune a tutte le leghe. Ogni giornata è una finestra di date: contano le gare di 4Fence che cadono dentro (se un atleta ne fa due, vale la prima) e la formazione si chiude alla scadenza.<//>
      <${UI.Card} title="Calendario" meta=${d.giornate.length === 1 ? '1 giornata' : d.giornate.length + ' giornate'} flush=${true}
        right=${html`<button type="button" class="btn sm" disabled=${!canComm} onClick=${function () { stE[1]({ g: nuovaGiornata(d), nuova: true }); }}>Nuova giornata</button>`}>
        ${d.giornate.length ? html`<div class="tbl-wrap"><table class="tbl pz-rows pz-cal">
          <thead><tr><th>N.</th><th>Giornata</th><th>Finestra</th><th>Scadenza formazioni</th><th class="r">Previste</th><th class="r">Importate</th><th></th></tr></thead>
          <tbody>${d.giornate.map(function (g) {
            return html`<tr key=${g.n} class="click" onClick=${function () { apri(g); }}>
              <td class="pz-c-n"><span class="pos">${g.n}</span></td>
              <td class="pz-c-t"><b>${nomeGiornata(g)}</b>${g.n < gIni ? html`<span class="tag" style=${{ marginLeft: '6px' }}>non conta</span>` : null}${g.note ? html`<div class="tiny muted">${g.note}</div>` : null}</td>
              <td class="small pz-c-a" style=${{ whiteSpace: 'nowrap' }}>${UI.finestra(g)}</td>
              <td class="small pz-c-b" style=${{ whiteSpace: 'nowrap' }}><span class="pz-lab">formazioni entro </span>${UI.dataOra(d.scadenza(g))}</td>
              <td class="r pz-c-x">${(g.gareAttese || []).length}<span class="pz-lab"> previste</span></td>
              <td class="r pz-c-y">${conteggi[g.n] || 0}<span class="pz-lab"> importate</span></td>
              <td class="r pz-c-act" style=${{ whiteSpace: 'nowrap' }}>
                <button type="button" class="btn xs ghost" onClick=${function (e) { e.stopPropagation(); apri(g); }}>Modifica</button>
                <button type="button" class="btn xs danger" style=${{ marginLeft: '4px' }} disabled=${!canComm} onClick=${function (e) { e.stopPropagation(); elimina(g); }}>Elimina</button>
              </td>
            </tr>`;
          })}</tbody>
        </table></div>` : html`<${UI.Empty} title="Calendario vuoto">Aggiungi la prima giornata: per esempio una al mese, da ottobre a giugno.<//>`}
      <//>
      ${stE[0] ? html`<${GiornataEditor} key=${stE[0].nuova ? 'nuova' : 'g' + stE[0].g.n} g=${stE[0].g} nuova=${stE[0].nuova} onClose=${function () { stE[1](null); }}/>` : null}
      ${askS[0]}
    </div>`;
  }

  // ========================================================== 5. RISULTATI
  var PLACEHOLDER_JSON = '[{"id": "2026-10-18_crl_...", "nome": "...", "data": "2026-10-18", "risultati": {"712420": {...}}}]';

  /** Analizza il JSON incollato: gare valide, righe di anteprima, errori, atleti nuovi. */
  function analizzaImport(txt, s, d) {
    var out = { gare: [], righe: [], errori: [], atletiNuovi: [] };
    if (!String(txt || '').trim()) return out;
    var data;
    try { data = JSON.parse(txt); } catch (e) { out.errori.push('Il testo incollato non è un JSON valido (' + e.message + '). Copia di nuovo tutto il testo dal bookmarklet.'); return out; }
    var list = Array.isArray(data) ? data : data && Array.isArray(data.gare) ? data.gare : data && typeof data === 'object' && data.id ? [data] : null;
    if (!list) { out.errori.push('Mi aspettavo un elenco di gare (oppure un oggetto con il campo "gare").'); return out; }
    var nuovi = {}, ordineNuovi = [], visti = {};
    list.forEach(function (g, i) {
      var nomeEl = 'Elemento ' + (i + 1);
      if (!g || typeof g !== 'object' || Array.isArray(g)) { out.errori.push(nomeEl + ': non è una gara, lo salto.'); return; }
      var id = String(g.id === undefined || g.id === null ? '' : g.id).trim();
      if (!id || id.length > 200 || id.indexOf('/') >= 0) { out.errori.push(nomeEl + ': identificativo mancante o non valido, lo salto.'); return; }
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(g.data || ''))) { out.errori.push(nomeEl + ' (' + id + '): data mancante, la salto.'); return; }
      var gara = FS.clone(g);
      var atl = gara.atleti;
      delete gara.atleti;
      delete gara._id;
      gara.id = id;
      gara.data = String(g.data).slice(0, 10);
      if (!gara.dal) gara.dal = gara.data;
      if (!gara.al) gara.al = gara.data;
      gara.nome = String(gara.nome || gara.evento || id);
      gara.url = urlSicuro(gara.url);
      if (gara.n !== undefined && gara.n !== null) gara.n = Number(gara.n) || null;
      var ris = gara.risultati && typeof gara.risultati === 'object' && !Array.isArray(gara.risultati) ? gara.risultati : {};
      var puliti = {};
      Object.keys(ris).forEach(function (fis) {
        var r = ris[fis];
        if (r && typeof r === 'object' && !Array.isArray(r) && fis.indexOf('/') < 0) puliti[fis] = r;
        else out.errori.push(UI.nomeGara(gara) + ': risultato non valido per ' + fis + ', lo salto.');
      });
      gara.risultati = puliti;
      var info = {};
      if (Array.isArray(atl)) atl.forEach(function (a) { if (a && a.fis) info[String(a.fis)] = a; });
      else if (atl && typeof atl === 'object') Object.keys(atl).forEach(function (k) { var a = atl[k]; if (a && typeof a === 'object') info[String(a.fis || k)] = a; });
      var nuoviQui = [], sconosciuti = [];
      Object.keys(puliti).forEach(function (fis) {
        if (s.atleti[fis]) return;
        var a = info[fis];
        if (a && a.cognome) {
          if (!nuovi[fis]) {
            nuovi[fis] = {
              fis: fis, cognome: String(a.cognome).trim(), nome: String(a.nome || '').trim(), anno: Number(a.anno) || null,
              sesso: a.sesso === 'F' || a.sesso === 'M' ? a.sesso : (gara.sesso === 'F' ? 'F' : 'M'),
              club: 'MISPM', attivo: true, quotazione: 1, armi: [gara.arma || 'SP'],
            };
            ordineNuovi.push(fis);
          } else if (gara.arma && nuovi[fis].armi.indexOf(gara.arma) < 0) nuovi[fis].armi.push(gara.arma);
          nuoviQui.push(UI.nomeAtleta(nuovi[fis], true));
        } else sconosciuti.push(fis);
      });
      var riga = { gara: gara, nSP: Object.keys(puliti).length, giornata: giornataDi(gara.data, d.giornate), esiste: !!s.gare[id], nuovi: nuoviQui, sconosciuti: sconosciuti };
      if (visti[id] !== undefined) {
        out.errori.push('La gara «' + UI.nomeGara(gara) + '» compare due volte: tengo l\'ultima.');
        out.gare[visti[id]] = gara;
        out.righe[visti[id]] = riga;
      } else {
        visti[id] = out.gare.length;
        out.gare.push(gara);
        out.righe.push(riga);
      }
    });
    out.atletiNuovi = ordineNuovi.map(function (f) { return nuovi[f]; });
    return out;
  }

  function ImportGare() {
    var s = FS.useFS();
    var d = FS.derived();
    var stT = useState('');
    var bmRef = useRef(null);
    var canComm = d.gestisceCircuito && s.canWrite;
    var txt = stT[0];
    var an = useMemo(function () { return analizzaImport(txt, s, d); }, [txt, s.version]);
    var bm = typeof root.FSBookmarklet === 'string' ? root.FSBookmarklet : '';
    var sconosciuti = an.righe.reduce(function (t, r) { return t + r.sconosciuti.length; }, 0);
    function importa() {
      if (!an.gare.length) return null;
      return FS.act.importaGare(an.gare, an.atletiNuovi).then(function () { stT[1](''); });
    }
    return html`<${UI.Card} title="Importa da 4Fence">
      ${bm ? html`<details class="more" open=${!Object.keys(s.gare).length}>
        <summary>Come prendere i risultati da 4Fence (bookmarklet)</summary>
        <ol class="small" style=${STEPS}>
          <li>Premi «Copia il codice» qui sotto.</li>
          <li>Nel browser crea un nuovo segnalibro (preferito) e chiamalo, per esempio, «Fantascherma».</li>
          <li>Modifica il segnalibro e incolla il codice nel campo dell'indirizzo (URL), al posto del link.</li>
          <li>Apri su 4fence.it la pagina della manifestazione (indirizzo con «/Risultati/»).</li>
          <li>Clicca il segnalibro: dopo qualche secondo compare il JSON con i risultati degli atleti San Paolo.</li>
          <li>Premi «Copia il JSON», torna qui e incollalo nel riquadro qui sotto: controlla l'anteprima e premi «Importa».</li>
        </ol>
        <div class="code-box" ref=${bmRef} tabIndex="0" aria-label="Codice del bookmarklet">${bm}</div>
        <div class="row" style=${{ marginTop: '8px' }}>
          <button type="button" class="btn sm ghost" onClick=${function () { copia(bm, bmRef.current, 'Codice del bookmarklet copiato'); }}>Copia il codice</button>
          <span class="tiny faint">I segnalibri con codice si usano più facilmente dal browser del computer.</span>
        </div>
      </details>` : html`<p class="small muted" style=${{ marginTop: 0 }}>Il codice del bookmarklet non è incluso in questa versione della pagina: puoi comunque incollare qui il JSON delle gare esportato da 4Fence.</p>`}
      <div style=${{ marginTop: '12px' }}>
        <${UI.Field} id="import-json" label="JSON delle gare" help="Un elenco di gare, oppure un oggetto con il campo «gare». Le gare già importate vengono aggiornate senza perdere le correzioni a mano.">
          <textarea id="import-json" class="input" rows="6" spellCheck=${false} placeholder=${PLACEHOLDER_JSON} value=${txt} onInput=${function (e) { stT[1](e.target.value); }}></textarea>
        <//>
      </div>
      ${an.errori.length ? html`<div class="banner err small" style=${{ marginTop: '10px' }}><div>${an.errori.slice(0, 12).map(function (e, i) { return html`<div key=${i}>${e}</div>`; })}${an.errori.length > 12 ? html`<div>… e altri ${an.errori.length - 12} avvisi.</div>` : null}</div></div>` : null}
      ${an.righe.length ? html`<div class="tbl-wrap" style=${{ marginTop: '12px' }}><table class="tbl">
        <thead><tr><th>Gara</th><th>Data</th><th class="r">Iscritti</th><th class="r">San Paolo</th><th>Giornata</th><th>Nuovi atleti</th></tr></thead>
        <tbody>${an.righe.map(function (r) {
          return html`<tr key=${r.gara.id}>
            <td><b>${UI.nomeGara(r.gara)}</b>${r.gara.luogo ? html`<div class="tiny muted">${r.gara.luogo}</div>` : null}${r.esiste ? html`<div><span class="tag gold">Già importata: verrà aggiornata</span></div>` : null}</td>
            <td class="small" style=${{ whiteSpace: 'nowrap' }}>${UI.data(r.gara.data)}</td>
            <td class="r">${r.gara.n || '–'}</td>
            <td class="r">${r.nSP}</td>
            <td class="small">${r.giornata ? 'G' + r.giornata.n + ' · ' + nomeGiornata(r.giornata) : html`<span class="tag">Fuori calendario</span>`}</td>
            <td class="small">${r.nuovi.length ? r.nuovi.join(', ') : '—'}${r.sconosciuti.length ? html`<div class="tiny" style=${{ color: 'var(--lamp-red)' }}>${r.sconosciuti.length} senza anagrafica</div>` : null}</td>
          </tr>`;
        })}</tbody>
      </table></div>` : null}
      ${sconosciuti ? html`<p class="small muted">Gli atleti senza anagrafica avranno il risultato salvato, ma vanno aggiunti al listone dalla sezione Atleti con lo stesso codice FIS.</p>` : null}
      ${an.gare.length ? html`<div class="row between" style=${{ marginTop: '12px' }}>
        <span class="small">${an.gare.length === 1 ? '1 gara' : an.gare.length + ' gare'} · ${an.atletiNuovi.length === 1 ? '1 nuovo atleta' : an.atletiNuovi.length + ' nuovi atleti'} nel listone</span>
        <div class="row">
          <button type="button" class="btn sm ghost" onClick=${function () { stT[1](''); }}>Svuota</button>
          <${UI.AsyncBtn} cls="sm" disabled=${!canComm} onClick=${importa}>${'Importa ' + (an.gare.length === 1 ? '1 gara' : an.gare.length + ' gare')}<//>
        </div>
      </div>` : null}
    <//>`;
  }

  /** Editor del risultato di un atleta in una gara (usato sia per le gare importate sia per quelle manuali). */
  function RisultatoEditor(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var raw = p.raw || {};
    var gir = raw.girone || {};
    var cards = raw.cards || {};
    var de = raw.de || [];
    var a = s.atleti[p.fis];
    var idp = p.idp;
    var dis = !!p.disabled;
    function upd(patch) { p.onChange(Object.assign({}, raw, patch)); }
    function updG(k, v) { var x = Object.assign({ v: 0, s: 0, td: 0, tr: 0 }, gir); x[k] = v === null ? 0 : Math.max(0, Math.round(v)); upd({ girone: x }); }
    function updC(k, v) { var x = Object.assign({ g: 0, r: 0, n: 0 }, cards); x[k] = v === null ? 0 : Math.max(0, Math.round(v)); upd({ cards: x }); }
    function updDe(i, patch) {
      var list = de.slice();
      var b = Object.assign({}, list[i], patch);
      if (patch.td !== undefined || patch.tr !== undefined) b.v = num(b.td) > num(b.tr);
      list[i] = b;
      upd({ de: list });
    }
    function addDe() {
      var last = de[de.length - 1];
      var r = last ? Math.max(2, Math.round(num(last.r, 64) / 2)) : (p.primoTurno || 32);
      upd({ de: de.concat([{ r: r, opp: '', oppSeed: null, td: 0, tr: 0, v: false }]), qualificato: raw.qualificato === false ? raw.qualificato : true });
    }
    function delDe(i) { upd({ de: de.filter(function (_, j) { return j !== i; }) }); }
    // p.deTouches: limite di stoccate che verrà salvato nel risultato (gara manuale), così l'anteprima coincide col voto finale
    var fv = E.fantavoto(p.deTouches ? Object.assign({}, raw, { deTouches: p.deTouches }) : raw, d.settings.punteggio, { coeff: num(p.coeff, 1) || 1 });
    var quali = raw.qualificato === true ? 'si' : raw.qualificato === false ? 'no' : '';
    var nome = a ? UI.nomeAtleta(a) : 'Atleta ' + p.fis;

    return html`<div style=${BLOCK}>
      <div class="row between" style=${{ flexWrap: 'nowrap' }}>
        <div style=${{ minWidth: 0 }}>
          <div style=${{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${nome}</div>
          <div class="tiny faint">${p.fis}${raw.manuale ? ' · corretto a mano' : ''}${a ? '' : ' · non nel listone'}</div>
        </div>
        <div class="row" style=${{ flexWrap: 'nowrap', gap: '6px' }}>
          <${UI.FV} v=${fv.sv ? null : fv.fv} base=${num(d.settings.punteggio.base, 6)}/>
          ${p.onRemove ? html`<button type="button" class="iconbtn" aria-label=${'Togli ' + nome} disabled=${dis} onClick=${p.onRemove}>✕</button>` : null}
        </div>
      </div>
      <div class="form-grid" style=${MINI}>
        <${UI.Field} id=${idp + '-stato'} label="Stato" style=${SPAN2}>
          <select id=${idp + '-stato'} class="input" value=${raw.stato || 'ok'} disabled=${dis} onChange=${function (e) { upd({ stato: e.target.value }); }}>
            ${STATI_RIS.map(function (o) { return html`<option key=${o.v} value=${o.v}>${o.l}</option>`; })}
          </select>
        <//>
        <${UI.Field} id=${idp + '-place'} label="Posto">
          <${NumInput} id=${idp + '-place'} value=${raw.place} min="1" step="1" allowEmpty=${true} disabled=${dis} onChange=${function (v) { upd({ place: v === null ? null : Math.max(1, Math.round(v)) }); }}/>
        <//>
        <${UI.Field} id=${idp + '-quali'} label="Tabellone" style=${SPAN2}>
          <select id=${idp + '-quali'} class="input" value=${quali} disabled=${dis} onChange=${function (e) { var v = e.target.value; upd({ qualificato: v === 'si' ? true : v === 'no' ? false : null }); }}>
            <option value="">Non indicato</option>
            <option value="si">Qualificato/a</option>
            <option value="no">Eliminato/a nei gironi</option>
          </select>
        <//>
        <${UI.Field} id=${idp + '-seed'} label="Testa di serie" style=${SPAN2}>
          <${NumInput} id=${idp + '-seed'} value=${raw.seed} min="1" step="1" allowEmpty=${true} disabled=${dis} placeholder="dopo i gironi" onChange=${function (v) { upd({ seed: v === null ? null : Math.max(1, Math.round(v)) }); }}/>
        <//>
      </div>
      <div>
        <div class="lbl" style=${{ marginBottom: '5px' }}>Girone</div>
        <div class="form-grid" style=${MINI}>
          <${UI.Field} id=${idp + '-gv'} label="Vinti"><${NumInput} id=${idp + '-gv'} value=${gir.v || 0} min="0" step="1" disabled=${dis} onChange=${function (v) { updG('v', v); }}/><//>
          <${UI.Field} id=${idp + '-gs'} label="Persi"><${NumInput} id=${idp + '-gs'} value=${gir.s || 0} min="0" step="1" disabled=${dis} onChange=${function (v) { updG('s', v); }}/><//>
          <${UI.Field} id=${idp + '-gtd'} label="TD"><${NumInput} id=${idp + '-gtd'} value=${gir.td || 0} min="0" step="1" disabled=${dis} onChange=${function (v) { updG('td', v); }}/><//>
          <${UI.Field} id=${idp + '-gtr'} label="TR"><${NumInput} id=${idp + '-gtr'} value=${gir.tr || 0} min="0" step="1" disabled=${dis} onChange=${function (v) { updG('tr', v); }}/><//>
        </div>
        <div class="tiny faint" style=${{ marginTop: '3px' }}>TD e TR: stoccate date e ricevute nel girone.</div>
      </div>
      <div>
        <div class="lbl" style=${{ marginBottom: '5px' }}>Cartellini</div>
        <div class="form-grid" style=${MINI}>
          <${UI.Field} id=${idp + '-cg'} label="Gialli"><${NumInput} id=${idp + '-cg'} value=${cards.g || 0} min="0" step="1" disabled=${dis} onChange=${function (v) { updC('g', v); }}/><//>
          <${UI.Field} id=${idp + '-cr'} label="Rossi"><${NumInput} id=${idp + '-cr'} value=${cards.r || 0} min="0" step="1" disabled=${dis} onChange=${function (v) { updC('r', v); }}/><//>
          <${UI.Field} id=${idp + '-cn'} label="Neri"><${NumInput} id=${idp + '-cn'} value=${cards.n || 0} min="0" step="1" disabled=${dis} onChange=${function (v) { updC('n', v); }}/><//>
        </div>
      </div>
      <details class="more" open=${!!p.apriDiretta}>
        <summary>Eliminazione diretta (${de.length === 1 ? '1 assalto' : de.length + ' assalti'}${de.length ? ', vinti ' + de.filter(function (b) { return b.v; }).length : ''})</summary>
        <div style=${{ marginTop: '8px' }}>
          ${de.map(function (b, i) {
            var ib = idp + '-de-' + i;
            var turni = TURNI.indexOf(num(b.r)) >= 0 || !b.r ? TURNI : TURNI.concat([num(b.r)]);
            return html`<div key=${i} class="form-grid" style=${Object.assign({}, MINI, { alignItems: 'end', paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px dashed var(--line)' })}>
              <${UI.Field} id=${ib + '-r'} label="Turno" style=${SPAN2}>
                <select id=${ib + '-r'} class="input" value=${String(b.r || '')} disabled=${dis} onChange=${function (e) { updDe(i, { r: Number(e.target.value) }); }}>
                  ${turni.map(function (t) { return html`<option key=${t} value=${String(t)}>${maiuscola(E.nomeTurno(t))}</option>`; })}
                </select>
              <//>
              <${UI.Field} id=${ib + '-opp'} label="Avversario" style=${SPAN2}>
                <input id=${ib + '-opp'} class="input" maxLength="60" value=${b.opp || ''} disabled=${dis} onInput=${function (e) { updDe(i, { opp: e.target.value }); }}/>
              <//>
              <${UI.Field} id=${ib + '-seed'} label="Testa avv." style=${SPAN2}>
                <${NumInput} id=${ib + '-seed'} value=${b.oppSeed} min="1" step="1" allowEmpty=${true} disabled=${dis} onChange=${function (v) { updDe(i, { oppSeed: v === null ? null : Math.round(v) }); }}/>
              <//>
              <${UI.Field} id=${ib + '-td'} label="TD"><${NumInput} id=${ib + '-td'} value=${b.td || 0} min="0" step="1" disabled=${dis} onChange=${function (v) { updDe(i, { td: Math.max(0, Math.round(v)) }); }}/><//>
              <${UI.Field} id=${ib + '-tr'} label="TR"><${NumInput} id=${ib + '-tr'} value=${b.tr || 0} min="0" step="1" disabled=${dis} onChange=${function (v) { updDe(i, { tr: Math.max(0, Math.round(v)) }); }}/><//>
              <div class="field" style=${SPAN2}>
                <span class="lbl">Esito</span>
                <label class="check small" htmlFor=${ib + '-v'}><input id=${ib + '-v'} type="checkbox" checked=${!!b.v} disabled=${dis} onChange=${function (e) { updDe(i, { v: e.target.checked }); }}/> Vinto</label>
                <label class="check small" htmlFor=${ib + '-derby'} title="Avversario della San Paolo: chi vince prende il bonus derby"><input id=${ib + '-derby'} type="checkbox" checked=${b.oppClub === 'MISPM'} disabled=${dis} onChange=${function (e) { updDe(i, { oppClub: e.target.checked ? 'MISPM' : '' }); }}/> Derby San Paolo</label>
              </div>
              <div class="field" style=${{ alignItems: 'flex-start' }}>
                <button type="button" class="iconbtn" aria-label=${'Togli l\'assalto ' + (i + 1)} disabled=${dis} onClick=${function () { delDe(i); }}>✕</button>
              </div>
            </div>`;
          })}
          <button type="button" class="btn xs ghost" disabled=${dis} onClick=${addDe}>+ Aggiungi assalto</button>
        </div>
      </details>
      ${fv.voci.length ? html`<details class="more"><summary>Dettaglio del fantavoto</summary><div style=${{ marginTop: '6px' }}><${UI.Voci} voci=${fv.voci}/></div></details>` : null}
    </div>`;
  }

  function GaraEditor(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var orig = s.gare[p.id] || null;
    var stG = useState(function () { return orig ? FS.clone(orig) : null; });
    var stA = useState('');
    var askS = useAsk();
    var canComm = d.gestisceCircuito && s.canWrite;
    var g = stG[0];
    var chiaviRis = g ? Object.keys(g.risultati || {}).join(',') : '';
    var disponibili = useMemo(function () {
      var dentro = {};
      chiaviRis.split(',').forEach(function (k) { if (k) dentro[k] = 1; });
      return Object.values(s.atleti).filter(function (a) { return !dentro[a.fis]; }).sort(cmpAtleti);
    }, [s.version, chiaviRis]);
    if (!g) return html`<${UI.Modal} title="Gara" onClose=${p.onClose}><${UI.Empty} title="Gara non trovata">Forse è stata eliminata da un altro presidente.<//><//>`;

    var gior = giornataDi(g.data, d.giornate);
    var uff = gior && s.esiti[gior.n] && s.esiti[gior.n].ufficiale;
    var risultati = g.risultati || {};
    var fisList = Object.keys(risultati).sort(function (x, y) {
      return num((risultati[x] || {}).place, 999) - num((risultati[y] || {}).place, 999) || nomeAtl(s, x).localeCompare(nomeAtl(s, y), 'it');
    });
    var dirty = JSON.stringify(g) !== JSON.stringify(orig);
    var coeffErr = !(num(g.coeff === undefined ? 1 : g.coeff, 0) > 0);
    function set(k, v) { var x = Object.assign({}, g); x[k] = v; stG[1](x); }
    function setRaw(fis, raw) {
      var x = Object.assign({}, g);
      x.risultati = Object.assign({}, g.risultati);
      x.risultati[fis] = Object.assign({}, raw, { manuale: true });
      stG[1](x);
    }
    function togli(fis) {
      var x = Object.assign({}, g);
      x.risultati = Object.assign({}, g.risultati);
      delete x.risultati[fis];
      stG[1](x);
    }
    function aggiungi() {
      var fis = stA[0];
      if (!fis || risultati[fis]) return;
      var nuovo = { stato: 'ok', girone: { v: 0, s: 0, td: 0, tr: 0 }, seed: null, qualificato: null, de: [], place: null, of: g.n || null };
      if (g.fonte === 'manuale' && g.deTouches) nuovo.deTouches = g.deTouches; // come gli altri risultati delle gare manuali
      setRaw(fis, nuovo);
      stA[1]('');
    }
    function salva() {
      if (coeffErr) { errore('Il coefficiente deve essere maggiore di zero.'); return null; }
      return FS.act.salvaGara(g).then(p.onClose);
    }
    function elimina() {
      askS[1]({
        title: 'Eliminare la gara?', danger: true, yes: 'Elimina gara',
        text: '«' + UI.nomeGara(g) + '» e i suoi ' + fisList.length + ' risultati San Paolo spariscono per tutte le leghe. Le giornate già ufficiali restano congelate; le altre si ricalcolano senza questa gara.',
        run: function () { return FS.act.eliminaGara(g.id).then(p.onClose); },
      });
    }

    return html`<${UI.Modal} title=${UI.nomeGara(g)} onClose=${p.onClose} footer=${html`<${React.Fragment}>
        <button type="button" class="btn ghost" onClick=${p.onClose}>${dirty ? 'Annulla' : 'Chiudi'}</button>
        <${UI.AsyncBtn} disabled=${!canComm || !dirty || coeffErr} onClick=${salva}>Salva gara<//>
      <//>`}>
      <div class="small muted" style=${{ marginBottom: '10px' }}>
        ${UI.data(g.data)}${g.luogo ? ' · ' + g.luogo : ''} · ${livelloLabel(g.livello)} · ${g.n ? g.n + ' iscritti' : 'iscritti non indicati'} · ${gior ? 'G' + gior.n + ' · ' + nomeGiornata(gior) : 'fuori calendario'}
        ${urlSicuro(g.url) ? html`<span> · <a href=${urlSicuro(g.url)} target="_blank" rel="noopener noreferrer">vedi su 4Fence</a></span>` : null}
      </div>
      ${uff ? html`<div class="banner warn small" style=${{ marginBottom: '10px' }}>La giornata ${gior.n} è già ufficiale in questa lega: le correzioni contano solo dopo averla riaperta e ufficializzata di nuovo.</div>` : null}
      <div class="form-grid">
        <${UI.Field} id="gara-coeff" label="Coefficiente" help="Moltiplica bonus e malus della gara (1 = normale).">
          <${NumInput} id="gara-coeff" value=${g.coeff === undefined ? 1 : g.coeff} min="0.1" step="0.1" disabled=${!canComm} onChange=${function (v) { set('coeff', v); }}/>
        <//>
        <div class="field">
          <span class="lbl">Fantagioco</span>
          <label class="check" htmlFor="gara-escludi"><input id="gara-escludi" type="checkbox" checked=${!!g.escludi} disabled=${!canComm} onChange=${function (e) { set('escludi', e.target.checked); }}/> Escludi questa gara</label>
          <span class="help">Non conta per nessuna giornata (es. gara a squadre).</span>
        </div>
      </div>
      <div class="eyebrow" style=${{ margin: '16px 0 8px' }}>Atleti San Paolo (${fisList.length})</div>
      ${fisList.length ? fisList.map(function (fis) {
        var rimovibile = !(orig && orig.risultati && orig.risultati[fis]) || g.fonte === 'manuale';
        return html`<${RisultatoEditor} key=${fis} idp=${'ge-' + idSafe(fis)} fis=${fis} raw=${risultati[fis]} coeff=${g.coeff} primoTurno=${primoTurno(g.n)} disabled=${!canComm}
          onChange=${function (raw) { setRaw(fis, raw); }} onRemove=${rimovibile ? function () { togli(fis); } : null}/>`;
      }) : html`<div class="small muted">Nessun atleta San Paolo in questa gara.</div>`}
      <div class="row" style=${{ alignItems: 'flex-end', marginTop: '6px' }}>
        <${UI.Field} id="gara-aggiungi" label="Aggiungi un atleta mancante" style=${{ flex: '1 1 220px' }}>
          <select id="gara-aggiungi" class="input" value=${stA[0]} disabled=${!canComm} onChange=${function (e) { stA[1](e.target.value); }}>
            <option value="">Scegli dal listone…</option>
            ${disponibili.map(function (a) { return html`<option key=${a.fis} value=${a.fis}>${UI.nomeAtleta(a) + (a.anno ? ' (' + a.anno + ')' : '')}</option>`; })}
          </select>
        <//>
        <button type="button" class="btn sm ghost" disabled=${!canComm || !stA[0]} onClick=${aggiungi}>Aggiungi</button>
      </div>
      <div class="pz-danger-zone">
        <button type="button" class="btn sm danger" disabled=${!canComm} onClick=${elimina}>Elimina gara</button>
      </div>
      ${askS[0]}
    <//>`;
  }

  function ElencoGare() {
    var s = FS.useFS();
    var d = FS.derived();
    var stQ = useState('');
    var stF = useState('tutte');
    var stL = useState(30);
    var stE = useState(null);
    var righe = useMemo(function () {
      return Object.values(s.gare).map(function (g) {
        var ris = g.risultati || {};
        return {
          g: g,
          nSP: Object.keys(ris).filter(function (k) { return ris[k] && ris[k].stato !== 'assente'; }).length,
          giornata: giornataDi(g.data, d.giornate),
          testo: norm([g.nome, g.evento, g.luogo, g.catLabel, g.data].join(' ')),
        };
      }).sort(function (a, b) {
        if (a.g.data !== b.g.data) return a.g.data < b.g.data ? 1 : -1;
        return String(a.g.id) < String(b.g.id) ? -1 : 1;
      });
    }, [s.version]);
    var q = norm(stQ[0].trim());
    var filtro = stF[0];
    var lista = righe.filter(function (r) {
      if (q && r.testo.indexOf(q) < 0) return false;
      if (filtro === 'fuori') return !r.giornata;
      if (filtro === 'escluse') return !!r.g.escludi;
      if (filtro !== 'tutte') return !!r.giornata && String(r.giornata.n) === filtro;
      return true;
    });
    var visibili = lista.slice(0, stL[0]);
    return html`<${UI.Card} title="Gare importate" meta=${righe.length === 1 ? '1 gara' : righe.length + ' gare'} flush=${true}>
      <div class="form-grid" style=${{ padding: '4px 16px 12px' }}>
        <${UI.Field} id="gare-cerca" label="Cerca">
          <input id="gare-cerca" class="input" type="search" placeholder="Nome, luogo, categoria…" value=${stQ[0]} onInput=${function (e) { stQ[1](e.target.value); stL[1](30); }}/>
        <//>
        <${UI.Field} id="gare-filtro" label="Giornata">
          <select id="gare-filtro" class="input" value=${filtro} onChange=${function (e) { stF[1](e.target.value); stL[1](30); }}>
            <option value="tutte">Tutte le gare</option>
            ${d.giornate.map(function (g) { return html`<option key=${g.n} value=${String(g.n)}>${'G' + g.n + ' · ' + nomeGiornata(g)}</option>`; })}
            <option value="fuori">Fuori calendario</option>
            <option value="escluse">Escluse dal fantagioco</option>
          </select>
        <//>
      </div>
      ${visibili.length ? html`<div class="tbl-wrap"><table class="tbl pz-rows pz-gare">
        <thead><tr><th>Data</th><th>Gara</th><th>Livello</th><th class="r">Iscritti</th><th class="r">SP</th><th>Giornata</th><th>4Fence</th><th></th></tr></thead>
        <tbody>${visibili.map(function (r) {
          var g = r.g;
          return html`<tr key=${g.id} class="click" onClick=${function () { stE[1](g.id); }}>
            <td class="small pz-c-a" style=${{ whiteSpace: 'nowrap' }}>${UI.data(g.data)}</td>
            <td class="pz-c-t"><b>${UI.nomeGara(g)}</b>
              <div class="row" style=${{ gap: '4px', marginTop: '2px' }}>
                ${g.luogo ? html`<span class="tiny muted">${g.luogo}</span>` : null}
                ${g.escludi ? html`<span class="tag red">Esclusa</span>` : null}
                ${g.coeff && Number(g.coeff) !== 1 ? html`<span class="tag gold">×${UI.fmt(g.coeff)}</span>` : null}
                ${g.fonte === 'manuale' ? html`<span class="tag blue">Manuale</span>` : null}
              </div>
            </td>
            <td class="small pz-c-b">${livelloLabel(g.livello)}</td>
            <td class="r pz-c-x">${g.n || '–'}<span class="pz-lab"> iscritti</span></td>
            <td class="r pz-c-y">${r.nSP}<span class="pz-lab"> San Paolo</span></td>
            <td class="small pz-c-z" style=${{ whiteSpace: 'nowrap' }}>${r.giornata ? 'G' + r.giornata.n : html`<span class="faint">—</span>`}</td>
            <td class="small pz-c-w">${urlSicuro(g.url) ? html`<a href=${urlSicuro(g.url)} target="_blank" rel="noopener noreferrer" onClick=${function (e) { e.stopPropagation(); }}>Apri<span class="pz-lab"> su 4Fence</span></a>` : html`<span class="faint">—</span>`}</td>
            <td class="r pz-c-act"><button type="button" class="btn xs ghost" onClick=${function (e) { e.stopPropagation(); stE[1](g.id); }}>Modifica</button></td>
          </tr>`;
        })}</tbody>
      </table></div>` : html`<${UI.Empty} title=${righe.length ? 'Nessuna gara trovata' : 'Nessuna gara importata'}>${righe.length ? 'Prova a cambiare la ricerca o il filtro.' : 'Importa i risultati da 4Fence con il riquadro qui sopra.'}<//>`}
      ${lista.length > visibili.length ? html`<div class="card-f" style=${{ justifyContent: 'center' }}><button type="button" class="btn sm ghost" onClick=${function () { stL[1](stL[0] + 30); }}>Mostra altre (${lista.length - visibili.length})</button></div>` : null}
      ${stE[0] ? html`<${GaraEditor} key=${stE[0]} id=${stE[0]} onClose=${function () { stE[1](null); }}/>` : null}
    <//>`;
  }

  function garaVuota(oggi) { return { nome: '', data: oggi, luogo: '', livello: 'regionale', cat: '', sesso: 'M', arma: 'SP', n: null, deTouches: 15 }; }

  function NuovoManuale() {
    var s = FS.useFS();
    var d = FS.derived();
    var stG = useState(function () { return garaVuota(d.oggi); });
    var stR = useState([]);
    var stA = useState('');
    var canComm = d.gestisceCircuito && s.canWrite;
    var g = stG[0], righe = stR[0];
    var scelti = righe.map(function (r) { return r.fis; }).join(',');
    var disponibili = useMemo(function () {
      var dentro = {};
      scelti.split(',').forEach(function (k) { if (k) dentro[k] = 1; });
      return Object.values(s.atleti).filter(function (a) { return a.attivo !== false && !dentro[a.fis]; }).sort(cmpAtleti);
    }, [s.version, scelti]);
    function set(k, v) { var x = Object.assign({}, g); x[k] = v; stG[1](x); }
    function setRaw(i, raw) { var list = righe.slice(); list[i] = { fis: list[i].fis, raw: raw }; stR[1](list); }
    function togli(i) { stR[1](righe.filter(function (_, j) { return j !== i; })); }
    function aggiungi() {
      var fis = stA[0];
      if (!fis || righe.some(function (r) { return r.fis === fis; })) return;
      stR[1](righe.concat([{ fis: fis, raw: { stato: 'ok', girone: { v: 0, s: 0, td: 0, tr: 0 }, seed: null, qualificato: null, de: [], place: null } }]));
      stA[1]('');
    }
    var errs = [];
    if (!String(g.nome || '').trim()) errs.push('Dai un nome alla gara.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.data || '')) errs.push('Indica la data della gara.');
    if (!righe.length) errs.push('Aggiungi almeno un atleta San Paolo.');
    var gior = giornataDi(g.data, d.giornate);

    function salva() {
      if (errs.length) { errore(errs[0]); return null; }
      var nome = String(g.nome).trim();
      var cat = E.CATEGORIE.filter(function (c) { return c.code === g.cat; })[0];
      var n = g.n ? Math.max(1, Math.round(g.n)) : null;
      var risultati = {};
      righe.forEach(function (r) {
        var x = FS.clone(r.raw);
        x.manuale = true;
        x.of = n;
        x.deTouches = g.deTouches; // il motore legge il limite di stoccate dal risultato
        if (x.girone) x.girone.n = num(x.girone.v) + num(x.girone.s) + 1;
        risultati[r.fis] = x;
      });
      var gara = {
        id: g.data + '_manuale_' + (codiceDa(nome).toLowerCase().slice(0, 40) || 'gara') + '_' + FS.rid(4),
        nome: nome, evento: nome, luogo: String(g.luogo || '').trim(), data: g.data, dal: g.data, al: g.data, org: 'manuale',
        livello: g.livello, arma: g.arma, sesso: g.sesso, cat: g.cat || '', catLabel: cat ? cat.short : '', url: '',
        n: n, deTouches: g.deTouches, coeff: 1, fonte: 'manuale', risultati: risultati,
      };
      return FS.act.salvaGara(gara).then(function () { stG[1](garaVuota(d.oggi)); stR[1]([]); });
    }

    return html`<${UI.Card} title="Nuovo risultato manuale" meta="per gare che non sono su 4Fence">
      <div class="form-grid">
        <${UI.Field} id="man-nome" label="Nome della gara" style=${FULL}>
          <input id="man-nome" class="input" maxLength="100" placeholder="Es. Trofeo di sala · Spada Ragazzi" value=${g.nome} onInput=${function (e) { set('nome', e.target.value); }}/>
        <//>
        <${UI.Field} id="man-data" label="Data" help=${gior ? 'Conta per G' + gior.n + ' · ' + nomeGiornata(gior) : 'Fuori dal calendario delle giornate.'}>
          <input id="man-data" class="input" type="date" value=${g.data} onInput=${function (e) { set('data', e.target.value); }}/>
        <//>
        <${UI.Field} id="man-luogo" label="Luogo">
          <input id="man-luogo" class="input" maxLength="60" value=${g.luogo} onInput=${function (e) { set('luogo', e.target.value); }}/>
        <//>
        <${UI.Field} id="man-livello" label="Livello">
          <select id="man-livello" class="input" value=${g.livello} onChange=${function (e) { set('livello', e.target.value); }}>
            ${LIVELLI.map(function (l) { return html`<option key=${l.v} value=${l.v}>${l.l}</option>`; })}
          </select>
        <//>
        <${UI.Field} id="man-cat" label="Categoria">
          <select id="man-cat" class="input" value=${g.cat} onChange=${function (e) { set('cat', e.target.value); }}>
            <option value="">Non indicata</option>
            ${E.CATEGORIE.map(function (c) { return html`<option key=${c.code} value=${c.code}>${c.label}</option>`; })}
          </select>
        <//>
        <${UI.Field} id="man-sesso" label="Sesso">
          <select id="man-sesso" class="input" value=${g.sesso} onChange=${function (e) { set('sesso', e.target.value); }}>
            <option value="M">Maschile</option>
            <option value="F">Femminile</option>
          </select>
        <//>
        <${UI.Field} id="man-arma" label="Arma">
          <select id="man-arma" class="input" value=${g.arma} onChange=${function (e) { set('arma', e.target.value); }}>
            ${ARMI.map(function (a) { return html`<option key=${a.v} value=${a.v}>${a.l}</option>`; })}
          </select>
        <//>
        <${UI.Field} id="man-n" label="Iscritti" help="Serve per il bonus «primi 16» (almeno 32 iscritti).">
          <${NumInput} id="man-n" value=${g.n} min="1" step="1" allowEmpty=${true} onChange=${function (v) { set('n', v); }}/>
        <//>
        <${UI.Field} id="man-detouches" label="Assalti di diretta">
          <select id="man-detouches" class="input" value=${String(g.deTouches)} onChange=${function (e) { set('deTouches', Number(e.target.value)); }}>
            <option value="15">A 15 stoccate</option>
            <option value="10">A 10 stoccate (Under 14)</option>
          </select>
        <//>
      </div>
      <div class="eyebrow" style=${{ margin: '16px 0 8px' }}>Atleti San Paolo (${righe.length})</div>
      ${righe.map(function (r, i) {
        return html`<${RisultatoEditor} key=${r.fis} idp=${'man-' + idSafe(r.fis)} fis=${r.fis} raw=${r.raw} coeff=${1} deTouches=${g.deTouches} primoTurno=${primoTurno(g.n)} apriDiretta=${true} disabled=${!canComm}
          onChange=${function (raw) { setRaw(i, raw); }} onRemove=${function () { togli(i); }}/>`;
      })}
      <div class="row" style=${{ alignItems: 'flex-end' }}>
        <${UI.Field} id="man-aggiungi" label="Aggiungi un atleta" style=${{ flex: '1 1 220px' }}>
          <select id="man-aggiungi" class="input" value=${stA[0]} onChange=${function (e) { stA[1](e.target.value); }}>
            <option value="">Scegli dal listone…</option>
            ${disponibili.map(function (a) { return html`<option key=${a.fis} value=${a.fis}>${UI.nomeAtleta(a) + (a.anno ? ' (' + a.anno + ')' : '')}</option>`; })}
          </select>
        <//>
        <button type="button" class="btn sm ghost" disabled=${!stA[0]} onClick=${aggiungi}>Aggiungi</button>
      </div>
      ${errs.length && (righe.length || String(g.nome || '').trim()) ? html`<ul class="small" style=${ERR_LIST}>${errs.map(function (e, i) { return html`<li key=${i}>${e}</li>`; })}</ul>` : null}
      <div class="row" style=${ACTIONS}>
        ${righe.length || String(g.nome || '').trim() ? html`<button type="button" class="btn ghost sm" onClick=${function () { stG[1](garaVuota(d.oggi)); stR[1]([]); }}>Svuota</button>` : null}
        <${UI.AsyncBtn} cls="sm" disabled=${!canComm || errs.length > 0} onClick=${salva}>Salva la gara<//>
      </div>
    <//>`;
  }

  function TabRisultati() {
    return html`<div class="stack">
      <${Nota} breve="Gare e risultati comuni a tutte le leghe">Gare e risultati sono comuni a tutte le leghe: quando importi o correggi una gara, i fantavoti si aggiornano ovunque (tranne nelle giornate già ufficiali).<//>
      <${ImportGare}/>
      <${ElencoGare}/>
      <${NuovoManuale}/>
    </div>`;
  }

  // ============================================================== 6. ATLETI
  function AtletaEditor(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var orig = p.fis ? s.atleti[p.fis] || null : null;
    var nuovo = !p.fis;
    var stA = useState(function () {
      var a = orig ? FS.clone(orig) : { fis: '', cognome: '', nome: '', anno: null, sesso: 'M', armi: ['SP'], club: 'MISPM', attivo: true, quotazione: 1, ruolo: '' };
      a.ruolo = a.ruolo || '';
      a.infermeria = Object.assign({ stato: '', nota: '', al: '' }, a.infermeria || {});
      return a;
    });
    var stT = useState('fis');
    var canComm = d.gestisceCircuito && s.canWrite;
    var a = stA[0];
    if (!nuovo && !orig) return html`<${UI.Modal} title="Atleta" onClose=${p.onClose}><${UI.Empty} title="Atleta non trovato"/><//>`;

    function set(k, v) { var x = Object.assign({}, a); x[k] = v; stA[1](x); }
    function setInf(k, v) { var x = Object.assign({}, a); x.infermeria = Object.assign({}, a.infermeria); x.infermeria[k] = v; stA[1](x); }
    var interno = stT[0] === 'int';
    var baseInt = 'INT-' + codiceDa(a.cognome + ' ' + a.nome);
    var codice = nuovo ? (interno ? codiceUnico(baseInt, s.atleti) : String(a.fis || '').trim()) : p.fis;
    var ruoloAuto = E.ruoloAtleta({ anno: a.anno }, d.stagione);
    var catAuto = E.categoriaPer(a.anno, d.stagione);
    var st = orig ? d.statsAtleti[p.fis] : null;
    var qtSugg = st && st.valutazione ? st.valutazione.qt : null;
    var stati = INFERMERIA.indexOf(a.infermeria.stato) >= 0 ? INFERMERIA : INFERMERIA.concat([a.infermeria.stato]);
    var anno = new Date(FS.now()).getFullYear();

    var errs = [];
    if (!String(a.cognome || '').trim()) errs.push('Indica il cognome.');
    if (nuovo && !interno && !/^[A-Za-z0-9-]{3,20}$/.test(codice)) errs.push('Indica il numero di tessera FIS (solo cifre e lettere).');
    if (nuovo && interno && baseInt === 'INT-') errs.push('Per il codice interno servono cognome e nome.');
    if (nuovo && !interno && codice && s.atleti[codice]) errs.push('Esiste già un atleta con questo codice: ' + nomeAtl(s, codice) + '.');
    if (a.anno && (a.anno < 1930 || a.anno > anno)) errs.push('Anno di nascita non valido.');
    if (!(num(a.quotazione, 0) >= 1)) errs.push('La quotazione deve essere almeno 1.');

    function pulito() {
      var inf = a.infermeria || {};
      return {
        cognome: String(a.cognome || '').trim(),
        nome: String(a.nome || '').trim(),
        anno: a.anno ? Math.round(a.anno) : null,
        sesso: a.sesso === 'F' ? 'F' : 'M',
        ruolo: a.ruolo || null,
        quotazione: Math.max(1, Math.round(num(a.quotazione, 1))),
        attivo: a.attivo !== false,
        infermeria: inf.stato ? { stato: inf.stato, nota: String(inf.nota || '').trim(), al: inf.al || '' } : null,
      };
    }
    function salva() {
      if (errs.length) { errore(errs[0]); return null; }
      var x = pulito();
      if (nuovo) {
        var doc = Object.assign({ fis: codice, armi: ['SP'], club: 'MISPM' }, x);
        doc.cognome = doc.cognome.toUpperCase();
        doc.nome = doc.nome.toUpperCase();
        if (!doc.ruolo) delete doc.ruolo;
        if (!doc.infermeria) delete doc.infermeria;
        return FS.act.salvaAtleta(doc).then(p.onClose);
      }
      var prima = {
        cognome: orig.cognome || '', nome: orig.nome || '', anno: orig.anno || null, sesso: orig.sesso === 'F' ? 'F' : 'M',
        ruolo: orig.ruolo || null, quotazione: Number(orig.quotazione) || 1, attivo: orig.attivo !== false,
        infermeria: orig.infermeria && orig.infermeria.stato ? { stato: orig.infermeria.stato, nota: orig.infermeria.nota || '', al: orig.infermeria.al || '' } : null,
      };
      var patch = {};
      Object.keys(x).forEach(function (k) { if (JSON.stringify(prima[k]) !== JSON.stringify(x[k])) patch[k] = x[k]; });
      if (!Object.keys(patch).length) { p.onClose(); return null; }
      return FS.act.aggiornaAtleta(p.fis, patch).then(p.onClose);
    }

    return html`<${UI.Modal} title=${nuovo ? 'Nuovo atleta' : UI.nomeAtleta(orig)} onClose=${p.onClose} footer=${html`<${React.Fragment}>
        ${errs.length ? html`<span class="tag red pz-f-err">${errs.length === 1 ? '1 errore' : errs.length + ' errori'}</span>` : null}
        <button type="button" class="btn ghost" onClick=${p.onClose}>Annulla</button>
        <${UI.AsyncBtn} disabled=${!canComm || errs.length > 0} onClick=${salva}>${nuovo ? 'Aggiungi al listone' : 'Salva'}<//>
      <//>`}>
      ${nuovo ? html`<div class="form-grid" style=${{ marginBottom: '12px' }}>
        <${UI.Field} id="atl-tipo" label="Codice">
          <select id="atl-tipo" class="input" value=${stT[0]} onChange=${function (e) { stT[1](e.target.value); }}>
            <option value="fis">Tessera FIS</option>
            <option value="int">Codice interno (senza tessera)</option>
          </select>
        <//>
        ${interno ? html`<div class="field"><span class="lbl">Codice generato</span><span class="kbd" style=${{ padding: '9px 11px', fontSize: '13px' }}>${baseInt === 'INT-' ? 'INT-…' : codice}</span></div>`
          : html`<${UI.Field} id="atl-fis" label="Numero di tessera FIS" help="Lo stesso usato da 4Fence: così i risultati si collegano da soli.">
              <input id="atl-fis" class="input" inputMode="numeric" maxLength="20" value=${a.fis || ''} onInput=${function (e) { set('fis', e.target.value.replace(/[^A-Za-z0-9-]/g, '')); }}/>
            <//>`}
      </div>` : html`<div class="row" style=${{ marginBottom: '12px' }}>
        <${UI.AtletaMask} atleta=${orig} size=${48}/>
        <div class="small muted">Codice ${p.fis} · ${catAuto ? catAuto.short : 'categoria —'} · ${st ? st.stagione.presenze + ' gare in stagione, ' + st.tutto.presenze + ' in totale' : 'nessuna gara'}</div>
      </div>`}
      <div class="form-grid">
        <${UI.Field} id="atl-cognome" label="Cognome">
          <input id="atl-cognome" class="input" maxLength="40" value=${a.cognome || ''} onInput=${function (e) { set('cognome', e.target.value); }}/>
        <//>
        <${UI.Field} id="atl-nome" label="Nome">
          <input id="atl-nome" class="input" maxLength="40" value=${a.nome || ''} onInput=${function (e) { set('nome', e.target.value); }}/>
        <//>
        <${UI.Field} id="atl-anno" label="Anno di nascita" help=${catAuto ? catAuto.label + ' nella stagione ' + d.stagione + '/' + String(d.stagione + 1).slice(2) : ''}>
          <${NumInput} id="atl-anno" value=${a.anno} min="1930" max=${anno} step="1" allowEmpty=${true} onChange=${function (v) { set('anno', v === null ? null : Math.round(v)); }}/>
        <//>
        <${UI.Field} id="atl-sesso" label="Sesso">
          <select id="atl-sesso" class="input" value=${a.sesso === 'F' ? 'F' : 'M'} onChange=${function (e) { set('sesso', e.target.value); }}>
            <option value="M">Maschile</option>
            <option value="F">Femminile</option>
          </select>
        <//>
        <${UI.Field} id="atl-ruolo" label="Ruolo" help="Forzalo solo per casi particolari.">
          <select id="atl-ruolo" class="input" value=${a.ruolo || ''} onChange=${function (e) { set('ruolo', e.target.value); }}>
            <option value="">${'Automatico (' + ruoloAuto + ')'}</option>
            ${E.ORDINE_RUOLI.map(function (r) { return html`<option key=${r} value=${r}>${E.RUOLI[r].label}</option>`; })}
          </select>
        <//>
        <${UI.Field} id="atl-qt" label="Quotazione iniziale (Qt.I)" help=${qtSugg ? 'Dallo storico delle gare: ' + qtSugg + '.' : 'In crediti, almeno 1.'}>
          <${NumInput} id="atl-qt" value=${a.quotazione} min="1" step="1" onChange=${function (v) { set('quotazione', Math.round(v)); }}/>
        <//>
        <div class="field">
          <span class="lbl">Listone</span>
          <label class="check" htmlFor="atl-attivo"><input id="atl-attivo" type="checkbox" checked=${a.attivo !== false} onChange=${function (e) { set('attivo', e.target.checked); }}/> Atleta attivo</label>
          <span class="help">Chi non tira più resta nello storico ma esce dal listone.</span>
        </div>
      </div>
      <div class="eyebrow" style=${{ margin: '16px 0 8px' }}>Infermeria</div>
      <div class="form-grid">
        <${UI.Field} id="atl-inf-stato" label="Stato">
          <select id="atl-inf-stato" class="input" value=${a.infermeria.stato || ''} onChange=${function (e) { setInf('stato', e.target.value); }}>
            ${stati.map(function (x) { return html`<option key=${x || 'ok'} value=${x}>${x || 'Disponibile'}</option>`; })}
          </select>
        <//>
        <${UI.Field} id="atl-inf-nota" label="Nota" help="Visibile a tutti: scrivila con tatto.">
          <input id="atl-inf-nota" class="input" maxLength="80" placeholder="Es. distorsione alla caviglia" value=${a.infermeria.nota || ''} disabled=${!a.infermeria.stato} onInput=${function (e) { setInf('nota', e.target.value); }}/>
        <//>
        <${UI.Field} id="atl-inf-al" label="Rientro previsto">
          <input id="atl-inf-al" class="input" type="date" value=${a.infermeria.al || ''} disabled=${!a.infermeria.stato} onInput=${function (e) { setInf('al', e.target.value); }}/>
        <//>
      </div>
      ${errs.length ? html`<ul class="small" style=${ERR_LIST}>${errs.map(function (e, i) { return html`<li key=${i}>${e}</li>`; })}</ul>` : null}
    <//>`;
  }

  function TabAtleti() {
    var s = FS.useFS();
    var d = FS.derived();
    var stQ = useState('');
    var stF = useState('tutti');
    var stL = useState(50);
    var stE = useState(null);
    var canComm = d.gestisceCircuito && s.canWrite;
    var righe = useMemo(function () {
      return Object.values(s.atleti).sort(cmpAtleti).map(function (a) {
        var st = d.statsAtleti[a.fis];
        return {
          a: a, inf: UI.infoAtleta(a, d),
          qtA: st ? st.qtA : (Number(a.quotazione) || 1),
          pres: st ? st.stagione.presenze : 0, tot: st ? st.tutto.presenze : 0,
          testo: norm([a.cognome, a.nome, a.fis, a.anno].join(' ')),
        };
      });
    }, [s.version]);
    var q = norm(stQ[0].trim());
    var filtro = stF[0];
    var lista = righe.filter(function (r) {
      if (q && r.testo.indexOf(q) < 0) return false;
      if (filtro === 'attivi') return r.a.attivo !== false;
      if (filtro === 'inattivi') return r.a.attivo === false;
      if (filtro === 'infermeria') return !!(r.a.infermeria && r.a.infermeria.stato);
      if (filtro === 'forzati') return !!r.a.ruolo;
      return true;
    });
    var visibili = lista.slice(0, stL[0]);
    return html`<div class="stack">
      <${Nota} breve="Listone comune a tutte le leghe">Il listone è comune a tutte le leghe. Qui correggi anagrafica, ruolo, quotazione iniziale e infermeria.<//>
      <${UI.Card} title="Listone" meta=${righe.length + ' atleti'} flush=${true}
        right=${html`<button type="button" class="btn sm" disabled=${!canComm} onClick=${function () { stE[1]({ nuovo: true }); }}>Nuovo atleta</button>`}>
        <div class="form-grid" style=${{ padding: '4px 16px 12px' }}>
          <${UI.Field} id="atleti-cerca" label="Cerca">
            <input id="atleti-cerca" class="input" type="search" placeholder="Cognome, nome, tessera…" value=${stQ[0]} onInput=${function (e) { stQ[1](e.target.value); stL[1](50); }}/>
          <//>
          <${UI.Field} id="atleti-filtro" label="Mostra">
            <select id="atleti-filtro" class="input" value=${filtro} onChange=${function (e) { stF[1](e.target.value); stL[1](50); }}>
              <option value="tutti">Tutti</option>
              <option value="attivi">Attivi</option>
              <option value="inattivi">Non attivi</option>
              <option value="infermeria">In infermeria</option>
              <option value="forzati">Con ruolo forzato</option>
            </select>
          <//>
        </div>
        ${visibili.length ? html`<div class="tbl-wrap"><table class="tbl pz-rows pz-atl">
          <thead><tr><th>Atleta</th><th class="r">Anno</th><th>Categoria</th><th>Ruolo</th><th class="r">Qt.I</th><th class="r">Qt.A</th><th class="r" title="In stagione / in totale">Gare</th><th>Stato</th><th></th></tr></thead>
          <tbody>${visibili.map(function (r) {
            var a = r.a;
            return html`<tr key=${a.fis} class="click" onClick=${function () { stE[1]({ fis: a.fis }); }}>
              <td class="pz-c-t"><div class="pz-nm" style=${{ fontWeight: 600, whiteSpace: 'nowrap' }}>${UI.nomeAtleta(a)}</div><div class="tiny faint">${a.fis}</div></td>
              <td class="r pz-c-a">${a.anno || '–'}</td>
              <td class="small pz-c-b">${r.inf.catLabel}</td>
              <td class="pz-c-c" style=${{ whiteSpace: 'nowrap' }}><${UI.Role} ruolo=${r.inf.ruolo}/>${a.ruolo ? html`<span class="tiny faint" style=${{ marginLeft: '4px' }} title="Ruolo forzato dal presidente">forzato</span>` : null}</td>
              <td class="r pz-c-x"><span class="pz-lab">Qt.I </span>${a.quotazione || 1}</td>
              <td class="r pz-c-y"><span class="pz-lab">→ Qt.A </span>${r.qtA}</td>
              <td class="r pz-c-z">${r.pres}/${r.tot}<span class="pz-lab"> gare</span></td>
              <td class="pz-c-w"><div class="row" style=${{ gap: '4px' }}>
                ${a.attivo === false ? html`<span class="tag">Non attivo</span>` : html`<span class="tag green">Attivo</span>`}
                ${a.infermeria && a.infermeria.stato ? html`<span class="tag red" title=${a.infermeria.nota || ''}>${a.infermeria.stato}</span>` : null}
              </div></td>
              <td class="r pz-c-act"><button type="button" class="btn xs ghost" onClick=${function (e) { e.stopPropagation(); stE[1]({ fis: a.fis }); }}>Modifica</button></td>
            </tr>`;
          })}</tbody>
        </table></div>` : html`<${UI.Empty} title=${righe.length ? 'Nessun atleta trovato' : 'Listone vuoto'}>${righe.length ? 'Prova a cambiare la ricerca o il filtro.' : 'Gli atleti arrivano con l\'import da 4Fence, oppure aggiungili a mano.'}<//>`}
        ${lista.length > visibili.length ? html`<div class="card-f" style=${{ justifyContent: 'center' }}><button type="button" class="btn sm ghost" onClick=${function () { stL[1](stL[0] + 50); }}>Mostra altri (${lista.length - visibili.length})</button></div>` : null}
      <//>
      ${stE[0] ? html`<${AtletaEditor} key=${stE[0].fis || 'nuovo'} fis=${stE[0].fis || null} onClose=${function () { stE[1](null); }}/>` : null}
    </div>`;
  }

  // ============================================================ 7. GIORNATE
  function Rettifiche() {
    var s = FS.useFS();
    var d = FS.derived();
    var stT = useState('');
    var stN = useState('');
    var stP = useState(null);
    var stX = useState('');
    var askS = useAsk();
    var canAdmin = d.isAdmin && s.canWrite;
    var team = d.teamIds.indexOf(stT[0]) >= 0 ? stT[0] : (d.teamIds[0] || '');
    var gDef = d.ultima || d.inCorso || d.prossima || d.giornate[0] || null;
    var n = stN[0] && s.giornate[stN[0]] ? stN[0] : (gDef ? String(gDef.n) : '');
    var lista = s.rettifiche.slice().sort(function (a, b) { return (Number(b.n) - Number(a.n)) || ((b.at || 0) - (a.at || 0)); });
    function registra() {
      if (!team || !n) { errore('Scegli squadra e giornata.'); return null; }
      if (!stP[0]) { errore('Indica i punti (negativi per una penalità).'); return null; }
      return FS.act.aggiungiRettifica({ teamId: team, n: Number(n), punti: stP[0], nota: stX[0].trim() })
        .then(function () { stP[1](null); stX[1](''); });
    }
    function elimina(r) {
      askS[1]({
        title: 'Eliminare la rettifica?', danger: true, yes: 'Elimina',
        text: UI.segno(r.punti) + ' punti a ' + FS.nomeSquadra(r.teamId) + ' nella G' + r.n + (r.nota ? ' («' + r.nota + '»)' : '') + ' non verranno più conteggiati.',
        run: function () { return FS.act.eliminaRettifica(r.id); },
      });
    }
    return html`<${UI.Card} title="Penalità e punti extra" meta="si sommano al punteggio di giornata">
      ${d.teamIds.length && d.giornate.length ? html`<div>
        <div class="form-grid">
          <${UI.Field} id="rett-team" label="Squadra">
            <select id="rett-team" class="input" value=${team} disabled=${!canAdmin} onChange=${function (e) { stT[1](e.target.value); }}>
              ${d.teamIds.map(function (t) { return html`<option key=${t} value=${t}>${(s.squadre[t] && s.squadre[t].nome) || 'Squadra'}</option>`; })}
            </select>
          <//>
          <${UI.Field} id="rett-giornata" label="Giornata">
            <select id="rett-giornata" class="input" value=${n} disabled=${!canAdmin} onChange=${function (e) { stN[1](e.target.value); }}>
              ${d.giornate.map(function (g) { return html`<option key=${g.n} value=${String(g.n)}>${'G' + g.n + ' · ' + nomeGiornata(g)}</option>`; })}
            </select>
          <//>
          <${UI.Field} id="rett-punti" label="Punti" help="Negativi per una penalità.">
            <${NumInput} id="rett-punti" value=${stP[0]} step="0.5" allowEmpty=${true} disabled=${!canAdmin} placeholder="es. -2" onChange=${function (v) { stP[1](v); }}/>
          <//>
          <${UI.Field} id="rett-nota" label="Motivo">
            <input id="rett-nota" class="input" maxLength="200" placeholder="Es. formazione inserita in ritardo" value=${stX[0]} disabled=${!canAdmin} onInput=${function (e) { stX[1](e.target.value); }}/>
          <//>
        </div>
        <div class="row" style=${ACTIONS}><${UI.AsyncBtn} cls="sm" disabled=${!canAdmin || !stP[0]} onClick=${registra}>Registra<//></div>
      </div>` : html`<div class="small muted">Servono almeno una squadra e una giornata.</div>`}
      ${lista.length ? html`<div class="list" style=${{ marginTop: '10px' }}>${lista.map(function (r) {
        return html`<div class="li" key=${r.id}>
          <span class=${'tag ' + (Number(r.punti) > 0 ? 'green' : 'red')}>${UI.segno(r.punti)}</span>
          <div class="body">
            <div class="title small">${FS.nomeSquadra(r.teamId)} · G${r.n}</div>
            <div class="sub">${r.nota || 'Senza motivo'}${r.by ? ' · ' + FS.nomeGiocatore(r.by) : ''}${r.at ? ' · ' + UI.ago(r.at) : ''}</div>
          </div>
          <button type="button" class="btn xs ghost" disabled=${!canAdmin} onClick=${function () { elimina(r); }}>Elimina</button>
        </div>`;
      })}</div>` : html`<p class="small muted" style=${{ marginBottom: 0 }}>Nessuna rettifica registrata.</p>`}
      ${askS[0]}
    <//>`;
  }

  function TabGiornate() {
    var s = FS.useFS();
    var d = FS.derived();
    var now = FS.useTick(60000);
    var askS = useAsk();
    var canAdmin = d.isAdmin && s.canWrite;
    var righe = useMemo(function () {
      return d.giornate.map(function (g) {
        var tot = d.esitiTot[g.n] || {};
        var best = Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a]; })[0] || null;
        return {
          g: g,
          gare: E.gareDellaGiornata(g, s.gare).length,
          salvate: d.teamIds.filter(function (t) { return !!s.formazioni[g.n + '__' + t]; }).length,
          valide: d.teamIds.filter(function (t) { return !!FS.formazioneEffettiva(t, g.n); }).length,
          best: best, bestPt: best ? tot[best] : null,
        };
      });
    }, [s.version]);
    function ufficializza(r, st) {
      var g = r.g;
      var testo = 'I punteggi di «' + nomeGiornata(g) + '» vengono congelati con le formazioni e i risultati di adesso: la classifica li userà così come sono.';
      if (!r.gare) testo += ' Attenzione: non c\'è ancora nessuna gara importata, quindi ogni titolare prenderebbe il voto d\'ufficio.';
      if (st.k === 'corso') testo += ' La finestra non è ancora finita (fino al ' + UI.data(g.al) + '): le gare dei prossimi giorni non verrebbero contate.';
      testo += ' Potrai sempre riaprirla.';
      askS[1]({ title: 'Ufficializzare la giornata ' + g.n + '?', yes: 'Ufficializza', text: testo, run: function () { return FS.act.ufficializzaGiornata(g.n); } });
    }
    function riapri(g) {
      askS[1]({
        title: 'Riaprire la giornata ' + g.n + '?', yes: 'Riapri', danger: true,
        text: 'La giornata torna provvisoria: i punteggi si ricalcolano con i risultati e le formazioni attuali, finché non la ufficializzi di nuovo.',
        run: function () { return FS.act.riapriGiornata(g.n); },
      });
    }
    return html`<div class="stack">
      <${UI.Card} title="Giornate" meta="ufficializza quando i risultati sono completi">
        ${righe.length ? html`<div class="list">${righe.map(function (r) {
          var g = r.g;
          var st = statoGiornata(g, s, d, now);
          return html`<div class="li" key=${g.n} style=${{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <span class="pos" style=${{ width: '34px' }}>${g.n}</span>
            <div class="body" style=${{ minWidth: '200px' }}>
              <div class="title">${nomeGiornata(g)}</div>
              <div class="sub">${UI.finestra(g)} · formazioni entro ${UI.dataOra(d.scadenza(g))}</div>
              <div class="row" style=${{ gap: '6px', marginTop: '6px' }}>
                <span class=${'tag ' + st.cls}>${st.label}</span>
                <span class="tag">${r.gare === 1 ? '1 gara importata' : r.gare + ' gare importate'}</span>
                <span class="tag">${r.valide}/${d.teamIds.length} formazioni valide${r.salvate !== r.valide ? ' (' + r.salvate + ' salvate)' : ''}</span>
              </div>
              ${r.best && st.k !== 'aperta' && st.k !== 'pre' ? html`<div class="small muted" style=${{ marginTop: '4px' }}>${st.k === 'uff' ? 'Ha vinto' : 'In testa per ora'}: <b>${FS.nomeSquadra(r.best)}</b> con ${UI.fmt(r.bestPt)}</div>` : null}
            </div>
            <div class="row" style=${{ gap: '6px' }}>
              ${st.k === 'uff'
                ? html`<button type="button" class="btn sm ghost" disabled=${!canAdmin} onClick=${function () { riapri(g); }}>Riapri</button>`
                : html`<button type="button" class="btn sm ok" disabled=${!canAdmin || st.k === 'aperta' || st.k === 'pre'} title=${st.k === 'aperta' ? 'Le formazioni sono ancora aperte' : ''} onClick=${function () { ufficializza(r, st); }}>Ufficializza</button>`}
            </div>
          </div>`;
        })}</div>` : html`<${UI.Empty} title="Nessuna giornata">Crea le giornate nella sezione Calendario.<//>`}
      <//>
      <${Rettifiche}/>
      ${askS[0]}
    </div>`;
  }

  // ================================================================ VISTA
  var CORPI = { lega: TabLega, regole: TabRegole, squadre: TabSquadre, calendario: TabCalendario, risultati: TabRisultati, atleti: TabAtleti, giornate: TabGiornate };

  V.Presidenza = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var st = useState(function () {
      var t = null;
      try { t = localStorage.getItem(TAB_KEY); } catch (e) { /* niente */ }
      return CORPI[t] ? t : 'lega';
    });
    var tab = st[0];
    var subRef = useRef(null);
    useEffect(function () {
      var box = subRef.current;
      if (!box || box.scrollWidth <= box.clientWidth) return;
      var el = box.querySelector('[aria-pressed="true"]');
      if (el) box.scrollLeft = Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2);
    }, [tab]);
    function setTab(t) {
      st[1](t);
      try { localStorage.setItem(TAB_KEY, t); } catch (e) { /* niente */ }
    }
    if (!d.lega || !d.isCommissario) {
      return html`<${UI.Empty} title="Area riservata">Questa sezione è per il presidente della lega.<//>`;
    }
    var now = FS.now();
    var daUff = d.isAdmin ? d.giocate.filter(function (g) { return statoGiornata(g, s, d, now).k === 'fine'; }).length : 0;
    var Corpo = CORPI[tab] || TabLega;
    return html`<div class="stack pz">
      <div class="crumbs"><span class="c">${d.lega.nome}</span><span class="faint">›</span><span class="c on">Presidenza</span></div>
      ${!d.isAdmin ? html`<div class="banner warn">Sei il proprietario di Fantascherma ma non presidente di questa lega: puoi curare calendario, risultati e listone (comuni a tutte le leghe). Regole, squadre e giornate restano al presidente.</div>` : null}
      ${!s.canWrite ? html`<div class="banner warn">Sei in sola lettura: per modificare chiedi al proprietario di invitarti come Editor.</div>` : null}
      <div class="subtabs" ref=${subRef} role="group" aria-label="Sezioni della presidenza">
        ${TABS.map(function (t) {
          var badge = t.id === 'giornate' && daUff ? daUff : 0;
          return html`<button type="button" key=${t.id} class="pill" aria-pressed=${tab === t.id} onClick=${function () { setTab(t.id); }}>
            ${t.label}${badge ? html`<span class="tag red" style=${{ marginLeft: '2px', padding: '0 6px' }} title="Giornate da ufficializzare">${badge}</span>` : null}
          </button>`;
        })}
      </div>
      <${Corpo}/>
    </div>`;
  };
})(window);
