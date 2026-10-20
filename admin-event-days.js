/* ============================================================
   FEROCIA Admin — los días de una clínica en el formulario (§105)
   ------------------------------------------------------------
   Con el tipo "Clinic" aparecen los días de la semana (Mon … Sun) en
   Create Event y en Edit Event. Lo que se marca se guarda en
   events.weekdays (SQL 117): 1 = lunes … 7 = domingo.

   app.js lo usa así:
     FerociaClinicDays.mostrar('create' | 'edit', visible)
     FerociaClinicDays.leer(form)        → [2, 4]
     FerociaClinicDays.poner(form, [2])
     FerociaClinicDays.error(form, tipo) → texto del error, o ''

   Comodidad: si es una clínica, todavía no hay ningún día marcado y se
   elige la fecha de inicio, se marca el día de esa fecha.
   ============================================================ */
(function () {
  'use strict';
  const pre = (form) => (form === 'edit' ? 'edit-' : '');
  const caja = (form) => document.getElementById(`${pre(form)}event-days`);
  const casillas = (form) => Array.from((caja(form) || { querySelectorAll: () => [] }).querySelectorAll('input[type="checkbox"]'));

  function leer(form) {
    return casillas(form).filter((c) => c.checked).map((c) => Number(c.value)).sort((a, b) => a - b);
  }

  function poner(form, dias) {
    const lista = (window.FerociaEventDays ? window.FerociaEventDays.limpiar(dias) : (dias || []).map(Number));
    casillas(form).forEach((c) => { c.checked = lista.includes(Number(c.value)); });
  }
  /* Lo que viene guardado de la base (al abrir Edit): cuenta como elegido por la persona. */
  function cargar(form, dias) {
    guardados[form] = [];
    automatico[form] = false;
    poner(form, dias);
  }

  /* Lo marcado antes de cambiar a otro tipo: si vuelve a "Clinic", vuelve. */
  const guardados = { create: [], edit: [] };
  /* ¿Lo marcado lo puso el formulario solo (por la fecha)? Entonces, si se
     cambia la fecha, se cambia también; si lo marcó la persona, no se toca. */
  const automatico = { create: false, edit: false };

  function mostrar(form, visible) {
    const wrap = document.getElementById(`${pre(form)}event-days-wrap`);
    if (!wrap) return;
    const estaba = !wrap.hidden;
    wrap.hidden = !visible;
    /* Si deja de ser una clínica, los días no se guardan (se limpian). */
    if (!visible) { if (estaba) guardados[form] = leer(form); poner(form, []); }
    else if (!leer(form).length) {
      if (guardados[form].length) { poner(form, guardados[form]); automatico[form] = false; }
      else sugerir(form);
    }
  }

  /* Marca el día de la fecha de inicio si no hay ninguno (o si el que hay lo puso el formulario). */
  function sugerir(form) {
    const wrap = document.getElementById(`${pre(form)}event-days-wrap`);
    if (!wrap || wrap.hidden || !window.FerociaEventDays) return;
    if (leer(form).length && !automatico[form]) return;
    const fecha = document.getElementById(`${pre(form)}event-date`);
    const d = fecha ? window.FerociaEventDays.diaDeFecha(fecha.value) : null;
    if (d) { poner(form, [d]); automatico[form] = true; }
  }

  function error(form, tipo) {
    if (tipo !== 'clinic') return '';
    return leer(form).length ? '' : 'Choose the day (or days) of the week this clinic happens.';
  }

  ['create', 'edit'].forEach((form) => {
    const fecha = document.getElementById(`${pre(form)}event-date`);
    if (fecha) fecha.addEventListener('change', () => sugerir(form));
    /* Si la persona toca un día, ya no se cambia solo. */
    casillas(form).forEach((c) => c.addEventListener('change', () => { automatico[form] = false; }));
    /* Al vaciar el formulario (después de crear), se olvida todo. */
    const f = document.getElementById(form === 'edit' ? 'edit-event-form' : 'create-event-form');
    if (f) f.addEventListener('reset', () => { guardados[form] = []; automatico[form] = false; });
  });

  window.FerociaClinicDays = { leer, poner, cargar, mostrar, error };
})();
