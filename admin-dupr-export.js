/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: resultados del torneo para DUPR
   (§126) · 24 nov 2026
   Botón "DUPR results" en la página del torneo (tournament.js). Sólo
   funciona con el torneo Completed. Descarga un CSV con las columnas y el
   orden exactos de la plantilla de DUPR (single-match-import.csv).

   Aprobado (1A 2A 3A 4B 5A 6A 7A 8A):
   · CSV, como la plantilla (separado por comas, saltos de línea \n).
   · Sólo partidos jugados y terminados: fuera forfeits/retiros
     (forfeit_team_id), byes y pendientes.
   · Antes de descargar se avisa quién no tiene DUPR ID; si descarga
     igual, su DUPR ID va vacío.
   · Un equipo que no tiene exactamente 2 jugadores (1 en singles):
     ese partido queda fuera, con aviso.
   · location = LUGAR (fija); scoreType = SIDEOUT.
   · Fecha: el día (hora de Florida) en que terminó el partido si se
     guardó (Auto Courts); si no, la fecha del torneo.
   Sólo lee: no cambia nada en la base.
   Depende de: db.js (api, toast, confirmModal).
   ============================================================ */

(function () {
  'use strict';

  /* La dirección que se manda a DUPR (5A), tal como la dio la dueña (24 nov). */
  const LUGAR = 'Patch Reef Tennis Center, Northwest 51st Street, Boca Raton, FL, USA';

  const COLUMNAS = [
    'matchType', 'event', 'date',
    'playerA1', 'playerA1DuprId', 'playerA1ExternalId',
    'playerA2', 'playerA2DuprId', 'playerA2ExternalId',
    'playerB1', 'playerB1DuprId', 'playerB1ExternalId',
    'playerB2', 'playerB2DuprId', 'playerB2ExternalId',
    'teamAGame1', 'teamBGame1', 'teamAGame2', 'teamBGame2', 'teamAGame3', 'teamBGame3',
    'teamAGame4', 'teamBGame4', 'teamAGame5', 'teamBGame5',
    'location', 'scoreType',
  ];

  const esSingles = (nombre) => /singles/i.test(String(nombre || ''));
  /* Sólo números enteros de verdad (11 o "11"); nada de " ", true, "0x0B"… */
  const entero = (v) => (Number.isInteger(v) && v >= 0 ? v : (typeof v === 'string' && /^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : NaN));
  const esEntero = (n) => Number.isInteger(n) && n >= 0;

  /* El día del club (Florida) de una fecha con hora. */
  const diaClub = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  };

  /* Un campo del CSV. Entre comillas si lleva coma, comillas o salto de
     línea (como la dirección de la plantilla). Un texto que empieza por
     = + @ se abriría en Excel como fórmula: se le pone ' delante. */
  const campo = (v) => {
    let s = String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n');
    if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  /* Los games de un partido: [[a, b], …] o null si no se pueden usar.
     · Con games guardados (best-of): se usan sólo si cuadran con el
       resultado guardado (games ganados = score_a/score_b) y el último game
       lo gana quien ganó el partido (nada jugado después de decidirse).
       Si no cuadran, los games son viejos (p. ej. se cambió a un solo game
       y se corrigió el marcador): manda score_a/score_b.
     · Un solo game: score_a/score_b son puntos. Si el ganador tiene menos
       de 5, son games GANADOS de un best-of sin los games (2–1): fuera. */
  function gamesDe(m) {
    const a = entero(m.score_a), b = entero(m.score_b);
    const lista = Array.isArray(m.games) ? m.games : [];
    if (lista.length) {
      const g = lista.map((x) => [entero(x && x.score_a), entero(x && x.score_b)]);
      const sano = g.length <= 5 && g.every(([x, y]) => esEntero(x) && esEntero(y) && x !== y);
      if (sano) {
        const ganaA = g.filter(([x, y]) => x > y).length, ganaB = g.length - ganaA;
        const ultimo = g[g.length - 1];
        const cuadra = ganaA !== ganaB && (ultimo[0] > ultimo[1]) === (ganaA > ganaB)
          && (!esEntero(a) || !esEntero(b) || (a === ganaA && b === ganaB));
        if (cuadra) return g;
      }
    }
    if (!esEntero(a) || !esEntero(b) || a === b || Math.max(a, b) < 5) return null;
    return [[a, b]];
  }

  /* El corazón: con los datos leídos arma las filas y los avisos.
     datos = { torneo, categorias, equipos, rr, bracket, jugadores } */
  function armar(datos) {
    const { torneo, categorias, equipos, rr, bracket, jugadores } = datos;
    const catPorId = new Map(categorias.map((c) => [Number(c.id), c]));
    const eqPorId = new Map(equipos.map((e) => [Number(e.id), e]));
    const jugPorId = new Map(jugadores.map((p) => [Number(p.id), p]));
    const filas = [];
    const fuera = { forfeit: 0, equipo: 0, marcador: 0, fecha: 0, falta: 0 };
    const sinDupr = new Map();   // id → nombre (sólo de los partidos que van)

    const integrantes = (equipo) => (equipo
      ? [equipo.player1_id, equipo.player2_id, equipo.player3_id, equipo.player4_id].filter((x) => x !== null && x !== undefined)
      : []);

    const persona = (id) => {
      const p = jugPorId.get(Number(id));
      if (!p) return null;
      const nombre = `${String(p.first_name || '').trim()} ${String(p.last_name || '').trim()}`.replace(/\s+/g, ' ').trim();
      return [nombre, String(p.dupr_id || '').trim(), String(p.id)];
    };

    const partidos = [
      ...rr.map((m) => ({ ...m, fase: 'rr' })),
      ...bracket.map((m) => ({ ...m, fase: 'bracket' })),
    ];
    for (const m of partidos) {
      if (m.status !== 'completed') continue;   // pendientes y byes
      if (m.forfeit_team_id !== null && m.forfeit_team_id !== undefined) { fuera.forfeit++; continue; }
      const cat = catPorId.get(Number(m.category_id));
      if (!cat) continue;
      const singles = esSingles(cat.name);
      const cuantos = singles ? 1 : 2;
      const eqA = eqPorId.get(Number(m.team_a_id)), eqB = eqPorId.get(Number(m.team_b_id));
      if (!eqA || !eqB) { fuera.falta++; continue; }
      const ladoA = integrantes(eqA), ladoB = integrantes(eqB);
      if (ladoA.length !== cuantos || ladoB.length !== cuantos) { fuera.equipo++; continue; }
      const games = gamesDe(m);
      if (!games) { fuera.marcador++; continue; }
      const fecha = (m.finished_at && diaClub(m.finished_at)) || String(torneo.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { fuera.fecha++; continue; }

      const gente = [...ladoA, ...ladoB].map(persona);
      if (gente.some((x) => !x || !x[0])) { fuera.falta++; continue; }   // ficha borrada o sin nombre
      for (const [nombre, dupr, id] of gente) if (!dupr) sinDupr.set(id, nombre);
      const vacio = ['', '', ''];
      const [a1, a2, b1, b2] = singles ? [gente[0], vacio, gente[1], vacio] : gente;
      const puntos = [];
      for (let i = 0; i < 5; i++) puntos.push(...(games[i] ? games[i] : ['', '']));
      filas.push([singles ? 'S' : 'D', torneo.name || '', fecha, ...a1, ...a2, ...b1, ...b2, ...puntos, LUGAR, 'SIDEOUT']);
    }
    const csv = [COLUMNAS, ...filas].map((f) => f.map(campo).join(',')).join('\n') + '\n';
    return { csv, partidos: filas.length, fuera, sinDupr: [...sinDupr.values()].sort((x, y) => x.localeCompare(y)) };
  }

  /* ── Lectura (sólo lectura, en páginas de 1000) ── */
  async function todo(ruta) {
    const salida = [];
    for (let desde = 0; ; desde += 1000) {
      const pagina = await window.api(`${ruta}&limit=1000&offset=${desde}`);
      salida.push(...(pagina || []));
      if (!pagina || pagina.length < 1000) return salida;
    }
  }

  async function leer(tid) {
    const [torneo] = await window.api(`tournaments?id=eq.${tid}&select=id,name,date,status`);
    if (!torneo) throw new Error('Tournament not found.');
    const categorias = await todo(`tournament_categories?tournament_id=eq.${tid}&select=id,name&order=id`);
    const ids = categorias.map((c) => c.id).join(',');
    if (!ids) return { torneo, categorias, equipos: [], rr: [], bracket: [], jugadores: [] };
    const campos = 'id,category_id,team_a_id,team_b_id,score_a,score_b,status,forfeit_team_id,games,finished_at';
    const [equipos, rr, bracket] = await Promise.all([
      todo(`tournament_teams?category_id=in.(${ids})&select=id,category_id,player1_id,player2_id,player3_id,player4_id&order=id`),
      todo(`tournament_rr_matches?category_id=in.(${ids})&status=eq.completed&select=${campos},round&order=round,id`),
      todo(`tournament_bracket_matches?category_id=in.(${ids})&status=eq.completed&select=${campos}&order=id`),
    ]);
    const pids = [...new Set(equipos.flatMap((e) => [e.player1_id, e.player2_id, e.player3_id, e.player4_id]).filter((x) => x !== null && x !== undefined))];
    const jugadores = [];
    for (let i = 0; i < pids.length; i += 150) {
      jugadores.push(...await todo(`players?id=in.(${pids.slice(i, i + 150).join(',')})&select=id,first_name,last_name,dupr_id&order=id`));
    }
    return { torneo, categorias, equipos, rr, bracket, jugadores };
  }

  const nombreArchivo = (torneo) => {
    const base = String(torneo.name || 'tournament').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tournament';
    return `DUPR-${base}${torneo.date ? `-${torneo.date}` : ''}.csv`;
  };

  function bajar(csv, nombre) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  /* Lo que se dejó fuera, en una frase. */
  function textoFuera(f) {
    const partes = [];
    if (f.forfeit) partes.push(`${plural(f.forfeit, 'forfeit', 'forfeits')}`);
    if (f.equipo) partes.push(`${plural(f.equipo, 'match', 'matches')} with a team that doesn't have the right number of players`);
    if (f.marcador) partes.push(`${plural(f.marcador, 'match', 'matches')} without usable game scores`);
    if (f.falta) partes.push(`${plural(f.falta, 'match', 'matches')} with a player missing or without a name`);
    if (f.fecha) partes.push(`${plural(f.fecha, 'match', 'matches')} without a date`);
    return partes.length ? `Left out: ${partes.join(', ')}.` : '';
  }

  async function descargar(btn) {
    const tid = Number(btn.dataset.id);
    if (!tid) return;
    try {
      const datos = await leer(tid);
      if (datos.torneo.status !== 'completed') {
        window.toast('DUPR results are available when the tournament is completed.', true);
        return;
      }
      if (!LUGAR) {
        window.toast('The DUPR location is not set yet. Nothing was downloaded.', true);
        return;
      }
      const r = armar(datos);
      const fuera = textoFuera(r.fuera);
      if (!r.partidos) {
        window.toast(`There are no played matches to send to DUPR. ${fuera}`.trim(), true);
        return;
      }
      if (r.sinDupr.length) {
        const ok = await window.confirmModal({
          title: `${plural(r.sinDupr.length, 'player has', 'players have')} no DUPR ID`,
          message: `Missing: ${r.sinDupr.join(', ')}. `
            + 'Add it in Edit Player first, or download now and their DUPR ID will be empty. '
            + `${plural(r.partidos, 'match is', 'matches are')} ready. ${fuera}`.trim(),
          okLabel: 'Download anyway',
          cancelLabel: 'Cancel',
          focusCancel: true,
        });
        if (!ok) return;
      }
      bajar(r.csv, nombreArchivo(datos.torneo));
      window.toast(`Downloaded ${plural(r.partidos, 'match', 'matches')} for DUPR. ${fuera}`.trim());
    } catch (err) {
      window.toast(`Could not prepare the DUPR file: ${err.message}`, true);
    } finally {
      /* FerociaBoton quita aria-disabled al soltar el botón: el gris lo
         recupera justo después (si no, un lector de pantalla lo leería activo). */
      if (btn.classList.contains('is-off')) setTimeout(() => btn.setAttribute('aria-disabled', 'true'), 0);
    }
  }

  window.DuprExport = { armar, COLUMNAS };
  Object.assign(window.CLICK_HANDLERS, { duprResults: (btn) => descargar(btn) });
})();
