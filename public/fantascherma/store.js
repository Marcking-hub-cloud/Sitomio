/* Fantascherma — stato condiviso e azioni.
 * Unico punto che parla con il database (capability `db` di claude.ai, o il finto db locale).
 * Le viste leggono con FS.useFS() e scrivono solo tramite FS.act.*.
 *
 * Schema del database (percorsi):
 *   atleti/{fis}                      listone (globale)
 *   gare/{garaId}                     risultati importati da 4Fence (globale)
 *   giornate/{n}                      calendario delle giornate (globale)
 *   leghe/{legaId}                    lega: nome, codice, adminIds, stato, settings, mercatoAperto
 *   leghe/{legaId}/squadre/{uid}      squadra del giocatore uid
 *   leghe/{legaId}/movimenti/{id}     registro acquisti/svincoli/scambi (le rose si ricostruiscono da qui)
 *   leghe/{legaId}/formazioni/{n}__{uid}
 *   leghe/{legaId}/esiti/{n}          giornata ufficializzata (punteggi congelati)
 *   leghe/{legaId}/scambi/{id}        proposte di scambio
 *   leghe/{legaId}/bacheca/{id}       messaggi
 *   leghe/{legaId}/rettifiche/{id}    penalità e punti extra decisi dal presidente
 *   leghe/{legaId}/asta/stato         stato dell'asta live
 */
(function (root) {
  'use strict';
  var E = root.FSEngine;
  var FS = root.FS = root.FS || {};

  var state = {
    phase: 'loading', mock: false, uid: null, me: null, isOwner: false, canWrite: true,
    atleti: {}, gare: {}, giornate: {}, leghe: {},
    legaId: null, squadre: {}, movimenti: [], formazioni: {}, esiti: {}, scambi: {}, bacheca: [], rettifiche: [], asta: null,
    legaLoaded: false, profiles: {}, serverOffset: 0, toasts: [], version: 0,
  };
  var subs = [];
  var db = null, userCap = null;
  var legaUnsubs = [];

  function emit() { state.version++; derivedCache = null; subs.slice().forEach(function (f) { f(state); }); }
  function setState(patch) { Object.keys(patch).forEach(function (k) { state[k] = patch[k]; }); emit(); }
  FS.getState = function () { return state; };
  FS.subscribe = function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; };

  // ------------------------------------------------------------ utilità
  FS.now = function () { return Date.now() + state.serverOffset; };
  function rid(n) { var a = 'abcdefghijkmnpqrstuvwxyz23456789', s = ''; for (var i = 0; i < (n || 10); i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  FS.rid = rid;
  function codice() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function clone(x) { return x === undefined || x === null ? x : JSON.parse(JSON.stringify(x)); }
  FS.clone = clone;

  FS.toast = function (msg, kind) {
    var id = rid(6);
    setState({ toasts: state.toasts.concat([{ id: id, msg: msg, kind: kind || 'ok' }]) });
    setTimeout(function () { FS.chiudiToast(id); }, kind === 'err' ? 6000 : 3200);
  };
  /** Chiude subito un avviso (tocco sull'avviso). */
  FS.chiudiToast = function (id) {
    if (!state.toasts.some(function (t) { return t.id === id; })) return;
    setState({ toasts: state.toasts.filter(function (t) { return t.id !== id; }) });
  };

  function errMsg(e) {
    var c = e && e.code;
    if (c === 'invalid_argument') return 'Operazione non consentita con il tuo livello di accesso.';
    if (c === 'permission_denied') return 'Non hai i permessi per questa operazione.';
    if (c === 'quota_exceeded') return 'Spazio del database esaurito: elimina dati vecchi (es. messaggi in bacheca).';
    if (c === 'resource_exhausted') return 'Troppe operazioni ravvicinate: riprova tra qualche secondo.';
    if (c === 'revoked' || c === 'not_granted') return 'Accesso al database revocato.';
    return (e && e.message) || 'Errore imprevisto.';
  }
  async function write(fn, okMsg) {
    try {
      var r = await fn();
      if (okMsg) FS.toast(okMsg);
      return r;
    } catch (e) {
      if (e && e.code === 'unavailable') {
        await new Promise(function (r) { setTimeout(r, 400 + Math.random() * 600); });
        try { var r2 = await fn(); if (okMsg) FS.toast(okMsg); return r2; } catch (e2) { e = e2; }
      }
      if (e && e.code === 'invalid_argument' && !e.userError && !state.web) setState({ canWrite: false });
      FS.toast(errMsg(e), 'err');
      throw e;
    }
  }
  function userError(msg) { var e = new Error(msg); e.userError = true; e.code = 'user'; return e; }

  // ---------------------------------------------------------------- avvio
  FS.init = async function () {
    // FS_DEMO: anteprima pubblica con la lega di prova, sempre sul backend finto (anche dentro claude.ai)
    var demo = !!root.FS_DEMO;
    var real = !demo && !!(root.claude && root.claude.use);
    // FS_BACKEND: backend del proprio server (vedi docs/BACKEND.md): connect() → {db, user, signedIn, authError?}
    var web = !demo && !real && !!(root.FS_BACKEND && typeof root.FS_BACKEND.connect === 'function');
    try {
      if (real) {
        var r = await Promise.all([root.claude.use('db'), root.claude.use('user')]);
        db = r[0]; userCap = r[1];
      } else if (web) {
        // versione web pubblica: serve l'accesso
        var c = await root.FS_BACKEND.connect();
        state.web = true;
        if (!c.signedIn) {
          setState({ phase: 'login' });
          if (c.authError) FS.toast('Accesso non riuscito: ' + c.authError, 'err');
          return;
        }
        db = c.db; userCap = c.user;
      } else {
        var m = root.FSMock.create();
        db = m.db; userCap = m.user;
        state.mock = true; state.demo = demo;
        try {
          var probe = await db.collection('atleti').limit(1).get();
          if (probe.empty) {
            var res = await fetch('dev/seed.json', { cache: 'no-store' });
            if (res.ok) root.FSMock.seed(await res.json());
          }
        } catch (e) { /* nessun seed locale */ }
      }
    } catch (e) { db = null; if (web) console.error('Fantascherma: connessione al backend non riuscita', e); }
    if (!db) { setState({ phase: 'nodb' }); return; }

    var uid = null, me = null, isOwner = false, canWrite = true;
    if (userCap) {
      try {
        var ur = await Promise.all([userCap.id(), userCap.me(), userCap.isOwner(), userCap.can('data.write')]);
        uid = ur[0]; me = ur[1]; isOwner = ur[2]; canWrite = ur[3] === null ? true : ur[3];
      } catch (e) { }
    }
    setState({ uid: uid, me: me, isOwner: isOwner, canWrite: canWrite && !!uid });
    syncClock();

    var pending = 4;
    function ready() { if (--pending === 0 && state.phase === 'loading') { setState({ phase: 'ready' }); autoSelectLega(); } }
    watchCollection('atleti', function (docs) { state.atleti = byId(docs, 'fis'); emit(); }, ready);
    watchCollection('gare', function (docs) { state.gare = byId(docs, 'id'); emit(); }, ready);
    watchCollection('giornate', function (docs) { var o = {}; docs.forEach(function (d) { var x = Object.assign({}, d.data()); x.n = Number(x.n !== undefined && x.n !== null ? x.n : d.id); o[x.n] = x; }); state.giornate = o; emit(); }, ready);
    watchCollection('leghe', function (docs) { state.leghe = byId(docs, 'id'); emit(); }, ready);
  };

  FS.login = async function () {
    try { await root.FS_BACKEND.signIn(); location.reload(); }
    catch (e) { FS.toast('Accesso non riuscito: ' + ((e && e.message) || 'riprova'), 'err'); }
  };
  FS.logout = async function () {
    try { if (root.FS_BACKEND && root.FS_BACKEND.signOut) await root.FS_BACKEND.signOut(); } catch (e) { }
    try { localStorage.removeItem('fs:lega'); } catch (e) { }
    location.reload();
  };

  function byId(docs, key) { var o = {}; docs.forEach(function (d) { var x = Object.assign({}, d.data()); if (!x[key]) x[key] = d.id; x._id = d.id; o[d.id] = x; }); return o; }

  function watchCollection(path, onDocs, onFirst, ref) {
    var first = true;
    var q = ref || db.collection(path);
    var unsub = q.onSnapshot(function (snap) {
      onDocs(snap.docs);
      if (first) { first = false; onFirst && onFirst(); }
    }, function (err) {
      console.warn('snapshot error', path, err);
      if (first) { first = false; onFirst && onFirst(); }
      if (err && err.code === 'revoked') setState({ phase: 'nodb' });
    });
    return unsub;
  }

  async function syncClock() {
    try {
      var t0 = Date.now();
      var res = await fetch(location.href.split('#')[0], { method: 'HEAD', cache: 'no-store' });
      var t1 = Date.now();
      var d = res.headers.get('date');
      if (d) {
        var server = new Date(d).getTime() + 500; // l'header ha risoluzione al secondo
        var off = server - (t0 + t1) / 2;
        if (Math.abs(off) > 1500) setState({ serverOffset: off });
      }
    } catch (e) { }
  }

  function autoSelectLega() {
    var saved = null;
    try { saved = localStorage.getItem('fs:lega'); } catch (e) { }
    if (saved && state.leghe[saved]) return FS.selectLega(saved);
    // prima lega in cui ho una squadra: la scopriamo dal campo membri della lega
    var mine = Object.values(state.leghe).filter(function (l) { return (l.membri || []).indexOf(state.uid) >= 0; });
    if (mine.length) return FS.selectLega(mine[0].id);
    // ripiego: cerca direttamente la mia squadra nelle leghe (l'elenco membri può perdere un'iscrizione concorrente)
    var ids = Object.keys(state.leghe).slice(0, 20);
    if (!state.uid || !ids.length) return;
    Promise.all(ids.map(function (lid) { return db.doc('leghe/' + lid + '/squadre/' + state.uid).get().then(function (d) { return d.exists ? lid : null; }, function () { return null; }); }))
      .then(function (res) { var f = res.filter(Boolean)[0]; if (f && !state.legaId) FS.selectLega(f); });
  }

  FS.selectLega = function (id) {
    legaUnsubs.forEach(function (u) { try { u(); } catch (e) { } });
    legaUnsubs = [];
    try { if (id) localStorage.setItem('fs:lega', id); else localStorage.removeItem('fs:lega'); } catch (e) { }
    setState({ legaId: id, squadre: {}, movimenti: [], formazioni: {}, esiti: {}, scambi: {}, bacheca: [], rettifiche: [], asta: null, legaLoaded: false });
    if (!id) return;
    var base = 'leghe/' + id;
    var pending = 7;
    function ready() { if (--pending === 0) setState({ legaLoaded: true }); }
    legaUnsubs.push(watchCollection(base + '/rettifiche', function (docs) {
      state.rettifiche = docs.map(function (d) { var x = Object.assign({}, d.data()); x.id = d.id; return x; }); emit();
    }, ready));
    legaUnsubs.push(watchCollection(base + '/squadre', function (docs) {
      state.squadre = byId(docs, 'id'); emit(); loadProfiles(Object.keys(state.squadre));
    }, ready));
    legaUnsubs.push(watchCollection(base + '/movimenti', function (docs) {
      state.movimenti = docs.map(function (d) { var x = Object.assign({}, d.data()); x.id = d.id; return x; }); emit();
    }, ready));
    legaUnsubs.push(watchCollection(base + '/formazioni', function (docs) { state.formazioni = byId(docs, 'id'); emit(); }, ready));
    legaUnsubs.push(watchCollection(base + '/esiti', function (docs) { var o = {}; docs.forEach(function (d) { var x = d.data(); o[Number(x.n || d.id)] = x; }); state.esiti = o; emit(); }, ready));
    legaUnsubs.push(watchCollection(base + '/scambi', function (docs) { state.scambi = byId(docs, 'id'); emit(); }, ready));
    legaUnsubs.push(watchCollection(base + '/bacheca', function (docs) {
      state.bacheca = docs.map(function (d) { var x = Object.assign({}, d.data()); x.id = d.id; return x; }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); }); emit();
    }, ready, db.collection(base + '/bacheca').orderBy('at', 'desc').limit(80)));
    legaUnsubs.push(db.doc(base + '/asta/stato').onSnapshot(function (s) { state.asta = s.exists ? s.data() : null; emit(); }, function () { }));
  };

  async function loadProfiles(ids) {
    if (!userCap || !ids.length) return;
    try {
      var ps = await userCap.profiles(ids);
      var o = Object.assign({}, state.profiles);
      Object.keys(ps).forEach(function (k) { o[k] = { name: ps[k].name, avatarUrl: ps[k].avatarUrl, color: ps[k].color }; });
      setState({ profiles: o });
    } catch (e) { }
  }
  FS.nomeGiocatore = function (uid) { var p = state.profiles[uid]; return (p && p.name) || (uid === state.uid ? 'Tu' : 'Giocatore'); };

  // -------------------------------------------------------------- derivati
  // i derivati dipendono anche dall'ora (scadenze, giornata in corso, composizione delle rose): la cache vale fino
  // alla prossima scadenza o al cambio di giorno, anche se nel frattempo il database non cambia
  var derivedCache = null, derivedFino = 0;
  FS.derived = function () {
    if (derivedCache && FS.now() < derivedFino) return derivedCache;
    var s = state;
    var lega = s.legaId ? s.leghe[s.legaId] : null;
    var settings = E.settingsCon(lega && lega.settings);
    var giornateList = Object.values(s.giornate).sort(function (a, b) { return a.n - b.n; });
    var oggi = new Date(FS.now()).toISOString().slice(0, 10);
    // stagione in corso secondo la data di oggi (le categorie cambiano il 1° settembre)
    var stagione = E.stagioneDaData(oggi);
    var teamIds = Object.keys(s.squadre).sort(function (a, b) { return (s.squadre[a].creatoAt || 0) - (s.squadre[b].creatoAt || 0); });
    var R = E.rose(teamIds, s.movimenti, settings);
    var attive = giornateList.filter(function (g) { return g.n >= (settings.giornataIniziale || 1); });
    var now = FS.now();
    function scad(g) { return g.scadenza || Date.parse(g.dal + 'T00:00:00'); }
    var prossima = attive.filter(function (g) { return scad(g) > now; })[0] || null;
    var inCorso = attive.filter(function (g) { return scad(g) <= now && g.al >= oggi; })[0] || null;
    var giocate = attive.filter(function (g) { return scad(g) <= now; });
    var ultima = giocate.length ? giocate[giocate.length - 1] : null;

    // punteggi: ufficiali dove esistono, altrimenti calcolo live per le giornate con gare importate
    var esitiTot = {}, live = {};
    giocate.forEach(function (g) {
      var uff = s.esiti[g.n];
      if (uff && uff.ufficiale) { esitiTot[g.n] = uff.totali || {}; return; }
      var gareG = E.gareDellaGiornata(g, s.gare);
      if (!gareG.length) return;
      var tot = {}; live[g.n] = {};
      teamIds.forEach(function (t) {
        var f = formazioneEffettiva(t, g.n);
        if (!f) return;
        var p = E.punteggioSquadra(f, s.atleti, g, s.gare, settings, stagione);
        tot[t] = p.totale; live[g.n][t] = p;
      });
      esitiTot[g.n] = tot;
    });
    // penalità e punti extra
    var rett = {};
    s.rettifiche.forEach(function (r) {
      if (r.n === undefined || r.n === null || r.n === '' || !r.teamId) return;
      (rett[r.n] = rett[r.n] || {})[r.teamId] = ((rett[r.n] || {})[r.teamId] || 0) + Number(r.punti || 0);
      if (!esitiTot[r.n]) esitiTot[r.n] = {};
    });
    var esitiConRett = {};
    Object.keys(esitiTot).forEach(function (n) {
      var o = {};
      Object.keys(esitiTot[n]).forEach(function (t) { o[t] = esitiTot[n][t]; });
      Object.keys(rett[n] || {}).forEach(function (t) { o[t] = E.r2((o[t] || 0) + rett[n][t]); });
      esitiConRett[n] = o;
    });
    var classifica = E.classifica(teamIds, esitiConRett, settings);
    var isAdmin = !!(lega && (lega.adminIds || []).indexOf(s.uid) >= 0);
    var mercatoAperto = !!(lega && lega.mercatoAperto) && !inCorso;
    // listone a budget fisso: prima del campionato le rose si compongono liberamente (rimborso pieno a chi
    // toglie un atleta), fino a quando il presidente avvia il campionato o scade la prima giornata valida
    var modalita = E.modalita(settings);
    var preCampionato = modalita === 'listone' && !!lega && lega.stato !== 'campionato';
    var composizione = preCampionato && !giocate.length;
    derivedCache = {
      lega: lega, settings: settings, stagione: stagione, teamIds: teamIds,
      rose: R.squadre, proprietario: R.proprietario, erroriRose: R.errori,
      giornate: giornateList, attive: attive, prossima: prossima, inCorso: inCorso, ultima: ultima, giocate: giocate,
      esitiTot: esitiConRett, esitiBase: esitiTot, rettifiche: rett, live: live, classifica: classifica,
      proprietari: R.proprietari, statsAtleti: statsAtleti(settings, stagione),
      mia: s.uid && s.squadre[s.uid] ? s.squadre[s.uid] : null,
      miaRosa: s.uid && R.squadre[s.uid] ? R.squadre[s.uid] : null,
      isAdmin: isAdmin, isCommissario: isAdmin || s.isOwner, mercatoAperto: mercatoAperto,
      // modalità di gioco: 'copie' (asta a copie) | 'listone' (listone a budget fisso)
      modalita: modalita, composizione: composizione, composizioneChiusa: preCampionato && !composizione,
      // acquisti e svincoli consentiti adesso (mercato aperto o composizione delle rose)
      puoComprare: mercatoAperto || composizione,
      // listone, gare e calendario sono comuni a tutte le leghe: sul web li gestisce solo il proprietario del sito
      gestisceCircuito: s.web ? !!s.isOwner : (isAdmin || s.isOwner),
      scadenza: scad, oggi: oggi,
    };
    derivedFino = Math.min(prossima ? scad(prossima) : Infinity, Date.parse(oggi + 'T00:00:00Z') + 86400000);
    return derivedCache;
  };

  /** Somma due blocchi di statistiche (es. stagione in corso + precedente): la FM è pesata sulle presenze. */
  function unisciStats(a, b) {
    var n = (a.presenze || 0) + (b.presenze || 0);
    var vg = (a.vittorieGirone || 0) + (b.vittorieGirone || 0), sg = (a.sconfitteGirone || 0) + (b.sconfitteGirone || 0);
    return {
      storico: (a.storico || []).concat(b.storico || []), presenze: n,
      fm: n ? E.r2(((a.fm || 0) * (a.presenze || 0) + (b.fm || 0) * (b.presenze || 0)) / n) : 0,
      vittorieGirone: vg, sconfitteGirone: sg, vittorieDiretta: (a.vittorieDiretta || 0) + (b.vittorieDiretta || 0),
      podi: (a.podi || 0) + (b.podi || 0), ori: (a.ori || 0) + (b.ori || 0), pctGirone: (vg + sg) ? E.r2(100 * vg / (vg + sg)) : 0,
    };
  }
  FS.unisciStats = unisciStats;

  /** Statistiche di ogni atleta: storico completo, stagione in corso, stagione precedente, le due insieme, Qt.I e Qt.A. */
  var statsCache = { v: -1 };
  function statsAtleti(settings, stagione) {
    var key = Object.keys(state.gare).length + ':' + state.version;
    if (statsCache.key === key) return statsCache.val;
    var out = {};
    // Qt.A: lo stesso modello della Qt.I, ricalcolato con i risultati arrivati nel frattempo
    var V = E.valutaQuotazioni(state.atleti, state.gare, settings, stagione).atleti;
    Object.values(state.atleti).forEach(function (a) {
      var tutto = E.statisticheAtleta(a, state.gare, settings);
      var st = E.statisticheAtleta(a, state.gare, settings, stagione);
      var prec = E.statisticheAtleta(a, state.gare, settings, stagione - 1);
      var qtI = Number(a.quotazione) || 1;
      var v = V[a.fis] || null;
      out[a.fis] = { tutto: tutto, stagione: st, prec: prec, dueStagioni: unisciStats(st, prec), qtI: qtI, qtA: v ? v.qt : qtI, valutazione: v };
    });
    statsCache = { key: key, val: out };
    return out;
  }

  /**
   * Rose alla scadenza di una giornata già chiusa (le formazioni restano quelle valide in quel momento,
   * anche se poi un atleta viene svincolato o scambiato); per le giornate aperte, rose attuali.
   */
  var roseCache = {};
  function roseAllaScadenza(n) {
    var lega = state.leghe[state.legaId];
    var settings = E.settingsCon(lega && lega.settings);
    var g = state.giornate[n];
    var scad = g ? (g.scadenza || Date.parse(g.dal + 'T00:00:00')) : null;
    var chiusa = scad && scad <= FS.now();
    var key = state.version + ':' + (chiusa ? scad : 'ora');
    if (roseCache[key]) return roseCache[key];
    var movs = chiusa ? state.movimenti.filter(function (m) { return (m.at || 0) <= scad; }) : state.movimenti;
    var R = E.rose(Object.keys(state.squadre), movs, settings);
    if (Object.keys(roseCache).length > 40) roseCache = {};
    roseCache[key] = R;
    return R;
  }

  /** Formazione valida per la giornata: quella salvata o, se manca, l'ultima precedente (senza atleti che non erano in rosa alla scadenza). */
  function formazioneEffettiva(teamId, n) {
    var R = roseAllaScadenza(n);
    var rosa = R.squadre[teamId] ? R.squadre[teamId].rosa.map(function (x) { return x.id; }) : [];
    var best = null;
    Object.values(state.formazioni).forEach(function (f) {
      if (f.teamId !== teamId || f.n > n) return;
      if (!best || f.n > best.n) best = f;
    });
    if (!best) return null;
    var inRosa = function (id) { return rosa.indexOf(id) >= 0; };
    return {
      n: best.n, salvataPer: best.n, automatica: best.n !== n,
      titolari: (best.titolari || []).filter(inRosa), panchina: (best.panchina || []).filter(inRosa),
    };
  }
  FS.formazioneEffettiva = function (teamId, n) { return formazioneEffettiva(teamId, n); };
  /** Copie ancora disponibili di un atleta (Infinity con il listone a budget fisso). */
  FS.copieLibere = function (atletaId) { var d = FS.derived(); return E.copieLibere(d.settings, d.proprietari, atletaId); };

  // ------------------------------------------------------- modalità di gioco
  /** Quotazioni attuali (Qt.A) degli atleti attivi: la base del budget consigliato del listone. */
  FS.qtAttivi = function () {
    var d = FS.derived();
    return Object.values(state.atleti).filter(function (a) { return a && a.fis && a.attivo !== false; }).map(function (a) {
      var st = d.statsAtleti[a.fis];
      return st ? st.qtA : Math.max(1, Number(a.quotazione) || 1);
    });
  };
  /**
   * Regole consigliate per la modalità ('copie' | 'listone') con il listone di adesso. Le copie per atleta tengono
   * conto delle squadre iscritte solo con `conSquadre` (es. «Ripristina valori consigliati»): durante le iscrizioni
   * le squadre crescono, e con una o due squadre si consiglierebbe 1 copia.
   */
  FS.impostazioniModalita = function (modo, conSquadre) {
    var d = FS.derived();
    var qts = FS.qtAttivi();
    return E.impostazioniModalita(modo, { qts: qts, nAtleti: qts.length, nSquadre: conSquadre && d.lega ? d.teamIds.length : 0, titolari: d.settings.titolari });
  };
  /** Perché la modalità non si può più cambiare ('' = si può): si sceglie prima che le rose comincino a riempirsi. */
  FS.bloccoModalita = function () {
    var d = FS.derived();
    if (!d.lega) return '';
    if (d.lega.stato === 'campionato') return 'Il campionato è già iniziato.';
    if (state.asta && state.asta.attiva) return 'L\'asta è in corso.';
    var n = 0;
    d.teamIds.forEach(function (t) { n += d.rose[t] ? d.rose[t].rosa.length : 0; });
    // annullare l'acquisto restituisce tutti i crediti, svincolare (fuori dalla composizione del listone) solo una parte
    var comeRimediare = ' Il presidente può annullare i movimenti (Mercato → Movimenti): annullare un acquisto restituisce tutti i crediti.';
    if (n) return (n === 1 ? 'C\'è già 1 atleta' : 'Ci sono già ' + n + ' atleti') + ' nelle rose: per cambiarla le rose devono essere vuote.' + comeRimediare;
    // rose vuote ma crediti diversi da quelli iniziali (svincoli a rimborso parziale, scambi con crediti):
    // il budget non sarebbe più uguale per tutti. Le rettifiche dei crediti del presidente valgono comunque.
    var rett = {};
    state.movimenti.forEach(function (m) { if (!m.annullato && m.tipo === 'crediti' && m.teamId) rett[m.teamId] = (rett[m.teamId] || 0) + (Number(m.delta) || 0); });
    var diversi = d.teamIds.filter(function (t) { return d.rose[t] && d.rose[t].crediti !== d.settings.crediti + (rett[t] || 0); });
    if (diversi.length) return (diversi.length === 1 ? '1 squadra non ha più' : diversi.length + ' squadre non hanno più') + ' i crediti iniziali (svincoli o scambi già fatti): cambiando modalità il budget non sarebbe uguale per tutti.' + comeRimediare;
    return '';
  };

  /** Prezzo d'acquisto di un atleta al mercato o dal listone (con il listone sempre la Qt.A: a 1 credito il budget non conterebbe). */
  FS.prezzoAcquisto = function (atletaId) {
    var d = FS.derived();
    if (d.modalita !== 'listone' && d.settings.prezzoSvincolati === 'uno') return 1;
    var st = d.statsAtleti[atletaId];
    var a = state.atleti[atletaId];
    return Math.max(1, st ? st.qtA : (Number(a && a.quotazione) || 1));
  };
  /** Perché non posso comprare l'atleta adesso ('' = posso): stesse regole di act.acquistaSvincolato. */
  FS.bloccoAcquisto = function (atletaId) {
    var d = FS.derived();
    var lega = d.lega;
    if (!lega) return 'Nessuna lega selezionata.';
    if (!d.miaRosa) return 'Non hai una squadra in questa lega.';
    var at = state.atleti[atletaId];
    if (!at || at.attivo === false) return 'Questo atleta non è più nel listone.';
    if (!d.puoComprare) return d.composizioneChiusa ? 'La composizione delle rose è chiusa: si compra nelle sessioni di mercato.' : 'Il mercato è chiuso.';
    if ((d.proprietari[atletaId] || []).indexOf(state.uid) >= 0) return 'Hai già questo atleta.';
    if (E.copieLibere(d.settings, d.proprietari, atletaId) <= 0) return E.copiePerAtleta(d.settings) > 1 ? 'Le copie di questo atleta sono finite.' : 'Atleta già in una rosa.';
    if (state.asta && state.asta.lotto && state.asta.lotto.atletaId === atletaId) return 'Questo atleta è all\'asta in questo momento.';
    var sess = lega.sessioneMercato || 0;
    if (!d.composizione && d.miaRosa.svincolati.some(function (x) { return x.id === atletaId && !x.pieno && (x.sessione || 0) === sess; })) return 'Non puoi riacquistare un atleta che hai svincolato in questa sessione di mercato.';
    if (d.miaRosa.rosa.length >= d.settings.rosa) return 'La tua rosa è completa.';
    var prezzo = FS.prezzoAcquisto(atletaId);
    var max = E.offertaMassima(d.miaRosa, d.settings, state.atleti[atletaId], state.atleti, d.stagione);
    if (prezzo > max) return max > 0 ? 'Crediti insufficienti: puoi spendere al massimo ' + max + (max === 1 ? ' credito.' : ' crediti.') : Object.keys(d.settings.ruoliRosa || {}).length ? 'Non rispetterebbe i vincoli di ruolo della rosa.' : 'Crediti insufficienti.';
    return '';
  };

  /** Dettaglio punteggio di una squadra in una giornata (ufficiale se congelato, altrimenti calcolato). */
  FS.punteggio = function (teamId, n) {
    var d = FS.derived();
    var g = state.giornate[n];
    if (!g) return null;
    var uff = state.esiti[n];
    // giornata ufficiale: vale la formazione congelata al momento dell'ufficializzazione
    var fz = uff && uff.ufficiale && uff.dettaglio && uff.dettaglio[teamId] && uff.dettaglio[teamId].formazione;
    var f = fz ? { n: fz.n, salvataPer: fz.salvataPer, automatica: !!fz.automatica, titolari: fz.titolari || [], panchina: fz.panchina || [] } : formazioneEffettiva(teamId, n);
    if (!f) return null;
    var p = E.punteggioSquadra(f, state.atleti, g, state.gare, d.settings, d.stagione);
    if (uff && uff.ufficiale && uff.totali && uff.totali[teamId] !== undefined) { p.ufficiale = true; p.totaleUfficiale = uff.totali[teamId]; }
    p.formazione = f;
    return p;
  };

  // --------------------------------------------------------------- azioni
  var act = FS.act = {};
  function legaPath() { if (!state.legaId) throw userError('Nessuna lega selezionata.'); return 'leghe/' + state.legaId; }
  function needWrite() { if (!state.canWrite) throw userError('Sei in sola lettura: chiedi al proprietario di invitarti come Editor.'); }

  act.creaLega = function (o) {
    return write(async function () {
      needWrite();
      var id = (String(o.nome || 'lega').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'lega') + '-' + rid(4);
      var settings = clone(o.settings || {});
      // listone: le rose si compongono fino alla scadenza della prima giornata valida, quindi una lega creata a
      // stagione iniziata parte dalla prima giornata con le formazioni ancora aperte
      if (E.modalita(settings) === 'listone' && !settings.giornataIniziale) {
        var aperte = Object.values(state.giornate).filter(function (g) { return g.n >= 1 && (g.scadenza || Date.parse(g.dal + 'T00:00:00')) > FS.now(); })
          .sort(function (a, b) { return a.n - b.n; });
        if (aperte.length && aperte[0].n > 1) settings.giornataIniziale = aperte[0].n;
      }
      var doc = { id: id, nome: o.nome, codice: codice(), adminIds: [state.uid], membri: [], creatoDa: state.uid, creatoAt: FS.now(), stato: 'iscrizioni', mercatoAperto: false, settings: settings };
      await db.doc('leghe/' + id).set(doc);
      FS.selectLega(id);
      return id;
    }, 'Lega creata');
  };

  act.trovaLegaDaCodice = function (code) {
    code = String(code || '').trim().toUpperCase();
    return Object.values(state.leghe).filter(function (l) { return l.codice === code; })[0] || null;
  };

  act.creaSquadra = function (o) {
    return write(async function () {
      needWrite();
      var base = legaPath();
      var lega = state.leghe[state.legaId];
      if (lega.stato === 'campionato' && !(lega.adminIds || []).includes(state.uid) && !o.forza) { /* iscrizione tardiva consentita: asta di riparazione */ }
      var nome = String(o.nome || '').trim().slice(0, 40);
      if (!nome) throw userError('Dai un nome alla squadra.');
      await db.doc(base + '/squadre/' + state.uid).set({ id: state.uid, ownerId: state.uid, nome: nome, motto: String(o.motto || '').slice(0, 80), colori: o.colori || ['#0b1150', '#f2c94c'], creatoAt: FS.now() });
      var membri = (lega.membri || []).slice();
      if (membri.indexOf(state.uid) < 0) { membri.push(state.uid); await db.doc('leghe/' + state.legaId).update({ membri: membri }); }
      await post('Nuova squadra iscritta: ' + nome, 'sistema');
    }, 'Squadra iscritta');
  };

  act.aggiornaSquadra = function (patch) {
    return write(async function () { needWrite(); await db.doc(legaPath() + '/squadre/' + state.uid).update(patch); }, 'Squadra aggiornata');
  };

  act.salvaFormazione = function (n, f) {
    return write(async function () {
      needWrite();
      var g = state.giornate[n];
      var d = FS.derived();
      if (!g) throw userError('Giornata inesistente.');
      if (d.scadenza(g) <= FS.now()) throw userError('La formazione per questa giornata è chiusa.');
      var rosa = d.miaRosa ? d.miaRosa.rosa.map(function (x) { return x.id; }) : [];
      var errs = E.validaFormazione(f, rosa, state.atleti, d.settings, d.stagione);
      if (errs.length) throw userError(errs[0]);
      await db.doc(legaPath() + '/formazioni/' + n + '__' + state.uid).set({ id: n + '__' + state.uid, n: n, teamId: state.uid, titolari: f.titolari, panchina: f.panchina, at: FS.now() });
    }, 'Formazione salvata');
  };

  // ---- bacheca
  async function post(testo, tipo) {
    try { await db.collection(legaPath() + '/bacheca').doc(FS.now() + '-' + rid(4)).set({ testo: String(testo).slice(0, 500), tipo: tipo || 'msg', autore: state.uid, at: FS.now() }); } catch (e) { }
  }
  act.scriviBacheca = function (testo) {
    return write(async function () { needWrite(); if (!String(testo).trim()) throw userError('Scrivi qualcosa.'); await post(testo, 'msg'); });
  };
  act.eliminaPost = function (id) { return write(async function () { await db.doc(legaPath() + '/bacheca/' + id).delete(); }); };

  // ---- mercato
  act.acquistaSvincolato = function (atletaId) {
    return write(async function () {
      needWrite();
      var d = FS.derived();
      var blocco = FS.bloccoAcquisto(atletaId);
      if (blocco) throw userError(blocco);
      var prezzo = FS.prezzoAcquisto(atletaId);
      await db.doc(legaPath() + '/movimenti/acq-' + atletaId + '-' + FS.now()).set({ tipo: 'acquisto', teamId: state.uid, atletaId: atletaId, prezzo: prezzo, at: FS.now(), by: state.uid });
      // durante la composizione delle rose niente annunci in bacheca (sarebbero decine)
      if (!d.composizione) await post((d.mia ? d.mia.nome : 'Una squadra') + ' acquista ' + nomeAtleta(atletaId) + ' per ' + prezzo + ' crediti', 'mercato');
    }, 'Acquisto completato');
  };

  /** Rimborso se svincolo adesso un atleta pagato `prezzo`: pieno durante la composizione delle rose del listone. */
  FS.rimborsoSvincolo = function (prezzo) {
    var d = FS.derived();
    return d.composizione ? Number(prezzo || 0) : Math.ceil(Number(prezzo || 0) * d.settings.rimborsoSvincolo);
  };

  act.svincola = function (atletaId) {
    var togli = !!FS.derived().composizione;
    return write(async function () {
      needWrite();
      var d = FS.derived();
      if (!d.puoComprare) throw userError(d.composizioneChiusa ? 'La composizione delle rose è chiusa: si svincola nelle sessioni di mercato.' : 'Il mercato è chiuso.');
      var it = d.miaRosa && d.miaRosa.rosa.filter(function (x) { return x.id === atletaId; })[0];
      if (!it) throw userError('Atleta non nella tua rosa.');
      var rimborso = FS.rimborsoSvincolo(it.prezzo);
      await db.doc(legaPath() + '/movimenti/svi-' + atletaId + '-' + FS.now()).set({ tipo: 'svincolo', teamId: state.uid, atletaId: atletaId, rimborso: rimborso, at: FS.now(), by: state.uid, sessione: state.leghe[state.legaId].sessioneMercato || 0 });
      if (!d.composizione) await post((d.mia ? d.mia.nome : 'Una squadra') + ' svincola ' + nomeAtleta(atletaId) + ' (+' + rimborso + ' crediti)', 'mercato');
    }, togli ? 'Atleta tolto dalla rosa' : 'Atleta svincolato');
  };

  var NO_SCAMBI = 'Nel listone a budget fisso non ci sono scambi: ogni squadra può comprare qualunque atleta.';
  act.proponiScambio = function (o) {
    return write(async function () {
      needWrite();
      var d = FS.derived();
      if (d.modalita === 'listone') throw userError(NO_SCAMBI);
      if (!d.mercatoAperto) throw userError('Il mercato è chiuso.');
      if (!o.a || o.a === state.uid) throw userError('Scegli la squadra con cui scambiare.');
      if (!(o.daA || []).length && !(o.daB || []).length) throw userError('Scegli almeno un atleta.');
      var id = rid(10);
      await db.doc(legaPath() + '/scambi/' + id).set({ id: id, da: state.uid, a: o.a, daA: o.daA || [], daB: o.daB || [], crediti: Number(o.crediti) || 0, stato: 'proposto', nota: String(o.nota || '').slice(0, 200), at: FS.now() });
    }, 'Proposta inviata');
  };

  act.rispondiScambio = function (id, accetta) {
    return write(async function () {
      needWrite();
      var sc = state.scambi[id];
      if (!sc || sc.stato !== 'proposto') throw userError('Proposta non più valida.');
      if (sc.a !== state.uid && !FS.derived().isAdmin) throw userError('Solo la squadra destinataria può rispondere.');
      if (accetta) {
        var d = FS.derived();
        if (d.modalita === 'listone') throw userError(NO_SCAMBI);
        if (!d.mercatoAperto) throw userError('Il mercato è chiuso.');
        var ha = function (team, x) { return (d.proprietari[x] || []).indexOf(team) >= 0; };
        var okA = sc.daA.every(function (x) { return ha(sc.da, x) && !ha(sc.a, x); });
        var okB = sc.daB.every(function (x) { return ha(sc.a, x) && !ha(sc.da, x); });
        if (!okA || !okB) throw userError('Uno degli atleti non è più nella rosa indicata.');
        var A = d.rose[sc.da], B = d.rose[sc.a];
        var nA = A.rosa.length - sc.daA.length + sc.daB.length, nB = B.rosa.length - sc.daB.length + sc.daA.length;
        if (nA > d.settings.rosa || nB > d.settings.rosa) throw userError('Lo scambio supera il numero massimo di atleti in rosa.');
        if (A.crediti - sc.crediti < 0 || B.crediti + sc.crediti < 0) throw userError('Crediti insufficienti per il conguaglio.');
        await db.doc(legaPath() + '/movimenti/scambio-' + id).set({ tipo: 'scambio', teamA: sc.da, teamB: sc.a, daA: sc.daA, daB: sc.daB, creditiAversoB: sc.crediti, at: FS.now(), by: state.uid, rif: id });
        await db.doc(legaPath() + '/scambi/' + id).update({ stato: 'accettato', chiusoAt: FS.now() });
        await post('Scambio tra ' + nomeSquadra(sc.da) + ' e ' + nomeSquadra(sc.a) + ' completato', 'mercato');
      } else {
        await db.doc(legaPath() + '/scambi/' + id).update({ stato: 'rifiutato', chiusoAt: FS.now() });
      }
    }, accetta ? 'Scambio completato' : 'Proposta rifiutata');
  };
  act.annullaScambio = function (id) {
    return write(async function () { needWrite(); await db.doc(legaPath() + '/scambi/' + id).update({ stato: 'annullato', chiusoAt: FS.now() }); }, 'Proposta ritirata');
  };

  function nomeAtleta(id) { var a = state.atleti[id]; return a ? (a.cognome + ' ' + a.nome).trim() : id; }
  function nomeSquadra(id) { var t = state.squadre[id]; return t ? t.nome : 'Squadra'; }
  FS.nomeAtleta = nomeAtleta; FS.nomeSquadra = nomeSquadra;

  // ---- asta live
  // Tutte le transizioni passano da un lease sul documento di stato: acquire → rileggi → verifica → scrivi.
  var ASTA_GRACE = 1500;
  var CLIENT = rid(6); // identifica questa scheda: lo stesso client può riprendere subito il proprio lease
  async function conLease(fn) {
    var ref = db.doc(legaPath() + '/asta/stato');
    var holder = state.uid + ':' + CLIENT;
    // sul web la rete può essere lenta: lease più lungo, ma rilasciato appena finita l'operazione
    var ttl = state.web ? 3000 : 1000;
    for (var i = 0; i < 20; i++) {
      var l = await ref.acquire({ holder: holder, ttlMs: ttl });
      if (l.acquired) {
        try {
          var s = await ref.get();
          return await fn(ref, s.exists ? s.data() : null);
        } finally {
          if (typeof ref.release === 'function') ref.release(holder).catch(function () { });
        }
      }
      await new Promise(function (r) { setTimeout(r, 120 + Math.random() * 180); });
    }
    throw userError('Asta occupata: riprova.');
  }

  act.avviaAsta = function (ordine) {
    return write(async function () {
      needWrite();
      if (!FS.derived().isAdmin) throw userError('Solo il presidente può avviare l\'asta.');
      await db.doc(legaPath() + '/asta/stato').set({ attiva: true, pausa: false, ordine: ordine, turno: 0, lotto: null, nLotti: (state.asta && state.asta.nLotti) || 0, avviataAt: FS.now() });
      // un'asta di riparazione a campionato iniziato non riporta la lega allo stato "asta"
      if (state.leghe[state.legaId].stato !== 'campionato') await db.doc('leghe/' + state.legaId).update({ stato: 'asta' });
      await post('L\'asta è aperta!', 'sistema');
    }, 'Asta avviata');
  };

  function needAdmin(cosa) { if (!FS.derived().isAdmin) throw userError('Solo il presidente può ' + cosa + '.'); }
  function needCommissario(cosa) { if (!FS.derived().gestisceCircuito) throw userError(state.web ? 'Solo il proprietario del sito può ' + cosa + '.' : 'Solo i presidenti possono ' + cosa + '.'); }

  act.pausaAsta = function (pausa) {
    return write(async function () {
      needWrite(); needAdmin('mettere in pausa l\'asta');
      await conLease(async function (ref, s) {
        if (!s) return;
        var patch = { pausa: !!pausa };
        if (!pausa && s.lotto) patch.lotto = { scadenza: FS.now() + FS.derived().settings.timerAsta * 1000 };
        await ref.update(patch);
      });
    });
  };

  act.chiamaAtleta = function (atletaId, offerta) {
    return write(async function () {
      needWrite();
      var d = FS.derived();
      offerta = Math.floor(Number(offerta) || d.settings.offertaMinima);
      await conLease(async function (ref, s) {
        if (!s || !s.attiva || s.pausa) throw userError('L\'asta non è attiva.');
        if (s.lotto) throw userError('C\'è già un atleta all\'asta.');
        var chiamante = s.ordine[s.turno];
        if (chiamante !== state.uid && !d.isAdmin) throw userError('Non è il tuo turno di chiamata.');
        if (E.copieLibere(d.settings, d.proprietari, atletaId) <= 0) throw userError(d.settings.disponibilita === 'quote' ? 'Le copie di questo atleta sono finite.' : 'Atleta già assegnato.');
        if ((d.proprietari[atletaId] || []).indexOf(chiamante) >= 0) throw userError('La squadra di turno ha già questo atleta.');
        var chi = chiamante;
        var max = E.offertaMassima(d.rose[chi], d.settings, state.atleti[atletaId], state.atleti, d.stagione);
        if (offerta < d.settings.offertaMinima) offerta = d.settings.offertaMinima;
        if (offerta > max) throw userError('Offerta oltre il massimo consentito (' + max + ').');
        var maxMov = 0;
        state.movimenti.forEach(function (m) { var k = /^asta-(\d+)$/.exec(m.id); if (k) maxMov = Math.max(maxMov, Number(k[1])); });
        var n = Math.max(s.nLotti || 0, maxMov) + 1;
        // documento intero, cambia solo `lotto` (un update di campi annidati su un lotto null non è affidabile su tutti i backend)
        var nuovo = JSON.parse(JSON.stringify(s));
        nuovo.lotto = { n: n, atletaId: atletaId, chiamante: chi, offerta: offerta, offerente: chi, apertoAt: FS.now(), scadenza: FS.now() + d.settings.timerAsta * 1000, rilanci: 0 };
        await ref.set(nuovo);
      });
    });
  };

  act.rilancia = function (importo) {
    return write(async function () {
      needWrite();
      var d = FS.derived();
      importo = Math.floor(Number(importo));
      await conLease(async function (ref, s) {
        if (!s || !s.attiva || s.pausa || !s.lotto) throw userError('Nessun atleta all\'asta.');
        var L = s.lotto;
        if (FS.now() > L.scadenza) throw userError('Tempo scaduto.');
        if (importo <= L.offerta) throw userError('Serve un\'offerta superiore a ' + L.offerta + '.');
        if (L.offerente === state.uid) throw userError('Sei già il miglior offerente.');
        if ((d.proprietari[L.atletaId] || []).indexOf(state.uid) >= 0) throw userError('Hai già questo atleta in rosa.');
        var max = E.offertaMassima(d.rose[state.uid], d.settings, state.atleti[L.atletaId], state.atleti, d.stagione);
        if (importo > max) throw userError('Puoi offrire al massimo ' + max + ' crediti.');
        await ref.update({ lotto: { offerta: importo, offerente: state.uid, scadenza: FS.now() + d.settings.timerAsta * 1000, rilanci: (L.rilanci || 0) + 1 } });
      });
    });
  };

  /** Chiude il lotto scaduto (lo può fare qualunque client: l'id del movimento è deterministico). */
  var chiusura = { n: null, at: 0 };
  act.chiudiLottoSeScaduto = async function () {
    var s = state.asta;
    if (!s || !s.lotto || s.pausa || FS.now() < s.lotto.scadenza + ASTA_GRACE) return;
    if (!state.canWrite) return;
    // un tentativo alla volta per lotto da questo client (ritenta dopo 4 s se lo stato non è cambiato)
    if (chiusura.n === s.lotto.n && Date.now() - chiusura.at < 4000) return;
    chiusura = { n: s.lotto.n, at: Date.now() };
    try {
      await conLease(async function (ref, cur) {
        if (!cur || !cur.lotto || cur.pausa || cur.lotto.n !== s.lotto.n || FS.now() < cur.lotto.scadenza + ASTA_GRACE) return;
        var L = cur.lotto;
        await db.doc(legaPath() + '/movimenti/asta-' + L.n).set({ tipo: 'asta', teamId: L.offerente, atletaId: L.atletaId, prezzo: L.offerta, at: FS.now(), lotto: L.n, rilanci: L.rilanci || 0 });
        var d = FS.derived();
        // la rosa derivata non include ancora l'assegnazione appena scritta: simuliamola
        var roseInfo = {};
        Object.keys(d.rose).forEach(function (t) { roseInfo[t] = { rosa: d.rose[t].rosa.slice() }; });
        if (roseInfo[L.offerente]) roseInfo[L.offerente].rosa.push({ id: L.atletaId });
        var next = E.prossimoChiamante(cur.ordine, cur.turno, roseInfo, d.settings);
        var patch = { lotto: null, nLotti: L.n, ultimo: { n: L.n, atletaId: L.atletaId, teamId: L.offerente, prezzo: L.offerta } };
        if (next < 0) { patch.attiva = false; patch.conclusa = true; } else patch.turno = next;
        await ref.update(patch);
        await post(nomeSquadra(L.offerente) + ' si aggiudica ' + nomeAtleta(L.atletaId) + ' per ' + L.offerta + ' crediti', 'asta');
      });
    } catch (e) { /* un altro client l'ha già chiuso */ }
  };

  act.saltaTurno = function () {
    return write(async function () {
      needAdmin('saltare un turno');
      var d = FS.derived();
      await conLease(async function (ref, s) {
        if (!s || s.lotto) return;
        var roseInfo = {}; Object.keys(d.rose).forEach(function (t) { roseInfo[t] = { rosa: d.rose[t].rosa }; });
        var next = E.prossimoChiamante(s.ordine, s.turno, roseInfo, d.settings);
        await ref.update(next < 0 ? { attiva: false, conclusa: true } : { turno: next });
      });
    });
  };

  act.annullaLotto = function () {
    return write(async function () { needAdmin('annullare un lotto'); await conLease(async function (ref, s) { if (s && s.lotto) await ref.update({ lotto: null }); }); }, 'Lotto annullato');
  };

  act.terminaAsta = function () {
    return write(async function () {
      needAdmin('chiudere l\'asta');
      await db.doc(legaPath() + '/asta/stato').update({ attiva: false, conclusa: true, lotto: null });
      await db.doc('leghe/' + state.legaId).update({ stato: 'campionato' });
      await post('Asta conclusa: si parte!', 'sistema');
    }, 'Asta chiusa');
  };

  /** Listone a budget fisso: il presidente chiude la composizione delle rose e avvia il campionato (non c'è un'asta da chiudere). */
  act.iniziaCampionato = function () {
    return write(async function () {
      needWrite(); needAdmin('iniziare il campionato');
      var d = FS.derived();
      if (d.lega.stato === 'campionato') throw userError('Il campionato è già iniziato.');
      if (d.modalita !== 'listone') throw userError('Con l\'asta a copie il campionato inizia chiudendo l\'asta.');
      await db.doc('leghe/' + state.legaId).update({ stato: 'campionato' });
      await post('Rose chiuse: inizia il campionato! Da ora si compra e si svincola nelle sessioni di mercato.', 'sistema');
    }, 'Campionato iniziato');
  };

  act.assegnaManuale = function (teamId, atletaId, prezzo, tipo) {
    return write(async function () {
      var d = FS.derived();
      if (!d.isAdmin) throw userError('Solo il presidente può assegnare manualmente.');
      if (E.copieLibere(d.settings, d.proprietari, atletaId) <= 0) throw userError(E.copiePerAtleta(d.settings) > 1 ? 'Le copie di questo atleta sono finite.' : 'Atleta già in rosa.');
      if ((d.proprietari[atletaId] || []).indexOf(teamId) >= 0) throw userError('Questa squadra ha già l\'atleta.');
      prezzo = Math.max(0, Math.floor(Number(prezzo) || 0));
      var t = d.rose[teamId];
      if (!t) throw userError('Squadra non trovata.');
      if (t.rosa.length >= d.settings.rosa) throw userError('Rosa già completa.');
      if (prezzo > t.crediti) throw userError('Crediti insufficienti.');
      await db.doc(legaPath() + '/movimenti/man-' + atletaId + '-' + FS.now()).set({ tipo: tipo || 'manuale', teamId: teamId, atletaId: atletaId, prezzo: prezzo, at: FS.now(), by: state.uid });
    }, 'Atleta assegnato');
  };

  act.annullaMovimento = function (id) {
    return write(async function () {
      if (!FS.derived().isAdmin) throw userError('Solo il presidente può annullare un movimento.');
      await db.doc(legaPath() + '/movimenti/' + id).update({ annullato: true, annullatoDa: state.uid, annullatoAt: FS.now() });
    }, 'Movimento annullato');
  };

  act.rettificaCrediti = function (teamId, delta, nota) {
    return write(async function () {
      if (!FS.derived().isAdmin) throw userError('Solo il presidente può rettificare i crediti.');
      await db.doc(legaPath() + '/movimenti/cr-' + teamId + '-' + FS.now()).set({ tipo: 'crediti', teamId: teamId, delta: Number(delta) || 0, nota: String(nota || ''), at: FS.now(), by: state.uid });
    }, 'Crediti rettificati');
  };

  // ---- presidenza lega
  act.aggiornaLega = function (patch) {
    return write(async function () {
      if (!FS.derived().isAdmin) throw userError('Solo il presidente può modificare la lega.');
      await db.doc('leghe/' + state.legaId).update(patch);
    }, 'Lega aggiornata');
  };
  act.salvaSettings = function (settings) {
    return write(async function () {
      if (!FS.derived().isAdmin) throw userError('Solo il presidente può modificare le regole.');
      var blocco = FS.bloccoModalita();
      if (blocco && E.modalita(settings) !== FS.derived().modalita) throw userError('La modalità di gioco non si può più cambiare. ' + blocco);
      // set completo del campo settings (update fonderebbe le chiavi rimosse)
      var lega = clone(state.leghe[state.legaId]);
      delete lega._id;
      lega.settings = settings;
      await db.doc('leghe/' + state.legaId).set(lega);
    }, 'Regole salvate');
  };
  act.eliminaSquadra = function (teamId) {
    return write(async function () {
      if (!FS.derived().isAdmin) throw userError('Solo il presidente può eliminare una squadra.');
      await db.doc(legaPath() + '/squadre/' + teamId).delete();
      var lega = state.leghe[state.legaId];
      await db.doc('leghe/' + state.legaId).update({ membri: (lega.membri || []).filter(function (x) { return x !== teamId; }) });
    }, 'Squadra eliminata');
  };
  act.aggiungiAdmin = function (uid) {
    return write(async function () {
      needAdmin('nominare un vicepresidente');
      var lega = state.leghe[state.legaId];
      var a = (lega.adminIds || []).slice(); if (a.indexOf(uid) < 0) a.push(uid);
      await db.doc('leghe/' + state.legaId).update({ adminIds: a });
    }, 'Vicepresidente nominato');
  };

  act.salvaFormazioneAdmin = function (teamId, n, f) {
    return write(async function () {
      var d = FS.derived();
      if (!d.isAdmin) throw userError('Solo il presidente può modificare le formazioni altrui.');
      await db.doc(legaPath() + '/formazioni/' + n + '__' + teamId).set({ id: n + '__' + teamId, n: n, teamId: teamId, titolari: f.titolari, panchina: f.panchina || [], at: FS.now(), daAdmin: state.uid });
    }, 'Formazione salvata dal presidente');
  };

  act.aggiungiRettifica = function (o) {
    return write(async function () {
      if (!FS.derived().isAdmin) throw userError('Solo il presidente può assegnare penalità o punti extra.');
      var punti = Number(o.punti);
      if (!o.teamId || o.n === undefined || o.n === null || o.n === '' || !punti) throw userError('Indica squadra, giornata e punti.');
      await db.doc(legaPath() + '/rettifiche/' + rid(10)).set({ teamId: o.teamId, n: Number(o.n), punti: punti, nota: String(o.nota || '').slice(0, 200), at: FS.now(), by: state.uid });
    }, 'Rettifica registrata');
  };
  act.eliminaRettifica = function (id) {
    return write(async function () { needAdmin('eliminare una rettifica'); await db.doc(legaPath() + '/rettifiche/' + id).delete(); }, 'Rettifica eliminata');
  };

  act.apriMercato = function (aperto) {
    return write(async function () {
      if (!FS.derived().isAdmin) throw userError('Solo il presidente può aprire o chiudere il mercato.');
      var lega = state.leghe[state.legaId];
      var patch = { mercatoAperto: !!aperto };
      if (aperto) patch.sessioneMercato = (lega.sessioneMercato || 0) + 1;
      await db.doc('leghe/' + state.legaId).update(patch);
      await post(aperto ? (FS.derived().modalita === 'listone' ? 'Il mercato è aperto: acquisti e svincoli sono consentiti.' : 'Il mercato è aperto: acquisti, svincoli e scambi sono consentiti.') : 'Il mercato è chiuso.', 'mercato');
    }, aperto ? 'Mercato aperto' : 'Mercato chiuso');
  };

  act.ufficializzaGiornata = function (n) {
    return write(async function () {
      var d = FS.derived();
      if (!d.isAdmin) throw userError('Solo il presidente può ufficializzare.');
      var g = state.giornate[n];
      var totali = {}, dettaglio = {};
      d.teamIds.forEach(function (t) {
        var f = formazioneEffettiva(t, n);
        if (!f) return;
        var p = E.punteggioSquadra(f, state.atleti, g, state.gare, d.settings, d.stagione);
        totali[t] = p.totale;
        dettaglio[t] = { righe: p.righe.map(function (r) { return { id: r.id, titolare: r.titolare, fv: r.fv, entrato: r.entrato, gara: r.gara ? r.gara.id : null }; }), formazione: f };
      });
      await db.doc(legaPath() + '/esiti/' + n).set({ n: n, ufficiale: true, at: FS.now(), by: state.uid, totali: totali, dettaglio: dettaglio });
      // listone: se il presidente non ha avviato il campionato, lo avvia la prima giornata valida ufficializzata
      if (d.modalita === 'listone' && d.lega.stato !== 'campionato' && Number(n) >= (d.settings.giornataIniziale || 1)) await db.doc('leghe/' + state.legaId).update({ stato: 'campionato' });
      var best = Object.keys(totali).sort(function (a, b) { return totali[b] - totali[a]; })[0];
      if (best) await post('Giornata ' + n + ' ufficiale: vince ' + nomeSquadra(best) + ' con ' + totali[best] + ' punti', 'esito');
    }, 'Giornata ufficializzata');
  };
  act.riapriGiornata = function (n) {
    return write(async function () { needAdmin('riaprire una giornata'); await db.doc(legaPath() + '/esiti/' + n).delete(); }, 'Giornata riaperta');
  };

  // ---- circuito (dati globali: atleti, gare, giornate)
  /** Primo avvio della versione web: carica atleti, gare e calendario da dati/iniziali.json. */
  act.caricaDatiIniziali = function () {
    return write(async function () {
      if (!state.isOwner) throw userError('Solo il proprietario del sito può caricare i dati iniziali.');
      var res = await fetch('dati/iniziali.json', { cache: 'no-store' });
      if (!res.ok) throw userError('File dati/iniziali.json non trovato.');
      var docs = await res.json();
      var paths = Object.keys(docs);
      for (var i = 0; i < paths.length; i += 10) {
        await Promise.all(paths.slice(i, i + 10).map(function (p) { return db.doc(p).set(docs[p]); }));
      }
      return paths.length;
    }, 'Dati iniziali caricati');
  };

  act.salvaGiornata = function (g) {
    return write(async function () {
      needCommissario('modificare il calendario');
      if (g.n === undefined || g.n === null || g.n === '' || isNaN(Number(g.n)) || !g.dal || !g.al) throw userError('Numero, inizio e fine sono obbligatori.');
      if (g.al < g.dal) throw userError('La fine deve venire dopo l\'inizio.');
      var doc = clone(g); doc.n = Number(doc.n);
      await db.doc('giornate/' + doc.n).set(doc);
    }, 'Giornata salvata');
  };
  act.eliminaGiornata = function (n) {
    return write(async function () { needCommissario('eliminare una giornata'); await db.doc('giornate/' + n).delete(); }, 'Giornata eliminata');
  };
  /**
   * Atleti inseriti a mano prima di avere risultati su 4Fence (codice INT-…): il primo risultato
   * con il codice FIS vero viene collegato a loro (stesso cognome e nome) invece di creare un doppione.
   * Ritorna { codiceFIS: idAtletaNelListone }.
   */
  function normNome(x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim(); }
  function mappaAlias(atletiNuovi) {
    var map = {};
    Object.values(state.atleti).forEach(function (a) { if (a.fisReale) map[String(a.fisReale)] = a.fis; });
    (atletiNuovi || []).forEach(function (n) {
      if (!n || state.atleti[n.fis] || map[n.fis]) return;
      var cand = Object.values(state.atleti).filter(function (a) {
        return !a.fisReale && /^INT-/.test(String(a.fis)) && normNome(a.cognome) === normNome(n.cognome) && normNome(a.nome) === normNome(n.nome);
      });
      if (cand.length === 1) map[n.fis] = cand[0].fis;
    });
    return map;
  }
  FS.mappaAlias = mappaAlias;

  act.importaGare = function (gare, atletiNuovi) {
    return write(async function () {
      needCommissario('importare risultati');
      var alias = mappaAlias(atletiNuovi);
      for (var i = 0; i < gare.length; i++) {
        var g = clone(gare[i]);
        // risultati di un atleta inserito a mano: si registrano con il suo codice del listone
        Object.keys(alias).forEach(function (fisVero) {
          if (g.risultati && g.risultati[fisVero] && !g.risultati[alias[fisVero]]) {
            g.risultati[alias[fisVero]] = g.risultati[fisVero];
            delete g.risultati[fisVero];
          }
          if (g.atleti && g.atleti[fisVero]) delete g.atleti[fisVero];
        });
        var prev = state.gare[g.id];
        // conserva le correzioni manuali (cartellini, coefficiente, esclusione)
        if (prev) {
          if (prev.coeff) g.coeff = prev.coeff;
          if (prev.escludi) g.escludi = prev.escludi;
          Object.keys(g.risultati || {}).forEach(function (fis) {
            var pr = prev.risultati && prev.risultati[fis];
            if (pr && pr.cards) g.risultati[fis].cards = pr.cards;
            if (pr && pr.manuale) g.risultati[fis] = pr;
          });
        }
        g.importatoAt = FS.now();
        await db.doc('gare/' + g.id).set(g);
      }
      for (var j = 0; j < (atletiNuovi || []).length; j++) {
        var a = atletiNuovi[j];
        if (alias[a.fis]) {
          // collega il codice FIS vero all'atleta già in listone e completa i dati mancanti
          var ex = state.atleti[alias[a.fis]];
          if (ex && !ex.fisReale) await db.doc('atleti/' + ex.fis).update({ fisReale: a.fis, anno: ex.anno || a.anno || null, sesso: ex.sesso || a.sesso || null });
          continue;
        }
        if (!state.atleti[a.fis]) await db.doc('atleti/' + a.fis).set(a);
      }
    }, gare.length === 1 ? '1 gara importata' : gare.length + ' gare importate');
  };
  act.aggiornaGara = function (id, patch) {
    return write(async function () { needCommissario('modificare una gara'); await db.doc('gare/' + id).update(patch); }, 'Gara aggiornata');
  };
  act.salvaGara = function (g) {
    return write(async function () { needCommissario('modificare una gara'); var x = clone(g); delete x._id; await db.doc('gare/' + g.id).set(x); }, 'Gara salvata');
  };
  act.eliminaGara = function (id) {
    return write(async function () { needCommissario('eliminare una gara'); await db.doc('gare/' + id).delete(); }, 'Gara eliminata');
  };
  act.aggiornaAtleta = function (fis, patch) {
    return write(async function () { needCommissario('modificare un atleta'); await db.doc('atleti/' + fis).update(patch); }, 'Atleta aggiornato');
  };
  act.salvaAtleta = function (a) {
    return write(async function () {
      needCommissario('modificare il listone');
      if (!a.fis) throw userError('Serve un codice (FIS o interno).');
      var x = clone(a); delete x._id;
      await db.doc('atleti/' + a.fis).set(x);
    }, 'Atleta salvato');
  };

  // ------------------------------------------------------- hook per React
  FS.useFS = function () {
    var R = root.React;
    var st = R.useState(state.version);
    R.useEffect(function () { return FS.subscribe(function (s) { st[1](s.version); }); }, []);
    return state;
  };
  /** Ri-render ogni `ms` millisecondi (per countdown). */
  FS.useTick = function (ms) {
    var R = root.React;
    var st = R.useState(0);
    R.useEffect(function () { var t = setInterval(function () { st[1](function (x) { return x + 1; }); }, ms || 1000); return function () { clearInterval(t); }; }, [ms]);
    return FS.now();
  };
})(window);
