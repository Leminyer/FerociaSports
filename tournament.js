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
async function loadTournamentModule() {
  if (!tAllPlayers.length) {
    tAllPlayers = await tApi('players?select=*&order=first_name');
  }
  renderTournamentList();
}

// ─── TOURNAMENT LIST ────────────────────────────────────────
async function renderTournamentList() {
  const el = document.getElementById('t-content');
  el.innerHTML = `<div class="t-loading">Loading tournaments...</div>`;
  const tournaments = await tApi('tournaments?select=*&order=id.desc');
  el.innerHTML = `
    <div class="t-header-bar">
      <h2 class="t-section-title">Tournaments</h2>
      <button class="t-btn t-btn-primary" onclick="showCreateTournament()">+ New Tournament</button>
    </div>
    ${tournaments.length ? `
      <div class="t-card-grid">
        ${tournaments.map(t => `
          <div class="t-tournament-card" onclick="openTournament(${t.id})" style="position:relative;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div class="t-tournament-card-status t-status-${tEsc(t.status)}" style="margin:0;">${tEsc(t.status)}</div>
              ${t.status === 'draft' ? `<button type="button" class="t-btn t-btn-danger t-btn-sm" onclick="deleteTournament(${t.id})" data-tname="${tEsc(t.name)}" style="font-size:10px;padding:4px 10px;">Delete</button>` : ''}
            </div>
            <div class="t-tournament-card-name">${tEsc(t.name)}</div>
            <div class="t-tournament-card-date">${t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric',year:'numeric'}) : 'No date set'}</div>
          </div>
        `).join('')}
      </div>
    ` : `<div class="t-empty">No tournaments yet. Create your first one!</div>`}
  `;
}

// ─── CREATE TOURNAMENT ──────────────────────────────────────
function showCreateTournament() {
  const el = document.getElementById('t-content');
  el.innerHTML = `
    <div class="t-header-bar">
      <button class="t-btn t-btn-ghost" onclick="renderTournamentList()">← Back</button>
      <h2 class="t-section-title">New Tournament</h2>
    </div>
    <div class="t-card">
      <form id="t-create-form" onsubmit="createTournament(event)">
        <div class="t-form-group">
          <label class="t-label">Tournament name *</label>
          <input class="t-input" type="text" id="t-name" required placeholder="e.g. Spring Open 2026">
        </div>
        <div class="t-form-group">
          <label class="t-label">Date</label>
          <input class="t-input" type="date" id="t-date">
        </div>
        <div class="t-form-group">
          <label class="t-label">Categories *</label>
          <div style="font-size:11px;color:#6b7a99;font-weight:500;margin-bottom:10px;">
            Add one or more categories. Use custom names for specific groups (e.g. "Group A Mixed 3.5-4.25").
          </div>
          <div id="t-categories-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>
          <button type="button" class="t-btn t-btn-ghost t-btn-sm" onclick="addCategoryField()">+ Add Category</button>
        </div>
        <div class="t-form-actions">
          <button type="button" class="t-btn t-btn-ghost" onclick="renderTournamentList()">Cancel</button>
          <button type="submit" class="t-btn t-btn-primary">Create Tournament</button>
        </div>
      </form>
    </div>
  `;
  // Add two default category fields
  addCategoryField();
}

function addCategoryField() {
  const list = document.getElementById('t-categories-list');
  const idx = list.children.length;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;align-items:center;';
  div.innerHTML = `
    <input class="t-input t-category-input" type="text" placeholder="e.g. Group A Mixed Doubles 3.5-4.25" style="flex:1;">
    <button type="button" class="t-btn t-btn-danger t-btn-sm" onclick="this.parentElement.remove()" style="flex-shrink:0;">×</button>
  `;
  list.appendChild(div);
  div.querySelector('input').focus();
}

async function createTournament(e) {
  e.preventDefault();
  const name = document.getElementById('t-name').value.trim();
  const date = document.getElementById('t-date').value || null;
  const categories = [...document.querySelectorAll('.t-category-input')]
    .map(i => i.value.trim()).filter(Boolean);
  if (!name) { tToast('Please enter a tournament name.', true); return; }
  if (!categories.length) { tToast('Please add at least one category.', true); return; }
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
    openTournament(t.id);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

// ─── DELETE TOURNAMENT ──────────────────────────────────────
async function deleteTournament(id) {
  const [t] = await tApi(`tournaments?id=eq.${id}&select=name`);
  const name = t?.name || 'this tournament';
  document.getElementById('t-modal-title').textContent = 'Delete Tournament';
  document.getElementById('t-modal-body').innerHTML =
    '<div style="padding:8px 0 24px;">'
    + '<p style="font-size:14px;color:#0d1f4a;line-height:1.6;">Are you sure you want to delete tournament <strong>'
    + name + '</strong>? All categories, teams and matches will be permanently removed.</p></div>'
    + '<div class="t-form-actions">'
    + '<button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>'
    + '<button type="button" class="t-btn t-btn-danger" onclick="confirmDeleteTournament(' + id + ')">Delete</button>'
    + '</div>';
  openTModal();
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
  const date = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric',year:'numeric'}) : 'No date set';
  el.innerHTML = `
    <div class="t-header-bar">
      <button class="t-btn t-btn-ghost" onclick="renderTournamentList()">← Tournaments</button>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="t-status-badge t-status-${tEsc(t.status)}">${tEsc(t.status)}</span>
        ${t.status === 'draft' ? `<button class="t-btn t-btn-success" onclick="startTournament(${t.id})">▶ Start Tournament</button>` : ''}
        ${t.status === 'active' ? `<button class="t-btn t-btn-danger" onclick="completeTournament(${t.id})">Complete</button>` : ''}
        <button class="t-btn t-btn-primary" title="Notify all players with the results link"
          onclick="window.app.openTournamentNotifyModal(${t.id})"
          style="background:var(--teal);border-color:var(--teal);">
          ✉ Notify Players
        </button>
        <button class="t-btn t-btn-primary" id="t-print-roster-btn"
          onclick="printTournamentRoster(this)"
          data-tid="${t.id}"
          data-tname="${tEsc(t.name)}"
          data-tdate="${tEsc(t.date || '')}"
          data-catids="${categories.map(c => c.id).join(',')}"
          data-catnames="${categories.map(c => tEsc(c.name)).join('||')}"
          title="Print roster for all categories">
          📄 Print Roster
        </button>
      </div>
    </div>
    <div class="t-tournament-hero" style="position:relative;">
      <div class="t-tournament-hero-name">${tEsc(t.name)}</div>
      <div class="t-tournament-hero-date">📅 ${date}</div>
      ${t.status !== 'completed' ? `<button type="button" class="t-btn t-btn-sm" onclick="openEditTournament(${t.id})" style="position:absolute;top:0;right:0;background:rgba(255,255,255,0.15);color:#fff;border:1.5px solid rgba(255,255,255,0.3);">✏️ Edit</button>` : ''}
    </div>
    <div class="t-category-tabs">
      ${categories.map(cat => `
        <button class="t-category-tab ${cat.id === tCurrentCategoryId ? 'active' : ''}"
          onclick="switchCategory(${cat.id}, ${t.id})">
          ${tEsc(cat.name)}
          <span class="t-cat-status-dot t-dot-${tEsc(cat.status)}"></span>
        </button>
      `).join('')}
    </div>
    <div id="t-category-content">Loading category...</div>
  `;
  if (tCurrentCategoryId) loadCategory(tCurrentCategoryId, t);
}
async function switchCategory(catId, tId) {
  tCurrentCategoryId = catId;
  document.querySelectorAll('.t-category-tab').forEach(b => b.classList.remove('active'));
  event.target.closest('.t-category-tab').classList.add('active');
  document.getElementById('t-category-content').innerHTML = '<div class="t-loading">Loading...</div>';
  const [t] = await tApi(`tournaments?id=eq.${tId}&select=*`);
  loadCategory(catId, t);
}

async function loadCategory(catId, t) {
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=*`);
  const teams = await tApi(`tournament_teams?category_id=eq.${catId}&select=*&order=id`);
  const rrMatches = await tApi(`tournament_rr_matches?category_id=eq.${catId}&select=*&order=round,court`);
  const bracketMatches = await tApi(`tournament_bracket_matches?category_id=eq.${catId}&select=*&order=id`);
  const groups = await tApi(`tournament_groups?category_id=eq.${catId}&select=*&order=position`);
  renderCategory(cat, teams, rrMatches, bracketMatches, t, groups);
}

function renderCategory(cat, teams, rrMatches, bracketMatches, tournament, groups = []) {
  const el = document.getElementById('t-category-content');
  const useGroups = groups.length > 0;

  // Single-RR mode: standings against all teams. Groups mode: per-group standings.
  // Both modes need a unified "all standings sorted" for places where we don't care.
  const standings = useGroups
    ? null
    : tCalcStandings(teams, rrMatches);

  const rrComplete = rrMatches.length > 0 && rrMatches.filter(m => m.status === 'pending').length === 0;
  const tMap = {}; teams.forEach(t => tMap[t.id] = t);

  // Build per-group structures only if we have groups
  let groupViews = [];
  if (useGroups) {
    groupViews = groups.map(g => {
      const groupTeams = teams.filter(t => t.group_id === g.id);
      const groupMatches = rrMatches.filter(m => m.group_id === g.id);
      return {
        group: g,
        teams: groupTeams,
        matches: groupMatches,
        standings: tCalcStandings(groupTeams, groupMatches),
      };
    });
  }

  let html = '';

  // PHASE 1: TEAMS / PLAYERS
  const singlesMode = isSingles(cat.name);
  const entityCap = singlesMode ? 'Player' : 'Team';
  const entityLow = singlesMode ? 'player' : 'team';
  html += `
    <div class="t-phase-card">
      <div class="t-phase-header">
        <div class="t-phase-title">
          <span class="t-phase-num">1</span> ${singlesMode ? 'Players' : 'Teams'}
          <span class="t-team-count">${teams.length} ${teams.length !== 1 ? (singlesMode ? 'players' : 'teams') : entityLow}</span>
        </div>
        ${tournament.status === 'draft' ? `<button class="t-btn t-btn-sm t-btn-primary" onclick="showAddTeam(${cat.id})">+ Add ${entityCap}</button>` : ''}
      </div>
      ${teams.length ? `
        <div class="t-teams-grid">
          ${teams.map((team, i) => {
            const players = [team.player1_id, team.player2_id, team.player3_id, team.player4_id]
              .filter(Boolean).map(id => {
                const p = tAllPlayers.find(x => x.id === id);
                return p ? `${p.first_name} ${p.last_name}` : '?';
              });
            return `
              <div class="t-team-chip">
                <div class="t-team-seed">${i + 1}</div>
                <div class="t-team-info">
                  <div class="t-team-name">${tEsc(team.name)}</div>
                  ${!singlesMode ? `<div class="t-team-players">${players.join(' & ')}</div>` : ''}
                </div>
                ${tournament.status !== 'completed' && !singlesMode ? `
                  <button class="t-btn-icon" onclick="editTeam(${team.id}, ${cat.id})" style="color:#174CCC;font-size:14px;background:none;border:none;cursor:pointer;" title="Edit">✏️</button>
                ` : ''}
                ${tournament.status === 'draft' ? `
                  <button class="t-btn-icon t-btn-danger-icon" onclick="deleteTeam(${team.id}, ${cat.id})" data-tname="${tEsc(team.name)}">×</button>
                ` : ''}
              </div>`;
          }).join('')}
        </div>
      ` : `<div class="t-empty-sm">No ${singlesMode ? 'players' : 'teams'} yet. Add ${singlesMode ? 'players' : 'teams'} to get started.</div>`}
    </div>`;

  // PHASE 2: ROUND ROBIN
  const rrTotal = rrMatches.filter(m => m.status !== 'bye').length;
  const rrDone = rrMatches.filter(m => m.status === 'completed').length;
  const rrPct = rrTotal > 0 ? Math.round((rrDone / rrTotal) * 100) : 0;

  html += `
    <div class="t-phase-card ${teams.length < 3 ? 't-phase-disabled' : ''}">
      <div class="t-phase-header">
        <div class="t-phase-title">
          <span class="t-phase-num">2</span> ${useGroups ? 'Group Stage' : 'Round Robin'}
          ${rrMatches.length > 0 ? `<span class="t-progress-label">${rrDone}/${rrTotal} matches</span>` : ''}
          ${useGroups ? `<span class="t-progress-label">${groups.length} groups</span>` : ''}
        </div>
        ${teams.length >= 3 && rrMatches.length === 0 && tournament.status !== 'draft' ?
          `<button class="t-btn t-btn-sm t-btn-primary" onclick="showRRFormatModal(${cat.id})">Generate Schedule</button>` : ''}
        ${teams.length >= 3 && rrMatches.length === 0 && tournament.status === 'draft' ?
          `<span class="t-hint">Start tournament first</span>` : ''}
      </div>
      ${rrMatches.length > 0 ? `
        ${rrTotal > 0 ? `<div class="t-progress-bar"><div class="t-progress-fill" style="width:${rrPct}%"></div></div>` : ''}
        ${useGroups
          ? renderGroupedRR(groupViews, tMap, tournament, cat)
          : `<div class="t-rr-grid">${renderRRRounds(rrMatches, tMap, tournament)}</div>
             ${rrDone > 0 ? tRenderStandings(standings, cat.name) : ''}`
        }
      ` : teams.length < 3 ? `<div class="t-empty-sm">Add at least 3 teams first.</div>` :
        `<div class="t-empty-sm">Generate the schedule to start round robin play.</div>`}
    </div>`;

  // PHASE 3: FINALS
  if (rrComplete || bracketMatches.length > 0) {
    // In groups mode the per-group advancement is already locked from schedule generation.
    // Compute the number of teams advancing and a seeded preview.
    let seededPreview = null;        // teams in seed order, with _groupRank etc.
    let lockedFinalsSize = null;     // the locked total when groups
    if (useGroups && cat.finals_per_group) {
      seededPreview = tBuildSeededAdvancement(
        groupViews.map(gv => gv.standings),
        cat.finals_per_group
      );
      lockedFinalsSize = seededPreview.length;
    }

    // Bracket-size dropdown options (single-RR only). Filter to only reasonable sizes.
    const ssOpts = !useGroups
      ? `<option value="2">Top 2</option>
         <option value="3">Top 3</option>
         <option value="4" selected>Top 4</option>
         <option value="6">Top 6</option>
         <option value="8">Top 8</option>`
      : '';

    html += `
      <div class="t-phase-card">
        <div class="t-phase-header">
          <div class="t-phase-title"><span class="t-phase-num">3</span> Finals</div>
          ${bracketMatches.length === 0 ? `
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              ${useGroups
                ? `<span class="t-hint" style="background:#e8f0ff;color:#174CCC;padding:4px 10px;border-radius:99px;font-weight:700;">Top ${cat.finals_per_group} per group → ${lockedFinalsSize} teams</span>
                   <input type="hidden" id="finals-size-${cat.id}" value="${lockedFinalsSize}">`
                : `<select id="finals-size-${cat.id}" class="t-select-sm">${ssOpts}</select>`
              }
              <select id="finals-elim-${cat.id}" class="t-select-sm">
                <option value="single">Single Elim</option>
              </select>
              <select id="finals-score-format-${cat.id}" class="t-select-sm">
                <option value="play11_win2">11, win by 2</option>
                <option value="play11_win1">11, win by 1</option>
                <option value="play15_win2">15, win by 2</option>
                <option value="play15_win1">15, win by 1</option>
                <option value="play21_win2">21, win by 2</option>
                <option value="play21_win1">21, win by 1</option>
                <option value="best_of_3">Best of 3 (first to win 2)</option>
                <option value="best_of_5">Best of 5 (first to win 3)</option>
              </select>
              <button class="t-btn t-btn-sm t-btn-primary" onclick="generateBracket(${cat.id}, ${cat.tournament_id})">Generate Bracket</button>
            </div>` : ''}
        </div>
        ${bracketMatches.length > 0 ? renderBracket(bracketMatches, tMap, tournament) : `
          <div class="t-standings-preview">
            <div class="t-empty-sm">${useGroups ? 'These teams will advance to the bracket:' : 'Choose how many teams advance and generate the bracket.'}</div>
            <div style="margin-top:12px;">
              ${useGroups && seededPreview
                ? seededPreview.map((s, i) => `
                    <div class="t-standing-preview-row">
                      <span class="t-seed-badge">${i + 1}</span>
                      <span class="t-standing-name">${tEsc(s.name)}</span>
                      <span class="t-group-tag">Group ${tEsc(groups[s._groupIndex]?.name || '?')} · #${s._groupRank}</span>
                      <span class="t-standing-record">${s.w}W ${s.l}L ${s.pts_for - s.pts_against > 0 ? '+' : ''}${s.pts_for - s.pts_against}</span>
                    </div>`).join('')
                : (standings || []).slice(0, 8).map((s, i) => `
                    <div class="t-standing-preview-row">
                      <span class="t-seed-badge">${i + 1}</span>
                      <span class="t-standing-name">${tEsc(s.name)}</span>
                      <span class="t-standing-record">${s.w}W ${s.l}L ${s.pts_for - s.pts_against > 0 ? '+' : ''}${s.pts_for - s.pts_against}</span>
                    </div>`).join('')
              }
            </div>
          </div>`}
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
                  <span class="t-match-team ${winA ? 't-winner' : ''}">${tEsc(teamA?.name || '?')}</span>
                  <span class="t-match-vs">vs</span>
                  <span class="t-match-team ${winB ? 't-winner' : ''}">${tEsc(teamB?.name || '?')}</span>
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
  const singlesMode = isSingles(catName);
  return `
    <div class="t-standings-table">
      <div class="t-standings-title">Standings</div>
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

  if (singles) {
    // Multi-select player picker for singles — same UX as ladder modal
    const existingTeams = await tApi(`tournament_teams?category_id=eq.${catId}&select=player1_id`);
    const enrolledIds = existingTeams.map(t => t.player1_id).filter(Boolean);
    const activePlayers = tAllPlayers.filter(p => p.status !== 'inactive');

    // Build player rows as a string (avoid nested template literal issues)
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

  // Non-singles: original team form
  const playersPerTeam = catName.toLowerCase().includes('team_challenge') ? 4 : 2;
  const playerOpts = tAllPlayers.filter(p => p.status !== 'inactive')
    .map(p => `<option value="${p.id}">${tEsc(p.first_name)} ${tEsc(p.last_name)}</option>`).join('');
  const playerFields = Array.from({length: playersPerTeam}, (_, i) => `
    <div class="t-form-group">
      <label class="t-label">Player ${i + 1}</label>
      <select class="t-input t-player-select" id="t-player-${i+1}">
        <option value="">-- Select player --</option>${playerOpts}
      </select>
    </div>`).join('');
  document.getElementById('t-modal-title').textContent = 'Add Team';
  document.getElementById('t-modal-body').innerHTML = `
    <form id="t-add-team-form" onsubmit="saveTeam(event, ${catId})">
      <div class="t-form-group">
        <label class="t-label">Team name *</label>
        <input class="t-input" type="text" id="t-team-name" required placeholder="e.g. Team Thunder">
      </div>
      ${playerFields}
      <div class="t-form-actions">
        <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
        <button type="submit" class="t-btn t-btn-primary">Add Team</button>
      </div>
    </form>`;
  openTModal();
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
  const [team] = await tApi(`tournament_teams?id=eq.${teamId}&select=*`);
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=*`);
  if (!team || !cat) return;
  const singles = isSingles(cat.name);
  const playersPerTeam = cat.name.toLowerCase().includes('team_challenge') ? 4 : singles ? 1 : 2;
  const playerOpts = tAllPlayers.filter(p => p.status !== 'inactive')
    .map(p => `<option value="${p.id}">${tEsc(p.first_name)} ${tEsc(p.last_name)}</option>`).join('');
  const playerIds = [team.player1_id, team.player2_id, team.player3_id, team.player4_id];
  const playerFields = Array.from({length: playersPerTeam}, (_, i) => `
    <div class="t-form-group">
      <label class="t-label">Player ${playersPerTeam > 1 ? i + 1 : ''}</label>
      <select class="t-input t-player-select" id="t-edit-player-${i+1}">
        <option value="">-- Select player --</option>${playerOpts}
      </select>
    </div>`).join('');
  document.getElementById('t-modal-title').textContent = singles ? 'Edit Player' : 'Edit Team';
  document.getElementById('t-modal-body').innerHTML = `
    <form id="t-edit-team-form" onsubmit="saveEditTeam(event, ${teamId}, ${catId})">
      ${!singles ? `
      <div class="t-form-group">
        <label class="t-label">Team name *</label>
        <input class="t-input" type="text" id="t-edit-team-name" required value="${tEsc(team.name)}">
      </div>` : `<input type="hidden" id="t-edit-team-name" value="">`}
      ${playerFields}
      <div class="t-form-actions">
        <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
        <button type="submit" class="t-btn t-btn-primary">Save Changes</button>
      </div>
    </form>`;
  openTModal();
  playerIds.forEach((id, i) => {
    const sel = document.getElementById(`t-edit-player-${i+1}`);
    if (sel && id) sel.value = id;
  });
}

async function saveEditTeam(e, teamId, catId) {
  e.preventDefault();
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=name`);
  const singles = isSingles(cat.name);
  const playerSelects = document.querySelectorAll('.t-player-select');
  const playerIds = [...playerSelects].map(s => parseInt(s.value) || null);
  let name = document.getElementById('t-edit-team-name').value.trim();
  if (singles) {
    const p1 = tAllPlayers.find(x => x.id === playerIds[0]);
    if (!p1) { tToast('Please select a player.', true); return; }
    name = `${p1.first_name} ${p1.last_name}`;
  } else {
    if (!name) { tToast('Please enter a team name.', true); return; }
  }
  try {
    await tApi(`tournament_teams?id=eq.${teamId}`, 'PATCH', {
      name,
      player1_id: playerIds[0] || null,
      player2_id: playerIds[1] || null,
      player3_id: playerIds[2] || null,
      player4_id: playerIds[3] || null,
    });
    tToast(`${singles ? 'Player' : 'Team'} updated!`);
    closeTModal();
    tCurrentCategoryId = catId;
    const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
    const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
    renderTournamentDetail(t, categories);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

async function deleteTeam(teamId, catId) {
  const [team] = await tApi(`tournament_teams?id=eq.${teamId}&select=name`);
  const teamName = team?.name || 'this player/team';
  document.getElementById('t-modal-title').textContent = 'Remove Team';
  document.getElementById('t-modal-body').innerHTML =
    '<div style="padding:8px 0 24px;">'
    + '<p style="font-size:14px;color:#0d1f4a;line-height:1.6;">Are you sure you want to remove <strong>'
    + teamName + '</strong> from this category? This cannot be undone.</p></div>'
    + '<div class="t-form-actions">'
    + '<button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>'
    + '<button type="button" class="t-btn t-btn-danger" onclick="confirmDeleteTeam(' + teamId + ',' + catId + ')">Remove</button>'
    + '</div>';
  openTModal();
}

async function confirmDeleteTeam(teamId, catId) {
  try {
    await tApi(`tournament_teams?id=eq.${teamId}`, 'DELETE');
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
  // Look up team count for this category to decide whether to show group config.
  const teams = await tApi(`tournament_teams?category_id=eq.${catId}&select=id`);
  const numTeams = teams.length;
  const useGroups = numTeams > GROUP_TRIGGER_THRESHOLD;

  let groupSection = '';
  if (useGroups) {
    const suggestions = tSuggestGroupSizes(numTeams);
    if (!suggestions.length) {
      // No valid split possible (shouldn't happen unless team count is wild).
      tToast(`Cannot split ${numTeams} teams into valid groups (each group must be ${GROUP_MIN_SIZE}-${GROUP_MAX_SIZE} teams).`, true);
      return;
    }
    // Default to the suggestion closest to 4 per group (a sensible mid-range pick).
    const defaultIdx = suggestions.reduce((bestIdx, s, i, arr) =>
      Math.abs(s.size - 4) < Math.abs(arr[bestIdx].size - 4) ? i : bestIdx, 0);

    groupSection = `
      <div class="t-info-banner" style="background:#e8f0ff;border:1px solid #174CCC;border-radius:6px;padding:10px 12px;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:#174CCC;margin-bottom:2px;">${numTeams} teams — group stage required</div>
        <div style="font-size:11px;color:#6b7a99;">Teams will be randomly split into groups for round-robin play. Top finishers from each group advance to a single-elimination bracket.</div>
      </div>
      <div class="t-form-group">
        <label class="t-label">Teams per group (target)</label>
        <select class="t-input" id="t-group-size">
          ${suggestions.map((s, i) => `
            <option value="${s.size}" ${i === defaultIdx ? 'selected' : ''}>
              ~${s.size} per group → ${s.groups} groups (${s.distribution.join(', ')})
            </option>`).join('')}
        </select>
      </div>
      <div class="t-form-group">
        <label class="t-label">Teams advancing per group</label>
        <select class="t-input" id="t-finals-per-group"></select>
        <div style="font-size:11px;color:#6b7a99;margin-top:4px;">Top N from each group go to the bracket.</div>
      </div>`;
  }

  document.getElementById('t-modal-title').textContent =
    useGroups ? 'Group Stage Setup' : 'Round Robin Format';
  document.getElementById('t-modal-body').innerHTML = `
    ${groupSection}
    <div class="t-form-group">
      <label class="t-label">Score format (round robin)</label>
      <select class="t-input" id="t-rr-format">${RR_FORMAT_OPTIONS}</select>
    </div>
    <p style="font-size:12px;color:#6b7a99;margin-bottom:20px;">
      ${useGroups
        ? 'This format applies to all matches inside each group.'
        : 'This format applies to all round robin matches in this category.'}
      Best of 3 / Best of 5 formats are available in the Finals section.
    </p>
    <div class="t-form-actions">
      <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
      <button type="button" class="t-btn t-btn-primary" onclick="generateRR(${catId})">
        Generate Schedule${useGroups ? ' & Groups' : ''}
      </button>
    </div>
  `;
  // Populate the "advancing per group" dropdown based on chosen group size.
  if (useGroups) {
    const refreshAdvancing = () => {
      const sizeEl = document.getElementById('t-group-size');
      const advEl = document.getElementById('t-finals-per-group');
      if (!sizeEl || !advEl) return;
      const chosenSize = parseInt(sizeEl.value, 10);
      const chosen = tSuggestGroupSizes(numTeams).find(s => s.size === chosenSize);
      const minGroupSize = chosen ? Math.min(...chosen.distribution) : chosenSize;
      // Can advance 1 to (minGroupSize - 1), with a sane cap of 5.
      const maxAdvance = Math.min(minGroupSize - 1, 5);
      let opts = '';
      for (let n = 1; n <= maxAdvance; n++) {
        // Default to 2 if available, otherwise 1
        const isDefault = n === Math.min(2, maxAdvance);
        opts += `<option value="${n}" ${isDefault ? 'selected' : ''}>Top ${n} per group (${n * chosen.groups} total to bracket)</option>`;
      }
      advEl.innerHTML = opts;
    };
    refreshAdvancing();
    document.getElementById('t-group-size').addEventListener('change', refreshAdvancing);
  }
  openTModal();
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

  document.getElementById('t-modal-title').textContent = isFinals ? `Finals — ${match.round_name}` : `Round ${match.round} — Court ${match.court}`;
  const bestOf = cat.best_of || 1;
  // Show game-by-game entry when best_of > 1 (works for singles AND finals best-of formats)
  const singlesMatch = bestOf > 1;
  const existingGames = match.games || [];
  document.getElementById('t-modal-body').innerHTML = `
    <div class="t-score-modal">
      <div class="t-score-rule">${isFinals ? '🏆 Finals: ' + (T_FORMATS[cat.finals_format_score] || 'Play to 11, win by 2') : '🏓 Round Robin: ' + (T_FORMATS[cat.rr_format] || 'Play to 11, win by 1')}${singlesMatch ? ' · Best of ' + bestOf : ''}</div>
      <div class="t-form-group" style="margin-bottom:16px;">
        <label class="t-label">Court number</label>
        <input class="t-input" type="number" min="1" id="t-court-num" value="${match.court || ''}" placeholder="e.g. 5" style="max-width:120px;">
      </div>
      ${singlesMatch ? `
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
      <div id="t-score-preview" class="t-score-preview" style="margin-top:12px;"></div>
      ` : `
      <div class="t-score-teams">
        <div class="t-score-team">
          <div class="t-score-team-name">${tEsc(teamA?.name || '?')}</div>
          <input class="t-score-input" type="number" min="0" max="25" id="t-score-a" value="${match.score_a ?? ''}" placeholder="0">
          <label class="t-forfeit-check-label">
            <input type="checkbox" id="t-forfeit-a" onchange="onForfeitCheck('a','b')"> Forfeit
          </label>
        </div>
        <div class="t-score-divider">VS</div>
        <div class="t-score-team">
          <div class="t-score-team-name">${tEsc(teamB?.name || '?')}</div>
          <input class="t-score-input" type="number" min="0" max="25" id="t-score-b" value="${match.score_b ?? ''}" placeholder="0">
          <label class="t-forfeit-check-label">
            <input type="checkbox" id="t-forfeit-b" onchange="onForfeitCheck('b','a')"> Forfeit
          </label>
        </div>
      </div>
      <div id="t-score-preview" class="t-score-preview"></div>
      `}
    </div>
    <div class="t-form-actions">
      <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
      <button type="button" class="t-btn t-btn-primary" onclick="saveMatch('${type}', ${matchId}, ${teamAId}, ${teamBId}, ${catId})">Save</button>
    </div>
  `;
    // Live score preview
  ['t-score-a', 't-score-b'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      const sa = parseInt(document.getElementById('t-score-a').value);
      const sb = parseInt(document.getElementById('t-score-b').value);
      const prev = document.getElementById('t-score-preview');
      if (!isNaN(sa) && !isNaN(sb)) {
        const winner = sa > sb ? teamA?.name : teamB?.name;
        prev.innerHTML = `<span class="t-preview-winner">🏆 Winner: <strong>${winner}</strong></span>`;
      } else { prev.innerHTML = ''; }
    });
  });
  openTModal();
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
    const teams = await tApi(`tournament_teams?category_id=eq.${catId}&select=id,name`);
    const tMap = {}; teams.forEach(t => tMap[t.id] = t);
    const forfeitTeamName = tMap[forfeitTeamId]?.name || 'This team';

    document.getElementById('t-modal-title').textContent = 'Confirm Forfeit';
    document.getElementById('t-modal-body').innerHTML = `
      <div style="padding:8px 0 20px;">
        <div style="background:#fde8d8;border-left:4px solid #F26024;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;color:#F26024;margin-bottom:4px;">⚠️ Forfeit — Full Withdrawal</div>
          <div style="font-size:13px;color:#0d1f4a;line-height:1.6;">
            <strong>${forfeitTeamName}</strong> will be marked as forfeited and withdrawn from this tournament.
            All their remaining matches will be automatically scored in favor of their opponents.
            This action cannot be undone.
          </div>
        </div>
        <p style="font-size:13px;color:#6b7a99;line-height:1.6;">
          Are you sure you want to proceed with the forfeit for <strong>${forfeitTeamName}</strong>?
        </p>
      </div>
      <div class="t-form-actions">
        <button type="button" class="t-btn t-btn-ghost" onclick="openScoreModal('${type}', ${matchId}, ${teamAId}, ${teamBId}, ${catId})">Go Back</button>
        <button type="button" class="t-btn t-btn-danger" onclick="processForfeit('${type}', ${matchId}, ${teamAId}, ${teamBId}, ${catId}, ${forfeitTeamId}, ${courtNum})">Confirm Forfeit</button>
      </div>
    `;
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
  document.getElementById('t-modal-title').textContent = 'Complete Tournament';
  document.getElementById('t-modal-body').innerHTML = `
    <div style="padding:8px 0 24px;">
      <p style="font-size:14px;color:#0d1f4a;line-height:1.6;">
        Mark this tournament as completed? No further edits will be possible.
      </p>
    </div>
    <div class="t-form-actions">
      <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
      <button type="button" class="t-btn t-btn-success" onclick="confirmCompleteTournament(${id})">Complete</button>
    </div>`;
  openTModal();
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

async function openEditTournament(id) {
  const [t] = await tApi(`tournaments?id=eq.${id}&select=*`);
  if (!t) return;
  document.getElementById('t-modal-title').textContent = 'Edit Tournament';
  document.getElementById('t-modal-body').innerHTML =
    '<form id="t-edit-tournament-form" onsubmit="saveEditTournament(event,' + id + ')">'
    + '<div class="t-form-group"><label class="t-label">Tournament name *</label>'
    + '<input class="t-input" type="text" id="t-edit-t-name" required value="' + (t.name||'').replace(/"/g,'&quot;') + '"></div>'
    + '<div class="t-form-group"><label class="t-label">Date</label>'
    + '<input class="t-input" type="date" id="t-edit-t-date" value="' + (t.date||'') + '"></div>'
    + '<div class="t-form-actions">'
    + '<button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>'
    + '<button type="submit" class="t-btn t-btn-primary">Save Changes</button>'
    + '</div></form>';
  openTModal();
}

async function saveEditTournament(e, id) {
  e.preventDefault();
  const name = document.getElementById('t-edit-t-name').value.trim();
  const date = document.getElementById('t-edit-t-date').value || null;
  if (!name) { tToast('Please enter a tournament name.', true); return; }
  try {
    await tApi(`tournaments?id=eq.${id}`, 'PATCH', { name, date });
    tToast('Tournament updated!');
    closeTModal();
    openTournament(id);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

function restoreScoreModal(title, body) {
  document.getElementById('t-modal-title').textContent = title;
  document.getElementById('t-modal-body').innerHTML = body;
}

// ─── MODAL HELPERS ──────────────────────────────────────────
function openTModal() { document.getElementById('t-modal').classList.add('t-modal-open'); }
function closeTModal() { document.getElementById('t-modal').classList.remove('t-modal-open'); }
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
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

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
    if (btn) { btn.disabled = false; btn.textContent = '📄 Print Roster'; }
  }
}