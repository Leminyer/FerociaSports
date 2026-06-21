// ============================================================
// FEROCIA SPORTS CENTER — TOURNAMENT MODULE
// Depends on: config.js, db.js (loaded before this file)
// Globals consumed: api, esc, escapeHtml, fmtDate, confirmModal
// ============================================================

// Aliases — keep tApi/tEsc names so we don't have to rename 100+ call sites.
const tApi = window.api;
const tEsc = window.esc;
const tFmtDate = window.fmtDate;
const tConfirm = window.confirmModal;

function tToast(msg, isError = false) {
  // Use the shared toast if available; otherwise fall back to native alert.
  if (typeof window.toast === 'function') return window.toast(msg, isError);
  // Tournament module had its own toast() — fall back if shared isn't loaded.
  alert(msg);
}

function getTeamPlayerNames(team) {
  if (!team) return '';
  const ids = [team.player1_id, team.player2_id, team.player3_id, team.player4_id].filter(Boolean);
  if (!ids.length) return '';
  const names = ids.map(id => {
    const p = tAllPlayers.find(x => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : null;
  }).filter(Boolean);
  return names.join(' & ');
}

// ─── ROUND ROBIN SCHEDULE LOOKUP TABLE ──────────────────────
// Based exactly on the provided charts. Index = 0-based team numbers.
// Each entry: {round, courts: [{court, a, b}], bye: []}
const RR_SCHEDULES = {
  3: [
    {round:1, courts:[{court:1,a:0,b:1}], bye:[2]},
    {round:2, courts:[{court:1,a:0,b:2}], bye:[1]},
    {round:3, courts:[{court:1,a:1,b:2}], bye:[0]},
  ],
  4: [
    {round:1, courts:[{court:1,a:0,b:1},{court:2,a:2,b:3}], bye:[]},
    {round:2, courts:[{court:1,a:1,b:3},{court:2,a:0,b:2}], bye:[]},
    {round:3, courts:[{court:1,a:1,b:2},{court:2,a:0,b:3}], bye:[]},
  ],
  5: [
    {round:1, courts:[{court:1,a:0,b:3},{court:2,a:1,b:2}], bye:[4]},
    {round:2, courts:[{court:1,a:1,b:4},{court:2,a:2,b:3}], bye:[0]},
    {round:3, courts:[{court:1,a:0,b:2},{court:2,a:3,b:4}], bye:[1]},
    {round:4, courts:[{court:1,a:1,b:3},{court:2,a:0,b:4}], bye:[2]},
    {round:5, courts:[{court:1,a:2,b:4},{court:2,a:0,b:1}], bye:[3]},
  ],
  6: [
    {round:1, courts:[{court:1,a:0,b:3},{court:2,a:1,b:2},{court:3,a:4,b:5}], bye:[]},
    {round:2, courts:[{court:1,a:0,b:5},{court:2,a:2,b:3},{court:3,a:1,b:4}], bye:[]},
    {round:3, courts:[{court:1,a:0,b:2},{court:2,a:3,b:4},{court:3,a:1,b:5}], bye:[]},
    {round:4, courts:[{court:1,a:2,b:5},{court:2,a:0,b:4},{court:3,a:1,b:3}], bye:[]},
    {round:5, courts:[{court:1,a:2,b:4},{court:2,a:3,b:5},{court:3,a:0,b:1}], bye:[]},
  ],
  7: [
    {round:1, courts:[{court:1,a:0,b:5},{court:2,a:1,b:4},{court:3,a:2,b:3}], bye:[6]},
    {round:2, courts:[{court:1,a:1,b:6},{court:2,a:2,b:5},{court:3,a:3,b:4}], bye:[0]},
    {round:3, courts:[{court:1,a:0,b:2},{court:2,a:3,b:6},{court:3,a:4,b:5}], bye:[1]},
    {round:4, courts:[{court:1,a:1,b:3},{court:2,a:0,b:4},{court:3,a:5,b:6}], bye:[2]},
    {round:5, courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6}], bye:[3]},
    {round:6, courts:[{court:1,a:3,b:5},{court:2,a:2,b:6},{court:3,a:0,b:1}], bye:[4]},
    {round:7, courts:[{court:1,a:4,b:6},{court:2,a:0,b:3},{court:3,a:1,b:2}], bye:[5]},
  ],
  8: [
    {round:1, courts:[{court:1,a:0,b:5},{court:2,a:1,b:4},{court:3,a:2,b:3},{court:4,a:6,b:7}], bye:[]},
    {round:2, courts:[{court:1,a:0,b:7},{court:2,a:2,b:5},{court:3,a:3,b:4},{court:4,a:1,b:6}], bye:[]},
    {round:3, courts:[{court:1,a:3,b:6},{court:2,a:0,b:2},{court:3,a:4,b:5},{court:4,a:1,b:7}], bye:[]},
    {round:4, courts:[{court:1,a:2,b:7},{court:2,a:0,b:4},{court:3,a:5,b:6},{court:4,a:1,b:3}], bye:[]},
    {round:5, courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:3,b:7},{court:4,a:0,b:6}], bye:[]},
    {round:6, courts:[{court:1,a:4,b:7},{court:2,a:2,b:6},{court:3,a:0,b:1},{court:4,a:3,b:5}], bye:[]},
    {round:7, courts:[{court:1,a:4,b:6},{court:2,a:0,b:3},{court:3,a:1,b:2},{court:4,a:5,b:7}], bye:[]},
  ],
  9: [
    {round:1, courts:[{court:1,a:6,b:8},{court:2,a:0,b:5},{court:3,a:2,b:3},{court:4,a:1,b:4}], bye:[7]},
    {round:2, courts:[{court:1,a:5,b:7},{court:2,a:4,b:8},{court:3,a:0,b:3},{court:4,a:1,b:2}], bye:[6]},
    {round:3, courts:[{court:1,a:4,b:6},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:0,b:1}], bye:[5]},
    {round:4, courts:[{court:1,a:3,b:5},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8}], bye:[4]},
    {round:5, courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:8}], bye:[3]},
    {round:6, courts:[{court:1,a:1,b:3},{court:2,a:0,b:4},{court:3,a:5,b:8},{court:4,a:6,b:7}], bye:[2]},
    {round:7, courts:[{court:1,a:0,b:2},{court:2,a:3,b:8},{court:3,a:4,b:7},{court:4,a:5,b:6}], bye:[1]},
    {round:8, courts:[{court:1,a:1,b:8},{court:2,a:2,b:7},{court:3,a:3,b:6},{court:4,a:4,b:5}], bye:[0]},
    {round:9, courts:[{court:1,a:0,b:7},{court:2,a:1,b:6},{court:3,a:2,b:5},{court:4,a:3,b:4}], bye:[8]},
  ],
  10: [
    {round:1, courts:[{court:1,a:8,b:9},{court:2,a:1,b:6},{court:3,a:2,b:5},{court:4,a:3,b:4},{court:5,a:0,b:7}], bye:[]},
    {round:2, courts:[{court:1,a:0,b:9},{court:2,a:2,b:7},{court:3,a:3,b:6},{court:4,a:4,b:5},{court:5,a:1,b:8}], bye:[]},
    {round:3, courts:[{court:1,a:0,b:2},{court:2,a:3,b:8},{court:3,a:1,b:9},{court:4,a:5,b:6},{court:5,a:4,b:7}], bye:[]},
    {round:4, courts:[{court:1,a:2,b:9},{court:2,a:0,b:4},{court:3,a:5,b:8},{court:4,a:6,b:7},{court:5,a:1,b:3}], bye:[]},
    {round:5, courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:8},{court:5,a:3,b:9}], bye:[]},
    {round:6, courts:[{court:1,a:4,b:9},{court:2,a:2,b:6},{court:3,a:0,b:1},{court:4,a:3,b:7},{court:5,a:5,b:8}], bye:[]},
    {round:7, courts:[{court:1,a:4,b:6},{court:2,a:3,b:8},{court:3,a:2,b:9},{court:4,a:0,b:1},{court:5,a:5,b:9}], bye:[]},
    {round:8, courts:[{court:1,a:6,b:7},{court:2,a:4,b:8},{court:3,a:0,b:3},{court:4,a:1,b:2},{court:5,a:5,b:9}], bye:[]},
    {round:9, courts:[{court:1,a:6,b:7},{court:2,a:0,b:5},{court:3,a:7,b:9},{court:4,a:2,b:3},{court:5,a:1,b:4}], bye:[]},
  ],
  11: [
    {round:1,  courts:[{court:1,a:0,b:9},{court:2,a:1,b:8},{court:3,a:2,b:7},{court:4,a:3,b:6},{court:5,a:4,b:5}], bye:[10]},
    {round:2,  courts:[{court:1,a:1,b:10},{court:2,a:2,b:9},{court:3,a:3,b:8},{court:4,a:4,b:7},{court:5,a:5,b:6}], bye:[0]},
    {round:3,  courts:[{court:1,a:2,b:0},{court:2,a:3,b:10},{court:3,a:4,b:9},{court:4,a:5,b:8},{court:5,a:6,b:7}], bye:[1]},
    {round:4,  courts:[{court:1,a:1,b:3},{court:2,a:0,b:4},{court:3,a:5,b:10},{court:4,a:6,b:9},{court:5,a:7,b:8}], bye:[2]},
    {round:5,  courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:10},{court:5,a:8,b:9}], bye:[3]},
    {round:6,  courts:[{court:1,a:3,b:5},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8},{court:5,a:9,b:10}], bye:[4]},
    {round:7,  courts:[{court:1,a:4,b:6},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10}], bye:[5]},
    {round:8,  courts:[{court:1,a:5,b:7},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:0,b:1}], bye:[6]},
    {round:9,  courts:[{court:1,a:6,b:8},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:0,b:3},{court:5,a:1,b:2}], bye:[7]},
    {round:10, courts:[{court:1,a:7,b:9},{court:2,a:6,b:10},{court:3,a:0,b:1},{court:4,a:1,b:4},{court:5,a:2,b:3}], bye:[8]},
    {round:11, courts:[{court:1,a:8,b:10},{court:2,a:0,b:7},{court:3,a:1,b:6},{court:4,a:2,b:5},{court:5,a:3,b:4}], bye:[9]},
  ],
  12: [
    {round:1,  courts:[{court:1,a:0,b:9},{court:2,a:1,b:8},{court:3,a:2,b:7},{court:4,a:3,b:6},{court:5,a:4,b:5},{court:6,a:10,b:11}], bye:[]},
    {round:2,  courts:[{court:1,a:0,b:11},{court:2,a:2,b:9},{court:3,a:3,b:8},{court:4,a:4,b:7},{court:5,a:5,b:6},{court:6,a:1,b:10}], bye:[]},
    {round:3,  courts:[{court:1,a:2,b:0},{court:2,a:3,b:10},{court:3,a:4,b:9},{court:4,a:5,b:8},{court:5,a:6,b:7},{court:6,a:1,b:11}], bye:[]},
    {round:4,  courts:[{court:1,a:2,b:11},{court:2,a:0,b:4},{court:3,a:5,b:10},{court:4,a:6,b:9},{court:5,a:7,b:8},{court:6,a:1,b:3}], bye:[]},
    {round:5,  courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:10},{court:5,a:8,b:9},{court:6,a:3,b:11}], bye:[]},
    {round:6,  courts:[{court:1,a:4,b:11},{court:2,a:2,b:6},{court:3,a:0,b:8},{court:4,a:0,b:1},{court:5,a:9,b:10},{court:6,a:3,b:7}], bye:[]},
    {round:7,  courts:[{court:1,a:4,b:6},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10},{court:6,a:5,b:11}], bye:[]},
    {round:8,  courts:[{court:1,a:6,b:11},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:0,b:1},{court:6,a:5,b:7}], bye:[]},
    {round:9,  courts:[{court:1,a:6,b:8},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:0,b:3},{court:5,a:1,b:2},{court:6,a:7,b:11}], bye:[]},
    {round:10, courts:[{court:1,a:8,b:11},{court:2,a:6,b:10},{court:3,a:5,b:11},{court:4,a:1,b:4},{court:5,a:2,b:3},{court:6,a:7,b:9}], bye:[]},
    {round:11, courts:[{court:1,a:8,b:10},{court:2,a:0,b:7},{court:3,a:1,b:6},{court:4,a:2,b:5},{court:5,a:3,b:4},{court:6,a:9,b:11}], bye:[]},
  ],
  13: [
    {round:1,  courts:[{court:1,a:0,b:11},{court:2,a:1,b:10},{court:3,a:2,b:9},{court:4,a:3,b:8},{court:5,a:4,b:7},{court:6,a:5,b:6}], bye:[12]},
    {round:2,  courts:[{court:1,a:1,b:12},{court:2,a:2,b:11},{court:3,a:3,b:10},{court:4,a:4,b:9},{court:5,a:5,b:8},{court:6,a:6,b:7}], bye:[0]},
    {round:3,  courts:[{court:1,a:0,b:2},{court:2,a:3,b:12},{court:3,a:4,b:11},{court:4,a:5,b:10},{court:5,a:6,b:9},{court:6,a:7,b:8}], bye:[1]},
    {round:4,  courts:[{court:1,a:1,b:3},{court:2,a:0,b:4},{court:3,a:5,b:12},{court:4,a:6,b:11},{court:5,a:7,b:10},{court:6,a:8,b:9}], bye:[2]},
    {round:5,  courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:12},{court:5,a:8,b:11},{court:6,a:9,b:10}], bye:[3]},
    {round:6,  courts:[{court:1,a:3,b:5},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8},{court:5,a:9,b:12},{court:6,a:10,b:11}], bye:[4]},
    {round:7,  courts:[{court:1,a:4,b:6},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10},{court:6,a:11,b:12}], bye:[5]},
    {round:8,  courts:[{court:1,a:5,b:7},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:1,b:11},{court:6,a:0,b:12}], bye:[6]},
    {round:9,  courts:[{court:1,a:6,b:8},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:3,b:11},{court:5,a:2,b:12},{court:6,a:0,b:1}], bye:[7]},
    {round:10, courts:[{court:1,a:7,b:9},{court:2,a:6,b:10},{court:3,a:5,b:11},{court:4,a:4,b:12},{court:5,a:1,b:2},{court:6,a:0,b:3}], bye:[8]},
    {round:11, courts:[{court:1,a:8,b:10},{court:2,a:7,b:11},{court:3,a:6,b:12},{court:4,a:0,b:5},{court:5,a:1,b:4},{court:6,a:2,b:3}], bye:[9]},
    {round:12, courts:[{court:1,a:9,b:11},{court:2,a:8,b:12},{court:3,a:0,b:7},{court:4,a:1,b:6},{court:5,a:2,b:5},{court:6,a:3,b:4}], bye:[10]},
    {round:13, courts:[{court:1,a:10,b:12},{court:2,a:0,b:9},{court:3,a:1,b:8},{court:4,a:2,b:7},{court:5,a:3,b:6},{court:6,a:4,b:5}], bye:[11]},
  ],
  14: [
    {round:1,  courts:[{court:1,a:0,b:11},{court:2,a:1,b:10},{court:3,a:2,b:9},{court:4,a:3,b:8},{court:5,a:4,b:7},{court:6,a:5,b:6},{court:7,a:12,b:13}], bye:[]},
    {round:2,  courts:[{court:1,a:0,b:13},{court:2,a:2,b:11},{court:3,a:3,b:10},{court:4,a:4,b:9},{court:5,a:5,b:8},{court:6,a:6,b:7},{court:7,a:1,b:12}], bye:[]},
    {round:3,  courts:[{court:1,a:3,b:12},{court:2,a:0,b:3},{court:3,a:4,b:11},{court:4,a:5,b:10},{court:5,a:6,b:9},{court:6,a:7,b:8},{court:7,a:1,b:13}], bye:[]},
    {round:4,  courts:[{court:1,a:2,b:13},{court:2,a:0,b:4},{court:3,a:5,b:12},{court:4,a:6,b:11},{court:5,a:7,b:10},{court:6,a:8,b:9},{court:7,a:1,b:3}], bye:[]},
    {round:5,  courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:12},{court:5,a:8,b:11},{court:6,a:9,b:10},{court:7,a:3,b:13}], bye:[]},
    {round:6,  courts:[{court:1,a:1,b:7},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8},{court:5,a:9,b:12},{court:6,a:10,b:11},{court:7,a:4,b:13}], bye:[]},
    {round:7,  courts:[{court:1,a:4,b:6},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10},{court:6,a:11,b:12},{court:7,a:5,b:13}], bye:[]},
    {round:8,  courts:[{court:1,a:6,b:13},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:1,b:11},{court:6,a:0,b:12},{court:7,a:5,b:7}], bye:[]},
    {round:9,  courts:[{court:1,a:6,b:8},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:3,b:11},{court:5,a:2,b:12},{court:6,a:1,b:13},{court:7,a:0,b:7}], bye:[]},
    {round:10, courts:[{court:1,a:5,b:12},{court:2,a:6,b:10},{court:3,a:5,b:11},{court:4,a:4,b:12},{court:5,a:3,b:13},{court:6,a:1,b:2},{court:7,a:0,b:5}], bye:[]},
    {round:11, courts:[{court:1,a:8,b:10},{court:2,a:7,b:11},{court:3,a:6,b:12},{court:4,a:5,b:13},{court:5,a:0,b:2},{court:6,a:1,b:4},{court:7,a:2,b:3}], bye:[]},
    {round:12, courts:[{court:1,a:9,b:11},{court:2,a:8,b:12},{court:3,a:7,b:13},{court:4,a:0,b:6},{court:5,a:1,b:5},{court:6,a:2,b:4},{court:7,a:3,b:4}], bye:[]},
    {round:13, courts:[{court:1,a:10,b:12},{court:2,a:9,b:13},{court:3,a:0,b:8},{court:4,a:1,b:7},{court:5,a:2,b:6},{court:6,a:3,b:5},{court:7,a:4,b:6}], bye:[]},
  ],
  15: [
    {round:1,  courts:[{court:1,a:0,b:13},{court:2,a:1,b:12},{court:3,a:2,b:11},{court:4,a:3,b:10},{court:5,a:4,b:9},{court:6,a:5,b:8},{court:7,a:6,b:7}], bye:[14]},
    {round:2,  courts:[{court:1,a:1,b:14},{court:2,a:2,b:13},{court:3,a:3,b:12},{court:4,a:4,b:11},{court:5,a:5,b:10},{court:6,a:6,b:9},{court:7,a:7,b:8}], bye:[0]},
    {round:3,  courts:[{court:1,a:0,b:2},{court:2,a:3,b:14},{court:3,a:4,b:13},{court:4,a:5,b:12},{court:5,a:6,b:11},{court:6,a:7,b:10},{court:7,a:8,b:9}], bye:[1]},
    {round:4,  courts:[{court:1,a:1,b:3},{court:2,a:0,b:4},{court:3,a:5,b:14},{court:4,a:6,b:13},{court:5,a:7,b:12},{court:6,a:8,b:11},{court:7,a:9,b:10}], bye:[2]},
    {round:5,  courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:14},{court:5,a:8,b:13},{court:6,a:9,b:12},{court:7,a:10,b:11}], bye:[3]},
    {round:6,  courts:[{court:1,a:3,b:5},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8},{court:5,a:9,b:14},{court:6,a:10,b:13},{court:7,a:11,b:12}], bye:[4]},
    {round:7,  courts:[{court:1,a:4,b:6},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10},{court:6,a:11,b:14},{court:7,a:12,b:13}], bye:[5]},
    {round:8,  courts:[{court:1,a:5,b:7},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:1,b:11},{court:6,a:0,b:12},{court:7,a:13,b:14}], bye:[6]},
    {round:9,  courts:[{court:1,a:6,b:8},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:3,b:11},{court:5,a:2,b:12},{court:6,a:1,b:13},{court:7,a:0,b:14}], bye:[7]},
    {round:10, courts:[{court:1,a:7,b:9},{court:2,a:6,b:10},{court:3,a:5,b:11},{court:4,a:4,b:12},{court:5,a:3,b:13},{court:6,a:2,b:14},{court:7,a:0,b:1}], bye:[8]},
    {round:11, courts:[{court:1,a:8,b:10},{court:2,a:7,b:11},{court:3,a:6,b:12},{court:4,a:5,b:13},{court:5,a:4,b:14},{court:6,a:1,b:2},{court:7,a:0,b:3}], bye:[9]},
    {round:12, courts:[{court:1,a:9,b:11},{court:2,a:8,b:12},{court:3,a:7,b:13},{court:4,a:6,b:14},{court:5,a:0,b:5},{court:6,a:1,b:4},{court:7,a:2,b:3}], bye:[10]},
    {round:13, courts:[{court:1,a:10,b:12},{court:2,a:9,b:13},{court:3,a:8,b:14},{court:4,a:0,b:7},{court:5,a:1,b:6},{court:6,a:2,b:5},{court:7,a:3,b:4}], bye:[11]},
    {round:14, courts:[{court:1,a:11,b:13},{court:2,a:10,b:14},{court:3,a:0,b:9},{court:4,a:1,b:8},{court:5,a:2,b:7},{court:6,a:3,b:6},{court:7,a:4,b:5}], bye:[12]},
    {round:15, courts:[{court:1,a:12,b:14},{court:2,a:0,b:11},{court:3,a:1,b:10},{court:4,a:2,b:9},{court:5,a:3,b:8},{court:6,a:4,b:7},{court:7,a:5,b:6}], bye:[13]},
  ],
  16: [
    {round:1,  courts:[{court:1,a:0,b:13},{court:2,a:1,b:12},{court:3,a:2,b:11},{court:4,a:3,b:10},{court:5,a:4,b:9},{court:6,a:5,b:8},{court:7,a:6,b:7},{court:8,a:14,b:15}], bye:[]},
    {round:2,  courts:[{court:1,a:0,b:15},{court:2,a:2,b:13},{court:3,a:3,b:12},{court:4,a:4,b:11},{court:5,a:5,b:10},{court:6,a:6,b:9},{court:7,a:7,b:8},{court:8,a:1,b:14}], bye:[]},
    {round:3,  courts:[{court:1,a:0,b:2},{court:2,a:3,b:14},{court:3,a:4,b:13},{court:4,a:5,b:12},{court:5,a:6,b:11},{court:6,a:7,b:10},{court:7,a:8,b:9},{court:8,a:1,b:15}], bye:[]},
    {round:4,  courts:[{court:1,a:2,b:15},{court:2,a:0,b:4},{court:3,a:5,b:14},{court:4,a:6,b:13},{court:5,a:7,b:12},{court:6,a:8,b:11},{court:7,a:9,b:10},{court:8,a:1,b:3}], bye:[]},
    {round:5,  courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:14},{court:5,a:8,b:13},{court:6,a:9,b:12},{court:7,a:10,b:11},{court:8,a:3,b:15}], bye:[]},
    {round:6,  courts:[{court:1,a:4,b:15},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8},{court:5,a:9,b:14},{court:6,a:10,b:13},{court:7,a:11,b:12},{court:8,a:3,b:5}], bye:[]},
    {round:7,  courts:[{court:1,a:4,b:6},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10},{court:6,a:11,b:14},{court:7,a:12,b:13},{court:8,a:5,b:15}], bye:[]},
    {round:8,  courts:[{court:1,a:6,b:15},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:1,b:11},{court:6,a:0,b:12},{court:7,a:13,b:14},{court:8,a:5,b:7}], bye:[]},
    {round:9,  courts:[{court:1,a:6,b:8},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:3,b:11},{court:5,a:2,b:12},{court:6,a:1,b:13},{court:7,a:0,b:14},{court:8,a:7,b:15}], bye:[]},
    {round:10, courts:[{court:1,a:8,b:15},{court:2,a:6,b:10},{court:3,a:5,b:11},{court:4,a:4,b:12},{court:5,a:3,b:13},{court:6,a:2,b:14},{court:7,a:0,b:1},{court:8,a:7,b:9}], bye:[]},
    {round:11, courts:[{court:1,a:8,b:10},{court:2,a:7,b:11},{court:3,a:6,b:12},{court:4,a:5,b:13},{court:5,a:4,b:14},{court:6,a:3,b:15},{court:7,a:0,b:2},{court:8,a:1,b:9}], bye:[]},
    {round:12, courts:[{court:1,a:10,b:15},{court:2,a:8,b:12},{court:3,a:7,b:13},{court:4,a:6,b:14},{court:5,a:5,b:15},{court:6,a:0,b:3},{court:7,a:1,b:2},{court:8,a:4,b:9}], bye:[]},
    {round:13, courts:[{court:1,a:10,b:12},{court:2,a:9,b:13},{court:3,a:8,b:14},{court:4,a:7,b:15},{court:5,a:0,b:5},{court:6,a:1,b:4},{court:7,a:2,b:3},{court:8,a:6,b:11}], bye:[]},
    {round:14, courts:[{court:1,a:12,b:15},{court:2,a:10,b:14},{court:3,a:9,b:15},{court:4,a:0,b:9},{court:5,a:1,b:8},{court:6,a:2,b:7},{court:7,a:3,b:6},{court:8,a:4,b:5}], bye:[]},
    {round:15, courts:[{court:1,a:12,b:14},{court:2,a:11,b:15},{court:3,a:0,b:10},{court:4,a:1,b:9},{court:5,a:2,b:8},{court:6,a:3,b:7},{court:7,a:4,b:6},{court:8,a:5,b:13}], bye:[]},
  ],
  17: [
    {round:1,  courts:[{court:1,a:1,b:16},{court:2,a:2,b:15},{court:3,a:3,b:14},{court:4,a:4,b:13},{court:5,a:5,b:12},{court:6,a:6,b:11},{court:7,a:7,b:10},{court:8,a:8,b:9}], bye:[0]},
    {round:2,  courts:[{court:1,a:0,b:2},{court:2,a:3,b:16},{court:3,a:4,b:15},{court:4,a:5,b:14},{court:5,a:6,b:13},{court:6,a:7,b:12},{court:7,a:8,b:11},{court:8,a:9,b:10}], bye:[1]},
    {round:3,  courts:[{court:1,a:1,b:3},{court:2,a:0,b:4},{court:3,a:5,b:16},{court:4,a:6,b:15},{court:5,a:7,b:14},{court:6,a:8,b:13},{court:7,a:9,b:12},{court:8,a:10,b:11}], bye:[2]},
    {round:4,  courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:16},{court:5,a:8,b:15},{court:6,a:9,b:14},{court:7,a:10,b:13},{court:8,a:11,b:12}], bye:[3]},
    {round:5,  courts:[{court:1,a:3,b:5},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8},{court:5,a:9,b:16},{court:6,a:10,b:15},{court:7,a:11,b:14},{court:8,a:12,b:13}], bye:[4]},
    {round:6,  courts:[{court:1,a:4,b:6},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10},{court:6,a:11,b:16},{court:7,a:12,b:15},{court:8,a:13,b:14}], bye:[5]},
    {round:7,  courts:[{court:1,a:5,b:7},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:1,b:11},{court:6,a:0,b:12},{court:7,a:13,b:16},{court:8,a:14,b:15}], bye:[6]},
    {round:8,  courts:[{court:1,a:6,b:8},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:3,b:11},{court:5,a:2,b:12},{court:6,a:1,b:13},{court:7,a:0,b:14},{court:8,a:15,b:16}], bye:[7]},
    {round:9,  courts:[{court:1,a:7,b:9},{court:2,a:6,b:10},{court:3,a:5,b:11},{court:4,a:4,b:12},{court:5,a:3,b:13},{court:6,a:2,b:14},{court:7,a:1,b:15},{court:8,a:0,b:16}], bye:[8]},
    {round:10, courts:[{court:1,a:8,b:10},{court:2,a:7,b:11},{court:3,a:6,b:12},{court:4,a:5,b:13},{court:5,a:4,b:14},{court:6,a:3,b:15},{court:7,a:2,b:16},{court:8,a:0,b:1}], bye:[9]},
    {round:11, courts:[{court:1,a:11,b:9},{court:2,a:8,b:12},{court:3,a:7,b:13},{court:4,a:6,b:14},{court:5,a:5,b:15},{court:6,a:4,b:16},{court:7,a:1,b:2},{court:8,a:0,b:3}], bye:[10]},
    {round:12, courts:[{court:1,a:10,b:12},{court:2,a:9,b:13},{court:3,a:8,b:14},{court:4,a:7,b:15},{court:5,a:6,b:16},{court:6,a:1,b:4},{court:7,a:2,b:3},{court:8,a:0,b:5}], bye:[11]},
    {round:13, courts:[{court:1,a:11,b:13},{court:2,a:10,b:14},{court:3,a:9,b:15},{court:4,a:8,b:16},{court:5,a:0,b:6},{court:6,a:1,b:5},{court:7,a:2,b:4},{court:8,a:3,b:4}], bye:[12]},
    {round:14, courts:[{court:1,a:12,b:14},{court:2,a:11,b:15},{court:3,a:10,b:16},{court:4,a:0,b:9},{court:5,a:1,b:8},{court:6,a:2,b:7},{court:7,a:3,b:6},{court:8,a:4,b:5}], bye:[13]},
    {round:15, courts:[{court:1,a:13,b:15},{court:2,a:12,b:16},{court:3,a:0,b:11},{court:4,a:1,b:10},{court:5,a:2,b:9},{court:6,a:3,b:8},{court:7,a:4,b:7},{court:8,a:5,b:6}], bye:[14]},
    {round:16, courts:[{court:1,a:14,b:16},{court:2,a:0,b:13},{court:3,a:1,b:12},{court:4,a:2,b:11},{court:5,a:3,b:10},{court:6,a:4,b:9},{court:7,a:5,b:8},{court:8,a:6,b:7}], bye:[15]},
    {round:17, courts:[{court:1,a:0,b:15},{court:2,a:1,b:14},{court:3,a:2,b:13},{court:4,a:3,b:12},{court:5,a:4,b:11},{court:6,a:5,b:10},{court:7,a:6,b:9},{court:8,a:7,b:8}], bye:[16]},
  ],
  18: [
    {round:1,  courts:[{court:1,a:1,b:16},{court:2,a:2,b:15},{court:3,a:3,b:14},{court:4,a:4,b:13},{court:5,a:5,b:12},{court:6,a:6,b:11},{court:7,a:7,b:10},{court:8,a:8,b:9},{court:9,a:0,b:17}], bye:[]},
    {round:2,  courts:[{court:1,a:1,b:17},{court:2,a:3,b:16},{court:3,a:4,b:15},{court:4,a:5,b:14},{court:5,a:6,b:13},{court:6,a:7,b:12},{court:7,a:8,b:11},{court:8,a:9,b:10},{court:9,a:0,b:2}], bye:[]},
    {round:3,  courts:[{court:1,a:1,b:2},{court:2,a:0,b:4},{court:3,a:5,b:16},{court:4,a:6,b:15},{court:5,a:7,b:14},{court:6,a:8,b:13},{court:7,a:9,b:12},{court:8,a:10,b:11},{court:9,a:2,b:17}], bye:[]},
    {round:4,  courts:[{court:1,a:3,b:17},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:16},{court:5,a:8,b:15},{court:6,a:9,b:14},{court:7,a:10,b:13},{court:8,a:11,b:12},{court:9,a:2,b:4}], bye:[]},
    {round:5,  courts:[{court:1,a:3,b:5},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8},{court:5,a:9,b:16},{court:6,a:10,b:15},{court:7,a:11,b:14},{court:8,a:12,b:13},{court:9,a:4,b:17}], bye:[]},
    {round:6,  courts:[{court:1,a:5,b:17},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10},{court:6,a:11,b:16},{court:7,a:12,b:15},{court:8,a:13,b:14},{court:9,a:4,b:6}], bye:[]},
    {round:7,  courts:[{court:1,a:5,b:7},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:1,b:11},{court:6,a:0,b:12},{court:7,a:13,b:16},{court:8,a:14,b:15},{court:9,a:6,b:17}], bye:[]},
    {round:8,  courts:[{court:1,a:7,b:17},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:3,b:11},{court:5,a:2,b:12},{court:6,a:1,b:13},{court:7,a:0,b:14},{court:8,a:15,b:16},{court:9,a:6,b:8}], bye:[]},
    {round:9,  courts:[{court:1,a:7,b:9},{court:2,a:6,b:10},{court:3,a:5,b:11},{court:4,a:4,b:12},{court:5,a:3,b:13},{court:6,a:2,b:14},{court:7,a:1,b:15},{court:8,a:0,b:16},{court:9,a:8,b:17}], bye:[]},
    {round:10, courts:[{court:1,a:9,b:17},{court:2,a:7,b:11},{court:3,a:6,b:12},{court:4,a:5,b:13},{court:5,a:4,b:14},{court:6,a:3,b:15},{court:7,a:2,b:16},{court:8,a:0,b:1},{court:9,a:8,b:10}], bye:[]},
    {round:11, courts:[{court:1,a:9,b:11},{court:2,a:8,b:12},{court:3,a:7,b:13},{court:4,a:6,b:14},{court:5,a:5,b:15},{court:6,a:4,b:16},{court:7,a:3,b:17},{court:8,a:0,b:2},{court:9,a:1,b:10}], bye:[]},
    {round:12, courts:[{court:1,a:11,b:17},{court:2,a:9,b:13},{court:3,a:8,b:14},{court:4,a:7,b:15},{court:5,a:6,b:16},{court:6,a:5,b:17},{court:7,a:0,b:4},{court:8,a:1,b:3},{court:9,a:2,b:10}], bye:[]},
    {round:13, courts:[{court:1,a:11,b:13},{court:2,a:10,b:14},{court:3,a:9,b:15},{court:4,a:8,b:16},{court:5,a:7,b:17},{court:6,a:0,b:6},{court:7,a:1,b:5},{court:8,a:2,b:4},{court:9,a:3,b:12}], bye:[]},
    {round:14, courts:[{court:1,a:13,b:17},{court:2,a:11,b:15},{court:3,a:10,b:16},{court:4,a:9,b:17},{court:5,a:0,b:8},{court:6,a:1,b:7},{court:7,a:2,b:6},{court:8,a:3,b:5},{court:9,a:4,b:12}], bye:[]},
    {round:15, courts:[{court:1,a:13,b:15},{court:2,a:12,b:16},{court:3,a:11,b:17},{court:4,a:0,b:10},{court:5,a:1,b:9},{court:6,a:2,b:8},{court:7,a:3,b:7},{court:8,a:4,b:6},{court:9,a:5,b:14}], bye:[]},
    {round:16, courts:[{court:1,a:15,b:17},{court:2,a:13,b:17},{court:3,a:0,b:12},{court:4,a:1,b:11},{court:5,a:2,b:10},{court:6,a:3,b:9},{court:7,a:4,b:8},{court:8,a:5,b:7},{court:9,a:6,b:14}], bye:[]},
    {round:17, courts:[{court:1,a:0,b:16},{court:2,a:1,b:15},{court:3,a:2,b:14},{court:4,a:3,b:13},{court:5,a:4,b:12},{court:6,a:5,b:11},{court:7,a:6,b:10},{court:8,a:7,b:9},{court:9,a:8,b:17}], bye:[]},
  ],
  19: [
    {round:1,  courts:[{court:1,a:1,b:18},{court:2,a:2,b:17},{court:3,a:3,b:16},{court:4,a:4,b:15},{court:5,a:5,b:14},{court:6,a:6,b:13},{court:7,a:7,b:12},{court:8,a:8,b:11},{court:9,a:9,b:10}], bye:[0]},
    {round:2,  courts:[{court:1,a:0,b:2},{court:2,a:3,b:18},{court:3,a:4,b:17},{court:4,a:5,b:16},{court:5,a:6,b:15},{court:6,a:7,b:14},{court:7,a:8,b:13},{court:8,a:9,b:12},{court:9,a:10,b:11}], bye:[1]},
    {round:3,  courts:[{court:1,a:1,b:3},{court:2,a:0,b:4},{court:3,a:5,b:18},{court:4,a:6,b:17},{court:5,a:7,b:16},{court:6,a:8,b:15},{court:7,a:9,b:14},{court:8,a:10,b:13},{court:9,a:11,b:12}], bye:[2]},
    {round:4,  courts:[{court:1,a:2,b:4},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:18},{court:5,a:8,b:17},{court:6,a:9,b:16},{court:7,a:10,b:15},{court:8,a:11,b:14},{court:9,a:12,b:13}], bye:[3]},
    {round:5,  courts:[{court:1,a:3,b:5},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8},{court:5,a:9,b:18},{court:6,a:10,b:17},{court:7,a:11,b:16},{court:8,a:12,b:15},{court:9,a:13,b:14}], bye:[4]},
    {round:6,  courts:[{court:1,a:4,b:6},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10},{court:6,a:11,b:18},{court:7,a:12,b:17},{court:8,a:13,b:16},{court:9,a:14,b:15}], bye:[5]},
    {round:7,  courts:[{court:1,a:5,b:7},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:1,b:11},{court:6,a:0,b:12},{court:7,a:13,b:18},{court:8,a:14,b:17},{court:9,a:15,b:16}], bye:[6]},
    {round:8,  courts:[{court:1,a:6,b:8},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:3,b:11},{court:5,a:2,b:12},{court:6,a:1,b:13},{court:7,a:0,b:14},{court:8,a:15,b:18},{court:9,a:16,b:17}], bye:[7]},
    {round:9,  courts:[{court:1,a:7,b:9},{court:2,a:6,b:10},{court:3,a:5,b:11},{court:4,a:4,b:12},{court:5,a:3,b:13},{court:6,a:2,b:14},{court:7,a:1,b:15},{court:8,a:0,b:16},{court:9,a:17,b:18}], bye:[8]},
    {round:10, courts:[{court:1,a:8,b:10},{court:2,a:7,b:11},{court:3,a:6,b:12},{court:4,a:5,b:13},{court:5,a:4,b:14},{court:6,a:3,b:15},{court:7,a:2,b:16},{court:8,a:1,b:17},{court:9,a:0,b:18}], bye:[9]},
    {round:11, courts:[{court:1,a:9,b:11},{court:2,a:8,b:12},{court:3,a:7,b:13},{court:4,a:6,b:14},{court:5,a:5,b:15},{court:6,a:4,b:16},{court:7,a:3,b:17},{court:8,a:2,b:18},{court:9,a:0,b:1}], bye:[10]},
    {round:12, courts:[{court:1,a:10,b:12},{court:2,a:9,b:13},{court:3,a:8,b:14},{court:4,a:7,b:15},{court:5,a:6,b:16},{court:6,a:5,b:17},{court:7,a:4,b:18},{court:8,a:0,b:3},{court:9,a:1,b:2}], bye:[11]},
    {round:13, courts:[{court:1,a:11,b:13},{court:2,a:10,b:14},{court:3,a:9,b:15},{court:4,a:8,b:16},{court:5,a:7,b:17},{court:6,a:6,b:18},{court:7,a:0,b:5},{court:8,a:1,b:4},{court:9,a:2,b:3}], bye:[12]},
    {round:14, courts:[{court:1,a:12,b:14},{court:2,a:11,b:15},{court:3,a:10,b:16},{court:4,a:9,b:17},{court:5,a:8,b:18},{court:6,a:0,b:7},{court:7,a:1,b:6},{court:8,a:2,b:5},{court:9,a:3,b:4}], bye:[13]},
    {round:15, courts:[{court:1,a:13,b:15},{court:2,a:12,b:16},{court:3,a:11,b:17},{court:4,a:10,b:18},{court:5,a:0,b:9},{court:6,a:1,b:8},{court:7,a:2,b:7},{court:8,a:3,b:6},{court:9,a:4,b:5}], bye:[14]},
    {round:16, courts:[{court:1,a:14,b:16},{court:2,a:13,b:17},{court:3,a:12,b:18},{court:4,a:0,b:11},{court:5,a:1,b:10},{court:6,a:2,b:9},{court:7,a:3,b:8},{court:8,a:4,b:7},{court:9,a:5,b:6}], bye:[15]},
    {round:17, courts:[{court:1,a:15,b:17},{court:2,a:14,b:18},{court:3,a:0,b:13},{court:4,a:1,b:12},{court:5,a:2,b:11},{court:6,a:3,b:10},{court:7,a:4,b:9},{court:8,a:5,b:8},{court:9,a:6,b:7}], bye:[16]},
    {round:18, courts:[{court:1,a:16,b:18},{court:2,a:0,b:15},{court:3,a:1,b:14},{court:4,a:2,b:13},{court:5,a:3,b:12},{court:6,a:4,b:11},{court:7,a:5,b:10},{court:8,a:6,b:9},{court:9,a:7,b:8}], bye:[17]},
    {round:19, courts:[{court:1,a:0,b:17},{court:2,a:1,b:16},{court:3,a:2,b:15},{court:4,a:3,b:14},{court:5,a:4,b:13},{court:6,a:5,b:12},{court:7,a:6,b:11},{court:8,a:7,b:10},{court:9,a:8,b:9}], bye:[18]},
  ],
  20: [
    {round:1,  courts:[{court:1,a:1,b:18},{court:2,a:2,b:17},{court:3,a:3,b:16},{court:4,a:4,b:15},{court:5,a:5,b:14},{court:6,a:6,b:13},{court:7,a:7,b:12},{court:8,a:8,b:11},{court:9,a:9,b:10},{court:10,a:0,b:19}], bye:[]},
    {round:2,  courts:[{court:1,a:1,b:19},{court:2,a:3,b:18},{court:3,a:4,b:17},{court:4,a:5,b:16},{court:5,a:6,b:15},{court:6,a:7,b:14},{court:7,a:8,b:13},{court:8,a:9,b:12},{court:9,a:10,b:11},{court:10,a:0,b:2}], bye:[]},
    {round:3,  courts:[{court:1,a:1,b:2},{court:2,a:0,b:4},{court:3,a:5,b:18},{court:4,a:6,b:17},{court:5,a:7,b:16},{court:6,a:8,b:15},{court:7,a:9,b:14},{court:8,a:10,b:13},{court:9,a:11,b:12},{court:10,a:2,b:19}], bye:[]},
    {round:4,  courts:[{court:1,a:3,b:19},{court:2,a:1,b:5},{court:3,a:0,b:6},{court:4,a:7,b:18},{court:5,a:8,b:17},{court:6,a:9,b:16},{court:7,a:10,b:15},{court:8,a:11,b:14},{court:9,a:12,b:13},{court:10,a:2,b:4}], bye:[]},
    {round:5,  courts:[{court:1,a:3,b:5},{court:2,a:2,b:6},{court:3,a:1,b:7},{court:4,a:0,b:8},{court:5,a:9,b:18},{court:6,a:10,b:17},{court:7,a:11,b:16},{court:8,a:12,b:15},{court:9,a:13,b:14},{court:10,a:4,b:19}], bye:[]},
    {round:6,  courts:[{court:1,a:5,b:19},{court:2,a:3,b:7},{court:3,a:2,b:8},{court:4,a:1,b:9},{court:5,a:0,b:10},{court:6,a:11,b:18},{court:7,a:12,b:17},{court:8,a:13,b:16},{court:9,a:14,b:15},{court:10,a:4,b:6}], bye:[]},
    {round:7,  courts:[{court:1,a:5,b:7},{court:2,a:4,b:8},{court:3,a:3,b:9},{court:4,a:2,b:10},{court:5,a:1,b:11},{court:6,a:0,b:12},{court:7,a:13,b:18},{court:8,a:14,b:17},{court:9,a:15,b:16},{court:10,a:6,b:19}], bye:[]},
    {round:8,  courts:[{court:1,a:7,b:19},{court:2,a:5,b:9},{court:3,a:4,b:10},{court:4,a:3,b:11},{court:5,a:2,b:12},{court:6,a:1,b:13},{court:7,a:0,b:14},{court:8,a:15,b:18},{court:9,a:16,b:17},{court:10,a:6,b:8}], bye:[]},
    {round:9,  courts:[{court:1,a:7,b:9},{court:2,a:6,b:10},{court:3,a:5,b:11},{court:4,a:4,b:12},{court:5,a:3,b:13},{court:6,a:2,b:14},{court:7,a:1,b:15},{court:8,a:0,b:16},{court:9,a:17,b:18},{court:10,a:8,b:19}], bye:[]},
    {round:10, courts:[{court:1,a:9,b:19},{court:2,a:7,b:11},{court:3,a:6,b:12},{court:4,a:5,b:13},{court:5,a:4,b:14},{court:6,a:3,b:15},{court:7,a:2,b:16},{court:8,a:1,b:17},{court:9,a:0,b:18},{court:10,a:8,b:10}], bye:[]},
    {round:11, courts:[{court:1,a:9,b:11},{court:2,a:8,b:12},{court:3,a:7,b:13},{court:4,a:6,b:14},{court:5,a:5,b:15},{court:6,a:4,b:16},{court:7,a:3,b:17},{court:8,a:2,b:18},{court:9,a:1,b:19},{court:10,a:0,b:10}], bye:[]},
    {round:12, courts:[{court:1,a:11,b:19},{court:2,a:9,b:13},{court:3,a:8,b:14},{court:4,a:7,b:15},{court:5,a:6,b:16},{court:6,a:5,b:17},{court:7,a:4,b:18},{court:8,a:3,b:19},{court:9,a:0,b:2},{court:10,a:1,b:10}], bye:[]},
    {round:13, courts:[{court:1,a:11,b:13},{court:2,a:10,b:14},{court:3,a:9,b:15},{court:4,a:8,b:16},{court:5,a:7,b:17},{court:6,a:6,b:18},{court:7,a:5,b:19},{court:8,a:0,b:4},{court:9,a:1,b:3},{court:10,a:2,b:12}], bye:[]},
    {round:14, courts:[{court:1,a:13,b:19},{court:2,a:11,b:15},{court:3,a:10,b:16},{court:4,a:9,b:17},{court:5,a:8,b:18},{court:6,a:7,b:19},{court:7,a:0,b:6},{court:8,a:1,b:5},{court:9,a:2,b:4},{court:10,a:3,b:12}], bye:[]},
    {round:15, courts:[{court:1,a:13,b:15},{court:2,a:12,b:16},{court:3,a:11,b:17},{court:4,a:10,b:18},{court:5,a:9,b:19},{court:6,a:0,b:8},{court:7,a:1,b:7},{court:8,a:2,b:6},{court:9,a:3,b:5},{court:10,a:4,b:14}], bye:[]},
    {round:16, courts:[{court:1,a:15,b:19},{court:2,a:13,b:17},{court:3,a:12,b:18},{court:4,a:11,b:19},{court:5,a:0,b:10},{court:6,a:1,b:9},{court:7,a:2,b:8},{court:8,a:3,b:7},{court:9,a:4,b:6},{court:10,a:5,b:14}], bye:[]},
    {round:17, courts:[{court:1,a:15,b:17},{court:2,a:14,b:18},{court:3,a:13,b:19},{court:4,a:0,b:12},{court:5,a:1,b:11},{court:6,a:2,b:10},{court:7,a:3,b:9},{court:8,a:4,b:8},{court:9,a:5,b:7},{court:10,a:6,b:16}], bye:[]},
    {round:18, courts:[{court:1,a:17,b:19},{court:2,a:15,b:19},{court:3,a:0,b:14},{court:4,a:1,b:13},{court:5,a:2,b:12},{court:6,a:3,b:11},{court:7,a:4,b:10},{court:8,a:5,b:9},{court:9,a:6,b:8},{court:10,a:7,b:16}], bye:[]},
    {round:19, courts:[{court:1,a:0,b:18},{court:2,a:1,b:17},{court:3,a:2,b:16},{court:4,a:3,b:15},{court:5,a:4,b:14},{court:6,a:5,b:13},{court:7,a:6,b:12},{court:8,a:7,b:11},{court:9,a:8,b:10},{court:10,a:9,b:19}], bye:[]},
  ],
};

// ─── CATEGORY LABELS ────────────────────────────────────────
const T_CATEGORY_LABELS = {
  mixed_doubles: 'Mixed Doubles',
  mens_doubles: "Men's Doubles",
  womens_doubles: "Women's Doubles",
  team_challenge: 'Team Challenge',
  singles: 'Singles'
};

// ─── STATE ──────────────────────────────────────────────────
var tCurrentTournamentId = null;
var tCurrentCategoryId = null;
var tAllPlayers = [];

const T_FORMATS = {
  'play11_win1': 'Play to 11, win by 1',
  'play11_win2': 'Play to 11, win by 2',
  'play15_win1': 'Play to 15, win by 1',
  'play15_win2': 'Play to 15, win by 2',
  'play21_win1': 'Play to 21, win by 1',
  'play21_win2': 'Play to 21, win by 2',
  'best_of_3':   'Best of 3 (first to win 2)',
  'best_of_5':   'Best of 5 (first to win 3)',
};

const RR_FORMAT_OPTIONS = `
  <option value="play11_win1">Play to 11, win by 1</option>
  <option value="play11_win2">Play to 11, win by 2</option>
  <option value="play15_win1">Play to 15, win by 1</option>
  <option value="play15_win2">Play to 15, win by 2</option>
  <option value="play21_win1">Play to 21, win by 1</option>
  <option value="play21_win2">Play to 21, win by 2</option>
`;

const FINALS_FORMAT_OPTIONS = `
  <option value="play11_win2">Play to 11, win by 2</option>
  <option value="play11_win1">Play to 11, win by 1</option>
  <option value="play15_win2">Play to 15, win by 2</option>
  <option value="play15_win1">Play to 15, win by 1</option>
  <option value="play21_win2">Play to 21, win by 2</option>
  <option value="play21_win1">Play to 21, win by 1</option>
`;


// ─── STANDINGS CALCULATION ──────────────────────────────────
function tCalcStandings(teams, matches) {
  const stats = {};
  teams.forEach(t => stats[t.id] = {
    id: t.id, name: t.name, w: 0, l: 0, bye: 0,
    pts_for: 0, pts_against: 0, played: 0, forfeited: false
  });
  // Track which teams have forfeited (full withdrawal)
  matches.filter(m => m.forfeit_team_id).forEach(m => {
    if (stats[m.forfeit_team_id]) stats[m.forfeit_team_id].forfeited = true;
  });
  matches.filter(m => m.status === 'completed').forEach(m => {
    if (!stats[m.team_a_id] || !stats[m.team_b_id]) return;
    stats[m.team_a_id].pts_for += m.score_a || 0;
    stats[m.team_a_id].pts_against += m.score_b || 0;
    stats[m.team_b_id].pts_for += m.score_b || 0;
    stats[m.team_b_id].pts_against += m.score_a || 0;
    stats[m.team_a_id].played++;
    stats[m.team_b_id].played++;
    if (m.winner_id === m.team_a_id) {
      stats[m.team_a_id].w++;
      stats[m.team_b_id].l++;
    } else if (m.winner_id === m.team_b_id) {
      stats[m.team_b_id].w++;
      stats[m.team_a_id].l++;
    }
  });
  matches.filter(m => m.status === 'bye').forEach(m => {
    const tid = m.team_a_id;
    if (stats[tid]) stats[tid].bye++;
  });
  // Sort: total pts_for → diff → wins → losses (forfeited always last)
  return Object.values(stats).sort((a, b) => {
    if (a.forfeited !== b.forfeited) return a.forfeited ? 1 : -1;
    if (b.pts_for !== a.pts_for) return b.pts_for - a.pts_for;
    const diffA = a.pts_for - a.pts_against;
    const diffB = b.pts_for - b.pts_against;
    if (diffB !== diffA) return diffB - diffA;
    if (b.w !== a.w) return b.w - a.w;
    return a.l - b.l;
  });
}

// ─── GROUP HELPERS ──────────────────────────────────────────

// Min/max teams per group (admin can pick any target in this range).
const GROUP_MIN_SIZE = 3;
const GROUP_MAX_SIZE = 8;

// Threshold: if teams > THIS, the schedule generator asks for group config.
const GROUP_TRIGGER_THRESHOLD = 8;

// Compute valid "teams per group" target sizes for a given team count.
// Returns array of { size, groups, distribution } objects.
//   - size:         the target the admin picks (e.g. 5)
//   - groups:       resulting number of groups
//   - distribution: array of group sizes, e.g. [5, 5, 4]
// Excludes any option where any group would be < MIN or > MAX.
function tSuggestGroupSizes(numTeams) {
  const suggestions = [];
  const seen = new Set();
  for (let target = GROUP_MIN_SIZE; target <= GROUP_MAX_SIZE; target++) {
    const distribution = tComputeDistribution(numTeams, target);
    if (!distribution) continue;
    // Skip if any group falls outside [MIN, MAX]
    if (!distribution.every(s => s >= GROUP_MIN_SIZE && s <= GROUP_MAX_SIZE)) continue;
    // Skip duplicates: many targets produce the same split (e.g. target=7 and 8
    // both produce [8,8,8] for 24 teams). Keep only the first.
    const key = distribution.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ size: target, groups: distribution.length, distribution });
  }
  return suggestions;
}

// Given numTeams and a target size, return the actual group sizes
// distributed as evenly as possible. Returns null if impossible.
//
// Examples (matching admin's spec):
//   numTeams=10, target=5 → [5, 5]
//   numTeams=11, target=5 → [6, 5]
//   numTeams=24, target=8 → [8, 8, 8]
//   numTeams=9,  target=3 → [3, 3, 3]
//   numTeams=15, target=4 → [5, 5, 5]   (3 groups, balanced; not 4+4+4+3)
function tComputeDistribution(numTeams, target) {
  if (numTeams < target || target < 1) return null;
  // Round to nearest number of groups (so target=5 with 11 teams → 2 groups of ~5.5)
  const numGroups = Math.max(1, Math.round(numTeams / target));
  if (numGroups < 1) return null;
  // Distribute evenly: base size + 1 extra for the first `remainder` groups
  const base = Math.floor(numTeams / numGroups);
  const remainder = numTeams % numGroups;
  const dist = [];
  for (let i = 0; i < numGroups; i++) {
    dist.push(base + (i < remainder ? 1 : 0));
  }
  // Sort descending so larger groups appear first (cosmetic — A is biggest)
  dist.sort((a, b) => b - a);
  return dist;
}

// Fisher-Yates shuffle (immutable input).
function tShuffleArray(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Generate group letter names: A, B, C, ..., Z, AA, AB, ...
function tGroupLetter(index) {
  let s = '';
  let n = index;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// Build cross-group seeded order for the bracket.
// Input: groupStandings = [ [g1Standings...], [g2Standings...], ... ]
//        finalsPerGroup = number of teams advancing per group
// Output: ordered array of teams ready for bracket placement, where
//         index 0 is the top overall seed (best 1st-place finisher).
//
// Strategy: build "tiers" — all 1st-place finishers form tier 0, all
// 2nd-place finishers form tier 1, etc. Within each tier, sort by
// raw standings strength (pts_for, then diff, then wins). Then
// interleave tiers so seed 1 = best 1st, seed 2 = best 2nd... no:
// actually seeds go 1=best 1st, 2=2nd best 1st, ..., G=worst 1st,
// then G+1=best 2nd, etc. (where G = number of groups). This naturally
// keeps group winners at the top of the seeding, which is what makes
// "1 vs 8" pairings cross groups in early rounds.
function tBuildSeededAdvancement(groupStandings, finalsPerGroup) {
  const numGroups = groupStandings.length;
  const tiers = [];
  for (let rank = 0; rank < finalsPerGroup; rank++) {
    const tier = [];
    for (let g = 0; g < numGroups; g++) {
      const team = groupStandings[g][rank];
      if (team) tier.push({ ...team, _groupIndex: g, _groupRank: rank + 1 });
    }
    // Sort tier by strength so the best 1st-place gets seed 1, etc.
    tier.sort((a, b) => {
      if (a.forfeited !== b.forfeited) return a.forfeited ? 1 : -1;
      if (b.pts_for !== a.pts_for) return b.pts_for - a.pts_for;
      const diffA = a.pts_for - a.pts_against;
      const diffB = b.pts_for - b.pts_against;
      if (diffB !== diffA) return diffB - diffA;
      if (b.w !== a.w) return b.w - a.w;
      return a.l - b.l;
    });
    tiers.push(tier);
  }
  // Concatenate tiers: all 1st-placed (best→worst), then all 2nd-placed, etc.
  const seeded = [];
  tiers.forEach(tier => seeded.push(...tier));
  return seeded;
}

// Try to swap pairings in the first round of a bracket so that no
// two same-group teams meet. Mutates the pairings array in place.
// pairings is [[seedAteam, seedBteam], ...]; teams have _groupIndex set.
function tAvoidSameGroupClashes(pairings) {
  for (let i = 0; i < pairings.length; i++) {
    const [a, b] = pairings[i];
    if (!a || !b) continue;
    if (a._groupIndex !== b._groupIndex) continue;
    // Found a same-group clash — try to swap b with another match's team.
    let swapped = false;
    for (let j = 0; j < pairings.length; j++) {
      if (j === i) continue;
      const [a2, b2] = pairings[j];
      if (!a2 || !b2) continue;
      // Swap b ↔ b2 if it resolves both matches' clashes
      if (a._groupIndex !== b2._groupIndex && a2._groupIndex !== b._groupIndex) {
        pairings[i] = [a, b2];
        pairings[j] = [a2, b];
        swapped = true;
        break;
      }
    }
    // If we couldn't find a clean swap, leave it — it's the best we can do
    // for very-skewed group distributions.
  }
  return pairings;
}


// ─── MAIN ENTRY POINT ───────────────────────────────────────
async function loadTournamentModule(skipList = false) {
  if (!tAllPlayers.length) {
    tAllPlayers = await tApi('players?select=*&order=first_name');
  }
  if (!skipList) renderTournamentList();
}

// ─── TOURNAMENT LIST ────────────────────────────────────────
let _tFilter = 'all';
let _tPanelOpen = false;
let _tCategories = []; // temp categories for create form
const _tCatEmojis = ['🏆','🎾','🏅','⚡','🔥','👑','🎯','🥇'];

async function renderTournamentList() {
  const el = document.getElementById('t-content');
  el.innerHTML = `<div class="t-loading">Loading...</div>`;

  let tournaments = [], categories = [], teams = [], rrMatches = [], bracketMatches = [];
  try {
    [tournaments, categories, teams, rrMatches, bracketMatches] = await Promise.all([
      tApi('tournaments?select=*&order=id.desc'),
      tApi('tournament_categories?select=tournament_id,id,name').catch(() => []),
      tApi('tournament_teams?select=id,category_id,name,player1_id,player2_id').catch(() => []),
      tApi('tournament_rr_matches?select=category_id,round,status,team_a_id,team_b_id,score_a,score_b,winner_id,forfeit_team_id').catch(() => []),
      tApi('tournament_bracket_matches?select=category_id,round_name,status,team_a_id,team_b_id,winner_id').catch(() => []),
    ]);
  } catch(e) {
    el.innerHTML = `<div class="t-empty">Error loading tournaments: ${tEsc(e.message)}</div>`;
    return;
  }

  // Stat counts
  const active    = tournaments.filter(t => t.status === 'active').length;
  const draft     = tournaments.filter(t => t.status === 'draft').length;
  const completed = tournaments.filter(t => t.status === 'completed').length;

  // Category map: tournament_id → [{id, name}]
  const catsByT = {};
  categories.forEach(c => {
    if (!catsByT[c.tournament_id]) catsByT[c.tournament_id] = [];
    catsByT[c.tournament_id].push({ id: c.id, name: c.name });
  });

  // Category id → tournament_id map
  const catTourneyMap = {};
  categories.forEach(c => { catTourneyMap[c.id] = c.tournament_id; });

  // Teams per tournament
  const teamsByT = {};
  teams.forEach(tm => {
    const tid = catTourneyMap[tm.category_id];
    if (!tid) return;
    if (!teamsByT[tid]) teamsByT[tid] = [];
    teamsByT[tid].push(tm);
  });

  // RR matches per tournament
  const rrByT = {};
  rrMatches.forEach(m => {
    const tid = catTourneyMap[m.category_id];
    if (!tid) return;
    if (!rrByT[tid]) rrByT[tid] = [];
    rrByT[tid].push(m);
  });

  // Bracket matches per tournament
  const bracketByT = {};
  bracketMatches.forEach(m => {
    const tid = catTourneyMap[m.category_id];
    if (!tid) return;
    if (!bracketByT[tid]) bracketByT[tid] = [];
    bracketByT[tid].push(m);
  });

  // Total teams across active tournaments
  const totalTeamsActive = tournaments
    .filter(t => t.status === 'active')
    .reduce((sum, t) => sum + (teamsByT[t.id] ? teamsByT[t.id].length : 0), 0);

  const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : 'No date set';

  // Filter
  const filtered = tournaments.filter(t => {
    if (_tFilter === 'active')    return t.status === 'active';
    if (_tFilter === 'draft')     return t.status === 'draft';
    if (_tFilter === 'completed') return t.status === 'completed';
    return true;
  });

  // SVG icons
  const trophySVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0d1f4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
  const calSVG    = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const openSVG   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const editSVG   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const closeSVG  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
  const trashSVG  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
  const boltSVG   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F26024" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  const crwnSVG   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4a5e00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
  const trendSVG  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
  const ovSVG     = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  const teamSVG   = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
  const brackSVG  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
  const resSVG    = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M8.56 13.9l-1.56 6.1 5-3 5 3-1.56-6.1"/></svg>`;

  const pillClass = (s) => s === 'active' ? 'top-pill-active' : s === 'completed' ? 'top-pill-completed' : 'top-pill-draft';
  const pillLabel = (s) => s === 'active' ? 'Active' : s === 'completed' ? 'Completed' : 'Draft';

  const tournamentCards = filtered.map(t => {
    const isClosed = t.status !== 'active' && t.status !== 'draft';
    const tCats     = catsByT[t.id]     || [];
    const catCount  = tCats.length;
    const tTeams    = teamsByT[t.id]    || [];
    const tTeamCount = tTeams.length;
    const tRR       = rrByT[t.id]       || [];
    const tBracket  = bracketByT[t.id]  || [];
    const dis = isClosed ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : '';
    const statusBorder = t.status === 'active' ? '#24BC96' : t.status === 'draft' ? '#b0bbd6' : '#174CCC';

    // Build team id→name map for this tournament
    const tTeamMap = {};
    tTeams.forEach(tm => { tTeamMap[tm.id] = tm.name; });

    // ── Intelligence item 1: Round progress from RR matches ──────────────
    const tRRActive = tRR.filter(m => m.status !== 'bye');
    const tRounds = tRRActive.length ? [...new Set(tRRActive.map(m => m.round))].sort((a,b)=>a-b) : [];
    const totalRounds = tRounds.length;
    const completedRounds = tRounds.filter(r =>
      tRRActive.filter(m => m.round === r).every(m => m.status === 'completed')
    ).length;

    // Check if bracket is complete (has a Final winner)
    const finalMatch = tBracket.find(m => m.round_name === 'Final' && m.status === 'completed');
    const bracketComplete = !!finalMatch;

    let roundText, roundSub;
    if (bracketComplete) {
      roundText = 'Tournament completed';
      roundSub  = 'Final results available';
    } else if (totalRounds > 0) {
      if (completedRounds < totalRounds) {
        roundText = `Round ${completedRounds + 1} of ${totalRounds} in progress`;
        roundSub  = `${completedRounds} of ${totalRounds} rounds finished`;
      } else {
        roundText = `All ${totalRounds} rounds complete`;
        roundSub  = 'Moving to finals bracket';
      }
    } else if (t.status === 'active') {
      roundText = 'Tournament in progress';
      roundSub  = 'Bracket is live';
    } else if (t.status === 'draft') {
      roundText = 'Setup in progress';
      roundSub  = 'Not yet published to players';
    } else {
      roundText = 'Tournament completed';
      roundSub  = 'Season finished';
    }

    // ── Intelligence item 2: Champion or leading team ─────────────────────
    let leaderText, leaderSub;
    // Helper: resolve player names for a team object
    const resolvePlayerNames = (team) => {
      if (!team) return '';
      return getTeamPlayerNames(team) || team.name || '';
    };

    if (bracketComplete && finalMatch.winner_id) {
      // Champion — show player names of winning team
      const champTeam = tTeams.find(tm => tm.id === finalMatch.winner_id);
      const champNames = champTeam ? resolvePlayerNames(champTeam) : '';
      leaderText = tEsc(champNames || (champTeam && champTeam.name) || 'Champion') + ' 🏆';
      leaderSub  = 'Tournament champion';
    } else if (tRR.length > 0 && tTeams.length > 0) {
      // Compute standings from RR matches — show leading team's player names
      const standings = tCalcStandings(tTeams, tRR);
      const leaderStanding = standings[0];
      if (leaderStanding && (leaderStanding.w > 0 || leaderStanding.pts_for > 0)) {
        const leaderTeam = tTeams.find(tm => tm.id === leaderStanding.id);
        const leaderNames = leaderTeam ? resolvePlayerNames(leaderTeam) : leaderStanding.name;
        leaderText = tEsc(leaderNames);
        leaderSub  = `${leaderStanding.w}W ${leaderStanding.l}L · Leading`;
      } else {
        leaderText = tTeamCount > 0 ? `${tTeamCount} team${tTeamCount !== 1 ? 's' : ''} enrolled` : 'No teams yet';
        leaderSub  = tTeamCount > 0 ? 'Scores not recorded yet' : 'Add teams to start bracket';
      }
    } else {
      leaderText = tTeamCount > 0 ? `${tTeamCount} team${tTeamCount !== 1 ? 's' : ''} enrolled` : 'No teams yet';
      leaderSub  = tTeamCount > 0 ? 'Add scores to see standings' : 'Add teams to start bracket';
    }

    // ── Intelligence item 3: Teams registered ────────────────────────────
    const teamsText = tTeamCount > 0
      ? `${tTeamCount} team${tTeamCount !== 1 ? 's' : ''} registered`
      : 'No teams registered yet';
    const teamsSub = tTeamCount > 0
      ? `${catCount > 0 ? catCount + ' categor' + (catCount !== 1 ? 'ies' : 'y') + ' · ' : ''}Full bracket · All confirmed`
      : 'Add teams to start bracket';
    // Category pills HTML for overview
    const catPillsHTML = tCats.length
      ? tCats.map(c => `<span class="t-op-cat-pill">${tEsc(c.name)}</span>`).join('')
      : '<span style="font-size:11px;font-weight:600;color:#b0bbd6;">No categories yet</span>';
    return `
    <div class="t-op-card" id="t-op-card-${t.id}" style="border-left:4px solid ${statusBorder};">
      <!-- Tabs -->
      <div class="t-op-tabs">
        <button class="t-op-tab active" onclick="tOpTab(event,${t.id},'overview')">${ovSVG} Overview</button>
        <button class="t-op-tab" onclick="tOpTab(event,${t.id},'teams')">${teamSVG} Teams</button>
        <button class="t-op-tab" onclick="tOpTab(event,${t.id},'bracket')">${brackSVG} Bracket</button>
        <button class="t-op-tab" onclick="tOpTab(event,${t.id},'results')">${resSVG} Results</button>
      </div>
      <!-- Body -->
      <div class="t-op-body">
        <!-- LEFT — matches proposal: name, pill+date, meta, cat pills, stats -->
        <div class="t-op-left">
          <div class="t-op-name">${tEsc(t.name)}</div>
          <div class="t-op-status-row">
            <span class="${pillClass(t.status)}">${pillLabel(t.status)}</span>
            ${t.date ? `<span class="t-op-date-badge">${calSVG} ${fmtDate(t.date)}</span>` : ''}
          </div>
          <div class="t-op-meta">${trophySVG} ${catCount} Categor${catCount !== 1 ? 'ies' : 'y'}</div>
          <div class="t-op-cat-pills">${catPillsHTML}</div>
          <div class="t-op-stats-row">
            <div><div class="t-op-stat-val">${tTeamCount}</div><div class="t-op-stat-lbl">Teams</div></div>
            <div><div class="t-op-stat-val">${catCount}</div><div class="t-op-stat-lbl">Categories</div></div>
            <div><div class="t-op-stat-val">${totalRounds || '—'}</div><div class="t-op-stat-lbl">Rounds</div></div>
          </div>
        </div>
        <!-- CENTER — Tournament Intelligence: EXACTLY as proposal -->
        <div class="t-op-center">
          <div class="t-op-intel-title">Tournament Intelligence</div>
          <div class="t-op-intel-item">
            <div class="t-op-intel-icon" style="background:#fde8d8;">${boltSVG}</div>
            <div>
              <div class="t-op-intel-text">${roundText}</div>
              <div class="t-op-intel-sub">${roundSub}</div>
            </div>
          </div>
          <div class="t-op-intel-item">
            <div class="t-op-intel-icon" style="background:rgba(198,242,33,0.2);">${crwnSVG}</div>
            <div>
              <div class="t-op-intel-text">${leaderText}</div>
              <div class="t-op-intel-sub">${leaderSub}</div>
            </div>
          </div>
          <div class="t-op-intel-item">
            <div class="t-op-intel-icon" style="background:#d4f5ed;">${trendSVG}</div>
            <div>
              <div class="t-op-intel-text">${teamsText}</div>
              <div class="t-op-intel-sub">${teamsSub}</div>
            </div>
          </div>
        </div>
        <!-- RIGHT -->
        <div class="t-op-right">
          <div class="t-op-action-title">Actions</div>
          <button class="t-op-btn" onclick="openTournament(${t.id})">${openSVG} Open Tournament</button>
          <button class="t-op-btn" onclick="tEditTournament(${t.id})" ${dis}>${editSVG} Edit</button>
          <button class="t-op-btn ${t.status === 'active' ? 't-op-btn-warn' : ''}" onclick="tToggleStatus(${t.id},'${t.status}')" ${t.status === 'completed' ? '' : dis}>
            ${t.status === 'active'
              ? closeSVG + ' Complete'
              : t.status === 'draft'
                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Activate`
                : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg> Reopen`}
          </button>
          <button class="t-op-btn t-op-btn-danger" onclick="deleteTournament(${t.id})">${trashSVG} Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Collapsible panel state
  const panelIcon = _tPanelOpen
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  const panelSubtitle = _tPanelOpen ? 'Fill in the details and add categories before creating' : 'Click to expand setup form';

  el.innerHTML = `
    <!-- Page title -->
    <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:#0d1f4a;letter-spacing:1px;line-height:1;margin-bottom:4px;">Tournament Operations Center</div>
    <div style="font-size:12px;font-weight:600;color:#6b7a99;margin-bottom:20px;">Create, manage, and monitor active competitive tournaments.</div>

    <!-- Stat cards -->
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
      <div class="stat stat-green" style="display:flex;flex-direction:column;">
        <div class="stat-label">Active Tournaments</div>
        <div class="stat-value">${active}</div>
        <div class="stat-ctx ctx-green" style="margin-top:auto;display:flex;align-items:center;gap:4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          Currently running
        </div>
      </div>
      <div class="stat stat-blue" style="display:flex;flex-direction:column;">
        <div class="stat-label">Draft</div>
        <div class="stat-value">${draft}</div>
        <div class="stat-ctx ctx-blue" style="margin-top:auto;display:flex;align-items:center;gap:4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          In setup
        </div>
      </div>
      <div class="stat stat-orange" style="display:flex;flex-direction:column;">
        <div class="stat-label">Total Teams</div>
        <div class="stat-value">${totalTeamsActive || '—'}</div>
        <div class="stat-ctx ctx-orange" style="margin-top:auto;display:flex;align-items:center;gap:4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F26024" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Across active
        </div>
      </div>
      <div class="stat stat-lime" style="display:flex;flex-direction:column;">
        <div class="stat-label">Completed</div>
        <div class="stat-value">${completed}</div>
        <div class="stat-ctx" style="margin-top:auto;display:flex;align-items:center;gap:4px;color:#6b7a99;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Finished
        </div>
      </div>
    </div>

    <!-- Collapsible create panel -->
    <div class="t-collapsible-panel" style="margin-bottom:20px;">
      <div class="t-panel-header" onclick="tTogglePanel()">
        <div class="t-panel-header-left">
          <div class="t-panel-toggle-icon">${panelIcon}</div>
          <div>
            <div class="t-panel-title">New Tournament</div>
            <div class="t-panel-subtitle">${panelSubtitle}</div>
          </div>
        </div>
        <span class="t-panel-chevron ${_tPanelOpen ? 'open' : ''}">▼</span>
      </div>
      ${_tPanelOpen ? `
      <div class="t-panel-body" style="padding:14px 16px 16px;">
        <form id="t-create-form" onsubmit="createTournament(event)">
          <!-- Name + Date -->
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:6px;">
            <div style="display:flex;flex-direction:column;gap:3px;">
              <div class="t-new-field-lbl">Tournament Name <span style="color:#e53935;">*</span></div>
              <input class="t-new-input" type="text" id="t-name" required placeholder="e.g. Spring Doubles Open 2026">
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;">
              <div class="t-new-field-lbl">Date <span style="color:#e53935;">*</span></div>
              <input class="t-new-input" type="date" id="t-date">
            </div>
          </div>
          <div class="t-new-divider" style="margin:8px 0;"></div>
          <!-- Categories -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <div class="t-new-field-lbl" style="margin:0;">Tournament Categories <span style="color:#e53935;">*</span></div>
              <span class="t-cat-count-badge" id="t-cat-count">0 Added</span>
            </div>
            <div id="t-categories-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px;"></div>
            <!-- Integrated add input -->
            <div class="t-cat-add-wrap">
              <input class="t-cat-add-input" type="text" id="t-cat-input" placeholder="Type a category name and press Add...">
              <button type="button" class="t-cat-add-btn" onclick="tAddCategory()">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add
              </button>
            </div>
          </div>
          <div class="t-new-divider" style="margin:8px 0;"></div>
          <!-- Submit -->
          <div style="display:flex;justify-content:center;">
            <button type="submit" class="t-new-submit-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              Create Tournament
            </button>
          </div>
        </form>
      </div>` : ''}
    </div>

    <!-- Section header + filter -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#0d1f4a;display:flex;align-items:center;gap:8px;">
        ${trophySVG} Tournaments
      </div>
      <div style="position:relative;">
        <select class="t-op-filter-sel" onchange="tFilterChange(this.value)">
          <option value="all" ${_tFilter==='all'?'selected':''}>All Tournaments</option>
          <option value="active" ${_tFilter==='active'?'selected':''}>Active Only</option>
          <option value="draft" ${_tFilter==='draft'?'selected':''}>Draft Only</option>
          <option value="completed" ${_tFilter==='completed'?'selected':''}>Completed</option>
        </select>
        <svg style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;" width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6z" fill="#6b7a99"/></svg>
      </div>
    </div>

    <!-- Tournament cards -->
    <div id="t-tournament-list">
      ${filtered.length ? tournamentCards : `<div style="background:white;border:0.5px solid #e0e7f5;border-radius:10px;padding:32px;text-align:center;box-shadow:0 1px 4px rgba(23,76,204,0.06);"><div class="t-empty" style="padding:0;">No tournaments found.</div></div>`}
    </div>`;

  // Wire Enter key on category input
  const catInput = document.getElementById('t-cat-input');
  if (catInput) {
    catInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tAddCategory(); }});
  }
}

// ── Helpers ─────────────────────────────────────────────────
function tTogglePanel() {
  _tPanelOpen = !_tPanelOpen;
  _tCategories = [];
  renderTournamentList();
  if (_tPanelOpen) {
    setTimeout(() => document.getElementById('t-name')?.focus(), 100);
  }
}

function tFilterChange(val) {
  _tFilter = val;
  renderTournamentList();
}

function tOpTab(e, tournamentId, tab) {
  const card = document.getElementById(`t-op-card-${tournamentId}`);
  if (!card) return;
  card.querySelectorAll('.t-op-tab').forEach(t => t.classList.remove('active'));
  e.currentTarget.classList.add('active');
  if (tab === 'overview') return;
  openTournament(tournamentId);
}

async function tToggleStatus(id, currentStatus) {
  if (currentStatus === 'active') {
    // Use full validation flow — same as completeTournament() inside openTournament view
    await completeTournamentFromList(id);
  } else if (currentStatus === 'draft') {
    // Draft → Activate
    const confirmed = await tConfirm({ title: 'Activate Tournament?', message: 'Start this tournament? Players will be able to see it.', okLabel: 'Activate' });
    if (!confirmed) return;
    await tApi(`tournaments?id=eq.${id}`, 'PATCH', { status: 'active' });
    tToast('Tournament activated!');
    renderTournamentList();
  } else {
    // Completed → Reopen
    const confirmed = await tConfirm({ title: 'Reopen Tournament?', message: 'Reopen this tournament as active?', okLabel: 'Reopen' });
    if (!confirmed) return;
    await tApi(`tournaments?id=eq.${id}`, 'PATCH', { status: 'active' });
    tToast('Tournament reopened.');
    renderTournamentList();
  }
}

// Full validation before completing — same logic as completeTournament() but returns to list
async function completeTournamentFromList(id) {
  const categories = await tApi(`tournament_categories?tournament_id=eq.${id}&select=id,name`);
  const errors = [];
  const validations = await Promise.all(categories.map(async (cat) => {
    const [teams, rrMatches, bracketMatches] = await Promise.all([
      tApi(`tournament_teams?category_id=eq.${cat.id}&select=*`),
      tApi(`tournament_rr_matches?category_id=eq.${cat.id}&status=eq.pending&select=id`),
      tApi(`tournament_bracket_matches?category_id=eq.${cat.id}&status=eq.pending&select=id`),
    ]);
    return { cat, teams, rrMatches, bracketMatches };
  }));
  for (const { cat, teams, rrMatches, bracketMatches } of validations) {
    if (teams.filter(t => !t.player1_id).length) errors.push(`"${cat.name}": some teams have no players.`);
    if (rrMatches.length) errors.push(`"${cat.name}": ${rrMatches.length} round robin match(es) still pending.`);
    if (bracketMatches.length) errors.push(`"${cat.name}": ${bracketMatches.length} finals match(es) still pending.`);
  }
  if (errors.length) {
    document.getElementById('t-modal-title').textContent = 'Cannot Complete Tournament';
    document.getElementById('t-modal-body').innerHTML = `
      <div style="padding:8px 0 16px;">
        <p style="font-size:13px;color:#0d1f4a;margin-bottom:14px;font-weight:600;">Please fix the following before completing:</p>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:8px;">
          ${errors.map(e => `<li style="font-size:13px;color:#F26024;padding:8px 12px;background:#fde8d8;border-radius:6px;">⚠️ ${e}</li>`).join('')}
        </ul>
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button type="button" class="t-op-btn" onclick="closeTModal()" style="width:auto;padding:8px 16px;">OK</button>
      </div>`;
    openTModal();
    return;
  }
  // Fetch tournament details for context
  const [tournament] = await tApi(`tournaments?id=eq.${id}&select=*`);
  const tName = tEsc(tournament?.name || 'Tournament');
  const tDate = tournament?.date ? new Date(tournament.date + 'T00:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '';
  // Compute summary from already-fetched validation data
  const totalTeams   = validations.reduce((s, v) => s + v.teams.length, 0);
  const totalMatches = validations.reduce((s, v) => s + v.teams.length, 0); // placeholder; fetch real count
  const [allRR, allBracket] = await Promise.all([
    tApi(`tournament_rr_matches?tournament_id=eq.${id}&select=id`).catch(() => []),
    tApi(`tournament_bracket_matches?tournament_id=eq.${id}&select=id`).catch(() => []),
  ]);
  const totalMatchCount = (allRR.length || 0) + (allBracket.length || 0);
  // Champion: find completed finals
  const catIds = validations.map(v => v.cat.id).join(',') || '0';
  const finals = await tApi(`tournament_bracket_matches?category_id=in.(${catIds})&round_name=eq.Final&status=eq.completed&select=winner_id`).catch(() => []);
  const champReady = finals.length > 0 && finals.every(f => f.winner_id);
  const champLabel = champReady ? 'Ready' : 'Pending';

  document.getElementById('t-modal-title').textContent = 'Complete & Lock Tournament';
  // Show the permanent X button in header
  const xBtnEl = document.getElementById('t-modal-close-x');
  if (xBtnEl) xBtnEl.style.display = 'flex';

  document.getElementById('t-modal-body').innerHTML = `
    <!-- Tournament context -->
    <div style="padding:10px 14px;background:#f8f9ff;border-radius:10px;border:0.5px solid #e0e7f5;margin-bottom:18px;">
      <div style="font-size:15px;font-weight:800;color:#0d1f4a;margin-bottom:2px;">${tName}</div>
      ${tDate ? `<div style="font-size:12px;font-weight:600;color:#6b7a99;margin-bottom:4px;">${tDate}</div>` : ''}
      <div style="font-size:11px;font-weight:600;color:#6b7a99;">${validations.length} Categor${validations.length!==1?'ies':'y'} · ${totalTeams} Players</div>
    </div>

    <!-- Divider -->
    <div style="border-top:0.5px solid #e0e7f5;margin-bottom:18px;"></div>

    <!-- Trophy + description -->
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;">
      <div style="width:36px;height:36px;border-radius:10px;background:#e8f0ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
      </div>
      <div>
        <div style="font-size:13px;font-weight:800;color:#0d1f4a;margin-bottom:4px;">Tournament Completion</div>
        <div style="font-size:12px;font-weight:600;color:#6b7a99;line-height:1.6;">This tournament will be marked as completed and moved to tournament history.<br>Results, standings, and brackets will become final.</div>
      </div>
    </div>

    <!-- Completion consequences — green milestone style -->
    <div style="background:rgba(36,188,150,0.08);border-left:4px solid #24BC96;border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#085041;margin-bottom:8px;">After completion:</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;display:flex;align-items:flex-start;gap:6px;"><span>✅</span><span>Final standings become official</span></div>
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;display:flex;align-items:flex-start;gap:6px;"><span>✅</span><span>Results remain visible to players</span></div>
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;display:flex;align-items:flex-start;gap:6px;"><span>✅</span><span>Tournament moves to completed tournaments</span></div>
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;display:flex;align-items:flex-start;gap:6px;"><span>🔒</span><span>Teams, brackets, and scores can no longer be edited — unless you reopen the tournament</span></div>
      </div>
    </div>

    <!-- Divider -->
    <div style="border-top:0.5px solid #e0e7f5;margin-bottom:18px;"></div>

    <!-- Tournament summary -->
    <div style="margin-bottom:18px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6b7a99;margin-bottom:10px;">Tournament Summary</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;">
          <div style="font-size:18px;font-weight:800;color:#0d1f4a;">${validations.length}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:1px;">Categories</div>
        </div>
        <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;">
          <div style="font-size:18px;font-weight:800;color:#0d1f4a;">${totalTeams}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:1px;">Teams</div>
        </div>
        <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;">
          <div style="font-size:18px;font-weight:800;color:#0d1f4a;">${totalMatchCount}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:1px;">Matches</div>
        </div>
        <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;">
          <div style="font-size:18px;font-weight:800;color:${champReady?'#24BC96':'#F26024'};">${champLabel}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:1px;">Champion(s)</div>
        </div>
      </div>
    </div>

    <!-- Confirmation checkbox -->
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:18px;">
      <input type="checkbox" id="t-complete-confirm-chk" style="margin-top:2px;width:15px;height:15px;cursor:pointer;accent-color:#174CCC;flex-shrink:0;">
      <label for="t-complete-confirm-chk" style="font-size:12px;font-weight:600;color:#0d1f4a;cursor:pointer;line-height:1.5;">I understand that tournament results will be locked.</label>
    </div>

    <!-- Button -->
    <div style="display:flex;justify-content:flex-end;">
      <button type="button" id="t-finalize-btn" onclick="tCheckFinalizeConfirm(${id})" disabled
        style="display:inline-flex;align-items:center;gap:6px;padding:10px 24px;border:none;border-radius:99px;background:#e0e7f5;color:#b0bbd6;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:not-allowed;transition:all .15s;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Finalize Tournament
      </button>
    </div>`;

  // Wire checkbox to enable/disable button
  document.getElementById('t-complete-confirm-chk')?.addEventListener('change', (e) => {
    const btn = document.getElementById('t-finalize-btn');
    if (btn) {
      btn.disabled = !e.target.checked;
      btn.style.background = e.target.checked ? 'linear-gradient(180deg,#24BC96,#1a9e7a)' : '#e0e7f5';
      btn.style.color = e.target.checked ? 'white' : '#b0bbd6';
      btn.style.cursor = e.target.checked ? 'pointer' : 'not-allowed';
    }
  });

  openTModal();
}

async function tCheckFinalizeConfirm(id) {
  const chk = document.getElementById('t-complete-confirm-chk');
  if (!chk?.checked) return;
  await confirmCompleteTournamentFromList(id);
}

async function confirmCompleteTournamentFromList(id) {
  await tApi(`tournaments?id=eq.${id}`, 'PATCH', { status: 'completed' });
  closeTModal();
  tToast('Tournament completed! 🏆');
  renderTournamentList();
}

async function tEditTournament(id) {
  const [t] = await tApi(`tournaments?id=eq.${id}&select=*`);
  const cats = await tApi(`tournament_categories?tournament_id=eq.${id}&select=id,name&order=id`);
  const isActive = t.status === 'active';
  const catEmojis = ['🏆','🎾','🏅','⚡','🔥','👑','🎯','🥇'];
  const editSVGsm = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const trashSVGsm = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;
  // Store edit state
  window._tEditId = id;
  window._tEditCats = cats.map(c => ({ id: c.id, name: c.name, isNew: false }));

  const renderEditCats = () => {
    const listEl = document.getElementById('t-edit-cat-list');
    const badge  = document.getElementById('t-edit-cat-count');
    if (!listEl) return;
    if (badge) badge.textContent = `${window._tEditCats.length} Added`;
    listEl.innerHTML = window._tEditCats.map((c, i) => `
      <div class="t-cat-card">
        <div class="t-cat-card-icon">${catEmojis[i % catEmojis.length]}</div>
        <div class="t-cat-card-name">${tEsc(c.name)}</div>
        ${isActive ? '' : `
          <button type="button" class="t-cat-ghost-btn" onclick="tEditExistingCat(${i})">${editSVGsm} Edit</button>
          <div class="t-cat-ghost-sep"></div>
          <button type="button" class="t-cat-ghost-btn remove" onclick="tRemoveExistingCat(${i})">${trashSVGsm} Remove</button>`}
      </div>`).join('');
    window._renderEditCats = renderEditCats;
  };

  document.getElementById('t-modal-title').textContent = 'Tournament Settings';
  document.getElementById('t-modal-body').innerHTML = `
    <button onclick="closeTModal()"
      style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
      onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
      onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div style="font-size:11px;font-weight:600;color:#6b7a99;margin-bottom:16px;">Update tournament information and categories.</div>
    ${isActive ? `<div style="padding:8px 12px;background:#fde8d8;border-radius:7px;font-size:12px;font-weight:600;color:#c04a0e;margin-bottom:14px;">⚠️ Tournament is active — categories are locked to protect team data. You can still update the name and date.</div>` : ''}
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:10px;">
      <div>
        <div class="t-new-field-lbl">Tournament Name</div>
        <input id="t-edit-name" class="t-new-input" type="text" value="${tEsc(t.name)}" required>
      </div>
      <div>
        <div class="t-new-field-lbl">Date</div>
        <input id="t-edit-date" class="t-new-input" type="date" value="${t.date || ''}">
      </div>
    </div>
    <div class="t-new-divider" style="margin:10px 0;"></div>
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div class="t-new-field-lbl" style="margin:0;">Tournament Categories</div>
        <span class="t-cat-count-badge" id="t-edit-cat-count">${cats.length} Added</span>
      </div>
      <div id="t-edit-cat-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>
      ${isActive ? '' : `
        <div class="t-cat-add-wrap">
          <input class="t-cat-add-input" type="text" id="t-edit-cat-input" placeholder="Type a category name and press Add...">
          <button type="button" class="t-cat-add-btn" onclick="tAddEditCat()">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add
          </button>
        </div>`}
    </div>
    <div class="t-new-divider" style="margin:10px 0;"></div>
    <div style="display:flex;justify-content:flex-end;">
      <button type="button" class="t-new-submit-btn" style="padding:8px 20px;" onclick="tSaveEditTournament()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Apply Updates
      </button>
    </div>`;
  openTModal();
  renderEditCats();

  // Wire Enter key on cat input
  const catIn = document.getElementById('t-edit-cat-input');
  if (catIn) catIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tAddEditCat(); }});
}

function tAddEditCat() {
  const input = document.getElementById('t-edit-cat-input');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  window._tEditCats.push({ id: null, name, isNew: true });
  input.value = '';
  input.focus();
  if (window._renderEditCats) window._renderEditCats();
}

function tRemoveExistingCat(idx) {
  window._tEditCats.splice(idx, 1);
  if (window._renderEditCats) window._renderEditCats();
}

function tEditExistingCat(idx) {
  const current = window._tEditCats[idx].name;
  document.getElementById('t-modal-title').textContent = 'Edit Category';
  document.getElementById('t-modal-body').innerHTML = `
    <div style="padding:8px 0 16px;">
      <div class="t-new-field-lbl">Category Name</div>
      <input id="t-edit-cat-name-input" class="t-new-input" type="text" value="${tEsc(current)}" style="width:100%;">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button type="button" class="t-op-btn" onclick="tEditTournament(window._tEditId)" style="width:auto;padding:8px 16px;">Cancel</button>
      <button type="button" class="t-new-submit-btn" style="padding:8px 20px;" onclick="tSaveExistingCatName(${idx})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Apply
      </button>
    </div>`;
}

function tSaveExistingCatName(idx) {
  const input = document.getElementById('t-edit-cat-name-input');
  const val = input ? input.value.trim() : '';
  if (!val) return;
  window._tEditCats[idx].name = val;
  tEditTournament(window._tEditId); // reopen modal with updated data
}

async function tSaveEditTournament() {
  const name = document.getElementById('t-edit-name')?.value.trim();
  const date = document.getElementById('t-edit-date')?.value || null;
  const id = window._tEditId;
  if (!name) { tToast('Tournament name is required.', true); return; }
  try {
    // Update tournament name + date
    await tApi(`tournaments?id=eq.${id}`, 'PATCH', { name, date });
    // Handle categories (skip if active — locked)
    const [t] = await tApi(`tournaments?id=eq.${id}&select=status`);
    if (t.status !== 'active') {
      const existing = await tApi(`tournament_categories?tournament_id=eq.${id}&select=id,name&order=id`);
      const keepIds  = window._tEditCats.filter(c => !c.isNew && c.id).map(c => c.id);
      // Delete removed categories
      for (const ec of existing) {
        if (!keepIds.includes(ec.id)) {
          await tApi(`tournament_teams?category_id=eq.${ec.id}`, 'DELETE').catch(()=>{});
          await tApi(`tournament_rr_matches?category_id=eq.${ec.id}`, 'DELETE').catch(()=>{});
          await tApi(`tournament_bracket_matches?category_id=eq.${ec.id}`, 'DELETE').catch(()=>{});
          await tApi(`tournament_groups?category_id=eq.${ec.id}`, 'DELETE').catch(()=>{});
          await tApi(`tournament_categories?id=eq.${ec.id}`, 'DELETE');
        }
      }
      // Update renamed existing cats
      for (const c of window._tEditCats.filter(c => !c.isNew && c.id)) {
        const orig = existing.find(e => e.id === c.id);
        if (orig && orig.name !== c.name) {
          await tApi(`tournament_categories?id=eq.${c.id}`, 'PATCH', { name: c.name });
        }
      }
      // Add new categories
      const newCats = window._tEditCats.filter(c => c.isNew);
      if (newCats.length) {
        await tApi('tournament_categories', 'POST',
          newCats.map(c => ({ tournament_id: id, name: c.name, status: 'setup' }))
        );
      }
    }
    closeTModal();
    tToast('Tournament updated!');
    renderTournamentList();
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

function tAddCategory() {
  const input = document.getElementById('t-cat-input');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  _tCategories.push(name);
  input.value = '';
  input.focus();
  _renderCategoryCards();
}

function tRemoveCategory(idx) {
  _tCategories.splice(idx, 1);
  _renderCategoryCards();
}

function _renderCategoryCards() {
  const list = document.getElementById('t-categories-list');
  const badge = document.getElementById('t-cat-count');
  if (!list) return;
  if (badge) badge.textContent = `${_tCategories.length} Added`;

  const editSVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  const trashSVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;

  list.innerHTML = _tCategories.map((cat, i) => {
    const emoji = _tCatEmojis[i % _tCatEmojis.length];
    return `<div class="t-cat-card">
      <div class="t-cat-card-icon">${emoji}</div>
      <div class="t-cat-card-name">${tEsc(cat)}</div>
      <button type="button" class="t-cat-ghost-btn" onclick="tEditCategory(${i})">${editSVG} Edit</button>
      <div class="t-cat-ghost-sep"></div>
      <button type="button" class="t-cat-ghost-btn remove" onclick="tRemoveCategory(${i})">${trashSVG} Remove</button>
    </div>`;
  }).join('');
}

function tEditCategory(idx) {
  const current = _tCategories[idx];
  document.getElementById('t-modal-title').textContent = 'Edit Category';
  document.getElementById('t-modal-body').innerHTML = `
    <button onclick="closeTModal()"
      style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
      onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
      onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div style="padding:8px 0 16px;">
      <div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Category Name</div>
      <input id="t-edit-cat-input" class="t-new-input" type="text" value="${tEsc(current)}" placeholder="e.g. Mixed Doubles 3.5" style="width:100%;">
    </div>
    <div style="display:flex;justify-content:flex-end;">
      <button type="button" class="t-new-submit-btn" style="padding:8px 20px;" onclick="tSaveEditCategory(${idx})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Apply Changes
      </button>
    </div>`;
  openTModal();
  setTimeout(() => {
    const input = document.getElementById('t-edit-cat-input');
    if (input) { input.focus(); input.select(); }
  }, 100);
}

function tSaveEditCategory(idx) {
  const input = document.getElementById('t-edit-cat-input');
  const val = input ? input.value.trim() : '';
  if (!val) return;
  _tCategories[idx] = val;
  closeTModal();
  _renderCategoryCards();
}

// ─── CREATE TOURNAMENT — now handled inline via collapsible panel ─────────
function showCreateTournament() { _tPanelOpen = true; _tCategories = []; renderTournamentList(); }
function addCategoryField() { tAddCategory(); }

async function createTournament(e) {
  e.preventDefault();
  const name = document.getElementById('t-name').value.trim();
  const date = document.getElementById('t-date').value || null;
  const categories = _tCategories.filter(Boolean);
  if (!name) { tToast('Tournament name is required.', true); return; }
  if (!date) { tToast('Please select a tournament date.', true); return; }
  if (!categories.length) { tToast('Please add at least one category before creating.', true); return; }
  try {
    // Validate no duplicate name + date combination
    let dupQuery = `tournaments?name=eq.${encodeURIComponent(name)}&select=id,name,date`;
    const existing = await tApi(dupQuery);
    const duplicate = existing.find(t => {
      if (!date && !t.date) return true;       // both have no date
      if (date && t.date && t.date === date) return true; // same date
      return false;
    });
    if (duplicate) {
      tToast(`A tournament named "${name}" ${date ? 'on this date ' : ''}already exists.`, true);
      return;
    }
    await tApi('tournaments', 'POST', { name, date, status: 'draft' });
    const [t] = await tApi(`tournaments?name=eq.${encodeURIComponent(name)}&status=eq.draft&select=*&order=id.desc&limit=1`);
    if (categories.length) {
      // Bulk insert all categories in a single POST
      await tApi('tournament_categories', 'POST',
        categories.map(cat => ({ tournament_id: t.id, name: cat, status: 'setup' }))
      );
    }
    tToast(`Tournament "${name}" created!`);
    _tPanelOpen = false;
    _tCategories = [];
    openTournament(t.id);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

// ─── DELETE TOURNAMENT ──────────────────────────────────────
async function deleteTournament(id) {
  const [t] = await tApi(`tournaments?id=eq.${id}&select=name,status`);
  const name   = t?.name   || 'this tournament';
  const status = t?.status || 'draft';

  // Block delete on active tournaments
  if (status === 'active') {
    document.getElementById('t-modal-title').textContent = 'Cannot Delete Active Tournament';
    document.getElementById('t-modal-body').innerHTML = `
      <button onclick="closeTModal()"
        style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
        onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
        onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div style="padding:8px 0 20px;">
        <p style="font-size:13px;color:#0d1f4a;line-height:1.6;">
          <strong>${tEsc(name)}</strong> is currently <strong>active</strong> and cannot be deleted.
          Please close the tournament first before deleting it.
        </p>
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button type="button" class="t-op-btn" onclick="closeTModal()" style="width:auto;padding:8px 16px;">OK</button>
      </div>`;
    openTModal();
    return;
  }

  // Fetch categories first, then teams + matches using their IDs
  const categories = await tApi(`tournament_categories?tournament_id=eq.${id}&select=id`).catch(() => []);
  const catIds = categories.length ? categories.map(c => c.id).join(',') : '0';
  const [teamsData, rrData, bracketData] = await Promise.all([
    tApi(`tournament_teams?category_id=in.(${catIds})&select=id`).catch(() => []),
    tApi(`tournament_rr_matches?category_id=in.(${catIds})&select=id`).catch(() => []),
    tApi(`tournament_bracket_matches?category_id=in.(${catIds})&select=id`).catch(() => []),
  ]);
  const catCount   = categories.length;
  const teamCount  = teamsData.length;
  const matchCount = rrData.length + bracketData.length;

  document.getElementById('t-modal-title').textContent = 'Delete Tournament Permanently';
  // Add orange top border to modal
  const modalEl = document.querySelector('.t-modal');
  if (modalEl) modalEl.style.borderTop = '3px solid #F26024';

  document.getElementById('t-modal-body').innerHTML = `
    <button onclick="(function(){const m=document.querySelector('.t-modal');if(m)m.style.borderTop='';closeTModal();})()"
      style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
      onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
      onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>

    <!-- Tournament name — subtle card, no label above -->
    <div style="background:#f4f5f8;border:0.5px solid #e0e7f5;border-radius:8px;padding:12px 16px;margin-bottom:14px;">
      <div style="font-size:15px;font-weight:800;color:#0d1f4a;">${tEsc(name)}</div>
    </div>

    <!-- Tournament metadata — vertical stacked rows -->
    <div style="background:#fafbff;border:0.5px solid #e0e7f5;border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#0d1f4a;min-width:36px;text-align:right;">${catCount}</span>
        <span style="font-size:12px;font-weight:600;color:#6b7a99;">Categor${catCount !== 1 ? 'ies' : 'y'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#0d1f4a;min-width:36px;text-align:right;">${teamCount}</span>
        <span style="font-size:12px;font-weight:600;color:#6b7a99;">Teams</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#0d1f4a;min-width:36px;text-align:right;">${matchCount}</span>
        <span style="font-size:12px;font-weight:600;color:#6b7a99;">Matches</span>
      </div>
    </div>

    <!-- Warning box -->
    <div style="background:#fde8d8;border:0.5px solid rgba(242,96,36,0.3);border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <div style="font-size:12px;font-weight:800;color:#c04a0e;margin-bottom:4px;">This action cannot be undone</div>
      <div style="font-size:12px;font-weight:600;color:#9a3a0a;line-height:1.5;">All categories, teams, and matches will be permanently removed.</div>
    </div>

    <!-- CTA -->
    <div style="display:flex;justify-content:flex-end;">
      <button type="button" class="t-op-btn t-op-btn-danger" onclick="confirmDeleteTournament(${id})" style="width:auto;padding:10px 20px;font-size:12px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        Delete Tournament
      </button>
    </div>`;
  openTModal();

  // Remove orange border when modal closes
  const origClose = window._origCloseTModal;
  if (!origClose) {
    window._origCloseTModal = closeTModal;
    window.closeTModalWithReset = () => {
      const m = document.querySelector('.t-modal');
      if (m) m.style.borderTop = '';
      closeTModal();
    };
  }
}

async function confirmDeleteTournament(id) {
  try {
    const categories = await tApi(`tournament_categories?tournament_id=eq.${id}&select=id`);
    if (categories.length) {
      const catIds = categories.map(c => c.id).join(',');
      // Delete child tables in parallel. tournament_groups must go after teams + rr
      // because teams.group_id and rr.group_id reference it (ON DELETE SET NULL,
      // so it would technically also work in any order, but cleanest to do it
      // after the things that reference it).
      await Promise.all([
        tApi(`tournament_rr_matches?category_id=in.(${catIds})`, 'DELETE'),
        tApi(`tournament_bracket_matches?category_id=in.(${catIds})`, 'DELETE'),
        tApi(`tournament_teams?category_id=in.(${catIds})`, 'DELETE'),
      ]);
      // Now safe to delete the groups themselves
      await tApi(`tournament_groups?category_id=in.(${catIds})`, 'DELETE');
    }
    await tApi(`tournament_categories?tournament_id=eq.${id}`, 'DELETE');
    await tApi(`tournaments?id=eq.${id}`, 'DELETE');
    const m = document.querySelector('.t-modal');
    if (m) m.style.borderTop = '';
    closeTModal();
    tToast('Tournament deleted.');
    renderTournamentList();
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

// ─── OPEN TOURNAMENT ────────────────────────────────────────
async function openTournament(id) {
  // Only preserve tCurrentCategoryId if it belongs to THIS tournament
  if (tCurrentTournamentId !== id) {
    tCurrentCategoryId = null;
  }
  tCurrentTournamentId = id;

  const el = document.getElementById('t-content');
  el.innerHTML = `<div class="t-loading">Loading tournament...</div>`;
  const [t] = await tApi(`tournaments?id=eq.${id}&select=*`);

  // ── Sync sidebar + dropdown only for active tournaments ───────────────
  if (t?.status === 'active') {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const tPage = document.getElementById('page-t-tournaments');
    if (tPage) tPage.classList.add('active');
    if (typeof sbSetActive === 'function') sbSetActive('tournament-view');
    const sel = document.getElementById('tournament-selector');
    if (sel) {
      if (!sel.querySelector(`option[value="${id}"]`)) {
        if (typeof loadTournamentSelector === 'function') await loadTournamentSelector();
      }
      sel.value = id;
    }
  }
  // ─────────────────────────────────────────────────────────────────────
  const categories = await tApi(`tournament_categories?tournament_id=eq.${id}&select=*&order=id`);
  // Validate tCurrentCategoryId belongs to this tournament's categories
  const validCatIds = categories.map(c => c.id);
  if (!tCurrentCategoryId || !validCatIds.includes(tCurrentCategoryId)) {
    tCurrentCategoryId = categories[0]?.id || null;
  }
  renderTournamentDetail(t, categories);
}

function renderTournamentDetail(t, categories) {
  const el = document.getElementById('t-content');
  const dateStr = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric',year:'numeric'}) : 'No date set';

  // Compute live header meta from categories data
  const totalTeams = 0; // will be updated when category loads
  const catCount = categories.length;
  const statusLabel = t.status === 'active' ? 'Active' : t.status === 'completed' ? 'Completed' : 'Draft';
  const statusPillStyle = t.status === 'active'
    ? 'background:#d4f5ed;color:#085041;'
    : t.status === 'completed'
    ? 'background:#e8f0ff;color:#174CCC;'
    : 'background:#f4f5f8;color:#6b7a99;';

  // Progress label
  const progressLabel = t.status === 'draft' ? 'Not Started' : t.status === 'active' ? 'In Progress' : 'Completed';
  const progressColor = t.status === 'draft' ? '#b0bbd6' : t.status === 'active' ? '#24BC96' : '#174CCC';

  // Start Tournament button — disabled until active
  const canStart = t.status === 'draft';
  const startBtnHTML = t.status === 'completed' ? '' : `
    <button id="td-start-btn"
      onclick="${t.status === 'draft' ? `startTournament(${t.id})` : `completeTournament(${t.id})`}"
      style="display:inline-flex;align-items:center;gap:6px;padding:9px 20px;border:none;border-radius:99px;
             background:${t.status === 'active' ? 'linear-gradient(180deg,#F26024,#d44e10)' : 'linear-gradient(180deg,#2456d3 0%,#174CCC 100%)'};
             color:white;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;cursor:pointer;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      ${t.status === 'active' ? 'Complete Tournament' : 'Start Tournament'}
    </button>`;

  // Category emojis — cycle through
  const catEmojis = ['🏆','🎾','🏅','⚡','🔥','👑','🎯','🥇'];

  const divTabsHTML = categories.map((cat, i) => {
    const isActive = cat.id === tCurrentCategoryId;
    const emoji = catEmojis[i % catEmojis.length];
    const catStatusLabel = cat.status === 'active' ? 'Active' : cat.status === 'completed' ? 'Completed' : 'Draft';
    const pillStyle = isActive
      ? 'background:rgba(255,255,255,0.2);color:white;'
      : 'background:rgba(23,76,204,0.1);color:#174CCC;';
    return `
      <div class="td-div-tab ${isActive ? 'active' : ''}" onclick="switchCategory(${cat.id}, ${t.id})" style="cursor:pointer;">
        <div style="font-size:16px;margin-bottom:5px;">${emoji}</div>
        <div class="td-div-tab-name">${tEsc(cat.name)}</div>
        <div class="td-div-tab-intel" id="td-div-intel-${cat.id}">Loading...</div>
        <div class="td-div-status-pill" style="${pillStyle}">${tEsc(catStatusLabel)}</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="padding:20px 28px 0;">
    <div class="td-header">
      <div class="td-identity">
        <div class="td-name">${tEsc(t.name)}</div>
        <div class="td-date">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${dateStr}
        </div>
      </div>
      <div class="td-meta">
        <div class="td-meta-item">
          <span class="td-status-chip" style="${statusPillStyle}">${statusLabel}</span>
          <div class="td-meta-lbl">Status</div>
        </div>
        <div class="td-meta-sep"></div>
        <div class="td-meta-item">
          <div class="td-meta-val" id="td-total-teams">—</div>
          <div class="td-meta-lbl">Teams</div>
        </div>
        <div class="td-meta-sep"></div>
        <div class="td-meta-item">
          <div class="td-meta-val">${catCount}</div>
          <div class="td-meta-lbl">Categories</div>
        </div>
        <div class="td-meta-sep"></div>
        <div class="td-meta-item">
          <div class="td-meta-val" style="font-size:13px;font-weight:800;color:${progressColor};font-family:'Montserrat',sans-serif;">${progressLabel}</div>
          <div class="td-meta-lbl">Progress</div>
        </div>
      </div>
    </div>
    </div>

    <div style="padding:8px 28px 0;">
    <div class="td-action-bar">
      <span class="td-start-hint" id="td-start-hint" style="display:none;font-size:10px;font-weight:700;color:#b0bbd6;padding:0 6px;"></span>
      ${startBtnHTML}
      <button onclick="window.app.openTournamentNotifyModal(${t.id})" class="btn btn-teal btn-sm">Notify Players</button>
      <button onclick="printTournamentRoster(this)"
        data-tid="${t.id}" data-tname="${tEsc(t.name)}" data-tdate="${tEsc(t.date || '')}"
        data-catids="${categories.map(c => c.id).join(',')}"
        data-catnames="${categories.map(c => tEsc(c.name)).join('||')}"
        style="min-width:34px;height:34px;padding:0 10px;border:0.5px solid #e0e7f5;border-radius:8px;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6b7a99;white-space:nowrap;" title="Print Roster">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      </button>
    </div>
    </div>

    <div style="padding:16px 28px 0;">
      <div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(23,76,204,0.06);">
        <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;padding:12px 16px 6px;">Divisions</div>
        <div style="display:flex;gap:8px;padding:0 12px 12px;flex-wrap:wrap;" id="td-division-tabs">
          ${divTabsHTML}
        </div>
      </div>
    </div>

    <div style="padding:16px 28px 0;" id="td-setup-progression"></div>
    <div style="padding:0 28px 28px;" id="t-category-content"><div class="t-loading">Loading...</div></div>
  `;

  if (tCurrentCategoryId) loadCategory(tCurrentCategoryId, t);
}
async function switchCategory(catId, tId) {
  tCurrentCategoryId = catId;
  document.querySelectorAll('.td-div-tab').forEach(b => b.classList.remove('active'));
  const activeTab = document.querySelector(`.td-div-tab[onclick*="${catId}"]`);
  if (activeTab) activeTab.classList.add('active');
  document.getElementById('t-category-content').innerHTML = '<div class="t-loading">Loading...</div>';
  const [t] = await tApi(`tournaments?id=eq.${tId}&select=*`);
  loadCategory(catId, t);
}

async function loadCategory(catId, t) {
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=*`);
  const [teams, rrMatches, bracketMatches, groups, allTournCats] = await Promise.all([
    tApi(`tournament_teams?category_id=eq.${catId}&select=*&order=id`),
    tApi(`tournament_rr_matches?category_id=eq.${catId}&select=*&order=round,court`),
    tApi(`tournament_bracket_matches?category_id=eq.${catId}&select=*&order=id`),
    tApi(`tournament_groups?category_id=eq.${catId}&select=*&order=position`),
    tApi(`tournament_categories?tournament_id=eq.${t.id}&select=id`),
  ]);
  // Fetch team counts for all categories in this tournament (for cross-category Start button validation)
  const allCatIds = allTournCats.map(c => c.id).join(',') || '0';
  const allTeams = await tApi(`tournament_teams?category_id=in.(${allCatIds})&select=id,category_id`);
  const teamCountByCat = {};
  allTeams.forEach(tm => { teamCountByCat[tm.category_id] = (teamCountByCat[tm.category_id] || 0) + 1; });
  const allCatsHave4 = allTournCats.every(c => (teamCountByCat[c.id] || 0) >= 4);
  renderCategory(cat, teams, rrMatches, bracketMatches, t, groups, allCatsHave4);
}

function renderCategory(cat, teams, rrMatches, bracketMatches, tournament, groups = [], allCatsHave4 = false) {
  const el = document.getElementById('t-category-content');
  const useGroups = groups.length > 0;
  const standings = useGroups ? null : tCalcStandings(teams, rrMatches);
  const rrComplete = rrMatches.length > 0 && rrMatches.filter(m => m.status === 'pending').length === 0;
  const tMap = {}; teams.forEach(t => tMap[t.id] = t);
  let groupViews = [];
  if (useGroups) {
    groupViews = groups.map(g => {
      const groupTeams = teams.filter(t => t.group_id === g.id);
      const groupMatches = rrMatches.filter(m => m.group_id === g.id);
      return { group: g, teams: groupTeams, matches: groupMatches, standings: tCalcStandings(groupTeams, groupMatches) };
    });
  }

  const singlesMode = isSingles(cat.name);
  const entityCap = singlesMode ? 'Player' : 'Team';
  const entityLow = singlesMode ? 'player' : 'team';

  // ── Update division tab intel ──────────────────────────────────────────
  const intelEl = document.getElementById(`td-div-intel-${cat.id}`);
  if (intelEl) {
    const rrTotal = rrMatches.filter(m => m.status !== 'bye').length;
    const rrDone  = rrMatches.filter(m => m.status === 'completed').length;
    let intel = `${teams.length} ${teams.length !== 1 ? (singlesMode ? 'players' : 'teams') : entityLow}`;
    if (rrMatches.length > 0) intel += ` · ${rrDone}/${rrTotal} RR Matches`;
    if (bracketMatches.length > 0) intel += ` · Bracket Live`;
    intelEl.textContent = intel;
  }

  // ── Update total teams in header ──────────────────────────────────────
  const totalTeamsEl = document.getElementById('td-total-teams');
  if (totalTeamsEl) totalTeamsEl.textContent = teams.length;

  // ── Setup progression ─────────────────────────────────────────────────
  const rrTotal2 = rrMatches.filter(m => m.status !== 'bye').length;
  const rrDone2  = rrMatches.filter(m => m.status === 'completed').length;
  // step1Done: ALL categories in this tournament must have >= 4 teams
  const step1Done = allCatsHave4;
  const step2Done = rrComplete;
  const step3Done = bracketMatches.length > 0 && bracketMatches.every(m => m.status === 'completed');
  const step4Done = tournament.status === 'completed';

  const stepIcon = (done, current, num) => {
    if (done) return `<div class="td-step-icon done"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>`;
    if (current) return `<div class="td-step-icon current">${num}</div>`;
    return `<div class="td-step-icon locked"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b0bbd6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>`;
  };
  const stepLbl = (done, current, label) => {
    const cls = done ? 'done' : current ? 'current' : 'locked';
    return `<div class="td-step-lbl ${cls}">${label}</div>`;
  };
  const s1done = step1Done, s2done = step2Done, s3done = step3Done;
  const s1cur  = !s1done, s2cur = s1done && !s2done, s3cur = s2done && !s3done, s4cur = s3done && !step4Done;
  const connCls = (done) => done ? 'td-step-conn done' : 'td-step-conn';

  const progressionEl = document.getElementById('td-setup-progression');
  if (progressionEl) {
    progressionEl.innerHTML = `
      <div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;padding:14px 20px;box-shadow:0 1px 4px rgba(23,76,204,0.06);margin-bottom:16px;">
        <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Tournament Setup Progress
        </div>
        <div style="display:flex;align-items:flex-start;margin-top:4px;">
          <!-- Step 1 -->
          <div style="display:flex;flex-direction:column;align-items:center;flex:0 0 auto;">
            ${stepIcon(s1done, s1cur, '1')}
            ${stepLbl(s1done, s1cur, 'Teams Added')}
          </div>
          <!-- Connector 1→2 -->
          <div class="${connCls(s1done)}" style="height:2px;flex:1;margin-top:13px;"></div>
          <!-- Step 2 -->
          <div style="display:flex;flex-direction:column;align-items:center;flex:0 0 auto;">
            ${stepIcon(s2done, s2cur, '2')}
            ${stepLbl(s2done, s2cur, 'Round Robin')}
          </div>
          <!-- Connector 2→3 -->
          <div class="${connCls(s2done)}" style="height:2px;flex:1;margin-top:13px;"></div>
          <!-- Step 3 -->
          <div style="display:flex;flex-direction:column;align-items:center;flex:0 0 auto;">
            ${stepIcon(s3done, s3cur, '3')}
            ${stepLbl(s3done, s3cur, 'Bracket Setup')}
          </div>
          <!-- Connector 3→4 -->
          <div class="${connCls(s3done)}" style="height:2px;flex:1;margin-top:13px;"></div>
          <!-- Step 4 -->
          <div style="display:flex;flex-direction:column;align-items:center;flex:0 0 auto;">
            ${stepIcon(step4Done, s4cur, '4')}
            ${stepLbl(step4Done, s4cur, 'Start Tournament')}
          </div>
        </div>
      </div>`;
  }

  // ── Update Start button hint ──────────────────────────────────────────
  // Only requirement: at least 4 teams. RR and bracket happen AFTER starting.
  const hintEl  = document.getElementById('td-start-hint');
  const startBtn = document.getElementById('td-start-btn');
  if (hintEl && startBtn) {
    if (tournament.status !== 'draft') {
      // Active — Complete Tournament button, always enabled
      hintEl.style.display = 'none';
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
    } else if (!step1Done) {
      // Fewer than 4 teams — disabled
      hintEl.textContent = 'Add at least 4 teams to start tournament';
      hintEl.style.display = 'inline';
      startBtn.style.opacity = '0.45';
      startBtn.style.cursor = 'not-allowed';
      startBtn.onclick = null;
    } else {
      // 4+ teams — enabled
      hintEl.style.display = 'none';
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
      startBtn.onclick = () => startTournament(tournament.id);
    }
  }

  // ── SVG helpers ───────────────────────────────────────────────────────
  const lockSVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b0bbd6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

  // ── Section header helper ─────────────────────────────────────────────
  const sectionHdr = (num, label, count, actionHTML, locked) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:0.5px solid #f0f2f8;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:22px;height:22px;border-radius:50%;background:${locked ? '#f0f2f8' : '#174CCC'};color:${locked ? '#b0bbd6' : 'white'};font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${num}</div>
        <div style="font-size:12px;font-weight:800;color:${locked ? '#b0bbd6' : '#0d1f4a'};letter-spacing:.3px;text-transform:uppercase;">${label}${count !== null ? ` <span style="font-size:11px;font-weight:600;color:#6b7a99;text-transform:none;">${count}</span>` : ''}</div>
      </div>
      ${actionHTML}
    </div>`;

  const lockedHdr = (label) => `<div style="font-size:10px;font-weight:700;color:#b0bbd6;display:flex;align-items:center;gap:5px;">${lockSVG} ${label}</div>`;

  let html = '';

  // ── SECTION 1: Team Registration ──────────────────────────────────────
  const addTeamBtn = tournament.status === 'draft'
    ? `<button onclick="showAddTeam(${cat.id})" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3 0%,#174CCC 100%);color:white;font-size:11px;font-weight:700;cursor:pointer;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add ${entityCap}
      </button>`
    : '';

  const teamsBody = teams.length
    ? `<div style="display:flex;flex-direction:column;gap:8px;padding:16px 20px;">
        ${teams.map((team, i) => {
          const players = [team.player1_id, team.player2_id, team.player3_id, team.player4_id]
            .filter(Boolean).map(id => { const p = tAllPlayers.find(x => x.id === id); return p ? `${p.first_name} ${p.last_name}` : '?'; });
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f8f9ff;border:0.5px solid #e0e7f5;border-radius:8px;">
            <div style="width:24px;height:24px;border-radius:50%;background:#174CCC;color:white;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
            <div style="flex:1;">
              <div style="font-size:12px;font-weight:800;color:#0d1f4a;">${tEsc(team.name)}</div>
              ${!singlesMode ? `<div style="font-size:11px;font-weight:600;color:#6b7a99;">${players.join(' & ')}</div>` : ''}
            </div>
            ${tournament.status !== 'completed' && !singlesMode ? `<button onclick="editTeam(${team.id}, ${cat.id})" style="width:24px;height:24px;border:none;background:transparent;color:#174CCC;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;border-radius:5px;" title="Edit">✏️</button>` : ''}
            ${tournament.status === 'draft' ? `<button onclick="deleteTeam(${team.id}, ${cat.id})" data-tname="${tEsc(team.name)}" style="width:22px;height:22px;border:none;background:transparent;color:#e53935;cursor:pointer;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;">×</button>` : ''}
          </div>`;
        }).join('')}
      </div>`
    : `<div style="text-align:center;padding:28px 16px;">
        <div style="font-size:14px;font-weight:800;color:#0d1f4a;margin-bottom:4px;">No ${singlesMode ? 'Players' : 'Teams'} Added Yet</div>
        <div style="font-size:12px;font-weight:600;color:#6b7a99;">Add ${singlesMode ? 'players' : 'teams'} to begin building the tournament bracket.</div>
      </div>`;

  html += `<div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(23,76,204,0.06);margin-bottom:12px;">
    ${sectionHdr(1, 'Team Registration', teams.length ? `${teams.length} ${teams.length !== 1 ? (singlesMode ? 'players' : 'teams') : entityLow}` : null, addTeamBtn, false)}
    ${teamsBody}
  </div>`;

  // ── SECTION 2: Round Robin Setup ──────────────────────────────────────
  const rrTotal = rrMatches.filter(m => m.status !== 'bye').length;
  const rrDone  = rrMatches.filter(m => m.status === 'completed').length;
  const rrPct   = rrTotal > 0 ? Math.round((rrDone / rrTotal) * 100) : 0;
  const rrLocked = teams.length < 4;

  let rrActionHTML = '';
  if (!rrLocked && rrMatches.length === 0 && tournament.status !== 'draft') {
    rrActionHTML = `<button onclick="showRRFormatModal(${cat.id})" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3 0%,#174CCC 100%);color:white;font-size:11px;font-weight:700;cursor:pointer;">Generate Round Robin</button>`;
  } else if (!rrLocked && rrMatches.length === 0 && tournament.status === 'draft') {
    rrActionHTML = `<span style="font-size:10px;font-weight:700;color:#b0bbd6;">Start tournament first</span>`;
  } else if (rrMatches.length > 0) {
    const rrPctLabel = rrTotal > 0 ? Math.round((rrDone / rrTotal) * 100) : 0;
    rrActionHTML = `<span style="font-size:10px;font-weight:700;color:#6b7a99;">${rrDone} of ${rrTotal} Matches Reported <span style="margin-left:6px;font-size:10px;font-weight:800;color:${rrPctLabel === 100 ? '#24BC96' : '#174CCC'};">${rrPctLabel}% Complete</span></span>`;
  }

  let rrBody = '';
  if (rrLocked) {
    rrBody = `<div style="padding:12px 20px;">
      <div style="background:#fafbff;border:0.5px solid #e0e7f5;border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:14px;">
        <div style="width:36px;height:36px;border-radius:8px;background:#f0f2f8;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${lockSVG}</div>
        <div>
          <div style="font-size:12px;font-weight:800;color:#6b7a99;margin-bottom:2px;">Round Robin Available After Team Setup</div>
          <div style="font-size:11px;font-weight:600;color:#b0bbd6;">Add at least 4 ${singlesMode ? 'players' : 'teams'} to generate the round robin schedule.</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
            <div style="width:6px;height:6px;border-radius:50%;background:${step1Done ? '#24BC96' : '#e0e7f5'};"></div>
            <div style="width:6px;height:6px;border-radius:50%;background:#174CCC;"></div>
            <div style="width:6px;height:6px;border-radius:50%;background:#e0e7f5;"></div>
            <div style="width:6px;height:6px;border-radius:50%;background:#e0e7f5;"></div>
            <span style="font-size:10px;font-weight:600;color:#b0bbd6;margin-left:4px;">Step 2 of 4</span>
          </div>
        </div>
      </div>
    </div>`;
  } else if (rrMatches.length > 0) {
    rrBody = `<div style="padding:12px 20px 16px;">
      ${rrTotal > 0 ? `<div class="t-progress-bar" style="margin-bottom:12px;"><div class="t-progress-fill" style="width:${rrPct}%;"></div></div>` : ''}
      ${useGroups ? renderGroupedRR(groupViews, tMap, tournament, cat) : `<div class="t-rr-grid">${renderRRRounds(rrMatches, tMap, tournament)}</div>${rrDone > 0 ? tRenderStandings(standings, cat.name) : ''}`}
    </div>`;
  } else {
    rrBody = `<div style="padding:16px 20px;font-size:12px;font-weight:600;color:#6b7a99;">Generate the schedule to start round robin play.</div>`;
  }

  html += `<div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(23,76,204,0.06);margin-bottom:12px;${rrLocked ? 'opacity:0.75;' : ''}">
    ${sectionHdr(2, 'Round Robin Live Board', rrMatches.length > 0 ? `${useGroups ? groups.length + ' groups' : ''}` : null, rrLocked ? lockedHdr('Available after team setup') : rrActionHTML, rrLocked)}
    ${rrBody}
  </div>`;

  // ── SECTION 3: Bracket Builder / Finals Bracket ──────────────────────
  const bracketLocked = !rrComplete && bracketMatches.length === 0;
  if (rrComplete || bracketMatches.length > 0) {
    let seededPreview = null, lockedFinalsSize = null;
    if (useGroups && cat.finals_per_group) {
      seededPreview = tBuildSeededAdvancement(groupViews.map(gv => gv.standings), cat.finals_per_group);
      lockedFinalsSize = seededPreview.length;
    }

    // ── Teams advancing segmented buttons (hidden input keeps generateBracket working)
    const teamOpts = [2,3,4,6,8];
    const teamsAdvHtml = useGroups
      ? `<span style="background:#e8f0ff;color:#174CCC;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;">Top ${cat.finals_per_group} per group → ${lockedFinalsSize} teams</span>
         <input type="hidden" id="finals-size-${cat.id}" value="${lockedFinalsSize}">`
      : `<div style="display:flex;flex-wrap:wrap;gap:6px;">
           ${teamOpts.map(n => `<button type="button"
             onclick="bbSelectTeams(this, ${cat.id})"
             data-val="${n}"
             style="padding:6px 14px;border-radius:8px;border:1px solid ${n===4?'transparent':'#e0e7f5'};background:${n===4?'#174CCC':'white'};color:${n===4?'white':'#6b7a99'};font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;cursor:pointer;">
             Top ${n}
           </button>`).join('')}
         </div>
         <input type="hidden" id="finals-size-${cat.id}" value="4">`;

    // ── Bracket type (single option, extensible) ──────────────────────
    const bracketTypeHtml = `
      <button type="button"
        style="padding:6px 16px;border-radius:8px;border:1px solid transparent;background:#174CCC;color:white;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;cursor:pointer;min-width:160px;">
        Single Elimination
      </button>
      <input type="hidden" id="finals-elim-${cat.id}" value="single">`;

    // ── Match format small cards (4 per row = 2 rows) ─────────────────
    const fmtOpts = [
      {v:'play11_win1',l:'11 win by 1'},
      {v:'play11_win2',l:'11 win by 2'},
      {v:'play15_win1',l:'15 win by 1'},
      {v:'play15_win2',l:'15 win by 2'},
      {v:'play21_win1',l:'21 win by 1'},
      {v:'play21_win2',l:'21 win by 2'},
      {v:'best_of_3',  l:'Best of 3'},
      {v:'best_of_5',  l:'Best of 5'},
    ];
    const fmtCardsHtml = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;">
        ${fmtOpts.map(f => `<button type="button"
          onclick="bbSelectFormat(this, ${cat.id})"
          data-val="${f.v}"
          style="padding:6px 4px;border-radius:7px;border:1px solid ${f.v==='play11_win2'?'transparent':'#e0e7f5'};background:${f.v==='play11_win2'?'#174CCC':'white'};color:${f.v==='play11_win2'?'white':'#6b7a99'};font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;cursor:pointer;text-align:center;white-space:nowrap;">
          ${f.l}
        </button>`).join('')}
      </div>
      <input type="hidden" id="finals-score-format-${cat.id}" value="play11_win2">`;

    // ── Qualified teams preview ───────────────────────────────────────
    const previewSource = useGroups && seededPreview ? seededPreview : (standings || []);
    const defaultCount = lockedFinalsSize || 4;
    const previewTeams = previewSource.slice(0, defaultCount);
    const seedColors = ['#174CCC','#6b7a99','#9a8c7a','#b0bbd6','#c5d6f5','#d9d9d9'];
    const qualifiedPreviewHtml = previewTeams.map((s, i) => {
      const diff = s.pts_for - s.pts_against;
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      const diffColor = diff > 0 ? '#24BC96' : diff < 0 ? '#e53935' : '#6b7a99';
      const team = teams ? teams.find(t => t.id === s.id) : null;
      const players = team ? getTeamPlayerNames(team) : '';
      const groupTag = useGroups && groups && s._groupIndex !== undefined
        ? `<span style="font-size:9px;font-weight:600;color:#174CCC;background:#e8f0ff;padding:1px 6px;border-radius:99px;margin-left:4px;">Group ${tEsc(groups[s._groupIndex]?.name||'?')} #${s._groupRank}</span>`
        : '';
      return `<div data-preview-row="${i}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f8f9ff;border:0.5px solid #e0e7f5;border-radius:8px;margin-bottom:6px;">
        <div style="width:22px;height:22px;border-radius:50%;background:${seedColors[i]||'#b0bbd6'};color:white;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div>
        <div style="flex:1;">
          <span style="font-size:12px;font-weight:800;color:#0d1f4a;">${tEsc(s.name)}</span>
          ${players ? `<span style="font-size:10px;font-weight:500;color:#6b7a99;"> (${tEsc(players)})</span>` : ''}
          ${groupTag}
        </div>
        <div style="font-size:11px;font-weight:700;white-space:nowrap;">
          <span style="color:#6b7a99;">${s.w}W ${s.l}L</span>
          <span style="color:${diffColor};margin-left:6px;">${diffStr}</span>
        </div>
      </div>`;
    }).join('');

    // ── Config labels shared style ────────────────────────────────────
    const cfgLbl = (t) => `<div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:8px;">${t}</div>`;
    const cfgDivider = `<div style="border-top:0.5px solid #e0e7f5;margin:14px 0;"></div>`;

    let bracketBody = bracketMatches.length > 0 ? (() => {
      // ── Bracket intelligence ────────────────────────────────────────
      const roundOrder = ['R32','R16','QF','Semifinals','3rd Place','Final'];
      const grouped = {};
      bracketMatches.forEach(m => { if(!grouped[m.round_name]) grouped[m.round_name]=[]; grouped[m.round_name].push(m); });
      const sfCount = (grouped['Semifinals']||[]).length;
      const finalCount = (grouped['Final']||[]).length;
      const totalMatches = bracketMatches.filter(m => m.status !== 'bye').length;
      const completedMatches = bracketMatches.filter(m => m.status === 'completed').length;
      const allDone = completedMatches === totalMatches && totalMatches > 0;

      // Derive subtext from stored cat data
      const fmtLabel = T_FORMATS[cat.finals_format_score] || '';
      const fmtDisplay = fmtLabel.replace(', win by ', ', win by ');
      const sizeLabel = cat.finals_size ? `Top ${cat.finals_size}` : '';
      const subtext = [singleEliminationLabel(cat.finals_format), sizeLabel, fmtDisplay].filter(Boolean).join(' • ');

      const statusDot = allDone
        ? `<div style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:800;color:#24BC96;"><div style="width:7px;height:7px;border-radius:50%;background:#24BC96;"></div>Completed</div>`
        : `<div style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:800;color:#F26024;"><div style="width:7px;height:7px;border-radius:50%;background:#F26024;"></div>In Progress</div>`;

      const intelligenceHTML = `
        <div style="display:flex;gap:16px;padding:12px 20px;border-bottom:0.5px solid #f0f2f8;flex-wrap:wrap;align-items:center;">
          ${sfCount > 0 ? `<div style="display:flex;flex-direction:column;gap:2px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#0d1f4a;line-height:1;">${sfCount}</div>
            <div style="font-size:9px;font-weight:700;color:#6b7a99;text-transform:uppercase;letter-spacing:.5px;">Semifinals</div>
          </div>
          <div style="width:1px;background:#e0e7f5;align-self:stretch;"></div>` : ''}
          <div style="display:flex;flex-direction:column;gap:2px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#0d1f4a;line-height:1;">${finalCount}</div>
            <div style="font-size:9px;font-weight:700;color:#6b7a99;text-transform:uppercase;letter-spacing:.5px;">Final</div>
          </div>
          <div style="width:1px;background:#e0e7f5;align-self:stretch;"></div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#0d1f4a;line-height:1;">${completedMatches}/${totalMatches}</div>
            <div style="font-size:9px;font-weight:700;color:#6b7a99;text-transform:uppercase;letter-spacing:.5px;">Results Reported</div>
          </div>
          <div style="width:1px;background:#e0e7f5;align-self:stretch;"></div>
          ${statusDot}
        </div>`;

      return `${intelligenceHTML}<div style="padding:12px 20px 16px;">${renderBracket(bracketMatches, tMap, tournament)}</div>`;
    })() : `<div style="padding:16px 20px 20px;">
        <div style="font-size:11px;font-weight:600;color:#6b7a99;margin-bottom:14px;">Select finalists, bracket type, and match format before generating the finals bracket.</div>

        ${cfgLbl('Teams Advancing')}
        <div style="margin-bottom:14px;">${teamsAdvHtml}</div>

        ${cfgLbl('Bracket Type')}
        <div style="margin-bottom:14px;">${bracketTypeHtml}</div>

        ${cfgDivider}

        ${cfgLbl('Match Format')}
        <div style="margin-bottom:14px;">${fmtCardsHtml}</div>

        ${cfgDivider}

        ${cfgLbl('Qualified Teams Preview')}
        <div id="bb-preview-${cat.id}" style="margin-bottom:16px;">${qualifiedPreviewHtml}</div>

        <div style="display:flex;justify-content:flex-end;">
          <button onclick="generateBracket(${cat.id}, ${cat.tournament_id})"
            style="display:inline-flex;align-items:center;gap:7px;padding:10px 22px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3,#174CCC);color:white;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Generate Finals Bracket
          </button>
        </div>
      </div>`;

    // ── Section title changes based on state ──────────────────────────
    const sectionTitle = bracketMatches.length > 0 ? 'Finals Bracket' : 'Bracket Builder';
    const finalsSubtext = bracketMatches.length > 0 ? (() => {
      const fmtLbl = T_FORMATS[cat.finals_format_score] || '';
      const sizeLbl = cat.finals_size ? `Top ${cat.finals_size}` : '';
      return [sizeLbl, fmtLbl].filter(Boolean).join(' • ');
    })() : null;

    const bracketSubtextHtml = finalsSubtext ? `<span style="font-size:10px;font-weight:600;color:#6b7a99;">${tEsc(finalsSubtext)}</span>` : '';
    html += `<div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(23,76,204,0.06);margin-bottom:12px;">
      ${sectionHdr(3, sectionTitle, null, bracketSubtextHtml, false)}
      ${bracketBody}
    </div>`;

    // ── SECTION 4: Live Results ─────────────────────────────────────────
    const hasResults = bracketMatches.some(m => m.status === 'completed');
    if (hasResults || tournament.status === 'completed') {
      const resultBody = `<div style="padding:12px 20px 16px;">${standings ? tRenderStandings(standings, cat.name) : ''}</div>`;
      html += `<div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(23,76,204,0.06);margin-bottom:12px;">
        ${sectionHdr(4, 'Live Results', null, '', false)}
        ${resultBody}
      </div>`;
    }
  } else {
    // Show locked sections 3 and 4
    html += `<div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(23,76,204,0.06);margin-bottom:12px;opacity:0.6;">
      ${sectionHdr(3, 'Bracket Builder', null, lockedHdr('Locked until RR complete'), true)}
      <div style="padding:10px 20px 14px;font-size:11px;font-weight:600;color:#b0bbd6;">Complete round robin to unlock bracket generation.</div>
    </div>
    <div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(23,76,204,0.06);margin-bottom:12px;opacity:0.6;">
      ${sectionHdr(4, 'Live Results', null, lockedHdr('Available after bracket'), true)}
      <div style="padding:10px 20px 14px;font-size:11px;font-weight:600;color:#b0bbd6;">Results will appear here once the bracket is live.</div>
    </div>`;
  }

  el.innerHTML = html;
}


function renderRRRounds(matches, tMap, tournament) {
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
  return rounds.map(round => {
    const roundMatches = matches.filter(m => m.round === round);
    const byes = roundMatches.filter(m => m.status === 'bye');
    const games = roundMatches.filter(m => m.status !== 'bye');
    return `
      <div class="t-round-block">
        <div class="t-round-label">Round ${round}</div>
        <div class="t-round-matches">
          ${games.map(m => {
            const teamA = tMap[m.team_a_id];
            const teamB = tMap[m.team_b_id];
            const isDone = m.status === 'completed';
            const winA = isDone && m.winner_id === m.team_a_id;
            const winB = isDone && m.winner_id === m.team_b_id;
            return `
              <div class="t-match-row ${isDone ? 't-match-done' : 't-match-pending'}"
                onclick="${tournament.status !== 'completed' ? `openScoreModal('rr',${m.id},${m.team_a_id},${m.team_b_id},${m.category_id})` : ''}">
                <div class="t-match-court" title="Court ${m.court || '?'}">${m.court ? 'C'+m.court : '—'}</div>
                <div class="t-match-teams">
                  <span class="t-match-team ${winA ? 't-winner' : ''}">
                    ${tEsc(teamA?.name || '?')}
                    ${getTeamPlayerNames(teamA) ? `<span style="font-size:10px;font-weight:500;color:#6b7a99;"> (${tEsc(getTeamPlayerNames(teamA))})</span>` : ''}
                  </span>
                  <span class="t-match-vs">vs</span>
                  <span class="t-match-team ${winB ? 't-winner' : ''}">
                    ${tEsc(teamB?.name || '?')}
                    ${getTeamPlayerNames(teamB) ? `<span style="font-size:10px;font-weight:500;color:#6b7a99;"> (${tEsc(getTeamPlayerNames(teamB))})</span>` : ''}
                  </span>
                </div>
                <div class="t-match-score">
                  ${isDone ? `<span class="t-score ${winA ? 't-score-win' : ''}">${m.score_a}</span>
                    <span class="t-score-sep">-</span>
                    <span class="t-score ${winB ? 't-score-win' : ''}">${m.score_b}</span>
                    ${m.forfeit_team_id ? `<span class="t-forfeit-badge" style="margin-left:4px;">FF</span>` : ''}` :
                    `<span class="t-score-pending">—</span>`}
                </div>
              </div>`;
          }).join('')}
          ${byes.map(m => `
            <div class="t-bye-row">
              <span class="t-bye-label">BYE</span>
              <span class="t-bye-team">${tEsc(tMap[m.team_a_id]?.name || '?')}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderGroupedRR(groupViews, tMap, tournament, cat) {
  return groupViews.map(gv => {
    const someDone = gv.matches.filter(m => m.status === 'completed').length > 0;
    return `
      <div class="t-group-block">
        <div class="t-group-header">
          <span class="t-group-badge">Group ${tEsc(gv.group.name)}</span>
          <span class="t-group-team-count">${gv.teams.length} teams</span>
        </div>
        <div class="t-rr-grid t-group-rr-grid">
          ${renderRRRounds(gv.matches, tMap, tournament)}
        </div>
        ${someDone ? tRenderStandings(gv.standings, cat.name) : ''}
      </div>`;
  }).join('');
}

function tRenderStandings(standings, catName) {
  if (!standings) return '';
  const singlesMode = isSingles(catName);

  // ── Mini summary data ─────────────────────────────────────────────────
  const leader = standings.length > 0 ? standings[0] : null;
  const leaderName = leader ? tEsc(leader.name) : '—';

  const bestDiffVal = standings.length > 0
    ? Math.max(...standings.map(s => s.pts_for - s.pts_against))
    : 0;
  const bestDiffLabel = bestDiffVal > 0 ? `+${bestDiffVal}` : `${bestDiffVal}`;

  const matchesRemaining = standings.reduce((sum, s) => sum + (s.played !== undefined ? 0 : 0), 0);
  // Matches remaining = total possible - played. Each team plays N-1 matches.
  const totalTeams = standings.length;
  const totalPossible = totalTeams * (totalTeams - 1) / 2;
  const totalPlayed = standings.reduce((sum, s) => sum + (s.w + s.l), 0) / 2;
  const remaining = Math.max(0, totalPossible - Math.round(totalPlayed));

  const miniSummary = `
    <div style="display:flex;gap:16px;padding:10px 14px;background:#f8f9ff;border:0.5px solid #e0e7f5;border-radius:8px;margin-bottom:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;">Leader</span>
        <span style="font-size:11px;font-weight:800;color:#0d1f4a;">${leaderName}</span>
      </div>
      <div style="width:1px;background:#e0e7f5;"></div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;">Best Diff</span>
        <span style="font-size:11px;font-weight:800;color:${bestDiffVal >= 0 ? '#24BC96' : '#e53935'};">${bestDiffLabel}</span>
      </div>
      <div style="width:1px;background:#e0e7f5;"></div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;">Matches Remaining</span>
        <span style="font-size:11px;font-weight:800;color:#0d1f4a;">${remaining}</span>
      </div>
    </div>`;

  return `
    <div class="t-standings-table">
      <div class="t-standings-title">Live Standings</div>
      <div style="font-size:10px;font-weight:600;color:#6b7a99;margin-bottom:10px;">Updated automatically as scores are reported.</div>
      ${miniSummary}
      <table class="t-table">
        <thead><tr><th>#</th><th>${singlesMode ? 'Player' : 'Team'}</th><th>Wins</th><th>Losses</th><th>Pts For</th><th>Diff</th></tr></thead>
        <tbody>
          ${standings.map((s, i) => `
            <tr class="${i < 4 ? 't-row-qualify' : ''}">
              <td><span class="t-rank ${i===0?'t-rank-1':i===1?'t-rank-2':i===2?'t-rank-3':''}">${i + 1}</span></td>
              <td class="t-team-cell">
                ${tEsc(s.name)}
                ${s.forfeited ? '<span class="t-forfeit-badge">FORFEIT</span>' : ''}
              </td>
              <td class="t-win-cell">${s.w}</td>
              <td class="t-loss-cell">${s.l}</td>
              <td style="font-weight:700;color:#174CCC;">${s.pts_for}</td>
              <td class="t-diff-cell ${s.pts_for - s.pts_against >= 0 ? 't-diff-pos' : 't-diff-neg'}">${s.pts_for - s.pts_against > 0 ? '+' : ''}${s.pts_for - s.pts_against}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderBracket(matches, tMap, tournament) {
  const roundOrder = ['R32','R16','QF','Semifinals','3rd Place','Final'];
  const grouped = {};
  matches.forEach(m => {
    if (!grouped[m.round_name]) grouped[m.round_name] = [];
    grouped[m.round_name].push(m);
  });
  const orderedRounds = roundOrder.filter(r => grouped[r]);
  const isComplete = matches.every(m => m.status === 'completed' || m.status === 'bye');
  const finalMatch = matches.find(m => m.round_name === 'Final' && m.status === 'completed');

  let html = `<div class="t-bracket">`;
  if (isComplete && finalMatch) {
    const champion = tMap[finalMatch.winner_id];
    const runnerUp = tMap[finalMatch.winner_id === finalMatch.team_a_id ? finalMatch.team_b_id : finalMatch.team_a_id];
    const thirdMatch = matches.find(m => m.round_name === '3rd Place' && m.status === 'completed');
    const third = thirdMatch ? tMap[thirdMatch.winner_id] : null;
    const runnerUpPlayers = getTeamPlayerNames(runnerUp);
    const championPlayers = getTeamPlayerNames(champion);
    const thirdPlayers = third ? getTeamPlayerNames(third) : '';
    html += `
      <div class="t-podium">
        <div class="t-podium-slot t-podium-silver">
          <div class="t-podium-medal">🥈</div>
          <div class="t-podium-team">${tEsc(runnerUp?.name || '—')}</div>
          ${runnerUpPlayers && runnerUpPlayers !== (runnerUp?.name || '') ? `<div class="t-podium-players">${tEsc(runnerUpPlayers)}</div>` : ''}
          <div class="t-podium-label">2nd Place</div>
          <div class="t-podium-bar t-bar-silver"></div>
        </div>
        <div class="t-podium-slot t-podium-gold">
          <div class="t-podium-crown">👑</div>
          <div class="t-podium-medal">🥇</div>
          <div class="t-podium-team t-champion">${tEsc(champion?.name || '—')}</div>
          ${championPlayers && championPlayers !== (champion?.name || '') ? `<div class="t-podium-players">${tEsc(championPlayers)}</div>` : ''}
          <div class="t-podium-label">Champion</div>
          <div class="t-podium-bar t-bar-gold"></div>
        </div>
        ${third ? `<div class="t-podium-slot t-podium-bronze">
          <div class="t-podium-medal">🥉</div>
          <div class="t-podium-team">${tEsc(third.name)}</div>
          ${thirdPlayers && thirdPlayers !== third.name ? `<div class="t-podium-players">${tEsc(thirdPlayers)}</div>` : ''}
          <div class="t-podium-label">3rd Place</div>
          <div class="t-podium-bar t-bar-bronze"></div>
        </div>` : ''}
      </div>`;
  }
  html += `<div class="t-bracket-rounds">`;
  orderedRounds.forEach(roundName => {
    html += `<div class="t-bracket-col">
      <div class="t-bracket-round-label">${roundName}</div>
      ${grouped[roundName].map(m => {
        const teamA = tMap[m.team_a_id];
        const teamB = tMap[m.team_b_id];
        const isDone = m.status === 'completed';
        const winA = isDone && m.winner_id === m.team_a_id;
        const winB = isDone && m.winner_id === m.team_b_id;
        return `
          <div class="t-bracket-match ${isDone ? 't-bracket-done' : ''}"
            onclick="${tournament.status !== 'completed' ? `openScoreModal('bracket',${m.id},${m.team_a_id||0},${m.team_b_id||0},${m.category_id})` : ''}">
            ${m.court ? `<div style="font-size:9px;font-weight:800;letter-spacing:1px;color:#6b7a99;padding:4px 14px;background:#f4f6fc;border-bottom:1px solid #d6dff5;">COURT ${m.court}</div>` : ''}
            <div class="t-bracket-team ${winA ? 't-bracket-winner' : ''} ${!m.team_a_id ? 't-bracket-tbd' : ''}">
              <div style="flex:1;">
                <div style="font-weight:700;">${tEsc(teamA?.name || (m.status === 'bye' ? 'BYE' : 'TBD'))}${m.forfeit_team_id === m.team_a_id ? ' <span class="t-forfeit-badge">FF</span>' : ''}</div>
                ${teamA ? `<div style="font-size:10px;color:#6b7a99;font-weight:500;margin-top:1px;">${getTeamPlayerNames(teamA)}</div>` : ''}
              </div>
              ${isDone ? `<span class="t-bracket-score ${winA ? 't-bracket-score-win' : ''}">${m.score_a}</span>` : ''}
            </div>
            <div class="t-bracket-divider"></div>
            <div class="t-bracket-team ${winB ? 't-bracket-winner' : ''} ${!m.team_b_id ? 't-bracket-tbd' : ''}">
              <div style="flex:1;">
                <div style="font-weight:700;">${tEsc(teamB?.name || (m.status === 'bye' ? 'BYE' : 'TBD'))}${m.forfeit_team_id === m.team_b_id ? ' <span class="t-forfeit-badge">FF</span>' : ''}</div>
                ${teamB ? `<div style="font-size:10px;color:#6b7a99;font-weight:500;margin-top:1px;">${getTeamPlayerNames(teamB)}</div>` : ''}
              </div>
              ${isDone ? `<span class="t-bracket-score ${winB ? 't-bracket-score-win' : ''}">${m.score_b}</span>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
  });
  html += `</div></div>`;
  return html;
}

async function showAddTeam(catId) {
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=*`);
  const catName = cat.name;
  const singles = isSingles(catName);

  // Fetch all player IDs already assigned in THIS tournament (all categories) — not other tournaments
  const tournCats = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=id`);
  const allCatIds = tournCats.map(c => c.id).join(',') || '0';
  const existingTeams = await tApi(`tournament_teams?category_id=in.(${allCatIds})&select=player1_id,player2_id,player3_id,player4_id`);
  const assignedIds = new Set();
  existingTeams.forEach(t => {
    [t.player1_id, t.player2_id, t.player3_id, t.player4_id].filter(Boolean).forEach(id => assignedIds.add(id));
  });

  const activePlayers = tAllPlayers.filter(p => p.status !== 'inactive');

  // ── Keep existing singles flow unchanged ──────────────────────────────
  if (singles) {
    const enrolledIds = existingTeams.map(t => t.player1_id).filter(Boolean);
    let playerRows = '';
    activePlayers.forEach(p => {
      const alreadyIn = enrolledIds.includes(p.id);
      const opacity = alreadyIn ? 'opacity:0.4;pointer-events:none;' : '';
      const disabled = alreadyIn ? 'disabled' : '';
      const tag = alreadyIn ? '<span style="font-size:10px;color:#6b7a99;margin-left:6px;">already added</span>' : '';
      const nameLower = (p.first_name + ' ' + p.last_name).toLowerCase();
      playerRows += '<div class="t-lp-row" data-name="' + tEsc(nameLower) + '" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:0.5px solid #d6dff5;' + opacity + '">'
        + '<input type="checkbox" id="t-pcb-' + p.id + '" data-pid="' + p.id + '" ' + disabled + ' style="width:16px;height:16px;cursor:pointer;" onchange="tUpdatePlayerCount()">'
        + '<label for="t-pcb-' + p.id + '" style="font-size:13px;font-weight:600;cursor:pointer;flex:1;">' + tEsc(p.first_name) + ' ' + tEsc(p.last_name) + tag + '</label>'
        + '</div>';
    });
    document.getElementById('t-modal-title').textContent = 'Add Players';
    document.getElementById('t-modal-body').innerHTML =
      '<div style="margin-bottom:12px;font-size:13px;color:#6b7a99;font-weight:500;">Check players to add. Already enrolled players are greyed out.</div>'
      + '<div style="border:0.5px solid #d6dff5;border-radius:8px;overflow:hidden;margin-bottom:16px;">'
      + '<div style="padding:8px 12px;background:#f4f6fc;border-bottom:0.5px solid #d6dff5;">'
      + '<input type="text" id="t-player-search" placeholder="Search player..." autocomplete="off" oninput="tFilterPlayers()" style="width:100%;border:none;background:transparent;font-size:13px;font-family:Montserrat,sans-serif;outline:none;color:#0d1f4a;"></div>'
      + '<div style="max-height:50vh;overflow-y:auto;" id="t-player-list">'
      + '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:2px solid #d6dff5;background:#e8f0ff;position:sticky;top:0;z-index:1;">'
      + '<input type="checkbox" id="t-select-all-players" style="width:16px;height:16px;cursor:pointer;" onchange="tToggleAllPlayers()">'
      + '<label for="t-select-all-players" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;color:#174CCC;">Select all</label>'
      + '<span style="margin-left:auto;font-size:12px;font-weight:700;color:#174CCC;" id="t-player-count">0 selected</span>'
      + '</div>'
      + playerRows
      + '</div></div>'
      + '<div class="t-form-actions">'
      + '<button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>'
      + '<button type="button" class="t-btn t-btn-primary" onclick="saveMultiplePlayers(' + catId + ')">Add Players</button>'
      + '</div>';
    openTModal();
    document.getElementById('t-player-search').focus();
    return;
  }

  // ── New Create Team modal ─────────────────────────────────────────────
  // State stored on window for event handler access
  window._ctCatId      = catId;
  window._ctCatName    = catName;
  window._ctPlayer1    = null; // {id, first_name, last_name, status}
  window._ctPlayer2    = null;
  window._ctAssigned   = assignedIds;
  window._ctPlayers    = activePlayers;
  window._ctSingles    = singles;

  const getInitials = (p) => ((p.first_name||'')[0]||'').toUpperCase() + ((p.last_name||'')[0]||'').toUpperCase();

  // Build the modal HTML
  const modalEl = document.querySelector('.t-modal');
  if (modalEl) modalEl.style.maxWidth = '740px';

  document.getElementById('t-modal-title').textContent = 'Create Team';
  tSetModalSubtitle('Add team identity and assign players.');
  document.getElementById('t-modal-body').innerHTML = `
    <button onclick="(function(){const m=document.querySelector('.t-modal');if(m)m.style.maxWidth='';tSetModalSubtitle('');closeTModal();})()"
      style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
      onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
      onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>

    <div style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#174CCC;background:#e8f0ff;padding:3px 10px;border-radius:99px;border:0.5px solid #c5d6f5;margin-bottom:14px;">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
      Division: ${tEsc(catName)}
    </div>

    <div style="display:grid;grid-template-columns:1fr 220px;gap:16px;">

      <!-- LEFT: form fields -->
      <div style="display:flex;flex-direction:column;gap:20px;">

        <!-- Team Identity -->
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <span style="width:3px;height:13px;border-radius:99px;background:#174CCC;display:inline-block;flex-shrink:0;"></span>
            Team Identity
          </div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Team Name <span style="color:#e53935;">*</span></div>
          <input id="ct-team-name" type="text" placeholder="e.g. Thunder Smashers"
            oninput="ctUpdatePreview()"
            style="width:100%;padding:9px 12px;border:1px solid #e0e7f5;border-radius:8px;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;color:#0d1f4a;outline:none;"
            onfocus="this.style.borderColor='#174CCC';this.style.boxShadow='0 0 0 3px rgba(23,76,204,0.08)'"
            onblur="this.style.borderColor='#e0e7f5';this.style.boxShadow='none'">
          <div style="font-size:10px;font-weight:600;color:#b0bbd6;margin-top:4px;">Visible in brackets, standings, and results.</div>
        </div>

        <!-- Players -->
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <span style="width:3px;height:13px;border-radius:99px;background:#174CCC;display:inline-block;flex-shrink:0;"></span>
            Players
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <!-- Player 1 -->
            <div>
              <div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Player 1 <span style="color:#e53935;">*</span></div>
              <div id="ct-p1-slot"></div>
            </div>
            <!-- Player 2 -->
            <div>
              <div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Player 2 <span style="color:#e53935;">*</span></div>
              <div id="ct-p2-slot"></div>
            </div>
          </div>
          <div id="ct-dup-warning" style="display:none;"></div>
        </div>
      </div>

      <!-- RIGHT: Team Preview -->
      <div style="background:#f8f9ff;border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Team Preview</div>
        <div style="background:white;border:0.5px solid #e0e7f5;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(23,76,204,0.06);">
          <div id="ct-preview-name" style="font-size:14px;font-weight:800;color:#b0bbd6;margin-bottom:10px;min-height:20px;">Team name...</div>
          <div id="ct-preview-p1" style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
            <div style="width:28px;height:28px;border-radius:50%;background:#f0f2f8;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c5d6f5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div style="font-size:11px;font-weight:500;color:#b0bbd6;">Select Player 1...</div>
          </div>
          <div id="ct-preview-p2" style="display:flex;align-items:center;gap:8px;">
            <div style="width:28px;height:28px;border-radius:50%;background:#f0f2f8;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c5d6f5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div style="font-size:11px;font-weight:500;color:#b0bbd6;">Select Player 2...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="display:flex;justify-content:flex-end;margin-top:20px;padding-top:14px;border-top:0.5px solid #e0e7f5;">
      <button onclick="ctSaveTeam()"
        style="display:inline-flex;align-items:center;gap:7px;padding:11px 28px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3 0%,#174CCC 100%);color:white;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
        Create Team
      </button>
    </div>`;

  openTModal();
  // Render player slots after modal is open
  ctRenderSlot(1);
  ctRenderSlot(2);
}

// ── Create Team helpers ────────────────────────────────────────────────────
function ctGetInitials(p) {
  return ((p.first_name||'')[0]||'').toUpperCase() + ((p.last_name||'')[0]||'').toUpperCase();
}

function ctRenderSlot(num) {
  const slotEl = document.getElementById(`ct-p${num}-slot`);
  if (!slotEl) return;
  const player = num === 1 ? window._ctPlayer1 : window._ctPlayer2;

  if (player) {
    // Filled state — show player card
    const initials = ctGetInitials(player);
    const statusColor = player.status === 'active' ? '#24BC96' : '#F26024';
    const statusLabel = player.status === 'active' ? 'Active' : player.status;
    slotEl.innerHTML = `
      <div style="border:1px solid #c5d6f5;border-radius:10px;padding:12px 14px;background:white;display:flex;align-items:center;gap:10px;position:relative;min-height:72px;">
        <div style="width:38px;height:38px;border-radius:50%;background:#174CCC;color:white;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${tEsc(initials)}</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:800;color:#0d1f4a;margin-bottom:3px;">${tEsc(player.first_name)} ${tEsc(player.last_name)}</div>
          <div style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:${statusColor};">
            <div style="width:5px;height:5px;border-radius:50%;background:${statusColor};"></div>
            ${tEsc(statusLabel)}
          </div>
        </div>
        <button onclick="ctClearPlayer(${num})"
          style="position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:50%;border:none;background:#f0f2f8;color:#6b7a99;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
      </div>`;
  } else {
    // Empty state — show search input
    slotEl.innerHTML = `
      <div style="border:1.5px dashed #c5d6f5;border-radius:10px;overflow:hidden;background:#fafbff;min-height:72px;">
        <input id="ct-search-${num}" type="text" placeholder="Search player by name..."
          autocomplete="off"
          oninput="ctFilterPlayers(${num})"
          onfocus="this.closest('div').style.borderColor='#174CCC';this.closest('div').style.background='#f0f4ff';"
          onblur="setTimeout(()=>{ctHideDropdown(${num})},150);this.closest('div').style.borderColor='#c5d6f5';this.closest('div').style.background='#fafbff';"
          style="width:100%;padding:10px 12px;border:none;outline:none;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:600;color:#0d1f4a;background:transparent;">
        <div id="ct-drop-${num}" style="display:none;background:white;border-top:0.5px solid #e0e7f5;max-height:150px;overflow-y:auto;"></div>
      </div>`;
  }
}

function ctFilterPlayers(num) {
  const q = (document.getElementById(`ct-search-${num}`)?.value || '').toLowerCase().trim();
  const drop = document.getElementById(`ct-drop-${num}`);
  if (!drop) return;

  const otherPlayer = num === 1 ? window._ctPlayer2 : window._ctPlayer1;
  const results = window._ctPlayers.filter(p => {
    const name = (p.first_name + ' ' + p.last_name).toLowerCase();
    return q.length >= 1 && name.includes(q);
  }).slice(0, 8);

  if (!results.length) { drop.style.display = 'none'; return; }

  drop.innerHTML = results.map(p => {
    const initials = ctGetInitials(p);
    const isAssigned = window._ctAssigned.has(p.id);
    const isSelf = otherPlayer && otherPlayer.id === p.id;
    const disabled = isAssigned || isSelf;
    const subtext = isAssigned
      ? '<div style="font-size:9px;font-weight:700;color:#F26024;">Already assigned in this tournament</div>'
      : isSelf
      ? '<div style="font-size:9px;font-weight:700;color:#F26024;">Already selected above</div>'
      : `<div style="font-size:9px;font-weight:700;color:#24BC96;">${p.status === 'active' ? 'Active' : p.status}</div>`;
    const opacity = disabled ? 'opacity:0.5;cursor:not-allowed;' : 'cursor:pointer;';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:0.5px solid #f4f5f8;${opacity}"
      ${!disabled ? `onmousedown="ctSelectPlayer(${num}, ${p.id})"` : ''}>
      <div style="width:26px;height:26px;border-radius:50%;background:${disabled ? '#f0f2f8' : '#e8f0ff'};color:${disabled ? '#b0bbd6' : '#174CCC'};font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${tEsc(initials)}</div>
      <div>
        <div style="font-size:12px;font-weight:700;color:${disabled ? '#b0bbd6' : '#0d1f4a'};">${tEsc(p.first_name)} ${tEsc(p.last_name)}</div>
        ${subtext}
      </div>
    </div>`;
  }).join('');
  drop.style.display = 'block';
}

function ctHideDropdown(num) {
  const drop = document.getElementById(`ct-drop-${num}`);
  if (drop) drop.style.display = 'none';
}

function ctSelectPlayer(num, playerId) {
  const player = window._ctPlayers.find(p => p.id === playerId);
  if (!player) return;
  if (num === 1) window._ctPlayer1 = player;
  else window._ctPlayer2 = player;
  ctRenderSlot(num);
  ctUpdatePreview();
}

function ctClearPlayer(num) {
  if (num === 1) window._ctPlayer1 = null;
  else window._ctPlayer2 = null;
  ctRenderSlot(num);
  ctUpdatePreview();
}

function ctUpdatePreview() {
  const nameEl = document.getElementById('ct-preview-name');
  const p1El   = document.getElementById('ct-preview-p1');
  const p2El   = document.getElementById('ct-preview-p2');
  const nameVal = document.getElementById('ct-team-name')?.value?.trim() || '';
  const p1 = window._ctPlayer1;
  const p2 = window._ctPlayer2;

  if (nameEl) {
    if (nameVal) { nameEl.textContent = nameVal; nameEl.style.color = '#0d1f4a'; }
    else { nameEl.textContent = 'Team name...'; nameEl.style.color = '#b0bbd6'; }
  }

  const renderPreviewPlayer = (el, player, label) => {
    if (!el) return;
    if (player) {
      const initials = ctGetInitials(player);
      el.innerHTML = `
        <div style="width:28px;height:28px;border-radius:50%;background:#174CCC;color:white;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${tEsc(initials)}</div>
        <div style="font-size:12px;font-weight:700;color:#0d1f4a;">${tEsc(player.first_name)} ${tEsc(player.last_name)}</div>`;
    } else {
      el.innerHTML = `
        <div style="width:28px;height:28px;border-radius:50%;background:#f0f2f8;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c5d6f5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div style="font-size:11px;font-weight:500;color:#b0bbd6;">${label}</div>`;
    }
  };
  renderPreviewPlayer(p1El, p1, 'Select Player 1...');
  renderPreviewPlayer(p2El, p2, 'Select Player 2...');
}

async function ctSaveTeam() {
  const catId  = window._ctCatId;
  const name   = document.getElementById('ct-team-name')?.value?.trim();
  const p1     = window._ctPlayer1;
  const p2     = window._ctPlayer2;
  if (!name) { tToast('Please enter a team name.', true); return; }
  if (!p1)   { tToast('Please select Player 1.', true); return; }
  if (!p2)   { tToast('Please select Player 2.', true); return; }
  if (p1.id === p2.id) { tToast('Player 1 and Player 2 must be different people.', true); return; }
  try {
    await tApi('tournament_teams', 'POST', {
      category_id: catId, name,
      player1_id: p1.id,
      player2_id: p2.id,
      player3_id: null,
      player4_id: null,
    });
    // Reset modal size
    const modalEl = document.querySelector('.t-modal');
    if (modalEl) modalEl.style.maxWidth = '';
    tSetModalSubtitle('');
    tToast(`Team "${name}" created!`);
    closeTModal();
    tCurrentCategoryId = catId;
    const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
    const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
    renderTournamentDetail(t, categories);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}


async function saveTeam(e, catId) {
  e.preventDefault();
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=name`);
  const singles = isSingles(cat.name);
  const playerSelects = document.querySelectorAll('.t-player-select');
  const playerIds = [...playerSelects].map(s => parseInt(s.value) || null);
  let name = document.getElementById('t-team-name').value.trim();
  if (singles) {
    // For singles, name = player's full name from DB
    const p1 = tAllPlayers.find(x => x.id === playerIds[0]);
    if (!p1) { tToast('Please select a player.', true); return; }
    name = `${p1.first_name} ${p1.last_name}`;
  } else {
    if (!name) { tToast('Please enter a team name.', true); return; }
  }
  try {
    await tApi('tournament_teams', 'POST', {
      category_id: catId, name,
      player1_id: playerIds[0] || null,
      player2_id: playerIds[1] || null,
      player3_id: playerIds[2] || null,
      player4_id: playerIds[3] || null,
    });
    tToast(`${singles ? 'Player' : 'Team'} "${name}" added!`);
    closeTModal();
    tCurrentCategoryId = catId;
    const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
    const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
    renderTournamentDetail(t, categories);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

async function editTeam(teamId, catId) {
  const [team, cat] = await Promise.all([
    tApi(`tournament_teams?id=eq.${teamId}&select=*`).then(r => r[0]),
    tApi(`tournament_categories?id=eq.${catId}&select=*`).then(r => r[0]),
  ]);
  if (!team || !cat) return;

  const singles = isSingles(cat.name);

  // Fetch all assigned player IDs in this tournament (for duplicate validation)
  const tournCats = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=id`);
  const allCatIds = tournCats.map(c => c.id).join(',') || '0';
  const existingTeams = await tApi(`tournament_teams?category_id=in.(${allCatIds})&select=player1_id,player2_id,player3_id,player4_id`);
  const assignedIds = new Set();
  existingTeams.forEach(t => {
    [t.player1_id, t.player2_id, t.player3_id, t.player4_id].filter(Boolean).forEach(id => assignedIds.add(id));
  });
  // Remove current team's own players from assigned set so they can be re-selected
  [team.player1_id, team.player2_id, team.player3_id, team.player4_id].filter(Boolean).forEach(id => assignedIds.delete(id));

  const activePlayers = tAllPlayers.filter(p => p.status !== 'inactive');

  // Fetch match data for stats
  const [rrMatches, bracketMatches] = await Promise.all([
    tApi(`tournament_rr_matches?category_id=eq.${catId}&select=id,team_a_id,team_b_id,score_a,score_b,winner_id,status`),
    tApi(`tournament_bracket_matches?category_id=eq.${catId}&select=id,team_a_id,team_b_id,winner_id,round_name,status`),
  ]);

  // Compute stats
  const teamRR = rrMatches.filter(m => (m.team_a_id === teamId || m.team_b_id === teamId) && m.status !== 'bye');
  const teamBracket = bracketMatches.filter(m => m.team_a_id === teamId || m.team_b_id === teamId);
  const rrPlayed = teamRR.filter(m => m.status === 'completed').length;
  const bracketPlayed = teamBracket.filter(m => m.status === 'completed').length;
  const totalPlayed = rrPlayed + bracketPlayed;
  const rrWins = teamRR.filter(m => m.winner_id === teamId).length;
  const rrLosses = rrPlayed - rrWins;

  // Seed position (1-based index in category)
  const allTeams = await tApi(`tournament_teams?category_id=eq.${catId}&select=id&order=id`);
  const seed = allTeams.findIndex(t => t.id === teamId) + 1;

  // Bracket stage
  const latestBracket = teamBracket.filter(m => m.status === 'completed').pop();
  const bracketStage = latestBracket ? latestBracket.round_name : (teamBracket.length ? teamBracket[0].round_name : null);

  // Store state on window for helper access
  window._etTeamId    = teamId;
  window._etCatId     = catId;
  window._etCatName   = cat.name;
  window._etSingles   = singles;
  window._etPlayer1   = tAllPlayers.find(p => p.id === team.player1_id) || null;
  window._etPlayer2   = tAllPlayers.find(p => p.id === team.player2_id) || null;
  window._etAssigned  = assignedIds;
  window._etPlayers   = activePlayers;

  const getInitials = p => ((p.first_name||'')[0]||'').toUpperCase() + ((p.last_name||'')[0]||'').toUpperCase();

  // Widen modal
  const modalEl = document.querySelector('.t-modal');
  if (modalEl) modalEl.style.maxWidth = '740px';

  document.getElementById('t-modal-title').textContent = 'Team Overview';
  tSetModalSubtitle('Update team identity and player assignments.');

  document.getElementById('t-modal-body').innerHTML = `
    <button onclick="(function(){const m=document.querySelector('.t-modal');if(m)m.style.maxWidth='';tSetModalSubtitle('');closeTModal();})()"
      style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
      onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
      onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>

    <div style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#174CCC;background:#e8f0ff;padding:3px 10px;border-radius:99px;border:0.5px solid #c5d6f5;margin-bottom:14px;">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
      Division: ${tEsc(cat.name)}
    </div>

    <div style="display:grid;grid-template-columns:1fr 230px;gap:16px;">

      <!-- LEFT -->
      <div style="display:flex;flex-direction:column;gap:20px;">

        <!-- Team Identity -->
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <span style="width:3px;height:13px;border-radius:99px;background:#174CCC;display:inline-block;flex-shrink:0;"></span>Team Identity
          </div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Team Name <span style="color:#e53935;">*</span></div>
          <input id="et-team-name" type="text" value="${tEsc(team.name)}"
            oninput="etUpdateOverview()"
            placeholder="e.g. Thunder Smashers"
            style="width:100%;padding:9px 12px;border:1px solid #e0e7f5;border-radius:8px;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;color:#0d1f4a;outline:none;"
            onfocus="this.style.borderColor='#174CCC';this.style.boxShadow='0 0 0 3px rgba(23,76,204,0.08)'"
            onblur="this.style.borderColor='#e0e7f5';this.style.boxShadow='none'">
          <div style="font-size:10px;font-weight:600;color:#b0bbd6;margin-top:4px;">Visible in brackets, standings, and results.</div>
        </div>

        <!-- Players -->
        ${!singles ? `
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <span style="width:3px;height:13px;border-radius:99px;background:#174CCC;display:inline-block;flex-shrink:0;"></span>Players
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Player 1 <span style="color:#e53935;">*</span></div>
              <div id="et-p1-slot"></div>
            </div>
            <div>
              <div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Player 2 <span style="color:#e53935;">*</span></div>
              <div id="et-p2-slot"></div>
            </div>
          </div>
        </div>` : ''}
      </div>

      <!-- RIGHT: Team Overview + Activity -->
      <div style="background:#f8f9ff;border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:14px;">

        <!-- Team Overview -->
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:8px;">Team Overview</div>
          <div style="background:white;border:0.5px solid #e0e7f5;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(23,76,204,0.06);">
            <div id="et-overview-name" style="font-size:14px;font-weight:800;color:#0d1f4a;margin-bottom:10px;">${tEsc(team.name)}</div>
            <div id="et-overview-p1" style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"></div>
            <div id="et-overview-p2" style="display:flex;align-items:center;gap:8px;margin-bottom:0;"></div>
            <!-- Matches played -->
            ${totalPlayed > 0 ? `
            <div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:0.5px solid #f0f2f8;">
              <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:#174CCC;line-height:1;">${totalPlayed}</div>
              <div>
                <div style="font-size:10px;font-weight:800;color:#0d1f4a;">Matches Played</div>
                <div style="font-size:9px;font-weight:600;color:#6b7a99;">${rrPlayed} RR · ${bracketPlayed} Bracket</div>
              </div>
            </div>` : ''}
          </div>
        </div>

        <!-- Team Activity -->
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:8px;">Team Activity</div>
          <div style="background:white;border:0.5px solid #e0e7f5;border-radius:10px;padding:12px 14px;box-shadow:0 1px 3px rgba(23,76,204,0.06);">
            <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:0.5px solid #f4f5f8;">
              <div style="width:26px;height:26px;border-radius:7px;background:#e8f0ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <div style="font-size:10px;font-weight:700;color:#0d1f4a;">Seed</div>
                <div style="font-size:10px;font-weight:600;color:#6b7a99;">#${seed} in division</div>
              </div>
            </div>
            ${rrPlayed > 0 ? `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:0.5px solid #f4f5f8;">
              <div style="width:26px;height:26px;border-radius:7px;background:#d4f5ed;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#085041" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <div>
                <div style="font-size:10px;font-weight:700;color:#0d1f4a;">RR Record</div>
                <div style="font-size:10px;font-weight:600;color:#6b7a99;">${rrWins}W · ${rrLosses}L</div>
              </div>
            </div>` : ''}
            ${bracketStage ? `
            <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0 0;">
              <div style="width:26px;height:26px;border-radius:7px;background:rgba(198,242,33,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
              </div>
              <div>
                <div style="font-size:10px;font-weight:700;color:#0d1f4a;">Bracket Stage</div>
                <div style="font-size:10px;font-weight:600;color:#6b7a99;">${tEsc(bracketStage)}</div>
              </div>
            </div>` : ''}
          </div>
        </div>

      </div>
    </div>

    <!-- Footer -->
    <div style="display:flex;justify-content:flex-end;margin-top:20px;padding-top:14px;border-top:0.5px solid #e0e7f5;">
      <button onclick="etSaveTeam()"
        style="display:inline-flex;align-items:center;gap:7px;padding:11px 28px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3 0%,#174CCC 100%);color:white;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Update Team
      </button>
    </div>`;

  openTModal();
  if (!singles) {
    etRenderSlot(1);
    etRenderSlot(2);
  }
  etUpdateOverview();
}

// ── Edit Team helpers ────────────────────────────────────────────────────
function etGetInitials(p) {
  return ((p.first_name||'')[0]||'').toUpperCase() + ((p.last_name||'')[0]||'').toUpperCase();
}

function etRenderSlot(num) {
  const slotEl = document.getElementById(`et-p${num}-slot`);
  if (!slotEl) return;
  const player = num === 1 ? window._etPlayer1 : window._etPlayer2;

  if (player) {
    const initials = etGetInitials(player);
    const statusColor = player.status === 'active' ? '#24BC96' : '#F26024';
    slotEl.innerHTML = `
      <div style="border:1px solid #c5d6f5;border-radius:10px;padding:12px 14px;background:white;display:flex;flex-direction:column;gap:8px;min-height:90px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:38px;height:38px;border-radius:50%;background:#174CCC;color:white;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${tEsc(initials)}</div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:800;color:#0d1f4a;margin-bottom:3px;">${tEsc(player.first_name)} ${tEsc(player.last_name)}</div>
            <div style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:${statusColor};">
              <div style="width:5px;height:5px;border-radius:50%;background:${statusColor};"></div>
              ${tEsc(player.status === 'active' ? 'Active' : player.status)}
            </div>
          </div>
        </div>
        <button onclick="etReplacePlayer(${num})"
          style="width:100%;padding:6px 10px;border:0.5px solid #c5d6f5;border-radius:7px;background:#f8f9ff;color:#174CCC;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          Replace Player
        </button>
      </div>`;
  } else {
    slotEl.innerHTML = `
      <div style="border:1.5px dashed #c5d6f5;border-radius:10px;overflow:hidden;background:#fafbff;min-height:90px;">
        <input id="et-search-${num}" type="text" placeholder="Search player by name..."
          autocomplete="off"
          oninput="etFilterPlayers(${num})"
          onfocus="this.closest('div').style.borderColor='#174CCC';this.closest('div').style.background='#f0f4ff';"
          onblur="setTimeout(()=>{etHideDropdown(${num})},150);this.closest('div').style.borderColor='#c5d6f5';this.closest('div').style.background='#fafbff';"
          style="width:100%;padding:10px 12px;border:none;outline:none;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:600;color:#0d1f4a;background:transparent;">
        <div id="et-drop-${num}" style="display:none;background:white;border-top:0.5px solid #e0e7f5;max-height:150px;overflow-y:auto;"></div>
      </div>`;
  }
}

function etReplacePlayer(num) {
  if (num === 1) window._etPlayer1 = null;
  else window._etPlayer2 = null;
  etRenderSlot(num);
  etUpdateOverview();
  // Focus search after render
  setTimeout(() => { document.getElementById(`et-search-${num}`)?.focus(); }, 50);
}

function etFilterPlayers(num) {
  const q = (document.getElementById(`et-search-${num}`)?.value || '').toLowerCase().trim();
  const drop = document.getElementById(`et-drop-${num}`);
  if (!drop) return;
  const otherPlayer = num === 1 ? window._etPlayer2 : window._etPlayer1;
  const results = window._etPlayers.filter(p => {
    const name = (p.first_name + ' ' + p.last_name).toLowerCase();
    return q.length >= 1 && name.includes(q);
  }).slice(0, 8);
  if (!results.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = results.map(p => {
    const initials = etGetInitials(p);
    const isAssigned = window._etAssigned.has(p.id);
    const isSelf = otherPlayer && otherPlayer.id === p.id;
    const disabled = isAssigned || isSelf;
    const subtext = isAssigned
      ? '<div style="font-size:9px;font-weight:700;color:#F26024;">Already assigned in this tournament</div>'
      : isSelf
      ? '<div style="font-size:9px;font-weight:700;color:#F26024;">Already selected above</div>'
      : `<div style="font-size:9px;font-weight:700;color:#24BC96;">${p.status === 'active' ? 'Active' : p.status}</div>`;
    const opacity = disabled ? 'opacity:0.5;cursor:not-allowed;' : 'cursor:pointer;';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:0.5px solid #f4f5f8;${opacity}"
      ${!disabled ? `onmousedown="etSelectPlayer(${num}, ${p.id})"` : ''}>
      <div style="width:26px;height:26px;border-radius:50%;background:${disabled ? '#f0f2f8' : '#e8f0ff'};color:${disabled ? '#b0bbd6' : '#174CCC'};font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${tEsc(initials)}</div>
      <div>
        <div style="font-size:12px;font-weight:700;color:${disabled ? '#b0bbd6' : '#0d1f4a'};">${tEsc(p.first_name)} ${tEsc(p.last_name)}</div>
        ${subtext}
      </div>
    </div>`;
  }).join('');
  drop.style.display = 'block';
}

function etHideDropdown(num) {
  const drop = document.getElementById(`et-drop-${num}`);
  if (drop) drop.style.display = 'none';
}

function etSelectPlayer(num, playerId) {
  const player = window._etPlayers.find(p => p.id === playerId);
  if (!player) return;
  if (num === 1) window._etPlayer1 = player;
  else window._etPlayer2 = player;
  etRenderSlot(num);
  etUpdateOverview();
}

function etUpdateOverview() {
  const nameEl = document.getElementById('et-overview-name');
  const p1El   = document.getElementById('et-overview-p1');
  const p2El   = document.getElementById('et-overview-p2');
  const nameVal = document.getElementById('et-team-name')?.value?.trim() || '';
  const p1 = window._etPlayer1;
  const p2 = window._etPlayer2;

  if (nameEl) nameEl.textContent = nameVal || 'Team name...';

  const renderPreviewPlayer = (el, player, label) => {
    if (!el) return;
    if (player) {
      const initials = etGetInitials(player);
      el.innerHTML = `
        <div style="width:28px;height:28px;border-radius:50%;background:#174CCC;color:white;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${tEsc(initials)}</div>
        <div style="font-size:12px;font-weight:700;color:#0d1f4a;">${tEsc(player.first_name)} ${tEsc(player.last_name)}</div>`;
    } else {
      el.innerHTML = `
        <div style="width:28px;height:28px;border-radius:50%;background:#f0f2f8;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c5d6f5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div style="font-size:11px;font-weight:500;color:#b0bbd6;">${label}</div>`;
    }
  };
  renderPreviewPlayer(p1El, p1, 'Select Player 1...');
  renderPreviewPlayer(p2El, p2, 'Select Player 2...');
}

async function etSaveTeam() {
  const teamId = window._etTeamId;
  const catId  = window._etCatId;
  const singles = window._etSingles;
  const name = document.getElementById('et-team-name')?.value?.trim();
  if (!name) { tToast('Please enter a team name.', true); return; }

  let p1id = null, p2id = null;
  if (!singles) {
    const p1 = window._etPlayer1;
    const p2 = window._etPlayer2;
    if (!p1) { tToast('Please select Player 1.', true); return; }
    if (!p2) { tToast('Please select Player 2.', true); return; }
    if (p1.id === p2.id) { tToast('Player 1 and Player 2 must be different people.', true); return; }
    p1id = p1.id;
    p2id = p2.id;
  }

  try {
    await tApi(`tournament_teams?id=eq.${teamId}`, 'PATCH', {
      name,
      player1_id: p1id,
      player2_id: p2id,
      player3_id: null,
      player4_id: null,
    });
    const modalEl = document.querySelector('.t-modal');
    if (modalEl) modalEl.style.maxWidth = '';
    tSetModalSubtitle('');
    closeTModal();
    tToast('Team updated!');
    tCurrentCategoryId = catId;
    const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
    const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
    renderTournamentDetail(t, categories);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}


async function deleteTeam(teamId, catId) {
  // Fetch team with player info
  const [team] = await tApi(`tournament_teams?id=eq.${teamId}&select=*`);
  const teamName = team?.name || 'this team';

  // Fetch category + tournament names
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=name,tournament_id`);
  const tournId = cat?.tournament_id || tCurrentTournamentId;
  const [tourn] = await tApi(`tournaments?id=eq.${tournId}&select=name`);
  const catName = cat?.name || '';
  const tournName = tourn?.name || '';

  // Check if any matches exist for this team in this category
  const allRR = await tApi(`tournament_rr_matches?category_id=eq.${catId}&select=id,team_a_id,team_b_id`).catch(() => []);
  const allBracket = await tApi(`tournament_bracket_matches?category_id=eq.${catId}&select=id,team_a_id,team_b_id`).catch(() => []);
  const hasMatches = allRR.some(m => m.team_a_id === teamId || m.team_b_id === teamId)
                  || allBracket.some(m => m.team_a_id === teamId || m.team_b_id === teamId);

  // Resolve player names
  const playerIds = [team?.player1_id, team?.player2_id, team?.player3_id, team?.player4_id].filter(Boolean);
  const players = playerIds.map(id => {
    const p = tAllPlayers.find(x => x.id === id);
    return p ? { initials: ((p.first_name||'')[0]||'').toUpperCase() + ((p.last_name||'')[0]||'').toUpperCase(), name: `${p.first_name} ${p.last_name}` } : null;
  }).filter(Boolean);

  const playerRowsHTML = players.map(p => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <div style="width:26px;height:26px;border-radius:50%;background:#e8f0ff;color:#174CCC;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${p.initials}</div>
      <div style="font-size:12px;font-weight:700;color:#0d1f4a;">${tEsc(p.name)}</div>
    </div>`).join('');

  const consequenceHTML = hasMatches
    ? `<div style="background:rgba(242,96,36,0.08);border:1px solid rgba(242,96,36,0.18);border-radius:8px;padding:12px 14px;">
        <div style="font-size:12px;font-weight:800;color:#c04a0e;margin-bottom:4px;">This action cannot be undone.</div>
        <div style="font-size:12px;font-weight:600;color:#9a3a0a;line-height:1.5;">The team will be permanently removed from this category and all generated matches may be affected.</div>
      </div>`
    : `<div style="background:rgba(36,188,150,0.06);border:1px solid rgba(36,188,150,0.2);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#085041" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <div style="font-size:11px;font-weight:700;color:#085041;">No matches generated yet — no matches will be affected.</div>
      </div>`;

  // Add orange top border to modal
  const modalEl = document.querySelector('.t-modal');
  if (modalEl) modalEl.style.borderTop = '3px solid #F26024';

  document.getElementById('t-modal-title').textContent = 'Remove Team From Tournament';
  tSetModalSubtitle('Review the team before removing.');
  document.getElementById('t-modal-body').innerHTML = `
    <button onclick="(function(){const m=document.querySelector('.t-modal');if(m)m.style.borderTop='';tSetModalSubtitle('');closeTModal();})()"
      style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
      onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
      onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>

    <div style="background:#f8f9ff;border:0.5px solid #e0e7f5;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:28px;height:28px;border-radius:50%;background:#174CCC;color:white;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${tEsc(teamName.substring(0,3))}</div>
        <div style="font-size:15px;font-weight:800;color:#0d1f4a;">${tEsc(teamName)}</div>
      </div>
      ${playerRowsHTML || '<div style="font-size:11px;color:#b0bbd6;">No players assigned</div>'}
    </div>

    <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:#6b7a99;">
        <div style="width:5px;height:5px;border-radius:50%;background:#174CCC;flex-shrink:0;"></div>
        <span><strong>Division:</strong> ${tEsc(catName)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:#6b7a99;">
        <div style="width:5px;height:5px;border-radius:50%;background:#174CCC;flex-shrink:0;"></div>
        <span><strong>Tournament:</strong> ${tEsc(tournName)}</span>
      </div>
    </div>

    ${consequenceHTML}

    <div style="display:flex;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:0.5px solid #e0e7f5;">
      <button onclick="(function(){const m=document.querySelector('.t-modal');if(m)m.style.borderTop='';confirmDeleteTeam(${teamId},${catId});})()"
        style="display:inline-flex;align-items:center;gap:7px;padding:10px 22px;border:none;border-radius:99px;background:linear-gradient(180deg,#F26024,#d44e10);color:white;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        Remove Team
      </button>
    </div>`;
  openTModal();
}
async function confirmDeleteTeam(teamId, catId) {
  try {
    await tApi(`tournament_teams?id=eq.${teamId}`, 'DELETE');
    const mEl = document.querySelector('.t-modal');
    if (mEl) mEl.style.borderTop = '';
    tSetModalSubtitle('');
    closeTModal();
    tToast('Team removed.');
    tCurrentCategoryId = catId;
    const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
    const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
    renderTournamentDetail(t, categories);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

// ─── GENERATE ROUND ROBIN ───────────────────────────────────
async function showRRFormatModal(catId) {
  const [teams, cat] = await Promise.all([
    tApi(`tournament_teams?category_id=eq.${catId}&select=id`),
    tApi(`tournament_categories?id=eq.${catId}&select=*`).then(r => r[0]),
  ]);
  const numTeams = teams.length;
  const useGroups = numTeams > GROUP_TRIGGER_THRESHOLD;
  const catName = cat?.name || '';

  // Compute match count: N*(N-1)/2
  const matchCount = Math.round(numTeams * (numTeams - 1) / 2);

  // Format cards definition — ordered as approved
  const FORMAT_CARDS = [
    { value: 'play11_win1', emoji: '⚡', title: 'Play to 11 — Win by 1',
      desc: 'Fast and dynamic format optimized for high match volume and efficient tournament flow. Ideal for social events, ladders, and quick-paced round robin sessions.' },
    { value: 'play11_win2', emoji: '🏆', title: 'Play to 11 — Win by 2',
      desc: 'Classic competitive format that rewards consistency and clutch performance under pressure. Commonly used in organized tournament play and elimination rounds.' },
    { value: 'play15_win1', emoji: '🏓', title: 'Play to 15 — Win by 1',
      desc: 'Fast-paced competitive format with longer rallies and quick match turnover. Ideal for round robin play with multiple teams and limited court time.' },
    { value: 'play15_win2', emoji: '🔥', title: 'Play to 15 — Win by 2',
      desc: 'Balanced competitive format with extended rallies and a true winning margin. Great for tournaments seeking stronger competitive integrity without excessively long matches.' },
    { value: 'play21_win1', emoji: '⚡', title: 'Play to 21 — Win by 1',
      desc: 'Long-format gameplay with faster match completion. Balances endurance and scheduling efficiency while keeping matches highly competitive.' },
    { value: 'play21_win2', emoji: '🔥', title: 'Play to 21 — Win by 2',
      desc: 'Traditional extended competition format designed for high-intensity matches and deeper strategic play. Best for premium divisions and championship-level competition.' },
  ];

  const formatCardsHTML = FORMAT_CARDS.map((f, i) => `
    <div class="rr-format-card ${i === 0 ? 'rr-format-selected' : ''}"
      onclick="rrSelectFormatCard(this, '${f.value}')"
      style="border:${i === 0 ? '2px solid #174CCC;background:rgba(23,76,204,0.05);box-shadow:0 0 0 4px rgba(23,76,204,0.08)' : '1px solid #e0e7f5;background:white'};
             border-radius:10px;padding:12px 14px;cursor:pointer;position:relative;transition:all .15s;">
      <div style="position:absolute;top:8px;right:8px;width:18px;height:18px;border-radius:50%;background:#174CCC;
                  display:${i === 0 ? 'flex' : 'none'};align-items:center;justify-content:center;" class="rr-check-icon">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style="font-size:18px;margin-bottom:6px;">${f.emoji}</div>
      <div style="font-size:12px;font-weight:800;color:#0d1f4a;margin-bottom:4px;">${f.title}</div>
      <div style="font-size:10px;font-weight:600;color:#6b7a99;line-height:1.45;">${f.desc}</div>
    </div>`).join('');

  // Group section — preserved exactly as before
  let groupSection = '';
  let groupScript = '';
  if (useGroups) {
    const suggestions = tSuggestGroupSizes(numTeams);
    if (!suggestions.length) {
      tToast(`Cannot split ${numTeams} teams into valid groups (each group must be ${GROUP_MIN_SIZE}-${GROUP_MAX_SIZE} teams).`, true);
      return;
    }
    const defaultIdx = suggestions.reduce((bestIdx, s, i, arr) =>
      Math.abs(s.size - 4) < Math.abs(arr[bestIdx].size - 4) ? i : bestIdx, 0);

    groupSection = `
      <div style="background:#e8f0ff;border:1px solid #174CCC;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:#174CCC;margin-bottom:2px;">${numTeams} teams — group stage required</div>
        <div style="font-size:11px;color:#6b7a99;">Teams will be randomly split into groups for round-robin play. Top finishers from each group advance to a single-elimination bracket.</div>
      </div>
      <div style="margin-bottom:12px;">
        <div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Teams per group (target)</div>
        <select class="t-input" id="t-group-size" style="width:100%;">
          ${suggestions.map((s, i) => `
            <option value="${s.size}" ${i === defaultIdx ? 'selected' : ''}>
              ~${s.size} per group → ${s.groups} groups (${s.distribution.join(', ')})
            </option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;margin-bottom:4px;">Teams advancing per group</div>
        <select class="t-input" id="t-finals-per-group" style="width:100%;"></select>
        <div style="font-size:11px;color:#6b7a99;margin-top:4px;">Top N from each group go to the bracket.</div>
      </div>`;
  }

  // Widen modal
  const modalEl = document.querySelector('.t-modal');
  if (modalEl) modalEl.style.maxWidth = '680px';

  document.getElementById('t-modal-title').textContent = useGroups ? 'Group Stage Setup' : 'Round Robin Setup';
  tSetModalSubtitle('Configure the match format for this division.');

  document.getElementById('t-modal-body').innerHTML = `
    <button onclick="(function(){const m=document.querySelector('.t-modal');if(m)m.style.maxWidth='';tSetModalSubtitle('');closeTModal();})()"
      style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
      onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
      onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>

    <div style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#174CCC;background:#e8f0ff;padding:3px 10px;border-radius:99px;border:0.5px solid #c5d6f5;margin-bottom:14px;">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
      Division: ${tEsc(catName)}
    </div>

    ${groupSection}

    <div style="display:grid;grid-template-columns:1fr 200px;gap:20px;">

      <!-- LEFT: Format cards -->
      <div>
        <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
          <span style="width:3px;height:13px;border-radius:99px;background:#174CCC;display:inline-block;flex-shrink:0;"></span>Format Options
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${formatCardsHTML}
        </div>
      </div>

      <!-- RIGHT: Intel + Info + Preview -->
      <div style="display:flex;flex-direction:column;gap:12px;">

        <!-- Division Intel -->
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span style="width:3px;height:13px;border-radius:99px;background:#174CCC;display:inline-block;flex-shrink:0;"></span>Division Intel
          </div>
          <div style="background:#f8f9ff;border:0.5px solid #e0e7f5;border-radius:10px;padding:14px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#0d1f4a;line-height:1;min-width:32px;">${numTeams}</div>
              <div style="font-size:10px;font-weight:700;color:#6b7a99;">Teams</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:#0d1f4a;line-height:1;min-width:32px;">${matchCount}</div>
              <div style="font-size:10px;font-weight:700;color:#6b7a99;">Matches to Generate</div>
            </div>
            <div style="border-top:0.5px solid #e0e7f5;margin:8px 0;"></div>
            <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:800;color:#24BC96;">
              <div style="width:6px;height:6px;border-radius:50%;background:#24BC96;"></div>
              Round Robin Ready
            </div>
          </div>
        </div>

        <!-- Info card -->
        <div style="background:#f8f9ff;border:0.5px solid #e0e7f5;border-radius:10px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:800;color:#0d1f4a;margin-bottom:5px;">Format applies to all RR matches</div>
          <div style="font-size:10px;font-weight:600;color:#6b7a99;line-height:1.5;margin-bottom:4px;">This format will apply to all round robin matches in this division.</div>
          <div style="font-size:10px;font-weight:600;color:#6b7a99;line-height:1.5;">Finals can later be configured independently.</div>
        </div>

        <!-- Preview card -->
        <div style="background:#f0f4ff;border:1px solid #c5d6f5;border-radius:10px;padding:12px 14px;">
          <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#174CCC;margin-bottom:8px;">This will generate</div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:10px;font-weight:600;color:#0d1f4a;margin-bottom:5px;">
            <div style="width:5px;height:5px;border-radius:50%;background:#174CCC;flex-shrink:0;margin-top:3px;"></div>
            ${matchCount} round robin matches
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:10px;font-weight:600;color:#0d1f4a;margin-bottom:5px;">
            <div style="width:5px;height:5px;border-radius:50%;background:#174CCC;flex-shrink:0;margin-top:3px;"></div>
            Court rotation schedule
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px;font-size:10px;font-weight:600;color:#0d1f4a;">
            <div style="width:5px;height:5px;border-radius:50%;background:#174CCC;flex-shrink:0;margin-top:3px;"></div>
            Initial standings
          </div>
        </div>

      </div>
    </div>

    <!-- Hidden input for generateRR to read — updated by card selection -->
    <input type="hidden" id="t-rr-format" value="play11_win1">

    <!-- Footer -->
    <div style="display:flex;justify-content:flex-end;margin-top:20px;padding-top:14px;border-top:0.5px solid #e0e7f5;">
      <button onclick="(function(){const m=document.querySelector('.t-modal');if(m)m.style.maxWidth='';tSetModalSubtitle('');generateRR(${catId});})()"
        style="display:inline-flex;align-items:center;gap:7px;padding:11px 24px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3 0%,#174CCC 100%);color:white;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Generate Round Robin${useGroups ? ' & Groups' : ''}
      </button>
    </div>`;

  openTModal();

  // Wire group advancing dropdown if group stage
  if (useGroups) {
    const refreshAdvancing = () => {
      const sizeEl = document.getElementById('t-group-size');
      const advEl  = document.getElementById('t-finals-per-group');
      if (!sizeEl || !advEl) return;
      const chosenSize = parseInt(sizeEl.value, 10);
      const chosen = tSuggestGroupSizes(numTeams).find(s => s.size === chosenSize);
      const minGroupSize = chosen ? Math.min(...chosen.distribution) : chosenSize;
      const maxAdvance = Math.min(minGroupSize - 1, 5);
      let opts = '';
      for (let n = 1; n <= maxAdvance; n++) {
        const isDefault = n === Math.min(2, maxAdvance);
        opts += `<option value="${n}" ${isDefault ? 'selected' : ''}>Top ${n} per group (${n * chosen.groups} total to bracket)</option>`;
      }
      advEl.innerHTML = opts;
    };
    refreshAdvancing();
    document.getElementById('t-group-size').addEventListener('change', refreshAdvancing);
  }
}

// ── Format card selection helper ──────────────────────────────────────────
function rrSelectFormatCard(el, value) {
  // Update all card styles
  document.querySelectorAll('.rr-format-card').forEach(card => {
    card.style.border = '1px solid #e0e7f5';
    card.style.background = 'white';
    card.style.boxShadow = 'none';
    const check = card.querySelector('.rr-check-icon');
    if (check) check.style.display = 'none';
  });
  // Apply selected style
  el.style.border = '2px solid #174CCC';
  el.style.background = 'rgba(23,76,204,0.05)';
  el.style.boxShadow = '0 0 0 4px rgba(23,76,204,0.08)';
  const check = el.querySelector('.rr-check-icon');
  if (check) check.style.display = 'flex';
  // Update hidden input for generateRR
  const input = document.getElementById('t-rr-format');
  if (input) input.value = value;
}


async function generateRR(catId) {
  const formatEl = document.getElementById('t-rr-format');
  const format = formatEl ? formatEl.value : 'play11_win1';
  const teams = await tApi(`tournament_teams?category_id=eq.${catId}&select=*&order=id`);
  const n = teams.length;

  // Decide path: single RR (≤8 teams) vs groups (>8 teams)
  const useGroups = n > GROUP_TRIGGER_THRESHOLD;

  if (!useGroups) {
    // ─── SINGLE RR (existing behavior) ─────────────────────
    if (n < 3 || n > 20) { tToast(`Round robin supports 3-20 teams. You have ${n}.`, true); return; }
    const schedule = RR_SCHEDULES[n];
    if (!schedule) { tToast(`No schedule found for ${n} teams.`, true); return; }

    const rows = [];
    schedule.forEach(round => {
      round.courts.forEach(court => {
        rows.push({
          category_id: catId,
          round: round.round,
          court: court.court,
          team_a_id: teams[court.a].id,
          team_b_id: teams[court.b].id,
          status: 'pending'
        });
      });
      round.bye.forEach(byeIdx => {
        rows.push({
          category_id: catId,
          round: round.round,
          court: 0,
          team_a_id: teams[byeIdx].id,
          team_b_id: teams[byeIdx].id,
          status: 'bye'
        });
      });
    });

    await tApi(`tournament_categories?id=eq.${catId}`, 'PATCH',
      { rr_format: format, best_of: 1, finals_per_group: null });
    await tApi('tournament_rr_matches', 'POST', rows);
    closeTModal();
    tToast(`Schedule generated! ${rows.filter(r => r.status === 'pending').length} matches ready.`);
  } else {
    // ─── GROUPS ──────────────────────────────────────────────
    const sizeEl = document.getElementById('t-group-size');
    const advEl = document.getElementById('t-finals-per-group');
    const targetSize = parseInt(sizeEl?.value || '4', 10);
    const finalsPerGroup = parseInt(advEl?.value || '2', 10);
    const distribution = tComputeDistribution(n, targetSize);
    if (!distribution) { tToast(`Cannot split ${n} teams with target ${targetSize}.`, true); return; }

    // 1. Create the group rows
    const groupRows = distribution.map((_, i) => ({
      category_id: catId,
      name: tGroupLetter(i),
      position: i,
    }));
    await tApi('tournament_groups', 'POST', groupRows);
    // Fetch the just-created groups ordered by position
    const createdGroups = await tApi(`tournament_groups?category_id=eq.${catId}&select=*&order=position`);

    // 2. Shuffle teams and deal them into groups based on the distribution
    const shuffled = tShuffleArray(teams);
    const groupedTeams = [];   // [ [teamsForGroup0...], [teamsForGroup1...], ... ]
    let cursor = 0;
    for (let i = 0; i < distribution.length; i++) {
      groupedTeams.push(shuffled.slice(cursor, cursor + distribution[i]));
      cursor += distribution[i];
    }

    // 3. Update each team with its group_id
    //    Bulk PATCH per group — N+1 at worst, one per group.
    await Promise.all(groupedTeams.map((teamList, gIdx) => {
      const ids = teamList.map(t => t.id);
      return tApi(
        `tournament_teams?id=in.(${ids.join(',')})`,
        'PATCH',
        { group_id: createdGroups[gIdx].id }
      );
    }));

    // 4. Build per-group RR schedule
    const allMatchRows = [];
    groupedTeams.forEach((teamList, gIdx) => {
      const groupId = createdGroups[gIdx].id;
      const schedule = RR_SCHEDULES[teamList.length];
      if (!schedule) {
        // Should not happen since min=3, max=8, all covered
        console.error(`No RR_SCHEDULES entry for ${teamList.length} teams`);
        return;
      }
      schedule.forEach(round => {
        round.courts.forEach(court => {
          allMatchRows.push({
            category_id: catId,
            group_id: groupId,
            round: round.round,
            court: court.court,
            team_a_id: teamList[court.a].id,
            team_b_id: teamList[court.b].id,
            status: 'pending',
          });
        });
        round.bye.forEach(byeIdx => {
          allMatchRows.push({
            category_id: catId,
            group_id: groupId,
            round: round.round,
            court: 0,
            team_a_id: teamList[byeIdx].id,
            team_b_id: teamList[byeIdx].id,
            status: 'bye',
          });
        });
      });
    });

    await tApi(`tournament_categories?id=eq.${catId}`, 'PATCH',
      { rr_format: format, best_of: 1, finals_per_group: finalsPerGroup });
    if (allMatchRows.length) {
      await tApi('tournament_rr_matches', 'POST', allMatchRows);
    }
    closeTModal();
    const numGames = allMatchRows.filter(r => r.status === 'pending').length;
    tToast(`${distribution.length} groups created — ${numGames} matches ready across all groups.`);
  }

  tCurrentCategoryId = catId;
  const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
  const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
  renderTournamentDetail(t, categories);
}

// ─── GENERATE BRACKET ───────────────────────────────────────
async function generateBracket(catId, tournamentId) {
  const size = parseInt(document.getElementById(`finals-size-${catId}`).value);
  const format = document.getElementById(`finals-elim-${catId}`).value;
  const scoreFormat = document.getElementById(`finals-score-format-${catId}`)?.value || 'play11_win2';

  // ── Check all RR matches have scores before generating bracket ────────
  const allRR = await tApi(`tournament_rr_matches?category_id=eq.${catId}&select=id,round,court,status,team_a_id,team_b_id`);
  const pending = allRR.filter(m => m.status !== 'completed' && m.status !== 'bye');
  if (pending.length > 0) {
    const details = pending.map(m => `Round ${m.round}${m.court ? ', Court ' + m.court : ''}`).join(' — ');
    tToast(
      `Cannot generate bracket: ${pending.length} match${pending.length > 1 ? 'es are' : ' is'} missing scores.\n${details}`,
      true
    );
    return;
  }

  // Detect best-of format for finals
  const isBestOf = scoreFormat === 'best_of_3' || scoreFormat === 'best_of_5';
  const finalsBestOf = scoreFormat === 'best_of_3' ? 3 : scoreFormat === 'best_of_5' ? 5 : 1;

  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=*`);
  const teams = await tApi(`tournament_teams?category_id=eq.${catId}&select=*`);
  const rrMatches = await tApi(`tournament_rr_matches?category_id=eq.${catId}&select=*`);
  const groups = await tApi(`tournament_groups?category_id=eq.${catId}&select=*&order=position`);

  let advancing;  // ordered array of team-stat objects, index 0 = top seed
  if (groups.length > 0 && cat.finals_per_group) {
    // Groups mode: build seeded advancement from per-group standings.
    const groupStandings = groups.map(g => {
      const gTeams = teams.filter(t => t.group_id === g.id);
      const gMatches = rrMatches.filter(m => m.group_id === g.id);
      return tCalcStandings(gTeams, gMatches);
    });
    advancing = tBuildSeededAdvancement(groupStandings, cat.finals_per_group);
    // Drop forfeited teams from the seeding (they should never advance).
    advancing = advancing.filter(s => !s.forfeited);
  } else {
    // Single-RR mode: existing behavior.
    const standings = tCalcStandings(teams, rrMatches);
    advancing = standings.filter(s => !s.forfeited).slice(0, size);
  }

  await tApi(`tournament_categories?id=eq.${catId}`, 'PATCH', {
    finals_format: format,
    finals_size: advancing.length,
    finals_format_score: scoreFormat,
    best_of: finalsBestOf
  });

  const bracketMatches = buildBracketMatches(advancing, catId, format);
  if (bracketMatches.length) {
    await tApi('tournament_bracket_matches', 'POST', bracketMatches);
  }
  tToast(`Bracket generated! ${advancing.length} teams advancing.`);
  openTournament(tCurrentTournamentId);
}

// Returns the canonical "bracket order" for a single-elimination bracket
// of size n (must be a power of 2). Each entry is a 0-based seed index.
// Adjacent pairs in the result feed the same next-round match, so the
// advanceBracket "floor((n-1)/2)" formula works correctly.
//
// Examples:
//   n=4  → [0, 3, 1, 2]                      meaning matches 1v4, 2v3
//   n=8  → [0, 7, 3, 4, 1, 6, 2, 5]          meaning 1v8, 4v5, 2v7, 3v6
//   n=16 → [0,15,7,8,3,12,4,11,1,14,6,9,2,13,5,10]
function tBracketOrder(n) {
  if (n === 1) return [0];
  const half = tBracketOrder(n / 2);
  const result = [];
  half.forEach(s => {
    result.push(s);
    result.push(n - 1 - s);
  });
  return result;
}

// Standard single-elimination seed pairings for a power-of-2 bracket size.
// Returns array of [seedA_index, seedB_index] pairs for round 1, ordered so
// match #1 and match #2 feed the same SF match, etc.
//   bracketSize=4  → [[0,3],[1,2]]
//   bracketSize=8  → [[0,7],[3,4],[1,6],[2,5]]
//   bracketSize=16 → [[0,15],[7,8],[3,12],[4,11],[1,14],[6,9],[2,13],[5,10]]
function tStandardBracketPairings(bracketSize) {
  const order = tBracketOrder(bracketSize);
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) {
    pairs.push([order[i], order[i + 1]]);
  }
  return pairs;
}

function buildBracketMatches(advancing, catId, format) {
  const n = advancing.length;
  if (n < 2) return [];

  const matches = [];

  // Special small-N cases (preserved from previous behavior)
  if (n === 2) {
    matches.push({ category_id: catId, round_name: 'Final', match_number: 1,
      team_a_id: advancing[0].id, team_b_id: advancing[1].id,
      seed_a: 1, seed_b: 2, status: 'pending' });
    return matches;
  }
  if (n === 3) {
    // 1 gets a bye, 2 plays 3, winner plays 1
    matches.push({ category_id: catId, round_name: 'Semifinals', match_number: 1,
      team_a_id: advancing[1].id, team_b_id: advancing[2].id,
      seed_a: 2, seed_b: 3, status: 'pending' });
    matches.push({ category_id: catId, round_name: 'Final', match_number: 1,
      team_a_id: advancing[0].id, team_b_id: null,
      seed_a: 1, seed_b: null, status: 'pending' });
    return matches;
  }
  if (n === 4) {
    matches.push({ category_id: catId, round_name: 'Semifinals', match_number: 1,
      team_a_id: advancing[0].id, team_b_id: advancing[3].id,
      seed_a: 1, seed_b: 4, status: 'pending' });
    matches.push({ category_id: catId, round_name: 'Semifinals', match_number: 2,
      team_a_id: advancing[1].id, team_b_id: advancing[2].id,
      seed_a: 2, seed_b: 3, status: 'pending' });
    matches.push({ category_id: catId, round_name: '3rd Place', match_number: 1,
      team_a_id: null, team_b_id: null, status: 'pending' });
    matches.push({ category_id: catId, round_name: 'Final', match_number: 1,
      team_a_id: null, team_b_id: null, status: 'pending' });
    return matches;
  }

  // ─── GENERAL CASE for n >= 5 ──────────────────────────────
  // Pad to next power of 2 with byes (null teams).
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const padded = advancing.slice();
  while (padded.length < bracketSize) padded.push(null); // null = bye slot
  // Build standard seed pairings (1 vs N, 2 vs N-1, ...)
  const pairings = tStandardBracketPairings(bracketSize)
    .map(([sa, sb]) => [padded[sa], padded[sb]]);

  // If we're in groups mode (teams have _groupIndex), avoid same-group rematches in round 1.
  const hasGroupInfo = padded.some(t => t && typeof t._groupIndex === 'number');
  if (hasGroupInfo) tAvoidSameGroupClashes(pairings);

  // Round 1 names depend on bracket size
  const round1Name =
    bracketSize === 16 ? 'R16' :
    bracketSize === 8  ? 'QF'  :
    bracketSize === 4  ? 'Semifinals' : `R${bracketSize}`;

  // Insert round-1 matches. If a slot is null on EITHER side, the other team
  // gets an automatic bye → mark the match completed with the non-null team
  // as winner so advanceBracket logic in the next round still works.
  pairings.forEach((pair, i) => {
    const [a, b] = pair;
    // Find the original seed numbers (their indices in `advancing`)
    const seedA = a ? advancing.indexOf(a) + 1 : null;
    const seedB = b ? advancing.indexOf(b) + 1 : null;

    if (a && !b) {
      // Top seed gets a bye through round 1 — record as a completed bye
      matches.push({
        category_id: catId, round_name: round1Name, match_number: i + 1,
        team_a_id: a.id, team_b_id: null,
        seed_a: seedA, seed_b: null,
        score_a: null, score_b: null,
        winner_id: a.id, status: 'bye'
      });
    } else if (!a && b) {
      matches.push({
        category_id: catId, round_name: round1Name, match_number: i + 1,
        team_a_id: null, team_b_id: b.id,
        seed_a: null, seed_b: seedB,
        score_a: null, score_b: null,
        winner_id: b.id, status: 'bye'
      });
    } else if (a && b) {
      matches.push({
        category_id: catId, round_name: round1Name, match_number: i + 1,
        team_a_id: a.id, team_b_id: b.id,
        seed_a: seedA, seed_b: seedB,
        status: 'pending'
      });
    }
    // Both null = nothing to insert (shouldn't happen with proper padding).
  });

  // Subsequent round placeholders. We've already created Round 1 with
  // bracketSize/2 matches above. Start placeholder generation at the NEXT
  // round (bracketSize/4 matches), not at bracketSize/2 (which would
  // duplicate Round 1).
  let currentSize = bracketSize / 4;
  while (currentSize >= 1) {
    let roundName;
    if (currentSize === 1) roundName = 'Final';
    else if (currentSize === 2) roundName = 'Semifinals';
    else if (currentSize === 4) roundName = 'QF';
    else roundName = `R${currentSize * 2}`;

    for (let i = 0; i < currentSize; i++) {
      matches.push({
        category_id: catId, round_name: roundName, match_number: i + 1,
        team_a_id: null, team_b_id: null, status: 'pending'
      });
    }
    if (currentSize === 2) {
      // 3rd place playoff sits alongside the Semifinals
      matches.push({
        category_id: catId, round_name: '3rd Place', match_number: 1,
        team_a_id: null, team_b_id: null, status: 'pending'
      });
    }
    currentSize = currentSize / 2;
  }

  // Auto-advance bye winners into the next round so the bracket renders cleanly.
  // Walk through the matches and propagate any bye from R1 into its R2 slot.
  // We do this client-side here because we built the rows in order.
  const round1Matches = matches.filter(m => m.round_name === round1Name);
  const round2Name =
    bracketSize === 16 ? 'QF' :
    bracketSize === 8  ? 'Semifinals' :
    bracketSize === 4  ? 'Final' : `R${bracketSize / 2}`;
  const round2Matches = matches.filter(m => m.round_name === round2Name);
  round1Matches.forEach((m, idx) => {
    if (m.status !== 'bye' || !m.winner_id) return;
    const r2idx = Math.floor(idx / 2);
    const isTopSlot = idx % 2 === 0;
    const r2 = round2Matches[r2idx];
    if (!r2) return;
    if (isTopSlot) { r2.team_a_id = m.winner_id; r2.seed_a = m.seed_a || m.seed_b; }
    else { r2.team_b_id = m.winner_id; r2.seed_b = m.seed_a || m.seed_b; }
  });

  return matches;
}

// ─── SCORE ENTRY MODAL ──────────────────────────────────────
// ── Bracket Builder helpers ───────────────────────────────────────────────
function bbSelectTeams(btn, catId) {
  const val = btn.dataset.val;
  // Update hidden input
  const inp = document.getElementById(`finals-size-${catId}`);
  if (inp) inp.value = val;
  // Update button styles
  btn.closest('div').querySelectorAll('button').forEach(b => {
    const active = b === btn;
    b.style.background = active ? '#174CCC' : 'white';
    b.style.color = active ? 'white' : '#6b7a99';
    b.style.borderColor = active ? 'transparent' : '#e0e7f5';
  });
  // Update qualified teams preview to show correct number of teams
  const previewEl = document.getElementById(`bb-preview-${catId}`);
  if (!previewEl) return;
  const rows = previewEl.querySelectorAll('[data-preview-row]');
  rows.forEach(row => {
    const idx = parseInt(row.dataset.previewRow);
    row.style.display = idx < parseInt(val) ? '' : 'none';
  });
}

function bbSelectFormat(btn, catId) {
  const val = btn.dataset.val;
  // Update hidden input
  const inp = document.getElementById(`finals-score-format-${catId}`);
  if (inp) inp.value = val;
  // Update button styles
  btn.closest('div').querySelectorAll('button').forEach(b => {
    const active = b === btn;
    b.style.background = active ? '#174CCC' : 'white';
    b.style.color = active ? 'white' : '#6b7a99';
    b.style.borderColor = active ? 'transparent' : '#e0e7f5';
  });
}

function singleEliminationLabel(format) {
  if (!format || format === 'single') return 'Single Elimination';
  return format;
}


async function openScoreModal(type, matchId, teamAId, teamBId, catId) {
  if (!teamAId || !teamBId) { tToast('This match is waiting for previous results.', true); return; }

  let match;
  if (type === 'rr') {
    [match] = await tApi(`tournament_rr_matches?id=eq.${matchId}&select=*`);
  } else {
    [match] = await tApi(`tournament_bracket_matches?id=eq.${matchId}&select=*`);
  }
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=*`);
  const teams = await tApi(`tournament_teams?category_id=eq.${catId}&select=*`);
  const tMap = {}; teams.forEach(t => tMap[t.id] = t);
  const teamA = tMap[teamAId];
  const teamB = tMap[teamBId];
  const isFinals = type === 'bracket';
  const bestOf = cat.best_of || 1;
  const singlesMatch = bestOf > 1;
  const existingGames = match.games || [];

  // ── Format label ─────────────────────────────────────────────────────
  const formatLabel = isFinals
    ? (T_FORMATS[cat.finals_format_score] || 'Play to 11, win by 2')
    : (T_FORMATS[cat.rr_format] || 'Play to 11, win by 1');
  // Convert "Play to 11, win by 1" → "Play to 11 • Win by 1"
  const formatDisplay = formatLabel.replace(', win by ', ' • Win by ').replace(', win by ', ' • Win by ');

  // ── Subtitle: Round X • Court Y • Round Robin / Finals ───────────────
  const subtitleText = isFinals
    ? `${match.round_name} • Finals`
    : `Round ${match.round} • Court ${match.court} • Round Robin`;

  // ── Player names ──────────────────────────────────────────────────────
  const teamAPlayers = getTeamPlayerNames(teamA) || '';
  const teamBPlayers = getTeamPlayerNames(teamB) || '';

  // ── Set modal title + subtitle ────────────────────────────────────────
  document.getElementById('t-modal-title').textContent = 'Record Match Result';
  tSetModalSubtitle(subtitleText);

  // ── singlesMatch path — preserved unchanged ───────────────────────────
  if (singlesMatch) {
    document.getElementById('t-modal-body').innerHTML = `
      <button onclick="tSetModalSubtitle('');closeTModal()"
        style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
        onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
        onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div style="font-size:12px;font-weight:600;color:#6b7a99;text-align:center;margin-bottom:16px;padding:8px;background:#f4f6fc;border-radius:8px;">
        ${isFinals ? '🏆 Finals: ' : '🏓 Round Robin: '}${tEsc(formatLabel)} · Best of ${bestOf}
      </div>
      <div class="t-form-group" style="margin-bottom:16px;">
        <label class="t-label">Court number</label>
        <input class="t-input" type="number" min="1" id="t-court-num" value="${match.court || ''}" placeholder="e.g. 5" style="max-width:120px;">
      </div>
      <div class="t-singles-header">
        <span class="t-singles-player-col">${tEsc(teamA?.name || '?')}</span>
        <span></span>
        <span class="t-singles-player-col">${tEsc(teamB?.name || '?')}</span>
      </div>
      <div id="t-games-container">
        ${buildGameRows(bestOf, teamA?.name || '?', teamB?.name || '?', existingGames)}
      </div>
      <div style="display:flex;justify-content:space-around;margin-top:12px;">
        <label class="t-forfeit-check-label"><input type="checkbox" id="t-forfeit-a" onchange="onForfeitCheck('a','b')"> ${tEsc(teamA?.name || '?')} Forfeit</label>
        <label class="t-forfeit-check-label"><input type="checkbox" id="t-forfeit-b" onchange="onForfeitCheck('b','a')"> ${tEsc(teamB?.name || '?')} Forfeit</label>
      </div>
      <div id="t-score-preview" style="text-align:center;min-height:28px;margin-top:12px;"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:0.5px solid #e0e7f5;">
        <button type="button" onclick="saveMatch('${type}',${matchId},${teamAId},${teamBId},${catId})"
          style="display:inline-flex;align-items:center;gap:7px;padding:10px 24px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3,#174CCC);color:white;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Save Result
        </button>
      </div>`;
    openTModal();
    return;
  }

  // ── Standard RR / bracket doubles modal — new design ─────────────────
  const scoreAVal = match.score_a ?? '';
  const scoreBVal = match.score_b ?? '';

  document.getElementById('t-modal-body').innerHTML = `
    <button onclick="tSetModalSubtitle('');closeTModal()"
      style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
      onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
      onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>

    <!-- Format badge -->
    <div style="margin-bottom:14px;">
      <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:8px;background:rgba(23,76,204,0.06);border:1px solid rgba(23,76,204,0.12);color:#174CCC;font-size:11px;font-weight:700;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Format: ${tEsc(formatDisplay)}
      </span>
    </div>

    <!-- Court number -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <span style="font-size:11px;font-weight:700;color:#6b7a99;">Court:</span>
      <input type="number" min="1" id="t-court-num" value="${match.court || ''}"
        style="width:72px;height:36px;text-align:center;border:1px solid #e0e7f5;border-radius:8px;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:800;color:#0d1f4a;outline:none;"
        onfocus="this.style.borderColor='#174CCC';this.style.boxShadow='0 0 0 4px rgba(23,76,204,0.08)'"
        onblur="this.style.borderColor='#e0e7f5';this.style.boxShadow='none'">
    </div>

    <div style="border-top:0.5px solid #e0e7f5;margin-bottom:16px;"></div>

    <!-- Match card: 3-column grid -->
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-bottom:16px;">

      <!-- Team A -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
        <div style="font-size:13px;font-weight:800;color:#0d1f4a;text-align:center;">${tEsc(teamA?.name || '?')}</div>
        ${teamAPlayers ? `<div style="font-size:10px;font-weight:600;color:#6b7a99;text-align:center;line-height:1.4;">${tEsc(teamAPlayers).replace(' & ','<br>')}</div>` : ''}
        <input type="number" min="0" max="99" id="t-score-a" value="${scoreAVal}" placeholder="0"
          oninput="smLiveUpdate('${tEsc(teamA?.name || '?')}','${tEsc(teamB?.name || '?')}')"
          style="width:96px;height:72px;font-size:36px;font-weight:800;text-align:center;border-radius:16px;border:1px solid rgba(23,76,204,0.14);background:white;font-family:'Montserrat',sans-serif;color:#0d1f4a;outline:none;"
          onfocus="this.style.borderColor='#174CCC';this.style.boxShadow='0 0 0 4px rgba(23,76,204,0.08)'"
          onblur="this.style.borderColor=document.getElementById('sm-score-a-winner')?'rgba(36,188,150,0.22)':'rgba(23,76,204,0.14)';this.style.boxShadow='none'">
        <div id="sm-forfeit-a"
          onclick="smToggleForfeit('a')"
          style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;border:1px solid #e0e7f5;background:#f8f9ff;font-size:10px;font-weight:700;color:#6b7a99;cursor:pointer;user-select:none;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          Forfeit
        </div>
        <!-- Hidden checkbox for saveMatch compatibility -->
        <input type="checkbox" id="t-forfeit-a" onchange="onForfeitCheck('a','b')" style="display:none;">
      </div>

      <!-- VS -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:24px;">
        <div style="font-size:12px;font-weight:800;color:#b0bbd6;letter-spacing:1px;">VS</div>
      </div>

      <!-- Team B -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
        <div style="font-size:13px;font-weight:800;color:#0d1f4a;text-align:center;">${tEsc(teamB?.name || '?')}</div>
        ${teamBPlayers ? `<div style="font-size:10px;font-weight:600;color:#6b7a99;text-align:center;line-height:1.4;">${tEsc(teamBPlayers).replace(' & ','<br>')}</div>` : ''}
        <input type="number" min="0" max="99" id="t-score-b" value="${scoreBVal}" placeholder="0"
          oninput="smLiveUpdate('${tEsc(teamA?.name || '?')}','${tEsc(teamB?.name || '?')}')"
          style="width:96px;height:72px;font-size:36px;font-weight:800;text-align:center;border-radius:16px;border:1px solid rgba(23,76,204,0.14);background:white;font-family:'Montserrat',sans-serif;color:#0d1f4a;outline:none;"
          onfocus="this.style.borderColor='#174CCC';this.style.boxShadow='0 0 0 4px rgba(23,76,204,0.08)'"
          onblur="this.style.borderColor=document.getElementById('sm-score-b-winner')?'rgba(36,188,150,0.22)':'rgba(23,76,204,0.14)';this.style.boxShadow='none'">
        <div id="sm-forfeit-b"
          onclick="smToggleForfeit('b')"
          style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;border:1px solid #e0e7f5;background:#f8f9ff;font-size:10px;font-weight:700;color:#6b7a99;cursor:pointer;user-select:none;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          Forfeit
        </div>
        <!-- Hidden checkbox for saveMatch compatibility -->
        <input type="checkbox" id="t-forfeit-b" onchange="onForfeitCheck('b','a')" style="display:none;">
      </div>

    </div>

    <div style="border-top:0.5px solid #e0e7f5;margin-bottom:14px;"></div>

    <!-- Winner feedback — shown when scores differ -->
    <div id="sm-winner-feedback" style="display:none;background:rgba(36,188,150,0.08);border:1px solid rgba(36,188,150,0.22);border-radius:10px;padding:10px 14px;display:none;align-items:center;gap:8px;margin-bottom:14px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#085041" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <div id="sm-winner-text" style="font-size:12px;font-weight:800;color:#085041;"></div>
    </div>

    <!-- Footer -->
    <div style="display:flex;justify-content:flex-end;">
      <button onclick="saveMatch('${type}',${matchId},${teamAId},${teamBId},${catId})"
        style="display:inline-flex;align-items:center;gap:7px;padding:11px 28px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3,#174CCC);color:white;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Save Result
      </button>
    </div>`;

  openTModal();

  // Pre-activate forfeit pill if this match already has a forfeit recorded
  if (match.forfeit_team_id) {
    if (match.forfeit_team_id === teamAId) smToggleForfeit('a');
    else if (match.forfeit_team_id === teamBId) smToggleForfeit('b');
  }

  // Trigger live update if existing scores are present
  if (scoreAVal !== '' || scoreBVal !== '') {
    smLiveUpdate(teamA?.name || '?', teamB?.name || '?');
  }
}

// ── Score modal live helpers ──────────────────────────────────────────────
function smLiveUpdate(nameA, nameB) {
  const sa = parseInt(document.getElementById('t-score-a')?.value);
  const sb = parseInt(document.getElementById('t-score-b')?.value);
  const inputA = document.getElementById('t-score-a');
  const inputB = document.getElementById('t-score-b');
  const fb = document.getElementById('sm-winner-feedback');
  const ft = document.getElementById('sm-winner-text');

  // Reset score input colors
  if (inputA) { inputA.style.background = 'white'; inputA.style.borderColor = 'rgba(23,76,204,0.14)'; }
  if (inputB) { inputB.style.background = 'white'; inputB.style.borderColor = 'rgba(23,76,204,0.14)'; }

  if (!isNaN(sa) && !isNaN(sb) && sa !== sb) {
    const winnerName = sa > sb ? nameA : nameB;
    const winScore = Math.max(sa, sb);
    const loseScore = Math.min(sa, sb);
    if (ft) ft.textContent = `🏆 ${winnerName} wins · ${winScore} – ${loseScore}`;
    if (fb) fb.style.display = 'flex';
    // Highlight winner score input in green
    const winInput = sa > sb ? inputA : inputB;
    if (winInput) { winInput.style.background = 'rgba(36,188,150,0.08)'; winInput.style.borderColor = 'rgba(36,188,150,0.22)'; }
  } else {
    if (fb) fb.style.display = 'none';
  }
}

function smToggleForfeit(side) {
  const pill = document.getElementById(`sm-forfeit-${side}`);
  const cb   = document.getElementById(`t-forfeit-${side}`);
  if (!pill || !cb) return;
  const isActive = cb.checked;
  // Toggle
  cb.checked = !isActive;
  cb.dispatchEvent(new Event('change'));
  // Update pill visual
  if (!isActive) {
    pill.style.background = 'rgba(242,96,36,0.12)';
    pill.style.border = '1px solid rgba(242,96,36,0.24)';
    pill.style.color = '#F26024';
  } else {
    pill.style.background = '#f8f9ff';
    pill.style.border = '1px solid #e0e7f5';
    pill.style.color = '#6b7a99';
  }
}


async function saveMatch(type, matchId, teamAId, teamBId, catId) {
  // ── Court number ─────────────────────────────────────────────────────
  const courtVal = document.getElementById('t-court-num')?.value?.trim();
  const courtNum = parseInt(courtVal);
  const courtFilled = courtVal && !isNaN(courtNum) && courtNum >= 1;

  if (!courtFilled) {
    tToast('Please enter a court number.', true);
    document.getElementById('t-court-num')?.focus();
    return;
  }

  // ── Check if forfeit is selected ─────────────────────────────────────
  const forfeitA = document.getElementById('t-forfeit-a')?.checked;
  const forfeitB = document.getElementById('t-forfeit-b')?.checked;

  if (forfeitA || forfeitB) {
    const forfeitTeamId = forfeitA ? teamAId : teamBId;

    // Fetch full team data (with players) + match round/court for subtitle
    const [forfeitTeamData, matchData] = await Promise.all([
      tApi(`tournament_teams?id=eq.${forfeitTeamId}&select=*`).then(r => r[0]),
      type === 'rr'
        ? tApi(`tournament_rr_matches?id=eq.${matchId}&select=round,court`).then(r => r[0])
        : tApi(`tournament_bracket_matches?id=eq.${matchId}&select=round_name`).then(r => r[0]),
    ]);

    const forfeitTeamName = forfeitTeamData?.name || 'This team';
    const playerNames = getTeamPlayerNames(forfeitTeamData) || '';

    // Subtitle: "Round 2 • Court 2 • Round Robin" or "Finals • Semifinals"
    const subtitleText = type === 'rr'
      ? `Round ${matchData?.round || '?'} • Court ${courtNum} • Round Robin`
      : `${matchData?.round_name || 'Finals'}`;

    document.getElementById('t-modal-title').textContent = 'Confirm Team Withdrawal';
    tSetModalSubtitle(subtitleText);

    document.getElementById('t-modal-body').innerHTML = `
      <button onclick="tSetModalSubtitle('');closeTModal()"
        style="position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:0.5px solid #e0e7f5;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;"
        onmouseover="this.style.background='#fde8d8';this.style.borderColor='rgba(229,57,53,0.3)'"
        onmouseout="this.style.background='white';this.style.borderColor='#e0e7f5'">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <!-- Warning box -->
      <div style="background:rgba(242,96,36,0.06);border:1px solid rgba(242,96,36,0.18);border-radius:10px;padding:14px 16px;margin-bottom:12px;">

        <!-- Warning title -->
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#c04a0e;margin-bottom:10px;">
          <span style="font-size:14px;">⚠</span> Team Withdrawal
        </div>

        <!-- Team badge -->
        <div style="background:rgba(242,96,36,0.06);border:1px solid rgba(242,96,36,0.14);border-radius:8px;padding:10px 14px;margin-bottom:10px;">
          <div style="font-size:14px;font-weight:800;color:#c04a0e;margin-bottom:3px;">${tEsc(forfeitTeamName)}</div>
          ${playerNames ? `<div style="font-size:11px;font-weight:600;color:#9a3a0a;">${tEsc(playerNames)}</div>` : ''}
        </div>

        <!-- Body text -->
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;line-height:1.55;margin-bottom:6px;">
          <strong>${tEsc(forfeitTeamName)}</strong> will be withdrawn from this category.
        </div>
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;line-height:1.55;margin-bottom:6px;">
          Remaining matches will be automatically recorded as forfeits in favor of their opponents.
        </div>
        <div style="font-size:11px;font-weight:700;color:#c04a0e;margin-top:4px;">
          This action cannot be undone.
        </div>
      </div>

      <!-- Bottom note -->
      <div style="font-size:10px;font-weight:600;color:#b0bbd6;text-align:center;margin-bottom:4px;">
        Standings and remaining matches will update automatically.
      </div>

      <!-- Footer -->
      <div style="display:flex;justify-content:center;padding-top:10px;border-top:0.5px solid #e0e7f5;margin-top:6px;">
        <button
          onclick="tSetModalSubtitle('');processForfeit('${type}', ${matchId}, ${teamAId}, ${teamBId}, ${catId}, ${forfeitTeamId}, ${courtNum})"
          style="display:inline-flex;align-items:center;gap:7px;padding:11px 32px;border:none;border-radius:99px;background:#F26024;color:white;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;cursor:pointer;"
          onmouseover="this.style.background='#db531d'"
          onmouseout="this.style.background='#F26024'">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          Confirm Withdrawal
        </button>
      </div>`;
    return;
  }

  // ── Determine if scores are filled ───────────────────────────────────
  const [catCheck] = await tApi(`tournament_categories?id=eq.${catId}&select=name,best_of`);
  const bestOf = catCheck?.best_of || 1;
  const useGameByGame = bestOf > 1;

  let scoresProvided = false;
  let sa, sb, winnerId, gamesToSave = null;

  if (useGameByGame) {
    const gameScores = [];
    for (let i = 0; i < bestOf; i++) {
      const ga = parseInt(document.getElementById(`t-game-a-${i}`)?.value);
      const gb = parseInt(document.getElementById(`t-game-b-${i}`)?.value);
      if (!isNaN(ga) && !isNaN(gb)) gameScores.push({ score_a: ga, score_b: gb });
    }
    if (gameScores.length > 0) {
      scoresProvided = true;
      const result = calcBestOfWinner(bestOf, teamAId, teamBId, gameScores);
      if (!result.winnerId) {
        tToast('Match not complete yet — keep entering games.', true);
        return;
      }
      winnerId = result.winnerId;
      sa = result.winsA;
      sb = result.winsB;
      gamesToSave = gameScores;
    }
  } else {
    const aVal = document.getElementById('t-score-a')?.value?.trim();
    const bVal = document.getElementById('t-score-b')?.value?.trim();
    if (aVal !== '' || bVal !== '') {
      // At least one score entered — require both
      sa = parseInt(aVal);
      sb = parseInt(bVal);
      if (isNaN(sa) || isNaN(sb)) {
        tToast('Please enter both scores or leave both blank to save court only.', true);
        return;
      }
      winnerId = sa > sb ? teamAId : teamBId;
      scoresProvided = true;
    }
  }

  try {
    if (scoresProvided) {
      // Save court + scores + mark completed
      const table = type === 'rr' ? 'tournament_rr_matches' : 'tournament_bracket_matches';
      await tApi(`${table}?id=eq.${matchId}`, 'PATCH', {
        court: courtNum,
        score_a: sa, score_b: sb, winner_id: winnerId, status: 'completed',
        ...(gamesToSave ? { games: gamesToSave } : {}),
      });
      if (type === 'bracket') {
        await advanceBracket(matchId, winnerId, teamAId === winnerId ? teamBId : teamAId, catId);
      }
      tToast('Result saved!');
    } else {
      // Save court only — keep status unchanged
      const table = type === 'rr' ? 'tournament_rr_matches' : 'tournament_bracket_matches';
      await tApi(`${table}?id=eq.${matchId}`, 'PATCH', { court: courtNum });
      tToast(`Court ${courtNum} saved.`);
    }

    closeTModal();
    tCurrentCategoryId = catId;
    const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
    const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
    renderTournamentDetail(t, categories);
  } catch (err) {
    tToast(`Error: ${err.message}`, true);
  }
}

async function saveScore(type, matchId, teamAId, teamBId, catId) {
  // Legacy alias — calls saveMatch for backward compatibility
  return saveMatch(type, matchId, teamAId, teamBId, catId);
}

async function advanceBracket(matchId, winnerId, loserId, catId) {
  const [match] = await tApi(`tournament_bracket_matches?id=eq.${matchId}&select=*`);
  const allMatches = await tApi(`tournament_bracket_matches?category_id=eq.${catId}&select=*&order=id`);

  // Walk from R-of-N → next round in this order. The winner of match k in
  // round R goes into match floor(k/2) of round R+1, alternating slots.
  const flow = ['R32', 'R16', 'QF', 'Semifinals', 'Final'];
  const curIdx = flow.indexOf(match.round_name);
  if (curIdx === -1) return;

  // Special handling: SF winner → Final (and SF loser → 3rd Place).
  if (match.round_name === 'Semifinals') {
    const finalMatch = allMatches.find(m => m.round_name === 'Final');
    const thirdMatch = allMatches.find(m => m.round_name === '3rd Place');
    if (finalMatch) {
      const patch = finalMatch.team_a_id ? { team_b_id: winnerId } : { team_a_id: winnerId };
      await tApi(`tournament_bracket_matches?id=eq.${finalMatch.id}`, 'PATCH', patch);
    }
    if (thirdMatch) {
      const patch = thirdMatch.team_a_id ? { team_b_id: loserId } : { team_a_id: loserId };
      await tApi(`tournament_bracket_matches?id=eq.${thirdMatch.id}`, 'PATCH', patch);
    }
    return;
  }

  // Generic flow for earlier rounds: winner of match #N (1-indexed) goes
  // into match #ceil(N/2) of the next round, alternating top/bottom slot.
  const nextRound = flow[curIdx + 1];
  if (!nextRound) return;
  const nextMatches = allMatches
    .filter(m => m.round_name === nextRound)
    .sort((a, b) => (a.match_number || 0) - (b.match_number || 0));
  const myMatchNum = match.match_number || 1;
  const targetIdx = Math.floor((myMatchNum - 1) / 2);
  const targetMatch = nextMatches[targetIdx];
  if (!targetMatch) return;
  const isTopSlot = (myMatchNum - 1) % 2 === 0;
  const patch = isTopSlot ? { team_a_id: winnerId } : { team_b_id: winnerId };
  await tApi(`tournament_bracket_matches?id=eq.${targetMatch.id}`, 'PATCH', patch);
}

// ─── TOURNAMENT STATUS ──────────────────────────────────────
async function startTournament(id) {
  await tApi(`tournaments?id=eq.${id}`, 'PATCH', { status: 'active' });
  tToast('Tournament started!');
  openTournament(id);
}

async function completeTournament(id) {
  // Validate all teams have players and all matches have scores
  const categories = await tApi(`tournament_categories?tournament_id=eq.${id}&select=id,name`);
  const errors = [];
  // Fetch all per-category data in parallel — N×3 queries become 3 round-trips total
  const validations = await Promise.all(categories.map(async (cat) => {
    const [teams, rrMatches, bracketMatches] = await Promise.all([
      tApi(`tournament_teams?category_id=eq.${cat.id}&select=*`),
      tApi(`tournament_rr_matches?category_id=eq.${cat.id}&status=eq.pending&select=id`),
      tApi(`tournament_bracket_matches?category_id=eq.${cat.id}&status=eq.pending&select=id`),
    ]);
    return { cat, teams, rrMatches, bracketMatches };
  }));
  for (const { cat, teams, rrMatches, bracketMatches } of validations) {
    const teamsWithoutPlayers = teams.filter(t => !t.player1_id);
    if (teamsWithoutPlayers.length) {
      errors.push(`"${cat.name}": ${teamsWithoutPlayers.length} team(s) have no players registered.`);
    }
    if (rrMatches.length) {
      errors.push(`"${cat.name}": ${rrMatches.length} round robin match(es) have no scores.`);
    }
    if (bracketMatches.length) {
      errors.push(`"${cat.name}": ${bracketMatches.length} finals match(es) have no scores.`);
    }
  }
  if (errors.length) {
    document.getElementById('t-modal-title').textContent = 'Cannot Complete Tournament';
    document.getElementById('t-modal-body').innerHTML = `
      <div style="padding:8px 0 16px;">
        <p style="font-size:13px;color:#0d1f4a;margin-bottom:14px;font-weight:600;">Please fix the following before completing:</p>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:8px;">
          ${errors.map(e => `<li style="font-size:13px;color:#F26024;padding:8px 12px;background:#fde8d8;border-radius:6px;">⚠️ ${e}</li>`).join('')}
        </ul>
      </div>
      <div class="t-form-actions">
        <button type="button" class="t-btn t-btn-primary" onclick="closeTModal()">OK</button>
      </div>`;
    openTModal();
    return;
  }
  // Fetch tournament for context
  const [tournament] = await tApi(`tournaments?id=eq.${id}&select=*`);
  const tName = tEsc(tournament?.name || 'Tournament');
  const tDate = tournament?.date ? new Date(tournament.date + 'T00:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '';
  const totalTeams = validations.reduce((s, v) => s + v.teams.length, 0);
  const [allRR, allBracket] = await Promise.all([
    tApi(`tournament_rr_matches?tournament_id=eq.${id}&select=id`).catch(() => []),
    tApi(`tournament_bracket_matches?tournament_id=eq.${id}&select=id`).catch(() => []),
  ]);
  const totalMatchCount = (allRR.length || 0) + (allBracket.length || 0);
  const catIds = validations.map(v => v.cat.id).join(',') || '0';
  const finals = await tApi(`tournament_bracket_matches?category_id=in.(${catIds})&round_name=eq.Final&status=eq.completed&select=winner_id`).catch(() => []);
  const champReady = finals.length > 0 && finals.every(f => f.winner_id);
  const champLabel = champReady ? 'Ready' : 'Pending';

  document.getElementById('t-modal-title').textContent = 'Complete & Lock Tournament';
  const xBtnEl = document.getElementById('t-modal-close-x');
  if (xBtnEl) xBtnEl.style.display = 'flex';

  document.getElementById('t-modal-body').innerHTML = `
    <div style="padding:10px 14px;background:#f8f9ff;border-radius:10px;border:0.5px solid #e0e7f5;margin-bottom:18px;">
      <div style="font-size:15px;font-weight:800;color:#0d1f4a;margin-bottom:2px;">${tName}</div>
      ${tDate ? `<div style="font-size:12px;font-weight:600;color:#6b7a99;margin-bottom:4px;">${tDate}</div>` : ''}
      <div style="font-size:11px;font-weight:600;color:#6b7a99;">${validations.length} Categor${validations.length!==1?'ies':'y'} · ${totalTeams} Players</div>
    </div>
    <div style="border-top:0.5px solid #e0e7f5;margin-bottom:18px;"></div>
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;">
      <div style="width:36px;height:36px;border-radius:10px;background:#e8f0ff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
      </div>
      <div>
        <div style="font-size:13px;font-weight:800;color:#0d1f4a;margin-bottom:4px;">Tournament Completion</div>
        <div style="font-size:12px;font-weight:600;color:#6b7a99;line-height:1.6;">This tournament will be marked as completed and moved to tournament history.<br>Results, standings, and brackets will become final.</div>
      </div>
    </div>
    <div style="background:rgba(36,188,150,0.08);border-left:4px solid #24BC96;border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:18px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#085041;margin-bottom:8px;">After completion:</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;display:flex;align-items:flex-start;gap:6px;"><span>✅</span><span>Final standings become official</span></div>
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;display:flex;align-items:flex-start;gap:6px;"><span>✅</span><span>Results remain visible to players</span></div>
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;display:flex;align-items:flex-start;gap:6px;"><span>✅</span><span>Tournament moves to completed tournaments</span></div>
        <div style="font-size:12px;font-weight:600;color:#0d1f4a;display:flex;align-items:flex-start;gap:6px;"><span>🔒</span><span>Teams, brackets, and scores can no longer be edited — unless you reopen the tournament</span></div>
      </div>
    </div>
    <div style="border-top:0.5px solid #e0e7f5;margin-bottom:18px;"></div>
    <div style="margin-bottom:18px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6b7a99;margin-bottom:10px;">Tournament Summary</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;">
          <div style="font-size:18px;font-weight:800;color:#0d1f4a;">${validations.length}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:1px;">Categories</div>
        </div>
        <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;">
          <div style="font-size:18px;font-weight:800;color:#0d1f4a;">${totalTeams}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:1px;">Teams</div>
        </div>
        <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;">
          <div style="font-size:18px;font-weight:800;color:#0d1f4a;">${totalMatchCount}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:1px;">Matches</div>
        </div>
        <div style="background:#f8f9ff;border-radius:8px;padding:8px 12px;">
          <div style="font-size:18px;font-weight:800;color:${champReady?'#24BC96':'#F26024'};">${champLabel}</div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:1px;">Champion(s)</div>
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:18px;">
      <input type="checkbox" id="t-complete-confirm-chk" style="margin-top:2px;width:15px;height:15px;cursor:pointer;accent-color:#174CCC;flex-shrink:0;">
      <label for="t-complete-confirm-chk" style="font-size:12px;font-weight:600;color:#0d1f4a;cursor:pointer;line-height:1.5;">I understand that tournament results will be locked.</label>
    </div>
    <div style="display:flex;justify-content:flex-end;">
      <button type="button" id="t-finalize-btn" onclick="tCheckFinalizeConfirmHub(${id})" disabled
        style="display:inline-flex;align-items:center;gap:6px;padding:10px 24px;border:none;border-radius:99px;background:#e0e7f5;color:#b0bbd6;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:not-allowed;transition:all .15s;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Finalize Tournament
      </button>
    </div>`;

  document.getElementById('t-complete-confirm-chk')?.addEventListener('change', (e) => {
    const btn = document.getElementById('t-finalize-btn');
    if (btn) {
      btn.disabled = !e.target.checked;
      btn.style.background = e.target.checked ? 'linear-gradient(180deg,#24BC96,#1a9e7a)' : '#e0e7f5';
      btn.style.color = e.target.checked ? 'white' : '#b0bbd6';
      btn.style.cursor = e.target.checked ? 'pointer' : 'not-allowed';
    }
  });
  openTModal();
}

async function tCheckFinalizeConfirmHub(id) {
  const chk = document.getElementById('t-complete-confirm-chk');
  if (!chk?.checked) return;
  await confirmCompleteTournament(id);
}

async function confirmCompleteTournament(id) {
  await tApi(`tournaments?id=eq.${id}`, 'PATCH', { status: 'completed' });
  closeTModal();
  tToast('Tournament completed! 🏆');
  openTournament(id);
}

// ─── FORFEIT ─────────────────────────────────────────────────
function openForfeitModal(type, matchId, teamAId, teamBId, catId, teamAName, teamBName) {
  document.getElementById('t-modal-title').textContent = 'Record Forfeit';
  document.getElementById('t-modal-body').innerHTML = `
    <div style="padding:8px 0 16px;">
      <p style="font-size:13px;color:#0d1f4a;line-height:1.6;margin-bottom:16px;">
        A forfeit means the team <strong>withdraws from the entire tournament</strong>.
        All their remaining matches will be scored automatically.
        Select which team is forfeiting:
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button type="button" class="t-btn t-btn-danger" style="width:100%;"
          onclick="processForfeit('${type}', ${matchId}, ${teamAId}, ${teamBId}, ${catId}, ${teamAId})">
          ${teamAName} forfeits
        </button>
        <button type="button" class="t-btn t-btn-danger" style="width:100%;"
          onclick="processForfeit('${type}', ${matchId}, ${teamAId}, ${teamBId}, ${catId}, ${teamBId})">
          ${teamBName} forfeits
        </button>
      </div>
      <div style="margin-top:14px;">
        <button type="button" class="t-btn t-btn-ghost" style="width:100%;" onclick="closeTModal()">Cancel</button>
      </div>
    </div>
  `;
}

async function processForfeit(type, matchId, teamAId, teamBId, catId, forfeitTeamId, courtNum) {
  // Get category to know the play-to score
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=*`);
  const rrFormat = cat.rr_format || 'play11_win1';
  const playTo = rrFormat.includes('15') ? 15 : rrFormat.includes('21') ? 21 : 11;
  const winnerId = forfeitTeamId === teamAId ? teamBId : teamAId;
  const scoreA = forfeitTeamId === teamAId ? 0 : playTo;
  const scoreB = forfeitTeamId === teamBId ? 0 : playTo;
  const court = courtNum && !isNaN(parseInt(courtNum)) ? parseInt(courtNum) : null;

  try {
    // Save this match as forfeited — include court if provided
    if (type === 'rr') {
      await tApi(`tournament_rr_matches?id=eq.${matchId}`, 'PATCH', {
        score_a: scoreA, score_b: scoreB,
        winner_id: winnerId, status: 'completed',
        forfeit_team_id: forfeitTeamId,
        ...(court ? { court } : {}),
      });
    } else {
      await tApi(`tournament_bracket_matches?id=eq.${matchId}`, 'PATCH', {
        score_a: scoreA, score_b: scoreB,
        winner_id: winnerId, status: 'completed',
        forfeit_team_id: forfeitTeamId,
        ...(court ? { court } : {}),
      });
      await advanceBracket(matchId, winnerId, forfeitTeamId, catId);
    }

    // Auto-score ALL remaining pending matches for the forfeiting team
    const pendingRR = await tApi(
      `tournament_rr_matches?category_id=eq.${catId}&status=eq.pending&select=*`
    );
    const rrToForfeit = pendingRR.filter(
      m => m.team_a_id === forfeitTeamId || m.team_b_id === forfeitTeamId
    );
    await Promise.all(rrToForfeit.map((m) => {
      const win = m.team_a_id === forfeitTeamId ? m.team_b_id : m.team_a_id;
      const sA = m.team_a_id === forfeitTeamId ? 0 : playTo;
      const sB = m.team_b_id === forfeitTeamId ? 0 : playTo;
      return tApi(`tournament_rr_matches?id=eq.${m.id}`, 'PATCH', {
        score_a: sA, score_b: sB, winner_id: win,
        status: 'completed', forfeit_team_id: forfeitTeamId
      });
    }));

    const pendingBracket = await tApi(
      `tournament_bracket_matches?category_id=eq.${catId}&status=eq.pending&select=*`
    );
    const bracketToForfeit = pendingBracket.filter(
      m => m.team_a_id === forfeitTeamId || m.team_b_id === forfeitTeamId
    );
    // Each bracket forfeit must propagate via advanceBracket; PATCH them in parallel,
    // then advanceBracket sequentially to keep deterministic chained updates.
    await Promise.all(bracketToForfeit.map((m) => {
      const win = m.team_a_id === forfeitTeamId ? m.team_b_id : m.team_a_id;
      const sA = m.team_a_id === forfeitTeamId ? 0 : playTo;
      const sB = m.team_b_id === forfeitTeamId ? 0 : playTo;
      return tApi(`tournament_bracket_matches?id=eq.${m.id}`, 'PATCH', {
        score_a: sA, score_b: sB, winner_id: win,
        status: 'completed', forfeit_team_id: forfeitTeamId
      });
    }));
    for (const m of bracketToForfeit) {
      const win = m.team_a_id === forfeitTeamId ? m.team_b_id : m.team_a_id;
      await advanceBracket(m.id, win, forfeitTeamId, catId);
    }

    closeTModal();
    tToast('Forfeit recorded. All remaining matches updated.');
    tCurrentCategoryId = catId;
    const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
    const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
    renderTournamentDetail(t, categories);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

function onForfeitCheck(checked, other) {
  const otherCb = document.getElementById('t-forfeit-' + other);
  if (otherCb && otherCb.checked) otherCb.checked = false;
}


function restoreScoreModal(title, body) {
  document.getElementById('t-modal-title').textContent = title;
  document.getElementById('t-modal-body').innerHTML = body;
}

// ─── MODAL HELPERS ──────────────────────────────────────────
function openTModal() { document.getElementById('t-modal').classList.add('t-modal-open'); }
function closeTModal() {
  document.getElementById('t-modal').classList.remove('t-modal-open');
  // Hide the X button (only shown for complete modal)
  const xBtn = document.getElementById('t-modal-close-x');
  if (xBtn) xBtn.style.display = 'none';
}
function tSetModalSubtitle(text) {
  const el = document.getElementById('t-modal-subtitle');
  if (!el) return;
  if (text) { el.textContent = text; el.style.display = 'block'; }
  else { el.textContent = ''; el.style.display = 'none'; }
}
// (tToast is defined at the top of this file as a shim around the shared toast.)

// ─── SINGLES HELPERS ────────────────────────────────────────

function tFilterPlayers() {
  const q = document.getElementById('t-player-search')?.value.toLowerCase().trim() || '';
  document.querySelectorAll('.t-lp-row').forEach(row => {
    const name = row.dataset.name || '';
    row.style.display = name.includes(q) ? '' : 'none';
  });
}

function tToggleAllPlayers() {
  const allCb = document.getElementById('t-select-all-players');
  document.querySelectorAll('#t-player-list input[data-pid]:not(:disabled)').forEach(cb => {
    cb.checked = allCb.checked;
  });
  tUpdatePlayerCount();
}

function tUpdatePlayerCount() {
  const checked = document.querySelectorAll('#t-player-list input[data-pid]:checked').length;
  const countEl = document.getElementById('t-player-count');
  if (countEl) countEl.textContent = `${checked} selected`;
  // Update select-all state
  const total = document.querySelectorAll('#t-player-list input[data-pid]:not(:disabled)').length;
  const allCb = document.getElementById('t-select-all-players');
  if (allCb) allCb.checked = checked > 0 && checked === total;
}

async function saveMultiplePlayers(catId) {
  const checked = [...document.querySelectorAll('#t-player-list input[data-pid]:checked')];
  if (!checked.length) { tToast('Please select at least one player.', true); return; }
  const btn = document.querySelector('.t-modal .t-btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }
  try {
    // Build all rows, then send a single bulk POST
    const rows = checked.map(cb => {
      const pid = parseInt(cb.dataset.pid);
      const p = tAllPlayers.find(x => x.id === pid);
      if (!p) return null;
      return {
        category_id: catId,
        name: `${p.first_name} ${p.last_name}`,
        player1_id: pid,
        player2_id: null, player3_id: null, player4_id: null,
      };
    }).filter(Boolean);
    if (rows.length) {
      await tApi('tournament_teams', 'POST', rows);
    }
    tToast(`${rows.length} player${rows.length !== 1 ? 's' : ''} added!`);
    closeTModal();
    tCurrentCategoryId = catId;
    const [t, categories] = await Promise.all([
      tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`).then(r => r[0]),
      tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`),
    ]);
    renderTournamentDetail(t, categories);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

function isSingles(catName) {
  return catName && catName.toLowerCase().includes('singles');
}

function entityLabel(catName, cap = true) {
  // Returns 'Player'/'Team' or 'player'/'team' based on category
  const single = isSingles(catName);
  if (cap) return single ? 'Player' : 'Team';
  return single ? 'player' : 'team';
}

// Build game-by-game score entry rows for singles best-of-3 or best-of-5
function buildGameRows(bestOf, nameA, nameB, existingGames) {
  const games = existingGames || [];
  return Array.from({length: bestOf}, (_, i) => {
    const g = games[i] || {};
    return `
      <div class="t-game-row">
        <span class="t-game-label">Game ${i + 1}</span>
        <input class="t-game-score" type="number" min="0" max="30"
          id="t-game-a-${i}" value="${g.score_a ?? ''}" placeholder="0">
        <span class="t-game-sep">–</span>
        <input class="t-game-score" type="number" min="0" max="30"
          id="t-game-b-${i}" value="${g.score_b ?? ''}" placeholder="0">
      </div>`;
  }).join('');
}

function calcBestOfWinner(bestOf, teamAId, teamBId, gameScores) {
  // gameScores = [{score_a, score_b}, ...]
  let winsA = 0, winsB = 0;
  const needed = Math.ceil(bestOf / 2);
  gameScores.forEach(g => {
    if (g.score_a > g.score_b) winsA++;
    else if (g.score_b > g.score_a) winsB++;
  });
  if (winsA >= needed) return { winnerId: teamAId, winsA, winsB };
  if (winsB >= needed) return { winnerId: teamBId, winsA, winsB };
  return { winnerId: null, winsA, winsB };
}

/* ─── PRINT TOURNAMENT ROSTER ─────────────────────────── */
async function printTournamentRoster(btn) {
  const printBtnOrigHTML = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>'; }

  try {
    // Read all data from button attributes — safe, no JSON injection risk
    const tournamentName = btn.dataset.tname || '';
    const tournamentDate = btn.dataset.tdate || '';
    const catIds   = (btn.dataset.catids || '').split(',').filter(Boolean).map(Number);
    const catNames = (btn.dataset.catnames || '').split('||');
    const categories = catIds.map((id, i) => ({ id, name: catNames[i] || '' }));

    const { jsPDF } = window.jspdf;
    if (!jsPDF) throw new Error('jsPDF not loaded. Make sure the jsPDF script is included.');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

    const PW = 215.9, PH = 279.4, ML = 14, MR = 14, MT = 14;
    const CW = PW - ML - MR;
    const BLUE   = [23, 76, 204];
    const LIME   = [198, 242, 33];
    const DARK   = [13, 31, 74];
    const MUTED  = [107, 122, 153];
    const BORDER = [214, 223, 245];
    const WHITE  = [255, 255, 255];
    const GOLD   = [255, 215, 0];
    const SILVER = [192, 192, 192];
    const BRONZE = [205, 127, 50];
    const TEAL   = [36, 188, 150];

    const dateLabel = tournamentDate
      ? new Date(tournamentDate + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })
      : '';

    // Helper: draw page header for a category
    const drawHeader = (catName) => {
      doc.setFillColor(...BLUE);
      doc.rect(0, 0, PW, 22, 'F');
      doc.setFillColor(...LIME);
      doc.rect(0, 22, PW, 1.2, 'F');
      // Tournament name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...WHITE);
      doc.text(tournamentName, ML, 9, { maxWidth: CW * 0.65 });
      // Date top right
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(dateLabel, PW - MR, 9, { align: 'right' });
      // Category name bottom left in lime
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...LIME);
      doc.text(catName, ML, 18);
    };

    // Helper: draw page footer
    const drawFooter = () => {
      doc.setFillColor(...BLUE);
      doc.rect(0, PH - 10, PW, 10, 'F');
      doc.setFillColor(...LIME);
      doc.rect(0, PH - 10, PW, 0.8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...WHITE);
      doc.text('Ferocia Sports Center  —  ferociasports.com', PW / 2, PH - 4, { align: 'center' });
    };

    const PAGE_BOTTOM = PH - 14;
    const LEFT_W  = CW * 0.42;   // teams list column
    const RIGHT_X = ML + LEFT_W + 6;
    const RIGHT_W = PW - MR - RIGHT_X;

    for (let ci = 0; ci < categories.length; ci++) {
      const cat = categories[ci];
      if (ci > 0) doc.addPage();

      drawHeader(cat.name);
      let y = 30;

      // Fetch data for this category
      const [teams, rrMatches, bracketMatches] = await Promise.all([
        tApi(`tournament_teams?category_id=eq.${cat.id}&select=*&order=id`),
        tApi(`tournament_rr_matches?category_id=eq.${cat.id}&select=*&order=round,court`),
        tApi(`tournament_bracket_matches?category_id=eq.${cat.id}&select=*&order=id`),
      ]);

      // Build team map for name lookup
      const teamMap = {};
      teams.forEach(t => { teamMap[t.id] = t; });

      // ── Helper: draw teams list in left column ─────────────────────────
      const ROW_H = 8.5;
      const drawTeamsList = (startY) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text('TEAMS', ML, startY);
        let ty = startY + 5;
        teams.forEach((team, i) => {
          const seed = i + 1;
          const seedColor = seed === 1 ? GOLD : seed === 2 ? SILVER : seed === 3 ? BRONZE : BLUE;
          const isTop3 = seed <= 3;
          if (i % 2 === 0) {
            doc.setFillColor(245, 247, 252);
            doc.rect(ML, ty, LEFT_W, ROW_H, 'F');
          }
          const cx = ML + 5, cy = ty + ROW_H / 2;
          doc.setFillColor(...seedColor);
          doc.circle(cx, cy, 3.2, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(...(isTop3 && seed !== 2 ? WHITE : seed === 2 ? [85,85,85] : WHITE));
          doc.text(String(seed), cx, cy + 0.8, { align: 'center' });
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...DARK);
          doc.text(team.name, ML + 11, ty + 4, { maxWidth: LEFT_W - 14 });
          const pIds = [team.player1_id, team.player2_id, team.player3_id, team.player4_id].filter(Boolean);
          const pNames = pIds.map(id => {
            const p = tAllPlayers.find(x => x.id === id);
            return p ? `${p.first_name} ${p.last_name}` : null;
          }).filter(Boolean).join(' & ');
          if (pNames) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...MUTED);
            doc.text(pNames, ML + 11, ty + 7.2, { maxWidth: LEFT_W - 14 });
          }
          ty += ROW_H;
        });
      };

      // ── LEFT COLUMN: Teams list (page 1) ─────────────────────────────
      drawTeamsList(y);

      // ── RIGHT COLUMN: Schedule ────────────────────────────────────────
      let ry = 30;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text('SCHEDULE', RIGHT_X, ry);
      ry += 5;

      const MATCH_H = 9;

      // Add a new page — repeat teams list on left, schedule continues on right
      // so both columns always match page 1 layout exactly.
      const addSchedulePage = () => {
        drawFooter();
        doc.addPage();
        drawHeader(cat.name);
        ry = 30;
        drawTeamsList(ry);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text('SCHEDULE (continued)', RIGHT_X, ry);
        ry += 5;
      };

      // Always use right column — same position on every page
      const schedX = () => RIGHT_X;
      const schedW = () => RIGHT_W;

      // RR Matches grouped by round
      if (rrMatches.length) {
        const rounds = [...new Set(rrMatches.map(m => m.round))].sort((a, b) => a - b);
        rounds.forEach(round => {
          if (ry + 6 + MATCH_H * 2 > PAGE_BOTTOM) addSchedulePage(); // keep header with at least 2 match rows

          doc.setFillColor(...BLUE);
          doc.rect(schedX(), ry, schedW(), 6, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...WHITE);
          doc.text(`Round ${round}`, schedX() + 3, ry + 4.2);
          ry += 7;

          rrMatches.filter(m => m.round === round).forEach(m => {
            if (ry + MATCH_H > PAGE_BOTTOM) addSchedulePage();

            const tA = teamMap[m.team_a_id];
            const tB = teamMap[m.team_b_id];
            const nameA = tA ? tA.name : 'TBD';
            const nameB = tB ? tB.name : 'TBD';
            const matchLabel = `${nameA}  vs  ${nameB}`;
            const courtLabel = m.court ? `C${m.court}` : '';

            if (m.round % 2 === 0) {
              doc.setFillColor(245, 247, 252);
              doc.rect(schedX(), ry, schedW(), MATCH_H, 'F');
            }

            if (courtLabel) {
              doc.setFillColor(...TEAL);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(6);
              doc.setTextColor(...WHITE);
              doc.roundedRect(schedX() + 1, ry + 1.5, 9, 5.5, 1, 1, 'F');
              doc.text(courtLabel, schedX() + 5.5, ry + 5.2, { align: 'center' });
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...DARK);
            doc.text(matchLabel, schedX() + 13, ry + MATCH_H / 2 + 1.5, { maxWidth: schedW() - 30 });

            const bx = schedX() + schedW() - 16;
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.4);
            doc.setFillColor(...WHITE);
            doc.rect(bx, ry + 1.5, 6.5, MATCH_H - 3, 'FD');
            doc.rect(bx + 7.5, ry + 1.5, 6.5, MATCH_H - 3, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            doc.text('—', bx + 7, ry + MATCH_H / 2 + 1, { align: 'center' });

            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.2);
            doc.line(schedX(), ry + MATCH_H, schedX() + schedW(), ry + MATCH_H);
            ry += MATCH_H;
          });
        });
      }

      // Bracket Matches grouped by round name
      if (bracketMatches.length) {
        const roundNames = [...new Set(bracketMatches.map(m => m.round_name))];
        roundNames.forEach(roundName => {
          if (ry + 6 + MATCH_H * 2 > PAGE_BOTTOM) addSchedulePage(); // keep header with at least 2 match rows

          doc.setFillColor(...DARK);
          doc.rect(schedX(), ry, schedW(), 6, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...WHITE);
          doc.text(roundName, schedX() + 3, ry + 4.2);
          ry += 7;

          bracketMatches.filter(m => m.round_name === roundName).forEach((m, mi) => {
            if (ry + MATCH_H > PAGE_BOTTOM) addSchedulePage();

            const tA = m.team_a_id ? teamMap[m.team_a_id] : null;
            const tB = m.team_b_id ? teamMap[m.team_b_id] : null;
            const nameA = m.status === 'bye' && !tA ? 'BYE' : (tA ? tA.name : 'TBD');
            const nameB = m.status === 'bye' && !tB ? 'BYE' : (tB ? tB.name : 'TBD');
            const matchLabel = `${nameA}  vs  ${nameB}`;

            if (mi % 2 === 0) {
              doc.setFillColor(245, 247, 252);
              doc.rect(schedX(), ry, schedW(), MATCH_H, 'F');
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...DARK);
            doc.text(matchLabel, schedX() + 3, ry + MATCH_H / 2 + 1.5, { maxWidth: schedW() - 20 });

            const bx = schedX() + schedW() - 16;
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.4);
            doc.setFillColor(...WHITE);
            doc.rect(bx, ry + 1.5, 6.5, MATCH_H - 3, 'FD');
            doc.rect(bx + 7.5, ry + 1.5, 6.5, MATCH_H - 3, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6);
            doc.setTextColor(...MUTED);
            doc.text('—', bx + 7, ry + MATCH_H / 2 + 1, { align: 'center' });

            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.2);
            doc.line(schedX(), ry + MATCH_H, schedX() + schedW(), ry + MATCH_H);
            ry += MATCH_H;
          });
        });
      }

      if (!rrMatches.length && !bracketMatches.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text('No schedule generated yet.', schedX(), ry + 6);
      }

      drawFooter();
    }

    const safeName = tournamentName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
    doc.save(`${safeName}_Roster.pdf`);
    tToast(`Roster downloaded!`);
  } catch (err) {
    tToast(`Error generating PDF: ${err.message}`, true);
    console.error('[printTournamentRoster]', err);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = printBtnOrigHTML; }
  }
}