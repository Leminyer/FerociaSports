
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
let noShowPlayer=null;
let noShowPenalty=-4;
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
  // Also show/hide the program sub-options based on current prog tab
  const ladderOpts=document.getElementById('subnav-ladder-options');
  const tournOpts=document.getElementById('subnav-tournament-options');
  if(tab==='programs'){
    const progTab=document.getElementById('prog-tab-ladder').classList.contains('active')?'ladder':'tournament';
    if(ladderOpts) ladderOpts.style.display=progTab==='ladder'?'flex':'none';
    if(tournOpts) tournOpts.style.display=progTab==='tournament'?'flex':'none';
    if(progTab==='ladder'){
      showPage('ladder',document.querySelector('#subnav-ladder-options button[data-page="ladder"]'));
    }
  } else {
    if(ladderOpts) ladderOpts.style.display='none';
    if(tournOpts) tournOpts.style.display='none';
    const activeBtn=document.querySelector('#subnav-management button.active');
    if(activeBtn) showPage(activeBtn.dataset.page,activeBtn);
    else showPage('players',document.querySelector('#subnav-management button'));
  }
};

const switchProgramTab=(tab)=>{
  const ladderOpts=document.getElementById('subnav-ladder-options');
  const tournOpts=document.getElementById('subnav-tournament-options');
  document.getElementById('prog-tab-ladder').classList.toggle('active',tab==='ladder');
  document.getElementById('prog-tab-tournament').classList.toggle('active',tab==='tournament');
  ladderOpts.style.display=tab==='ladder'?'flex':'none';
  tournOpts.style.display=tab==='tournament'?'flex':'none';
  if(tab==='ladder'){
    showPage('ladder',document.querySelector('#subnav-ladder-options button[data-page="ladder"]'));
  } else {
    loadTournamentSelector();
    showPage('tournament-view',document.querySelector('#subnav-tournament-options button[data-page="tournament-view"]'));
  }
};

const loadTournamentSelector=async()=>{
  const sel=document.getElementById('tournament-selector');
  if(!sel)return;
  const tournaments=await api('tournaments?select=*&order=id.desc');
  sel.innerHTML='<option value="">-- Select a tournament --</option>'+
    tournaments.map(t=>`<option value="${t.id}">${t.name}${t.status==='completed'?' (completed)':''}</option>`).join('');
};

const onTournamentChange=async()=>{
  const tid=document.getElementById('tournament-selector').value;
  if(!tid){document.getElementById('tournament-view-content').innerHTML='<div class="empty">Select a tournament to view details.</div>';return;}
  currentTournamentId=parseInt(tid);
  await renderTournamentViewReadOnly();
};

const renderTournamentViewReadOnly=async()=>{
  const el=document.getElementById('tournament-view-content');
  el.innerHTML='<div class="loading">Loading tournament...</div>';
  const [tArr,teams,matches]=await Promise.all([
    api(`tournaments?id=eq.${currentTournamentId}&select=*`),
    api(`tournament_teams?tournament_id=eq.${currentTournamentId}&select=*`),
    api(`tournament_matches?tournament_id=eq.${currentTournamentId}&select=*&order=round,id`)
  ]);
  const t=tArr[0]; if(!t)return;
  const categoryLabel=CATEGORY_LABELS[t.category]||t.category;
  const date=t.date?new Date(t.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'}):'No date set';
  const rrMatches=matches.filter(m=>m.phase==='round_robin');
  const finalsMatches=matches.filter(m=>m.phase==='finals');
  const standings=calcTournamentStandings(teams,rrMatches);
  const tMap={};teams.forEach(t=>tMap[t.id]=t.name);

  let html=`
    <div class="card">
      <div style="font-size:18px;font-weight:800;">${t.name}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;font-weight:600;">${categoryLabel} · ${date}</div>
    </div>`;

  // Standings
  if(standings.length){
    html+=`<div class="card"><div class="card-title">Standings</div>${renderStandingsTable(standings)}</div>`;
  }

  // Round robin matches
  if(rrMatches.length){
    html+=`<div class="card"><div class="card-title">Round Robin Results</div>${renderRRMatchTable(rrMatches,teams)}</div>`;
  }

  // Finals
  if(finalsMatches.length&&t.finals_format){
    html+=`<div class="card"><div class="card-title">Finals</div>${renderFinalsSection(finalsMatches,teams,t,standings)}</div>`;
  }

  el.innerHTML=html||'<div class="empty">No data yet for this tournament.</div>';
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
  if(name==='share')loadSharePage();
  if(name==='tournaments')loadTournamentsPage();
  if(name==='tournament-view'){const el=document.getElementById('tournament-view-content');if(el&&!currentTournamentId)el.innerHTML='<div class="empty">Select a tournament from the dropdown above.</div>';}
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
  const ladderNavBtns=document.querySelectorAll('#subnav-ladder-options button[data-page]');
  if(!currentLadder){
    ladderNavBtns.forEach(b=>{if(ladderPages.includes(b.dataset.page))b.disabled=true;});
    ladderPages.forEach(p=>{const el=document.getElementById(`page-${p}`);if(el)el.classList.add('page-disabled');});
    document.getElementById('subnav-ladder-options')?.querySelectorAll('button[data-page]').forEach(b=>{if(ladderPages.includes(b.dataset.page))b.disabled=true;});
    return;
  }
  ladderNavBtns.forEach(b=>b.disabled=false);
  ladderPages.forEach(p=>{const el=document.getElementById(`page-${p}`);if(el)el.classList.remove('page-disabled');});
};

const loadLadderPlayers=async()=>{
  if(!currentLadder){ladderPlayers=[];return;}
  const rows=await api(`ladder_players?select=*,players(*)&ladder_id=eq.${currentLadder.id}`);
  ladderPlayers=rows.map(r=>({
    ...r.players,
    ladder_status: r.status||'active'
  })).filter(Boolean);
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
  const searchEl=document.getElementById('lp-search');
  if(searchEl)searchEl.value='';
  await refreshLadderPlayersModal();
};

const refreshLadderPlayersModal=async()=>{
  const [allP, enrolled] = await Promise.all([
    api('players?select=*&order=first_name'),
    api(`ladder_players?select=ladder_id,player_id,status&ladder_id=eq.${modalLadderId}`)
  ]);
  allPlayers = allP;
  const enrolledIds = enrolled.map(r=>Number(r.player_id));
  const activePlayers = allPlayers.filter(p=>p.status!=='inactive');

  // Build checkbox list for all active players
  const listEl = document.getElementById('lp-enrolled');
  const allChecked = activePlayers.every(p=>enrolledIds.includes(Number(p.id)));

  // Store enrolled IDs for save comparison
  listEl.dataset.enrolledIds = enrolledIds.join(',');

  listEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:2px solid var(--border);background:var(--blue-pale);position:sticky;top:0;z-index:1;">
      <input type="checkbox" id="lp-select-all" ${allChecked?'checked':''} style="width:16px;height:16px;cursor:pointer;" data-action="lpToggleAll">
      <label for="lp-select-all" style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;color:var(--blue);">Select all</label>
      <span style="margin-left:auto;font-size:12px;font-weight:700;color:var(--blue);">${enrolledIds.length} / ${activePlayers.length} enrolled</span>
    </div>
    ${activePlayers.map(p=>{
      const isEnrolled=enrolledIds.includes(Number(p.id));
      const enrolledRow=enrolled.find(r=>Number(r.player_id)===Number(p.id));
      const ladderStatus=(enrolledRow&&enrolledRow.status)?enrolledRow.status:'active';
      return `<div class="lp-player-row" data-name="${(p.first_name+' '+p.last_name).toLowerCase()}"
        style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:0.5px solid var(--border);">
        <input type="checkbox" id="lp-cb-${p.id}" ${isEnrolled?'checked':''} style="width:16px;height:16px;cursor:pointer;"
          data-pid="${p.id}">
        <label for="lp-cb-${p.id}" style="font-size:13px;font-weight:600;cursor:pointer;flex:1;">
          ${p.first_name} ${p.last_name}
          <span class="badge badge-${p.status}" style="margin-left:6px;">${p.status}</span>
        </label>
        ${isEnrolled?`<select data-action="lpChangeStatus" data-pid="${p.id}"
          style="font-size:11px;font-weight:700;padding:3px 8px;border:0.5px solid var(--border);border-radius:99px;font-family:Montserrat,sans-serif;background:${ladderStatus==='active'?'var(--teal-light)':'var(--orange-light)'};color:${ladderStatus==='active'?'var(--teal)':'var(--orange)'};cursor:pointer;">
          <option value="active" ${ladderStatus==='active'?'selected':''}>Active</option>
          <option value="sub" ${ladderStatus==='sub'?'selected':''}>Sub</option>
        </select>`:''}
      </div>`;
    }).join('')}`;
};

const lpChangeStatus=async(sel)=>{
  const pid=parseInt(sel.dataset.pid);
  const newStatus=sel.value;
  sel.disabled=true;
  try{
    await api(`ladder_players?ladder_id=eq.${modalLadderId}&player_id=eq.${pid}`,'PATCH',{status:newStatus});
    sel.style.background=newStatus==='active'?'var(--teal-light)':'var(--orange-light)';
    sel.style.color=newStatus==='active'?'var(--teal)':'var(--orange)';
    // Update in-memory ladderPlayers so standings reflect change immediately
    const p=ladderPlayers.find(x=>x.id===pid);
    if(p) p.ladder_status=newStatus;
    toast(`Status updated to ${newStatus}.`);
  }catch(e){toast(`Error: ${e.message}`,true);}
  finally{sel.disabled=false;}
};

const lpSaveChanges=async()=>{
  const listEl=document.getElementById('lp-enrolled');
  const prevEnrolledIds=(listEl.dataset.enrolledIds||'').split(',').filter(Boolean).map(Number);
  const checkboxes=document.querySelectorAll('#lp-enrolled input[type="checkbox"][data-pid]');
  const nowCheckedIds=[...checkboxes].filter(cb=>cb.checked).map(cb=>parseInt(cb.dataset.pid));

  const toAdd=nowCheckedIds.filter(id=>!prevEnrolledIds.includes(id));
  const toRemove=prevEnrolledIds.filter(id=>!nowCheckedIds.includes(id));

  if(!toAdd.length&&!toRemove.length){
    toast('No changes to save.');
    return;
  }
  const saveBtn=document.getElementById('lp-save-btn');
  if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Saving...';}
  try{
    if(toAdd.length) await api('ladder_players','POST',toAdd.map(pid=>({ladder_id:parseInt(modalLadderId),player_id:pid})));
    for(const pid of toRemove) await api(`ladder_players?ladder_id=eq.${modalLadderId}&player_id=eq.${pid}`,'DELETE');
    toast(`Saved! ${toAdd.length} added, ${toRemove.length} removed.`);
    await loadLadderPlayers();
    document.getElementById('lp-modal').classList.remove('open');
  }catch(e){
    toast(`Error: ${e.message}`,true);
  }finally{
    if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Save changes';}
  }
};

const lpToggleAll=(btn)=>{
  const selectAll=btn.checked;
  document.querySelectorAll('#lp-enrolled input[type="checkbox"][data-pid]').forEach(cb=>{
    cb.checked=selectAll;
  });
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
    const ranked=[...ladderPlayers].filter(p=>p.ladder_status==='active').sort((a,b)=>(pm[b.id]||0)-(pm[a.id]||0));
    ranked.forEach((p,i)=>{p._rank=i+1;p._points=pm[p.id]||0;});
    allPlayers._ranked=ranked;
    const sessions=[...new Set(matches.map(m=>m.session_date))];
    const uniqueGames=new Set(matches.map(m=>`${m.session_date}__${m.court_group}__${m.game_number}`)).size;
    document.getElementById('ladder-stats').innerHTML=`
      <div class="stat"><div class="stat-label">Players</div><div class="stat-value">${ladderPlayers.length}</div></div>
      <div class="stat"><div class="stat-label">Sessions</div><div class="stat-value">${sessions.length}</div></div>
      <div class="stat"><div class="stat-label">Games</div><div class="stat-value">${uniqueGames}</div></div>
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
      const sessionMatchIds=Object.values(s.games).flat().map(m=>m.id).join(',');
      html+=`<div style="margin-bottom:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:800;color:var(--blue);text-transform:uppercase;letter-spacing:1px">${date} — Court ${s.group}</div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-outline btn-sm" data-action="editSession" data-matchids="${sessionMatchIds}" data-date="${s.date}" data-court="${s.group}">Edit session</button>
            <button class="btn btn-danger btn-sm" data-action="deleteSession" data-matchids="${sessionMatchIds}" data-date="${s.date}" data-court="${s.group}">Delete session</button>
          </div>
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
          const color=p.default_no_show?'var(--orange)':p.is_sub?'var(--text-muted)':'var(--teal)';
          const subTag=p.is_sub?'<span style="font-size:9px;font-weight:800;background:var(--orange-light);color:var(--orange);padding:1px 5px;border-radius:99px;margin-left:3px;">SUB</span>':'';
          html+=`<span style="margin-right:10px;font-weight:500">${name}${subTag} <span style="color:${color};font-weight:700">${score}/${pts}pts</span></span>`;
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

const editSession=(btn)=>{
  const ids=btn.dataset.matchids.split(',').filter(Boolean);
  const date=btn.dataset.date;
  const court=btn.dataset.court;
  document.getElementById('es-ids').value=ids.join(',');
  document.getElementById('es-date').value=date;
  document.getElementById('es-court').value=court;
  document.getElementById('es-orig-date').value=date;
  document.getElementById('es-orig-court').value=court;
  document.getElementById('edit-session-modal').classList.add('open');
};

const saveEditSession=async(e)=>{
  e.preventDefault();
  const ids=document.getElementById('es-ids').value.split(',').filter(Boolean);
  const newDate=document.getElementById('es-date').value;
  const newCourt=document.getElementById('es-court').value;
  const origDate=document.getElementById('es-orig-date').value;
  const origCourt=document.getElementById('es-orig-court').value;

  if(!newDate||!newCourt){toast('Please fill in both date and court number.',true);return;}

  // Check uniqueness only if date or court changed
  if(newDate!==origDate||newCourt!==origCourt){
    const existing=await api(`matches?session_date=eq.${newDate}&court_group=eq.${newCourt}&ladder_id=eq.${currentLadder.id}&limit=1`);
    if(existing.length){
      const d=new Date(newDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
      toast(`A session already exists for Court ${newCourt} on ${d}. Please choose a different date or court.`,true);
      return;
    }
  }

  const saveBtn=document.getElementById('es-save-btn');
  if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Saving...';}
  try{
    for(const id of ids){
      await api(`matches?id=eq.${id}`,'PATCH',{session_date:newDate,court_group:parseInt(newCourt)});
    }
    toast('Session updated!');
    document.getElementById('edit-session-modal').classList.remove('open');
    loadSessions();
  }catch(e){toast(`Error: ${e.message}`,true);}
  finally{
    if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Save changes';}
  }
};

const deleteSession=async(btn)=>{
  const ids=btn.dataset.matchids.split(',').filter(Boolean);
  const date=new Date(btn.dataset.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  const court=btn.dataset.court;
  if(!confirm(`Delete entire session for ${date} — Court ${court}?\n\nThis will remove all ${ids.length} game records. This cannot be undone.`))return;
  try{
    for(const id of ids) await api(`matches?id=eq.${id}`,'DELETE');
    toast(`Session deleted — ${ids.length} records removed.`);
    loadSessions();
  }catch(e){toast(`Error: ${e.message}`,true);}
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
              <input type="number" min="0" max="11" id="eg-sf-${r.id}" value="${r.score_for!==null?r.score_for:''}" placeholder="0" data-egrid="${r.id}" data-egtype="sf">
            </div>
            <div class="form-group">
              <label>Score against</label>
              <input type="number" min="0" max="11" id="eg-sa-${r.id}" value="${r.score_against!==null?r.score_against:''}" placeholder="0" data-egrid="${r.id}" data-egtype="sa">
            </div>
            <div class="form-group">
              <label>Points earned <span style="font-size:9px;color:var(--teal);">(auto)</span></label>
              <input type="number" min="-1" max="4" id="eg-pts-${r.id}" value="${r.points_earned!==null?r.points_earned:0}" placeholder="0" style="background:var(--bg);" readonly>
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
  courtPlayers=[];noShowPlayer=null;noShowPenalty=-4;gameCount=0;extraGameCount=0;extraGames=[];
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
  if(courtPlayers.length>=6){toast('Maximum 6 players per court.',true);return;}
  const p=ladderPlayers.find(x=>x.id===id);
  if(!p||courtPlayers.find(cp=>cp.id===id))return;
  courtPlayers.push(p);
  document.getElementById('player-search-entry').value='';
  renderPlayerDropdown('');
  renderCourtPlayers();
};

const removeCourtPlayer=(id)=>{
  if(noShowPlayer&&noShowPlayer.id===id) noShowPlayer=null;
  courtPlayers=courtPlayers.filter(p=>p.id!==id);
  renderPlayerDropdown(document.getElementById('player-search-entry')?.value||'');
  renderCourtPlayers();
  if(courtPlayers.filter(p=>!noShowPlayer||p.id!==noShowPlayer.id).length<4){
    document.getElementById('games-setup-card').style.display='none';
    document.getElementById('save-btn-wrap').style.display='none';
  }
};

const markNoShow=(pid)=>{
  noShowPlayer=courtPlayers.find(p=>p.id===parseInt(pid))||null;
  noShowPenalty=-4;
  renderPlayerDropdown(document.getElementById('player-search-entry')?.value||'');
  renderCourtPlayers();
};

const cancelNoShow=()=>{
  noShowPlayer=null;
  noShowPenalty=-4;
  renderCourtPlayers();
};

const renderCourtPlayers=()=>{
  const el=document.getElementById('court-players-list');
  if(!courtPlayers.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
    ${courtPlayers.map((p,i)=>{
      const isNoShow=noShowPlayer&&noShowPlayer.id===p.id;
      const bg=isNoShow?'var(--orange-light)':'var(--blue-pale)';
      const border=isNoShow?'1.5px solid var(--orange)':'0.5px solid var(--border)';
      const numBg=isNoShow?'var(--orange)':'var(--blue)';
      return `<div style="display:flex;align-items:center;gap:8px;background:${bg};border:${border};border-radius:var(--radius-sm);padding:7px 12px;">
        <span style="width:22px;height:22px;background:${numBg};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;">${i+1}</span>
        <span style="font-size:13px;font-weight:600;">${p.first_name} ${p.last_name}</span>
        ${isNoShow
          ?`<span style="font-size:9px;font-weight:800;background:var(--orange);color:white;padding:2px 6px;border-radius:99px;letter-spacing:.5px;">NO-SHOW</span>
            <button data-action="cancelNoShow" style="background:none;border:none;cursor:pointer;color:var(--orange);font-size:12px;font-weight:700;padding:0 2px;">undo</button>`
          :`<button data-action="markNoShow" data-pid="${p.id}" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:10px;font-weight:700;padding:2px 6px;border:0.5px solid var(--border);border-radius:99px;">No-show</button>
            <button data-action="removeCourtPlayerBtn" data-pid="${p.id}" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;line-height:1;padding:0 2px;">&times;</button>`
        }
      </div>`;
    }).join('')}
  </div>
  ${noShowPlayer?`<div style="background:var(--orange-light);border:1.5px solid var(--orange);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <span style="font-size:13px;font-weight:700;color:var(--orange);">${noShowPlayer.first_name} ${noShowPlayer.last_name} did not show up.</span>
    <span style="font-size:12px;color:var(--text-muted);font-weight:500;">Assign penalty:</span>
    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;font-weight:700;color:var(--orange);">
      <input type="radio" name="noshow-penalty" id="ns-penalty" value="-4" ${noShowPenalty===-4?'checked':''}> -4 pts (penalty)
    </label>
    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;font-weight:700;color:var(--text-muted);">
      <input type="radio" name="noshow-penalty" id="ns-excused" value="0" ${noShowPenalty===0?'checked':''}> 0 pts (excused)
    </label>
  </div>`:''}`;
  const activePlayers=courtPlayers.filter(p=>!noShowPlayer||p.id!==noShowPlayer.id);
  if(activePlayers.length>=4)buildGames(activePlayers);
  else{
    document.getElementById('games-setup-card').style.display='none';
    document.getElementById('save-btn-wrap').style.display='none';
  }
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
  if(n===6)return[
    {teamA:[0,1],teamB:[2,3],sit:[4,5]},  // R1: 1&2 vs 3&4, bye=5,6
    {teamA:[1,5],teamB:[0,4],sit:[2,3]},  // R2: 2&6 vs 1&5, bye=3,4
    {teamA:[3,4],teamB:[2,5],sit:[0,1]},  // R3: 4&5 vs 3&6, bye=1,2
    {teamA:[0,2],teamB:[1,4],sit:[3,5]},  // R4: 1&3 vs 2&5, bye=4,6
    {teamA:[3,5],teamB:[1,2],sit:[0,4]},  // R5: 4&6 vs 2&3, bye=1,5
    {teamA:[0,3],teamB:[4,5],sit:[1,2]},  // R6: 1&4 vs 5&6, bye=2,3
  ];
  return[];
};

const buildGames=(activePlayers)=>{
  const players=activePlayers||courtPlayers;
  const matchups=getRoundRobinMatchups(players.length);
  gameCount=matchups.length;
  extraGameCount=0;extraGames=[];
  const container=document.getElementById('games-container');
  container.innerHTML='';
  matchups.forEach((m,i)=>renderGameCard(i+1,m,false,players));
  if(players.length===4){
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
            <select id="extraA1-4" style="width:100%;margin-bottom:6px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${players.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
            <select id="extraA2-4" style="width:100%;margin-bottom:8px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${players.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreA-4" data-egame="4" data-eteam="A" style="width:100%;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
          </div>
          <div style="font-size:16px;font-weight:800;color:var(--text-muted);padding-top:40px;">VS</div>
          <div style="background:var(--teal-light);border-radius:var(--radius-sm);padding:12px;">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:8px;">Team B</div>
            <select id="extraB1-4" style="width:100%;margin-bottom:6px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${players.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
            <select id="extraB2-4" style="width:100%;margin-bottom:8px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${players.map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreB-4" data-egame="4" data-eteam="B" style="width:100%;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
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

const renderGameCard=(gameNum,matchup,isExtra,players)=>{
  const activePl=players||(noShowPlayer?courtPlayers.filter(p=>p.id!==noShowPlayer.id):courtPlayers);
  const container=document.getElementById('games-container');
  const div=document.createElement('div');
  div.id=`game-card-${gameNum}`;
  div.style.cssText='border:0.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px;overflow:hidden;';
  const tA=matchup?matchup.teamA.map(i=>activePl[i]):[];
  const tB=matchup?matchup.teamB.map(i=>activePl[i]):[];
  const sitRaw=matchup?matchup.sit:null;
  const sitting=sitRaw===null?null:Array.isArray(sitRaw)?sitRaw.map(i=>activePl[i]).filter(Boolean):[activePl[sitRaw]].filter(Boolean);
  const teamANames=tA.map(p=>`${p.first_name} ${p.last_name}`).join(' & ')||'Team A';
  const teamBNames=tB.map(p=>`${p.first_name} ${p.last_name}`).join(' & ')||'Team B';
  const teamAIds=tA.map(p=>p.id);
  const teamBIds=tB.map(p=>p.id);
  div.innerHTML=`
    <div style="background:var(--blue);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--lime);">Game ${gameNum}${isExtra?' (extra)':''}</span>
      <div style="display:flex;align-items:center;gap:12px;">
        ${sitting&&sitting.length?`<span style="font-size:11px;color:var(--blue-light);font-weight:500;">Sitting out: <strong style="color:white;">${sitting.map(p=>p.first_name+' '+p.last_name).join(', ')}</strong></span>`:''}
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
          <select id="extraA1-${gameNum}" style="width:100%;margin-bottom:6px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${courtPlayers.filter(p=>!noShowPlayer||p.id!==noShowPlayer.id).map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
          <select id="extraA2-${gameNum}" style="width:100%;margin-bottom:8px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${courtPlayers.filter(p=>!noShowPlayer||p.id!==noShowPlayer.id).map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
          <input type="number" min="0" max="11" placeholder="Score" id="scoreA-${gameNum}" data-egame="${gameNum}" data-eteam="A" style="width:100%;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
        </div>
        <div style="font-size:16px;font-weight:800;color:var(--text-muted);padding-top:36px;">VS</div>
        <div style="background:var(--teal-light);border-radius:var(--radius-sm);padding:12px;">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:8px;">Team B</div>
          <select id="extraB1-${gameNum}" style="width:100%;margin-bottom:6px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${courtPlayers.filter(p=>!noShowPlayer||p.id!==noShowPlayer.id).map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
          <select id="extraB2-${gameNum}" style="width:100%;margin-bottom:8px;font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${courtPlayers.filter(p=>!noShowPlayer||p.id!==noShowPlayer.id).map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}</select>
          <input type="number" min="0" max="11" placeholder="Score" id="scoreB-${gameNum}" data-egame="${gameNum}" data-eteam="B" style="width:100%;text-align:center;font-size:18px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
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
  // Renumber extra games sequentially after regular games
  const extraGameNumbers=extraGames.map((g,i)=>({original:g,display:gameCount+1+i}));
  // Map extra game IDs (101, 102...) to sequential display numbers (4, 5...)
  const extraGameMap={};
  extraGames.forEach((g,i)=>{extraGameMap[g]=gameCount+1+i;});
  const allGameNums=[...Array(gameCount).keys()].map(i=>i+1).concat(extraGames);

  // Validate date + court combination is unique
  const existing=await api(`matches?session_date=eq.${date}&court_group=eq.${courtNum}&ladder_id=eq.${currentLadder.id}&limit=1`);
  if(existing.length){
    const existingDate=new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    toast(`A session for Court ${courtNum} on ${existingDate} already exists. Please edit the existing session or choose a different court/date.`,true);
    return;
  }

  // Validate game 4 (4-player closest scores) has all players selected
  if(courtPlayers.length===4){
    const a1=document.getElementById('extraA1-4')?.value;
    const a2=document.getElementById('extraA2-4')?.value;
    const b1=document.getElementById('extraB1-4')?.value;
    const b2=document.getElementById('extraB2-4')?.value;
    const isVoided4=document.getElementById('void-4')?.checked||false;
    if(!isVoided4&&(!a1||!a2||!b1||!b2)){
      toast('Game 4: Please select all 4 players or mark the game as void.',true);
      return;
    }
  }

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
    tAIds.forEach(pid=>{if(!pid)return;
      const pA=ladderPlayers.find(p=>p.id===pid);
      const isSubA=pA?.ladder_status==='sub';
      rows.push({session_date:date,court_group:parseInt(courtNum),player_id:pid,game_number:(extraGameMap[gameNum]||gameNum),score_for:isVoided?null:scoreA,score_against:isVoided?null:scoreB,points_earned:isSubA?0:ptA,is_sub:isSubA,default_no_show:false,ladder_id:currentLadder.id});});
    tBIds.forEach(pid=>{if(!pid)return;
      const pB=ladderPlayers.find(p=>p.id===pid);
      const isSubB=pB?.ladder_status==='sub';
      rows.push({session_date:date,court_group:parseInt(courtNum),player_id:pid,game_number:(extraGameMap[gameNum]||gameNum),score_for:isVoided?null:scoreB,score_against:isVoided?null:scoreA,points_earned:isSubB?0:ptB,is_sub:isSubB,default_no_show:false,ladder_id:currentLadder.id});});
  }
  // Add no-show player record
  if(noShowPlayer){
    rows.push({
      session_date:date,
      court_group:parseInt(courtNum),
      player_id:noShowPlayer.id,
      game_number:1,
      score_for:null,
      score_against:null,
      points_earned:noShowPenalty,
      is_sub:noShowPlayer.ladder_status==='sub',
      default_no_show:true,
      ladder_id:currentLadder.id
    });
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
  const statusFilter=document.getElementById('player-status-filter')?.value||'all';
  document.querySelectorAll('#players-table tbody tr').forEach(row=>{
    const name=row.querySelector('td')?.textContent.toLowerCase()||'';
    const statusCell=row.querySelectorAll('td')[4]?.textContent.toLowerCase()||'';
    const nameMatch=name.includes(q);
    const statusMatch=statusFilter==='all'||statusCell.includes(statusFilter);
    row.style.display=(nameMatch&&statusMatch)?'':'none';
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
    document.getElementById('players-count').textContent=`${allPlayers.length} player${allPlayers.length!==1?'s':''}`;
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
const loadSharePage=async()=>{
  const ladders=await api('ladders?select=*&order=id.desc');
  const el=document.getElementById('share-ladder-list');
  if(!ladders.length){el.innerHTML='<div class="empty">No ladders yet. Create one in the Ladders tab.</div>';return;}
  const baseUrl=window.location.origin+window.location.pathname.replace('index.html','')+'players.html';
  el.innerHTML=ladders.map(l=>{
    const encoded=btoa(String(l.id));
    const url=`${baseUrl}?l=${encoded}`;
    const statusColor=l.status==='active'?'var(--teal)':'var(--text-muted)';
    return `<div style="padding:16px 0;border-bottom:0.5px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-weight:700;font-size:14px;">${l.name}</div>
          <div style="font-size:11px;font-weight:700;color:${statusColor};text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">${l.status}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="copyShareLink('${url}','copy-btn-${l.id}')" id="copy-btn-${l.id}">Copy link</button>
      </div>
      <div style="margin-top:10px;background:var(--bg);border:0.5px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;font-size:12px;font-weight:500;color:var(--text-muted);word-break:break-all;font-family:monospace;">${url}</div>
    </div>`;
  }).join('');
};

const copyShareLink=(url,btnId)=>{
  navigator.clipboard.writeText(url).then(()=>{
    const btn=document.getElementById(btnId);
    if(btn){
      const orig=btn.textContent;
      btn.textContent='Copied!';
      btn.style.background='var(--teal)';
      setTimeout(()=>{btn.textContent=orig;btn.style.background='';},2000);
    }
    toast('Link copied to clipboard!');
  }).catch(()=>{
    toast('Could not copy. Please copy the link manually.',true);
  });
};

document.getElementById('last-updated').textContent=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

// Single delegated listener handles all button clicks
document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const action = btn.dataset.action;
  const page = btn.dataset.page;
  if(action==='showPage' && page) showPage(page, btn);
  if(action==='addCourtPlayerBtn'){const pid=parseInt(btn.dataset.pid);addCourtPlayer(pid);}
  if(action==='markNoShow'){markNoShow(btn.dataset.pid);}
  if(action==='cancelNoShow'){cancelNoShow();}
  if(action==='removeCourtPlayerBtn'){removeCourtPlayer(parseInt(btn.dataset.pid));}
  if(action==='addExtraGame') addExtraGame();
  if(action==='editGame') editGame(btn);
  if(action==='deleteSession') deleteSession(btn);
  if(action==='editSession') editSession(btn);
  if(action==='lpToggleAll') lpToggleAll(btn);
  if(action==='lpSaveChanges') lpSaveChanges();
  if(action==='submitSession') submitSession();
  if(action==='closeEditLadderModal') closeEditLadderModal();
  if(action==='closeModal') closeModal();
  if(action==='closeEditGameModal') document.getElementById('edit-game-modal').classList.remove('open');
  if(action==='closeEditSessionModal') document.getElementById('edit-session-modal').classList.remove('open');
  if(action==='addToLadder') addToLadder();
  if(action==='closeLpModal') closeLpModal();
  if(action==='switchTab') switchMainTab(btn.dataset.tab);
  if(action==='switchProgramTab') switchProgramTab(btn.dataset.tab);
  // Tournament actions
  if(action==='openTournamentDetail') openTournamentDetail(btn);
  if(action==='openEditTournament') openEditTournament(btn);
  if(action==='deleteTournament') deleteTournament(btn);
  if(action==='backToTournaments') backToTournaments();
  if(action==='openAddTeam') openAddTeam(btn);
  if(action==='deleteTeam') deleteTeam(btn);
  if(action==='generateRoundRobin') generateRoundRobin(btn);
  if(action==='setFinalsFormat') setFinalsFormat(btn);
  if(action==='generateFinals') generateFinals(btn);
  if(action==='openRecordMatch') openRecordMatch(btn);
  if(action==='closeEditTournamentModal') document.getElementById('edit-tournament-modal').classList.remove('open');
  if(action==='closeAddTeamModal') document.getElementById('add-team-modal').classList.remove('open');
  if(action==='closeRecordMatchModal') document.getElementById('record-match-modal').classList.remove('open');
});

document.addEventListener('change', e=>{
  const el=e.target;
  if(el.dataset.action==='lpChangeStatus'){lpChangeStatus(el);return;}
  if(el.name==='noshow-penalty'){noShowPenalty=parseInt(el.value);return;}
});

document.addEventListener('input', e=>{
  const el=e.target;
  // Status change for ladder player (also handled in change event above)
  if(el.dataset.action==='lpChangeStatus'){lpChangeStatus(el);return;}
  // Search filter for ladder players modal
  if(el.id==='lp-search'){
    const q=el.value.toLowerCase();
    document.querySelectorAll('#lp-enrolled .lp-player-row').forEach(row=>{
      row.style.display=row.dataset.name.includes(q)?'':'none';
    });
    return;
  }
  // Auto-calc for edit game modal
  const rid=el.dataset.egrid;
  if(rid){
    const sf=document.getElementById(`eg-sf-${rid}`);
    const sa=document.getElementById(`eg-sa-${rid}`);
    const pts=document.getElementById(`eg-pts-${rid}`);
    if(sf&&sa&&pts&&sf.value!==''&&sa.value!==''){
      pts.value=calcPoints(parseInt(sf.value),parseInt(sa.value));
    }
  }
  // Auto-calc for extra/game4 score inputs
  const egame=el.dataset.egame;
  if(egame){
    const sA=document.getElementById(`scoreA-${egame}`);
    const sB=document.getElementById(`scoreB-${egame}`);
    if(sA&&sB&&sA.value!==''&&sB.value!==''){
      const ptA=calcPoints(parseInt(sA.value),parseInt(sB.value));
      const ptB=calcPoints(parseInt(sB.value),parseInt(sA.value));
      const preview=document.getElementById(`pts-preview-${egame}`);
      if(preview){
        const aColor=ptA>ptB?'var(--teal)':'var(--orange)';
        const bColor=ptB>ptA?'var(--teal)':'var(--orange)';
        preview.innerHTML=`<span style="color:${aColor};font-weight:700;">Team A: +${ptA} pts</span> &nbsp;|&nbsp; <span style="color:${bColor};font-weight:700;">Team B: +${ptB} pts</span>`;
      }
    }
  }
});

document.getElementById('player-status-filter')?.addEventListener('change', filterPlayers);
document.getElementById('player-search')?.addEventListener('input', filterPlayers);
document.getElementById('tab-programs').dataset.action='switchTab';
document.getElementById('tab-programs').dataset.tab='programs';
document.getElementById('tab-management').dataset.action='switchTab';
document.getElementById('tab-management').dataset.tab='management';
document.getElementById('edit-game-form').addEventListener('submit',saveEditGame);
document.getElementById('edit-session-form').addEventListener('submit',saveEditSession);
document.getElementById('create-tournament-form').addEventListener('submit',createTournament);
document.getElementById('edit-tournament-form').addEventListener('submit',saveEditTournament);
document.getElementById('add-team-form').addEventListener('submit',saveAddTeam);
document.getElementById('record-match-form').addEventListener('submit',saveRecordMatch);

loadLadderSelector().then(()=>loadLadder());


// ─── TOURNAMENTS ─────────────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  mixed_doubles: 'Mixed Doubles',
  mens_doubles: "Men's Doubles",
  womens_doubles: "Women's Doubles",
  team_challenge: 'Team Challenge (2M+2W)'
};

let currentTournamentId = null;

const loadTournamentsPage = async () => {
  const tournaments = await api('tournaments?select=*&order=id.desc');
  const el = document.getElementById('tournaments-list');
  if (!tournaments.length) { el.innerHTML = '<div class="empty">No tournaments yet. Create your first one!</div>'; return; }
  el.innerHTML = tournaments.map(t => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:0.5px solid var(--border);flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-weight:700;font-size:14px;">${t.name}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
          ${CATEGORY_LABELS[t.category]||t.category}
          ${t.date?' · '+new Date(t.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span class="badge badge-${t.status==='active'?'active':t.status==='completed'?'inactive':'sub'}">${t.status}</span>
        <button class="btn btn-primary btn-sm" data-action="openTournamentDetail" data-tid="${t.id}">Manage</button>
        <button class="btn btn-outline btn-sm" data-action="openEditTournament" data-tid="${t.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="deleteTournament" data-tid="${t.id}" data-tname="${t.name}">Delete</button>
      </div>
    </div>`).join('');
};

const createTournament = async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById('tn-name').value.trim(),
    category: document.getElementById('tn-category').value,
    date: document.getElementById('tn-date').value || null,
    status: 'draft'
  };
  if (!body.name) { toast('Please enter a tournament name.', true); return; }
  try {
    await api('tournaments', 'POST', body);
    toast(`Tournament "${body.name}" created!`);
    document.getElementById('create-tournament-form').reset();
    loadTournamentsPage();
  } catch(e) { toast(`Error: ${e.message}`, true); }
};

const openEditTournament = (btn) => {
  const tid = btn.dataset.tid;
  api(`tournaments?id=eq.${tid}&select=*`).then(rows => {
    if (!rows.length) return;
    const t = rows[0];
    document.getElementById('edit-tn-id').value = t.id;
    document.getElementById('edit-tn-name').value = t.name;
    document.getElementById('edit-tn-category').value = t.category;
    document.getElementById('edit-tn-date').value = t.date || '';
    document.getElementById('edit-tn-status').value = t.status;
    document.getElementById('edit-tournament-modal').classList.add('open');
  });
};

const saveEditTournament = async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-tn-id').value;
  const body = {
    name: document.getElementById('edit-tn-name').value.trim(),
    category: document.getElementById('edit-tn-category').value,
    date: document.getElementById('edit-tn-date').value || null,
    status: document.getElementById('edit-tn-status').value
  };
  try {
    await api(`tournaments?id=eq.${id}`, 'PATCH', body);
    toast('Tournament updated!');
    document.getElementById('edit-tournament-modal').classList.remove('open');
    loadTournamentsPage();
  } catch(e) { toast(`Error: ${e.message}`, true); }
};

const deleteTournament = async (btn) => {
  const tid = btn.dataset.tid;
  const name = btn.dataset.tname;
  if (!confirm(`Delete tournament "${name}"?\n\nThis will delete all teams and matches. This cannot be undone.`)) return;
  try {
    const teams = await api(`tournament_teams?tournament_id=eq.${tid}&select=id`);
    for (const t of teams) await api(`tournament_matches?team_a_id=eq.${t.id}`, 'DELETE');
    await api(`tournament_teams?tournament_id=eq.${tid}`, 'DELETE');
    await api(`tournament_matches?tournament_id=eq.${tid}`, 'DELETE');
    await api(`tournaments?id=eq.${tid}`, 'DELETE');
    toast(`Tournament "${name}" deleted.`);
    loadTournamentsPage();
  } catch(e) { toast(`Error: ${e.message}`, true); }
};

// ─── TOURNAMENT DETAIL ────────────────────────────────────────────────────────

const openTournamentDetail = async (btn) => {
  currentTournamentId = parseInt(btn.dataset.tid);
  showPage('tournament-detail', null);
  await renderTournamentDetail();
};

const backToTournaments = () => {
  currentTournamentId = null;
  showPage('tournaments', document.querySelector('#subnav-management button[data-page="tournaments"]'));
};

const renderTournamentDetail = async () => {
  const [tArr, teams, matches] = await Promise.all([
    api(`tournaments?id=eq.${currentTournamentId}&select=*`),
    api(`tournament_teams?tournament_id=eq.${currentTournamentId}&select=*`),
    api(`tournament_matches?tournament_id=eq.${currentTournamentId}&select=*&order=round,id`)
  ]);
  const t = tArr[0];
  if (!t) return;

  const categoryLabel = CATEGORY_LABELS[t.category] || t.category;
  const statusColor = t.status==='active'?'var(--teal)':t.status==='completed'?'var(--blue)':'var(--text-muted)';
  const date = t.date ? new Date(t.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'}) : 'No date set';

  // Calculate standings from round robin matches
  const standings = calcTournamentStandings(teams, matches.filter(m=>m.phase==='round_robin'));
  const rrMatches = matches.filter(m=>m.phase==='round_robin');
  const finalsMatches = matches.filter(m=>m.phase==='finals');
  const rrComplete = rrMatches.length>0 && rrMatches.every(m=>m.status==='completed');

  let html = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:4px;">
        <div>
          <div style="font-size:18px;font-weight:800;color:var(--text);">${t.name}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;font-weight:600;">${categoryLabel} · ${date}</div>
        </div>
        <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:${statusColor};">${t.status}</span>
      </div>
    </div>

    <!-- TEAMS -->
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div class="card-title" style="margin:0;">Teams (${teams.length})</div>
        ${t.status!=='completed'?`<button class="btn btn-primary btn-sm" data-action="openAddTeam" data-tid="${t.id}" data-category="${t.category}">+ Add team</button>`:''}
      </div>
      ${teams.length?`<table>
        <thead><tr><th>#</th><th>Team name</th><th>Players</th><th></th></tr></thead>
        <tbody>${await renderTeamRows(teams, t.status)}</tbody>
      </table>`:'<div class="empty">No teams yet. Add your first team!</div>'}
    </div>

    <!-- ROUND ROBIN -->
    ${teams.length>=2?`
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div class="card-title" style="margin:0;">Round Robin</div>
        ${t.status!=='completed'&&rrMatches.length===0?`<button class="btn btn-primary btn-sm" data-action="generateRoundRobin" data-tid="${t.id}">Generate matches</button>`:''}
      </div>
      ${rrMatches.length?renderRRMatchTable(rrMatches, teams)+renderStandingsTable(standings):'<div class="empty" style="font-size:13px;">Click "Generate matches" to create the round robin schedule.</div>'}
    </div>`:''}

    <!-- FINALS -->
    ${rrComplete?`
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div class="card-title" style="margin:0;">Finals</div>
        ${!t.finals_format&&t.status!=='completed'?`
          <div style="display:flex;gap:8px;">
            <button class="btn btn-outline btn-sm" data-action="setFinalsFormat" data-tid="${t.id}" data-format="top4">Top 4</button>
            <button class="btn btn-primary btn-sm" data-action="setFinalsFormat" data-tid="${t.id}" data-format="bracket">Bracket</button>
          </div>`:''}
      </div>
      ${t.finals_format?renderFinalsSection(finalsMatches, teams, t, standings):'<div class="empty" style="font-size:13px;">Choose the finals format above.</div>'}
    </div>`:''}
  `;

  document.getElementById('tournament-detail-content').innerHTML = html;
};

const renderTeamRows = async (teams, status) => {
  // Get player names for all teams
  const playerIds = [...new Set(teams.flatMap(t=>[t.player1_id,t.player2_id,t.player3_id,t.player4_id].filter(Boolean)))];
  let players = [];
  if (playerIds.length) players = await api(`players?id=in.(${playerIds.join(',')})&select=id,first_name,last_name`);
  const pMap = {};
  players.forEach(p=>pMap[p.id]=`${p.first_name} ${p.last_name}`);

  return teams.map((t,i) => {
    const playerList = [t.player1_id,t.player2_id,t.player3_id,t.player4_id]
      .filter(Boolean).map(id=>pMap[id]||'Unknown').join(', ');
    return `<tr>
      <td style="font-weight:800;color:var(--text-muted);">${i+1}</td>
      <td style="font-weight:700;">${t.name}</td>
      <td style="color:var(--text-muted);font-size:12px;">${playerList}</td>
      <td>${status!=='completed'?`<button class="btn btn-danger btn-sm" data-action="deleteTeam" data-teamid="${t.id}">Remove</button>`:''}</td>
    </tr>`;
  }).join('');
};

const calcTournamentStandings = (teams, rrMatches) => {
  const stats = {};
  teams.forEach(t => stats[t.id] = {id:t.id, name:t.name, w:0, l:0, pts_for:0, pts_against:0, points:0});
  rrMatches.filter(m=>m.status==='completed').forEach(m => {
    if (!stats[m.team_a_id]||!stats[m.team_b_id]) return;
    stats[m.team_a_id].pts_for += m.score_a||0;
    stats[m.team_a_id].pts_against += m.score_b||0;
    stats[m.team_b_id].pts_for += m.score_b||0;
    stats[m.team_b_id].pts_against += m.score_a||0;
    if (m.winner_team_id===m.team_a_id) { stats[m.team_a_id].w++; stats[m.team_a_id].points+=2; stats[m.team_b_id].l++; }
    else if (m.winner_team_id===m.team_b_id) { stats[m.team_b_id].w++; stats[m.team_b_id].points+=2; stats[m.team_a_id].l++; }
  });
  return Object.values(stats).sort((a,b)=>b.points-a.points||(b.pts_for-b.pts_against)-(a.pts_for-a.pts_against));
};

const renderStandingsTable = (standings) => {
  if (!standings.length) return '';
  return `<div style="margin-top:16px;">
    <div class="card-title">Standings</div>
    <table>
      <thead><tr><th>Pos</th><th>Team</th><th>W</th><th>L</th><th>Pts</th></tr></thead>
      <tbody>${standings.map((s,i)=>`<tr>
        <td><span class="rank-badge ${i===0?'top1':i===1?'top2':i===2?'top3':''}">${i+1}</span></td>
        <td style="font-weight:700;">${s.name}</td>
        <td style="color:var(--teal);font-weight:700;">${s.w}</td>
        <td style="color:var(--orange);font-weight:700;">${s.l}</td>
        <td><span class="points-pill">${s.points}</span></td>
      </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
};

const renderRRMatchTable = (matches, teams) => {
  const tMap = {};
  teams.forEach(t=>tMap[t.id]=t.name);
  const rounds = [...new Set(matches.map(m=>m.round))].sort((a,b)=>a-b);
  return rounds.map(round => `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:6px;">Round ${round}</div>
      ${matches.filter(m=>m.round===round).map(m=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:4px;border-left:3px solid ${m.status==='completed'?'var(--lime)':'var(--border)'};">
          <div style="font-size:13px;font-weight:600;flex:1;">${tMap[m.team_a_id]||'?'} <span style="color:var(--text-muted);font-weight:400;">vs</span> ${tMap[m.team_b_id]||'?'}</div>
          ${m.status==='completed'
            ?`<span style="font-size:13px;font-weight:800;color:var(--blue);margin:0 12px;">${m.score_a} - ${m.score_b}</span>`
            :`<span style="font-size:11px;color:var(--text-muted);margin:0 12px;">Pending</span>`}
          <button class="btn btn-outline btn-sm" data-action="openRecordMatch" data-matchid="${m.id}" data-phase="round_robin">${m.status==='completed'?'Edit':'Record'}</button>
        </div>`).join('')}
    </div>`).join('');
};

const renderFinalsSection = (finalsMatches, teams, tournament, standings) => {
  const tMap = {};
  teams.forEach(t=>tMap[t.id]=t.name);

  if (!finalsMatches.length) {
    return `<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Format: <strong>${tournament.finals_format==='bracket'?'Bracket':'Top 4'}</strong></div>
      <button class="btn btn-primary btn-sm" data-action="generateFinals" data-tid="${tournament.id}" data-format="${tournament.finals_format}">Generate finals matches</button>`;
  }

  const completed = finalsMatches.every(m=>m.status==='completed');
  const rounds = [...new Set(finalsMatches.map(m=>m.round))].sort((a,b)=>a-b);
  const roundLabels = {1:'Semifinals',2:'3rd Place Match',3:'Final',4:'Final'};

  let html = `<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Format: <strong>${tournament.finals_format==='bracket'?'Bracket':'Top 4'}</strong></div>`;

  html += rounds.map(round => `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--blue);margin-bottom:6px;">${roundLabels[round]||'Round '+round}</div>
      ${finalsMatches.filter(m=>m.round===round).map(m=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--blue-pale);border-radius:var(--radius-sm);margin-bottom:4px;border-left:3px solid var(--blue);">
          <div style="font-size:13px;font-weight:600;flex:1;">${tMap[m.team_a_id]||'TBD'} <span style="color:var(--text-muted);font-weight:400;">vs</span> ${tMap[m.team_b_id]||'TBD'}</div>
          ${m.status==='completed'
            ?`<span style="font-size:13px;font-weight:800;color:var(--blue);margin:0 12px;">${m.score_a} - ${m.score_b}</span>`
            :`<span style="font-size:11px;color:var(--text-muted);margin:0 12px;">Pending</span>`}
          ${m.team_a_id&&m.team_b_id?`<button class="btn btn-outline btn-sm" data-action="openRecordMatch" data-matchid="${m.id}" data-phase="finals">${m.status==='completed'?'Edit':'Record'}</button>`:'<span style="font-size:11px;color:var(--text-muted);">Awaiting results</span>'}
        </div>`).join('')}
    </div>`).join('');

  // Show podium if finals complete
  if (completed) {
    const finalMatch = finalsMatches.find(m=>m.round===Math.max(...finalsMatches.map(x=>x.round)));
    const thirdMatch = finalsMatches.find(m=>m.round===Math.max(...finalsMatches.map(x=>x.round))-1);
    const first = finalMatch?.winner_team_id ? tMap[finalMatch.winner_team_id] : null;
    const second = finalMatch?.winner_team_id ? tMap[finalMatch.team_a_id===finalMatch.winner_team_id?finalMatch.team_b_id:finalMatch.team_a_id] : null;
    const third = thirdMatch?.winner_team_id ? tMap[thirdMatch.winner_team_id] : null;
    if (first) {
      html += `<div style="margin-top:20px;padding:20px;background:linear-gradient(135deg,var(--blue),#0d2a8f);border-radius:var(--radius);text-align:center;">
        <div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--lime);margin-bottom:16px;">🏆 Final Results</div>
        <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;">
          ${second?`<div style="text-align:center;"><div style="font-size:28px;">🥈</div><div style="font-size:13px;font-weight:700;color:#e0e0e0;margin-top:4px;">${second}</div><div style="font-size:11px;color:var(--blue-light);">2nd place</div></div>`:''}
          <div style="text-align:center;"><div style="font-size:36px;">🥇</div><div style="font-size:15px;font-weight:800;color:var(--lime);margin-top:4px;">${first}</div><div style="font-size:11px;color:var(--lime-dark);font-weight:700;">Champion</div></div>
          ${third?`<div style="text-align:center;"><div style="font-size:28px;">🥉</div><div style="font-size:13px;font-weight:700;color:#cd7f32;margin-top:4px;">${third}</div><div style="font-size:11px;color:var(--blue-light);">3rd place</div></div>`:''}
        </div>
      </div>`;
    }
  }
  return html;
};

// ─── TEAM MANAGEMENT ──────────────────────────────────────────────────────────

const openAddTeam = (btn) => {
  const tid = btn.dataset.tid;
  const category = btn.dataset.category;
  document.getElementById('at-tournament-id').value = tid;
  document.getElementById('at-category').value = category;
  document.getElementById('at-name').value = '';
  document.getElementById('add-team-title').textContent = `Add Team — ${CATEGORY_LABELS[category]||category}`;

  // Build player fields based on category
  const isTeamChallenge = category === 'team_challenge';
  const count = isTeamChallenge ? 4 : 2;
  const labels = isTeamChallenge
    ? ['Player 1 (Man)','Player 2 (Man)','Player 3 (Woman)','Player 4 (Woman)']
    : ['Player 1','Player 2'];

  const opts = allPlayers.filter(p=>p.status!=='inactive').map(p=>`<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('');
  document.getElementById('at-players-fields').innerHTML = labels.slice(0,count).map((lbl,i)=>`
    <div class="form-group" style="margin-top:10px;">
      <label>${lbl}</label>
      <select id="at-p${i+1}" style="width:100%;">
        <option value="">-- Select player --</option>${opts}
      </select>
    </div>`).join('');

  document.getElementById('add-team-modal').classList.add('open');
};

const saveAddTeam = async (e) => {
  e.preventDefault();
  const tid = document.getElementById('at-tournament-id').value;
  const category = document.getElementById('at-category').value;
  const name = document.getElementById('at-name').value.trim();
  const count = category==='team_challenge'?4:2;
  if (!name) { toast('Please enter a team name.', true); return; }
  const body = { tournament_id: parseInt(tid), name,
    player1_id: parseInt(document.getElementById('at-p1')?.value)||null,
    player2_id: parseInt(document.getElementById('at-p2')?.value)||null,
    player3_id: count>=3?(parseInt(document.getElementById('at-p3')?.value)||null):null,
    player4_id: count>=4?(parseInt(document.getElementById('at-p4')?.value)||null):null,
  };
  try {
    await api('tournament_teams','POST',body);
    toast(`Team "${name}" added!`);
    document.getElementById('add-team-modal').classList.remove('open');
    renderTournamentDetail();
  } catch(e) { toast(`Error: ${e.message}`, true); }
};

const deleteTeam = async (btn) => {
  if (!confirm('Remove this team? This cannot be undone.')) return;
  await api(`tournament_teams?id=eq.${btn.dataset.teamid}`,'DELETE');
  toast('Team removed.');
  renderTournamentDetail();
};

// ─── ROUND ROBIN GENERATION ───────────────────────────────────────────────────

const generateRoundRobin = async (btn) => {
  const tid = btn.dataset.tid;
  const teams = await api(`tournament_teams?tournament_id=eq.${tid}&select=id,name`);
  if (teams.length < 2) { toast('Need at least 2 teams to generate matches.', true); return; }

  // Generate all pairs (round robin)
  const matches = [];
  let round = 1;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i+1; j < teams.length; j++) {
      matches.push({
        tournament_id: parseInt(tid),
        phase: 'round_robin',
        round,
        team_a_id: teams[i].id,
        team_b_id: teams[j].id,
        status: 'pending'
      });
      round++;
    }
  }

  try {
    await api('tournament_matches','POST',matches);
    toast(`${matches.length} round robin matches generated!`);
    renderTournamentDetail();
  } catch(e) { toast(`Error: ${e.message}`, true); }
};

// ─── FINALS GENERATION ───────────────────────────────────────────────────────

const setFinalsFormat = async (btn) => {
  const tid = btn.dataset.tid;
  const format = btn.dataset.format;
  await api(`tournaments?id=eq.${tid}`,'PATCH',{finals_format:format});
  toast(`Finals format set to ${format==='bracket'?'Bracket':'Top 4'}.`);
  renderTournamentDetail();
};

const generateFinals = async (btn) => {
  const tid = btn.dataset.tid;
  const format = btn.dataset.format;
  const teams = await api(`tournament_teams?tournament_id=eq.${tid}&select=id`);
  const matches = await api(`tournament_matches?tournament_id=eq.${tid}&phase=eq.round_robin&select=*`);
  const standings = calcTournamentStandings(teams, matches);

  let finalsMatches = [];
  if (format === 'top4') {
    // Semifinal 1: 1st vs 4th, Semifinal 2: 2nd vs 3rd
    // Then: loser1 vs loser2 (3rd place), winner1 vs winner2 (final)
    finalsMatches = [
      { tournament_id:parseInt(tid), phase:'finals', round:1, team_a_id:standings[0]?.id, team_b_id:standings[3]?.id, status:'pending' },
      { tournament_id:parseInt(tid), phase:'finals', round:1, team_a_id:standings[1]?.id, team_b_id:standings[2]?.id, status:'pending' },
      { tournament_id:parseInt(tid), phase:'finals', round:2, team_a_id:null, team_b_id:null, status:'pending' }, // 3rd place
      { tournament_id:parseInt(tid), phase:'finals', round:3, team_a_id:null, team_b_id:null, status:'pending' }, // Final
    ];
  } else {
    // Bracket: 1 vs 2 final directly (simple bracket for smaller tournaments)
    finalsMatches = [
      { tournament_id:parseInt(tid), phase:'finals', round:1, team_a_id:standings[0]?.id, team_b_id:standings[1]?.id, status:'pending' },
      { tournament_id:parseInt(tid), phase:'finals', round:2, team_a_id:standings[2]?.id||null, team_b_id:standings[3]?.id||null, status:'pending' },
      { tournament_id:parseInt(tid), phase:'finals', round:3, team_a_id:null, team_b_id:null, status:'pending' },
    ];
  }

  try {
    await api('tournament_matches','POST',finalsMatches);
    toast('Finals matches generated!');
    renderTournamentDetail();
  } catch(e) { toast(`Error: ${e.message}`, true); }
};

// ─── RECORD MATCH ─────────────────────────────────────────────────────────────

const openRecordMatch = async (btn) => {
  const matchId = btn.dataset.matchid;
  const phase = btn.dataset.phase;
  const match = (await api(`tournament_matches?id=eq.${matchId}&select=*`))[0];
  if (!match) return;

  const teams = await api(`tournament_teams?tournament_id=eq.${currentTournamentId}&select=id,name`);
  const tMap = {};
  teams.forEach(t=>tMap[t.id]=t.name);
  const isFinals = phase === 'finals';

  document.getElementById('rm-match-id').value = matchId;
  document.getElementById('rm-phase').value = phase;
  document.getElementById('record-match-title').textContent = isFinals ? 'Record Finals Match' : 'Record Round Robin Match';
  document.getElementById('record-match-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-bottom:16px;">
      <div style="background:var(--blue-pale);border-radius:var(--radius-sm);padding:14px;text-align:center;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--blue);margin-bottom:6px;">Team A</div>
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;">${tMap[match.team_a_id]||'TBD'}</div>
        <input type="number" min="0" id="rm-score-a" value="${match.score_a??''}" placeholder="Score"
          style="width:80px;text-align:center;font-size:20px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
      </div>
      <div style="font-size:16px;font-weight:800;color:var(--text-muted);">VS</div>
      <div style="background:var(--teal-light);border-radius:var(--radius-sm);padding:14px;text-align:center;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--teal);margin-bottom:6px;">Team B</div>
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;">${tMap[match.team_b_id]||'TBD'}</div>
        <input type="number" min="0" id="rm-score-b" value="${match.score_b??''}" placeholder="Score"
          style="width:80px;text-align:center;font-size:20px;font-weight:800;border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:6px;">
      </div>
    </div>
    ${isFinals?`<div style="font-size:12px;color:var(--text-muted);font-weight:500;text-align:center;padding:8px;background:var(--bg);border-radius:var(--radius-sm);">
      Finals: play to 11, <strong>win by 2</strong>
    </div>`:`<div style="font-size:12px;color:var(--text-muted);font-weight:500;text-align:center;padding:8px;background:var(--bg);border-radius:var(--radius-sm);">
      Round robin: play to 11, win by 1
    </div>`}
  `;
  document.getElementById('record-match-modal').classList.add('open');
};

const saveRecordMatch = async (e) => {
  e.preventDefault();
  const matchId = document.getElementById('rm-match-id').value;
  const scoreA = parseInt(document.getElementById('rm-score-a').value);
  const scoreB = parseInt(document.getElementById('rm-score-b').value);
  if (isNaN(scoreA)||isNaN(scoreB)) { toast('Please enter both scores.', true); return; }

  const match = (await api(`tournament_matches?id=eq.${matchId}&select=*`))[0];
  const winnerId = scoreA > scoreB ? match.team_a_id : match.team_b_id;

  try {
    await api(`tournament_matches?id=eq.${matchId}`,'PATCH',{
      score_a: scoreA, score_b: scoreB,
      winner_team_id: winnerId, status: 'completed'
    });

    // If finals top4: update next round teams based on results
    if (document.getElementById('rm-phase').value === 'finals') {
      await updateFinalsProgression(matchId, match, winnerId, scoreA, scoreB);
    }

    toast('Match result saved!');
    document.getElementById('record-match-modal').classList.remove('open');
    renderTournamentDetail();
  } catch(e) { toast(`Error: ${e.message}`, true); }
};

const updateFinalsProgression = async (matchId, match, winnerId, scoreA, scoreB) => {
  // After semifinals (round 1), populate 3rd place and final
  if (match.round !== 1) return;
  const loserId = winnerId === match.team_a_id ? match.team_b_id : match.team_a_id;
  const allSemis = await api(`tournament_matches?tournament_id=eq.${currentTournamentId}&phase=eq.finals&round=eq.1&select=*`);
  const completedSemis = allSemis.filter(m=>m.status==='completed');
  if (completedSemis.length < 2) return;

  const winners = completedSemis.map(m=>m.winner_team_id);
  const losers = completedSemis.map(m=>m.winner_team_id===m.team_a_id?m.team_b_id:m.team_a_id);

  const thirdMatch = await api(`tournament_matches?tournament_id=eq.${currentTournamentId}&phase=eq.finals&round=eq.2&select=*`);
  const finalMatch = await api(`tournament_matches?tournament_id=eq.${currentTournamentId}&phase=eq.finals&round=eq.3&select=*`);

  if (thirdMatch.length) await api(`tournament_matches?id=eq.${thirdMatch[0].id}`,'PATCH',{team_a_id:losers[0],team_b_id:losers[1]});
  if (finalMatch.length) await api(`tournament_matches?id=eq.${finalMatch[0].id}`,'PATCH',{team_a_id:winners[0],team_b_id:winners[1]});
};

