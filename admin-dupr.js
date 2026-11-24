/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: DUPR ID (§124, SQL 144) · 24 nov 2026
   Lo comparten Add Player, Import CSV, Edit Player (admin-players.js),
   "convertir suscriptor en jugador" (admin-promotions.js) y la ficha del
   jugador (admin-player-profile.js).

   · Opcional. Exactamente 6 letras o números (1A), como 8DPLX8.
   · Se guarda en MAYÚSCULAS y sin espacios ni guiones (la base lo hace
     igual, por si algo llega de otro sitio).
   · Dos jugadores no pueden tener el mismo (2A): antes de guardar se
     busca y se dice quién lo tiene. La base también lo impide.
   Depende de: db.js (api).
   ============================================================ */

(function () {
  'use strict';

  const limpio = (v) => String(v == null ? '' : v).replace(/[\s-]/g, '').toUpperCase();

  /* { ok, value, error }: value es null si está vacío. */
  function revisar(v) {
    const x = limpio(v);
    if (!x) return { ok: true, value: null };
    if (!/^[A-Z0-9]{6}$/.test(x)) {
      return { ok: false, value: x, error: 'DUPR ID must be exactly 6 letters or numbers (for example 8DPLX8).' };
    }
    return { ok: true, value: x };
  }

  /* ¿Lo tiene ya otro jugador? Devuelve { first_name, last_name, id } o null. */
  async function dueno(valor, salvoId) {
    if (!valor) return null;
    const filas = await window.api(`players?dupr_id=eq.${encodeURIComponent(valor)}&select=id,first_name,last_name&limit=2`);
    return (filas || []).find((p) => Number(p.id) !== Number(salvoId)) || null;
  }
  const textoDueno = (valor, p) => `DUPR ID ${valor} already belongs to ${p.first_name} ${p.last_name}. Each player has their own DUPR ID.`;

  /* El aviso de la base si dos lo guardan a la vez (índice único). */
  const esRepetido = (err) => /players_dupr_id_unico|dupr_id/i.test(String((err && err.message) || err || ''))
    && /duplicate|unique|23505/i.test(String((err && err.message) || err || ''));

  /* ¿La base ya tiene la columna (SQL 144)? Se pregunta una vez. Si no,
     los campos no se enseñan y todo se guarda como antes. */
  let _hay = null;
  function disponible() {
    if (!_hay) {
      _hay = window.api('players?select=dupr_id&limit=1').then(() => true, () => { _hay = null; return false; });
    }
    return _hay;
  }
  /* Enseña o esconde el campo (su contenedor) según haya columna. */
  async function mostrar(campo) {
    const el = typeof campo === 'string' ? document.getElementById(campo) : campo;
    if (!el) return;
    const caja = el.closest('.ap-group, .form-group, .du-campo') || el;
    caja.hidden = !(await disponible());
  }

  window.FerociaDupr = { limpio, revisar, dueno, textoDueno, esRepetido, disponible, mostrar };
})();
