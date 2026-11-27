/* ============================================================
   FEROCIA — los días de una clínica, en palabras (§105, SQL 117)
   ------------------------------------------------------------
   Una clínica se repite cada semana: en vez de una fecha (que parecía
   vencida) se enseña el día y la hora. Lo usan la página principal
   (Upcoming Events) y el panel (el formulario de eventos).

     FerociaEventDays.label([2])       → "Tuesday"
     FerociaEventDays.label([2, 4])    → "Tue & Thu"
     FerociaEventDays.label([1, 3, 5]) → "Mon, Wed & Fri"
     FerociaEventDays.label([1..7])    → "Daily"
     FerociaEventDays.days(ev)         → los días de la clínica (o, si no
                                         tiene, el día de su fecha de inicio)
     FerociaEventDays.startsLabel(ev, hoy) → "Starts Nov 4" sólo si la
                                         clínica empieza DESPUÉS de hoy
     FerociaEventDays.comingLabel(ev, hoy) → la cinta de un evento que todavía
                                         no empezó (§131): "TODAY",
                                         "STARTS JANUARY", "COMING IN DECEMBER",
                                         "STARTS THIS MONTH"… o "" si ya empezó

   1 = lunes … 7 = domingo (como en la base).
   ============================================================ */
(function () {
  'use strict';
  const LARGO = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const CORTO = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Sólo números del 1 al 7, sin repetir y en orden de la semana. */
  function limpiar(lista) {
    if (!Array.isArray(lista)) return [];
    return [...new Set(lista.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
  }

  /* "2026-09-01" → 2 (martes). Sin zona horaria: la fecha es la del club. */
  function diaDeFecha(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    const js = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();   // 0 = domingo
    return js === 0 ? 7 : js;
  }

  function days(ev) {
    const propios = limpiar(ev && ev.weekdays);
    if (propios.length) return propios;
    const d = diaDeFecha(ev && ev.event_date);
    return d ? [d] : [];
  }

  function label(lista) {
    const d = limpiar(lista);
    if (!d.length) return '';
    if (d.length === 7) return 'Daily';
    if (d.length === 1) return LARGO[d[0]];
    const c = d.map((x) => CORTO[x]);
    return `${c.slice(0, -1).join(', ')} & ${c[c.length - 1]}`;
  }

  /* "Starts Nov 4" sólo cuando la fecha de inicio es DESPUÉS de hoy
     (hoy = "2026-10-20", la fecha del club). Si ya empezó: "". */
  function startsLabel(ev, hoy) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String((ev && ev.event_date) || ''));
    if (!m || !hoy || String(ev.event_date).slice(0, 10) <= String(hoy).slice(0, 10)) return '';
    return `Starts ${MESES[+m[2] - 1]} ${+m[3]}`;
  }

  /* §131 (1A 2A): la cinta de los eventos que todavía no empezaron.
     Escaleras y clínicas "STARTS …"; torneos y otros "COMING IN …"; el
     mismo mes, "… THIS MONTH"; el mismo día, "TODAY". El año sólo si
     faltan 12 meses o más. Private sessions y lo que ya empezó: "". */
  const MES_LARGO = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
    'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  function comingLabel(ev, hoy) {
    if (!ev || ev.event_type === 'private_session') return '';
    const f = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ev.event_date || ''));
    const h = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hoy || ''));
    if (!f || !h) return '';
    const fecha = f[0], dia = h[0];
    if (fecha < dia) return '';
    if (fecha === dia) return ev.event_type === 'clinic' ? '' : 'TODAY';
    const empieza = ev.event_type === 'ladder' || ev.event_type === 'clinic';
    const meses = (+f[1] - +h[1]) * 12 + (+f[2] - +h[2]);
    if (meses === 0) return empieza ? 'STARTS THIS MONTH' : 'COMING THIS MONTH';
    const mes = MES_LARGO[+f[2] - 1] + (meses >= 12 ? ` ${f[1]}` : '');
    return empieza ? `STARTS ${mes}` : `COMING IN ${mes}`;
  }

  window.FerociaEventDays = { label, days, startsLabel, comingLabel, limpiar, diaDeFecha, LARGO, CORTO };
})();
