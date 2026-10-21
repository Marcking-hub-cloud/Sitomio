/* Fantascherma — backend finto per lo sviluppo locale.
 * Si attiva SOLO quando la pagina non gira dentro claude.ai (window.claude assente):
 * imita le API `db` e `user` delle capability usando localStorage, con sincronizzazione
 * tra schede (evento "storage"), così si può provare il multiplayer aprendo più schede
 * con ?u=u_dev1, ?u=u_dev2, ...
 */
(function (root) {
  'use strict';
  var KEY = 'fsmock:db';
  var LKEY = 'fsmock:lease';

  // localStorage può mancare o lanciare (navigazione privata, anteprime): si ripiega su una copia in memoria
  var mem = {};
  function getItem(k) { try { var v = localStorage.getItem(k); return v === null && k in mem ? mem[k] : v; } catch (e) { return k in mem ? mem[k] : null; } }
  function setItem(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { } }
  function removeItem(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { } }
  function load() { try { return JSON.parse(getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(d) { setItem(KEY, JSON.stringify(d)); }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function segs(p) { return String(p).split('/').filter(Boolean); }
  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  var listeners = [];
  function notify() { listeners.slice().forEach(function (l) { try { l(); } catch (e) { console.error(e); } }); }
  window.addEventListener('storage', function (ev) { if (ev.key === KEY) notify(); });

  function deepMerge(a, b) {
    var out = clone(a) || {};
    Object.keys(b).forEach(function (k) {
      var v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v);
      else out[k] = clone(v);
    });
    return out;
  }

  function snap(path, data) {
    var d = data === undefined ? undefined : Object.freeze(clone(data));
    return { id: segs(path).slice(-1)[0], exists: d !== undefined, data: function () { return d; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }

  function delay(fn) { return new Promise(function (res, rej) { setTimeout(function () { try { res(fn()); } catch (e) { rej(e); } }, 15 + Math.random() * 40); }); }

  function docRef(path) {
    var s = segs(path);
    if (s.length % 2 !== 0) throw new TypeError('document path needs an even number of segments: ' + path);
    path = s.join('/');
    return {
      id: s[s.length - 1], path: path,
      get: function () { return delay(function () { return snap(path, load()[path]); }); },
      set: function (data) { return delay(function () { var d = load(); d[path] = clone(data); save(d); notify(); }); },
      update: function (data) {
        return delay(function () {
          var d = load();
          if (d[path] === undefined) { var e = new Error('missing'); e.code = 'invalid_argument'; throw e; }
          d[path] = deepMerge(d[path], data); save(d); notify();
        });
      },
      delete: function () { return delay(function () { var d = load(); delete d[path]; save(d); notify(); }); },
      acquire: function (opts) {
        return delay(function () {
          var all = {}; try { all = JSON.parse(getItem(LKEY) || '{}'); } catch (e) { }
          var l = all[path]; var now = Date.now();
          if (l && l.exp > now && l.holder !== opts.holder) return { acquired: false, expiresAt: new Date(l.exp).toISOString() };
          var ttl = Math.max(1000, Math.min(600000, opts.ttlMs || 30000));
          all[path] = { holder: opts.holder, exp: now + ttl };
          setItem(LKEY, JSON.stringify(all));
          return { acquired: true, version: now, expiresAt: new Date(now + ttl).toISOString(), holder: opts.holder };
        });
      },
      release: function (holder) {
        return delay(function () {
          var all = {}; try { all = JSON.parse(getItem(LKEY) || '{}'); } catch (e) { }
          if (all[path] && all[path].holder === holder) { delete all[path]; setItem(LKEY, JSON.stringify(all)); }
        });
      },
      onSnapshot: function (next) {
        var last;
        function fire() { var v = JSON.stringify(load()[path]); if (v === last) return; last = v; next(snap(path, load()[path])); }
        listeners.push(fire); setTimeout(fire, 10);
        return function () { listeners = listeners.filter(function (l) { return l !== fire; }); };
      },
      collection: function (sub) { return collRef(path + '/' + sub); },
    };
  }

  function collRef(path, filters, order, lim) {
    var s = segs(path);
    if (s.length % 2 !== 1) throw new TypeError('collection path needs an odd number of segments: ' + path);
    path = s.join('/');
    filters = filters || [];
    function run() {
      var d = load(); var out = [];
      Object.keys(d).forEach(function (k) {
        var ks = segs(k);
        if (ks.length === s.length + 1 && k.indexOf(path + '/') === 0) {
          var v = d[k];
          var ok = filters.every(function (f) {
            var x = v[f[0]];
            switch (f[1]) {
              case '==': return x === f[2];
              case '!=': return x !== f[2];
              case '<': return x < f[2];
              case '<=': return x <= f[2];
              case '>': return x > f[2];
              case '>=': return x >= f[2];
              case 'in': return f[2].indexOf(x) >= 0;
              case 'array-contains': return Array.isArray(x) && x.indexOf(f[2]) >= 0;
              default: return true;
            }
          });
          if (ok) out.push({ k: k, v: v });
        }
      });
      out.sort(function (a, b) {
        if (order) {
          var x = a.v[order[0]], y = b.v[order[0]];
          var c = x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1;
          return order[1] === 'desc' ? -c : c;
        }
        return a.k < b.k ? -1 : 1;
      });
      if (lim) out = out.slice(0, lim);
      var docs = out.map(function (o) { return snap(o.k, o.v); });
      return { docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: { fromCache: false, hasPendingWrites: false } };
    }
    return {
      path: path,
      doc: function (id) { return docRef(path + '/' + (id || rid())); },
      add: function (data) { var r = docRef(path + '/' + rid()); return r.set(data).then(function () { return r; }); },
      where: function (f, op, v) { return collRef(path, filters.concat([[f, op, v]]), order, lim); },
      orderBy: function (f, dir) { return collRef(path, filters, [f, dir || 'asc'], lim); },
      limit: function (n) { return collRef(path, filters, order, n); },
      get: function () { return delay(run); },
      onSnapshot: function (next) {
        var last;
        function fire() { var r = run(); var v = JSON.stringify(r.docs.map(function (d) { return [d.id, d.data()]; })); if (v === last) return; last = v; next(r); }
        listeners.push(fire); setTimeout(fire, 10);
        return function () { listeners = listeners.filter(function (l) { return l !== fire; }); };
      },
    };
  }

  var NOMI = { u_dev1: 'Leone', u_dev2: 'Giulia', u_dev3: 'Marco', u_dev4: 'Sara', u_dev5: 'Pietro', u_dev6: 'Anna' };
  var COLORI = ['#3b5bdb', '#e8590c', '#2f9e44', '#c2255c', '#7048e8', '#0c8599'];
  function avatar(name, color) {
    var ini = (name || '?').slice(0, 1).toUpperCase();
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="' + color + '"/><text x="32" y="41" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#fff">' + ini + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  function profile(id, me) {
    var n = NOMI[id] || ('Giocatore ' + String(id).slice(-2));
    var i = Object.keys(NOMI).indexOf(id);
    var col = COLORI[(i < 0 ? 0 : i) % COLORI.length];
    return { id: id, name: n, avatarUrl: avatar(n, col), color: col, email: null, isMe: id === me, guest: false };
  }

  function create() {
    var q = new URLSearchParams(location.search);
    var uid = q.get('u') || getItem('fsmock:uid') || 'u_dev1';
    var readonly = q.get('ro') === '1';
    var user = {
      isOwner: function () { return Promise.resolve(uid === 'u_dev1'); },
      canEdit: function () { return Promise.resolve(!readonly); },
      can: function (n) { return Promise.resolve(n === 'data.write' ? !readonly : null); },
      id: function () { return Promise.resolve(uid); },
      me: function () { var p = profile(uid, uid); return Promise.resolve({ id: uid, name: p.name, avatarUrl: p.avatarUrl, color: p.color, email: null, isOwner: uid === 'u_dev1', canEdit: !readonly }); },
      profiles: function (ids) { var o = {}; [].concat(ids).forEach(function (id) { o[id] = profile(id, uid); }); return Promise.resolve(o); },
      search: function () { return Promise.resolve([]); },
    };
    var db = { doc: docRef, collection: collRef };
    return { db: db, user: user, uid: uid, readonly: readonly };
  }

  /** Carica un seed {path: data} nel db finto se è vuoto (o se forzato). */
  function seed(docs, force) {
    var d = load();
    if (!force && Object.keys(d).length) return false;
    Object.keys(docs).forEach(function (k) { d[k] = docs[k]; });
    save(d); notify();
    return true;
  }
  function reset() { removeItem(KEY); removeItem(LKEY); notify(); }
  /** Cambia il giocatore della demo (vale dal prossimo caricamento della pagina). */
  function setUser(uid) { setItem('fsmock:uid', uid); }

  root.FSMock = { create: create, seed: seed, reset: reset, dump: load, setUser: setUser, NOMI: NOMI };
})(window);
