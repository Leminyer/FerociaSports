// ============================================================
// FEROCIA SPORTS CENTER — TOURNAMENT MODULE
// Completely separate from app.js — safe to load independently
// ============================================================

// ─── SUPABASE CONFIG (same as main app) ─────────────────────
const T_URL = 'https://yyocceadorckkfbgnbqk.supabase.co';
const T_KEY = 'sb_publishable_Lhc3oHL90kL7O0vO3kJQgQ_BqQfc4Il';

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

const tApi = async (path, method = 'GET', body = null) => {
  const res = await fetch(`${T_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': T_KEY,
      'Authorization': `Bearer ${T_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : method === 'PATCH' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'API Error'); }
  const t = await res.text(); return t ? JSON.parse(t) : null;
};

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
              <div class="t-tournament-card-status t-status-${t.status}" style="margin:0;">${t.status}</div>
              ${t.status === 'draft' ? `<button type="button" class="t-btn t-btn-danger t-btn-sm" onclick="event.stopPropagation();deleteTournament(${t.id},'${t.name.replace(/'/g,"\'")}')" style="font-size:10px;padding:4px 10px;">Delete</button>` : ''}
            </div>
            <div class="t-tournament-card-name">${t.name}</div>
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
    const [t] = await tApi('tournaments', 'POST', { name, date, status: 'draft' });
    for (const cat of categories) {
      await tApi('tournament_categories', 'POST', { tournament_id: t.id, name: cat, status: 'setup' });
    }
    tToast(`Tournament "${name}" created!`);
    openTournament(t.id);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

// ─── DELETE TOURNAMENT ──────────────────────────────────────
async function deleteTournament(id, name) {
  document.getElementById('t-modal-title').textContent = 'Delete Tournament';
  document.getElementById('t-modal-body').innerHTML = `
    <div style="padding:8px 0 24px;">
      <p style="font-size:14px;color:#0d1f4a;line-height:1.6;">
        Are you sure you want to delete tournament <strong>${name}</strong>?
        All categories, teams and matches will be permanently removed.
      </p>
    </div>
    <div class="t-form-actions">
      <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
      <button type="button" class="t-btn t-btn-danger" onclick="confirmDeleteTournament(${id})">Delete</button>
    </div>
  `;
  openTModal();
}

async function confirmDeleteTournament(id) {
  try {
    const categories = await tApi(`tournament_categories?tournament_id=eq.${id}&select=id`);
    for (const cat of categories) {
      await tApi(`tournament_rr_matches?category_id=eq.${cat.id}`, 'DELETE');
      await tApi(`tournament_bracket_matches?category_id=eq.${cat.id}`, 'DELETE');
      await tApi(`tournament_teams?category_id=eq.${cat.id}`, 'DELETE');
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
  tCurrentTournamentId = id;
  const el = document.getElementById('t-content');
  el.innerHTML = `<div class="t-loading">Loading tournament...</div>`;
  const [t] = await tApi(`tournaments?id=eq.${id}&select=*`);
  const categories = await tApi(`tournament_categories?tournament_id=eq.${id}&select=*&order=id`);
  tCurrentCategoryId = tCurrentCategoryId || categories[0]?.id || null;
  renderTournamentDetail(t, categories);
}

function renderTournamentDetail(t, categories) {
  const el = document.getElementById('t-content');
  const date = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric',year:'numeric'}) : 'No date set';
  el.innerHTML = `
    <div class="t-header-bar">
      <button class="t-btn t-btn-ghost" onclick="renderTournamentList()">← Tournaments</button>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="t-status-badge t-status-${t.status}">${t.status}</span>
        ${t.status === 'draft' ? `<button class="t-btn t-btn-success" onclick="startTournament(${t.id})">▶ Start Tournament</button>` : ''}
        ${t.status === 'active' ? `<button class="t-btn t-btn-danger" onclick="completeTournament(${t.id})">Complete</button>` : ''}
      </div>
    </div>
    <div class="t-tournament-hero">
      <div class="t-tournament-hero-name">${t.name}</div>
      <div class="t-tournament-hero-date">📅 ${date}</div>
    </div>
    <div class="t-category-tabs">
      ${categories.map(cat => `
        <button class="t-category-tab ${cat.id === tCurrentCategoryId ? 'active' : ''}"
          onclick="switchCategory(${cat.id}, ${t.id})">
          ${cat.name}
          <span class="t-cat-status-dot t-dot-${cat.status}"></span>
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
  renderCategory(cat, teams, rrMatches, bracketMatches, t);
}

function renderCategory(cat, teams, rrMatches, bracketMatches, tournament) {
  const el = document.getElementById('t-category-content');
  const standings = tCalcStandings(teams, rrMatches);
  const rrComplete = rrMatches.length > 0 && rrMatches.filter(m => m.status === 'pending').length === 0;
  const tMap = {}; teams.forEach(t => tMap[t.id] = t);

  let html = '';

  // PHASE 1: TEAMS
  html += `
    <div class="t-phase-card">
      <div class="t-phase-header">
        <div class="t-phase-title">
          <span class="t-phase-num">1</span> Teams
          <span class="t-team-count">${teams.length} team${teams.length !== 1 ? 's' : ''}</span>
        </div>
        ${tournament.status !== 'completed' ? `<button class="t-btn t-btn-sm t-btn-primary" onclick="showAddTeam(${cat.id}, '${cat.name.replace(/'/g,"\'")}')">+ Add Team</button>` : ''}
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
                  <div class="t-team-name">${team.name}</div>
                  <div class="t-team-players">${players.join(' & ')}</div>
                </div>
                ${tournament.status !== 'completed' ? `
                  <button class="t-btn-icon" onclick="editTeam(${team.id}, ${cat.id})" style="color:#174CCC;font-size:14px;background:none;border:none;cursor:pointer;" title="Edit">✏️</button>
                ` : ''}
                ${tournament.status === 'draft' ? `
                  <button class="t-btn-icon t-btn-danger-icon" onclick="deleteTeam(${team.id}, '${team.name.replace(/'/g,"\'")}', ${cat.id})">×</button>
                ` : ''}
              </div>`;
          }).join('')}
        </div>
      ` : `<div class="t-empty-sm">No teams yet. Add teams to get started.</div>`}
    </div>`;

  // PHASE 2: ROUND ROBIN
  const rrTotal = rrMatches.filter(m => m.status !== 'bye').length;
  const rrDone = rrMatches.filter(m => m.status === 'completed').length;
  const rrPct = rrTotal > 0 ? Math.round((rrDone / rrTotal) * 100) : 0;

  html += `
    <div class="t-phase-card ${teams.length < 3 ? 't-phase-disabled' : ''}">
      <div class="t-phase-header">
        <div class="t-phase-title">
          <span class="t-phase-num">2</span> Round Robin
          ${rrMatches.length > 0 ? `<span class="t-progress-label">${rrDone}/${rrTotal} matches</span>` : ''}
        </div>
        ${teams.length >= 3 && rrMatches.length === 0 && tournament.status !== 'draft' ?
          `<button class="t-btn t-btn-sm t-btn-primary" onclick="showRRFormatModal(${cat.id})">Generate Schedule</button>` : ''}
        ${teams.length >= 3 && rrMatches.length === 0 && tournament.status === 'draft' ?
          `<span class="t-hint">Start tournament first</span>` : ''}
      </div>
      ${rrMatches.length > 0 ? `
        ${rrTotal > 0 ? `<div class="t-progress-bar"><div class="t-progress-fill" style="width:${rrPct}%"></div></div>` : ''}
        <div class="t-rr-grid">
          ${renderRRRounds(rrMatches, tMap, tournament)}
        </div>
        ${rrDone > 0 ? tRenderStandings(standings) : ''}
      ` : teams.length < 3 ? `<div class="t-empty-sm">Add at least 3 teams first.</div>` :
        `<div class="t-empty-sm">Generate the schedule to start round robin play.</div>`}
    </div>`;

  // PHASE 3: FINALS
  if (rrComplete || bracketMatches.length > 0) {
    html += `
      <div class="t-phase-card">
        <div class="t-phase-header">
          <div class="t-phase-title"><span class="t-phase-num">3</span> Finals</div>
          ${bracketMatches.length === 0 ? `
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <select id="finals-size-${cat.id}" class="t-select-sm">
                <option value="2">Top 2</option>
                <option value="3">Top 3</option>
                <option value="4" selected>Top 4</option>
                <option value="8">Top 8</option>
              </select>
              <select id="finals-elim-${cat.id}" class="t-select-sm">
                <option value="single">Single Elim</option>
                <option value="double">Double Elim</option>
              </select>
              <select id="finals-score-format-${cat.id}" class="t-select-sm">
                <option value="play11_win2">11, win by 2</option>
                <option value="play11_win1">11, win by 1</option>
                <option value="play15_win2">15, win by 2</option>
                <option value="play15_win1">15, win by 1</option>
                <option value="play21_win2">21, win by 2</option>
                <option value="play21_win1">21, win by 1</option>
              </select>
              <button class="t-btn t-btn-sm t-btn-primary" onclick="generateBracket(${cat.id}, ${cat.tournament_id})">Generate Bracket</button>
            </div>` : ''}
        </div>
        ${bracketMatches.length > 0 ? renderBracket(bracketMatches, tMap, tournament) : `
          <div class="t-standings-preview">
            <div class="t-empty-sm">Choose how many teams advance and generate the bracket.</div>
            <div style="margin-top:12px;">
              ${standings.slice(0, 8).map((s, i) => `
                <div class="t-standing-preview-row">
                  <span class="t-seed-badge">${i + 1}</span>
                  <span class="t-standing-name">${s.name}</span>
                  <span class="t-standing-record">${s.w}W ${s.l}L ${s.pts_for - s.pts_against > 0 ? '+' : ''}${s.pts_for - s.pts_against}</span>
                </div>`).join('')}
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
                  <span class="t-match-team ${winA ? 't-winner' : ''}">${teamA?.name || '?'}</span>
                  <span class="t-match-vs">vs</span>
                  <span class="t-match-team ${winB ? 't-winner' : ''}">${teamB?.name || '?'}</span>
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
              <span class="t-bye-team">${tMap[m.team_a_id]?.name || '?'}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function tRenderStandings(standings) {
  return `
    <div class="t-standings-table">
      <div class="t-standings-title">Standings</div>
      <table class="t-table">
        <thead><tr><th>#</th><th>Team</th><th>Wins</th><th>Losses</th><th>Pts For</th><th>Diff</th></tr></thead>
        <tbody>
          ${standings.map((s, i) => `
            <tr class="${i < 4 ? 't-row-qualify' : ''}">
              <td><span class="t-rank ${i===0?'t-rank-1':i===1?'t-rank-2':i===2?'t-rank-3':''}">${i + 1}</span></td>
              <td class="t-team-cell">
                ${s.name}
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
  const roundOrder = ['QF','Semifinals','3rd Place','Final'];
  const grouped = {};
  matches.forEach(m => {
    if (!grouped[m.round_name]) grouped[m.round_name] = [];
    grouped[m.round_name].push(m);
  });
  const orderedRounds = roundOrder.filter(r => grouped[r]);
  const isComplete = matches.every(m => m.status === 'completed');
  const finalMatch = matches.find(m => m.round_name === 'Final' && m.status === 'completed');

  let html = `<div class="t-bracket">`;
  if (isComplete && finalMatch) {
    const champion = tMap[finalMatch.winner_id];
    const runnerUp = tMap[finalMatch.winner_id === finalMatch.team_a_id ? finalMatch.team_b_id : finalMatch.team_a_id];
    const thirdMatch = matches.find(m => m.round_name === '3rd Place' && m.status === 'completed');
    const third = thirdMatch ? tMap[thirdMatch.winner_id] : null;
    html += `
      <div class="t-podium">
        <div class="t-podium-slot t-podium-silver">
          <div class="t-podium-medal">🥈</div>
          <div class="t-podium-team">${runnerUp?.name || '—'}</div>
          <div class="t-podium-players">${getTeamPlayerNames(runnerUp)}</div>
          <div class="t-podium-label">2nd Place</div>
          <div class="t-podium-bar t-bar-silver"></div>
        </div>
        <div class="t-podium-slot t-podium-gold">
          <div class="t-podium-crown">👑</div>
          <div class="t-podium-medal">🥇</div>
          <div class="t-podium-team t-champion">${champion?.name || '—'}</div>
          <div class="t-podium-players">${getTeamPlayerNames(champion)}</div>
          <div class="t-podium-label">Champion</div>
          <div class="t-podium-bar t-bar-gold"></div>
        </div>
        ${third ? `<div class="t-podium-slot t-podium-bronze">
          <div class="t-podium-medal">🥉</div>
          <div class="t-podium-team">${third.name}</div>
          <div class="t-podium-players">${getTeamPlayerNames(third)}</div>
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
                <div style="font-weight:700;">${teamA?.name || 'TBD'}</div>
                ${teamA ? `<div style="font-size:10px;color:#6b7a99;font-weight:500;margin-top:1px;">${getTeamPlayerNames(teamA)}</div>` : ''}
              </div>
              ${isDone ? `<span class="t-bracket-score ${winA ? 't-bracket-score-win' : ''}">${m.score_a}</span>` : ''}
            </div>
            <div class="t-bracket-divider"></div>
            <div class="t-bracket-team ${winB ? 't-bracket-winner' : ''} ${!m.team_b_id ? 't-bracket-tbd' : ''}">
              <div style="flex:1;">
                <div style="font-weight:700;">${teamB?.name || 'TBD'}</div>
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

function showAddTeam(catId, catName) {
  const playersPerTeam = catName === 'team_challenge' ? 4 : catName === 'singles' ? 1 : 2;
  const playerOpts = tAllPlayers.filter(p => p.status !== 'inactive')
    .map(p => `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('');
  const playerFields = Array.from({length: playersPerTeam}, (_, i) => `
    <div class="t-form-group">
      <label class="t-label">Player ${i + 1}</label>
      <select class="t-input t-player-select" id="t-player-${i+1}">
        <option value="">-- Select player --</option>${playerOpts}
      </select>
    </div>`).join('');
  document.getElementById('t-modal-title').textContent = `Add Team — ${catName}`;
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
  const name = document.getElementById('t-team-name').value.trim();
  if (!name) { tToast('Please enter a team name.', true); return; }
  const playerSelects = document.querySelectorAll('.t-player-select');
  const playerIds = [...playerSelects].map(s => parseInt(s.value) || null);
  try {
    await tApi('tournament_teams', 'POST', {
      category_id: catId, name,
      player1_id: playerIds[0] || null,
      player2_id: playerIds[1] || null,
      player3_id: playerIds[2] || null,
      player4_id: playerIds[3] || null,
    });
    tToast(`Team "${name}" added!`);
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
  const playersPerTeam = cat.name === 'team_challenge' ? 4 : cat.name === 'singles' ? 1 : 2;
  const playerOpts = tAllPlayers.filter(p => p.status !== 'inactive')
    .map(p => `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('');
  const playerIds = [team.player1_id, team.player2_id, team.player3_id, team.player4_id];
  const playerFields = Array.from({length: playersPerTeam}, (_, i) => `
    <div class="t-form-group">
      <label class="t-label">Player ${i + 1}</label>
      <select class="t-input t-player-select" id="t-edit-player-${i+1}">
        <option value="">-- Select player --</option>${playerOpts}
      </select>
    </div>`).join('');
  document.getElementById('t-modal-title').textContent = 'Edit Team';
  document.getElementById('t-modal-body').innerHTML = `
    <form id="t-edit-team-form" onsubmit="saveEditTeam(event, ${teamId}, ${catId})">
      <div class="t-form-group">
        <label class="t-label">Team name *</label>
        <input class="t-input" type="text" id="t-edit-team-name" required value="${team.name}">
      </div>
      ${playerFields}
      <div class="t-form-actions">
        <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
        <button type="submit" class="t-btn t-btn-primary">Save Changes</button>
      </div>
    </form>`;
  openTModal();
  // Set current values
  playerIds.forEach((id, i) => {
    const sel = document.getElementById(`t-edit-player-${i+1}`);
    if (sel && id) sel.value = id;
  });
}

async function saveEditTeam(e, teamId, catId) {
  e.preventDefault();
  const name = document.getElementById('t-edit-team-name').value.trim();
  if (!name) { tToast('Please enter a team name.', true); return; }
  const playerSelects = document.querySelectorAll('.t-player-select');
  const playerIds = [...playerSelects].map(s => parseInt(s.value) || null);
  try {
    await tApi(`tournament_teams?id=eq.${teamId}`, 'PATCH', {
      name,
      player1_id: playerIds[0] || null,
      player2_id: playerIds[1] || null,
      player3_id: playerIds[2] || null,
      player4_id: playerIds[3] || null,
    });
    tToast('Team updated!');
    closeTModal();
    tCurrentCategoryId = catId;
    const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
    const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
    renderTournamentDetail(t, categories);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

async function deleteTeam(teamId, teamName, catId) {
  document.getElementById('t-modal-title').textContent = 'Remove Team';
  document.getElementById('t-modal-body').innerHTML = `
    <div style="padding:8px 0 24px;">
      <p style="font-size:14px;color:#0d1f4a;line-height:1.6;">
        Are you sure you want to remove <strong>${teamName}</strong> from this category? This cannot be undone.
      </p>
    </div>
    <div class="t-form-actions">
      <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
      <button type="button" class="t-btn t-btn-danger" onclick="confirmDeleteTeam(${teamId}, ${catId})">Remove</button>
    </div>`;
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
function showRRFormatModal(catId) {
  document.getElementById('t-modal-title').textContent = 'Round Robin Format';
  document.getElementById('t-modal-body').innerHTML = `
    <div class="t-form-group">
      <label class="t-label">Match format</label>
      <select class="t-input" id="t-rr-format">${RR_FORMAT_OPTIONS}</select>
    </div>
    <p style="font-size:12px;color:#6b7a99;margin-bottom:20px;">
      This format will apply to all round robin matches in this category.
      Finals format is set separately when generating the bracket.
    </p>
    <div class="t-form-actions">
      <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
      <button type="button" class="t-btn t-btn-primary" onclick="generateRR(${catId})">Generate Schedule</button>
    </div>
  `;
  openTModal();
}

async function generateRR(catId) {
  const formatEl = document.getElementById('t-rr-format');
  const format = formatEl ? formatEl.value : 'play11_win1';
  const teams = await tApi(`tournament_teams?category_id=eq.${catId}&select=*&order=id`);
  const n = teams.length;
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

  // Save format to category
  await tApi(`tournament_categories?id=eq.${catId}`, 'PATCH', { rr_format: format });
  await tApi('tournament_rr_matches', 'POST', rows);
  closeTModal();
  tToast(`Schedule generated! ${rows.filter(r => r.status === 'pending').length} matches ready.`);
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

  const teams = await tApi(`tournament_teams?category_id=eq.${catId}&select=*`);
  const rrMatches = await tApi(`tournament_rr_matches?category_id=eq.${catId}&select=*`);
  const standings = tCalcStandings(teams, rrMatches);
  const advancing = standings.filter(s => !s.forfeited).slice(0, size);

  await tApi(`tournament_categories?id=eq.${catId}`, 'PATCH', { finals_format: format, finals_size: size, finals_format_score: scoreFormat });

  const bracketMatches = buildBracketMatches(advancing, catId, format);
  if (bracketMatches.length) {
    await tApi('tournament_bracket_matches', 'POST', bracketMatches);
  }
  tToast(`Bracket generated! Top ${size} teams advancing.`);
  openTournament(tCurrentTournamentId);
}

function buildBracketMatches(teams, catId, format) {
  const n = teams.length;
  const matches = [];

  if (n === 2) {
    matches.push({ category_id: catId, round_name: 'Final', match_number: 1,
      team_a_id: teams[0].id, team_b_id: teams[1].id, status: 'pending' });
  } else if (n === 3) {
    matches.push({ category_id: catId, round_name: 'Semifinals', match_number: 1,
      team_a_id: teams[1].id, team_b_id: teams[2].id, status: 'pending' });
    matches.push({ category_id: catId, round_name: 'Final', match_number: 1,
      team_a_id: teams[0].id, team_b_id: null, status: 'pending' });
  } else if (n === 4) {
    matches.push({ category_id: catId, round_name: 'Semifinals', match_number: 1,
      team_a_id: teams[0].id, team_b_id: teams[3].id, status: 'pending' });
    matches.push({ category_id: catId, round_name: 'Semifinals', match_number: 2,
      team_a_id: teams[1].id, team_b_id: teams[2].id, status: 'pending' });
    matches.push({ category_id: catId, round_name: '3rd Place', match_number: 1,
      team_a_id: null, team_b_id: null, status: 'pending' });
    matches.push({ category_id: catId, round_name: 'Final', match_number: 1,
      team_a_id: null, team_b_id: null, status: 'pending' });
  } else if (n === 8) {
    for (let i = 0; i < 4; i++) {
      matches.push({ category_id: catId, round_name: 'QF', match_number: i + 1,
        team_a_id: teams[i].id, team_b_id: teams[7 - i].id, status: 'pending' });
    }
    matches.push({ category_id: catId, round_name: 'Semifinals', match_number: 1, team_a_id: null, team_b_id: null, status: 'pending' });
    matches.push({ category_id: catId, round_name: 'Semifinals', match_number: 2, team_a_id: null, team_b_id: null, status: 'pending' });
    matches.push({ category_id: catId, round_name: '3rd Place', match_number: 1, team_a_id: null, team_b_id: null, status: 'pending' });
    matches.push({ category_id: catId, round_name: 'Final', match_number: 1, team_a_id: null, team_b_id: null, status: 'pending' });
  }
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
  document.getElementById('t-modal-body').innerHTML = `
    <div class="t-score-modal">
      <div class="t-score-rule">${isFinals ? '🏆 Finals: ' + (T_FORMATS[cat.finals_format_score] || 'Play to 11, win by 2') : '🏓 Round Robin: ' + (T_FORMATS[cat.rr_format] || 'Play to 11, win by 1')}</div>
      <div class="t-form-group" style="margin-bottom:16px;">
        <label class="t-label">Court number</label>
        <input class="t-input" type="number" min="1" id="t-court-num" value="${match.court || ''}" placeholder="e.g. 5" style="max-width:120px;">
      </div>
      <div class="t-score-teams">
        <div class="t-score-team">
          <div class="t-score-team-name">${teamA?.name || '?'}</div>
          <input class="t-score-input" type="number" min="0" max="25" id="t-score-a" value="${match.score_a ?? ''}" placeholder="0">
          <label class="t-forfeit-check-label">
            <input type="checkbox" id="t-forfeit-a" onchange="onForfeitCheck('a','b')"> Forfeit
          </label>
        </div>
        <div class="t-score-divider">VS</div>
        <div class="t-score-team">
          <div class="t-score-team-name">${teamB?.name || '?'}</div>
          <input class="t-score-input" type="number" min="0" max="25" id="t-score-b" value="${match.score_b ?? ''}" placeholder="0">
          <label class="t-forfeit-check-label">
            <input type="checkbox" id="t-forfeit-b" onchange="onForfeitCheck('b','a')"> Forfeit
          </label>
        </div>
      </div>
      <div id="t-score-preview" class="t-score-preview"></div>
    </div>
    <div class="t-form-actions">
      <button type="button" class="t-btn t-btn-ghost" onclick="closeTModal()">Cancel</button>
      <button type="button" class="t-btn t-btn-primary" onclick="saveScore('${type}', ${matchId}, ${teamAId}, ${teamBId}, ${catId})">Save Result</button>
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

async function saveScore(type, matchId, teamAId, teamBId, catId) {
  // Check if forfeit is selected
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
        <button type="button" class="t-btn t-btn-danger" onclick="processForfeit('${type}', ${matchId}, ${teamAId}, ${teamBId}, ${catId}, ${forfeitTeamId})">Confirm Forfeit</button>
      </div>
    `;
    return;
  }

  const sa = parseInt(document.getElementById('t-score-a').value);
  const sb = parseInt(document.getElementById('t-score-b').value);
  if (isNaN(sa) || isNaN(sb)) { tToast('Please enter both scores.', true); return; }
  const winnerId = sa > sb ? teamAId : teamBId;

  try {
    const courtNum = parseInt(document.getElementById('t-court-num')?.value) || null;
    if (type === 'rr') {
      await tApi(`tournament_rr_matches?id=eq.${matchId}`, 'PATCH', {
        score_a: sa, score_b: sb, winner_id: winnerId, status: 'completed',
        ...(courtNum ? {court: courtNum} : {})
      });
    } else {
      await tApi(`tournament_bracket_matches?id=eq.${matchId}`, 'PATCH', {
        score_a: sa, score_b: sb, winner_id: winnerId, status: 'completed',
        ...(courtNum ? {court: courtNum} : {})
      });
      await advanceBracket(matchId, winnerId, teamAId === winnerId ? teamBId : teamAId, catId);
    }
    tToast('Score saved!');
    closeTModal();
    tCurrentCategoryId = catId;
    const [t] = await tApi(`tournaments?id=eq.${tCurrentTournamentId}&select=*`);
    const categories = await tApi(`tournament_categories?tournament_id=eq.${tCurrentTournamentId}&select=*&order=id`);
    renderTournamentDetail(t, categories);
  } catch(err) { tToast(`Error: ${err.message}`, true); }
}

async function advanceBracket(matchId, winnerId, loserId, catId) {
  const [match] = await tApi(`tournament_bracket_matches?id=eq.${matchId}&select=*`);
  const allMatches = await tApi(`tournament_bracket_matches?category_id=eq.${catId}&select=*&order=id`);

  const roundOrder = ['QF', 'SF', '3rd Place', 'Final'];
  const curIdx = roundOrder.indexOf(match.round_name);
  const nextRound = roundOrder[curIdx + 1];
  const sfMatches = allMatches.filter(m => m.round_name === 'Semifinals');
  const finalMatch = allMatches.find(m => m.round_name === 'Final');
  const thirdMatch = allMatches.find(m => m.round_name === '3rd Place');

  if (match.round_name === 'QF') {
    const completedQF = allMatches.filter(m => m.round_name === 'QF' && m.status === 'completed');
    const sfSlot = completedQF.length <= 2 ? sfMatches[0] : sfMatches[1];
    if (sfSlot) {
      const patch = sfSlot.team_a_id ? { team_b_id: winnerId } : { team_a_id: winnerId };
      await tApi(`tournament_bracket_matches?id=eq.${sfSlot.id}`, 'PATCH', patch);
    }
  } else if (match.round_name === 'Semifinals') {
    // Winner goes to Final, loser goes to 3rd Place
    if (finalMatch) {
      const patch = finalMatch.team_a_id ? { team_b_id: winnerId } : { team_a_id: winnerId };
      await tApi(`tournament_bracket_matches?id=eq.${finalMatch.id}`, 'PATCH', patch);
    }
    if (thirdMatch) {
      const patch = thirdMatch.team_a_id ? { team_b_id: loserId } : { team_a_id: loserId };
      await tApi(`tournament_bracket_matches?id=eq.${thirdMatch.id}`, 'PATCH', patch);
    }
  }
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
  for (const cat of categories) {
    const teams = await tApi(`tournament_teams?category_id=eq.${cat.id}&select=*`);
    const teamsWithoutPlayers = teams.filter(t => !t.player1_id);
    if (teamsWithoutPlayers.length) {
      errors.push(`"${cat.name}": ${teamsWithoutPlayers.length} team(s) have no players registered.`);
    }
    const rrMatches = await tApi(`tournament_rr_matches?category_id=eq.${cat.id}&status=eq.pending&select=id`);
    if (rrMatches.length) {
      errors.push(`"${cat.name}": ${rrMatches.length} round robin match(es) have no scores.`);
    }
    const bracketMatches = await tApi(`tournament_bracket_matches?category_id=eq.${cat.id}&status=eq.pending&select=id`);
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

async function processForfeit(type, matchId, teamAId, teamBId, catId, forfeitTeamId) {
  // Get category to know the play-to score
  const [cat] = await tApi(`tournament_categories?id=eq.${catId}&select=*`);
  const rrFormat = cat.rr_format || 'play11_win1';
  const playTo = rrFormat.includes('15') ? 15 : rrFormat.includes('21') ? 21 : 11;
  const winnerId = forfeitTeamId === teamAId ? teamBId : teamAId;
  const scoreA = forfeitTeamId === teamAId ? 0 : playTo;
  const scoreB = forfeitTeamId === teamBId ? 0 : playTo;

  try {
    // Save this match as forfeited
    if (type === 'rr') {
      await tApi(`tournament_rr_matches?id=eq.${matchId}`, 'PATCH', {
        score_a: scoreA, score_b: scoreB,
        winner_id: winnerId, status: 'completed',
        forfeit_team_id: forfeitTeamId
      });
    } else {
      await tApi(`tournament_bracket_matches?id=eq.${matchId}`, 'PATCH', {
        score_a: scoreA, score_b: scoreB,
        winner_id: winnerId, status: 'completed',
        forfeit_team_id: forfeitTeamId
      });
      await advanceBracket(matchId, winnerId, forfeitTeamId, catId);
    }

    // Auto-score ALL remaining pending matches for the forfeiting team
    const pendingRR = await tApi(
      `tournament_rr_matches?category_id=eq.${catId}&status=eq.pending&select=*`
    );
    for (const m of pendingRR) {
      if (m.team_a_id === forfeitTeamId || m.team_b_id === forfeitTeamId) {
        const win = m.team_a_id === forfeitTeamId ? m.team_b_id : m.team_a_id;
        const sA = m.team_a_id === forfeitTeamId ? 0 : playTo;
        const sB = m.team_b_id === forfeitTeamId ? 0 : playTo;
        await tApi(`tournament_rr_matches?id=eq.${m.id}`, 'PATCH', {
          score_a: sA, score_b: sB, winner_id: win,
          status: 'completed', forfeit_team_id: forfeitTeamId
        });
      }
    }

    const pendingBracket = await tApi(
      `tournament_bracket_matches?category_id=eq.${catId}&status=eq.pending&select=*`
    );
    for (const m of pendingBracket) {
      if (m.team_a_id === forfeitTeamId || m.team_b_id === forfeitTeamId) {
        const win = m.team_a_id === forfeitTeamId ? m.team_b_id : m.team_a_id;
        const sA = m.team_a_id === forfeitTeamId ? 0 : playTo;
        const sB = m.team_b_id === forfeitTeamId ? 0 : playTo;
        await tApi(`tournament_bracket_matches?id=eq.${m.id}`, 'PATCH', {
          score_a: sA, score_b: sB, winner_id: win,
          status: 'completed', forfeit_team_id: forfeitTeamId
        });
        await advanceBracket(m.id, win, forfeitTeamId, catId);
      }
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
function closeTModal() { document.getElementById('t-modal').classList.remove('t-modal-open'); }
function tToast(msg, err = false) {
  // Reuse main app toast if available
  if (typeof toast === 'function') { toast(msg, err); return; }
  alert(msg);
}
