/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: EL CONTADOR ROJO DE "DELIVERY PROBLEMS"
   Ajuste 30 (14 de octubre) — decisiones §41

   Un círculo rojo con el número de problemas de entrega NUEVOS desde la
   última vez que esta administradora abrió la pestaña "Delivery problems":
     · en el menú lateral, sobre "Communications";
     · en el teléfono, sobre "More" y en "Communications" dentro de More;
     · en la pestaña "Delivery problems".
   Cuentan sólo las quejas de spam y los rebotes permanentes de verdad
   (la regla está en la base: sql/87, problema_que_avisa).

   Al abrir la pestaña se marca "visto" (marcar_problemas_vistos) y la
   lista pinta "New" en los que llegaron después de la vez anterior
   (admin-delivery-problems.js lee window.FerociaAvisos.vistoAntes).

   Si el SQL 87 todavía no está instalado, o algo falla, no se pinta
   nada: el panel funciona igual que antes.

   Estilos: admin-pages.css (avp-). Depende de: app.js (window.app.authReady).
   ============================================================ */

(function () {
  'use strict';

  const CADA = 3 * 60 * 1000;          // vuelve a mirar cada 3 minutos
  const SITIOS = ['avp-sb', 'avp-bn', 'avp-md', 'avp-tab'];
  let _n = 0;
  let _vez = 0;                        // una respuesta vieja no pinta encima de una nueva
  let _listo = false;
  let _marcando = null;                // la marca en vuelo (dos clics seguidos = una sola)

  const sb = () => window.supabase;

  function pintar(n) {
    _n = n > 0 ? n : 0;
    const texto = _n > 99 ? '99+' : String(_n);
    const frase = _n === 1 ? '1 new delivery problem' : `${_n} new delivery problems`;
    SITIOS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = texto;
      el.hidden = _n === 0;
    });
    /* Para quien usa lector de pantalla: el número solo no dice nada. */
    const lugares = [['sb-communications', 'Communications'], ['md-communications', 'Communications'], ['bn-more', 'More'],
                     ['co-tab-problems', 'Delivery problems']];
    lugares.forEach(([id, base]) => {
      const b = document.getElementById(id);
      if (b) b.setAttribute('aria-label', _n ? `${base} — ${frase}` : base);
    });
  }

  async function mirar() {
    /* Mientras se marca "visto", no se cuenta: la cuenta podría llegar
       después y volver a pintar el número viejo. */
    if (!_listo || !sb() || _marcando) return;
    const mia = ++_vez;
    try {
      const { data, error } = await sb().rpc('problemas_de_entrega_nuevos');
      if (mia !== _vez) return;
      if (error) throw error;
      pintar(Number(data) || 0);
    } catch (err) {
      if (mia !== _vez) return;
      /* Sin el SQL 87, o sin permiso: no se pinta nada, sin ruido. */
      console.warn('[avisos] no se pudo contar:', err?.message || err);
      pintar(0);
    }
  }

  /** Al abrir "Delivery problems": guarda "visto" y devuelve la fecha
      de la vez anterior (o null si no se pudo). */
  function marcarVistos() {
    if (!sb()) return Promise.resolve(null);
    if (!_marcando) _marcando = marcar().finally(() => { _marcando = null; });
    return _marcando;
  }
  async function marcar() {
    ++_vez;                             // lo que estuviera contándose ya no vale
    try {
      const { data, error } = await sb().rpc('marcar_problemas_vistos');
      if (error) throw error;
      pintar(0);
      const d = data ? new Date(data) : null;
      return d && !isNaN(d.getTime()) ? d : null;
    } catch (err) {
      console.warn('[avisos] no se pudo marcar como visto:', err?.message || err);
      return null;
    }
  }

  window.FerociaAvisos = {
    mirar,
    marcarVistos,
    vistoAntes: null,                 // lo pone admin-delivery-problems.js al abrir la pestaña
    get nuevos() { return _n; },
  };

  const empezar = () => {
    _listo = true;
    mirar();
    setInterval(() => { if (document.visibilityState === 'visible') mirar(); }, CADA);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') mirar(); });
  };
  if (window.app && window.app.authReady) window.app.authReady.then(empezar);
})();
