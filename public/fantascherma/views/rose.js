/* Vista Rose: riepilogo comparativo delle squadre e una scheda per ogni rosa
 * (crediti, spesa, ruoli, valore a Qt.A, atleti con prezzo pagato, FM e Qt.A).
 * Con l'asta a quote ogni atleta mostra in quante squadre si trova.
 * Stili extra: src/css/listone-atleta-rose.css */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState, useMemo = React.useMemo, useEffect = React.useEffect, useRef = React.useRef;

  var ORD_RUOLO = { U14: 0, U20: 1, SEN: 2 };
  var COLONNE = [
    { k: 'nome', label: 'Squadra', dir: 'asc' },
    { k: 'crediti', label: 'Crediti', dir: 'desc', cls: 'r', title: 'Crediti residui' },
    { k: 'n', label: 'Atleti', dir: 'desc', cls: 'r', hide: 'rs-hide-xs', title: 'Atleti in rosa' },
    { k: 'valore', label: 'Valore', dir: 'desc', cls: 'r', title: 'Valore della rosa: somma delle Qt.A' },
    { k: 'spesi', label: 'Spesi', dir: 'desc', cls: 'r', hide: 'rs-hide-sm', title: 'Crediti spesi tra asta e mercato' },
  ];

  /** Copie per atleta con l'asta a copie (stessa lettura del motore). */
  function copieDi(st) { return E.copiePerAtleta(st); }

  /** Statistiche da mostrare: la stagione in corso o, se non ha ancora gareggiato, lo storico (stagioni precedenti). */
  function fonte(st) {
    if (st && st.stagione && st.stagione.presenze) return { st: st.stagione, prev: false };
    if (st && st.tutto && st.tutto.presenze) return { st: st.tutto, prev: true };
    return { st: null, prev: false };
  }

  function costruisci(s, d) {
    var ids = d.teamIds.filter(function (t) { return s.squadre[t]; });
    var ordine = ids.filter(function (t) { return t === s.uid; }).concat(ids.filter(function (t) { return t !== s.uid; }));
    return ordine.map(function (t) {
      var R = d.rose[t] || { crediti: d.settings.crediti, rosa: [], spesi: 0 };
      var conta = { U14: 0, U20: 0, SEN: 0 };
      var valore = 0;
      var items = R.rosa.map(function (x) {
        var a = s.atleti[x.id] || null;
        var st = d.statsAtleti[x.id] || null;
        var f = fonte(st);
        var info = a ? UI.infoAtleta(a, d) : { ruolo: 'SEN', catLabel: '—' };
        var qtA = st ? st.qtA : (a ? Number(a.quotazione) || 1 : 0);
        conta[info.ruolo] = (conta[info.ruolo] || 0) + 1;
        valore += qtA;
        return {
          id: x.id, a: a, nome: a ? UI.nomeAtleta(a) : FS.nomeAtleta(x.id), ruolo: info.ruolo, catLabel: info.catLabel,
          prezzo: x.prezzo, tipo: x.tipo, fm: f.st ? f.st.fm : null, prev: f.prev, qtA: qtA,
          condiviso: (d.proprietari[x.id] || []).length, inf: !!(a && a.infermeria && a.infermeria.stato),
          altre: (d.proprietari[x.id] || []).filter(function (o) { return o !== t; }).map(function (o) { return FS.nomeSquadra(o); }),
        };
      });
      items.sort(function (x, y) { return (ORD_RUOLO[x.ruolo] - ORD_RUOLO[y.ruolo]) || x.nome.localeCompare(y.nome, 'it'); });
      var team = s.squadre[t];
      return { id: t, team: team, nome: team.nome || 'Squadra', mine: t === s.uid, crediti: R.crediti, spesi: R.spesi, n: items.length, valore: valore, conta: conta, items: items };
    });
  }

  function ordina(list, sort) {
    var k = sort.k, verso = sort.dir === 'asc' ? 1 : -1;
    return list.slice().sort(function (x, y) {
      var a = x[k], b = y[k];
      var r = typeof a === 'string' ? a.localeCompare(b, 'it') : a - b;
      return r ? r * verso : x.nome.localeCompare(y.nome, 'it');
    });
  }

  function vaiAllaRosa(t) {
    var el = document.getElementById('rosa-' + t);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function Riga(p) {
    var it = p.it;
    return html`<button type="button" class="li rs-li" onClick=${function () { UI.openAtleta(it.id); }}>
      ${it.a ? html`<${UI.AtletaMask} atleta=${it.a} size=${36}/>` : html`<${UI.Mask} size=${36} label="?" seed=${it.id}/>`}
      <span class="body">
        <span class="title">${it.nome}<span class="rs-role-in"> <${UI.Role} ruolo=${it.ruolo}/></span>${it.inf ? html`<span class="tag red ls-ml">Inf.</span>` : null}</span>
        <span class="sub">${it.catLabel} · ${it.prezzo} cr${it.tipo === 'scambio' ? ' (scambio)' : ''}${it.condiviso > 1 ? html`<span> · <span class="rs-copie multi" title=${it.altre.length ? 'Anche in: ' + it.altre.join(', ') : ''}>in ${it.condiviso} ${p.disp === 'multipla' ? 'rose' : 'squadre'}</span></span>` : null}</span>
      </span>
      <span class="rs-role-out"><${UI.Role} ruolo=${it.ruolo}/></span>
      <span class="rs-nums">
        <span class="rs-num"><span class="l">FM</span><span>${it.fm === null ? '–' : UI.fmt(it.fm, 2)}${it.prev ? html`<sup class="ls-star" title="Stagione precedente">*</sup>` : null}</span></span>
        <span class="rs-num"><span class="l">Qt.A</span><span>${it.qtA}</span></span>
      </span>
    </button>`;
  }

  function RosaCard(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var q = p.q, t = q.team || {};
    var lim = d.settings.ruoliRosa || {};
    var disp = d.settings.disponibilita;
    var multi = d.modalita === 'listone';
    var stato = d.lega ? d.lega.stato : '';
    var vuoto = multi ? (d.composizione ? 'La rosa si compone dal listone: ' + d.settings.crediti + ' crediti, uguali per tutti, per ' + d.settings.rosa + ' atleti.' : 'Nessun atleta in rosa: si completa nelle sessioni di mercato, comprando dal listone alla quotazione attuale.')
      : stato === 'asta' ? 'Asta in corso: gli atleti compaiono qui appena aggiudicati.'
      : stato === 'iscrizioni' ? 'La rosa si compone all\'asta, che il presidente avvia a iscrizioni chiuse.'
      : disp === 'quote' ? 'Nessun atleta in rosa: le copie libere degli atleti si possono acquistare quando il mercato è aperto.'
      : 'Nessun atleta in rosa: gli svincolati si possono acquistare quando il mercato è aperto.';
    return html`<section class=${'card rs-card' + (q.mine ? ' rs-mine' : '')} id=${'rosa-' + q.id}>
      <div class="card-h">
        <${UI.TeamMask} team=${t} size=${52}/>
        <div class="grow">
          <h2>${q.nome}</h2>
          <div class="small muted">${FS.nomeGiocatore(q.id)}${q.mine ? ' · la tua squadra' : ''}</div>
          ${t.motto ? html`<div class="small faint rs-motto">«${t.motto}»</div>` : null}
        </div>
      </div>
      <div class="rs-stats">
        <div class="rs-stat" title="Crediti residui"><span class="v">${q.crediti}</span><span class="l">Crediti</span></div>
        <div class="rs-stat" title=${d.modalita === 'listone' ? 'Crediti spesi dal listone e al mercato' : 'Crediti spesi tra asta e mercato'}><span class="v">${q.spesi}</span><span class="l">Spesi</span></div>
        <div class="rs-stat" title="Atleti in rosa"><span class="v">${q.n}<small>/${d.settings.rosa}</small></span><span class="l">Atleti</span></div>
        <div class="rs-stat" title="Somma delle Qt.A"><span class="v">${q.valore}</span><span class="l">Valore</span></div>
      </div>
      <div class="row rs-ruoli">${E.ORDINE_RUOLI.map(function (r) {
        var l = lim[r];
        var nr = q.conta[r] || 0;
        // fuori dai limiti del regolamento: sotto il minimo solo a rosa completa (durante l'asta è normale)
        var fuori = l && (nr > l[1] || (nr < l[0] && q.n >= d.settings.rosa));
        return html`<span class=${'rs-ruolo' + (fuori ? ' rs-fuori' : '')} key=${r} title=${E.RUOLI[r].label + (l ? ': minimo ' + l[0] + ', massimo ' + l[1] : '') + (fuori ? ' (fuori dai limiti)' : '')}>
          <${UI.Role} ruolo=${r}/>${nr}${l ? html`<span class="tiny faint">/${l[1]}</span>` : null}
        </span>`;
      })}</div>
      <div class="card-b">
        ${q.items.length ? html`<div class="list">${q.items.map(function (it) {
          return html`<${Riga} key=${it.id} it=${it} disp=${disp}/>`;
        })}</div>` : html`<${UI.Empty} title="Rosa vuota">${vuoto}<//>`}
      </div>
    </section>`;
  }

  V.Rose = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var sortSt = useState({ k: 'valore', dir: 'desc' });
    var selSt = useState(null);
    var phone = UI.useMq(UI.PHONE);
    var chipsRef = useRef(null);
    var squadre = useMemo(function () { return costruisci(s, d); }, [s.version]);
    // telefono: una rosa alla volta, scelta dalla striscia di squadre (di base la mia)
    var sel = selSt[0] && squadre.some(function (q) { return q.id === selSt[0]; }) ? selSt[0] : (squadre[0] ? squadre[0].id : null);
    useEffect(function () {
      var box = chipsRef.current;
      if (!box || box.scrollWidth <= box.clientWidth) return;
      var el = box.querySelector('[aria-pressed="true"]');
      if (el) box.scrollLeft = Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2);
    }, [sel, phone]);
    var sort = sortSt[0];
    var riepilogo = useMemo(function () { return ordina(squadre, sort); }, [squadre, sort]);
    var multi = d.modalita === 'listone';
    var quote = d.settings.disponibilita === 'quote';
    var nCopie = copieDi(d.settings);
    var crumbs = html`<div class="crumbs"><span class="c">${d.lega ? d.lega.nome : 'Fantascherma'}</span><span class="faint">›</span><span class="c on">Rose</span></div>`;

    if (!squadre.length) {
      return html`<div class="stack">${crumbs}
        <${UI.Card} title="Rose"><${UI.Empty} title="Nessuna squadra iscritta">${d.lega && d.lega.codice ? 'Condividi il codice ' + d.lega.codice + ' per far entrare gli amici: ogni' : 'Ogni'} manager iscrive la sua squadra e poi compone la rosa.<//><//>
      </div>`;
    }

    function th(c) {
      if (c.k === 'spesi' && multi) c = Object.assign({}, c, { title: 'Crediti spesi dal listone e al mercato' });
      var on = sort.k === c.k;
      return html`<th key=${c.k} class=${['sort', c.cls || '', c.hide || ''].join(' ')} aria-sort=${on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title=${c.title || ''}>
        <button type="button" class=${'ls-sort' + (on ? ' on' : '')} onClick=${function () { sortSt[1](on ? { k: c.k, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { k: c.k, dir: c.dir }); }}>${c.label}<span class="ar" aria-hidden="true">${on ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span></button>
      </th>`;
    }

    return html`<div class="stack">
      ${crumbs}
      ${(function () {
        var testo = !multi ? (nCopie > 1 ? 'Lo stesso atleta può stare in più squadre, al massimo ' + nCopie + ' (mai due volte nella stessa): i suoi fantavoti valgono per tutte le squadre che lo schierano. Accanto a ogni atleta vedi in quante squadre si trova.' : 'Una copia per atleta: ogni atleta può stare in una sola squadra.')
          : 'Lo stesso atleta può stare in più squadre: non c\'è asta, ogni squadra ha ' + d.settings.crediti + ' crediti, uguali per tutti, e lo compra dal listone alla quotazione attuale (Qt.A). I suoi fantavoti valgono per tutte le squadre che lo schierano.';
        // telefono: la spiegazione si apre a richiesta, la pagina parte dalle rose
        return phone ? html`<details class="banner more rs-mode"><summary><${UI.ModalitaTag} settings=${d.settings}/> Come funziona</summary><p class="small" style=${{ margin: '6px 0 0' }}>${testo}</p></details>`
          : html`<div class="banner"><${UI.ModalitaTag} settings=${d.settings}/><span>${testo}</span></div>`;
      })()}
      <section class="card">
        <div class="card-h"><h2>Riepilogo</h2><span class="meta">${phone ? '' : UI.modalita(d.settings).nome + ' · '}${squadre.length === 1 ? '1 squadra' : squadre.length + ' squadre'} · rosa ${phone ? '' : 'da '}${d.settings.rosa} · ${d.settings.crediti} ${phone ? 'cr' : 'crediti iniziali'}${!multi ? ' · ' + (nCopie === 1 ? '1 copia' : nCopie + ' copie') + (phone ? '' : ' per atleta') : ''}</span></div>
        <div class="tbl-wrap">
          <table class="tbl rs-sum">
            <thead><tr>${COLONNE.map(th)}</tr></thead>
            <tbody>${riepilogo.map(function (q) {
              function vai() { if (phone) selSt[1](q.id); vaiAllaRosa(phone ? 'vista' : q.id); }
              return html`<tr key=${q.id} class=${'click' + (q.mine ? ' me' : '')} tabIndex="0" title="Vai alla rosa" onClick=${vai}
                onKeyDown=${function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vai(); } }}>
                <td>
                  <div class="rs-tn">
                    <span class="rs-tn-m"><${UI.TeamMask} team=${q.team} size=${30}/></span>
                    <div style=${{ minWidth: 0 }}><div class="rs-tname">${q.nome}</div><div class="tiny muted">${FS.nomeGiocatore(q.id)}<span class="rs-only-xs"> · ${q.n}/${d.settings.rosa}</span></div></div>
                  </div>
                </td>
                <td class="r"><b>${q.crediti}</b></td>
                <td class="r rs-hide-xs">${q.n}/${d.settings.rosa}</td>
                <td class="r">${q.valore}</td>
                <td class="r rs-hide-sm">${q.spesi}</td>
              </tr>`;
            })}</tbody>
          </table>
        </div>
        <div class="card-f"><span class="tiny muted">Valore = somma delle quotazioni attuali (Qt.A) degli atleti in rosa. Tocca una squadra per vedere la sua rosa.</span></div>
      </section>
      ${phone ? html`<div class="gc-chips rs-chips" id="rosa-vista" ref=${chipsRef} role="group" aria-label="Scegli la squadra">${squadre.map(function (q) {
        return html`<button type="button" key=${q.id} class="gc-chip rs-chip" aria-pressed=${q.id === sel} onClick=${function () { selSt[1](q.id); }}>
          <span class="rs-chip-t"><${UI.TeamMask} team=${q.team} size=${24} noLabel=${true}/><span class="n">${q.nome}</span></span>
          <span class="st">${q.mine ? 'La tua · ' : ''}${q.n}/${d.settings.rosa} · ${q.crediti} cr</span>
        </button>`;
      })}</div>` : null}
      <div class="rs-cards">${squadre.filter(function (q) { return !phone || q.id === sel; }).map(function (q) { return html`<${RosaCard} key=${q.id} q=${q}/>`; })}</div>
      <p class="tiny faint" style=${{ margin: 0 }}>FM = fantamedia della stagione ${d.stagione}/${String(d.stagione + 1).slice(2)}; con * si riferisce alle stagioni precedenti (nessuna gara ancora quest'anno). Tocca un atleta per aprire la sua scheda.</p>
    </div>`;
  };
})(window);
