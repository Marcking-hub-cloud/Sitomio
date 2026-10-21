/* Fantascherma — motore di calcolo (puro, senza DOM).
 * Calcola fantavoti degli atleti da risultati 4Fence, punteggi di squadra con
 * sostituzioni dalla panchina, classifiche, rose (da registro movimenti) e vincoli d'asta.
 * Usabile nel browser (window.FSEngine) e in Node (module.exports) per i test.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- categorie
  // Stagione agonistica = anno di inizio (2026 per la 2026-2027).
  // Età di riferimento = annoStagione - annoNascita (la FIS usa l'età compiuta nel 2027: stessi anni di nascita).
  // Anni di nascita 2026-27 (Disposizioni FIS 2026-27): Maschietti 2016, Giovanissimi 2015, Ragazzi 2014,
  // Allievi 2013, Juniores 2012 (nuova categoria), Cadetti 2010-2012, Giovani 2007-2009, Master dai 24 anni.
  // `gare`: categorie di gara a cui l'atleta può partecipare (per le "probabili").
  var CATEGORIE = [
    { code: 'U10', label: 'Prime lame (Under 10)', short: 'Under 10', eta: [0, 9], ruolo: 'U14', gare: ['U10'] },
    { code: 'MAS', label: 'Maschietti / Bambine', short: 'Maschietti', eta: [10, 10], ruolo: 'U14', c4f: '2', gare: ['MAS'] },
    { code: 'GIO', label: 'Giovanissimi / Giovanissime', short: 'Giovanissimi', eta: [11, 11], ruolo: 'U14', c4f: '3', gare: ['GIO'] },
    { code: 'RAG', label: 'Ragazzi / Ragazze', short: 'Ragazzi', eta: [12, 12], ruolo: 'U14', c4f: '4', gare: ['RAG', 'ALL'] },
    { code: 'ALL', label: 'Allievi / Allieve', short: 'Allievi', eta: [13, 13], ruolo: 'U14', c4f: '5', gare: ['ALL', 'RAG'] },
    { code: 'JUN', label: 'Juniores', short: 'Juniores', eta: [14, 14], ruolo: 'U20', gare: ['JUN', 'CAD', 'ASS'] },
    { code: 'CAD', label: 'Cadetti', short: 'Cadetti', eta: [15, 16], ruolo: 'U20', gare: ['CAD', 'GIOV', 'ASS'] },
    { code: 'GIOV', label: 'Giovani (Under 20)', short: 'Giovani', eta: [17, 19], ruolo: 'U20', gare: ['GIOV', 'ASS'] },
    { code: 'ASS', label: 'Assoluti', short: 'Assoluti', eta: [20, 22], ruolo: 'SEN', gare: ['ASS'] },
    { code: 'MST', label: 'Master / Assoluti', short: 'Master', eta: [23, 120], ruolo: 'SEN', gare: ['MST', 'ASS'] },
  ];

  var RUOLI = {
    U14: { code: 'U14', label: 'Under 14', short: 'U14', desc: 'Circuito GPG: Maschietti, Giovanissimi, Ragazzi, Allievi' },
    U20: { code: 'U20', label: 'Under 20', short: 'U20', desc: 'Juniores, Cadetti e Giovani' },
    SEN: { code: 'SEN', label: 'Senior', short: 'SEN', desc: 'Assoluti e Master' },
  };
  var ORDINE_RUOLI = ['U14', 'U20', 'SEN'];

  function stagioneDaData(iso) {
    // la stagione inizia il 1 settembre
    var d = String(iso || '').slice(0, 10).split('-').map(Number);
    if (!d[0]) return null;
    return d[1] >= 9 ? d[0] : d[0] - 1;
  }

  function categoriaPer(annoNascita, stagione) {
    var eta = stagione - Number(annoNascita);
    if (!annoNascita || isNaN(eta)) return null;
    for (var i = 0; i < CATEGORIE.length; i++) {
      var c = CATEGORIE[i];
      if (eta >= c.eta[0] && eta <= c.eta[1]) return c;
    }
    return null;
  }

  function ruoloAtleta(atleta, stagione) {
    if (atleta && atleta.ruolo && RUOLI[atleta.ruolo]) return atleta.ruolo;
    var c = categoriaPer(atleta && atleta.anno, stagione);
    return c ? c.ruolo : 'SEN';
  }

  // ------------------------------------------------------------- impostazioni
  // Valori di default del regolamento (modificabili dal presidente di lega).
  var DEFAULT_PUNTEGGIO = {
    base: 6,                 // voto base: presenza in pedana ("il 6 politico")
    gironeVittoria: 0.5,     // X — ogni assalto vinto in girone
    gironeSconfitta: -0.25,  // malus — ogni assalto perso in girone
    indice: 0.05,            // Z — per ogni stoccata di differenza (indice) nel girone
    indiceMax: 1.5,          // tetto (in valore assoluto) al contributo dell'indice
    gironePerfetto: 1,       // bonus girone a punteggio pieno (almeno 4 assalti)
    gironeZero: -1,          // malus girone senza vittorie
    eliminatoGironi: -1,     // malus non qualificato al tabellone
    direttaVittoria: 1,      // Y — ogni assalto vinto in eliminazione diretta
    impresa: 1,              // bonus vittoria in diretta contro una testa di serie migliore di almeno sogliaImpresa posizioni
    sogliaImpresa: 8,
    sconfittaBeffa: -0.5,    // malus sconfitta in diretta contro una testa di serie peggiore di almeno sogliaImpresa posizioni
    vittoriaNetta: 0.5,      // bonus vittoria in diretta con scarto >= sogliaScarto (assalti a 15) o >= sogliaScarto10 (a 10)
    sconfittaNetta: -0.5,    // malus sconfitta in diretta con lo stesso scarto
    sogliaScarto: 10,
    sogliaScarto10: 7,
    derby: 0.5,              // bonus a chi vince un derby San Paolo in diretta
    oro: 4, argento: 2.5, bronzo: 1.5, finale8: 1, top16: 0.5,
    cartellinoGiallo: -0.5,
    cartellinoRosso: -1,
    cartellinoNero: -3,
    ritirato: -1,            // abbandono/ritiro durante la gara
    escluso: -3,             // esclusione dalla gara
  };

  var DEFAULT_SETTINGS = {
    crediti: 120,
    rosa: 8,                        // atleti per squadra (5 titolari + 3 in panchina)
    ruoliRosa: {},                  // vincoli per ruolo in rosa, es. { U14: [2, 5] } = [min, max]; vuoto = nessun vincolo
    titolari: 5,
    moduli: ['3-1-1', '2-2-1', '2-1-2', '1-2-2', '3-2-0', '3-0-2', '2-3-0', '2-0-3', '1-3-1', '1-1-3'], // U14-U20-SEN
    moduloLibero: true,             // true = qualunque combinazione di ruoli tra i titolari
    maxSostituzioni: 3,
    sostituzioniStessoRuolo: false,
    votoUfficio: 0,                 // punteggio di uno slot vuoto (titolare assente senza sostituto)
    classifica: 'punti',            // 'punti' (fantapunti totali) | 'f1' (punti per piazzamento di giornata)
    puntiF1: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    // Due modalità di gioco (E.modalita):
    // 'quote'    = «Asta a copie»: ogni atleta è disponibile in `copieAtleta` copie, al massimo in tante squadre,
    //              mai due volte nella stessa (1 copia = asta classica)
    // 'multipla' = «Listone a budget fisso»: niente asta, ogni squadra compra dal listone alla quotazione
    //              e lo stesso atleta può stare in un numero qualunque di squadre
    // 'singola'  = vecchie leghe: come l'asta a copie con 1 copia
    disponibilita: 'quote',
    copieAtleta: 5,
    rimborsoSvincolo: 0.5,          // quota del prezzo restituita allo svincolo
    prezzoSvincolati: 'quotazione', // 'quotazione' | 'uno'
    offertaMinima: 1,
    timerAsta: 20,                  // secondi per lotto (si azzera a ogni rilancio)
    giornataIniziale: 1,
    punteggio: DEFAULT_PUNTEGGIO,
  };

  function merge(base, over) {
    var out = {};
    var k;
    for (k in base) out[k] = base[k];
    if (over) for (k in over) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = merge(base[k], over[k]);
      else if (over[k] !== undefined && over[k] !== null) out[k] = over[k];
    }
    return out;
  }
  // Capitano e modificatori non fanno parte del gioco: si ignorano anche se presenti in impostazioni salvate.
  var CHIAVI_RIMOSSE = ['capitano', 'moltiplicatoreCapitano', 'modificatoreSquadra'];
  function settingsCon(over) {
    var out = merge(DEFAULT_SETTINGS, over || {});
    CHIAVI_RIMOSSE.forEach(function (k) { delete out[k]; });
    return out;
  }

  function r2(x) { return Math.round(x * 100) / 100; }
  function num(x, d) { var n = Number(x); return isFinite(n) ? n : (d || 0); }

  // -------------------------------------------------------------- fantavoto
  /**
   * raw: risultato di un atleta in una gara (formato import 4Fence):
   *   { stato:'ok'|'ritirato'|'escluso'|'assente',
   *     girone:{ n, v, s, td, tr, pos, of }, qualificato: true|false|null,
   *     seed, de:[{ r, opp, oppSeed, oppClub, td, tr, v }], place, of,
   *     cards:{ g, r, n }, deTouches: 15|10 }
   * Ritorna { sv, fv, voci:[{k, label, val, det}] }.
   */
  function fantavoto(raw, P, opts) {
    P = merge(DEFAULT_PUNTEGGIO, P || {});
    opts = opts || {};
    var club = opts.club || 'MISPM';
    if (!raw || raw.stato === 'assente') return { sv: true, fv: null, voci: [] };
    var voci = [];
    function add(k, label, val, det) { if (val) voci.push({ k: k, label: label, val: r2(val), det: det || '' }); }

    voci.push({ k: 'base', label: 'Voto base (in pedana)', val: P.base, det: '' });

    var g = raw.girone;
    if (g && (num(g.v) + num(g.s)) > 0) {
      var v = num(g.v), s = num(g.s);
      add('gv', 'Assalti vinti nel girone', v * P.gironeVittoria, v + ' × ' + P.gironeVittoria);
      add('gs', 'Assalti persi nel girone', s * P.gironeSconfitta, s + ' × ' + P.gironeSconfitta);
      var ind = num(g.td) - num(g.tr);
      var vi = ind * P.indice;
      if (P.indiceMax) vi = Math.max(-P.indiceMax, Math.min(P.indiceMax, vi));
      add('ind', 'Indice girone (' + (ind > 0 ? '+' : '') + ind + ')', vi, ind + ' × ' + P.indice + (Math.abs(ind * P.indice) > P.indiceMax ? ' (tetto ' + P.indiceMax + ')' : ''));
      if (s === 0 && v >= 4) add('perf', 'Girone perfetto', P.gironePerfetto, v + ' su ' + v);
      if (v === 0) add('zero', 'Girone senza vittorie', P.gironeZero, '');
    }
    if (raw.qualificato === false) add('elim', 'Eliminato/a nei gironi', P.eliminatoGironi, '');

    var de = raw.de || [];
    var vinte = 0;
    for (var i = 0; i < de.length; i++) {
      var b = de[i];
      var lim = num(raw.deTouches || opts.deTouches || b.lim, 15);
      var scarto = Math.abs(num(b.td) - num(b.tr));
      var soglia = lim <= 10 ? P.sogliaScarto10 : P.sogliaScarto;
      var turno = nomeTurno(b.r);
      var vs = (b.opp ? ' vs ' + b.opp : '') + ' ' + num(b.td) + '–' + num(b.tr);
      if (b.v) {
        vinte++;
        add('dv', 'Vittoria in diretta (' + turno + ')', P.direttaVittoria, vs.trim());
        if (raw.seed && b.oppSeed && (raw.seed - b.oppSeed) >= P.sogliaImpresa) add('imp', 'Impresa: battuto/a la testa di serie n.' + b.oppSeed, P.impresa, 'da n.' + raw.seed);
        if (scarto >= soglia) add('vn', 'Vittoria netta (' + turno + ')', P.vittoriaNetta, '+' + scarto);
        if (b.oppClub === club) add('derby', 'Derby San Paolo vinto', P.derby, b.opp || '');
      } else {
        if (raw.seed && b.oppSeed && (b.oppSeed - raw.seed) >= P.sogliaImpresa) add('beffa', 'Sconfitta con testa di serie n.' + b.oppSeed, P.sconfittaBeffa, 'da n.' + raw.seed);
        if (scarto >= soglia) add('sn', 'Sconfitta netta (' + turno + ')', P.sconfittaNetta, '−' + scarto);
      }
    }

    var pl = num(raw.place, 0);
    if (pl === 1) add('oro', 'Oro: 1° posto', P.oro);
    else if (pl === 2) add('arg', 'Argento: 2° posto', P.argento);
    else if (pl === 3) add('bro', 'Bronzo: 3° posto', P.bronzo);
    else if (pl >= 5 && pl <= 8) add('f8', 'Finale a 8 (' + pl + '°)', P.finale8);
    else if (pl >= 9 && pl <= 16 && num(raw.of, 0) >= 32) add('t16', 'Tra i primi 16 (' + pl + '°)', P.top16);

    var c = raw.cards || {};
    if (num(c.g)) add('cg', 'Cartellino giallo', num(c.g) * P.cartellinoGiallo, num(c.g) + '×');
    if (num(c.r)) add('cr', 'Cartellino rosso', num(c.r) * P.cartellinoRosso, num(c.r) + '×');
    if (num(c.n)) add('cn', 'Cartellino nero', num(c.n) * P.cartellinoNero, num(c.n) + '×');
    if (raw.stato === 'ritirato') add('rit', 'Ritirato/a durante la gara', P.ritirato);
    if (raw.stato === 'escluso') add('esc', 'Escluso/a dalla gara', P.escluso);

    var fv = 0;
    for (var j = 0; j < voci.length; j++) fv += voci[j].val;
    var coeff = num(opts.coeff, 1);
    if (coeff !== 1) {
      var extra = (fv - P.base) * (coeff - 1);
      voci.push({ k: 'coeff', label: 'Coefficiente gara ×' + coeff, val: r2(extra), det: 'applicato a bonus e malus' });
      fv += extra;
    }
    return { sv: false, fv: r2(fv), voci: voci, vinteDiretta: vinte };
  }

  function nomeTurno(r) {
    r = Number(r);
    if (r === 2) return 'finale';
    if (r === 4) return 'semifinale';
    if (r === 8) return 'quarti';
    if (r === 16) return 'ottavi';
    if (r === 32) return 'sedicesimi';
    if (r) return 'turno dei ' + r;
    return 'diretta';
  }

  // ---------------------------------------------------------- giornate/gare
  function inFinestra(iso, g) {
    var d = String(iso || '').slice(0, 10);
    return d && d >= g.dal && d <= g.al;
  }

  /** Gare (oggetti) che cadono nella finestra della giornata, in ordine cronologico. */
  function gareDellaGiornata(giornata, gare) {
    var list = [];
    for (var k in gare) {
      var g = gare[k];
      if (g && !g.escludi && inFinestra(g.data, giornata)) list.push(g);
    }
    list.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.id) < String(b.id) ? -1 : 1; });
    return list;
  }

  /**
   * Prestazione di un atleta nella giornata: prima gara in ordine cronologico
   * in cui compare (a parità di data, quella della sua categoria).
   */
  function prestazione(atleta, giornata, gare, settings, stagione) {
    var lista = gareDellaGiornata(giornata, gare);
    var fis = String(atleta.fis || atleta.id);
    var cands = [];
    for (var i = 0; i < lista.length; i++) {
      var raw = lista[i].risultati && lista[i].risultati[fis];
      if (raw && raw.stato !== 'assente') cands.push({ gara: lista[i], raw: raw });
    }
    if (!cands.length) return { sv: true, fv: null, voci: [], gara: null };
    var cat = categoriaPer(atleta.anno, stagione || stagioneDaData(giornata.dal));
    cands.sort(function (a, b) {
      if (a.gara.data !== b.gara.data) return a.gara.data < b.gara.data ? -1 : 1;
      var ma = cat && a.gara.cat === cat.code ? 0 : 1, mb = cat && b.gara.cat === cat.code ? 0 : 1;
      return ma - mb;
    });
    var scelta = cands[0];
    var res = fantavoto(scelta.raw, settings.punteggio, { coeff: scelta.gara.coeff || 1, deTouches: scelta.gara.deTouches });
    res.gara = scelta.gara;
    res.raw = scelta.raw;
    res.altre = cands.slice(1).map(function (c) { return c.gara.id; });
    return res;
  }

  // ------------------------------------------------------------- formazioni
  function contaRuoli(ids, atleti, stagione) {
    var c = { U14: 0, U20: 0, SEN: 0 };
    ids.forEach(function (id) { var a = atleti[id]; if (a) c[ruoloAtleta(a, stagione)]++; });
    return c;
  }

  function moduloDi(ids, atleti, stagione) {
    var c = contaRuoli(ids, atleti, stagione);
    return c.U14 + '-' + c.U20 + '-' + c.SEN;
  }

  /** Errori bloccanti di una formazione (array di stringhe, vuoto se valida). */
  function validaFormazione(f, rosaIds, atleti, settings, stagione) {
    var e = [];
    var set = {};
    rosaIds.forEach(function (id) { set[id] = 1; });
    var tit = (f && f.titolari) || [];
    var pan = (f && f.panchina) || [];
    if (tit.length !== settings.titolari) e.push('Servono ' + settings.titolari + ' titolari (ne hai ' + tit.length + ').');
    var seen = {};
    tit.concat(pan).forEach(function (id) {
      if (!set[id]) e.push('Atleta non in rosa: ' + id);
      if (seen[id]) e.push('Atleta schierato due volte: ' + id);
      seen[id] = 1;
    });
    if (!settings.moduloLibero && tit.length === settings.titolari) {
      var m = moduloDi(tit, atleti, stagione);
      if (settings.moduli.indexOf(m) < 0) e.push('Modulo ' + m + ' non ammesso.');
    }
    return e;
  }

  /**
   * Punteggio di squadra nella giornata.
   * formazione: { titolari:[id], panchina:[id] }
   * Ritorna { totale, righe:[{slot, id, titolare, entrato, fv, voci, sv, gara}], sostituzioni, panchina }
   */
  function punteggioSquadra(formazione, atleti, giornata, gare, settings, stagione) {
    settings = settingsCon(settings);
    var P = merge(DEFAULT_PUNTEGGIO, settings.punteggio);
    stagione = stagione || stagioneDaData(giornata.dal);
    var tit = (formazione && formazione.titolari) || [];
    var pan = (formazione && formazione.panchina) || [];
    var cache = {};
    function pr(id) {
      if (!cache[id]) cache[id] = atleti[id] ? prestazione(atleti[id], giornata, gare, settings, stagione) : { sv: true, fv: null, voci: [] };
      return cache[id];
    }
    var usati = {};
    var subs = 0;
    var righe = [];
    var sostituzioni = [];
    for (var i = 0; i < tit.length; i++) {
      var id = tit[i];
      var p = pr(id);
      if (!p.sv) { righe.push({ slot: i, id: id, titolare: id, entrato: false, fv: p.fv, voci: p.voci, gara: p.gara, raw: p.raw }); continue; }
      var sub = null;
      if (subs < settings.maxSostituzioni) {
        for (var j = 0; j < pan.length; j++) {
          var b = pan[j];
          if (usati[b]) continue;
          if (settings.sostituzioniStessoRuolo && atleti[b] && atleti[id] && ruoloAtleta(atleti[b], stagione) !== ruoloAtleta(atleti[id], stagione)) continue;
          if (!pr(b).sv) { sub = b; break; }
        }
      }
      if (sub) {
        usati[sub] = 1; subs++;
        var ps = pr(sub);
        sostituzioni.push({ esce: id, entra: sub });
        righe.push({ slot: i, id: sub, titolare: id, entrato: true, fv: ps.fv, voci: ps.voci, gara: ps.gara, raw: ps.raw });
      } else {
        righe.push({ slot: i, id: null, titolare: id, entrato: false, fv: settings.votoUfficio, voci: [], sv: true, ufficio: true });
      }
    }
    var tot = 0;
    righe.forEach(function (r) { tot += num(r.fv); });
    var panchinaRighe = pan.map(function (id) { var p = pr(id); return { id: id, fv: p.fv, sv: p.sv, usato: !!usati[id], gara: p.gara }; });
    return { totale: r2(tot), righe: righe, sostituzioni: sostituzioni, modificatori: [], panchina: panchinaRighe };
  }

  // ---------------------------------------------------------------- rose
  /**
   * Ricostruisce rose e crediti dal registro movimenti.
   * movimenti: [{ id, tipo:'asta'|'acquisto'|'manuale'|'svincolo'|'scambio'|'crediti', at, ... }]
   */
  function rose(squadreIds, movimenti, settings) {
    settings = settingsCon(settings);
    var out = {};
    squadreIds.forEach(function (t) { out[t] = { crediti: settings.crediti, rosa: [], spesi: 0, svincolati: [] }; });
    var owner = {};        // atleta -> prima squadra proprietaria
    var proprietari = {};  // atleta -> [squadre] (più di una con disponibilità a quote o multipla)
    var multi = settings.disponibilita === 'multipla' || settings.disponibilita === 'quote';
    var maxCopie = settings.disponibilita === 'quote' ? Math.max(1, num(settings.copieAtleta, 5)) : Infinity;
    function togli(id, team) {
      proprietari[id] = (proprietari[id] || []).filter(function (x) { return x !== team; });
      if (owner[id] === team) owner[id] = proprietari[id][0];
      if (!owner[id]) delete owner[id];
    }
    var ord = (movimenti || []).slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0) || (String(a.id) < String(b.id) ? -1 : 1); });
    var errori = [];
    ord.forEach(function (m) {
      if (m.annullato) return;
      if (m.tipo === 'asta' || m.tipo === 'acquisto' || m.tipo === 'manuale') {
        if (!out[m.teamId]) return;
        if (multi) {
          if ((proprietari[m.atletaId] || []).indexOf(m.teamId) >= 0) { errori.push({ m: m, err: 'atleta già in rosa' }); return; }
          if ((proprietari[m.atletaId] || []).length >= maxCopie) { errori.push({ m: m, err: 'copie esaurite' }); return; }
        } else if (owner[m.atletaId]) { errori.push({ m: m, err: 'atleta già in rosa' }); return; }
        if (!owner[m.atletaId]) owner[m.atletaId] = m.teamId;
        (proprietari[m.atletaId] = proprietari[m.atletaId] || []).push(m.teamId);
        out[m.teamId].rosa.push({ id: m.atletaId, prezzo: num(m.prezzo), dal: m.at, tipo: m.tipo });
        out[m.teamId].crediti -= num(m.prezzo);
        out[m.teamId].spesi += num(m.prezzo);
      } else if (m.tipo === 'svincolo') {
        var t = out[m.teamId];
        if (!t || (proprietari[m.atletaId] || []).indexOf(m.teamId) < 0) { errori.push({ m: m, err: 'atleta non in rosa' }); return; }
        var pagato = t.rosa.filter(function (x) { return x.id === m.atletaId; })[0];
        // rimborso pieno (listone, composizione delle rose): l'acquisto è come annullato e non conta tra i crediti spesi
        var pieno = !!pagato && pagato.tipo !== 'scambio' && num(m.rimborso) >= num(pagato.prezzo);
        if (pieno) t.spesi -= num(pagato.prezzo);
        t.rosa = t.rosa.filter(function (x) { return x.id !== m.atletaId; });
        togli(m.atletaId, m.teamId);
        t.crediti += num(m.rimborso);
        // pieno (solo listone): tolto con tutti i crediti indietro, si può ricomprare anche nella stessa sessione di mercato
        t.svincolati.push({ id: m.atletaId, sessione: m.sessione || 0, pieno: pieno && settings.disponibilita === 'multipla' });
      } else if (m.tipo === 'scambio') {
        var A = out[m.teamA], B = out[m.teamB];
        if (!A || !B) return;
        var possiede = function (team, id) { return (proprietari[id] || []).indexOf(team) >= 0; };
        var okA = (m.daA || []).every(function (id) { return possiede(m.teamA, id) && !possiede(m.teamB, id); });
        var okB = (m.daB || []).every(function (id) { return possiede(m.teamB, id) && !possiede(m.teamA, id); });
        if (!okA || !okB) { errori.push({ m: m, err: 'scambio non più valido' }); return; }
        var mov = function (from, to, ids) {
          ids.forEach(function (id) {
            var it = from.rosa.filter(function (x) { return x.id === id; })[0];
            from.rosa = from.rosa.filter(function (x) { return x.id !== id; });
            to.rosa.push({ id: id, prezzo: it ? it.prezzo : 0, dal: m.at, tipo: 'scambio' });
          });
        };
        mov(A, B, m.daA || []); mov(B, A, m.daB || []);
        (m.daA || []).forEach(function (id) { togli(id, m.teamA); (proprietari[id] = proprietari[id] || []).push(m.teamB); if (!owner[id]) owner[id] = m.teamB; });
        (m.daB || []).forEach(function (id) { togli(id, m.teamB); (proprietari[id] = proprietari[id] || []).push(m.teamA); if (!owner[id]) owner[id] = m.teamA; });
        A.crediti -= num(m.creditiAversoB); B.crediti += num(m.creditiAversoB);
      } else if (m.tipo === 'crediti') {
        if (out[m.teamId]) out[m.teamId].crediti += num(m.delta);
      }
    });
    return { squadre: out, proprietario: owner, proprietari: proprietari, errori: errori };
  }

  /** Offerta massima consentita: devo poter completare la rosa con l'offerta minima. */
  function offertaMassima(squadra, settings, atleta, atleti, stagione) {
    settings = settingsCon(settings);
    var mancanti = settings.rosa - squadra.rosa.length;
    if (mancanti <= 0) return 0;
    if (atleta && atleti) {
      var r = ruoloAtleta(atleta, stagione);
      var lim = settings.ruoliRosa[r];
      var nr = squadra.rosa.filter(function (x) { return atleti[x.id] && ruoloAtleta(atleti[x.id], stagione) === r; }).length;
      if (lim && nr >= lim[1]) return 0;
      // posti obbligatori ancora da riempire negli altri ruoli
      var obbligati = 0;
      ORDINE_RUOLI.forEach(function (rr) {
        var l = settings.ruoliRosa[rr];
        if (!l) return;
        var n = squadra.rosa.filter(function (x) { return atleti[x.id] && ruoloAtleta(atleti[x.id], stagione) === rr; }).length;
        if (rr === r) n++;
        obbligati += Math.max(0, l[0] - n);
      });
      if (obbligati > mancanti - 1) return 0;
    }
    return Math.max(0, squadra.crediti - (mancanti - 1) * settings.offertaMinima);
  }

  // ------------------------------------------------------------- classifica
  /**
   * esiti: { [n]: { [teamId]: totale } } per le giornate giocate (ufficiali o provvisorie).
   */
  function classifica(teamIds, esiti, settings) {
    settings = settingsCon(settings);
    var rows = {};
    teamIds.forEach(function (t) { rows[t] = { id: t, punti: 0, fantapunti: 0, giocate: 0, vinte: 0, migliore: null, ultimi: [] }; });
    var ns = Object.keys(esiti).map(Number).sort(function (a, b) { return a - b; });
    ns.forEach(function (n) {
      var e = esiti[n];
      var ids = teamIds.filter(function (t) { return e[t] !== undefined && e[t] !== null; });
      if (!ids.length) return;
      var max = Math.max.apply(null, ids.map(function (t) { return e[t]; }));
      var ordinati = ids.slice().sort(function (a, b) { return e[b] - e[a]; });
      ids.forEach(function (t) {
        var r = rows[t];
        var v = num(e[t]);
        r.fantapunti = r2(r.fantapunti + v);
        r.giocate++;
        if (v === max) r.vinte++;
        r.migliore = r.migliore === null ? v : Math.max(r.migliore, v);
        // posizione di giornata con pari merito
        var pos = 1 + ordinati.filter(function (o) { return e[o] > v; }).length;
        r.ultimi.push({ n: n, v: v, pos: pos, di: ids.length });
        if (settings.classifica === 'f1') r.punti += settings.puntiF1[pos - 1] || 0;
      });
    });
    var list = teamIds.map(function (t) { var r = rows[t]; if (settings.classifica !== 'f1') r.punti = r.fantapunti; r.media = r.giocate ? r2(r.fantapunti / r.giocate) : 0; return r; });
    list.sort(function (a, b) {
      return b.punti - a.punti || b.fantapunti - a.fantapunti || b.vinte - a.vinte || num(b.migliore) - num(a.migliore);
    });
    var pos = 0, prev = null;
    list.forEach(function (r, i) {
      var key = r.punti + '|' + r.fantapunti + '|' + r.vinte + '|' + r.migliore;
      if (key !== prev) pos = i + 1;
      r.pos = pos; prev = key;
    });
    return list;
  }

  // --------------------------------------------------------- statistiche
  /** Storico di un atleta su tutte le gare: [{gara, fv, voci}] + medie. */
  function statisticheAtleta(atleta, gare, settings, stagione) {
    settings = settingsCon(settings);
    var fis = String(atleta.fis || atleta.id);
    var storico = [];
    for (var k in gare) {
      var g = gare[k];
      if (stagione && stagioneDaData(g.data) !== stagione) continue;
      var raw = g.risultati && g.risultati[fis];
      if (!raw || raw.stato === 'assente') continue;
      var f = fantavoto(raw, settings.punteggio, { coeff: g.coeff || 1, deTouches: g.deTouches });
      storico.push({ gara: g, raw: raw, fv: f.fv, voci: f.voci });
    }
    storico.sort(function (a, b) { return a.gara.data < b.gara.data ? 1 : -1; });
    var n = storico.length;
    var fm = n ? storico.reduce(function (s, x) { return s + x.fv; }, 0) / n : 0;
    var vg = 0, sg = 0, vd = 0, podi = 0, ori = 0;
    storico.forEach(function (x) {
      if (x.raw.girone) { vg += num(x.raw.girone.v); sg += num(x.raw.girone.s); }
      vd += (x.raw.de || []).filter(function (b) { return b.v; }).length;
      if (x.raw.place && x.raw.place <= 3) podi++;
      if (x.raw.place === 1) ori++;
    });
    return { storico: storico, presenze: n, fm: r2(fm), vittorieGirone: vg, sconfitteGirone: sg, vittorieDiretta: vd, podi: podi, ori: ori,
      pctGirone: (vg + sg) ? r2(100 * vg / (vg + sg)) : 0 };
  }

  /**
   * Quotazione iniziale (crediti) dalla fantamedia e dalla continuità.
   * Qt = 1 + 0.3 × (FM − 5)² × continuità, dove continuità = presenze/6 (max 1).
   * Chi quest'anno sale di fascia (es. da Under 14 a Under 20) vale il 40% in meno.
   */
  function quotazione(stat, settings, opts) {
    if (!stat || !stat.presenze) return 1;
    var sopra = Math.max(0, stat.fm - 5);
    var cont = Math.min(1, stat.presenze / 6);
    var q = 1 + 0.3 * sopra * sopra * cont;
    if (opts && opts.saltoCategoria) q *= 0.6;
    return Math.max(1, Math.min(60, Math.round(q)));
  }

  /**
   * Quotazione attuale (Qt.A): media tra la quotazione iniziale e il valore dato dalla
   * fantamedia della stagione in corso (con almeno 2 presenze); mai sotto metà della Qt.I.
   */
  function quotazioneAttuale(qtI, statStagione) {
    qtI = Math.max(1, num(qtI, 1));
    if (!statStagione || statStagione.presenze < 2) return qtI;
    var qs = quotazione(statStagione);
    return Math.max(Math.ceil(qtI / 2), Math.min(60, Math.round((qtI + qs) / 2)));
  }

  /**
   * Quotazioni "eque": il prezzo segue i punti che ci si può aspettare da un atleta in una giornata,
   * misurati rispetto a un atleta "di riserva" (valore sopra il rimpiazzo, come nei fantasy sportivi).
   *  1. FM affidabile: fantamedia delle ultime due stagioni avvicinata a un valore prudente quando le gare
   *     sono poche (chi ha 2 gare non vale come chi ne ha 12). Il valore prudente è il 30° percentile
   *     delle fantamedie del listone: chi non ha dati parte da "riserva", non da "media".
   *  2. Salto di categoria (es. da Under 14 a Under 20): la FM si avvicina del 30% al valore prudente,
   *     perché quest'anno affronta avversari più grandi.
   *  3. Presenza (peso `espPresenza`, oggi 0): quota dei mesi con gare della sua categoria in cui ha
   *     gareggiato. Con peso 0 non entra nel prezzo: chi fa poche gare è già penalizzato al punto 1
   *     (FM meno affidabile) e non va penalizzato due volte. Resta calcolata e mostrata.
   *  4. Valore = FM affidabile × presenza^espPresenza; Qt = 1 + (QT_MAX − 1) × (valore − rimpiazzo) / (massimo − rimpiazzo),
   *     dove il rimpiazzo è il 25° percentile del listone. Sotto il rimpiazzo la Qt è 1.
   */
  var QT_PARAM = { k: 3, salto: 0.7, priorPct: 0.3, priorP: 0.6, kp: 3, replPct: 0.25, qtMax: 30, espPresenza: 0 };
  function percentile(arr, q) { if (!arr.length) return null; var a = arr.slice().sort(function (x, y) { return x - y; }); return a[Math.min(a.length - 1, Math.floor(a.length * q))]; }
  function valutaQuotazioni(atleti, gare, settings, stagione, param) {
    settings = settingsCon(settings);
    var Q = merge(QT_PARAM, param || {});
    var lista = Object.keys(atleti).map(function (k) { return atleti[k]; }).filter(function (a) { return a && a.attivo !== false; });
    function mesi(st) { var o = {}; st.storico.forEach(function (x) { o[String(x.gara.data).slice(0, 7)] = 1; }); return Object.keys(o).length; }
    var mesiStag = function (y) { var o = {}; Object.keys(gare).forEach(function (k) { var g = gare[k]; if (g && stagioneDaData(g.data) === y) o[String(g.data).slice(0, 7)] = 1; }); return Object.keys(o).length; };
    // mesi in cui c'erano gare della categoria dell'atleta (le gare Assoluti o Master sono meno di quelle
    // Under 14: la presenza si misura sulle occasioni reali, non su tutti i mesi della stagione)
    var mesiCat = {};
    Object.keys(gare).forEach(function (k) {
      var g = gare[k];
      if (!g || !g.data) return;
      var y = stagioneDaData(g.data), m = String(g.data).slice(0, 7);
      var cat = g.cat || '';
      (mesiCat[y + ':' + cat] = mesiCat[y + ':' + cat] || {})[m] = 1;
    });
    function occasioni(a, y, st) {
      var c = categoriaPer(a.anno, y);
      var o = {};
      ((c && c.gare) || []).forEach(function (code) { Object.keys(mesiCat[y + ':' + code] || {}).forEach(function (m) { o[m] = 1; }); });
      st.storico.forEach(function (x) { o[String(x.gara.data).slice(0, 7)] = 1; }); // anche le gare fuori categoria che ha fatto
      var n = Object.keys(o).length;
      return n || mesiStag(y);
    }
    var righe = lista.map(function (a) {
      var p = statisticheAtleta(a, gare, settings, stagione - 1), c = statisticheAtleta(a, gare, settings, stagione);
      return { a: a, p: p, c: c, n: p.presenze + c.presenze, mp: mesi(p), mc: mesi(c), op: occasioni(a, stagione - 1, p), oc: occasioni(a, stagione, c) };
    });
    var fmConDati = righe.filter(function (r) { return r.n >= 3; }).map(function (r) { return (r.p.fm * r.p.presenze + r.c.fm * r.c.presenze) / r.n; });
    var priorFM = percentile(fmConDati, Q.priorPct);
    if (priorFM === null) priorFM = settingsCon(settings).punteggio.base + 1;
    righe.forEach(function (r) {
      var fm = (r.p.fm * r.p.presenze + r.c.fm * r.c.presenze + priorFM * Q.k) / (r.n + Q.k);
      r.salto = r.p.presenze > 0 && ruoloAtleta({ anno: r.a.anno, ruolo: r.a.ruolo }, stagione - 1) !== ruoloAtleta(r.a, stagione);
      if (r.salto) fm = priorFM + (fm - priorFM) * Q.salto;
      var oss = (r.p.presenze ? r.op : 0) + r.oc;
      r.pres = Math.max(0.2, Math.min(1, (r.mp + r.mc + Q.priorP * Q.kp) / (oss + Q.kp)));
      r.fmAdj = fm;
      r.valore = fm * Math.pow(r.pres, Q.espPresenza);
    });
    var rimpiazzo = percentile(righe.map(function (r) { return r.valore; }), Q.replPct) || 0;
    var maxSopra = Math.max.apply(null, [0].concat(righe.map(function (r) { return r.valore - rimpiazzo; })));
    var out = {};
    righe.forEach(function (r) {
      var sopra = Math.max(0, r.valore - rimpiazzo);
      out[r.a.fis] = {
        qt: maxSopra > 0 ? Math.round(1 + (Q.qtMax - 1) * sopra / maxSopra) : 1,
        fmAffidabile: r2(r.fmAdj), presenza: r2(r.pres), valore: r2(r.valore), salto: r.salto, gare: r.n,
      };
    });
    return { atleti: out, fmPrudente: r2(priorFM), rimpiazzo: r2(rimpiazzo), param: Q };
  }

  /** Quante squadre possono ancora prendere l'atleta (Infinity con il listone a budget fisso). */
  function copieLibere(settings, proprietari, atletaId) {
    settings = settingsCon(settings);
    var n = (proprietari[atletaId] || []).length;
    if (settings.disponibilita === 'multipla') return Infinity;
    if (settings.disponibilita === 'quote') return Math.max(0, Math.max(1, num(settings.copieAtleta, 5)) - n);
    return n ? 0 : 1;
  }

  /**
   * Asta a quote: rosa e copie per atleta consigliate per `nSquadre` con `nAtleti` attivi. La rosa è la più
   * grande fino a 8 (oltre si guadagna poco: simulazione sulla stagione 2025-26), le copie il minimo che
   * copre tutti i posti lasciando circa il 15% di copie libere per il mercato.
   */
  function quoteConsigliate(nAtleti, nSquadre, titolari) {
    titolari = titolari || 5;
    if (!nAtleti || !nSquadre) return { rosa: 8, copie: 5 };
    var rosa = Math.max(titolari + 1, Math.min(8, titolari + 3));
    var copie = Math.max(1, Math.ceil((nSquadre * rosa * 1.15) / nAtleti));
    return { rosa: rosa, copie: Math.min(copie, nSquadre) };
  }

  /**
   * Dimensione di rosa consigliata con disponibilità singola: lascia almeno ~10% di svincolati
   * per il mercato. Se non si arriva ai titolari, serve la disponibilità multipla.
   */
  function rosaConsigliata(nAtleti, nSquadre, titolari) {
    titolari = titolari || 5;
    if (!nSquadre) return { rosa: 7, multipla: false };
    var r = Math.min(9, Math.floor((nAtleti * 0.9) / nSquadre));
    if (r < titolari) return { rosa: Math.min(9, Math.max(titolari + 2, 7)), multipla: true };
    return { rosa: r, multipla: false };
  }

  // ------------------------------------------------------- modalità di gioco
  /** Modalità della lega: 'copie' (asta a copie, anche la vecchia 'singola') o 'listone' (listone a budget fisso). */
  function modalita(settings) { return settings && settings.disponibilita === 'multipla' ? 'listone' : 'copie'; }

  /** In quante squadre può stare lo stesso atleta: copieAtleta con l'asta a copie, 1 con la vecchia 'singola', Infinity con il listone. */
  function copiePerAtleta(settings) {
    var d = settings && settings.disponibilita;
    if (d === 'multipla') return Infinity;
    if (d === 'singola') return 1;
    return Math.max(1, Math.round(num(settings && settings.copieAtleta, 5)) || 1);
  }

  /**
   * Listone a budget fisso: crediti consigliati per squadra. Il 75% di quanto costerebbe la "squadra dei sogni"
   * (i `titolari` più quotati + la panchina al prezzo più basso), arrotondato a 5; mai sotto il costo del più
   * quotato con il resto della rosa al minimo. Simulazione sulla stagione 2025-26 (rosa 7, 8 e 9, 24 listoni di
   * prova): così i 5 migliori non stanno nel budget, i due campioni sì ma a caro prezzo, e comprare il primo della
   * lista è una scelta e non un obbligo. Con più crediti le squadre finiscono per avere tutte gli stessi titolari.
   * qts: quotazioni (Qt.A) degli atleti attivi. Oggi: 0,75 × (106 + 3) → 80.
   */
  var QUOTA_LISTONE = 0.75;
  function budgetListoneConsigliato(qts, rosa, titolari) {
    rosa = Math.max(1, Math.round(num(rosa, 8)) || 8);
    titolari = Math.max(1, Math.min(rosa, Math.round(num(titolari, 5)) || 5));
    var q = (qts || []).map(function (x) { return Math.max(1, Math.round(num(x, 1))); }).sort(function (a, b) { return b - a; });
    if (q.length < rosa) return 10 * rosa;
    function somma(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
    var sogni = somma(q.slice(0, titolari)) + somma(q.slice(q.length - (rosa - titolari)));
    var minimo = q[0] + somma(q.slice(q.length - (rosa - 1)));
    return Math.max(5 * Math.round(QUOTA_LISTONE * sogni / 5), 5 * Math.ceil(minimo / 5));
  }

  /** Quanto costa la "squadra dei sogni": i `titolari` più quotati e la panchina al prezzo più basso. */
  function costoSquadraSogni(qts, rosa, titolari) {
    rosa = Math.max(1, Math.round(num(rosa, 8)) || 8);
    titolari = Math.max(1, Math.min(rosa, Math.round(num(titolari, 5)) || 5));
    var q = (qts || []).map(function (x) { return Math.max(1, Math.round(num(x, 1))); }).sort(function (a, b) { return b - a; });
    var top = q.slice(0, titolari).reduce(function (s, x) { return s + x; }, 0);
    var panca = q.slice(Math.max(titolari, q.length - (rosa - titolari))).reduce(function (s, x) { return s + x; }, 0);
    return { titolari: top, panchina: panca, totale: top + panca };
  }

  /**
   * Regole consigliate per una modalità (da fondere nelle impostazioni della lega).
   * ctx: { qts: Qt.A degli atleti attivi, nAtleti, nSquadre (0 = non si sa ancora), titolari }.
   *  - 'copie':   asta a copie, 120 crediti, rosa e copie per atleta da quoteConsigliate.
   *  - 'listone': niente asta, budget da budgetListoneConsigliato, rosa 8 (5 + 3: con la panchina più lunga non si
   *    guadagna nulla), prezzo sempre la quotazione (a 1 credito il budget non conterebbe), offerta minima 1 (il prezzo
   *    più basso del listone) e rimborso allo svincolo del 50% (con un rimborso più alto conviene cambiare atleti a ogni
   *    giornata inseguendo il calendario delle gare).
   */
  function impostazioniModalita(modo, ctx) {
    ctx = ctx || {};
    var T = Math.max(1, Math.round(num(ctx.titolari, DEFAULT_SETTINGS.titolari)) || DEFAULT_SETTINGS.titolari);
    var qts = ctx.qts || [];
    var nAtleti = num(ctx.nAtleti, 0) || qts.length;
    if (modo === 'listone') {
      var rosa = Math.max(T + 1, Math.min(8, T + 3));
      return { disponibilita: 'multipla', crediti: budgetListoneConsigliato(qts, rosa, T), rosa: rosa, prezzoSvincolati: 'quotazione', offertaMinima: 1, rimborsoSvincolo: 0.5 };
    }
    var q = quoteConsigliate(nAtleti, num(ctx.nSquadre, 0), T);
    return { disponibilita: 'quote', crediti: DEFAULT_SETTINGS.crediti, rosa: q.rosa, copieAtleta: q.copie };
  }

  // ------------------------------------------------------------ utilità
  /** Ordine dei turni d'asta a chiamata (serpentina o rotazione). */
  function prossimoChiamante(ordine, idx, roseInfo, settings) {
    settings = settingsCon(settings);
    for (var k = 1; k <= ordine.length; k++) {
      var j = (idx + k) % ordine.length;
      var t = roseInfo[ordine[j]];
      if (t && t.rosa.length < settings.rosa) return j;
    }
    return -1;
  }

  var api = {
    CATEGORIE: CATEGORIE, RUOLI: RUOLI, ORDINE_RUOLI: ORDINE_RUOLI,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, DEFAULT_PUNTEGGIO: DEFAULT_PUNTEGGIO,
    settingsCon: settingsCon, merge: merge,
    stagioneDaData: stagioneDaData, categoriaPer: categoriaPer, ruoloAtleta: ruoloAtleta,
    fantavoto: fantavoto, nomeTurno: nomeTurno,
    gareDellaGiornata: gareDellaGiornata, prestazione: prestazione,
    contaRuoli: contaRuoli, moduloDi: moduloDi, validaFormazione: validaFormazione,
    punteggioSquadra: punteggioSquadra, rose: rose, offertaMassima: offertaMassima,
    classifica: classifica, statisticheAtleta: statisticheAtleta, quotazione: quotazione, quotazioneAttuale: quotazioneAttuale,
    prossimoChiamante: prossimoChiamante, rosaConsigliata: rosaConsigliata, quoteConsigliate: quoteConsigliate, copieLibere: copieLibere, valutaQuotazioni: valutaQuotazioni, QT_PARAM: QT_PARAM, r2: r2,
    modalita: modalita, copiePerAtleta: copiePerAtleta, budgetListoneConsigliato: budgetListoneConsigliato, costoSquadraSogni: costoSquadraSogni,
    impostazioniModalita: impostazioniModalita, QUOTA_LISTONE: QUOTA_LISTONE,
  };
  root.FSEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
