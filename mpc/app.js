// --- STATE MANAGEMENT ---
let state = {
  name: "My Modpack", mcVersion: "", loader: "fabric", shaderLoader: "none",
  mods:[], usedIDs: [], questlines: []
};
let customFiles = []; 
let activeChapterID = null; 
let editingQuestID = null; // Track if we are editing an existing quest
let linkMode = false;
let linkStartNode = null; 
let draggedNode = null; 
let offset = { x: 0, y: 0 };
let currentTasks = []; // Temporary holding array for tasks inside the editor modal

const STORAGE_KEY = "modpackgen_state";

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    state = { ...state, ...parsed };
  }
}
function saveState() {
  const stateToSave = { ...state, mods: state.mods.map(m => ({ ...m, fileBlob: null })) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  renderModList(); updateWebLLMState();
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
  loadState(); bindUI(); await fetchGameVersions();
  populateForm(); renderModList(); renderQuestlines(); updateWebLLMState();
  loadAddons(); await fetchLLMJson(); searchMods();
});

// --- UI BINDINGS ---
function bindUI() {
  document.querySelectorAll('.activity-tab, .center-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = btn.classList.contains('activity-tab') ? '.activity-tab' : '.center-tab';
      const panelType = btn.classList.contains('activity-tab') ? '.sidebar-panel' : '.tab-pane';
      document.querySelectorAll(type).forEach(b => b.classList.remove('active'));
      document.querySelectorAll(panelType).forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.remove('hidden');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  document.getElementById('pack-name').addEventListener('input', e => { state.name = e.target.value; saveState(); });
  document.getElementById('shader-loader').addEventListener('change', e => { state.shaderLoader = e.target.value; saveState(); });
  ['mc-version', 'pack-loader'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      if(state.mods.length > 0 && !confirm("Changing version/loader clears current mods. Proceed?")) { e.target.value = state[id==='mc-version'?'mcVersion':'loader']; return; }
      state.mods = []; customFiles = []; state[id==='mc-version'?'mcVersion':'loader'] = e.target.value;
      saveState(); searchMods();
    });
  });

  document.getElementById('btn-search').addEventListener('click', searchMods);
  document.getElementById('mod-search').addEventListener('keypress', e => { if(e.key === 'Enter') searchMods(); });
  ['search-source', 'search-category'].forEach(id => document.getElementById(id).addEventListener('change', searchMods));

  document.getElementById('btn-add-custom').addEventListener('click', () => document.getElementById('custom-mod-input').click());
  document.getElementById('custom-mod-input').addEventListener('change', e => {
    for(let file of e.target.files) {
      const modObj = { id: 'custom-' + Date.now(), slug: file.name, title: file.name, category: 'Custom', custom: true };
      state.mods.push(modObj); customFiles.push({ id: modObj.id, file });
    }
    saveState(); e.target.value = '';
  });

  document.getElementById('btn-export').addEventListener('click', exportMrPack);

  // Quest UI
  document.getElementById('btn-create-questline').addEventListener('click', () => {
    document.getElementById('ql-title').value = ''; document.getElementById('ql-desc').value = '';
    document.getElementById('modal-questline').classList.remove('hidden');
  });
  document.getElementById('btn-save-questline').addEventListener('click', saveNewQuestline);
  document.getElementById('btn-back-questlines').addEventListener('click', () => {
    activeChapterID = null; document.getElementById('quest-canvas-view').classList.add('hidden');
    document.getElementById('questlines-view').classList.remove('hidden'); renderQuestlines();
  });

  // SNBT Import
  document.getElementById('btn-import-snbt').addEventListener('click', () => document.getElementById('import-snbt-input').click());
  document.getElementById('import-snbt-input').addEventListener('change', handleSNBTImport);

  // Quest Creation/Editing
  document.getElementById('btn-create-quest').addEventListener('click', () => openQuestEditor(null));
  document.getElementById('btn-save-quest').addEventListener('click', saveQuestData);
  document.getElementById('btn-delete-quest').addEventListener('click', deleteCurrentQuest);
  document.getElementById('btn-add-task').addEventListener('click', () => {
    currentTasks.push({ id: generateHexID(), type: 'item', item: 'minecraft:dirt' });
    renderTaskRows();
  });

  document.getElementById('toggle-link-mode').addEventListener('change', e => {
    linkMode = e.target.checked; linkStartNode = null;
    document.querySelectorAll('.quest-node').forEach(n => n.classList.remove('linking'));
  });

  const canvas = document.getElementById('quest-canvas');
  canvas.addEventListener('mousemove', onCanvasMouseMove);
  canvas.addEventListener('mouseup', onCanvasMouseUp);
  canvas.addEventListener('mouseleave', onCanvasMouseUp);
}

function populateForm() {
  document.getElementById('pack-name').value = state.name;
  document.getElementById('pack-loader').value = state.loader;
  document.getElementById('shader-loader').value = state.shaderLoader;
}
function updateWebLLMState() {
  const isValid = state.mcVersion === '1.20.1' && (state.loader === 'fabric' || state.loader === 'forge');
  const btn = document.getElementById('btn-dl-ai');
  if(isValid) { btn.disabled = false; btn.innerHTML = `Download Quest Ai<br><span class="text-xs text-muted">Auto-generate quests locally</span>`; } 
  else { btn.disabled = true; btn.textContent = "Requires 1.20.1 (Fabric/Forge)"; }
}

// --- REGISTRY ---
function generateHexID() {
  let id;
  do {
    const arr = new Uint32Array(2); window.crypto.getRandomValues(arr);
    id = arr[0].toString(16).padStart(8, '0') + arr[1].toString(16).padStart(8, '0');
    id = id.toUpperCase();
  } while (state.usedIDs.includes(id));
  state.usedIDs.push(id); return id;
}

// --- QUESTLINES & SNBT ---
function renderQuestlines() {
  const list = document.getElementById('questlines-list'); list.innerHTML = '';
  if(state.questlines.length === 0) { list.innerHTML = '<span class="text-muted">No questlines created yet.</span>'; return; }
  state.questlines.forEach(ql => {
    const card = document.createElement('div'); card.className = 'questline-card';
    card.innerHTML = `<h4>${ql.title}</h4><p>${ql.desc || 'No description'}</p><p style="margin-top:4px; color:var(--border)">ID: ${ql.id}</p>`;
    card.addEventListener('click', () => openQuestCanvas(ql.id));
    list.appendChild(card);
  });
}
function saveNewQuestline() {
  const title = document.getElementById('ql-title').value.trim() || 'New Chapter';
  state.questlines.push({ id: generateHexID(), title, desc: document.getElementById('ql-desc').value.trim(), shape: document.getElementById('ql-shape').value, quests: [] });
  saveState(); document.getElementById('modal-questline').classList.add('hidden'); renderQuestlines();
}
function openQuestCanvas(chapterID) {
  activeChapterID = chapterID;
  document.getElementById('current-questline-title').textContent = state.questlines.find(q => q.id === chapterID).title;
  document.getElementById('questlines-view').classList.add('hidden');
  document.getElementById('quest-canvas-view').classList.remove('hidden');
  document.getElementById('toggle-link-mode').checked = false; linkMode = false; linkStartNode = null;
  renderCanvas();
}

function handleSNBTImport(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const content = ev.target.result;
    try {
      const chapterIDMatch = content.match(/id:\s*"([A-F0-9]+)L"/i);
      if(!chapterIDMatch) return alert("Invalid SNBT: No Chapter ID found.");
      const cid = chapterIDMatch[1].toUpperCase();
      const titleMatch = content.match(/title:\s*"([^"]+)"/);
      const ql = { id: cid, title: titleMatch ? titleMatch[1] : "Imported Chapter", desc: "", shape: "circle", quests: [] };
      if(!state.usedIDs.includes(cid)) state.usedIDs.push(cid);
      
      const questsStr = content.substring(content.indexOf('quests: [') || 0);
      const questBlocks = questsStr.match(/\{[^}]*id:\s*"[A-F0-9]+L"[\s\S]*?\}/gi) || [];
      questBlocks.forEach(block => {
        const qIdM = block.match(/id:\s*"([A-F0-9]+)L"/i);
        if(!qIdM) return;
        const qId = qIdM[1].toUpperCase();
        if(!state.usedIDs.includes(qId)) state.usedIDs.push(qId);
        
        const qTitleM = block.match(/title:\s*"([^"]+)"/);
        const qXM = block.match(/x:\s*([-\d\.]+)d/);
        const qYM = block.match(/y:\s*([-\d\.]+)d/);
        const depMatch = block.match(/dependencies:\s*\[([^\]]+)\]/);
        let deps = [];
        if(depMatch) {
           const rawDeps = depMatch[1].match(/"([A-F0-9]+)L"/gi);
           if(rawDeps) deps = rawDeps.map(d => d.replace(/["L]/g, '').toUpperCase());
        }
        ql.quests.push({
          id: qId, title: qTitleM ? qTitleM[1] : "Imported Quest", desc: "",
          x: qXM ? parseFloat(qXM[1]) * 30 + 500 : 500, // Offset to prevent out of bounds
          y: qYM ? parseFloat(qYM[1]) * 30 + 500 : 500,
          dependencies: deps, tasks: []
        });
      });
      state.questlines.push(ql); saveState(); renderQuestlines(); alert("Imported Successfully!");
    } catch(err) { alert("Failed to parse SNBT file."); console.error(err); }
  };
  reader.readAsText(file); e.target.value = '';
}

// --- QUEST EDITOR ---
function openQuestEditor(questID) {
  editingQuestID = questID;
  const ql = state.questlines.find(q => q.id === activeChapterID);
  const q = questID ? ql.quests.find(x => x.id === questID) : null;
  
  document.getElementById('modal-quest-title-label').textContent = questID ? "Edit Quest" : "New Quest";
  document.getElementById('q-title').value = q ? q.title : '';
  document.getElementById('q-desc').value = q ? q.desc : '';
  document.getElementById('btn-delete-quest').classList.toggle('hidden', !questID); // Show delete if editing
  
  currentTasks = q && q.tasks ? JSON.parse(JSON.stringify(q.tasks)) : [];
  renderTaskRows();
  document.getElementById('modal-quest').classList.remove('hidden');
}

function renderTaskRows() {
  const container = document.getElementById('quest-tasks-container'); container.innerHTML = '';
  if(currentTasks.length === 0) { container.innerHTML = '<span class="text-muted text-xs">No tasks. Click + to add.</span>'; return; }
  
  const llmData = window.llmData || [];
  
  currentTasks.forEach((task, index) => {
    const row = document.createElement('div'); row.className = 'task-row';
    
    // Mod Select
    const modSel = document.createElement('select');
    modSel.innerHTML = `<option value="minecraft">Minecraft (Vanilla)</option>` + 
                       llmData.map(m => `<option value="${m.namespace}">${m.mod}</option>`).join('');
    
    // Item Input/Select
    const itemInput = document.createElement('input');
    itemInput.type = 'text'; itemInput.value = task.item || ''; itemInput.placeholder = 'e.g. minecraft:stone';
    
    // Update logic for Mod Select
    modSel.addEventListener('change', () => {
      const selected = llmData.find(m => m.namespace === modSel.value);
      if(selected && selected.key_items_blocks.length > 0) { itemInput.value = selected.key_items_blocks[0]; }
      task.item = itemInput.value;
    });
    
    // Pre-select based on existing task data
    if(task.item) {
      const ns = task.item.split(':')[0];
      if(Array.from(modSel.options).some(o => o.value === ns)) modSel.value = ns;
    }
    
    itemInput.addEventListener('input', e => task.item = e.target.value);
    
    const delBtn = document.createElement('button'); delBtn.className = 'icon-btn'; delBtn.innerHTML = '&times;';
    delBtn.style.color = 'var(--danger)';
    delBtn.addEventListener('click', () => { currentTasks.splice(index, 1); renderTaskRows(); });
    
    row.appendChild(modSel); row.appendChild(itemInput); row.appendChild(delBtn);
    container.appendChild(row);
  });
}

function saveQuestData() {
  if(!activeChapterID) return;
  const ql = state.questlines.find(q => q.id === activeChapterID);
  const title = document.getElementById('q-title').value.trim() || 'New Quest';
  const desc = document.getElementById('q-desc').value.trim();
  
  if(editingQuestID) {
    const q = ql.quests.find(x => x.id === editingQuestID);
    q.title = title; q.desc = desc; q.tasks = currentTasks;
  } else {
    let startX = 100, startY = 100;
    if(ql.quests.length > 0) { startX = ql.quests[ql.quests.length-1].x + 60; startY = ql.quests[ql.quests.length-1].y; }
    ql.quests.push({ id: generateHexID(), chapterID: activeChapterID, title, desc, x: startX, y: startY, dependencies: [], tasks: currentTasks });
  }
  saveState(); document.getElementById('modal-quest').classList.add('hidden'); renderCanvas();
}

function deleteCurrentQuest() {
  if(!activeChapterID || !editingQuestID) return;
  if(!confirm("Are you sure you want to delete this quest?")) return;
  
  const ql = state.questlines.find(q => q.id === activeChapterID);
  // Remove from quests
  ql.quests = ql.quests.filter(q => q.id !== editingQuestID);
  // Remove from others' dependencies
  ql.quests.forEach(q => { q.dependencies = q.dependencies.filter(d => d !== editingQuestID); });
  
  saveState(); document.getElementById('modal-quest').classList.add('hidden'); renderCanvas();
}

// --- CANVAS LOGIC ---
function renderCanvas() {
  if(!activeChapterID) return;
  const ql = state.questlines.find(q => q.id === activeChapterID);
  const container = document.getElementById('quest-nodes-container'); const svg = document.getElementById('quest-lines');
  container.innerHTML = ''; svg.innerHTML = ''; 
  
  ql.quests.forEach(q => {
    const node = document.createElement('div'); node.className = 'quest-node'; node.id = `node-${q.id}`;
    node.style.left = q.x + 'px'; node.style.top = q.y + 'px';
    node.innerHTML = `Q<div class="quest-node-label">${q.title}</div>`;
    
    node.addEventListener('mousedown', (e) => onNodeMouseDown(e, q.id));
    node.addEventListener('click', (e) => onNodeClick(e, q.id));
    node.addEventListener('dblclick', (e) => { e.stopPropagation(); openQuestEditor(q.id); }); // Double click to edit
    container.appendChild(node);
    
    q.dependencies.forEach(depID => {
      const parentNode = ql.quests.find(p => p.id === depID);
      if(parentNode) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'quest-line');
        line.setAttribute('x1', parentNode.x + 21); line.setAttribute('y1', parentNode.y + 21);
        line.setAttribute('x2', q.x + 21); line.setAttribute('y2', q.y + 21);
        svg.appendChild(line);
      }
    });
  });
}

function onNodeMouseDown(e, questID) {
  if(linkMode) return; draggedNode = questID;
  const q = state.questlines.find(q => q.id === activeChapterID).quests.find(x => x.id === questID);
  const rect = document.getElementById('quest-canvas').getBoundingClientRect();
  const scrollL = document.getElementById('quest-canvas').scrollLeft;
  const scrollT = document.getElementById('quest-canvas').scrollTop;
  offset.x = (e.clientX - rect.left + scrollL) - q.x;
  offset.y = (e.clientY - rect.top + scrollT) - q.y;
}
function onCanvasMouseMove(e) {
  if(!draggedNode || !activeChapterID) return;
  const canvas = document.getElementById('quest-canvas');
  const rect = canvas.getBoundingClientRect();
  const ql = state.questlines.find(q => q.id === activeChapterID);
  const q = ql.quests.find(x => x.id === draggedNode);
  
  q.x = Math.max(0, (e.clientX - rect.left + canvas.scrollLeft) - offset.x);
  q.y = Math.max(0, (e.clientY - rect.top + canvas.scrollTop) - offset.y);
  
  const nodeEl = document.getElementById(`node-${draggedNode}`);
  nodeEl.style.left = q.x + 'px'; nodeEl.style.top = q.y + 'px';
  renderCanvasLinesOnly();
}
function onCanvasMouseUp() { if(draggedNode) { saveState(); draggedNode = null; } }

function renderCanvasLinesOnly() {
  const ql = state.questlines.find(q => q.id === activeChapterID);
  const svg = document.getElementById('quest-lines'); svg.innerHTML = '';
  ql.quests.forEach(q => {
    q.dependencies.forEach(depID => {
      const parentNode = ql.quests.find(p => p.id === depID);
      if(parentNode) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'quest-line');
        line.setAttribute('x1', parentNode.x + 21); line.setAttribute('y1', parentNode.y + 21);
        line.setAttribute('x2', q.x + 21); line.setAttribute('y2', q.y + 21);
        svg.appendChild(line);
      }
    });
  });
}

function onNodeClick(e, questID) {
  if(!linkMode || !activeChapterID) return;
  const ql = state.questlines.find(q => q.id === activeChapterID);
  
  if(!linkStartNode) {
    linkStartNode = questID; document.getElementById(`node-${questID}`).classList.add('linking');
  } else {
    if(linkStartNode === questID) { document.getElementById(`node-${questID}`).classList.remove('linking'); linkStartNode = null; return; }
    if(checkCircularDependency(ql.quests, linkStartNode, questID)) { alert("Cannot create link: Circular dependency detected!"); } 
    else {
      const child = ql.quests.find(q => q.id === questID);
      if(!child.dependencies.includes(linkStartNode)) { child.dependencies.push(linkStartNode); saveState(); renderCanvas(); }
    }
    document.getElementById(`node-${linkStartNode}`).classList.remove('linking'); linkStartNode = null;
  }
}

function checkCircularDependency(quests, parentID, childID) {
  let visited = new Set(); let queue = [parentID];
  while(queue.length > 0) {
    let curr = queue.shift();
    if(curr === childID) return true; 
    if(!visited.has(curr)) {
      visited.add(curr); const q = quests.find(x => x.id === curr);
      if(q && q.dependencies) queue.push(...q.dependencies);
    }
  }
  return false;
}

function buildSNBT(ql) {
  let out = `{\n  id: "${ql.id}L"\n  group: ""\n  order_index: 0\n  filename: "${ql.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}"\n  title: "${ql.title}"\n  default_quest_shape: "${ql.shape}"\n  quests: [\n`;
  for(let q of ql.quests) {
    const rx = ((q.x - 500) / 30).toFixed(1); const ry = ((q.y - 500) / 30).toFixed(1); // Normalized center
    out += `    {\n      id: "${q.id}L"\n      title: "${q.title}"\n      x: ${rx}d\n      y: ${ry}d\n      description: ["${q.desc || ''}"]\n`;
    if(q.dependencies.length > 0) out += `      dependencies: [${q.dependencies.map(d => `"${d}L"`).join(', ')}]\n`;
    
    // Process Tasks
    if(q.tasks && q.tasks.length > 0) {
      out += `      tasks: [\n`;
      q.tasks.forEach(t => { out += `        {\n          id: "${t.id}L"\n          type: "${t.type}"\n          item: "${t.item}"\n        }\n`; });
      out += `      ]\n`;
    } else { out += `      tasks: [{ id: "${generateHexID()}L"\n type: "checkmark" }]\n`; }
    
    out += `    }\n`;
  }
  out += `  ]\n}`; return out;
}

// --- FETCHING & SEARCH (Same as before) ---
async function fetchGameVersions() {
  try {
    const res = await fetch('https://api.modrinth.com/v2/tag/game_version'); const data = await res.json();
    const releases = data.filter(v => v.version_type === 'release').map(v => v.version);
    const select = document.getElementById('mc-version'); select.innerHTML = '';
    releases.forEach(ver => { const opt = document.createElement('option'); opt.value = ver; opt.textContent = ver; select.appendChild(opt); });
    if(!state.mcVersion || !releases.includes(state.mcVersion)) state.mcVersion = releases[0];
    select.value = state.mcVersion;
  } catch (err) {}
}

async function fetchLLMJson() {
  try { const res = await fetch('llm.json'); if(res.ok) window.llmData = await res.json(); } 
  catch(e) { console.warn("llm.json not available."); }
}

async function searchMods() {
  if(!state.mcVersion || !state.loader) return;
  const query = document.getElementById('mod-search').value.trim(); const source = document.getElementById('search-source').value; const cat = document.getElementById('search-category').value;
  const resDiv = document.getElementById('search-results'); resDiv.innerHTML = '<span class="text-muted">Searching...</span>';
  if (source === 'modrinth') await searchModrinth(query, cat, resDiv); else await searchCurseForge(query, cat, resDiv);
}

async function searchModrinth(query, category, resultsDiv) {
  try {
    let facetsArr = [["project_type:mod"], [`versions:${state.mcVersion}`], [`categories:${state.loader}`]];
    if (category) facetsArr.push([`categories:${category}`]);
    const res = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(JSON.stringify(facetsArr))}&limit=15`);
    renderSearchResults((await res.json()).hits, resultsDiv, 'modrinth');
  } catch (err) { resultsDiv.innerHTML = '<span class="text-muted">Error searching Modrinth.</span>'; }
}

async function searchCurseForge(query, category, resultsDiv) {
  let apiKey = localStorage.getItem('cf_api_key');
  if(!apiKey) {
    apiKey = prompt("CurseForge API requires an API key.\nEnter your key (or cancel):");
    if(apiKey) localStorage.setItem('cf_api_key', apiKey); else { document.getElementById('search-source').value = 'modrinth'; searchMods(); return; }
  }
  const cfLoader = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }[state.loader] || 4;
  try {
    const res = await fetch(`https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(query)}&gameVersion=${state.mcVersion}&modLoaderType=${cfLoader}&sortField=2&sortOrder=desc&pageSize=15`, { headers: { 'x-api-key': apiKey, 'Accept': 'application/json' } });
    if(!res.ok) throw new Error("CORS or Invalid Key");
    renderSearchResults((await res.json()).data, resultsDiv, 'curseforge');
  } catch (err) {
    resultsDiv.innerHTML = '<span class="text-muted" style="color:#ff4466">CurseForge Error: CORS blocked or Invalid API Key.</span>';
    if(err.message.includes("Invalid Key")) localStorage.removeItem('cf_api_key');
  }
}

function renderSearchResults(hits, container, source) {
  container.innerHTML = '';
  if(hits.length === 0) { container.innerHTML = '<span class="text-muted">No mods found.</span>'; return; }
  hits.forEach(hit => {
    let id, title, desc, icon, slug, defaultCat;
    if (source === 'modrinth') {
      id = hit.project_id; slug = hit.slug; title = hit.title; desc = hit.description; icon = hit.icon_url || 'https://docs.modrinth.com/img/logo.svg';
      defaultCat = hit.categories && hit.categories.length > 0 ? hit.categories[0] : 'Utility'; if(hit.categories && hit.categories.includes('shader')) defaultCat = 'Shader';
    } else {
      id = hit.id.toString(); slug = hit.slug; title = hit.name; desc = hit.summary; icon = hit.logo ? hit.logo.thumbnailUrl : 'https://docs.modrinth.com/img/logo.svg'; defaultCat = 'Utility';
    }
    const isAdded = state.mods.some(m => m.id === id);
    const div = document.createElement('div'); div.className = 'mod-card';
    div.innerHTML = `<img src="${icon}" class="mod-icon"><div class="mod-info"><h4>${title}</h4><p>${desc}</p></div><button class="btn-primary" ${isAdded ? 'disabled' : ''}>${isAdded ? 'Added' : 'Add'}</button>`;
    if(!isAdded) {
      const btn = div.querySelector('button');
      btn.addEventListener('click', async () => {
        btn.textContent = "Adding..."; btn.disabled = true; let mrpackData = null;
        if(source === 'modrinth') {
          try {
            const verRes = await fetch(`https://api.modrinth.com/v2/project/${slug}/version?loaders=["${state.loader}"]&game_versions=["${state.mcVersion}"]`);
            const versions = await verRes.json();
            if(versions.length > 0) {
              const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
              mrpackData = { path: "mods/" + file.filename, hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 }, env: { client: "required", server: "required" }, downloads: [file.url], fileSize: file.size };
            }
          } catch(e) {}
        } else mrpackData = { isCurseForge: true };
        state.mods.push({ id, slug, title, category: defaultCat.charAt(0).toUpperCase() + defaultCat.slice(1), custom: false, source, mrpackData });
        saveState(); searchMods();
      });
    }
    container.appendChild(div);
  });
}

// --- ADDONS, RENDER RIGHT PANEL, EXPORT (Identical) ---
async function loadAddons() {
  try {
    const res = await fetch('data.json'); const data = await res.json();
    const c = document.getElementById('addons-list'); c.innerHTML = '';
    data.addons.forEach(a => {
      const div = document.createElement('div'); div.className = 'addon-item';
      div.innerHTML = `<h4>${a.name}</h4><p>${a.description}</p><button class="btn-primary">Install</button>`;
      div.querySelector('button').addEventListener('click', async (e) => {
        if(!state.mcVersion || !state.loader) return;
        const btn = e.target; btn.textContent = "Checking..."; btn.disabled = true; let added = 0;
        for(let slug of a.mods) {
          if(state.mods.some(m => m.slug === slug)) continue; 
          try {
            const verRes = await fetch(`https://api.modrinth.com/v2/project/${slug}/version?loaders=["${state.loader}"]&game_versions=["${state.mcVersion}"]`);
            const v = await verRes.json();
            if(v && v.length > 0) {
              const projRes = await fetch(`https://api.modrinth.com/v2/project/${slug}`); const p = await projRes.json();
              const f = v[0].files.find(f => f.primary) || v[0].files[0];
              state.mods.push({ id: p.id, slug: p.slug, title: p.title, category: 'Utility', custom: false, source: 'modrinth', mrpackData: { path: "mods/" + f.filename, hashes: { sha1: f.hashes.sha1, sha512: f.hashes.sha512 }, env: { client: "required", server: "required" }, downloads: [f.url], fileSize: f.size }});
              added++;
            }
          } catch(e) {}
        }
        saveState(); btn.textContent = added > 0 ? `Added ${added}` : "Already Added"; setTimeout(() => { btn.textContent = "Install"; btn.disabled = false; }, 2000);
      });
      c.appendChild(div);
    });
  } catch (e) { document.getElementById('addons-list').innerHTML = '<span class="text-muted p-2">Failed to load Addons.</span>'; }
}

function renderModList() {
  const c = document.getElementById('mod-list-container'); c.innerHTML = '';
  if(state.mods.length === 0) { c.innerHTML = '<p class="text-muted text-xs text-center mt-2">No mods added.</p>'; return; }
  const groups = {};
  state.mods.forEach(m => { let c = m.category || 'Unknown'; if(c.toLowerCase() === 'shaders') c = 'Shader'; if(!groups[c]) groups[c] = []; groups[c].push(m); });
  let s = groups['Shader'] || []; delete groups['Shader'];
  for(let [cat, mods] of Object.entries(groups).sort()) {
    const div = document.createElement('div'); div.className = 'mod-category';
    div.innerHTML = `<div class="mod-category-title">${cat}</div>`;
    mods.forEach(m => {
      const item = document.createElement('div'); item.className = 'mod-item';
      item.innerHTML = `<span class="mod-item-name">${m.source === 'curseforge' ? '🔥 ' : ''}${m.title}</span><button class="mod-item-del">&times;</button>`;
      item.querySelector('button').addEventListener('click', () => { state.mods = state.mods.filter(x => x.id !== m.id); customFiles = customFiles.filter(f => f.id !== m.id); saveState(); searchMods(); });
      div.appendChild(item);
    });
    c.appendChild(div);
  }
  if(s.length > 0) { /* Repeat for shader group */ }
}

async function exportMrPack() {
  if (!window.JSZip || !window.saveAs) return alert("Libraries failed to load.");
  const btn = document.getElementById('btn-export'); btn.textContent = "Generating..."; btn.disabled = true;
  try {
    const zip = new JSZip();
    const indexJson = { formatVersion: 1, game: "minecraft", versionId: "1.0.0", name: state.name || "Custom Modpack", dependencies: { minecraft: state.mcVersion }, files: [] };
    indexJson.dependencies[`${state.loader}-loader`] = "*";
    state.mods.forEach(m => {
      if (m.custom) { const cf = customFiles.find(c => c.id === m.id); if (cf && cf.file) zip.file("overrides/mods/" + m.slug, cf.file); }
      else if (m.source === 'modrinth' && m.mrpackData) indexJson.files.push(m.mrpackData);
    });
    zip.file("modrinth.index.json", JSON.stringify(indexJson, null, 2));
    if(state.questlines.length > 0) state.questlines.forEach(ql => zip.file(`overrides/config/ftbquests/quests/chapters/${ql.id}.snbt`, buildSNBT(ql)));
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, (state.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "modpack") + ".mrpack");
  } catch (err) { alert("Failed to export."); } finally { btn.textContent = "Export as .mrpack"; btn.disabled = false; }
}
