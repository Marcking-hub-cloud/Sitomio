/* Vista Home: riepilogo della squadra, prossima e ultima giornata, classifica, bacheca. */
(function (root) {
  'use strict';
  var React = root.React, html = root.UI.html, UI = root.UI, FS = root.FS, E = root.FSEngine;
  var V = root.Views = root.Views || {};
  var useState = React.useState;

  function formClass(r) {
    if (!r.di || r.di < 2) return 'mid';
    if (r.pos <= Math.ceil(r.di / 3)) return 'top';
    if (r.pos > r.di - Math.ceil(r.di / 3)) return 'low';
    return 'mid';
  }

  function Hero(p) {
    var d = FS.derived();
    var me = d.classifica.filter(function (r) { return r.id === d.mia.id; })[0] || { ultimi: [], punti: 0, fantapunti: 0, giocate: 0, pos: '–', vinte: 0 };
    var ultimi = me.ultimi.slice(-5);
    var f1 = d.settings.classifica === 'f1';
    return html`<section class="card hero home-hero">
      <div class="hero-grid">
        <div class="stack" style=${{ alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          ${ultimi.length ? html`<${React.Fragment}><div class="eyebrow" style=${{ color: 'var(--on-navy-muted)' }}>Ultime giornate</div>
            <div class="form-chips">${ultimi.map(function (r) {
              return html`<div class="form-chip" key=${r.n}><div class=${'box ' + formClass(r)}>${UI.fmt(r.v)}<small>${r.pos}° di ${r.di}</small></div><div class="n">G${r.n}</div></div>`;
            })}</div><//>` : html`<div style=${{ textAlign: 'center' }}><div class="eyebrow" style=${{ color: 'var(--on-navy-muted)' }}>Stagione ${d.stagione}/${String(d.stagione + 1).slice(2)}</div>
              <div style=${{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: '26px', marginTop: '4px' }}>${d.composizione ? 'Composizione delle rose' : d.lega.stato === 'iscrizioni' ? 'Iscrizioni aperte' : d.lega.stato === 'asta' ? 'Asta in corso' : 'Si parte presto'}</div>
              <div class="small" style=${{ color: 'var(--on-navy-muted)' }}>${UI.modalita(d.settings).nome} · rosa ${d.miaRosa ? d.miaRosa.rosa.length : 0}/${d.settings.rosa} · ${d.miaRosa ? d.miaRosa.crediti : d.settings.crediti} crediti</div></div>`}
          <button class="btn sm hero-cal" style=${{ background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }} onClick=${function () { p.go('giornate'); }}>Calendario</button>
        </div>
        <div class="big-stats">
          <div class="big-stat"><div class="v">${me.giocate ? me.pos + '°' : '–'}</div><div class="l">Classifica</div></div>
          <div class="big-stat"><div class="v">${UI.fmt(f1 ? me.punti : me.vinte)}</div><div class="l">${f1 ? 'Punti F1' : 'Giornate vinte'}</div></div>
          <div class="big-stat"><div class="v">${me.giocate}</div><div class="l">Giornate</div></div>
          <div class="big-stat"><div class="v">${UI.fmt(me.fantapunti, 1)}</div><div class="l">Fantapunti</div></div>
        </div>
      </div>
    </section>`;
  }

  function Prossima(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var g = d.prossima;
    if (!g) return html`<${UI.Card} title="Prossima giornata"><${UI.Empty} title="Calendario da completare">Il presidente non ha ancora inserito la prossima giornata.<//><//>`;
    var mia = s.formazioni[g.n + '__' + s.uid];
    var eff = FS.formazioneEffettiva(s.uid, g.n);
    var stato = mia ? html`<span class="tag green">Formazione salvata</span>` : eff ? html`<span class="tag gold">Vale l'ultima formazione (G${eff.salvataPer})</span>` : html`<span class="tag red">Formazione mancante</span>`;
    var titolari = eff ? eff.titolari : [];
    return html`<section class="card home-next">
      <div class="card-h"><h2>Prossima giornata</h2></div>
      <div class="card-strip"><span>${g.nome || 'Giornata ' + g.n}</span><span class="small" style=${{ fontWeight: 500 }}>${UI.finestra(g)}</span></div>
      <div class="card-b" style=${{ paddingTop: '14px' }}>
        <div class="grid grid-2" style=${{ alignItems: 'center' }}>
          <div class="stack" style=${{ gap: '8px' }}>
            <div class="eyebrow">Gare in programma</div>
            ${(g.gareAttese || []).length ? html`<div class="list">${g.gareAttese.slice(0, 5).map(function (x, i) {
              return html`<div class="li" key=${i} style=${{ padding: '6px 0' }}><div class="body"><div class="title small">${x.nome}</div><div class="sub tiny">${UI.data(x.data, true)}${x.luogo ? ' · ' + x.luogo : ''}${x.categorie && x.categorie.length ? ' · ' + x.categorie.map(catShort).join(', ') : ''}</div></div></div>`;
            })}</div>` : html`<div class="small muted">Gare non ancora indicate.</div>`}
          </div>
          <div class="stack pg-cd" style=${{ alignItems: 'center', gap: '10px', textAlign: 'center' }}>
            <div class="eyebrow">La formazione si chiude tra</div>
            <${UI.Countdown} to=${d.scadenza(g)}/>
            <div class="small muted">${UI.dataOra(d.scadenza(g))}</div>
            ${stato}
          </div>
        </div>
        ${titolari.length ? html`<div class="row" style=${{ marginTop: '12px', gap: '6px' }}>${titolari.map(function (id) {
          var a = s.atleti[id]; if (!a) return null;
          var pr = UI.probabile(a, g, s, d);
          return html`<button key=${id} class="pill" title=${pr.label} onClick=${function () { UI.openAtleta(id); }}><span class=${'lamp ' + (pr.lvl === 'ok' ? 'v' : pr.lvl === 'no' ? 's' : '')}></span>${UI.nomeAtleta(a, true)}</button>`;
        })}</div>` : null}
      </div>
      <div class="card-f">
        <button class="btn ghost sm" onClick=${function () { p.go('formazione'); }}>Probabili</button>
        <button class="btn ghost sm" onClick=${function () { p.setInf(true); }}>Infermeria</button>
        <button class="btn ghost sm" onClick=${function () { p.go('listone'); }}>Consigli</button>
        <span class="grow"></span>
        <button class="btn pg-cta" onClick=${function () { p.go('formazione'); }}>${mia ? 'Modifica formazione' : 'Inserisci formazione'}</button>
      </div>
    </section>`;
  }
  function catShort(c) { var x = E.CATEGORIE.filter(function (k) { return k.code === c; })[0]; return x ? x.short : c; }

  function Ultima(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var g = d.inCorso || d.ultima;
    if (!g) return null;
    var tot = d.esitiTot[g.n] || {};
    var ids = Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a]; });
    var live = !(s.esiti[g.n] && s.esiti[g.n].ufficiale);
    var mio = FS.punteggio(s.uid, g.n);
    var best = mio ? mio.righe.filter(function (r) { return r.id; }).sort(function (a, b) { return b.fv - a.fv; })[0] : null;
    var top = ids[0];
    var nGare = E.gareDellaGiornata(g, s.gare).length;
    return html`<section class="card home-last">
      <div class="card-h"><h2>${d.inCorso ? 'Giornata in corso' : 'Ultima giornata'}</h2><span class="meta">${live ? html`<span class="tag gold">${nGare ? 'Provvisoria' : 'In attesa dei risultati'}</span>` : html`<span class="tag green">Ufficiale</span>`}</span></div>
      <div class="card-strip"><span>${g.nome || 'Giornata ' + g.n}</span><span class="small" style=${{ fontWeight: 500 }}>${nGare} gare importate da 4Fence</span></div>
      <div class="card-b" style=${{ paddingTop: '14px' }}>
        ${mio && tot[s.uid] !== undefined ? html`<${React.Fragment}><div class="row between">
          <div class="row"><${UI.TeamMask} team=${d.mia} size=${52}/><div><div style=${{ fontWeight: 700 }}>${d.mia.nome}</div><div class="small muted">${ids.indexOf(s.uid) + 1}° di ${ids.length}</div></div></div>
          <div style=${{ textAlign: 'right' }}><div class="fv" style=${{ fontSize: '40px' }}>${UI.fmt(tot[s.uid])}</div><div class="tiny muted">fantapunti</div></div>
        </div>
        ${best ? html`<p class="small" style=${{ marginBottom: 0 }}>Migliore dei tuoi: <b>${UI.nomeAtleta(s.atleti[best.id])}</b> con ${UI.fmt(best.fv)}${best.gara ? ' a ' + best.gara.nome : ''}.</p>` : null}
        <//>` : html`<div class="small muted">${nGare ? 'La tua squadra non aveva una formazione valida in questa giornata.' : 'I punteggi compariranno appena il presidente importa i risultati da 4Fence.'}</div>`}
        ${top && top !== s.uid ? html`<p class="small muted" style=${{ marginBottom: 0 }}>Vince ${live ? 'per ora ' : ''}<b>${FS.nomeSquadra(top)}</b> con ${UI.fmt(tot[top])}.</p>` : null}
      </div>
      <div class="card-f" style=${{ justifyContent: 'center' }}><button class="btn" onClick=${function () { p.go('giornate'); }}>Vedi dettaglio</button></div>
    </section>`;
  }

  function ClassificaMini(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var f1 = d.settings.classifica === 'f1';
    return html`<${UI.Card} title="Classifica" footer=${html`<button type="button" class="btn ghost block" onClick=${function () { p.go('classifica'); }}>Classifica completa</button>`}>
      ${d.classifica.length ? html`<div class="rank-list">${d.classifica.slice(0, 10).map(function (r) {
        var t = s.squadre[r.id];
        return html`<button type="button" class=${'rank-item rank-btn ' + (r.id === s.uid ? 'me' : '')} key=${r.id} onClick=${function () { p.go('classifica'); }}>
          <span class="p">${r.giocate ? r.pos + '°' : '–'}</span>
          <${UI.TeamMask} team=${t} size=${34}/>
          <span class="t"><b>${t ? t.nome : '—'}</b><span>${FS.nomeGiocatore(r.id)}</span></span>
          <span class="pts">${UI.fmt(f1 ? r.punti : r.fantapunti, f1 ? 0 : 1)}</span>
        </button>`;
      })}</div>` : html`<${UI.Empty} title="Nessuna squadra">Condividi il codice ${d.lega.codice} per far entrare gli amici.<//>`}
    <//>`;
  }

  function Bacheca() {
    var s = FS.useFS();
    var st = useState(''); var txt = st[0], setTxt = st[1];
    var items = s.bacheca.slice(0, 8);
    return html`<${UI.Card} title="Bacheca">
      ${s.canWrite ? html`<form class="row" style=${{ marginBottom: '8px' }} onSubmit=${async function (e) { e.preventDefault(); try { await FS.act.scriviBacheca(txt); setTxt(''); } catch (er) { } }}>
        <input id="bacheca-msg" class="input grow" maxLength="300" placeholder="Scrivi alla lega…" aria-label="Messaggio per la bacheca" enterKeyHint="send" value=${txt} onInput=${function (e) { setTxt(e.target.value); }}/>
        <button class="btn sm" disabled=${!txt.trim()}>Invia</button>
      </form>` : null}
      ${items.length ? html`<div class="list">${items.map(function (m) {
        var sys = m.tipo !== 'msg';
        return html`<div class="li" key=${m.id} style=${{ alignItems: 'flex-start' }}>
          ${sys ? html`<span class=${'lamp ' + (m.tipo === 'esito' ? 'v' : '')} style=${{ marginTop: '6px' }}></span>` : html`<img src=${(s.profiles[m.autore] || {}).avatarUrl || ''} alt="" width="26" height="26" style=${{ borderRadius: '50%', background: 'var(--card-2)' }}/>`}
          <div class="body"><div class=${sys ? 'small' : ''} style=${{ whiteSpace: 'normal' }}>${sys ? null : html`<b>${FS.nomeGiocatore(m.autore)}: </b>`}${m.testo}</div><div class="tiny faint">${UI.ago(m.at)}</div></div>
        </div>`;
      })}</div>` : html`<div class="small muted">Ancora nessun messaggio.</div>`}
    <//>`;
  }

  function Iscrizioni(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var phone = UI.useMq(UI.PHONE);
    if (d.lega.stato !== 'iscrizioni') return null;
    var listone = d.modalita === 'listone';
    var mia = d.miaRosa;
    var copy = function () {
      try { navigator.clipboard.writeText(d.lega.codice).then(function () { FS.toast('Codice copiato'); }, function () { FS.toast('Copia non riuscita: seleziona il codice a mano', 'err'); }); }
      catch (e) { FS.toast('Copia non riuscita: seleziona il codice a mano', 'err'); }
    };
    var spieg = [
      listone && d.composizione ? html`<div class="small" key="c">Componi la tua rosa dal listone: ${d.settings.crediti} crediti per ${d.settings.rosa} atleti, uguali per tutti${mia ? ' (ne hai ' + mia.rosa.length + '/' + d.settings.rosa + ', ' + mia.crediti + ' crediti rimasti)' : ''}.${d.prossima ? ' Le rose si chiudono quando il presidente avvia il campionato, al più tardi ' + UI.dataOra(d.scadenza(d.prossima)) + '.' : ''}</div>` : null,
      listone && d.composizioneChiusa ? html`<div class="small" key="z">La composizione delle rose si è chiusa alla scadenza della prima giornata: ora si compra nelle sessioni di mercato.</div>` : null,
    ].filter(Boolean);
    // telefono: una riga di stato, le spiegazioni richiudibili e un solo pulsante principale a tutta larghezza
    return html`<div class="banner isc" style=${{ justifyContent: 'space-between' }}>
      <div class="stack isc-t" style=${{ gap: '4px' }}>
        ${phone ? html`<${React.Fragment}>
          <div class="isc-l1"><b>Iscrizioni aperte</b> · codice <span class="kbd" style=${{ fontSize: '15px', userSelect: 'all' }}>${d.lega.codice}</span> <button type="button" class="btn xs ghost isc-copy" onClick=${copy}>Copia</button></div>
          <details class="more"><summary>Come funziona</summary>
            <div class="small" style=${{ margin: '4px 0' }}><${UI.ModalitaTag} settings=${d.settings}/> · squadre iscritte: ${d.teamIds.length}. Invita gli amici con il codice.</div>
            ${spieg}
          </details>
        <//>` : html`<${React.Fragment}>
          <div><${UI.ModalitaTag} settings=${d.settings}/> <b>Iscrizioni aperte.</b> Invita gli amici con il codice <span class="kbd" style=${{ fontSize: '15px', userSelect: 'all' }}>${d.lega.codice}</span> · squadre iscritte: ${d.teamIds.length}</div>
          ${spieg}
        <//>`}
      </div>
      <div class="row isc-btns">${listone && d.composizione ? html`<button class="btn sm isc-main" onClick=${function () { p.go('listone'); }}>${phone ? 'Componi la rosa (' + (mia ? mia.rosa.length : 0) + '/' + d.settings.rosa + ')' : 'Vai al listone'}</button>` : null}
        ${phone ? null : html`<button class="btn sm ghost" onClick=${copy}>Copia codice</button>`}${listone
        ? (d.isAdmin ? html`<button class=${'btn sm ' + (phone ? 'ghost' : 'ok')} onClick=${function () { p.go('asta'); }}>Avvio del campionato →</button>` : null)
        : d.isAdmin ? html`<button class="btn sm" onClick=${function () { p.go('asta'); }}>Prepara l'asta</button>` : null}</div>
    </div>`;
  }

  function Infermeria(p) {
    var s = FS.useFS();
    var d = FS.derived();
    var list = Object.values(s.atleti).filter(function (a) { return a.infermeria && a.infermeria.stato; });
    return html`<${UI.Modal} title="Infermeria" onClose=${p.onClose}>
      ${list.length ? html`<div class="list">${list.map(function (a) {
        var own = d.proprietario[a.fis];
        return html`<div class="li" key=${a.fis}><${UI.AtletaMask} atleta=${a} size=${40}/><div class="body"><div class="title">${UI.nomeAtleta(a)}</div><div class="sub">${a.infermeria.stato}${a.infermeria.nota ? ' · ' + a.infermeria.nota : ''}${a.infermeria.al ? ' · rientro previsto ' + UI.data(a.infermeria.al) : ''}</div></div><span class="tag">${own ? FS.nomeSquadra(own) : 'Svincolato'}</span></div>`;
      })}</div>` : html`<${UI.Empty} title="Nessun atleta in infermeria">Quando un atleta è infortunato o assente per un periodo, il presidente lo segnala qui.<//>`}
    <//>`;
  }

  V.Home = function (p) {
    var s = FS.useFS();
    var d = FS.derived();
    var st = useState(false);
    if (!d.mia) {
      return html`<div class="grid grid-main"><div class="stack"><${Ultima} go=${p.go}/><${Prossima} go=${p.go} setInf=${st[1]}/></div><div class="stack"><${ClassificaMini} go=${p.go}/></div></div>`;
    }
    return html`<div class="stack">
      <div class="crumbs"><span class="c">${d.lega.nome}</span><span class="faint">›</span><span class="c on">Home</span></div>
      <${Iscrizioni} go=${p.go}/>
      ${s.asta && s.asta.attiva ? html`<div class="banner" style=${{ justifyContent: 'space-between' }}><span><span class="lamp v"></span> <b>Asta in corso.</b> ${s.asta.lotto ? 'All\'asta: ' + FS.nomeAtleta(s.asta.lotto.atletaId) + ' (' + s.asta.lotto.offerta + ')' : 'In attesa della prossima chiamata.'}</span><button class="btn sm" onClick=${function () { p.go('asta'); }}>Vai all'asta</button></div>` : null}
      <div class="grid grid-main">
        <div class="stack">
          <${Hero} go=${p.go}/>
          <${Prossima} go=${p.go} setInf=${st[1]}/>
          <${Ultima} go=${p.go}/>
        </div>
        <div class="stack">
          <${ClassificaMini} go=${p.go}/>
          <${Bacheca}/>
        </div>
      </div>
      ${st[0] ? html`<${Infermeria} onClose=${function () { st[1](false); }}/>` : null}
    </div>`;
  };
})(window);
