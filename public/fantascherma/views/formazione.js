/* Vista Formazione: "Inserisci formazione" sulla pedana.
 * Cinque titolari in pedana + panchina ordinata (ordine di ingresso).
 * Interazione tocca-e-scambia (funziona anche su touch): tocca uno slot e poi un atleta
 * della panchina (o viceversa) per scambiarli; tocca due slot per invertirli.
 */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useMemo = React.useMemo, useEffect = React.useEffect, useRef = React.useRef;

  // ------------------------------------------------------------ utilità pure
  /** Fantamedia da mostrare: stagione in corso se ha presenze, altrimenti storica. */
  function fmDi(d, id) {
    var st = d.statsAtleti && d.statsAtleti[id];
    if (!st) return null;
    if (st.stagione && st.stagione.presenze) return st.stagione.fm;
    if (st.tutto && st.tutto.presenze) return st.tutto.fm;
    return null;
  }

  /**
   * Bozza di formazione nel formato della vista: { slots:[id|null × T], panchina:[id] }.
   * Accetta sia una bozza (slots) sia un documento salvato (titolari); scarta chi non è più in rosa,
   * mette in panchina (in coda) i nuovi arrivati.
   * `soloSalvata`: in sola lettura mostra la panchina così com'è stata salvata (è quella che conta per i
   * cambi), senza aggiungere gli atleti arrivati dopo.
   */
  function normalizza(f, rosaIds, T, soloSalvata) {
    var inRosa = {};
    rosaIds.forEach(function (id) { inRosa[id] = 1; });
    var used = {}, slots = [], extra = [];
    var src = f ? (f.slots || f.titolari || []) : [];
    src.forEach(function (id, i) {
      var ok = !!(id && inRosa[id] && !used[id]);
      if (i < T) { slots.push(ok ? id : null); if (ok) used[id] = 1; }
      else if (ok) extra.push(id);
    });
    while (slots.length < T) slots.push(null);
    var pan = [];
    extra.concat((f && f.panchina) || [], soloSalvata ? [] : rosaIds).forEach(function (id) {
      if (id && inRosa[id] && !used[id]) { pan.push(id); used[id] = 1; }
    });
    return { slots: slots, panchina: pan };
  }

  /** Dal formato vista al formato documento (quello di FS.act.salvaFormazione). */
  function compatta(f) {
    return { titolari: f.slots.filter(Boolean), panchina: f.panchina.slice() };
  }

  function uguali(a, b) {
    if (!a || !b) return false;
    return (a.titolari || []).join('|') === (b.titolari || []).join('|') &&
      (a.panchina || []).join('|') === (b.panchina || []).join('|');
  }

  /** Proposta automatica: i più probabili in pedana (a parità, fantamedia più alta). */
  function proposta(rosaIds, probs, d, T) {
    var sc = rosaIds.map(function (id) { var pr = probs[id]; return { id: id, p: pr ? pr.pct : 0, ok: !!(pr && pr.lvl === 'ok'), fm: fmDi(d, id) || 0 }; });
    sc.sort(function (a, b) { return b.p - a.p || b.fm - a.fm; });
    var tit = sc.slice(0, T);
    return {
      slots: tit.map(function (x) { return x.id; }),
      panchina: sc.slice(T).map(function (x) { return x.id; }),
    };
  }

  function uniq(list) { var seen = {}; return list.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }); }
  function catShort(c) { var x = E.CATEGORIE.filter(function (k) { return k.code === c; })[0]; return x ? x.short : c; }
  var SESSO = { M: 'maschile', F: 'femminile', MF: 'maschile e femminile' };
  var LIVELLO = { 'regionale': 'Regionale', 'interregionale': 'Interregionale', 'nazionale': 'Nazionale', 'campionato-regionale': 'Camp. regionale', 'campionato-italiano': 'Camp. italiano' };
  function scheda(id) { if (id && UI.openAtleta) UI.openAtleta(id); }
  function infDi(a) { return a && a.infermeria && a.infermeria.stato ? a.infermeria : null; }

  /** Etichetta della probabilità; il prefisso «Gara prevista:» si nasconde sul telefono. */
  function Etichetta(p) {
    var m = /^(Gara prevista: )(.*)$/.exec(p.pr.label || '');
    return html`<span class=${'fz-lbl' + (p.cls ? ' ' + p.cls : '')}>${m ? html`<${React.Fragment}><span class="fz-pre">${m[1]}</span>${m[2]}<//>` : p.pr.label}</span>`;
  }

  function LockIcon() {
    return html`<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style=${{ flex: 'none' }}><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>`;
  }

  // -------------------------------------------------------- selettore giornata
  function GiornatePills(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var now = FS.now();
    var ref = useRef(null);
    useEffect(function () {
      var box = ref.current;
      if (!box || box.scrollWidth <= box.clientWidth) return;
      var el = box.querySelector('[aria-pressed="true"]');
      if (el) box.scrollLeft = Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2);
    }, [p.n, d.attive.length]);
    return html`<div class="fz-giornate" ref=${ref} role="group" aria-label="Scegli la giornata">${d.attive.map(function (g) {
      var salvata = !!(d.mia && s.formazioni[g.n + '__' + s.uid]);
      var aperta = d.scadenza(g) > now;
      var on = g.n === p.n;
      var label = (g.nome || 'Giornata ' + g.n) + ' · ' + UI.finestra(g) + (aperta ? '' : ' · chiusa') + (salvata ? ' · formazione salvata' : '');
      return html`<button type="button" key=${g.n} class=${'pill' + (aperta ? '' : ' fz-past')} aria-pressed=${on ? 'true' : 'false'} title=${label} aria-label=${label} onClick=${function () { p.onPick(g.n); }}>
        ${d.mia ? html`<span class=${'lamp' + (salvata ? ' v' : '')} aria-hidden="true"></span>` : null}G${g.n}
      </button>`;
    })}</div>`;
  }

  // ------------------------------------------------------- probabili (laterale)
  function Probabili(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var g = p.g, probs = p.probs || {}, cur = p.cur;
    var ids = (d.miaRosa ? d.miaRosa.rosa.map(function (x) { return x.id; }) : []).slice().sort(function (a, b) {
      return ((probs[b] || {}).pct || 0) - ((probs[a] || {}).pct || 0) || (fmDi(d, b) || 0) - (fmDi(d, a) || 0);
    });
    var attese = g.gareAttese || [];
    var gareG = p.gareG || [];
    return html`<${UI.Card} cls="fz-probabili" title="Probabili della giornata" meta=${'G' + g.n + ' · ' + UI.finestra(g)}>
      <div class="eyebrow">Gare in calendario</div>
      ${attese.length ? html`<div class="list">${attese.map(function (x, i) {
        var cats = (x.categorie || []).map(catShort).join(', ');
        return html`<div class="li fz-li" key=${i}>
          <div class="body">
            <div class="title small">${x.nome}</div>
            <div class="sub tiny">${UI.data(x.data, true)}${x.luogo ? ' · ' + x.luogo : ''}${cats ? ' · ' + cats : ''}${x.sesso && SESSO[x.sesso] ? ' · ' + SESSO[x.sesso] : ''}</div>
          </div>
          ${x.livello ? html`<span class="tag">${LIVELLO[x.livello] || x.livello}</span>` : null}
        </div>`;
      })}</div>` : html`<div class="small muted">Le gare di questa giornata non sono ancora state indicate.</div>`}
      ${gareG.length ? html`<div><div class="eyebrow fz-mt">Risultati già importati da 4Fence</div>
        <div class="list">${gareG.map(function (x) {
          return html`<div class="li fz-li" key=${x.id}><div class="body"><div class="title small">${UI.nomeGara(x)}</div><div class="sub tiny">${UI.data(x.data, true)}${x.catLabel ? ' · ' + x.catLabel : ''}</div></div></div>`;
        })}</div></div>` : null}
      ${ids.length ? html`<div><div class="eyebrow fz-mt">La tua rosa</div>
        <div class="list fz-prob">${ids.map(function (id) {
          var a = s.atleti[id];
          var pr = probs[id] || { lvl: 'low', label: '—', pct: 0 };
          var tit = cur && cur.slots.indexOf(id) >= 0;
          var k = cur ? cur.panchina.indexOf(id) : -1;
          return html`<button type="button" class="fz-line" key=${id} title=${'Apri la scheda di ' + UI.nomeAtleta(a)} onClick=${function () { scheda(id); }}>
            <span class=${'lamp ' + (pr.lvl === 'ok' ? 'v' : pr.lvl === 'no' ? 's' : '')} aria-hidden="true"></span>
            <span class="t"><span class="fz-nm">${UI.nomeAtleta(a, true)}</span><${Etichetta} pr=${pr}/></span>
            <${UI.ProbBar} prob=${pr}/>
            ${tit ? html`<span class="tag blue">Titolare</span>` : k >= 0 ? html`<span class="tag">Panchina ${k + 1}</span>` : null}
          </button>`;
        })}</div></div>` : null}
    <//>`;
  }

  // ------------------------------------------------------- regole in breve
  function RegoleFormazione(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var st = d.settings;
    return html`<${UI.Card} cls="fz-regole" title="Come funziona" footer=${html`<button type="button" class="linkbtn" onClick=${function () { p.go('regolamento'); }}>Regolamento completo</button>`}>
      <ul class="small fz-ul">
        <li>${st.titolari} titolari in pedana; gli altri atleti della rosa vanno in panchina, in ordine di ingresso.</li>
        <li>Chi non gareggia è senza voto (s.v.): entra il primo della panchina che ha gareggiato${st.sostituzioniStessoRuolo ? ', dello stesso ruolo' : ''}, fino a ${st.maxSostituzioni} ${st.maxSostituzioni === 1 ? 'cambio' : 'cambi'}. Se nessuno può entrare, lo slot vale ${UI.fmt(st.votoUfficio)}.</li>
        <li>Se un atleta fa due gare nella stessa giornata, conta la prima in ordine di data.</li>
        <li>Se non salvi, vale l'ultima formazione salvata.</li>
        ${!st.moduloLibero ? html`<li>Moduli ammessi (U14-U20-SEN): ${(st.moduli || []).join(', ')}.</li>` : null}
      </ul>
    <//>`;
  }

  // ------------------------------------------------ formazioni di tutte le squadre
  function FormazioniGiornata(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var n = p.g.n;
    var righe = useMemo(function () {
      if (!p.chiusa) return [];
      var ids = d.teamIds.slice().sort(function (a, b) { return (b === s.uid ? 1 : 0) - (a === s.uid ? 1 : 0); });
      return ids.map(function (t) { return { t: t, f: FS.formazioneEffettiva(t, n), salvata: !!s.formazioni[n + '__' + t] }; });
    }, [s.version, n, p.chiusa]);
    if (!p.chiusa) {
      return html`<${UI.Card} title="Formazioni della giornata">
        <div class="fz-lock"><${LockIcon}/><span>Le formazioni ${d.mia ? 'delle altre squadre' : 'delle squadre'} restano nascoste fino alla chiusura: ${UI.dataOra(p.scad)}.</span></div>
      <//>`;
    }
    if (!righe.length) return html`<${UI.Card} title="Formazioni della giornata"><${UI.Empty} title="Nessuna squadra">Nessuna squadra iscritta alla lega.<//><//>`;
    var tot = d.esitiTot[n] || {};
    return html`<section class="stack" aria-label="Formazioni della giornata">
      <div class="row between"><div class="section-title">Formazioni della giornata</div>${p.go ? html`<button type="button" class="btn ghost sm" onClick=${function () { p.go('giornate'); }}>Punteggi della giornata</button>` : null}</div>
      <div class="grid grid-2">${righe.map(function (r) {
        var team = s.squadre[r.t];
        var f = r.f;
        return html`<section class=${'card' + (r.t === s.uid ? ' fz-me' : '')} key=${r.t}>
          <div class="card-h">
            <${UI.TeamMask} team=${team} size=${36}/>
            <div class="grow"><div class="fz-tn">${team ? team.nome : 'Squadra'}</div><div class="tiny muted">${FS.nomeGiocatore(r.t)}</div></div>
            ${tot[r.t] !== undefined && tot[r.t] !== null ? html`<div class="fz-tot"><span class="fv">${UI.fmt(tot[r.t])}</span><span class="tiny muted">fantapunti</span></div>` : null}
          </div>
          <div class="card-b">
            <div class="row fz-tags">
              ${r.salvata ? html`<span class="tag green">Salvata</span>` : f ? html`<span class="tag gold">Recuperata dalla G${f.salvataPer}</span>` : html`<span class="tag red">Nessuna formazione</span>`}
              ${f ? html`<span class="tag blue" title="Modulo U14-U20-SEN">${E.moduloDi(f.titolari, s.atleti, d.stagione)}</span>` : null}
            </div>
            ${f ? html`<div><div class="list">${f.titolari.map(function (id) {
              var a = s.atleti[id];
              return html`<button type="button" class="fz-line" key=${id} title=${'Apri la scheda di ' + UI.nomeAtleta(a)} onClick=${function () { scheda(id); }}>
                <${UI.AtletaMask} atleta=${a} size=${30} team=${team}/>
                <span class="t"><span class="fz-nm">${UI.nomeAtleta(a, true)}</span></span>
                <${UI.Role} ruolo=${a ? E.ruoloAtleta(a, d.stagione) : 'SEN'}/>
              </button>`;
            })}</div>
            ${f.panchina.length ? html`<div class="small muted fz-panc"><b>Panchina:</b> ${f.panchina.map(function (id, k) { return (k + 1) + '. ' + UI.nomeAtleta(s.atleti[id], true); }).join(' · ')}</div>` : null}</div>`
              : html`<div class="small muted">Nessuna formazione valida per questa giornata.</div>`}
          </div>
        </section>`;
      })}</div>
    </section>`;
  }

  // ------------------------------------------------------------------- vista
  V.Formazione = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var now = FS.useTick(10000);
    var stN = useState(null);
    var stDraft = useState(null);
    var stSel = useState(null);
    var stAsk = useState(null);
    var phone = UI.useMq(UI.PHONE);

    var attive = d.attive || [];
    var defG = d.prossima || d.inCorso || d.ultima || attive[attive.length - 1] || null;
    var n = stN[0] !== null && attive.some(function (x) { return x.n === stN[0]; }) ? stN[0] : (defG ? defG.n : null);
    var g = n !== null ? (attive.filter(function (x) { return x.n === n; })[0] || null) : null;
    var T = d.settings.titolari;
    var rosaIds = d.miaRosa ? d.miaRosa.rosa.map(function (x) { return x.id; }) : [];
    var rosaKey = rosaIds.join('|');

    var base = useMemo(function () {
      if (!g || !d.mia) return null;
      var probs = {};
      rosaIds.forEach(function (id) { probs[id] = UI.probabile(s.atleti[id], g, s, d); });
      return {
        probs: probs,
        saved: s.formazioni[n + '__' + s.uid] || null,
        eff: FS.formazioneEffettiva(s.uid, n),
        prev: FS.formazioneEffettiva(s.uid, n - 1),
        auto: proposta(rosaIds, probs, d, T),
        gareG: E.gareDellaGiornata(g, s.gare),
      };
    }, [s.version, n, rosaKey]);

    var scad = g ? d.scadenza(g) : 0;
    var chiusa = g ? scad <= now : true;
    var editable = !!(g && d.mia && s.canWrite && !chiusa && rosaIds.length);
    var fonte = !base ? 'nessuna' : base.saved ? 'salvata' : base.eff ? 'recuperata' : editable ? 'auto' : 'nessuna';
    var initial = normalizza(base ? (base.eff || (editable ? base.auto : null)) : null, rosaIds, T, !editable);

    var draft = stDraft[0];
    var useDraft = !!(editable && draft && draft.n === n && (draft.dirty || (draft.pending && !(base && base.saved && base.saved.at >= draft.t0))));
    var cur = useDraft ? normalizza(draft.f, rosaIds, T) : initial;
    var fSave = compatta(cur);
    var sel = editable ? stSel[0] : null;
    if (sel && sel.k === 'bench' && cur.panchina.indexOf(sel.id) < 0) sel = null;
    if (sel && sel.k === 'slot' && !(sel.i >= 0 && sel.i < T)) sel = null;
    var ask = stAsk[0];

    // ---------------------------------------------------------- stati vuoti
    var crumbs = html`<div class="crumbs"><span class="c">${d.lega ? d.lega.nome : 'Lega'}</span><span class="faint">›</span><span class="c on">Formazione</span></div>`;
    function pick(m) {
      if (m === n) return;
      var cambia = function () { stDraft[1](null); stSel[1](null); stN[1](m); stAsk[1](null); };
      if (useDraft && draft.dirty && base && (!base.eff || !uguali(fSave, base.eff))) {
        stAsk[1]({ title: 'Modifiche non salvate', text: 'Hai cambiato la formazione della G' + n + ' senza salvarla. Se cambi giornata le modifiche andranno perse.', yes: 'Cambia giornata', danger: true, onYes: cambia });
      } else { stSel[1](null); stN[1](m); }
    }
    var confirmEl = ask ? html`<${UI.Confirm} title=${ask.title} yes=${ask.yes} danger=${ask.danger} onYes=${ask.onYes} onNo=${function () { stAsk[1](null); }}>${ask.text}<//>` : null;

    if (!attive.length || !g) {
      return html`<div class="stack">
        ${crumbs}
        <${UI.Card}><${UI.Empty} title="Calendario in arrivo">Il presidente non ha ancora inserito le giornate della stagione: appena ci saranno, qui potrai schierare la formazione.
          ${d.isCommissario ? html`<div style=${{ marginTop: '12px' }}><button type="button" class="btn" onClick=${function () { p.go('presidenza'); }}>Vai alla presidenza</button></div>` : null}
        <//><//>
      </div>`;
    }
    if (!d.mia) {
      return html`<div class="stack">
        ${crumbs}
        <${GiornatePills} n=${n} onPick=${pick}/>
        <${UI.Card}><${UI.Empty} title="Non hai una squadra in questa lega">Puoi seguire la lega: le formazioni di tutte le squadre compaiono qui alla chiusura di ogni giornata.<//><//>
        <${FormazioniGiornata} g=${g} chiusa=${chiusa} scad=${scad} go=${p.go}/>
        ${confirmEl}
      </div>`;
    }
    if (!rosaIds.length) {
      return html`<div class="stack">
        ${crumbs}
        <${UI.Card}><${UI.Empty} title=${d.modalita === 'listone' ? 'La rosa è vuota: comprala dal listone' : 'La rosa è vuota: partecipa all\'asta'}>Per schierare la formazione servono almeno ${T} atleti in rosa (la rosa completa è di ${d.settings.rosa}).
          <div class="row" style=${{ justifyContent: 'center', marginTop: '12px' }}>
            ${d.modalita === 'listone'
              ? html`<button type="button" class="btn" onClick=${function () { p.go('listone'); }}>Vai al listone</button>`
              : html`<button type="button" class="btn" onClick=${function () { p.go('asta'); }}>Vai all'asta</button>`}
            ${d.puoComprare ? html`<button type="button" class="btn ghost" onClick=${function () { p.go('mercato'); }}>Mercato</button>` : null}
          </div>
        <//><//>
        <${GiornatePills} n=${n} onPick=${pick}/>
        <${FormazioniGiornata} g=${g} chiusa=${chiusa} scad=${scad} go=${p.go}/>
        ${confirmEl}
      </div>`;
    }

    // ----------------------------------------------------------- modifiche
    function setF(f) { stDraft[1]({ n: n, f: f, dirty: true }); }
    function edit(fn) {
      var f = { slots: cur.slots.slice(), panchina: cur.panchina.slice() };
      fn(f);
      setF(f);
    }
    function scambiaSlot(i, j) { edit(function (f) { var t = f.slots[i]; f.slots[i] = f.slots[j]; f.slots[j] = t; }); }
    function entra(id, i) {
      edit(function (f) {
        var k = f.panchina.indexOf(id);
        if (k < 0) return;
        var out = f.slots[i];
        f.slots[i] = id;
        if (out) f.panchina[k] = out; else f.panchina.splice(k, 1);
      });
    }
    function esce(i) { edit(function (f) { var out = f.slots[i]; if (!out) return; f.slots[i] = null; f.panchina.push(out); }); }
    function sposta(k, delta) {
      edit(function (f) { var j = k + delta; if (j < 0 || j >= f.panchina.length) return; var t = f.panchina[k]; f.panchina[k] = f.panchina[j]; f.panchina[j] = t; });
    }
    function scambiaPanchina(a, b) {
      edit(function (f) { var i = f.panchina.indexOf(a), j = f.panchina.indexOf(b); if (i < 0 || j < 0) return; f.panchina[i] = b; f.panchina[j] = a; });
    }

    function tapSlot(i) {
      if (!editable) { scheda(cur.slots[i]); return; }
      if (phone) { stSel[1]({ k: 'slot', i: i }); return; }
      if (!sel) { stSel[1]({ k: 'slot', i: i }); return; }
      if (sel.k === 'slot') {
        if (sel.i !== i) scambiaSlot(sel.i, i);
        stSel[1](null);
        return;
      }
      entra(sel.id, i);
      stSel[1](null);
    }
    function tapBench(id) {
      if (!editable) { scheda(id); return; }
      if (phone) { stSel[1]({ k: 'bench', id: id }); return; }
      if (!sel) { stSel[1]({ k: 'bench', id: id }); return; }
      if (sel.k === 'bench') {
        if (sel.id !== id) scambiaPanchina(sel.id, id);
        stSel[1](null);
        return;
      }
      entra(id, sel.i);
      stSel[1](null);
    }

    var modificata = useDraft && draft.dirty;
    function sostituisci(f, msg) {
      var go = function () { setF(normalizza(f, rosaIds, T)); stSel[1](null); stAsk[1](null); if (msg) FS.toast(msg); };
      if (modificata) stAsk[1]({ title: 'Sostituire le modifiche?', text: 'La formazione che stai preparando non è ancora salvata e verrà sostituita.', yes: 'Sostituisci', onYes: go });
      else go();
    }
    function copiaPrecedente() {
      if (!base.prev) return;
      sostituisci(base.prev, 'Copiata la formazione della G' + base.prev.salvataPer + ': ricordati di salvarla.');
    }
    function usaProposta() { sostituisci(base.auto, 'Proposta automatica pronta: controllala e salvala.'); }
    function salva() {
      var t0 = FS.now();
      var f = compatta(cur);
      var snapshot = { slots: cur.slots.slice(), panchina: cur.panchina.slice() };
      return FS.act.salvaFormazione(n, f).then(function () {
        stDraft[1]({ n: n, f: snapshot, dirty: false, pending: true, t0: t0 });
        stSel[1](null);
      });
    }

    // -------------------------------------------------------- validazione
    var errori = editable ? uniq(E.validaFormazione(fSave, rosaIds, s.atleti, d.settings, d.stagione)) : [];
    // senza gare in calendario né risultati importati tutti risultano "poco probabili": un solo avviso generico
    var gareNote = !!((g.gareAttese || []).length || base.gareG.length);
    var avvisi = editable ? fSave.titolari.filter(function (id) { var pr = base.probs[id]; return pr && (pr.lvl === 'no' || (pr.lvl === 'low' && gareNote)); }) : [];
    var cambiata = !base.eff || !uguali(fSave, base.eff);
    var canSave = editable && !errori.length && (!base.saved || cambiata);
    var motivo = !s.canWrite ? 'Sei in sola lettura' : chiusa ? 'La formazione per questa giornata è chiusa' : errori.length ? errori[0] : !canSave ? 'Nessuna modifica da salvare' : 'Salva la formazione per la G' + n;
    var prevF = base.prev ? normalizza(base.prev, rosaIds, T) : null;
    var prevUguale = prevF ? uguali(compatta(prevF), fSave) : true;
    var modulo = E.moduloDi(fSave.titolari, s.atleti, d.stagione);

    var quando = !base.saved || !base.saved.at || chiusa ? '' : (FS.now() - base.saved.at < 86400000 ? UI.ago(base.saved.at) : 'il ' + UI.dataOra(base.saved.at));
    var dalPresidente = !!(base.saved && base.saved.daAdmin && base.saved.daAdmin !== s.uid);
    var statoTag = base.saved ? html`<span class="tag green" title=${base.saved.at ? 'Salvata ' + UI.dataOra(base.saved.at) : 'Salvata'}>Salvata${dalPresidente ? ' dal presidente' : ''}${quando ? ' ' + quando : ''}</span>`
      : base.eff ? html`<span class="tag gold">Recuperata dalla G${base.eff.salvataPer}</span>`
        : html`<span class="tag red">Mancante</span>`;
    var extraTag = !editable ? null
      : (!useDraft && fonte === 'auto') ? html`<span class="tag blue">Proposta automatica</span>`
        : cambiata ? html`<span class="tag gold">Da salvare</span>` : null;

    // ------------------------------------------------------------ pedana
    function renderSlot(i) {
      var id = cur.slots[i];
      var isSel = !!(sel && sel.k === 'slot' && sel.i === i);
      var target = !!(sel && !isSel && (sel.k === 'bench' || sel.k === 'slot'));
      var cls = 'slot' + (id ? '' : ' empty') + (isSel ? ' sel' : '') + (target ? ' fz-target' : '');
      if (!id) {
        return html`<div class=${cls} key=${'s' + i}>
          <button type="button" class="slot-btn" aria-pressed=${isSel ? 'true' : 'false'} disabled=${!editable} aria-label=${'Slot ' + (i + 1) + ' libero' + (editable ? ': tocca e poi scegli un atleta della panchina' : '')} onClick=${function () { tapSlot(i); }}>
            <span class="ph" aria-hidden="true">+</span>
            <span class="nm fz-dim">Slot ${i + 1}</span>
          </button>
        </div>`;
      }
      var a = s.atleti[id];
      var pr = base.probs[id] || UI.probabile(a, g, s, d);
      var inf = infDi(a);
      var ruolo = a ? E.ruoloAtleta(a, d.stagione) : 'SEN';
      var label = 'Titolare ' + (i + 1) + ': ' + UI.nomeAtleta(a) + '. ' + pr.label + (editable ? '' : '. Apri la scheda');
      return html`<div class=${cls} key=${'s' + i}>
        <button type="button" class="slot-btn" aria-pressed=${isSel ? 'true' : 'false'} aria-label=${label} title=${pr.label} onClick=${function () { tapSlot(i); }}>
          <${UI.AtletaMask} atleta=${a} size=${54} team=${d.mia}/>
          <span class="nm">${UI.nomeAtleta(a, true)}</span>
          <span class="badges">
            <${UI.Role} ruolo=${ruolo}/>
            ${inf ? html`<span class="tag red fz-inf" title=${'Infermeria: ' + (inf.nota || inf.stato)}>✚</span>` : null}
          </span>
          <${UI.ProbBar} prob=${pr}/>
        </button>
      </div>`;
    }

    var selId = sel && sel.k === 'slot' ? cur.slots[sel.i] : null;
    var barra;
    if (!editable) {
      var perche = !s.canWrite ? 'Sei in sola lettura: puoi guardare la formazione ma non modificarla.'
        : chiusa ? (base.eff ? 'Formazione chiusa: per questa giornata vale quella qui sopra' + (fonte === 'recuperata' ? ' (recuperata dalla G' + base.eff.salvataPer + ').' : '.') : 'Formazione chiusa: per questa giornata non c\'è una formazione valida.')
          : '';
      barra = html`<div class="fz-hint">${perche}${fSave.titolari.length ? ' Tocca un atleta per aprire la sua scheda.' : ''}</div>`;
    } else if (selId && !phone) {
      // sul telefono la scelta avviene nel foglio: dietro resta l'indicazione generale
      var selA = s.atleti[selId];
      barra = html`<div class="fz-actions" role="group" aria-label=${'Azioni per ' + UI.nomeAtleta(selA)}>
        <span class="fz-selname">${UI.nomeAtleta(selA, true)}</span>
        <button type="button" class="btn sm ghost" onClick=${function () { esce(sel.i); stSel[1](null); }}>In panchina</button>
        <button type="button" class="btn sm ghost" onClick=${function () { scheda(selId); }}>Scheda</button>
        <button type="button" class="iconbtn" aria-label="Annulla la selezione" onClick=${function () { stSel[1](null); }}>✕</button>
      </div>`;
    } else if (sel && sel.k === 'slot' && !phone) {
      barra = html`<div class="fz-hint">Slot ${sel.i + 1} selezionato: ora tocca un atleta della panchina per schierarlo qui. <button type="button" class="linkbtn" onClick=${function () { stSel[1](null); }}>Annulla</button></div>`;
    } else if (sel && sel.k === 'bench' && !phone) {
      barra = html`<div class="fz-hint"><b>${UI.nomeAtleta(s.atleti[sel.id], true)}</b> selezionato: tocca uno slot sulla pedana per farlo entrare, oppure un altro atleta in panchina per scambiarne l'ordine. <button type="button" class="linkbtn" onClick=${function () { stSel[1](null); }}>Annulla</button></div>`;
    } else {
      // sul telefono un tocco apre il foglio di scelta (solo la panchina): niente scambi tra due titolari
      barra = html`<div class="fz-hint">${phone ? 'Tocca un titolare per scegliere chi entra, o un atleta in panchina per farlo entrare.' : 'Tocca un titolare e poi un atleta della panchina per scambiarli. Tocca due titolari per invertirli.'}</div>`;
    }

    var slots = [];
    for (var i = 0; i < T; i++) slots.push(renderSlot(i));
    var strumenti = html`<${React.Fragment}>
      <button type="button" class="btn sm ghost" disabled=${!editable || !base.prev || prevUguale} title=${base.prev ? 'Copia la formazione della G' + base.prev.salvataPer : 'Nessuna formazione precedente'} onClick=${copiaPrecedente}>Copia dalla precedente</button>
      ${editable ? html`<button type="button" class="btn sm ghost" title="I più probabili in pedana, poi la fantamedia" onClick=${usaProposta}>Proposta automatica</button>` : null}
    <//>`;

    var pedana = html`<section class="piste-wrap fz-wrap" aria-label="Pedana: i titolari">
      <div class="piste-head">
        <div class="grow">
          <div class="eyebrow">Giornata ${g.n} · ${UI.finestra(g)}</div>
          <div class="fz-title">${g.nome || 'Giornata ' + g.n}</div>
        </div>
        <div class="fz-cd">
          <span class="eyebrow">${chiusa ? 'Formazione' : 'Si chiude tra'}</span>
          <${UI.Countdown} to=${scad} chiuso="Chiusa"/>
          <span class="fz-sub">${UI.dataOra(scad)}</span>
        </div>
      </div>
      <div class="piste-head fz-head2">
        <span class="modulo-pill" title="Modulo: Under 14 - Under 20 - Senior">${modulo}</span>
        <span class="fz-legend" title="Ordine del modulo: Under 14, Under 20, Senior">${E.ORDINE_RUOLI.map(function (r) { return html`<${UI.Role} key=${r} ruolo=${r}/>`; })}</span>
        ${statoTag}
        ${extraTag}
        <div class="fz-btns">
          ${strumenti}
          <${UI.AsyncBtn} cls="sm fz-save-top" disabled=${!canSave} title=${motivo} busy="Salvataggio…" onClick=${salva}>Salva formazione<//>
        </div>
      </div>
      <div class="piste">
        <span class="eg l" aria-hidden="true"></span>
        <span class="eg r" aria-hidden="true"></span>
        <div class="piste-slots">${slots}</div>
      </div>
      ${barra}
    </section>`;

    // ------------------------------------------------------------ messaggi
    var banners = [];
    if (editable && !useDraft && fonte === 'auto') {
      banners.push(html`<div class="banner" key="auto"><span><b>Proposta automatica.</b> Non hai ancora salvato una formazione: ti suggeriamo i ${T} atleti con più probabilità di gareggiare (a parità, la fantamedia più alta). Controlla e salva.</span></div>`);
    } else if (editable && fonte === 'recuperata' && !useDraft) {
      banners.push(html`<div class="banner" key="rec"><span>Per questa giornata non hai ancora salvato: se non lo fai, vale la formazione della G${base.eff.salvataPer} che vedi qui sopra.</span></div>`);
    }
    if (errori.length) {
      banners.push(html`<div class="banner err" key="err"><div><b>Formazione non valida</b><ul class="fz-ul">${errori.map(function (e) { return html`<li key=${e}>${e}</li>`; })}</ul></div></div>`);
    }
    if (editable && !gareNote) {
      banners.push(html`<div class="banner warn" key="cal"><span>Le gare di questa giornata non sono ancora in calendario: quando il presidente le inserisce, qui vedrai chi ha più probabilità di scendere in pedana.</span></div>`);
    }
    if (avvisi.length) {
      banners.push(html`<div class="banner warn" key="warn"><div><b>Potrebbero non gareggiare in questa giornata</b>
        <ul class="fz-ul">${avvisi.map(function (id) { return html`<li key=${id}>${UI.nomeAtleta(s.atleti[id], true)}: ${base.probs[id].label}</li>`; })}</ul>
        <div class="small muted">Non è un errore: se non scendono in pedana entra il primo disponibile della panchina.</div></div></div>`);
    }

    // ------------------------------------------------------------ panchina
    var dest0 = cur.slots.indexOf(null);
    var panchina = !editable && !base.eff ? null : html`<section class="stack" style=${{ gap: '10px' }} aria-label="Panchina">
      <div class="fz-bench-head">
        <div class="section-title">Panchina</div>
        <span class="small muted">L'ordine conta: se un titolare non gareggia entra il primo disponibile, fino a ${d.settings.maxSostituzioni} ${d.settings.maxSostituzioni === 1 ? 'cambio' : 'cambi'}.</span>
      </div>
      ${cur.panchina.length ? html`<div class="bench fz-bench">${cur.panchina.map(function (id, k) {
        var a = s.atleti[id];
        var pr = base.probs[id] || UI.probabile(a, g, s, d);
        var fm = fmDi(d, id);
        var inf = infDi(a);
        var isSel = !!(sel && sel.k === 'bench' && sel.id === id);
        var target = !!(sel && !isSel);
        var dest = sel && sel.k === 'slot' ? sel.i : dest0;
        var nome = UI.nomeAtleta(a);
        return html`<div class=${'bench-card' + (isSel ? ' sel' : '') + (target ? ' fz-target' : '')} key=${id}>
          <span class="ord" aria-hidden="true">${k + 1}</span>
          <button type="button" class="fz-tap" aria-pressed=${isSel ? 'true' : 'false'} aria-label=${'Panchina ' + (k + 1) + ': ' + nome + '. ' + pr.label + (editable ? '' : '. Apri la scheda')} title=${pr.label} onClick=${function () { tapBench(id); }}>
            <${UI.AtletaMask} atleta=${a} size=${44} team=${d.mia}/>
            <span class="nm">${UI.nomeAtleta(a, true)}</span>
            <span class="fz-mini">
              <${UI.Role} ruolo=${a ? E.ruoloAtleta(a, d.stagione) : 'SEN'}/>
              ${inf ? html`<span class="tag red fz-inf" title=${'Infermeria: ' + (inf.nota || inf.stato)}>✚</span>` : null}
              <span class="fz-fm" title=${d.statsAtleti[id] && d.statsAtleti[id].stagione && d.statsAtleti[id].stagione.presenze ? 'Fantamedia della stagione' : 'Fantamedia delle stagioni precedenti'}>FM ${fm === null ? '–' : UI.fmt(fm, 2)}</span>
            </span>
            <${UI.ProbBar} prob=${pr}/>
            <${Etichetta} pr=${pr} cls="fz-bench-lbl"/>
          </button>
          ${editable ? html`<div class="ctrls">
            <button type="button" class="iconbtn" aria-label=${'Sposta su ' + nome} disabled=${k === 0} onClick=${function () { sposta(k, -1); }}>↑</button>
            <button type="button" class="iconbtn" aria-label=${'Sposta giù ' + nome} disabled=${k === cur.panchina.length - 1} onClick=${function () { sposta(k, 1); }}>↓</button>
            ${dest >= 0 ? html`<button type="button" class="btn xs fz-tit" title=${'Schiera nello slot ' + (dest + 1)} onClick=${function () { entra(id, dest); stSel[1](null); }}>Titolare</button>` : null}
          </div>` : null}
        </div>`;
      })}</div>` : html`<div class="card"><div class="card-b" style=${{ paddingTop: '14px' }}><span class="small muted">${!editable ? 'Nessun atleta in panchina in questa formazione.' : 'Nessun atleta in panchina' + (d.settings.rosa > T ? ': con la rosa completa avrai ' + (d.settings.rosa - T === 1 ? 'una riserva.' : (d.settings.rosa - T) + ' riserve.') : '.')}</span></div></div>`}
    </section>`;

    // ------------------------------------------------- telefono: scelta da un foglio
    function rigaScelta(id, onClick, extra) {
      var a = s.atleti[id];
      var pr = base.probs[id] || UI.probabile(a, g, s, d);
      var fm = fmDi(d, id);
      return html`<button type="button" class="fz-pick" key=${id} onClick=${onClick}>
        <${UI.AtletaMask} atleta=${a} size=${40} team=${d.mia}/>
        <span class="t">
          <span class="fz-nm">${extra ? html`<span class="fz-pk-x">${extra}</span>` : null}${UI.nomeAtleta(a, true)}</span>
          <${Etichetta} pr=${pr}/>
        </span>
        <span class="fz-pk-r"><${UI.Role} ruolo=${a ? E.ruoloAtleta(a, d.stagione) : 'SEN'}/><span class="fz-fm">FM ${fm === null ? '–' : UI.fmt(fm, 2)}</span></span>
      </button>`;
    }
    var foglio = null;
    if (phone && editable && sel) {
      var chiudiFoglio = function () { stSel[1](null); };
      if (sel.k === 'slot') {
        var fuori = cur.slots[sel.i];
        var fuoriA = fuori ? s.atleti[fuori] : null;
        foglio = html`<${UI.Modal} title=${fuoriA ? 'Chi entra al posto di ' + UI.nomeAtleta(fuoriA, true) + '?' : 'Slot ' + (sel.i + 1) + ': chi schieri?'} onClose=${chiudiFoglio}
          footer=${fuoriA ? html`<${React.Fragment}>
            <button type="button" class="btn ghost" onClick=${function () { esce(sel.i); chiudiFoglio(); }}>Manda in panchina</button>
            <button type="button" class="btn ghost" onClick=${function () { scheda(fuori); }}>Scheda</button>
          <//>` : null}>
          ${cur.panchina.length ? html`<div class="fz-picks">
            <div class="eyebrow">Panchina</div>
            ${cur.panchina.map(function (id, k) { return rigaScelta(id, function () { entra(id, sel.i); chiudiFoglio(); }, (k + 1) + '. '); })}
          </div>` : html`<div class="small muted">La panchina è vuota: con la rosa completa avrai le riserve da schierare qui.</div>`}
        <//>`;
      } else {
        var dentro = s.atleti[sel.id];
        var kB = cur.panchina.indexOf(sel.id);
        foglio = html`<${UI.Modal} title=${UI.nomeAtleta(dentro, true) + ': chi sostituisce?'} onClose=${chiudiFoglio}
          footer=${html`<${React.Fragment}>
            <button type="button" class="btn ghost" aria-label="Sposta prima in panchina" disabled=${kB <= 0} onClick=${function () { sposta(kB, -1); }}>↑ Prima</button>
            <button type="button" class="btn ghost" aria-label="Sposta dopo in panchina" disabled=${kB < 0 || kB >= cur.panchina.length - 1} onClick=${function () { sposta(kB, 1); }}>↓ Dopo</button>
            <button type="button" class="btn ghost" onClick=${function () { scheda(sel.id); }}>Scheda</button>
          <//>`}>
          <div class="small muted" style=${{ marginBottom: '6px' }}>${kB >= 0 ? 'È ' + (kB + 1) + '° in panchina. ' : ''}Tocca il titolare che lascia il posto.</div>
          <div class="fz-picks">${cur.slots.map(function (id, i) {
            if (!id) return html`<button type="button" class="fz-pick fz-pick-free" key=${'s' + i} onClick=${function () { entra(sel.id, i); chiudiFoglio(); }}>
              <span class="ph" aria-hidden="true">+</span><span class="t"><span class="fz-nm">Slot ${i + 1} libero</span><span class="fz-lbl">Entra in pedana senza togliere nessuno</span></span>
            </button>`;
            return rigaScelta(id, function () { entra(sel.id, i); chiudiFoglio(); }, 'Al posto di ');
          })}</div>
        <//>`;
      }
    }

    // telefono: barra di salvataggio in fondo, sempre sotto il pollice quando c'è qualcosa da salvare
    var barraSalva = editable ? html`<div class=${'fz-savebar' + (canSave ? ' on' : '')} role="region" aria-label="Salvataggio della formazione">
      <div class="fz-sb-t">${statoTag}${extraTag}${!canSave ? html`<span class="fz-why tiny">${motivo}</span>` : null}</div>
      <${UI.AsyncBtn} cls="fz-sb-btn" disabled=${!canSave} busy="Salvataggio…" onClick=${salva}>Salva formazione<//>
    </div>` : null;

    return html`<div class="stack">
      ${crumbs}
      <${GiornatePills} n=${n} onPick=${pick}/>
      <div class="grid grid-main fz-grid">
        <div class="stack fz-left">
          ${pedana}
          ${banners}
          ${panchina}
          ${editable ? html`<div class="row fz-tools">${strumenti}</div>` : null}
          <div class="fz-tutte"><${FormazioniGiornata} g=${g} chiusa=${chiusa} scad=${scad} go=${p.go}/></div>
        </div>
        <div class="stack fz-right">
          <${Probabili} g=${g} probs=${base.probs} gareG=${base.gareG} cur=${cur}/>
          <${RegoleFormazione} go=${p.go}/>
        </div>
      </div>
      ${barraSalva}
      ${foglio}
      ${confirmEl}
    </div>`;
  };
})(window);
