// --- STATE MANAGEMENT ---
let state = {
  name: "My Modpack",
  mcVersion: "",
  loader: "fabric",
  shaderLoader: "none",
  mods:[], // { id, slug, title, category, custom, source, mrpackData, fileBlob }
  usedIDs: [], // Registry of 16-char Hex IDs
  questlines: [] // { id, title, desc, shape, quests: [ {id, title, desc, x, y, dependencies:[]} ] }
};

let customFiles = []; // Holds actual File objects for custom uploaded mods during session
let activeChapterID = null; // Which questline is currently being mapped
let linkMode = false;
let linkStartNode = null; // The parent node ID for linking
let draggedNode = null; 
let offset = { x: 0, y: 0 };

const STORAGE_KEY = "modpackgen_state";

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    state.name = parsed.name || "My Modpack";
    state.mcVersion = parsed.mcVersion || "";
    state.loader = parsed.loader || "fabric";
    state.shaderLoader = parsed.shaderLoader || "none";
    state.mods = parsed.mods || [];
    state.usedIDs = parsed.usedIDs || [];
    state.questlines = parsed.questlines || [];
  }
}

function saveState() {
  const stateToSave = { ...state, mods: state.mods.map(m => ({ ...m, fileBlob: null })) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  renderModList();
  updateWebLLMState();
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  bindUI();
  await fetchGameVersions();
  populateForm();
  renderModList();
  renderQuestlines();
  updateWebLLMState();
  loadAddons();
  fetchLLMJson(); // Pre-load LLM registry
  searchMods();
});

// --- UI BINDINGS ---
function bindUI() {
  // Activity Bar Navigation
  document.querySelectorAll('.activity-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.activity-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.remove('hidden');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  // Center Tabs Navigation
  document.querySelectorAll('.center-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.center-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.remove('hidden');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  // Pack Info Inputs
  document.getElementById('pack-name').addEventListener('input', e => { state.name = e.target.value; saveState(); });
  document.getElementById('shader-loader').addEventListener('change', e => { state.shaderLoader = e.target.value; saveState(); });
  document.getElementById('mc-version').addEventListener('change', e => {
    if(state.mods.length > 0) {
      if(!confirm("Changing Minecraft version will clear all current mods. Proceed?")) { e.target.value = state.mcVersion; return; }
      state.mods = []; customFiles = [];
    }
    state.mcVersion = e.target.value;
    saveState(); searchMods();
  });
  document.getElementById('pack-loader').addEventListener('change', e => {
    if(state.mods.length > 0) {
      if(!confirm("Changing Mod Loader will clear all current mods. Proceed?")) { e.target.value = state.loader; return; }
      state.mods = []; customFiles = [];
    }
    state.loader = e.target.value;
    saveState(); searchMods();
  });

  // Search Logic
  document.getElementById('btn-search').addEventListener('click', searchMods);
  document.getElementById('mod-search').addEventListener('keypress', e => { if(e.key === 'Enter') searchMods(); });
  document.getElementById('search-source').addEventListener('change', searchMods);
  document.getElementById('search-category').addEventListener('change', searchMods);

  // Custom Mod Upload
  document.getElementById('btn-add-custom').addEventListener('click', () => document.getElementById('custom-mod-input').click());
  document.getElementById('custom-mod-input').addEventListener('change', e => {
    for(let file of e.target.files) {
      const modObj = { id: 'custom-' + Date.now() + Math.random(), slug: file.name, title: file.name, category: 'Custom', custom: true };
      state.mods.push(modObj);
      customFiles.push({ id: modObj.id, file: file });
    }
    saveState(); e.target.value = '';
  });

  // Export
  document.getElementById('btn-export').addEventListener('click', exportMrPack);

  // Quest UI Bindings
  document.getElementById('btn-create-questline').addEventListener('click', () => {
    document.getElementById('ql-title').value = ''; document.getElementById('ql-desc').value = '';
    document.getElementById('modal-questline').classList.remove('hidden');
  });
  document.getElementById('btn-save-questline').addEventListener('click', saveNewQuestline);
  document.getElementById('btn-back-questlines').addEventListener('click', () => {
    activeChapterID = null;
    document.getElementById('quest-canvas-view').classList.add('hidden');
    document.getElementById('questlines-view').classList.remove('hidden');
    renderQuestlines();
  });

  document.getElementById('btn-create-quest').addEventListener('click', () => {
    document.getElementById('q-title').value = ''; document.getElementById('q-desc').value = '';
    document.getElementById('modal-quest').classList.remove('hidden');
  });
  document.getElementById('btn-save-quest').addEventListener('click', saveNewQuest);

  document.getElementById('toggle-link-mode').addEventListener('change', e => {
    linkMode = e.target.checked;
    linkStartNode = null;
    document.querySelectorAll('.quest-node').forEach(n => n.classList.remove('linking'));
  });

  // Canvas Drag Setup
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
  if(isValid) {
    btn.disabled = false;
    btn.innerHTML = `Download Quest Ai<br><span class="text-xs text-muted">Auto-generate quests from active mods</span>`;
  } else {
    btn.disabled = true;
    btn.textContent = "Requires 1.20.1 (Fabric/Forge)";
  }
}

// --- ID REGISTRY LOGIC (Crypto) ---
function generateHexID() {
  let id;
  do {
    const arr = new Uint32Array(2);
    window.crypto.getRandomValues(arr);
    id = arr[0].toString(16).padStart(8, '0') + arr[1].toString(16).padStart(8, '0');
    id = id.toUpperCase();
  } while (state.usedIDs.includes(id));
  state.usedIDs.push(id);
  return id;
}

// --- QUEST EDITOR LOGIC ---
function renderQuestlines() {
  const list = document.getElementById('questlines-list');
  list.innerHTML = '';
  if(state.questlines.length === 0) {
    list.innerHTML = '<span class="text-muted">No questlines created yet.</span>';
    return;
  }
  state.questlines.forEach(ql => {
    const card = document.createElement('div');
    card.className = 'questline-card';
    card.innerHTML = `<h4>${ql.title}</h4><p>${ql.desc || 'No description'}</p><p style="margin-top:4px; color:var(--border)">ID: ${ql.id}</p>`;
    card.addEventListener('click', () => openQuestCanvas(ql.id));
    list.appendChild(card);
  });
}

function saveNewQuestline() {
  const title = document.getElementById('ql-title').value.trim() || 'New Chapter';
  const desc = document.getElementById('ql-desc').value.trim();
  const shape = document.getElementById('ql-shape').value;
  
  const newQl = { id: generateHexID(), title, desc, shape, quests: [] };
  state.questlines.push(newQl);
  saveState();
  document.getElementById('modal-questline').classList.add('hidden');
  renderQuestlines();
}

function openQuestCanvas(chapterID) {
  activeChapterID = chapterID;
  const ql = state.questlines.find(q => q.id === chapterID);
  document.getElementById('current-questline-title').textContent = ql.title;
  
  document.getElementById('questlines-view').classList.add('hidden');
  document.getElementById('quest-canvas-view').classList.remove('hidden');
  document.getElementById('toggle-link-mode').checked = false;
  linkMode = false; linkStartNode = null;
  
  renderCanvas();
}

function saveNewQuest() {
  if(!activeChapterID) return;
  const ql = state.questlines.find(q => q.id === activeChapterID);
  
  const title = document.getElementById('q-title').value.trim() || 'New Quest';
  const desc = document.getElementById('q-desc').value.trim();
  
  // Place center-ish based on existing quests, or 0,0
  let startX = 100, startY = 100;
  if(ql.quests.length > 0) {
    startX = ql.quests[ql.quests.length-1].x + 60;
    startY = ql.quests[ql.quests.length-1].y;
  }

  const newQuest = { id: generateHexID(), chapterID: activeChapterID, title, desc, x: startX, y: startY, dependencies: [] };
  ql.quests.push(newQuest);
  saveState();
  document.getElementById('modal-quest').classList.add('hidden');
  renderCanvas();
}

function renderCanvas() {
  if(!activeChapterID) return;
  const ql = state.questlines.find(q => q.id === activeChapterID);
  const container = document.getElementById('quest-nodes-container');
  const svg = document.getElementById('quest-lines');
  
  container.innerHTML = '';
  svg.innerHTML = ''; // clear lines
  
  ql.quests.forEach(q => {
    // Render Node
    const node = document.createElement('div');
    node.className = 'quest-node';
    node.id = `node-${q.id}`;
    node.style.left = q.x + 'px';
    node.style.top = q.y + 'px';
    node.innerHTML = `Q<div class="quest-node-label">${q.title}</div>`;
    
    // Interactions
    node.addEventListener('mousedown', (e) => onNodeMouseDown(e, q.id));
    node.addEventListener('click', (e) => onNodeClick(e, q.id));
    container.appendChild(node);
    
    // Render Dependency Lines
    q.dependencies.forEach(depID => {
      const parentNode = ql.quests.find(p => p.id === depID);
      if(parentNode) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'quest-line');
        // centers (width/height is 40)
        line.setAttribute('x1', parentNode.x + 20); line.setAttribute('y1', parentNode.y + 20);
        line.setAttribute('x2', q.x + 20); line.setAttribute('y2', q.y + 20);
        svg.appendChild(line);
      }
    });
  });
}

function onNodeMouseDown(e, questID) {
  if(linkMode) return; // Prevent drag during link mode
  draggedNode = questID;
  const ql = state.questlines.find(q => q.id === activeChapterID);
  const q = ql.quests.find(x => x.id === questID);
  
  const canvasRect = document.getElementById('quest-canvas').getBoundingClientRect();
  const scale = 1; // if scaling was implemented
  offset.x = (e.clientX - canvasRect.left) - q.x;
  offset.y = (e.clientY - canvasRect.top) - q.y;
}

function onCanvasMouseMove(e) {
  if(!draggedNode || !activeChapterID) return;
  const canvasRect = document.getElementById('quest-canvas').getBoundingClientRect();
  const ql = state.questlines.find(q => q.id === activeChapterID);
  const q = ql.quests.find(x => x.id === draggedNode);
  
  q.x = Math.max(0, (e.clientX - canvasRect.left) - offset.x);
  q.y = Math.max(0, (e.clientY - canvasRect.top) - offset.y);
  
  const nodeEl = document.getElementById(`node-${draggedNode}`);
  nodeEl.style.left = q.x + 'px';
  nodeEl.style.top = q.y + 'px';
  
  // Re-render lines efficiently
  renderCanvasLinesOnly();
}

function onCanvasMouseUp(e) {
  if(draggedNode) {
    saveState();
    draggedNode = null;
  }
}

function renderCanvasLinesOnly() {
  if(!activeChapterID) return;
  const ql = state.questlines.find(q => q.id === activeChapterID);
  const svg = document.getElementById('quest-lines');
  svg.innerHTML = '';
  ql.quests.forEach(q => {
    q.dependencies.forEach(depID => {
      const parentNode = ql.quests.find(p => p.id === depID);
      if(parentNode) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'quest-line');
        line.setAttribute('x1', parentNode.x + 20); line.setAttribute('y1', parentNode.y + 20);
        line.setAttribute('x2', q.x + 20); line.setAttribute('y2', q.y + 20);
        svg.appendChild(line);
      }
    });
  });
}

function onNodeClick(e, questID) {
  if(!linkMode || !activeChapterID) return;
  
  const ql = state.questlines.find(q => q.id === activeChapterID);
  
  if(!linkStartNode) {
    linkStartNode = questID;
    document.getElementById(`node-${questID}`).classList.add('linking');
  } else {
    if(linkStartNode === questID) {
      // Cancel
      document.getElementById(`node-${questID}`).classList.remove('linking');
      linkStartNode = null;
      return;
    }
    
    // Attempt link: linkStartNode -> questID
    if(checkCircularDependency(ql.quests, linkStartNode, questID)) {
      alert("Cannot create link: Circular dependency detected!");
    } else {
      const child = ql.quests.find(q => q.id === questID);
      if(!child.dependencies.includes(linkStartNode)) {
        child.dependencies.push(linkStartNode);
        saveState();
        renderCanvas();
      }
    }
    document.getElementById(`node-${linkStartNode}`).classList.remove('linking');
    linkStartNode = null;
  }
}

function checkCircularDependency(quests, parentID, childID) {
  // If child is the parent of parent, or any ancestor of parent
  let visited = new Set();
  let queue = [parentID];
  
  while(queue.length > 0) {
    let curr = queue.shift();
    if(curr === childID) return true; // Circular
    if(!visited.has(curr)) {
      visited.add(curr);
      const q = quests.find(x => x.id === curr);
      if(q && q.dependencies) {
        queue.push(...q.dependencies);
      }
    }
  }
  return false;
}

// Convert Chapter Object to FTB SNBT String
function buildSNBT(ql) {
  let out = `{\n`;
  out += `  id: "${ql.id}L"\n`;
  out += `  group: ""\n`;
  out += `  order_index: 0\n`;
  out += `  filename: "${ql.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}"\n`;
  out += `  title: "${ql.title}"\n`;
  out += `  default_quest_shape: "${ql.shape}"\n`;
  out += `  quests: [\n`;
  
  for(let q of ql.quests) {
    // Coordinate mapping: FTB uses smaller units (-10.0 to 10.0 usually), we divide pixels by 30 to scale
    const rx = (q.x / 30).toFixed(1);
    const ry = (q.y / 30).toFixed(1);
    
    out += `    {\n`;
    out += `      id: "${q.id}L"\n`;
    out += `      title: "${q.title}"\n`;
    out += `      x: ${rx}d\n`;
    out += `      y: ${ry}d\n`;
    out += `      description: ["${q.desc || ''}"]\n`;
    
    if(q.dependencies.length > 0) {
      out += `      dependencies: [${q.dependencies.map(d => `"${d}L"`).join(', ')}]\n`;
    }
    
    // Add a basic checkmark task to make it valid in FTB
    out += `      tasks: [{\n`;
    out += `        id: "${generateHexID()}L"\n`;
    out += `        type: "checkmark"\n`;
    out += `      }]\n`;
    out += `    }\n`;
  }
  
  out += `  ]\n`;
  out += `}`;
  return out;
}

// --- API FETCHING ---
async function fetchGameVersions() {
  try {
    const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
    const data = await res.json();
    const releases = data.filter(v => v.version_type === 'release').map(v => v.version);
    const select = document.getElementById('mc-version');
    select.innerHTML = '';
    releases.forEach(ver => {
      const opt = document.createElement('option'); opt.value = ver; opt.textContent = ver;
      select.appendChild(opt);
    });
    if(!state.mcVersion || !releases.includes(state.mcVersion)) state.mcVersion = releases[0];
    select.value = state.mcVersion;
  } catch (err) {}
}

async function fetchLLMJson() {
  try {
    const res = await fetch('llm.json');
    if(res.ok) window.llmData = await res.json();
  } catch(e) { console.warn("llm.json not available locally."); }
}

async function searchMods() {
  if(!state.mcVersion || !state.loader) return;
  const query = document.getElementById('mod-search').value.trim();
  const source = document.getElementById('search-source').value;
  const category = document.getElementById('search-category').value;
  const resultsDiv = document.getElementById('search-results');
  resultsDiv.innerHTML = '<span class="text-muted">Searching...</span>';

  if (source === 'modrinth') await searchModrinth(query, category, resultsDiv);
  else await searchCurseForge(query, category, resultsDiv);
}

async function searchModrinth(query, category, resultsDiv) {
  try {
    let facetsArr = [["project_type:mod"], [`versions:${state.mcVersion}`], [`categories:${state.loader}`]];
    if (category) facetsArr.push([`categories:${category}`]);
    const res = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(JSON.stringify(facetsArr))}&limit=15`);
    const data = await res.json();
    renderSearchResults(data.hits, resultsDiv, 'modrinth');
  } catch (err) { resultsDiv.innerHTML = '<span class="text-muted">Error searching Modrinth.</span>'; }
}

async function searchCurseForge(query, category, resultsDiv) {
  let apiKey = localStorage.getItem('cf_api_key');
  if(!apiKey) {
    apiKey = prompt("CurseForge API requires an API key.\nEnter your key (or cancel to stick to Modrinth):");
    if(apiKey) localStorage.setItem('cf_api_key', apiKey);
    else { document.getElementById('search-source').value = 'modrinth'; searchMods(); return; }
  }
  const cfLoader = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }[state.loader] || 4;
  try {
    const res = await fetch(`https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(query)}&gameVersion=${state.mcVersion}&modLoaderType=${cfLoader}&sortField=2&sortOrder=desc&pageSize=15`, { headers: { 'x-api-key': apiKey, 'Accept': 'application/json' } });
    if(!res.ok) throw new Error("CORS or Invalid Key");
    const data = await res.json();
    renderSearchResults(data.data, resultsDiv, 'curseforge');
  } catch (err) {
    resultsDiv.innerHTML = '<span class="text-muted" style="color:#ff4466">CurseForge Error: CORS blocked or Invalid API Key. Please use Modrinth.</span>';
    if(err.message.includes("Invalid Key")) localStorage.removeItem('cf_api_key');
  }
}

function renderSearchResults(hits, container, source) {
  container.innerHTML = '';
  if(hits.length === 0) { container.innerHTML = '<span class="text-muted">No mods found.</span>'; return; }
  hits.forEach(hit => {
    let id, title, desc, icon, slug, defaultCat;
    if (source === 'modrinth') {
      id = hit.project_id; slug = hit.slug; title = hit.title; desc = hit.description;
      icon = hit.icon_url || 'https://docs.modrinth.com/img/logo.svg';
      defaultCat = hit.categories && hit.categories.length > 0 ? hit.categories[0] : 'Utility';
      if(hit.categories && hit.categories.includes('shader')) defaultCat = 'Shader';
    } else {
      id = hit.id.toString(); slug = hit.slug; title = hit.name; desc = hit.summary;
      icon = hit.logo ? hit.logo.thumbnailUrl : 'https://docs.modrinth.com/img/logo.svg';
      defaultCat = 'Utility';
    }
    const isAdded = state.mods.some(m => m.id === id);
    const div = document.createElement('div'); div.className = 'mod-card';
    div.innerHTML = `
      <img src="${icon}" class="mod-icon" alt="icon">
      <div class="mod-info"><h4>${title}</h4><p>${desc}</p></div>
      <button class="btn-primary" ${isAdded ? 'disabled' : ''}>${isAdded ? 'Added' : 'Add'}</button>
    `;
    if(!isAdded) {
      const btn = div.querySelector('button');
      btn.addEventListener('click', async () => {
        btn.textContent = "Adding..."; btn.disabled = true;
        let mrpackData = null;
        if(source === 'modrinth') {
          try {
            const verRes = await fetch(`https://api.modrinth.com/v2/project/${slug}/version?loaders=["${state.loader}"]&game_versions=["${state.mcVersion}"]`);
            const versions = await verRes.json();
            if(versions.length > 0) {
              const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
              mrpackData = { path: "mods/" + file.filename, hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 }, env: { client: "required", server: "required" }, downloads: [file.url], fileSize: file.size };
            }
          } catch(e) {}
        } else { mrpackData = { isCurseForge: true }; }
        state.mods.push({ id, slug, title, category: defaultCat.charAt(0).toUpperCase() + defaultCat.slice(1), custom: false, source, mrpackData });
        saveState(); searchMods();
      });
    }
    container.appendChild(div);
  });
}

// --- ADDONS LOGIC ---
async function loadAddons() {
  try {
    const res = await fetch('data.json');
    const data = await res.json();
    const container = document.getElementById('addons-list');
    container.innerHTML = '';
    data.addons.forEach(addon => {
      const div = document.createElement('div'); div.className = 'addon-item';
      div.innerHTML = `<h4>${addon.name}</h4><p>${addon.description}</p><button class="btn-primary w-full">Install Addon</button>`;
      div.querySelector('button').addEventListener('click', async (e) => {
        if(!state.mcVersion || !state.loader) return alert("Set MC version and loader!");
        const btn = e.target; btn.textContent = "Checking..."; btn.disabled = true;
        let added = 0;
        for(let slug of addon.mods) {
          if(state.mods.some(m => m.slug === slug)) continue; 
          try {
            const verRes = await fetch(`https://api.modrinth.com/v2/project/${slug}/version?loaders=["${state.loader}"]&game_versions=["${state.mcVersion}"]`);
            const versions = await verRes.json();
            if(versions && versions.length > 0) {
              const projRes = await fetch(`https://api.modrinth.com/v2/project/${slug}`);
              const proj = await projRes.json();
              const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
              let cat = proj.categories && proj.categories.length > 0 ? proj.categories[0] : 'Utility';
              state.mods.push({
                id: proj.id, slug: proj.slug, title: proj.title, category: cat.charAt(0).toUpperCase() + cat.slice(1), custom: false, source: 'modrinth',
                mrpackData: { path: "mods/" + file.filename, hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 }, env: { client: "required", server: "required" }, downloads: [file.url], fileSize: file.size }
              });
              added++;
            }
          } catch(e) {}
        }
        saveState(); btn.textContent = added > 0 ? `Added ${added} mods` : "Already Added / N/A";
        setTimeout(() => { btn.textContent = "Install Addon"; btn.disabled = false; }, 2000);
      });
      container.appendChild(div);
    });
  } catch (err) { document.getElementById('addons-list').innerHTML = '<span class="text-muted p-2">Failed to load Addons.</span>'; }
}

// --- RIGHT PANEL RENDER ---
function renderModList() {
  const container = document.getElementById('mod-list-container');
  container.innerHTML = '';
  if(state.mods.length === 0) { container.innerHTML = '<p class="text-muted text-xs text-center mt-2">No mods added.</p>'; return; }
  const groups = {};
  state.mods.forEach(mod => {
    let c = mod.category || 'Unknown';
    if(c.toLowerCase() === 'shaders') c = 'Shader';
    if(!groups[c]) groups[c] = [];
    groups[c].push(mod);
  });
  let shaderGroup = groups['Shader'] || []; delete groups['Shader'];
  for(let [cat, mods] of Object.entries(groups).sort()) { container.appendChild(createCategoryDOM(cat, mods)); }
  if(shaderGroup.length > 0) container.appendChild(createCategoryDOM('Shader', shaderGroup));
}

function createCategoryDOM(categoryName, mods) {
  const div = document.createElement('div'); div.className = 'mod-category';
  const title = document.createElement('div'); title.className = 'mod-category-title'; title.textContent = categoryName; div.appendChild(title);
  mods.forEach(mod => {
    const item = document.createElement('div'); item.className = 'mod-item';
    item.innerHTML = `<span class="mod-item-name" title="${mod.title}">${mod.source === 'curseforge' ? '🔥 ' : ''}${mod.title}</span><button class="mod-item-del" title="Remove">&times;</button>`;
    item.querySelector('.mod-item-del').addEventListener('click', () => {
      state.mods = state.mods.filter(m => m.id !== mod.id);
      customFiles = customFiles.filter(f => f.id !== mod.id);
      saveState(); searchMods();
    });
    div.appendChild(item);
  });
  return div;
}

// --- MRPACK EXPORT ---
async function exportMrPack() {
  if (!window.JSZip || !window.saveAs) return alert("Export libraries failed to load.");
  const btn = document.getElementById('btn-export');
  btn.textContent = "Generating..."; btn.disabled = true;

  try {
    const zip = new JSZip();
    const indexJson = { formatVersion: 1, game: "minecraft", versionId: "1.0.0", name: state.name || "Custom Modpack", dependencies: { minecraft: state.mcVersion }, files: [] };
    indexJson.dependencies[`${state.loader}-loader`] = "*";

    // Mod Files
    state.mods.forEach(mod => {
      if (mod.custom) {
        const cf = customFiles.find(c => c.id === mod.id);
        if (cf && cf.file) zip.file("overrides/mods/" + mod.slug, cf.file);
      } else if (mod.source === 'modrinth' && mod.mrpackData) {
        indexJson.files.push(mod.mrpackData);
      }
    });

    zip.file("modrinth.index.json", JSON.stringify(indexJson, null, 2));

    // Quest SNBT Files
    if(state.questlines.length > 0) {
      state.questlines.forEach(ql => {
        const snbtStr = buildSNBT(ql);
        zip.file(`overrides/config/ftbquests/quests/chapters/${ql.id}.snbt`, snbtStr);
      });
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, (state.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "modpack") + ".mrpack");
  } catch (err) {
    console.error(err); alert("Failed to export .mrpack!");
  } finally {
    btn.textContent = "Export as .mrpack"; btn.disabled = false;
  }
}