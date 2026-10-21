/* Vista Giornate: calendario delle giornate, gare in programma e importate da 4Fence,
 * punteggi di squadra con dettaglio (sostituzioni, rettifiche)
 * e migliori atleti della giornata. */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useMemo = React.useMemo, useEffect = React.useEffect, useRef = React.useRef;

  var SEL_KEY = 'FSGiornataSel'; // root[SEL_KEY] = {n, at}: scritto dalla Classifica quando si apre una giornata

  var LIVELLI = {
    regionale: 'Regionale', interregionale: 'Interregionale', nazionale: 'Nazionale',
    'campionato-regionale': 'Campionato regionale', 'campionato-italiano': 'Campionato italiano',
  };
  var SESSI = { M: 'maschile', F: 'femminile', MF: 'maschile e femminile' };
  var STATI = {
    ufficiale: { label: 'Ufficiale', dot: 'ok', tag: 'green' },
    dagiocare: { label: 'Da giocare', dot: 'next', tag: 'blue' },
    incorso: { label: 'In corso', dot: 'live', tag: 'gold' },
    provvisoria: { label: 'Provvisoria', dot: 'live', tag: 'gold' },
    attesa: { label: 'Attesa risultati', dot: '', tag: '' },
  };

  function livello(l) { return LIVELLI[l] || (l ? UI.cap(String(l).replace(/-/g, ' ')) : ''); }
  function catShort(c) { var x = E.CATEGORIE.filter(function (k) { return k.code === c; })[0]; return x ? x.short : c; }
  function nomeG(g) { return g ? (g.nome || 'Giornata ' + g.n) : ''; }
  function nomeCorto(s, id) { var a = s.atleti[id]; return a ? UI.nomeAtleta(a, true) : (id ? FS.nomeAtleta(id) : '—'); }
  function femminile(a) { return !!(a && a.sesso === 'F'); }

  /** Atleti San Paolo effettivamente in pedana in una gara. */
  function inPedana(gara) {
    var r = gara.risultati || {};
    return Object.keys(r).filter(function (fis) { return r[fis] && r[fis].stato !== 'assente'; });
  }

  /** Stato di una giornata per i chip e la testata. */
  function statoGiornata(g, s, d, now) {
    var uff = !!(s.esiti[g.n] && s.esiti[g.n].ufficiale);
    var scad = d.scadenza(g);
    var nGare = E.gareDellaGiornata(g, s.gare).length;
    var k = uff ? 'ufficiale' : scad > now ? 'dagiocare' : g.al >= d.oggi ? 'incorso' : nGare ? 'provvisoria' : 'attesa';
    return { k: k, uff: uff, scad: scad, nGare: nGare, aperta: scad > now, amichevole: g.n < (d.settings.giornataIniziale || 1) };
  }

  /**
   * Totali di squadra della giornata (rettifiche incluse) o null se non ancora disponibili.
   * Le giornate di campionato vengono da d.esitiTot; le amichevoli (prima di giornataIniziale)
   * non sono nei derivati e si calcolano qui, solo per mostrarle.
   */
  function totaliDi(g, st, s, d) {
    var n = g.n;
    if (!st.amichevole) {
      var t = d.esitiTot[n];
      if (t && Object.keys(t).length) return t;
    }
    var base = null;
    if (st.uff) base = s.esiti[n].totali || {};
    else if (st.amichevole && !st.aperta && st.nGare) {
      base = {};
      d.teamIds.forEach(function (tid) { var p = FS.punteggio(tid, n); if (p) base[tid] = p.totale; });
    }
    if (!base) return null;
    var rett = d.rettifiche[n] || {};
    var o = {};
    Object.keys(base).forEach(function (tid) { o[tid] = base[tid]; });
    Object.keys(rett).forEach(function (tid) { o[tid] = E.r2((o[tid] || 0) + rett[tid]); });
    return Object.keys(o).length ? o : null;
  }

  /** Giornata richiesta da un'altra vista (Classifica) negli ultimi secondi. */
  function selIniziale() {
    // passaggio in memoria (stessa pagina): niente localStorage, che negli artifact può essere bloccato
    var o = root[SEL_KEY];
    root[SEL_KEY] = null;
    if (o && Date.now() - Number(o.at || 0) < 60000 && o.n !== undefined && o.n !== null && !isNaN(Number(o.n))) return Number(o.n);
    return null;
  }

  /**
   * Dettaglio squadra-giornata. Per le giornate ufficiali usa la formazione congelata
   * all'ufficializzazione (esito.dettaglio[teamId].formazione): FS.punteggio filtra la formazione
   * con la rosa ATTUALE, quindi dopo uno svincolo o uno scambio il dettaglio di una giornata
   * passata perderebbe i titolari ceduti.
   */
  function punteggioDettaglio(teamId, n, s, d) {
    var uff = s.esiti[n];
    var fz = uff && uff.ufficiale && uff.dettaglio && uff.dettaglio[teamId];
    var g = s.giornate[n];
    if (fz && fz.formazione && g) {
      var f = {
        n: fz.formazione.n, salvataPer: fz.formazione.salvataPer, automatica: !!fz.formazione.automatica,
        titolari: fz.formazione.titolari || [], panchina: fz.formazione.panchina || [],
      };
      var r = E.punteggioSquadra(f, s.atleti, g, s.gare, d.settings, d.stagione);
      r.formazione = f;
      if (uff.totali && uff.totali[teamId] !== undefined && uff.totali[teamId] !== null) { r.ufficiale = true; r.totaleUfficiale = uff.totali[teamId]; }
      return r;
    }
    return FS.punteggio(teamId, n);
  }

  // ------------------------------------------------------------ chip giornate
  function Chips(p) {
    var ref = useRef(null);
    useEffect(function () {
      var box = ref.current;
      if (!box) return;
      var el = box.querySelector('[aria-pressed="true"]');
      if (!el) return;
      box.scrollLeft = Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2);
    }, [p.sel, p.giornate.length]);
    return html`<div class="gc-chips" ref=${ref} role="group" aria-label="Scegli la giornata">${p.giornate.map(function (g) {
      var st = p.stati[g.n] || {};
      var info = STATI[st.k] || STATI.attesa;
      return html`<button key=${g.n} type="button" class=${'gc-chip' + (st.amichevole ? ' amich' : '')} aria-pressed=${p.sel === g.n}
        title=${nomeG(g) + ' · ' + UI.finestra(g)} onClick=${function () { p.onSel(g.n); }}>
        <span class="n">G${g.n}</span>
        <span class="st"><i class=${'gc-dot ' + (st.amichevole ? 'amich' : info.dot)}></i>${st.amichevole ? 'Amichevole' : info.label}</span>
      </button>`;
    })}</div>`;
  }

  // ---------------------------------------------------------------- testata
  function Testata(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var g = p.g, st = p.st, tot = p.totali;
    var info = STATI[st.k] || STATI.attesa;
    var gare = E.gareDellaGiornata(g, s.gare);
    var visti = {};
    gare.forEach(function (x) { inPedana(x).forEach(function (fis) { visti[fis] = 1; }); });
    var mio = tot && s.uid && tot[s.uid] !== undefined ? tot[s.uid] : null;
    var ids = tot ? Object.keys(tot).filter(function (t) { return s.squadre[t]; }) : [];
    var miaPos = mio === null ? null : 1 + ids.filter(function (t) { return tot[t] > mio; }).length;
    return html`<section class="card">
      <div class="card-h">
        <h2>${nomeG(g)}</h2>
        <span class="meta row" style=${{ gap: '6px' }}>
          ${st.amichevole ? html`<span class="tag">Amichevole</span>` : null}
          <span class=${'tag ' + info.tag}>${info.label}</span>
          ${!st.uff && st.k === 'incorso' && st.nGare ? html`<span class="tag gold">Provvisoria</span>` : null}
        </span>
      </div>
      <div class="card-strip"><span>${UI.finestra(g)}</span><span class="small" style=${{ fontWeight: 500 }}>Formazioni ${st.aperta ? 'entro' : 'chiuse'} ${UI.dataOra(st.scad)}</span></div>
      <div class="card-b" style=${{ paddingTop: '14px' }}>
        ${st.aperta ? html`<div class="row" style=${{ marginBottom: '12px' }}><span class="eyebrow">La formazione si chiude tra</span><${UI.Countdown} to=${st.scad}/></div>` : null}
        ${st.amichevole ? html`<p class="small muted" style=${{ marginTop: 0 }}>Giornata amichevole: si gioca per divertimento, i punti non contano per la classifica (il campionato parte dalla giornata ${d.settings.giornataIniziale}).</p>` : null}
        ${g.note ? html`<p class="small" style=${{ marginTop: 0 }}>${g.note}</p>` : null}
        <div class="gc-stats">
          <div class="gc-stat"><div class="v">${(g.gareAttese || []).length}</div><div class="l">Gare in programma</div></div>
          <div class="gc-stat"><div class="v">${gare.length}</div><div class="l">Gare importate</div></div>
          <div class="gc-stat"><div class="v">${Object.keys(visti).length}</div><div class="l">San Paolo in pedana</div></div>
          ${mio !== null && d.mia ? html`<div class="gc-stat gc-me"><div class="v">${UI.fmt(mio)}</div><div class="l"><span class="gc-hide-sm">${d.mia.nome} · </span>${miaPos}° di ${ids.length}</div></div>` : null}
        </div>
      </div>
    </section>`;
  }

  // ------------------------------------------------- formazione (prima della scadenza)
  function MiaFormazione(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var g = p.g;
    if (!d.mia) return null;
    var salvata = s.formazioni[g.n + '__' + s.uid];
    var f = FS.formazioneEffettiva(s.uid, g.n);
    var stato = salvata ? html`<span class="tag green">Formazione salvata</span>`
      : f ? html`<span class="tag gold">Vale l'ultima formazione (G${f.salvataPer})</span>`
        : html`<span class="tag red">Formazione mancante</span>`;
    var footer = html`<${React.Fragment}>
      <span class="small muted grow">Le formazioni delle altre squadre si vedono dopo la scadenza.</span>
      ${s.canWrite ? html`<button class="btn sm" onClick=${function () { p.go('formazione'); }}>${f ? 'Modifica formazione' : 'Inserisci formazione'}</button>` : null}
    <//>`;
    return html`<${UI.Card} title="La tua formazione" meta=${stato} footer=${footer}>
      ${f && f.titolari.length ? html`<div><div class="list gc-prob">${f.titolari.map(function (id) {
        var a = s.atleti[id];
        if (!a) return null;
        var pr = UI.probabile(a, g, s, d);
        return html`<div class="li" key=${id}>
          <${UI.AtletaMask} atleta=${a} size=${34}/>
          <div class="body">
            <div class="title">${UI.nomeAtleta(a)}</div>
            <div class="sub tiny">${pr.label}</div>
          </div>
          <${UI.ProbBar} prob=${pr}/>
        </div>`;
      })}</div>
      ${f.panchina.length ? html`<p class="small muted" style=${{ marginBottom: 0 }}><b>Panchina, in ordine:</b> ${f.panchina.map(function (id, i) { return (i + 1) + '. ' + nomeCorto(s, id); }).join(' · ')}</p>` : null}</div>`
      : html`<div class="small muted">Non hai ancora schierato nessuno: senza una formazione la squadra non prende punti in questa giornata.</div>`}
    <//>`;
  }

  // ------------------------------------------------------ punteggi di giornata
  function ClassificaGiornata(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var ost = useState({}); var aperte = ost[0], setAperte = ost[1];
    var g = p.g, st = p.st, tot = p.totali;
    if (!tot) {
      return html`<${UI.Card} title="Punteggi di giornata">
        ${st.aperta
          ? html`<${UI.Empty} title="Si gioca presto">I punteggi compaiono dopo la scadenza delle formazioni, quando arrivano i risultati delle gare.<//>`
          : st.nGare
            ? html`<${UI.Empty} title="Nessuna formazione in campo">I risultati sono già importati, ma nessuna squadra aveva una formazione valida per questa giornata.<//>`
            : html`<${UI.Empty} title="Risultati in arrivo">I risultati arrivano da 4Fence dopo ogni gara: il presidente li importa.<//>`}
      <//>`;
    }
    var ids = Object.keys(tot).filter(function (t) { return s.squadre[t]; })
      .sort(function (a, b) { return tot[b] - tot[a] || FS.nomeSquadra(a).localeCompare(FS.nomeSquadra(b)); });
    var senza = d.teamIds.filter(function (t) { return tot[t] === undefined; });
    var f1 = d.settings.classifica === 'f1' && !st.amichevole;
    var meta = st.uff ? html`<span class="tag green">Ufficiale</span>` : html`<span class="tag gold">Provvisoria</span>`;
    return html`<${UI.Card} title="Punteggi di giornata" meta=${meta}>
      <div class="gc-teams">${ids.map(function (t) {
        var v = tot[t];
        var pos = 1 + ids.filter(function (o) { return tot[o] > v; }).length;
        var me = t === s.uid;
        var vis = me || !st.aperta; // le altre squadre si vedono solo dopo la scadenza
        var open = vis && (aperte[t] === undefined ? me : aperte[t]);
        var team = s.squadre[t];
        var rett = (d.rettifiche[g.n] || {})[t];
        var pid = 'gc-det-' + g.n + '-' + t;
        return html`<div key=${t} class=${'gc-team' + (me ? ' gc-me' : '') + (open ? ' open' : '')}>
          <button type="button" class="gc-team-h" aria-expanded=${open} aria-controls=${pid} disabled=${!vis}
            title=${vis ? (open ? 'Nascondi il dettaglio' : 'Mostra il dettaglio') : 'Visibile dopo la scadenza'}
            onClick=${function () { var o = Object.assign({}, aperte); o[t] = !open; setAperte(o); }}>
            <span class="gc-pos"><${UI.Medal} place=${pos}/></span>
            <${UI.TeamMask} team=${team} size=${36}/>
            <span class="gc-team-t"><b>${team.nome}</b><span class="gc-team-sub">
              <span class="mgr">${FS.nomeGiocatore(t)}</span>
              ${rett ? html`<span class="tag gold" title=${'Rettifica del presidente: ' + UI.segno(rett)}>${UI.segno(rett)}*</span>` : null}
              ${f1 ? html`<span class="tag blue" title="Punti Formula 1 di giornata">+${d.settings.puntiF1[pos - 1] || 0} pt</span>` : null}
            </span></span>
            <span class="gc-tot">${UI.fmt(v)}</span>
            <span class="gc-chev" aria-hidden="true">▾</span>
          </button>
          ${open ? html`<div class="gc-detail" id=${pid}><${DettaglioSquadra} teamId=${t} n=${g.n} rett=${rett || 0}/></div>` : null}
        </div>`;
      })}</div>
      ${senza.length ? html`<p class="small muted" style=${{ marginBottom: 0 }}>Senza formazione valida: ${senza.map(function (t) { return FS.nomeSquadra(t); }).join(', ')}.</p>` : null}
      ${!st.uff ? html`<p class="tiny faint" style=${{ marginBottom: 0 }}>Punteggi provvisori: diventano definitivi quando il presidente ufficializza la giornata.</p>` : null}
    <//>`;
  }

  function DettaglioSquadra(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var ost = useState({}); var aperte = ost[0], setAperte = ost[1];
    var pt = useMemo(function () { return punteggioDettaglio(p.teamId, p.n, s, d); }, [s.version, p.teamId, p.n]);
    if (!pt) return html`<div class="small muted">Nessuna formazione valida per questa giornata.</div>`;
    var set = d.settings;
    var base = set.punteggio.base;
    var f = pt.formazione || {};
    function toggle(k) { var o = Object.assign({}, aperte); o[k] = !o[k]; setAperte(o); }

    var rettList = s.rettifiche.filter(function (r) { return Number(r.n) === Number(p.n) && r.teamId === p.teamId; })
      .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    var totBase = pt.ufficiale ? Number(pt.totaleUfficiale) : pt.totale;
    var totale = E.r2(totBase + Number(p.rett || 0));

    function statoTag(raw, a) {
      if (!raw) return null;
      if (raw.stato === 'ritirato') return html`<span class="tag red">${femminile(a) ? 'Ritirata' : 'Ritirato'}</span>`;
      if (raw.stato === 'escluso') return html`<span class="tag red">${femminile(a) ? 'Esclusa' : 'Escluso'}</span>`;
      return null;
    }

    function slot(r, i) {
      var id = r.id || r.titolare;
      var a = s.atleti[id];
      var raw = r.raw || null;
      var de = raw ? (raw.de || []) : [];
      var dv = de.filter(function (b) { return b.v; }).length;
      var k = 't' + i;
      var open = !!aperte[k];
      var cambio = r.entrato ? 'Al posto di ' + nomeCorto(s, r.titolare) + ' (s.v.)' : '';
      var sub = r.ufficio ? 'Assente, nessun cambio disponibile: voto d\'ufficio' : (r.gara ? UI.nomeGara(r.gara) : '');
      return html`<div class="gc-slot" key=${k}>
        <button type="button" class="gc-slot-h" aria-expanded=${open} onClick=${function () { toggle(k); }}>
          <span class="ath">
            <${UI.AtletaMask} atleta=${a || { fis: id, cognome: '?' }} size=${30}/>
            <span class="gc-ath-t">
              <span class="nm">${nomeCorto(s, id)} ${r.entrato ? html`<span class="tag blue">Entrato</span>` : null} ${r.ufficio ? html`<span class="tag">s.v.</span>` : null}</span>
              ${cambio ? html`<span class="sub gc-cambio">${cambio}</span>` : null}
              ${sub ? html`<span class="sub" title=${sub}>${sub}</span>` : null}
            </span>
          </span>
          <span class="stats">
            ${raw && raw.girone ? html`<${UI.Lamps} v=${raw.girone.v} s=${raw.girone.s}/>` : null}
            ${de.length ? html`<span class="tag" title="Assalti vinti in eliminazione diretta">DE ${dv}V</span>` : null}
            ${raw && raw.place ? html`<span class="tag" title="Piazzamento finale">${raw.place}°${raw.of ? ' di ' + raw.of : ''}</span>` : null}
            ${statoTag(raw, a)}
          </span>
          <span class="fvc"><${UI.FV} v=${r.fv} base=${base}/></span>
        </button>
        ${open ? html`<div class="gc-voci">
          ${r.voci && r.voci.length ? html`<${UI.Voci} voci=${r.voci}/>`
            : html`<div class="small muted">${r.ufficio
              ? 'Assente in questa giornata e nessun cambio utile in panchina (al massimo ' + set.maxSostituzioni + ' sostituzioni): vale il voto d\'ufficio, ' + UI.fmt(set.votoUfficio) + '.'
              : 'Nessun dettaglio disponibile.'}</div>`}
          ${r.voci && r.voci.length ? html`<div class="voce"><b>Fantavoto</b><b>${UI.fmt(r.fv)}</b></div>` : null}
          <div class="row small" style=${{ marginTop: '6px' }}>
            ${r.gara && r.gara.url ? html`<a href=${r.gara.url} target="_blank" rel="noopener noreferrer">Risultati su 4Fence ↗</a>` : null}
            ${id ? html`<button type="button" class="linkbtn" onClick=${function () { UI.openAtleta(id); }}>Scheda atleta</button>` : null}
          </div>
        </div>` : null}
      </div>`;
    }

    return html`<div>
      ${f.automatica ? html`<div class="banner warn small" style=${{ marginBottom: '8px' }}>Formazione non salvata per questa giornata: vale l'ultima, quella della G${f.salvataPer}.</div>` : null}
      <div class="eyebrow">Titolari</div>
      <div>${pt.righe.map(slot)}</div>

      ${p.rett || rettList.length ? html`<div><div class="eyebrow gc-sec">Rettifiche del presidente</div>
        <div>${rettList.length ? rettList.map(function (r) {
          return html`<div class="voce" key=${r.id}><span>${r.nota || 'Rettifica'}</span><span class=${'v ' + (r.punti > 0 ? 'p' : 'n')}>${UI.segno(r.punti)}</span></div>`;
        }) : html`<div class="voce"><span>Rettifica</span><span class=${'v ' + (p.rett > 0 ? 'p' : 'n')}>${UI.segno(p.rett)}</span></div>`}</div></div>` : null}

      <div class="gc-total"><span>Totale${pt.ufficiale ? ' ufficiale' : ''}</span><b>${UI.fmt(totale)}</b></div>
      <div class="tiny muted">Sostituzioni: ${pt.sostituzioni.length} di ${set.maxSostituzioni}</div>
      ${pt.ufficiale && Math.abs(Number(pt.totaleUfficiale) - pt.totale) > 0.001 ? html`<div class="tiny faint">Il dettaglio è ricalcolato sui risultati attuali (${UI.fmt(pt.totale)}); vale il punteggio fissato all'ufficializzazione.</div>` : null}

      ${pt.panchina.length ? html`<div><div class="eyebrow gc-sec">Panchina</div>
        <div>${pt.panchina.map(function (b, i) {
          var a = s.atleti[b.id];
          return html`<div class=${'gc-slot gc-bench' + (b.usato ? ' used' : '')} key=${'p' + i}>
            <div class="gc-slot-h">
              <span class="ath">
                <span class="gc-ord">${i + 1}</span>
                <${UI.AtletaMask} atleta=${a || { fis: b.id, cognome: '?' }} size=${26}/>
                <span class="gc-ath-t">
                  <span class="nm">${nomeCorto(s, b.id)} ${b.usato ? html`<span class="tag blue">Entrato</span>` : null}</span>
                  <span class="sub">${b.gara ? UI.nomeGara(b.gara) : 'Non in pedana'}</span>
                </span>
              </span>
              <span class="stats"></span>
              <span class="fvc"><${UI.FV} v=${b.sv ? null : b.fv} base=${base} colore=${false}/></span>
            </div>
          </div>`;
        })}</div></div>` : null}
    </div>`;
  }

  // ------------------------------------------------------- migliori atleti
  function Migliori(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var tst = useState(false); var tutti = tst[0], setTutti = tst[1];
    var g = p.g;
    var list = useMemo(function () {
      var fisSet = {};
      E.gareDellaGiornata(g, s.gare).forEach(function (x) { inPedana(x).forEach(function (fis) { fisSet[fis] = 1; }); });
      var out = [];
      Object.keys(fisSet).forEach(function (fis) {
        var a = s.atleti[fis] || { fis: fis, cognome: fis, nome: '' };
        var pr = E.prestazione(a, g, s.gare, d.settings, d.stagione);
        if (pr.sv) return;
        out.push({ fis: fis, a: a, fv: pr.fv, gara: pr.gara, raw: pr.raw, altre: (pr.altre || []).length });
      });
      out.sort(function (x, y) { return y.fv - x.fv || UI.nomeAtleta(x.a).localeCompare(UI.nomeAtleta(y.a)); });
      return out;
    }, [s.version, g.n]);
    if (!list.length) {
      return html`<${UI.Card} title="Migliori atleti della giornata">
        <${UI.Empty} title="Risultati in arrivo">I risultati arrivano da 4Fence dopo ogni gara: il presidente li importa.<//>
      <//>`;
    }
    var shown = tutti ? list : list.slice(0, 10);
    var footer = list.length > 10 ? html`<button type="button" class="linkbtn" style=${{ margin: '0 auto' }} onClick=${function () { setTutti(!tutti); }}>${tutti ? 'Mostra solo i primi 10' : 'Mostra tutti (' + list.length + ')'}</button>` : null;
    return html`<${UI.Card} title="Migliori atleti della giornata" meta=${list.length + ' in pedana'} footer=${footer}>
      <div class="list">${shown.map(function (x) {
        var own = d.proprietari[x.fis] || [];
        var inf = UI.infoAtleta(x.a, d);
        var pos = 1 + list.filter(function (y) { return y.fv > x.fv; }).length;
        return html`<button type="button" key=${x.fis} class="li gc-li-btn" onClick=${function () { UI.openAtleta(x.fis); }} title="Apri la scheda dell'atleta">
          <span class="gc-rk">${pos}</span>
          <${UI.AtletaMask} atleta=${x.a} size=${36}/>
          <span class="body">
            <span class="title">${UI.nomeAtleta(x.a)}</span>
            <span class="sub">${x.gara ? UI.nomeGara(x.gara) : ''}${x.raw && x.raw.place ? ' · ' + x.raw.place + '°' + (x.raw.of ? ' di ' + x.raw.of : '') : ''}${x.altre ? ' · conta la prima gara della giornata' : ''}</span>
            <span class="gc-owners">${own.length
              ? own.map(function (t) { return html`<span key=${t} class=${'tag' + (t === s.uid ? ' blue' : '')}>${FS.nomeSquadra(t)}</span>`; })
              : html`<span class="tag">${femminile(x.a) ? 'Svincolata' : 'Svincolato'}</span>`}</span>
          </span>
          <${UI.Role} ruolo=${inf.ruolo}/>
          <${UI.FV} v=${x.fv} base=${d.settings.punteggio.base}/>
        </button>`;
      })}</div>
    <//>`;
  }

  // ------------------------------------------------------------------ gare
  function GareProgramma(p) {
    var list = p.g.gareAttese || [];
    return html`<${UI.Card} title="Gare in programma" meta=${list.length ? String(list.length) : ''}>
      ${list.length ? html`<div class="list gc-wrap">${list.map(function (x, i) {
        var riga1 = [UI.data(x.data, true), x.luogo, livello(x.livello)].filter(Boolean).join(' · ');
        var riga2 = [(x.categorie || []).map(catShort).join(', '), x.sesso ? SESSI[x.sesso] || x.sesso : '', x.note || ''].filter(Boolean).join(' · ');
        return html`<div class="li" key=${i}><div class="body">
          <div class="title small">${x.nome}</div>
          ${riga1 ? html`<div class="sub tiny">${riga1}</div>` : null}
          ${riga2 ? html`<div class="sub tiny">${riga2}</div>` : null}
        </div></div>`;
      })}</div>` : html`<div class="small muted">Il presidente non ha ancora indicato le gare di questa giornata.</div>`}
    <//>`;
  }

  function GareImportate(p) {
    var s = FS.useFS();
    var g = p.g;
    var gare = E.gareDellaGiornata(g, s.gare);
    var footer = gare.length ? html`<span class="tiny muted">Se un atleta gareggia due volte nella stessa giornata, conta la prima gara in ordine di data.</span>` : null;
    return html`<${UI.Card} title="Gare importate da 4Fence" meta=${gare.length ? String(gare.length) : ''} footer=${footer}>
      ${gare.length ? html`<div class="list gc-wrap">${gare.map(function (x) {
        var sp = inPedana(x).length;
        return html`<div class="li" key=${x.id}>
          <div class="body">
            <div class="title small">${UI.nomeGara(x)}</div>
            <div class="sub tiny">${[UI.data(x.data, true), x.luogo, livello(x.livello)].filter(Boolean).join(' · ')}</div>
            <div class="row" style=${{ gap: '6px', marginTop: '4px' }}>
              ${x.n ? html`<span class="tag">${x.n} iscritti</span>` : null}
              <span class="tag blue">${sp} San Paolo</span>
              ${x.coeff && Number(x.coeff) !== 1 ? html`<span class="tag gold" title="Coefficiente applicato a bonus e malus">×${UI.fmt(x.coeff)}</span>` : null}
            </div>
          </div>
          ${x.url ? html`<a class="btn ghost xs gc-4f" href=${x.url} target="_blank" rel="noopener noreferrer" title="Apri la classifica su 4Fence">4Fence ↗</a>` : null}
        </div>`;
      })}</div>` : html`<div class="small muted">${p.st.aperta ? 'Le gare si importano dopo che sono state disputate.' : 'I risultati arrivano da 4Fence dopo ogni gara: il presidente li importa.'}</div>`}
    <//>`;
  }

  // ------------------------------------------------------------------ vista
  V.Giornate = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var now = FS.useTick(60000);
    var minuto = Math.floor(now / 60000);
    var sst = useState(selIniziale); var sel = sst[0], setSel = sst[1];
    var stati = useMemo(function () {
      var o = {};
      var t = FS.now();
      d.giornate.forEach(function (g) { o[g.n] = statoGiornata(g, s, d, t); });
      return o;
    }, [s.version, minuto]);
    var def = d.inCorso || d.ultima || d.prossima || d.giornate[0] || null;
    var g = (sel !== null && s.giornate[sel]) || def;
    var stG = g ? (stati[g.n] || statoGiornata(g, s, d, now)) : null;
    var totali = useMemo(function () { return g && stG ? totaliDi(g, stG, s, d) : null; }, [s.version, g ? g.n : null, stG ? stG.k + stG.aperta : '']);

    var crumbs = html`<div class="crumbs"><span class="c">${d.lega.nome}</span><span class="faint">›</span><span class="c on">Giornate</span></div>`;
    if (!g) {
      return html`<div class="stack">${crumbs}
        <${UI.Card} title="Giornate">
          <${UI.Empty} title="Calendario da completare">Il presidente non ha ancora inserito le giornate della stagione. Ogni giornata è una finestra di date: contano le gare che ci cadono dentro.<//>
        <//>
      </div>`;
    }
    var nascondiPunteggi = stG.aperta && d.mia && !totali;
    return html`<div class="stack">
      ${crumbs}
      <${Chips} giornate=${d.giornate} stati=${stati} sel=${g.n} onSel=${setSel}/>
      <div class="grid grid-main">
        <div class="stack">
          <${Testata} key=${'t' + g.n} g=${g} st=${stG} totali=${totali}/>
          ${stG.aperta && d.mia ? html`<${MiaFormazione} key=${'f' + g.n} g=${g} go=${p.go}/>` : null}
          ${nascondiPunteggi ? null : html`<${ClassificaGiornata} key=${'c' + g.n} g=${g} st=${stG} totali=${totali}/>`}
          ${stG.nGare ? html`<${Migliori} key=${'m' + g.n} g=${g}/>` : null}
        </div>
        <div class="stack">
          <${GareProgramma} g=${g}/>
          <${GareImportate} g=${g} st=${stG}/>
        </div>
      </div>
    </div>`;
  };
})(window);
