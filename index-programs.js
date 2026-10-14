/* ============================================================
   FEROCIA — ferociasports.com: la franja de programas
   Ajuste 24 (13 de octubre) — decisiones §33

   Ladders, Tournaments y Clinics bajan a Upcoming Events y enseñan
   sólo los de ese tipo (el tipo lo pone index.html en cada tarjeta,
   data-type). Pulsar otra vez el mismo, o "Show all events", vuelve a
   enseñarlos todos. Si no hay ninguno de ese tipo, se dice y se ofrece
   suscribirse. Junior Programs, Videos y Gear son enlaces normales.
   ============================================================ */

(function () {
  'use strict';

  const NOMBRES = { ladder: 'ladders', tournament: 'tournaments', clinic: 'clinics' };
  let _actual = '';
  let _listos = false;

  const grid = () => document.getElementById('events-grid');

  function aplicar() {
    const g = grid();
    if (!g) return;
    g.querySelector('.ev-filtro-vacio')?.remove();
    const tarjetas = [...g.querySelectorAll('.ecard')];
    let vistas = 0;
    tarjetas.forEach((t) => {
      const ver = !_actual || t.dataset.type === _actual;
      t.hidden = !ver;
      if (ver) vistas++;
    });
    /* El aviso de "no hay eventos" del propio index.html se esconde
       mientras se filtra (el nuestro dice lo mismo, pero del tipo). */
    const vacioGeneral = g.querySelector('.events-empty');
    if (vacioGeneral) vacioGeneral.hidden = !!_actual;
    if (_actual && !vistas) {
      const caja = document.createElement('div');
      caja.className = 'ev-filtro-vacio';
      const p = document.createElement('p');
      p.textContent = `No upcoming ${NOMBRES[_actual]} right now — subscribe to hear about the next one.`;
      const a = document.createElement('a');
      a.href = 'subscribe.html';
      a.className = 'btn-lime';
      a.textContent = 'Subscribe';
      caja.append(p, a);
      g.appendChild(caja);
    }
    const barra = document.getElementById('ev-filtro');
    if (barra) {
      barra.hidden = !_actual;
      const nombre = document.getElementById('ev-filtro-nombre');
      if (nombre) nombre.textContent = _actual ? NOMBRES[_actual] : '';
    }
    document.querySelectorAll('.pill[data-programa]').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.programa === _actual ? 'true' : 'false'));
  }

  function elegir(tipo) {
    _actual = _actual === tipo ? '' : tipo;
    if (_listos) aplicar();
    else document.querySelectorAll('.pill[data-programa]').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.programa === _actual ? 'true' : 'false'));
    document.getElementById('events')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.querySelectorAll('.pill[data-programa]').forEach((b) => {
    if (NOMBRES[b.dataset.programa]) b.addEventListener('click', () => elegir(b.dataset.programa));
  });
  document.getElementById('ev-filtro-todos')?.addEventListener('click', () => {
    _actual = '';
    aplicar();
  });
  /* index.html avisa cuando terminó de pintar los eventos. */
  document.addEventListener('ferocia:eventos', () => { _listos = true; aplicar(); });
  /* Por si index.html terminó antes de que cargara este archivo. */
  if (window.__ferociaEventosListos) {
    _listos = true;
    aplicar();
  }
})();
