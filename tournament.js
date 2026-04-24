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
  return ids.map(id => {
    const p = tAllPlayers.find(x => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : '';
  }).filter(Boolean).join(' & ');
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
    pts_for: 0, pts_against: 0, played: 0
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
  // Byes count as played but no win/loss
  matches.filter(m => m.status === 'bye').forEach(m => {
    const tid = m.team_a_id;
    if (stats[tid]) stats[tid].bye++;
  });
  return Object.values(stats).sort((a, b) => {
    if (b.w !== a.w) return b.w - a.w;
    const diffA = a.pts_for - a.pts_against;
    const diffB = b.pts_for - b.pts_against;
    return diffB - diffA;
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
  const advancing = standings.slice(0, size);

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
        </div>
        <div class="t-score-divider">VS</div>
        <div class="t-score-team">
          <div class="t-score-team-name">${teamB?.name || '?'}</div>
          <input class="t-score-input" type="number" min="0" max="25" id="t-score-b" value="${match.score_b ?? ''}" placeholder="0">
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
  if (!confirm('Mark this tournament as completed?')) return;
  await tApi(`tournaments?id=eq.${id}`, 'PATCH', { status: 'completed' });
  tToast('Tournament completed!');
  openTournament(id);
}

// ─── MODAL HELPERS ──────────────────────────────────────────
function openTModal() { document.getElementById('t-modal').classList.add('t-modal-open'); }
function closeTModal() { document.getElementById('t-modal').classList.remove('t-modal-open'); }
function tToast(msg, err = false) {
  // Reuse main app toast if available
  if (typeof toast === 'function') { toast(msg, err); return; }
  alert(msg);
}
