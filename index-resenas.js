/* ============================================================
   FEROCIA — ferociasports.com: "What players say" (§113)

   Pinta las reviews que se marcaron "Show on website" en el panel
   (función public_reviews, sql/125: sólo las publicadas y con
   comentario; el nombre llega ya como "Ana U.", nunca el apellido ni el
   correo).
   · Sin reviews, o si la lectura falla: la sección se queda escondida.
   · Sin promedio de estrellas (decidido: cada review tal cual).
   · Los textos se pintan como texto (textContent), nunca como HTML.
   ============================================================ */
(function () {
  'use strict';

  const MAXIMO = 6;
  const seccion = document.getElementById('reviews');
  const caja = document.getElementById('rvs-grid');
  if (!seccion || !caja || !window.supabase || typeof window.supabase.rpc !== 'function') return;

  const el = (tag, cls, texto) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  };

  function estrellas(n) {
    const s = el('div', 'rvs-estrellas');
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', `${n} out of 5 stars`);
    for (let i = 1; i <= 5; i++) {
      const x = el('span', i > n ? 'rvs-off' : '', '★');
      x.setAttribute('aria-hidden', 'true');
      s.append(x);
    }
    return s;
  }

  function tarjeta(r) {
    const t = el('figure', 'rvs-card');
    const n = Math.max(1, Math.min(5, Number(r.rating) || 0));
    const cita = el('blockquote', 'rvs-texto', `“${String(r.comment || '').trim()}”`);
    const quien = el('figcaption', 'rvs-quien', `— ${r.name || 'FEROCIA player'}`);
    if (r.event_label) quien.append(el('span', 'rvs-evento', r.event_label));
    t.append(estrellas(n), cita, quien);
    return t;
  }

  async function cargar() {
    try {
      const { data, error } = await window.supabase.rpc('public_reviews');
      if (error) throw error;
      const lista = (data || []).filter((r) => r && r.comment).slice(0, MAXIMO);
      if (!lista.length) return;
      caja.replaceChildren(...lista.map(tarjeta));
      seccion.hidden = false;
    } catch (e) {
      /* Sin el SQL 125 o sin conexión: la sección no se enseña. */
      console.warn('[reviews] no se pudieron leer:', e?.message || e);
    }
  }

  cargar();
})();
