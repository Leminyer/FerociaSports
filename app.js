
const SUPABASE_URL='https://yyocceadorckkfbgnbqk.supabase.co';
const SUPABASE_KEY='sb_publishable_Lhc3oHL90kL7O0vO3kJQgQ_BqQfc4Il';

const api=async(path,method='GET',body=null)=>{
  const res=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method,
    headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json','Prefer':(method==='POST'||method==='PATCH')?'return=representation':''},
    body:body?JSON.stringify(body):null
  });
  if(!res.ok){const e=await res.json();throw new Error(e.message||'API error');}
  if(method==='DELETE'||method==='PATCH'){const t=await res.text();return t?JSON.parse(t):null;}
  return res.json();
};

let allPlayers=[];
let allLadders=[];
let currentLadder=null;
let ladderPlayers=[];
let courtPlayers=[];
let gameCount=0;
let extraGameCount=0;
let extraGames=[];

const toast=(msg,err=false)=>{
  const bannerId=err?'error-banner':'success-banner';
  const msgId=err?'error-banner-msg':'success-banner-msg';
  const other=err?'success-banner':'error-banner';
  document.getElementById(other).style.display='none';
  document.getElementById(msgId).textContent=msg;
  document.getElementById(bannerId).style.display='block';
  clearTimeout(window._toastTimer);
  window._toastTimer=setTimeout(()=>{
    document.getElementById(bannerId).style.display='none';
  },4000);
};

const switchMainTab=(tab)=>{
  document.getElementById('tab-programs').classList.toggle('active', tab==='programs');
  document.getElementById('tab-management').classList.toggle('active', tab==='management');
  document.getElementById('subnav-programs').style.display=tab==='programs'?'flex':'none';
  document.getElementById('subnav-management').style.display=tab==='management'?'flex':'none';
  if(tab==='programs'){
    const activeBtn=document.querySelector('#subnav-programs button.active');
    const activePage=activeBtn?activeBtn.dataset.page||null:null;
    if(activePage)showPage(activePage,activeBtn);
    else showPage('ladder',document.querySelector('#subnav-programs button[data-page="ladder"]'));
  } else {
    const activeBtn=document.querySelector('#subnav-management button.active');
    if(activeBtn){const name=activeBtn.textContent.toLowerCase().replace(' ','-');showPage(name,activeBtn);}
    else showPage('players',document.querySelector('#subnav-management button'));
  }
};

const showPage=(name,btn)=>{
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sub-nav button').forEach(b=>b.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  if(btn)btn.classList.add('active');
  if(name==='ladder')loadLadder();
  if(name==='sessions')loadSessions();
  if(name==='players')loadPlayers();
  if(name==='entry')initEntry();
  if(name==='ladders')loadLaddersPage();
  if(name==='add-player')initAddPlayer();
};

// ─── LADDER SELECTOR ────────────────────────────────────────────────
const loadLadderSelector=async()=>{
  allLadders=await api('ladders?select=*&order=id.desc');
  const sel=document.getElementById('ladder-selector');
  if(!allLadders.length){
    sel.innerHTML='<option value="">-- No ladders yet --</option>';
    currentLadder=null;
    updateLadderBanner();
    return;
  }
  sel.innerHTML='<option value="">-- Select a ladder --</option>'+
    allLadders.map(l=>`<option value="${l.id}">${l.name}${l.status==='closed'?' (closed)':''}</option>`).join('');
  sel.value='';
  currentLadder=null;
  updateLadderBanner();
};

const onLadderChange=async()=>{
  const id=parseInt(document.getElementById('ladder-selector').value);
  currentLadder=allLadders.find(l=>l.id===id)||null;
  updateLadderBanner();
  await loadLadderPlayers();
  // Always switch to Programs tab and show Standings
  switchMainTab('programs');
  const standingsBtn=document.querySelector('#subnav-programs button[data-page="ladder"]');
  showPage('ladder', standingsBtn);
};

const updateLadderBanner=()=>{
  const ladderPages=['ladder','sessions','entry'];
  const ladderNavBtns=document.querySelectorAll('#subnav-programs button[data-page]');
  if(!currentLadder){
    ladderNavBtns.forEach(b=>{if(ladderPages.includes(b.dataset.page))b.disabled=true;});
    ladderPages.forEach(p=>{const el=document.getElementById(`page-${p}`);if(el)el.classList.add('page-disabled');});
    return;
  }
  ladderNavBtns.forEach(b=>b.disabled=false);
  ladderPages.forEach(p=>{const el=document.getElementById(`page-${p}`);if(el)el.classList.remove('page-disabled');});
};

const loadLadderPlayers=async()=>{
  if(!currentLadder){ladderPlayers=[];return;}
  const rows=await api(`ladder_players?select=*,players(*)&ladder_id=eq.${currentLadder.id}`);
  ladderPlayers=rows.map(r=>r.players).filter(Boolean);
};

// ─── LADDER MANAGEMENT PAGE ─────────────────────────────────────────
const loadLaddersPage=async()=>{
  allLadders=await api('ladders?select=*&order=id.desc');
  const el=document.getElementById('ladders-list');
  if(!allLadders.length){el.innerHTML='<div class="empty">No ladders yet. Create your first one!</div>';return;}
  el.innerHTML=allLadders.map(l=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:0.5px solid var(--border);">
      <div>
        <div style="font-weight:700;font-size:14px;">${l.name}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
          ${l.start_date?'Started: '+new Date(l.start_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'No start date'}
          ${l.end_date?' · Ends: '+new Date(l.end_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="badge badge-${l.status==='active'?'active':'inactive'}">${l.status}</span>
        <button class="btn btn-outline btn-sm" onclick="openLadderPlayers(${l.id},'${l.name.replace(/'/g,"\\'")}')">Players</button>
        <button class="btn btn-outline btn-sm" onclick="openEditLadder(${l.id})">Edit</button>
        <button class="btn btn-outline btn-sm" onclick="toggleLadderStatus(${l.id},'${l.status}')">${l.status==='active'?'Close':'Reopen'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLadder(${l.id},this.dataset.name)" data-name="${l.name}">Delete</button>
      </div>
    </div>`).join('');
};

const createLadder=async(e)=>{
  e.preventDefault();
  const name=document.getElementById('new-ladder-name').value.trim();
  const start=document.getElementById('new-ladder-start').value||null;
  const end=document.getElementById('new-ladder-end').value||null;
  if(!name){toast('Please enter a ladder name.',true);return;}
  try{
    await api('ladders','POST',{name,status:'active',start_date:start,end_date:end});
    toast(`Ladder "${name}" created!`);
    document.getElementById('create-ladder-form').reset();
    await loadLadderSelector();
    loadLaddersPage();
  }catch(e){toast(`Error: ${e.message}`,true);}
};

const toggleLadderStatus=async(id,current)=>{
  const newStatus=current==='active'?'closed':'active';
  try{
    await api(`ladders?id=eq.${id}`,'PATCH',{status:newStatus});
    toast(`Ladder ${newStatus==='closed'?'closed':'reopened'}!`);
    await loadLadderSelector();
    loadLaddersPage();
  }catch(e){toast(`Error: ${e.message}`,true);}
};

const openEditLadder=(id)=>{
  const l=allLadders.find(x=>x.id===id);if(!l)return;
  document.getElementById('edit-ladder-id').value=l.id;
  document.getElementById('edit-ladder-name').value=l.name;
  document.getElementById('edit-ladder-start').value=l.start_date||'';
  document.getElementById('edit-ladder-end').value=l.end_date||'';
  document.getElementById('edit-ladder-status').value=l.status||'active';
  document.getElementById('edit-ladder-modal').classList.add('open');
};

const closeEditLadderModal=()=>document.getElementById('edit-ladder-modal').classList.remove('open');

const saveEditLadder=async(e)=>{
  e.preventDefault();
  const id=document.getElementById('edit-ladder-id').value;
  const body={
    name:document.getElementById('edit-ladder-name').value.trim(),
    start_date:document.getElementById('edit-ladder-start').value||null,
    end_date:document.getElementById('edit-ladder-end').value||null,
    status:document.getElementById('edit-ladder-status').value
  };
  try{
    await api(`ladders?id=eq.${id}`,'PATCH',body);
    toast('Ladder updated!');
    closeEditLadderModal();
    await loadLadderSelector();
    loadLaddersPage();
  }catch(e){toast(`Error: ${e.message}`,true);}
};

const deleteLadder=async(id,name)=>{
  if(!confirm(`Delete ladder "${name}"?\n\nThis will also delete all sessions and match records linked to it. This cannot be undone.`))return;
  try{
    await api(`matches?ladder_id=eq.${id}`,'DELETE');
    await api(`ladder_players?ladder_id=eq.${id}`,'DELETE');
    await api(`ladders?id=eq.${id}`,'DELETE');
    if(currentLadder&&currentLadder.id===id)currentLadder=null;
    toast(`Ladder "${name}" deleted.`);
    await loadLadderSelector();
    loadLaddersPage();
    updateLadderBanner();
  }catch(e){toast(`Error: ${e.message}`,true);}
};

// ─── LADDER PLAYERS MODAL ────────────────────────────────────────────
let modalLadderId=null;
const openLadderPlayers=async(ladderId,ladderName)=>{
  modalLadderId=ladderId;
  document.getElementById('lp-modal-title').textContent=`Players — ${ladderName}`;
  document.getElementById('lp-modal').classList.add('open');
  await refreshLadderPlayersModal();
};

const refreshLadderPlayersModal=async()=>{
  const [allP, enrolled] = await Promise.all([
    api('players?select=*&order=first_name'),
    api(`ladder_players?select=ladder_id,player_id&ladder_id=eq.${modalLadderId}`)
  ]);
  allPlayers = allP;
  const enrolledIds = enrolled.map(r=>Number(r.player_id));
  const enrolledPlayers = enrolledIds.map(id=>allPlayers.find(p=>Number(p.id)===id)).filter(Boolean);
  const available = allPlayers.filter(p=>!enrolledIds.includes(Number(p.id))&&p.status!=='inactive');

  document.getElementById('lp-enrolled').innerHTML = enrolledPlayers.length
    ? enrolledPlayers.map(p=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid var(--border);">
          <span style="font-size:13px;font-weight:600;">${p.first_name} ${p.last_name}
            <span class="badge badge-${p.status}" style="margin-left:6px;">${p.status}</span>
          </span>
          <button class="btn btn-danger btn-sm" onclick="removeFromLadder(${modalLadderId},${p.id})">Remove</button>
        </div>`).join('')
    : '<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">No players enrolled yet.</div>';

  const addSel = document.getElementById('lp-add-select');
  addSel.innerHTML = '<option value="">-- Select player to add --</option>' +
    available.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name} (${p.status})</option>`).join('');
  addSel.value = '';
};

const addToLadder=async()=>{
  const sel=document.getElementById('lp-add-select');
  const pid=parseInt(sel.value);
  if(!pid||isNaN(pid)){toast('Please select a player.',true);return;}
  const addBtn=document.querySelector('#lp-modal .btn-primary');
  if(addBtn)addBtn.disabled=true;
  sel.value='';
  const payload={ladder_id:parseInt(modalLadderId),player_id:pid,joined_at:new Date().toISOString().split('T')[0]};
  console.log('Adding to ladder:', payload);
  try{
    await api('ladder_players','POST',payload);
    toast('Player added to ladder!');
    await refreshLadderPlayersModal();
    await loadLadderPlayers();
  }catch(e){
    const msg = e.message||'';
    if(msg.includes('409')||msg.toLowerCase().includes('duplicate')||msg.toLowerCase().includes('conflict')){
      toast('This player is already in the ladder.',true);
      await refreshLadderPlayersModal();
    } else {
      toast(`Error: ${msg}`,true);
    }
  } finally {
    if(addBtn)addBtn.disabled=false;
  }
};

const removeFromLadder=async(ladderId,playerId)=>{
  try{
    await api(`ladder_players?ladder_id=eq.${ladderId}&player_id=eq.${playerId}`,'DELETE');
    toast('Player removed from ladder.');
    await refreshLadderPlayersModal();
    await loadLadderPlayers();
  }catch(e){toast(`Error: ${e.message}`,true);}
};

const closeLpModal=()=>document.getElementById('lp-modal').classList.remove('open');

// ─── LADDER STANDINGS ────────────────────────────────────────────────
const loadLadder=async()=>{
  if(!currentLadder){
    document.getElementById('ladder-stats').innerHTML='';
    document.getElementById('ladder-table').innerHTML='<div class="empty">Please select or create a ladder first.</div>';
    return;
  }
  try{
    if(!allPlayers.length)allPlayers=await api('players?select=*&order=id');
    const matches=await api(`matches?select=*&ladder_id=eq.${currentLadder.id}`);
    const pm={};
    ladderPlayers.forEach(p=>pm[p.id]=0);
    matches.forEach(m=>{if(pm[m.player_id]!==undefined)pm[m.player_id]+=(m.points_earned||0);});
    const ranked=[...ladderPlayers].sort((a,b)=>(pm[b.id]||0)-(pm[a.id]||0));
    ranked.forEach((p,i)=>{p._rank=i+1;p._points=pm[p.id]||0;});
    allPlayers._ranked=ranked;
    const sessions=[...new Set(matches.map(m=>m.session_date))];
    document.getElementById('ladder-stats').innerHTML=`
      <div class="stat"><div class="stat-label">Players</div><div class="stat-value">${ladderPlayers.length}</div></div>
      <div class="stat"><div class="stat-label">Sessions</div><div class="stat-value">${sessions.length}</div></div>
      <div class="stat"><div class="stat-label">Games</div><div class="stat-value">${matches.length}</div></div>
      <div class="stat lime"><div class="stat-label">Leader</div><div class="stat-value">${ranked[0]?ranked[0].first_name+' '+ranked[0].last_name:'-'}</div></div>`;
    renderLadder();
  }catch(e){document.getElementById('ladder-table').innerHTML=`<div class="empty">Error: ${e.message}</div>`;}
};

const renderLadder=()=>{
  const filter=document.getElementById('gender-filter').value;
  const players=(allPlayers._ranked||[]).filter(p=>filter==='all'||p.gender===filter);
  if(!players.length){document.getElementById('ladder-table').innerHTML='<div class="empty">No players in this ladder yet.</div>';return;}
  const rows=players.map((p,i)=>{
    const rc=i===0?'top1':i===1?'top2':i===2?'top3':'';
    return `<tr>
      <td><span class="rank-badge ${rc}">${i+1}</span></td>
      <td style="font-weight:700">${p.first_name} ${p.last_name}</td>
      <td style="color:var(--text-muted)">${p.gender||'-'}</td>
      <td><span class="points-pill">${p._points} pts</span></td>
    </tr>`;
  }).join('');
  document.getElementById('ladder-table').innerHTML=`
    <table>
      <thead><tr><th>Rank</th><th>Player</th><th>Gender</th><th>Points</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
};

// ─── SESSIONS ────────────────────────────────────────────────────────
const loadSessions=async()=>{
  if(!currentLadder){document.getElementById('sessions-list').innerHTML='<div class="empty">Please select a ladder first.</div>';return;}
  try{
    const matches=await api(`matches?select=*,players(first_name,last_name)&ladder_id=eq.${currentLadder.id}&order=session_date.desc,court_group,game_number`);
    if(!matches.length){document.getElementById('sessions-list').innerHTML='<div class="empty">No sessions recorded yet.</div>';return;}
    const grouped={};
    matches.forEach(m=>{
      const key=`${m.session_date}__${m.court_group}`;
      if(!grouped[key])grouped[key]={date:m.session_date,group:m.court_group,games:{}};
      if(!grouped[key].games[m.game_number])grouped[key].games[m.game_number]=[];
      grouped[key].games[m.game_number].push(m);
    });
    let html='';
    Object.values(grouped).forEach(s=>{
      const date=new Date(s.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
      const sessionKey=`${s.date}__${s.court_group}`;
      html+=`<div style="margin-bottom:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:800;color:var(--blue);text-transform:uppercase;letter-spacing:1px">${date} — Court ${s.group}</div>
        </div>`;
      Object.entries(s.games).forEach(([gnum,players])=>{
        const gameIds=players.map(p=>p.id).join(',');
        html+=`<div style="margin-bottom:6px;padding:10px 12px;background:var(--bg);border-radius:var(--radius-sm);font-size:13px;border-left:3px solid var(--lime);">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
              <span style="font-weight:800;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-right:4px;">Game ${gnum}</span>`;
        players.forEach(p=>{
          const name=p.players?`${p.players.first_name} ${p.players.last_name}`:'Unknown';
          const score=p.score_for!==null?`${p.score_for}-${p.score_against}`:'-';
          const pts=p.default_no_show?'-1':`+${p.points_earned}`;
          const color=p.default_no_show?'var(--orange)':'var(--teal)';
          html+=`<span style="margin-right:10px;font-weight:500">${name} <span style="color:${color};font-weight:700">${score}/${pts}pts</span></span>`;
        });
        html+=`</div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn btn-outline btn-sm" data-action="editGame" data-gameids="${gameIds}" data-gnum="${gnum}" data-date="${s.date}" data-court="${s.group}">Edit</button>
            </div>
          </div>
        </div>`;
      });
      html+=`</div>`;
    });
    document.getElementById('sessions-list').innerHTML=html;
  }catch(e){document.getElementById('sessions-list').innerHTML=`<div class="empty">Error: ${e.message}</div>`;}
};

const deleteGame=async(btn)=>{
  const ids=btn.dataset.gameids.split(',').filter(Boolean);
  const gnum=btn.dataset.gnum;
  const date=new Date(btn.dataset.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  if(!confirm(`Delete Game ${gnum} from ${date}? This cannot be undone.`))return;
  try{
    for(const id of ids) await api(`matches?id=eq.${id}`,'DELETE');
    toast(`Game ${gnum} deleted.`);
    loadSessions();
  }catch(e){toast(`Error: ${e.message}`,true);}
};

const editGame=async(btn)=>{
  const ids=btn.dataset.gameids.split(',').filter(Boolean);
  const gnum=btn.dataset.gnum;
  const date=btn.dataset.date;
  const court=btn.dataset.court;
  const rows=await api(`matches?id=in.(${ids.join(',')})&select=*,players(first_name,last_name)`);
  if(!rows.length){toast('Could not load game data.',true);return;}
  const isVoided=rows[0].score_for===null;
  const modalBody=document.getElementById('edit-game-body');
  modalBody.innerHTML=`
    <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;">
      Game ${gnum} — ${new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} — Court ${court}
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer;padding:10px 14px;background:var(--orange-light);border-radius:var(--radius-sm);font-size:13px;font-weight:700;color:var(--orange);">
      <input type="checkbox" id="eg-void-game" ${isVoided?'checked':''} onchange="toggleEditGameVoid()"> Void this game (0 points for all players)
    </label>
    <div id="eg-scores-section" style="${isVoided?'opacity:0.4;pointer-events:none;':''}">
      <div style="font-size:11px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Scores per player</div>
      ${rows.map(r=>`
        <div style="padding:10px 0;border-bottom:0.5px solid var(--border);">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;">${r.players?r.players.first_name+' '+r.players.last_name:'Unknown'}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div class="form-group">
              <label>Score for</label>
              <input type="number" min="0" max="11" id="eg-sf-${r.id}" value="${r.score_for!==null?r.score_for:''}" placeholder="0">
            </div>
            <div class="form-group">
              <label>Score against</label>
              <input type="number" min="0" max="11" id="eg-sa-${r.id}" value="${r.score_against!==null?r.score_against:''}" placeholder="0">
            </div>
            <div class="form-group">
              <label>Points earned</label>
              <input type="number" min="-1" max="4" id="eg-pts-${r.id}" value="${r.points_earned!==null?r.points_earned:0}" placeholder="0">
            </div>
          </div>
        </div>`).join('')}
    </div>
    <input type="hidden" id="eg-ids" value="${ids.join(',')}">
  `;
  document.getElementById('edit-game-modal').classList.add('open');
};

const toggleEditGameVoid=()=>{
  const isVoid=document.getElementById('eg-void-game').checked;
  const section=document.getElementById('eg-scores-section');
  section.style.opacity=isVoid?'0.4':'1';
  section.style.pointerEvents=isVoid?'none':'auto';
};

const saveEditGame=async(e)=>{
  e.preventDefault();
  const ids=document.getElementById('eg-ids').value.split(',').filter(Boolean);
  const isVoid=document.getElementById('eg-void-game').checked;
  try{
    for(const id of ids){
      const sf=document.getElementById(`eg-sf-${id}`);
      const sa=document.getElementById(`eg-sa-${id}`);
      const pts=document.getElementById(`eg-pts-${id}`);
      const body={
        score_for:isVoid?null:(sf&&sf.value!==''?parseInt(sf.value):null),
        score_against:isVoid?null:(sa&&sa.value!==''?parseInt(sa.value):null),
        points_earned:isVoid?0:(pts&&pts.value!==''?parseInt(pts.value):0),
      };
      await api(`matches?id=eq.${id}`,'PATCH',body);
    }
    toast('Game updated successfully!');
    document.getElementById('edit-game-modal').classList.remove('open');
    loadSessions();
  }catch(e){toast(`Error: ${e.message}`,true);}
};

// ─── RECORD SESSION ──────────────────────────────────────────────────
const calcPoints=(sf,sa)=>{
  if(sf>sa)return 4;
  const d=sa-sf;
  if(d<=2)return 3;if(d<=4)return 2;if(d<=8)return 1;return 0;
};

const initEntry=async()=>{
  courtPlayers=[];gameCount=0;extraGameCount=0;extraGames=[];
  document.getElementById('session-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('court-number').value='';
  document.getElementById('court-players-list').innerHTML='';
  document.getElementById('games-container').innerHTML='';
  document.getElementById('games-setup-card').style.display='none';
  document.getElementById('save-btn-wrap').style.display='none';
  document.getElementById('player-search-entry').value='';
  const psl=document.getElementById('player-dropdown-list');
  if(psl)psl.innerHTML='';
  if(!currentLadder){
    document.getElementById('entry-no-ladder').style.display='block';
    document.getElementById('entry-form').style.display='none';
  } else {
    document.getElementById('entry-no-ladder').style.display='none';
    document.getElementById('entry-form').style.display='block';
    if(!allPlayers.length)allPlayers=await api('players?select=*&order=first_name');
    if(!ladderPlayers.length)await loadLadderPlayers();
    renderPlayerDropdown('');
  }
};

const renderPlayerDropdown=(filter='')=>{
  const list=document.getElementById('player-dropdown-list');
  if(!list)return;
  const matches=ladderPlayers
    .filter(p=>!courtPlayers.find(cp=>cp.id===p.id))
    .filter(p=>!filter||`${p.first_name} ${p.last_name}`.toLowerCase().includes(filter.toLowerCase()));
  if(!matches.length){
    list.innerHTML=`<div style="padding:12px 14px;font-size:13px;color:var(--text-muted);text-align:center;">${filter?'No players found':'All players added'}</div>`;
    return;
  }
  list.innerHTML=matches.map(p=>`
    <div data-action="addCourtPlayerBtn" data-pid="${p.id}"
      style="padding:10px 14px;cursor:pointer;font-size:13px;font-weight:600;border-bottom:0.5px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <span>${p.first_name} ${p.last_name}</span>
      ${p.status==='sub'?'<span style="font-size:10px;font-weight:700;background:var(--orange-light);color:var(--orange);padding:2px 7px;border-radius:99px;">Sub</span>':''}
    </div>`).join('');
};

const searchPlayersEntry=()=>{
  const q=document.getElementById('player-search-entry').value;
  renderPlayerDropdown(q);
};

const addCourtPlayer=(id)=>{
  if(courtPlayers.length>=5){toast('Maximum 5 players per court.',true);return;}
  const p=ladderPlayers.find(x=>x.id===id);
  if(!p||courtPlayers.find(cp=>cp.id===id))return;
  courtPlayers.push(p);
  document.getElementById('player-search-entry').value='';
  renderPlayerDropdown('');
  renderCourtPlayers();
};

const removeCourtPlayer=(id)=>{
  courtPlayers=courtPlayers.filter(p=>p.id!==id);
  renderPlayerDropdown(document.getElementById('player-search-entry')?.value||'');
  renderCourtPlayers();
  if(courtPlayers.length<4){
    document.getElementById('games-setup-card').style.display='none';
    document.getElementById('save-btn-wrap').style.display='none';
  }
};

const renderCourtPlayers=()=>{
  const el=document.getElementById('court-players-list');
  if(!courtPlayers.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
    ${courtPlayers.map((p,i)=>`
      <div style="display:flex;align-items:center;gap:8px;background:var(--blue-pale);border:0.5px solid var(--border);border-radius:var(--radius-sm);padding:7px 12px;">
        <span style="width:22px;height:22px;background:var(--blue);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;">${i+1}</span>
        <span style="font-size:13px;font-weight:600;">${p.first_name} ${p.last_name}</span>
        <button onclick="removeCourtPlayer(${p.id})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;line-height:1;padding:0 2px;">&times;</button>
      </div>`).join('')}
  </div>`;
  if(courtPlayers.length>=4)buildGames();
};

const getRoundRobinMatchups=(n)=>{
  if(n===4)return[
    {teamA:[0,1],teamB:[2,3],sit:null},  // R1: 1&2 vs 3&4
    {teamA:[0,3],teamB:[1,2],sit:null},  // R2: 1&4 vs 2&3
    {teamA:[1,3],teamB:[0,2],sit:null},  // R3: 2&4 vs 1&3
  ];
  if(n===5)return[
    {teamA:[0,1],teamB:[2,3],sit:4},  // R1: 1&2 vs 3&4, bye=5
    {teamA:[0,4],teamB:[1,2],sit:3},  // R2: 1&5 vs 2&3, bye=4
    {teamA:[3,4],teamB:[0,2],sit:1},  // R3: 4&5 vs 1&3, bye=2
    {teamA:[1,3],teamB:[2,4],sit:0},  // R4: 2&4 vs 3&5, bye=1
    {teamA:[0,3],teamB:[1,4],sit:2},  // R5: 1&4 vs 2&5, bye=3
  ];
  return[];
};

const buildGames=()=>{
  const matchups=getRoundRobinMatchups(courtPlayers.length);
  gameCount=matchups.length;
  extraGameCount=0;extraGames=[];
  const container=document.getElementById('games-container');
  container.innerHTML='';
  matchups.forEach((m,i)=>renderGameCard(i+1,m,false));
  if(courtPlayers.length===4){
    const g4=document.createElement('div');
    g4.id='game-card-4';
    g4.style.cssText='border:2px solid var(--lime);border-radius:var(--radius-sm);margin-bottom:12px;overflow:hidden;';
    g4.innerHTML=`
      <div style="background:var(--lime);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--lime-dark);">Game 4 — Closest scores</span>
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:var(--lime-dark);font-weight:700;text-transform:uppercase;letter-spacing:.5px;">
          <input type="checkbox" id="void-4" onchange="toggleVoid(4)"> Void
        </label>
      </div>
      <div style="padding:10px 14px;background:var(--bg);font-size:12px;color:var(--text-muted);font-weight:500;">
        After the 3 games, match the 2 players with the closest total scores on each team.
      </div>
      <div id="game-body-4" style="padding:14px;">
        <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:12px;">
          <div style="background:var(--blue-pale);border-radius:var(--radius-sm);padding:12px;">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--blue);margin-bottom:8px;">Team A</div>
            <select id="extraA1-4" style="width:100%;margin-bottom:6px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${courtPlayers.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
            <select id="extraA2-4" style="width:100%;margin-bottom:8px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${courtPlayers.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreA-4" oninput="autoCalcExtraGame(4)" style="width:100%;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
          </div>
          <div style="font-size:16px;font-weight:800;color:var(--text-muted);padding-top:40px;">VS</div>
          <div style="background:var(--teal-light);border-radius:var(--radius-sm);padding:12px;">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:8px;">Team B</div>
            <select id="extraB1-4" style="width:100%;margin-bottom:6px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${courtPlayers.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
            <select id="extraB2-4" style="width:100%;margin-bottom:8px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${courtPlayers.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreB-4" oninput="autoCalcExtraGame(4)" style="width:100%;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
          </div>
        </div>
        <div id="pts-preview-4" style="margin-top:10px;font-size:12px;color:var(--text-muted);text-align:center;font-weight:500;"></div>
        <input type="hidden" id="teamA-ids-4" value=""><input type="hidden" id="teamB-ids-4" value="">
      </div>`;
    container.appendChild(g4);
    gameCount=3;extraGames=[4];
  }
  document.getElementById('games-setup-card').style.display='block';
  document.getElementById('save-btn-wrap').style.display='block';
};

const renderGameCard=(gameNum,matchup,isExtra)=>{
  const container=document.getElementById('games-container');
  const div=document.createElement('div');
  div.id=`game-card-${gameNum}`;
  div.style.cssText='border:0.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px;overflow:hidden;';
  const tA=matchup?matchup.teamA.map(i=>courtPlayers[i]):[];
  const tB=matchup?matchup.teamB.map(i=>courtPlayers[i]):[];
  const sitting=matchup&&matchup.sit!==null?courtPlayers[matchup.sit]:null;
  const teamANames=tA.map(p=>`${p.first_name} ${p.last_name}`).join(' & ')||'Team A';
  const teamBNames=tB.map(p=>`${p.first_name} ${p.last_name}`).join(' & ')||'Team B';
  const teamAIds=tA.map(p=>p.id);
  const teamBIds=tB.map(p=>p.id);
  div.innerHTML=`
    <div style="background:var(--blue);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--lime);">Game ${gameNum}${isExtra?' (extra)':''}</span>
      <div style="display:flex;align-items:center;gap:12px;">
        ${sitting?`<span style="font-size:11px;color:var(--blue-light);font-weight:500;">Sitting out: <strong style="color:white;">${sitting.first_name} ${sitting.last_name}</strong></span>`:''}
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:var(--orange-light);font-weight:700;text-transform:uppercase;letter-spacing:.5px;">
          <input type="checkbox" id="void-${gameNum}" onchange="toggleVoid(${gameNum})"> Void
        </label>
        ${isExtra?`<button class="btn btn-danger btn-sm" onclick="removeExtraGame(${gameNum})">Remove</button>`:''}
      </div>
    </div>
    <div id="game-body-${gameNum}" style="padding:14px;">
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;">
        <div style="background:var(--blue-pale);border-radius:var(--radius-sm);padding:12px;text-align:center;">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--blue);margin-bottom:6px;">Team A</div>
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;min-height:36px;">${teamANames}</div>
          <input type="number" min="0" max="11" placeholder="Score" id="scoreA-${gameNum}" oninput="autoCalcGame(${gameNum})" style="width:80px;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
        </div>
        <div style="font-size:16px;font-weight:800;color:var(--text-muted);">VS</div>
        <div style="background:var(--teal-light);border-radius:var(--radius-sm);padding:12px;text-align:center;">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:6px;">Team B</div>
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;min-height:36px;">${teamBNames}</div>
          <input type="number" min="0" max="11" placeholder="Score" id="scoreB-${gameNum}" oninput="autoCalcGame(${gameNum})" style="width:80px;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
        </div>
      </div>
      <div id="pts-preview-${gameNum}" style="margin-top:10px;font-size:12px;color:var(--text-muted);text-align:center;font-weight:500;"></div>
    </div>
    <input type="hidden" id="teamA-ids-${gameNum}" value="${teamAIds.join(',')}">
    <input type="hidden" id="teamB-ids-${gameNum}" value="${teamBIds.join(',')}">`;
  container.appendChild(div);
};

const toggleVoid=(gameNum)=>{
  const isVoided=document.getElementById(`void-${gameNum}`).checked;
  const body=document.getElementById(`game-body-${gameNum}`);
  if(isVoided){
    body.style.opacity='0.4';body.style.pointerEvents='none';
    document.getElementById(`pts-preview-${gameNum}`).innerHTML='<span style="color:var(--orange);font-weight:700;">Game voided — 0 points for both teams</span>';
  }else{body.style.opacity='1';body.style.pointerEvents='auto';autoCalcGame(gameNum);}
};

const autoCalcGame=(gameNum)=>{
  const sA=document.getElementById(`scoreA-${gameNum}`);
  const sB=document.getElementById(`scoreB-${gameNum}`);
  const preview=document.getElementById(`pts-preview-${gameNum}`);
  if(!sA||!sB||sA.value===''||sB.value===''){preview.textContent='';return;}
  const a=parseInt(sA.value),b=parseInt(sB.value);
  const ptA=calcPoints(a,b),ptB=calcPoints(b,a);
  const tAIds=document.getElementById(`teamA-ids-${gameNum}`).value.split(',').filter(Boolean);
  const tBIds=document.getElementById(`teamB-ids-${gameNum}`).value.split(',').filter(Boolean);
  const tANames=tAIds.map(id=>allPlayers.find(p=>p.id==id)).filter(Boolean).map(p=>p.first_name).join(' & ');
  const tBNames=tBIds.map(id=>allPlayers.find(p=>p.id==id)).filter(Boolean).map(p=>p.first_name).join(' & ');
  const aColor=ptA>ptB?'var(--teal)':'var(--orange)';
  const bColor=ptB>ptA?'var(--teal)':'var(--orange)';
  preview.innerHTML=`<span style="color:${aColor};font-weight:700;">${tANames||'Team A'}: ${ptA>0?'+':''}${ptA} pts</span> &nbsp;|&nbsp; <span style="color:${bColor};font-weight:700;">${tBNames||'Team B'}: ${ptB>0?'+':''}${ptB} pts</span>`;
};

const autoCalcExtraGame=(gameNum)=>{
  const sA=document.getElementById(`scoreA-${gameNum}`);
  const sB=document.getElementById(`scoreB-${gameNum}`);
  const preview=document.getElementById(`pts-preview-${gameNum}`);
  if(!sA||!sB||sA.value===''||sB.value===''){preview.textContent='';return;}
  const a=parseInt(sA.value),b=parseInt(sB.value);
  const ptA=calcPoints(a,b),ptB=calcPoints(b,a);
  const aColor=ptA>ptB?'var(--teal)':'var(--orange)';
  const bColor=ptB>ptA?'var(--teal)':'var(--orange)';
  preview.innerHTML=`<span style="color:${aColor};font-weight:700;">Team A: ${ptA>0?'+':''}${ptA} pts</span> &nbsp;|&nbsp; <span style="color:${bColor};font-weight:700;">Team B: ${ptB>0?'+':''}${ptB} pts</span>`;
};

const addExtraGame=()=>{
  extraGameCount++;
  const gameNum=100+extraGameCount;
  extraGames.push(gameNum);
  const container=document.getElementById('games-container');
  const div=document.createElement('div');
  div.id=`game-card-${gameNum}`;
  div.style.cssText='border:0.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px;overflow:hidden;';
  div.innerHTML=`
    <div style="background:var(--blue);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--lime);">Extra game</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:var(--orange-light);font-weight:700;text-transform:uppercase;letter-spacing:.5px;">
          <input type="checkbox" id="void-${gameNum}" onchange="toggleVoid(${gameNum})"> Void
        </label>
        <button class="btn btn-danger btn-sm" onclick="removeExtraGame(${gameNum})">Remove</button>
      </div>
    </div>
    <div id="game-body-${gameNum}" style="padding:14px;">
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:12px;">
        <div style="background:var(--blue-pale);border-radius:var(--radius-sm);padding:12px;">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--blue);margin-bottom:8px;">Team A</div>
          <select id="extraA1-${gameNum}" style="width:100%;margin-bottom:6px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${ladderPlayers.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
          <select id="extraA2-${gameNum}" style="width:100%;margin-bottom:8px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${ladderPlayers.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
          <input type="number" min="0" max="11" placeholder="Score" id="scoreA-${gameNum}" oninput="autoCalcExtraGame(${gameNum})" style="width:100%;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
        </div>
        <div style="font-size:16px;font-weight:800;color:var(--text-muted);padding-top:36px;">VS</div>
        <div style="background:var(--teal-light);border-radius:var(--radius-sm);padding:12px;">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:8px;">Team B</div>
          <select id="extraB1-${gameNum}" style="width:100%;margin-bottom:6px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${ladderPlayers.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
          <select id="extraB2-${gameNum}" style="width:100%;margin-bottom:8px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${ladderPlayers.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
          <input type="number" min="0" max="11" placeholder="Score" id="scoreB-${gameNum}" oninput="autoCalcExtraGame(${gameNum})" style="width:100%;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
        </div>
      </div>
      <div id="pts-preview-${gameNum}" style="margin-top:10px;font-size:12px;color:var(--text-muted);text-align:center;font-weight:500;"></div>
      <input type="hidden" id="teamA-ids-${gameNum}" value=""><input type="hidden" id="teamB-ids-${gameNum}" value="">
    </div>`;
  container.appendChild(div);
};

const removeExtraGame=(gameNum)=>{
  document.getElementById(`game-card-${gameNum}`).remove();
  extraGames=extraGames.filter(g=>g!==gameNum);
};

const submitSession=async()=>{
  if(!currentLadder){toast('Please select a ladder first.',true);return;}
  const date=document.getElementById('session-date').value;
  const courtNum=document.getElementById('court-number').value;
  if(!date||!courtNum){toast('Please fill in session date and court number.',true);return;}
  if(!courtPlayers.length){toast('Please add players to the court.',true);return;}
  const rows=[];
  const allGameNums=[...Array(gameCount).keys()].map(i=>i+1).concat(extraGames);

  // Validate all scores are entered unless game is voided
  const missingScores=[];
  for(const gameNum of allGameNums){
    const isVoided=document.getElementById(`void-${gameNum}`)?.checked||false;
    if(isVoided)continue;
    const sA=document.getElementById(`scoreA-${gameNum}`);
    const sB=document.getElementById(`scoreB-${gameNum}`);
    if(!sA||sA.value===''||!sB||sB.value===''){
      missingScores.push(gameNum);
    }
  }
  if(missingScores.length){
    toast(`Please enter scores for Game${missingScores.length>1?'s':''} ${missingScores.join(', ')} or mark ${missingScores.length>1?'them':'it'} as void.`,true);
    return;
  }

  for(const gameNum of allGameNums){
    const sA=document.getElementById(`scoreA-${gameNum}`);
    const sB=document.getElementById(`scoreB-${gameNum}`);
    if(!sA||sA.value==='')continue;
    const scoreA=parseInt(sA.value);
    const scoreB=parseInt(sB?.value||0);
    const isVoided=document.getElementById(`void-${gameNum}`)?.checked||false;
    const ptA=isVoided?0:calcPoints(scoreA,scoreB);
    const ptB=isVoided?0:calcPoints(scoreB,scoreA);
    let tAIds,tBIds;
    const isExtraGame=gameNum>100||(gameNum===4&&courtPlayers.length===4);
    if(isExtraGame){
      tAIds=[document.getElementById(`extraA1-${gameNum}`)?.value,document.getElementById(`extraA2-${gameNum}`)?.value].filter(Boolean).map(Number);
      tBIds=[document.getElementById(`extraB1-${gameNum}`)?.value,document.getElementById(`extraB2-${gameNum}`)?.value].filter(Boolean).map(Number);
    }else{
      tAIds=document.getElementById(`teamA-ids-${gameNum}`)?.value.split(',').filter(Boolean).map(Number)||[];
      tBIds=document.getElementById(`teamB-ids-${gameNum}`)?.value.split(',').filter(Boolean).map(Number)||[];
    }
    tAIds.forEach(pid=>{if(!pid)return;rows.push({session_date:date,court_group:parseInt(courtNum),player_id:pid,game_number:gameNum,score_for:isVoided?null:scoreA,score_against:isVoided?null:scoreB,points_earned:ptA,is_sub:ladderPlayers.find(p=>p.id===pid)?.status==='sub',default_no_show:false,ladder_id:currentLadder.id});});
    tBIds.forEach(pid=>{if(!pid)return;rows.push({session_date:date,court_group:parseInt(courtNum),player_id:pid,game_number:gameNum,score_for:isVoided?null:scoreB,score_against:isVoided?null:scoreA,points_earned:ptB,is_sub:ladderPlayers.find(p=>p.id===pid)?.status==='sub',default_no_show:false,ladder_id:currentLadder.id});});
  }
  if(!rows.length){toast('No scores entered yet.',true);return;}
  try{
    await api('matches','POST',rows);
    toast(`Session saved! ${rows.length} entries recorded.`);
    initEntry();
  }catch(e){toast(`Error: ${e.message}`,true);}
};

// ─── PLAYERS ─────────────────────────────────────────────────────────
const filterPlayers=()=>{
  const q=document.getElementById('player-search').value.toLowerCase().trim();
  document.querySelectorAll('#players-table tbody tr').forEach(row=>{
    const name=row.querySelector('td')?.textContent.toLowerCase()||'';
    row.style.display=name.includes(q)?'':'none';
  });
};

const loadPlayers=async()=>{
  try{
    allPlayers=await api('players?select=*&order=first_name');
    if(!allPlayers.length){document.getElementById('players-table').innerHTML='<div class="empty">No players yet.</div>';return;}
    const rows=allPlayers.map(p=>`
      <tr>
        <td style="font-weight:700">${p.first_name} ${p.last_name}</td>
        <td style="color:var(--text-muted)">${p.gender||'-'}</td>
        <td style="color:var(--text-muted)">${p.email||'-'}</td>
        <td style="color:var(--text-muted)">${p.phone||'-'}</td>
        <td><span class="badge badge-${p.status}">${p.status}</span></td>
        <td style="color:var(--text-muted)">${p.date_joined?new Date(p.date_joined+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'-'}</td>
        <td><button class="btn btn-outline btn-sm" onclick="openEdit(${p.id})">Edit</button></td>
      </tr>`).join('');
    document.getElementById('players-table').innerHTML=`
      <table><thead><tr><th>Name</th><th>Gender</th><th>Email</th><th>Phone</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }catch(e){document.getElementById('players-table').innerHTML=`<div class="empty">Error: ${e.message}</div>`;}
};

const initAddPlayer=()=>{
  document.getElementById('p-joined').value=new Date().toISOString().split('T')[0];
};

const addPlayer=async(e)=>{
  e.preventDefault();
  const body={first_name:document.getElementById('p-first').value.trim(),last_name:document.getElementById('p-last').value.trim(),email:document.getElementById('p-email').value.trim()||null,phone:document.getElementById('p-phone').value.trim()||null,gender:document.getElementById('p-gender').value||null,status:document.getElementById('p-status').value,date_joined:document.getElementById('p-joined').value||null,current_rank:999};
  try{
    await api('players','POST',body);
    toast(`${body.first_name} ${body.last_name} added successfully!`);
    e.target.reset();
    document.getElementById('p-joined').value=new Date().toISOString().split('T')[0];
    allPlayers=[];
  }catch(e){toast(`Error: ${e.message}`,true);}
};

const openEdit=(id)=>{
  const p=allPlayers.find(x=>x.id===id);if(!p)return;
  document.getElementById('edit-id').value=p.id;
  document.getElementById('edit-first').value=p.first_name;
  document.getElementById('edit-last').value=p.last_name;
  document.getElementById('edit-email').value=p.email||'';
  document.getElementById('edit-phone').value=p.phone||'';
  document.getElementById('edit-gender').value=p.gender||'';
  document.getElementById('edit-status').value=p.status||'active';
  document.getElementById('edit-modal').classList.add('open');
};

const closeModal=()=>document.getElementById('edit-modal').classList.remove('open');

const saveEditPlayer=async(e)=>{
  e.preventDefault();
  const id=document.getElementById('edit-id').value;
  const body={first_name:document.getElementById('edit-first').value.trim(),last_name:document.getElementById('edit-last').value.trim(),email:document.getElementById('edit-email').value.trim()||null,phone:document.getElementById('edit-phone').value.trim()||null,gender:document.getElementById('edit-gender').value||null,status:document.getElementById('edit-status').value};
  try{
    await api(`players?id=eq.${id}`,'PATCH',body);
    toast('Player updated!');closeModal();loadPlayers();allPlayers=[];
  }catch(e){toast(`Error: ${e.message}`,true);}
};

// ─── INIT ─────────────────────────────────────────────────────────────
document.getElementById('last-updated').textContent=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

// Single delegated listener handles all button clicks
document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const action = btn.dataset.action;
  const page = btn.dataset.page;
  if(action==='showPage' && page) showPage(page, btn);
  if(action==='addCourtPlayerBtn'){const pid=parseInt(btn.dataset.pid);addCourtPlayer(pid);}
  if(action==='addExtraGame') addExtraGame();
  if(action==='editGame') editGame(btn);
  if(action==='submitSession') submitSession();
  if(action==='closeEditLadderModal') closeEditLadderModal();
  if(action==='closeModal') closeModal();
  if(action==='closeEditGameModal') document.getElementById('edit-game-modal').classList.remove('open');
  if(action==='addToLadder') addToLadder();
  if(action==='closeLpModal') closeLpModal();
  if(action==='switchTab') switchMainTab(btn.dataset.tab);
});

document.getElementById('tab-programs').dataset.action='switchTab';
document.getElementById('tab-programs').dataset.tab='programs';
document.getElementById('tab-management').dataset.action='switchTab';
document.getElementById('tab-management').dataset.tab='management';
document.getElementById('edit-game-form').addEventListener('submit',saveEditGame);

loadLadderSelector().then(()=>loadLadder());

