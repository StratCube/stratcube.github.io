// --- STATE MANAGEMENT ---
let state = {
  name: "My Modpack",
  mcVersion: "",
  loader: "fabric",
  loaderVersion: "",
  mods: []
};

let customFiles = [];

const STORAGE_KEY = "modpackgen_state";

const _usedIds = new Set(["0000000000000000", "0000000000000001"]);
function newId() {
  let id;
  do {
    const hi = (Math.random() * 0xFFFFFFFF) >>> 0;
    const lo = (Math.random() * 0xFFFFFFFF) >>> 0;
    id = hi.toString(16).padStart(8, '0').toUpperCase() + lo.toString(16).padStart(8, '0').toUpperCase();
  } while (_usedIds.has(id));
  _usedIds.add(id);
  return id;
}

let questState = {
  chapters: [{
    id: newId(), filename: 'getting_started', title: 'Getting Started',
    order_index: 0, quests: []
  }],
  activeChapter: 0,
  selectedQuestId: null,
  linkSource: null,
  canvasOffset: { x: 60, y: 60 },
  canvasScale: 1,
  dragging: null,
  isPanning: false,
  panStart: null,
  modsData: [],
  expandedMod: null
};

const TASK_ICONS = { collect: '📦', craft: '⚒️', explore: '🗺️', kill: '⚔️', use: '🤲', checkmark: '✅' };

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    state.name = parsed.name || "My Modpack";
    state.mcVersion = parsed.mcVersion || "";
    state.loader = parsed.loader || "fabric";
    state.loaderVersion = parsed.loaderVersion || "";
    state.mods = parsed.mods || [];
  }
}

function saveState() {
  const stateToSave = { ...state, mods: state.mods.map(m => ({ ...m, fileBlob: null })) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  renderModList();
  renderQuestMods();
}

function loadQuestState() {
  const saved = localStorage.getItem('modpackgen_quests');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed.chapters) questState.chapters = parsed.chapters;
  }
}

function saveQuestState() {
  const toSave = { chapters: questState.chapters };
  localStorage.setItem('modpackgen_quests', JSON.stringify(toSave));
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  loadQuestState();
  bindUI();
  bindQuestUI();
  await fetchGameVersions();
  populateForm();
  renderModList();
  await loadQuestData();
  loadAddons();
  searchMods();
});

// --- UI BINDINGS ---
function bindUI() {
  document.querySelectorAll('.activity-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.activity-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.remove('hidden');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  document.querySelectorAll('.center-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.center-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.remove('hidden');
      document.getElementById(btn.dataset.target).classList.add('active');
      
      if (btn.dataset.target === 'tab-quests') {
        document.getElementById('right-mods-view').classList.add('hidden');
        document.getElementById('right-quest-view').classList.remove('hidden');
        renderQuestCanvas();
        renderQuestEditor();
        renderQuestMods();
        renderQuestChapters();
      } else {
        document.getElementById('right-mods-view').classList.remove('hidden');
        document.getElementById('right-quest-view').classList.add('hidden');
      }
    });
  });

  document.getElementById('pack-name').addEventListener('input', e => { state.name = e.target.value; saveState(); });
  document.getElementById('loader-version').addEventListener('input', e => { state.loaderVersion = e.target.value; saveState(); });

  document.getElementById('mc-version').addEventListener('change', e => {
    if(state.mods.length > 0) {
      if(!confirm("Changing Minecraft version will clear all current mods. Proceed?")) {
        e.target.value = state.mcVersion; return;
      }
      state.mods = []; customFiles = [];
    }
    state.mcVersion = e.target.value;
    saveState();
    searchMods();
  });

  document.getElementById('pack-loader').addEventListener('change', e => {
    if(state.mods.length > 0) {
      if(!confirm("Changing Mod Loader will clear all current mods. Proceed?")) {
        e.target.value = state.loader; return;
      }
      state.mods = []; customFiles = [];
    }
    state.loader = e.target.value;
    saveState();
    searchMods();
  });

  document.getElementById('btn-auto-dep').addEventListener('click', resolveDependencies);
  document.getElementById('btn-search').addEventListener('click', searchMods);
  document.getElementById('mod-search').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') searchMods();
  });
  document.getElementById('search-source').addEventListener('change', searchMods);
  document.getElementById('search-category').addEventListener('change', searchMods);

  document.getElementById('btn-add-custom').addEventListener('click', () => document.getElementById('custom-mod-input').click());
  document.getElementById('custom-mod-input').addEventListener('change', (e) => {
    for(let file of e.target.files) {
      const modObj = {
        id: 'custom-' + Date.now() + Math.random(),
        slug: file.name,
        title: file.name,
        category: 'Custom',
        custom: true
      };
      state.mods.push(modObj);
      customFiles.push({ id: modObj.id, file: file });
    }
    saveState();
    e.target.value = '';
  });

  document.querySelectorAll('.btn-export').forEach(btn => {
    if (btn.id !== 'btn-export-quests') {
      btn.addEventListener('click', exportMrPack);
    }
  });
}

function bindQuestUI() {
  document.getElementById('quest-mod-search').addEventListener('input', renderQuestMods);
  
  document.getElementById('btn-link-dep').addEventListener('click', () => {
    if(questState.selectedQuestId) {
      questState.linkSource = questState.selectedQuestId;
      renderQuestCanvas();
    }
  });
  
  document.getElementById('btn-del-quest').addEventListener('click', () => {
    if(questState.selectedQuestId && confirm("Delete this quest?")) {
      const chapter = questState.chapters[questState.activeChapter];
      if(chapter) {
        chapter.quests = chapter.quests.filter(q => q.id !== questState.selectedQuestId);
        chapter.quests.forEach(q => {
          q.dependencies = q.dependencies.filter(d => d !== questState.selectedQuestId);
        });
        questState.selectedQuestId = null;
        questState.linkSource = null;
        saveQuestState();
        renderQuestCanvas();
        renderQuestEditor();
      }
    }
  });
  
  const qcContainer = document.getElementById('quest-canvas-container');
  qcContainer.addEventListener('mousedown', (e) => {
    // If middle click, alt+click, or just a left click ON THE BACKGROUND (not a node) -> PAN
    const isBackgroundClick = e.target === qcContainer || e.target.id === 'quest-canvas-inner' || e.target.id === 'quest-nodes' || e.target.id === 'quest-edges' || e.target.tagName === 'path' || e.target.tagName === 'svg';
    
    if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && isBackgroundClick)) {
      questState.isPanning = true;
      questState.panStart = { x: e.clientX - questState.canvasOffset.x, y: e.clientY - questState.canvasOffset.y };
      e.preventDefault();
      qcContainer.style.cursor = 'grabbing';
      
      // Deselect quest if clicking background
      questState.selectedQuestId = null;
      questState.linkSource = null;
      renderQuestCanvas();
      renderQuestEditor();
    }
  });
  
  window.addEventListener('mousemove', (e) => {
    if (questState.isPanning && questState.panStart) {
      questState.canvasOffset.x = e.clientX - questState.panStart.x;
      questState.canvasOffset.y = e.clientY - questState.panStart.y;
      
      // Update canvas transform dynamically without rebuilding nodes
      const inner = document.getElementById('quest-canvas-inner');
      if (inner) inner.style.transform = `translate(${questState.canvasOffset.x}px, ${questState.canvasOffset.y}px) scale(${questState.canvasScale})`;
    }
    
    // Smooth dragging without rebuilding the entire DOM
    if (questState.dragging) {
      const dx = (e.clientX - questState.dragging.startX) / questState.canvasScale;
      const dy = (e.clientY - questState.dragging.startY) / questState.canvasScale;
      const chapter = questState.chapters[questState.activeChapter];
      const q = chapter.quests.find(x => x.id === questState.dragging.questId);
      
      if(q) {
        q.x = parseFloat((questState.dragging.origX + dx/80).toFixed(2));
        q.y = parseFloat((questState.dragging.origY + dy/80).toFixed(2));
        
        const nodeEl = document.getElementById('quest-node-' + q.id);
        if (nodeEl) {
          nodeEl.style.left = (q.x * 80) + 'px';
          nodeEl.style.top = (q.y * 80) + 'px';
        }
        renderQuestEdges();
      }
    }
  });
  
  window.addEventListener('mouseup', () => {
    if(questState.isPanning) qcContainer.style.cursor = 'default';
    questState.isPanning = false;
    questState.panStart = null;
    
    if(questState.dragging) {
      saveQuestState();
      questState.dragging = null;
      renderQuestEditor(); // Only rebuild editor to update X/Y numbers
    }
  });
  
  qcContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    questState.canvasScale = Math.max(0.3, Math.min(2.5, questState.canvasScale * factor));
    renderQuestCanvas();
  }, { passive: false });
  
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    questState.canvasScale = Math.min(2.5, questState.canvasScale * 1.2);
    renderQuestCanvas();
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    questState.canvasScale = Math.max(0.3, questState.canvasScale / 1.2);
    renderQuestCanvas();
  });
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    questState.canvasScale = 1;
    questState.canvasOffset = { x: 60, y: 60 };
    renderQuestCanvas();
  });

  document.getElementById('btn-add-chapter').addEventListener('click', () => {
    const id = newId();
    const title = `Chapter ${questState.chapters.length + 1}`;
    questState.chapters.push({
      id, filename: title.toLowerCase().replace(/ /g, '_'), title, order_index: questState.chapters.length, quests: []
    });
    questState.activeChapter = questState.chapters.length - 1;
    saveQuestState();
    renderQuestChapters();
    renderQuestCanvas();
    renderQuestEditor();
  });
  
  document.getElementById('btn-layout-quests').addEventListener('click', () => {
    const chapter = questState.chapters[questState.activeChapter];
    if(chapter) {
      chapter.quests.forEach((q, i) => {
        q.x = (i % 5) * 2.5;
        q.y = Math.floor(i / 5) * 2.5;
      });
      saveQuestState();
      renderQuestCanvas();
    }
  });
  
  document.getElementById('btn-add-quest').addEventListener('click', () => addQuest());
  document.getElementById('btn-export-quests').addEventListener('click', exportQuestsZip);
}

function populateForm() {
  document.getElementById('pack-name').value = state.name;
  document.getElementById('pack-loader').value = state.loader;
  document.getElementById('loader-version').value = state.loaderVersion;
}

// --- QUESTS LOGIC ---
async function loadQuestData() {
  try {
    const res = await fetch('mods.json');
    questState.modsData = await res.json();
    renderQuestMods();
  } catch(e) {
    console.error("Failed to load mods.json for quests", e);
  }
}

function shortName(itemId) {
  if (!itemId) return '?';
  const parts = itemId.split(':');
  const name = parts[parts.length - 1];
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 22);
}

function renderQuestMods() {
  const container = document.getElementById('quest-mods-list');
  if(!container) return;
  container.innerHTML = '';
  
  const search = document.getElementById('quest-mod-search').value.toLowerCase();
  const activeSlugs = new Set(state.mods.map(m => m.slug.toLowerCase()));
  const activeTitles = new Set(state.mods.map(m => m.title.toLowerCase()));
  
  const availableMods = questState.modsData.filter(m => {
    const modName = m.mod.toLowerCase();
    const namespace = m.namespace.toLowerCase();
    const isBase = namespace === 'minecraft';
    const isActive = activeSlugs.has(namespace) || activeTitles.has(modName) || activeSlugs.has(modName);
    
    if (!isBase && !isActive) return false;
    
    if (search && !modName.includes(search) && !namespace.includes(search) && !Object.keys(m.progression).some(s => s.toLowerCase().includes(search))) {
      return false;
    }
    return true;
  });
  
  availableMods.forEach(mod => {
    const div = document.createElement('div');
    div.style.marginBottom = '2px';
    
    const isOpen = questState.expandedMod === mod.namespace;
    
    div.innerHTML = `
      <button class="quest-mod-btn" style="width:100%; display:flex; align-items:center; gap:6px; background:${isOpen ? 'rgba(255,255,255,0.05)' : 'transparent'}; border:none; border-radius:4px; padding:5px 6px; cursor:pointer; text-align:left;">
        <span style="font-size:9px; font-weight:700; background:var(--green-dim); color:#fff; border-radius:3px; padding:1px 5px; flex-shrink:0;">${mod.difficulty_weight}</span>
        <span style="color:${isOpen ? 'var(--green)' : 'var(--text)'}; font-size:11px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${mod.mod}</span>
        <span style="color:var(--muted); font-size:10px;">${isOpen ? '▲' : '▼'}</span>
      </button>
      ${isOpen ? `<div class="quest-mod-stages" style="padding-left:8px; padding-bottom:4px;"></div>` : ''}
    `;
    
    div.querySelector('.quest-mod-btn').addEventListener('click', () => {
      questState.expandedMod = isOpen ? null : mod.namespace;
      renderQuestMods();
    });
    
    if(isOpen) {
      const stagesContainer = div.querySelector('.quest-mod-stages');
      Object.entries(mod.progression).forEach(([stageName, stage]) => {
        const stageBtn = document.createElement('button');
        stageBtn.style.cssText = `width:100%; display:flex; flex-direction:column; align-items:flex-start; background:rgba(0,0,0,0.2); border:1px solid var(--border-light); border-radius:4px; padding:5px 8px; margin-bottom:2px; cursor:pointer; text-align:left;`;
        stageBtn.innerHTML = `
          <span style="color:var(--green); font-size:11px; font-weight:600;">${stageName}</span>
          <span style="color:var(--muted); font-size:10px;">${stage.description}</span>
          <span style="color:var(--muted); font-size:9px; margin-top:2px;">${stage.tasks.length} tasks</span>
        `;
        stageBtn.addEventListener('click', () => {
          const tasks = stage.tasks.map(t => ({
            id: newId(), item: t.item, count: 1,
            taskType: t.type === 'kill' ? 'kill' : t.type === 'explore' ? 'checkmark' : 'item',
            sourceType: t.type
          }));
          addQuest(stageName, tasks);
        });
        stagesContainer.appendChild(stageBtn);
      });
    }
    
    container.appendChild(div);
  });
}

function addQuest(title = 'New Quest', tasks = []) {
  const chapter = questState.chapters[questState.activeChapter];
  if(!chapter) return;
  const id = newId();
  const col = chapter.quests.length % 5;
  const row = Math.floor(chapter.quests.length / 5);
  chapter.quests.push({
    id, title, subtitle: '', description: [],
    x: col * 2.5, y: row * 2.5,
    shape: 'default', dependencies: [], tasks, rewards: []
  });
  questState.selectedQuestId = id;
  saveQuestState();
  renderQuestCanvas();
  renderQuestEditor();
}

function renderQuestChapters() {
  const container = document.getElementById('quest-chapters-list');
  if(!container) return;
  container.innerHTML = '';
  
  questState.chapters.forEach((ch, idx) => {
    const btn = document.createElement('button');
    btn.className = idx === questState.activeChapter ? 'btn-primary active' : 'btn-primary';
    btn.style.cssText = `padding:4px 8px; font-size:11px; display:inline-flex; align-items:center; ${idx === questState.activeChapter ? 'background:var(--green); color:#000;' : ''}`;
    
    btn.innerHTML = `<span>${ch.title} (${ch.quests.length})</span>`;
    
    if (questState.chapters.length > 1) {
      const delBtn = document.createElement('span');
      delBtn.innerHTML = '&times;';
      delBtn.style.cssText = `margin-left:6px; font-size:14px; font-weight:bold; cursor:pointer; ${idx === questState.activeChapter ? 'color:#a00;' : 'color:#ff4466;'}`;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if(confirm(`Delete chapter "${ch.title}"?`)) {
          questState.chapters.splice(idx, 1);
          questState.activeChapter = Math.max(0, idx - 1);
          questState.selectedQuestId = null;
          saveQuestState();
          renderQuestChapters();
          renderQuestCanvas();
          renderQuestEditor();
        }
      });
      btn.appendChild(delBtn);
    }
    
    btn.addEventListener('click', () => {
      questState.activeChapter = idx;
      questState.selectedQuestId = null;
      renderQuestChapters();
      renderQuestCanvas();
      renderQuestEditor();
    });
    
    btn.addEventListener('dblclick', () => {
      const newName = prompt("Rename Chapter:", ch.title);
      if(newName) {
        ch.title = newName;
        ch.filename = newName.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
        saveQuestState();
        renderQuestChapters();
      }
    });
    
    container.appendChild(btn);
  });
}

function renderQuestEdges() {
  const chapter = questState.chapters[questState.activeChapter];
  const g = document.getElementById('quest-edges-paths');
  if(!chapter || !g) return;

  let edgesHtml = '';
  chapter.quests.forEach(quest => {
    quest.dependencies.forEach(depId => {
      const dep = chapter.quests.find(q => q.id === depId);
      if(!dep) return;
      const isSelected = quest.id === questState.selectedQuestId || depId === questState.selectedQuestId;
      
      // Box size assumptions (150px wide, ~50px tall)
      const x1 = (dep.x * 80) + 75;
      const y1 = (dep.y * 80) + 30;
      const x2 = (quest.x * 80) + 75;
      const y2 = (quest.y * 80) + 30;
      
      // Calculate angle
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx*dx + dy*dy);
      
      if (distance < 30) return; // Don't draw if stacked exactly
      
      const angle = Math.atan2(dy, dx);
      // Pull back the arrow head ~80px so it rests on the edge of the destination quest box
      const pullBack = 80;
      let targetX = x2;
      let targetY = y2;
      if (distance > pullBack) {
        targetX = x2 - Math.cos(angle) * pullBack;
        targetY = y2 - Math.sin(angle) * pullBack;
      }
      
      edgesHtml += `
        <path d="M ${x1} ${y1} L ${targetX} ${targetY}"
              stroke="${isSelected ? '#fbbf24' : '#f59e0b'}"
              stroke-width="${isSelected ? 2 : 1.5}"
              fill="none"
              stroke-dasharray="${isSelected ? '6,3' : '4,3'}"
              marker-end="url(#${isSelected ? 'arr-sel' : 'arr'})"
              opacity="0.8" />
      `;
    });
  });
  g.innerHTML = edgesHtml;
}

function renderQuestCanvas() {
  const inner = document.getElementById('quest-canvas-inner');
  if(!inner) return;
  inner.style.transform = `translate(${questState.canvasOffset.x}px, ${questState.canvasOffset.y}px) scale(${questState.canvasScale})`;
  
  const chapter = questState.chapters[questState.activeChapter];
  if(!chapter) return;
  
  // Render Lines
  renderQuestEdges();
  
  // Render Nodes
  const nodesContainer = document.getElementById('quest-nodes');
  nodesContainer.innerHTML = '';
  
  if (chapter.quests.length === 0) {
    nodesContainer.innerHTML = `
      <div style="position:absolute; top:300px; left:400px; transform:translate(-50%,-50%); text-align:center; pointer-events:none;">
        <div style="font-size:48px; margin-bottom:8px;">📜</div>
        <div style="color:var(--muted); font-size:14px;">No quests in this chapter.</div>
      </div>
    `;
  }
  
  chapter.quests.forEach(quest => {
    const isSelected = quest.id === questState.selectedQuestId;
    const isLinkSrc = quest.id === questState.linkSource;
    const px = quest.x * 80;
    const py = quest.y * 80;
    
    const node = document.createElement('div');
    node.id = 'quest-node-' + quest.id;
    node.className = 'quest-node';
    node.style.position = 'absolute';
    node.style.left = px + 'px';
    node.style.top = py + 'px';
    node.style.width = '150px';
    node.style.zIndex = isSelected ? '5' : '2';
    node.style.cursor = questState.linkSource ? 'crosshair' : 'grab';
    if(isSelected) node.style.transform = 'scale(1.04)';
    
    let taskHtml = '';
    quest.tasks.slice(0,4).forEach(t => {
      const icon = TASK_ICONS[t.sourceType || t.taskType] || '';
      taskHtml += `<span style="font-size:9px; background:#1e293b; border-radius:3px; padding:1px 5px; color:#94a3b8; border:1px solid #37415133; margin:1px;">${icon}${shortName(t.item)}</span>`;
    });
    if(quest.tasks.length > 4) taskHtml += `<span style="font-size:9px; color:#64748b;">+${quest.tasks.length-4}</span>`;
    if(quest.tasks.length === 0) taskHtml += `<span style="font-size:9px; color:#374151; font-style:italic;">no tasks</span>`;
    
    node.innerHTML = `
      <div style="background:${isSelected ? '#1a2035' : '#141414'}; border:2px solid ${isSelected ? '#f59e0b' : isLinkSrc ? '#4ade80' : '#374151'}; border-radius:6px; padding:6px 8px; box-shadow:${isSelected ? '0 0 16px #f59e0b44' : '0 2px 8px #00000088'};">
        ${quest.shape && quest.shape !== 'default' ? `<span style="position:absolute; top:2px; right:4px; font-size:9px; color:#64748b;">${quest.shape}</span>` : ''}
        <div style="font-size:11px; font-weight:700; color:${isSelected ? '#f59e0b' : '#e2e8f0'}; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${quest.title || 'Untitled'}</div>
        <div style="display:flex; flex-wrap:wrap; gap:2px;">${taskHtml}</div>
        ${quest.dependencies.length > 0 ? `<div style="margin-top:3px; font-size:9px; color:#78350f;">⬅ ${quest.dependencies.length} dep(s)</div>` : ''}
      </div>
      <div style="text-align:center; font-size:8px; color:#334155; margin-top:1px; letter-spacing:0.05em;">${quest.id}</div>
    `;
    
    node.addEventListener('mousedown', (e) => {
      if(e.button !== 0) return;
      e.stopPropagation();
      if(questState.linkSource !== null) {
        if(questState.linkSource !== quest.id) {
          if(!quest.dependencies.includes(questState.linkSource)) {
            quest.dependencies.push(questState.linkSource);
            saveQuestState();
          }
        }
        questState.linkSource = null;
        renderQuestCanvas();
        renderQuestEditor();
        return;
      }
      questState.selectedQuestId = quest.id;
      questState.dragging = {
        questId: quest.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: quest.x,
        origY: quest.y
      };
      renderQuestCanvas();
      renderQuestEditor();
    });
    
    nodesContainer.appendChild(node);
  });
  
  const statusBar = document.getElementById('quest-status-bar');
  if(statusBar) {
    statusBar.innerHTML = `
      <span class="status-chip">${Math.round(questState.canvasScale * 100)}%</span>
      <span class="status-chip">${chapter.quests.length} quests</span>
      ${questState.linkSource ? `<span class="status-chip" style="background:#1e3a1e; color:#4ade80; border-color:#4ade80;">🔗 Click target quest to link dependency</span>` : ''}
    `;
  }
}

function renderQuestEditor() {
  const container = document.getElementById('quest-editor-container');
  if(!container) return;
  
  const chapter = questState.chapters[questState.activeChapter];
  const quest = chapter ? chapter.quests.find(q => q.id === questState.selectedQuestId) : null;
  
  if(!quest) {
    container.innerHTML = `<div class="text-muted text-center" style="margin-top:20px;">No quest selected.</div>`;
    return;
  }
  
  let html = `
    <div style="font-size:9px; color:var(--muted); margin-bottom:8px; font-family:monospace; background:rgba(0,0,0,0.2); border-radius:3px; padding:2px 6px;">${quest.id}</div>
    
    <div class="input-group" style="padding:0; border:none; margin-bottom:8px;">
      <label>Title</label>
      <input type="text" id="qe-title" value="${quest.title}">
    </div>
    
    <div class="input-group" style="padding:0; border:none; margin-bottom:8px;">
      <label>Subtitle</label>
      <input type="text" id="qe-subtitle" value="${quest.subtitle || ''}">
    </div>
    
    <div class="input-group" style="padding:0; border:none; margin-bottom:8px;">
      <label>Shape</label>
      <select id="qe-shape">
        ${['default','circle','square','pentagon','hexagon','gear','diamond','rsquare','octagon','sun'].map(s => `<option value="${s}" ${quest.shape === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
    
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <div class="input-group" style="padding:0; border:none; flex:1;">
        <label>X</label>
        <input type="number" step="0.5" id="qe-x" value="${quest.x}">
      </div>
      <div class="input-group" style="padding:0; border:none; flex:1;">
        <label>Y</label>
        <input type="number" step="0.5" id="qe-y" value="${quest.y}">
      </div>
    </div>
    
    <div class="input-group" style="padding:0; border:none; margin-bottom:8px;">
      <label>Description</label>
      <div id="qe-desc"></div>
      <div style="display:flex; gap:4px; margin-top:4px;">
        <input type="text" id="qe-new-desc" placeholder="Add description line..." style="flex:1;">
        <button id="btn-add-desc" class="btn-primary" style="padding:2px 6px;">+</button>
      </div>
    </div>
    
    <div class="input-group" style="padding:0; border:none; margin-bottom:8px;">
      <label>Dependencies</label>
      <div id="qe-deps" style="display:flex; flex-direction:column; gap:4px; margin-bottom:4px;">
        ${quest.dependencies.map(depId => {
          const depObj = chapter.quests.find(q => q.id === depId);
          return `<div style="display:flex; align-items:center; gap:4px;">
                    <span style="flex:1; font-size:10px; color:var(--green); background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${depObj ? depObj.title : depId}</span>
                    <button class="btn-del-dep icon-btn" data-id="${depId}" style="color:#ff4466; font-size:14px;">×</button>
                  </div>`;
        }).join('')}
      </div>
    </div>
    
    <div class="input-group" style="padding:0; border:none; margin-bottom:8px;">
      <label>Tasks (${quest.tasks.length})</label>
      <div id="qe-tasks"></div>
      <div style="margin-top:4px; display:flex; gap:4px;">
        <select id="qe-new-task-type" style="width:70px;"><option value="item">item</option><option value="kill">kill</option><option value="checkmark">check</option></select>
        <input type="text" id="qe-new-task-item" placeholder="mod:item_id" style="flex:1;">
        <button id="btn-add-task" class="btn-primary" style="padding:2px 6px;">+</button>
      </div>
    </div>
    
    <div class="input-group" style="padding:0; border:none; margin-bottom:8px;">
      <label>Rewards (${quest.rewards.length})</label>
      <div id="qe-rewards"></div>
      <div style="margin-top:4px; display:flex; gap:4px;">
        <select id="qe-new-reward-type" style="width:70px;"><option value="item">item</option><option value="xp">xp</option><option value="command">cmd</option></select>
        <input type="text" id="qe-new-reward-item" placeholder="mod:item_id" style="flex:1;">
        <button id="btn-add-reward" class="btn-primary" style="padding:2px 6px;">+</button>
      </div>
    </div>
  `;
  container.innerHTML = html;
  
  const descContainer = document.getElementById('qe-desc');
  (quest.description || []).forEach((line, i) => {
    const div = document.createElement('div');
    div.style.cssText = "display:flex; gap:4px; margin-bottom:4px;";
    div.innerHTML = `
      <input type="text" value="${line}" class="qe-desc-line" data-index="${i}" style="flex:1;">
      <button class="btn-del-desc icon-btn" data-index="${i}" style="color:#ff4466; font-size:14px;">×</button>
    `;
    descContainer.appendChild(div);
  });
  
  const tasksContainer = document.getElementById('qe-tasks');
  quest.tasks.forEach(t => {
    const div = document.createElement('div');
    div.style.cssText = "display:flex; gap:4px; margin-bottom:4px; align-items:center;";
    div.innerHTML = `
      <span style="font-size:10px; color:var(--muted); width:40px; overflow:hidden;">${t.taskType}</span>
      <input type="text" value="${t.item}" class="qe-task-item" data-id="${t.id}" style="flex:1;">
      <input type="number" value="${t.count || 1}" class="qe-task-count" data-id="${t.id}" style="width:40px;" ${t.taskType === 'checkmark' ? 'disabled' : ''}>
      <button class="btn-del-task icon-btn" data-id="${t.id}" style="color:#ff4466; font-size:14px;">×</button>
    `;
    tasksContainer.appendChild(div);
  });
  
  const rewardsContainer = document.getElementById('qe-rewards');
  quest.rewards.forEach(r => {
    const div = document.createElement('div');
    div.style.cssText = "display:flex; gap:4px; margin-bottom:4px; align-items:center;";
    div.innerHTML = `
      <span style="font-size:10px; color:var(--muted); width:40px; overflow:hidden;">${r.rewardType}</span>
      <input type="text" value="${r.item}" class="qe-reward-item" data-id="${r.id}" style="flex:1;">
      <input type="number" value="${r.count || 1}" class="qe-reward-count" data-id="${r.id}" style="width:40px;" ${r.rewardType === 'command' ? 'disabled' : ''}>
      <button class="btn-del-reward icon-btn" data-id="${r.id}" style="color:#ff4466; font-size:14px;">×</button>
    `;
    rewardsContainer.appendChild(div);
  });
  
  document.getElementById('qe-title').addEventListener('change', e => { quest.title = e.target.value; saveQuestState(); renderQuestCanvas(); });
  document.getElementById('qe-subtitle').addEventListener('change', e => { quest.subtitle = e.target.value; saveQuestState(); });
  document.getElementById('qe-shape').addEventListener('change', e => { quest.shape = e.target.value; saveQuestState(); renderQuestCanvas(); });
  document.getElementById('qe-x').addEventListener('change', e => { 
    quest.x = parseFloat(e.target.value)||0; 
    saveQuestState(); 
    const nodeEl = document.getElementById('quest-node-' + quest.id);
    if(nodeEl) { nodeEl.style.left = (quest.x * 80) + 'px'; }
    renderQuestEdges();
  });
  document.getElementById('qe-y').addEventListener('change', e => { 
    quest.y = parseFloat(e.target.value)||0; 
    saveQuestState(); 
    const nodeEl = document.getElementById('quest-node-' + quest.id);
    if(nodeEl) { nodeEl.style.top = (quest.y * 80) + 'px'; }
    renderQuestEdges();
  });
  
  document.querySelectorAll('.btn-del-dep').forEach(el => el.addEventListener('click', () => {
    quest.dependencies = quest.dependencies.filter(d => d !== el.dataset.id);
    saveQuestState(); renderQuestEditor(); renderQuestCanvas();
  }));

  document.querySelectorAll('.qe-desc-line').forEach(el => el.addEventListener('change', e => {
    quest.description[el.dataset.index] = e.target.value; saveQuestState();
  }));
  document.querySelectorAll('.btn-del-desc').forEach(el => el.addEventListener('click', () => {
    quest.description.splice(el.dataset.index, 1);
    saveQuestState(); renderQuestEditor();
  }));
  document.getElementById('btn-add-desc').addEventListener('click', () => {
    const val = document.getElementById('qe-new-desc').value.trim();
    if(val) {
      if(!quest.description) quest.description = [];
      quest.description.push(val);
      saveQuestState(); renderQuestEditor();
    }
  });
  
  document.querySelectorAll('.qe-task-item').forEach(el => el.addEventListener('change', e => {
    const t = quest.tasks.find(x => x.id === el.dataset.id);
    if(t) { t.item = e.target.value; saveQuestState(); renderQuestCanvas(); }
  }));
  document.querySelectorAll('.qe-task-count').forEach(el => el.addEventListener('change', e => {
    const t = quest.tasks.find(x => x.id === el.dataset.id);
    if(t) { t.count = parseInt(e.target.value)||1; saveQuestState(); }
  }));
  document.querySelectorAll('.btn-del-task').forEach(el => el.addEventListener('click', () => {
    quest.tasks = quest.tasks.filter(x => x.id !== el.dataset.id);
    saveQuestState(); renderQuestEditor(); renderQuestCanvas();
  }));
  document.getElementById('btn-add-task').addEventListener('click', () => {
    const type = document.getElementById('qe-new-task-type').value;
    const item = document.getElementById('qe-new-task-item').value.trim();
    if(item || type === 'checkmark') {
      quest.tasks.push({ id: newId(), item: item || 'Task', count: 1, taskType: type, sourceType: type });
      saveQuestState(); renderQuestEditor(); renderQuestCanvas();
    }
  });
  
  document.querySelectorAll('.qe-reward-item').forEach(el => el.addEventListener('change', e => {
    const r = quest.rewards.find(x => x.id === el.dataset.id);
    if(r) { r.item = e.target.value; saveQuestState(); }
  }));
  document.querySelectorAll('.qe-reward-count').forEach(el => el.addEventListener('change', e => {
    const r = quest.rewards.find(x => x.id === el.dataset.id);
    if(r) { r.count = parseInt(e.target.value)||1; saveQuestState(); }
  }));
  document.querySelectorAll('.btn-del-reward').forEach(el => el.addEventListener('click', () => {
    quest.rewards = quest.rewards.filter(x => x.id !== el.dataset.id);
    saveQuestState(); renderQuestEditor();
  }));
  document.getElementById('btn-add-reward').addEventListener('click', () => {
    const type = document.getElementById('qe-new-reward-type').value;
    const item = document.getElementById('qe-new-reward-item').value.trim();
    if(item) {
      quest.rewards.push({ id: newId(), item: item, count: type === 'xp' ? 100 : 1, rewardType: type });
      saveQuestState(); renderQuestEditor();
    }
  });
}

function toSNBT(val, depth = 0) {
  const t = '\t'.repeat(depth);
  const t1 = '\t'.repeat(depth + 1);
  if (val === null || val === undefined) return '""';
  if (typeof val === 'string' && val.startsWith('__RAW__')) return val.slice(7);
  if (typeof val === 'string') return `"${val.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return String(val);
    return `${val}d`;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const inner = val.map(v => `${t1}${toSNBT(v, depth+1)}`).join(',\n');
    return `[\n${inner}\n${t}]`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val).filter(([,v]) => v !== undefined && v !== null);
    if (entries.length === 0) return '{}';
    const inner = entries.map(([k,v]) => `${t1}${k}: ${toSNBT(v, depth+1)}`).join(',\n');
    return `{\n${inner}\n${t}}`;
  }
  return String(val);
}

async function exportQuestsZip() {
  if (!window.JSZip || !window.saveAs) return alert("Export libraries failed to load.");
  
  const zip = new JSZip();
  zip.file('data.snbt', toSNBT({ version: 3, default_quest_shape: '', default_quest_disableable: false }));
  zip.file('chapter_groups.snbt', toSNBT({ chapter_groups: [] }));
  
  const chaptersFolder = zip.folder('chapters');
  questState.chapters.forEach(ch => {
    const questObjs = ch.quests.map(q => ({
      title: q.title,
      subtitle: q.subtitle || undefined,
      description: q.description && q.description.length ? q.description : undefined,
      x: `__RAW__${q.x}d`,
      y: `__RAW__${q.y}d`,
      shape: q.shape && q.shape !== 'default' ? q.shape : undefined,
      dependencies: q.dependencies && q.dependencies.length ? q.dependencies : undefined,
      tasks: q.tasks.map(t => {
        if(t.taskType === 'kill') return { id: t.id, type: 'kill', entity: t.item, value: `__RAW__${t.count||1}L` };
        if(t.taskType === 'checkmark') return { id: t.id, type: 'checkmark', title: t.item };
        return { id: t.id, type: 'item', item: { id: t.item, Count: `__RAW__1b` }, count: t.count > 1 ? `__RAW__${t.count}L` : undefined };
      }),
      rewards: q.rewards.map(r => {
        if(r.rewardType === 'xp') return { id: r.id, type: 'xp', xp: r.count||100 };
        if(r.rewardType === 'command') return { id: r.id, type: 'command', command: r.item, player_command: false };
        return { id: r.id, type: 'item', item: { id: r.item, Count: `__RAW__${r.count||1}b` } };
      }),
      id: q.id
    }));
    
    const chapterObj = {
      id: ch.id,
      group: '',
      order_index: ch.order_index,
      filename: ch.filename,
      title: ch.title || undefined,
      default_quest_shape: '',
      quests: questObjs,
      quest_links: []
    };
    
    chaptersFolder.file(`${ch.filename}.snbt`, toSNBT(chapterObj));
  });
  
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "ftbquests.zip");
}

// --- DEPENDENCY RESOLVER ---
async function resolveDependencies() {
  if(!state.mcVersion || !state.loader) return alert("Select MC version and loader first.");
  
  const btn = document.getElementById('btn-auto-dep');
  btn.textContent = "Resolving...";
  btn.disabled = true;

  let addedCount = 0;
  let queue = state.mods.filter(m => m.source === 'modrinth').map(m => m.slug);
  let processed = new Set(state.mods.map(m => m.id));

  try {
    while(queue.length > 0) {
      const currentSlug = queue.shift();
      
      const verRes = await fetch(`https://api.modrinth.com/v2/project/${currentSlug}/version?loaders=["${state.loader}"]&game_versions=["${state.mcVersion}"]`);
      if(!verRes.ok) continue;
      const versions = await verRes.json();
      if(versions.length === 0) continue;
      
      const version = versions[0];
      if(!version.dependencies) continue;

      for(let dep of version.dependencies) {
        if(dep.dependency_type === 'required' && dep.project_id) {
          if(!processed.has(dep.project_id)) {
            processed.add(dep.project_id);
            
            const projRes = await fetch(`https://api.modrinth.com/v2/project/${dep.project_id}`);
            if(!projRes.ok) continue;
            const proj = await projRes.json();
            
            const depVerRes = await fetch(`https://api.modrinth.com/v2/project/${proj.slug}/version?loaders=["${state.loader}"]&game_versions=["${state.mcVersion}"]`);
            if(!depVerRes.ok) continue;
            const depVersions = await depVerRes.json();
            
            if(depVersions.length > 0) {
              const depVer = depVersions[0];
              const file = depVer.files.find(f => f.primary) || depVer.files[0];
              
              let cat = proj.categories && proj.categories.length > 0 ? proj.categories[0] : 'Utility';
              if(proj.categories && proj.categories.includes('shader')) cat = 'Shader';

              state.mods.push({
                id: proj.id,
                slug: proj.slug,
                title: proj.title,
                category: cat.charAt(0).toUpperCase() + cat.slice(1),
                custom: false,
                source: 'modrinth',
                mrpackData: {
                  path: "mods/" + file.filename,
                  hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 },
                  env: { client: "required", server: "required" },
                  downloads: [file.url],
                  fileSize: file.size
                }
              });
              
              addedCount++;
              queue.push(proj.slug); 
            }
          }
        }
      }
    }
    saveState();
    searchMods();
  } catch (err) {
    console.error("Error resolving dependencies:", err);
  } finally {
    btn.textContent = addedCount > 0 ? `Added ${addedCount} mods` : "All good!";
    setTimeout(() => {
      btn.textContent = "Resolve Dependencies";
      btn.disabled = false;
    }, 3000);
  }
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
      const opt = document.createElement('option');
      opt.value = ver; opt.textContent = ver;
      select.appendChild(opt);
    });

    if(!state.mcVersion || !releases.includes(state.mcVersion)) state.mcVersion = releases[0];
    select.value = state.mcVersion;
  } catch (err) {
    console.error("Failed to fetch game versions", err);
  }
}

async function searchMods() {
  if(!state.mcVersion || !state.loader) return;
  
  const query = document.getElementById('mod-search').value.trim();
  const source = document.getElementById('search-source').value;
  const category = document.getElementById('search-category').value;
  const resultsDiv = document.getElementById('search-results');
  
  resultsDiv.innerHTML = '<span class="text-muted">Searching...</span>';

  if (source === 'modrinth') {
    await searchModrinth(query, category, resultsDiv);
  } else {
    await searchCurseForge(query, category, resultsDiv);
  }
}

async function searchModrinth(query, category, resultsDiv) {
  try {
    let facetsArr = [["project_type:mod"], [`versions:${state.mcVersion}`], [`categories:${state.loader}`]];
    if (category) facetsArr.push([`categories:${category}`]);
    const facets = JSON.stringify(facetsArr);
    
    const res = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=15`);
    const data = await res.json();
    
    renderSearchResults(data.hits, resultsDiv, 'modrinth');
  } catch (err) {
    resultsDiv.innerHTML = '<span class="text-muted">Error searching Modrinth.</span>';
  }
}

async function searchCurseForge(query, category, resultsDiv) {
  let apiKey = localStorage.getItem('cf_api_key');
  if(!apiKey) {
    apiKey = prompt("CurseForge API requires an API key.\nEnter your key (or cancel to stick to Modrinth):");
    if(apiKey) localStorage.setItem('cf_api_key', apiKey);
    else {
      document.getElementById('search-source').value = 'modrinth';
      searchMods();
      return;
    }
  }

  const loaderMap = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
  const cfLoader = loaderMap[state.loader] || 4;
  
  try {
    const res = await fetch(`https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(query)}&gameVersion=${state.mcVersion}&modLoaderType=${cfLoader}&sortField=2&sortOrder=desc&pageSize=15`, {
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
    });
    
    if(!res.ok) throw new Error("CORS or Invalid Key");
    const data = await res.json();
    renderSearchResults(data.data, resultsDiv, 'curseforge');
  } catch (err) {
    resultsDiv.innerHTML = '<span class="text-muted" style="color:#ff4466">CurseForge Error: CORS blocked or Invalid API Key. Please use Modrinth for web clients.</span>';
    if(err.message.includes("Invalid Key")) localStorage.removeItem('cf_api_key');
  }
}

function renderSearchResults(hits, container, source) {
  container.innerHTML = '';
  if(hits.length === 0) {
    container.innerHTML = '<span class="text-muted">No mods found for this configuration.</span>';
    return;
  }

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
    const div = document.createElement('div');
    div.className = 'mod-card';
    div.innerHTML = `
      <img src="${icon}" class="mod-icon" alt="icon">
      <div class="mod-info">
        <h4>${title}</h4>
        <p>${desc}</p>
      </div>
      <button class="btn-primary" ${isAdded ? 'disabled' : ''}>
        ${isAdded ? 'Added' : 'Add'}
      </button>
    `;

    if(!isAdded) {
      const btn = div.querySelector('button');
      btn.addEventListener('click', async () => {
        btn.textContent = "Adding...";
        btn.disabled = true;

        let mrpackData = null;
        if(source === 'modrinth') {
          try {
            const verRes = await fetch(`https://api.modrinth.com/v2/project/${slug}/version?loaders=["${state.loader}"]&game_versions=["${state.mcVersion}"]`);
            const versions = await verRes.json();
            if(versions.length > 0) {
              const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
              mrpackData = {
                path: "mods/" + file.filename,
                hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 },
                env: { client: "required", server: "required" },
                downloads: [file.url], fileSize: file.size
              };
            }
          } catch(e) { console.error("Failed to fetch version info", e); }
        } else {
            mrpackData = { isCurseForge: true };
        }

        state.mods.push({
          id, slug, title,
          category: defaultCat.charAt(0).toUpperCase() + defaultCat.slice(1),
          custom: false, source, mrpackData
        });
        saveState();
        searchMods();
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
      const div = document.createElement('div');
      div.className = 'addon-item';
      div.innerHTML = `
        <h4>${addon.name}</h4>
        <p>${addon.description}</p>
        <button class="btn-primary w-full">Install Addon</button>
      `;

      div.querySelector('button').addEventListener('click', async (e) => {
        if(!state.mcVersion || !state.loader) return alert("Set MC version and loader!");
        const btn = e.target;
        btn.textContent = "Checking...";
        btn.disabled = true;

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
                id: proj.id, slug: proj.slug, title: proj.title,
                category: cat.charAt(0).toUpperCase() + cat.slice(1), custom: false, source: 'modrinth',
                mrpackData: {
                  path: "mods/" + file.filename,
                  hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 },
                  env: { client: "required", server: "required" },
                  downloads: [file.url], fileSize: file.size
                }
              });
              added++;
            }
          } catch(e) {}
        }
        saveState();
        btn.textContent = added > 0 ? `Added ${added} mods` : "Already Added / N/A";
        setTimeout(() => { btn.textContent = "Install Addon"; btn.disabled = false; }, 2000);
      });
      container.appendChild(div);
    });
  } catch (err) {
    document.getElementById('addons-list').innerHTML = '<span class="text-muted p-2">Failed to load Addons.</span>';
  }
}

// --- RIGHT PANEL RENDER ---
function renderModList() {
  const container = document.getElementById('mod-list-container');
  container.innerHTML = '';

  if(state.mods.length === 0) {
    container.innerHTML = '<p class="text-muted text-xs text-center mt-2">No mods added.</p>';
    return;
  }

  const groups = {};
  state.mods.forEach(mod => {
    let c = mod.category || 'Unknown';
    if(c.toLowerCase() === 'shaders') c = 'Shader';
    if(!groups[c]) groups[c] = [];
    groups[c].push(mod);
  });

  let shaderGroup = groups['Shader'] || [];
  delete groups['Shader'];

  for(let [cat, mods] of Object.entries(groups).sort()) {
    container.appendChild(createCategoryDOM(cat, mods));
  }
  if(shaderGroup.length > 0) {
    container.appendChild(createCategoryDOM('Shader', shaderGroup));
  }
}

function createCategoryDOM(categoryName, mods) {
  const div = document.createElement('div');
  div.className = 'mod-category';
  
  const title = document.createElement('div');
  title.className = 'mod-category-title';
  title.textContent = categoryName;
  div.appendChild(title);

  mods.forEach(mod => {
    const item = document.createElement('div');
    item.className = 'mod-item';
    item.innerHTML = `
      <span class="mod-item-name" title="${mod.title}">${mod.source === 'curseforge' ? '🔥 ' : ''}${mod.title}</span>
      <button class="mod-item-del" title="Remove">&times;</button>
    `;
    item.querySelector('.mod-item-del').addEventListener('click', () => {
      state.mods = state.mods.filter(m => m.id !== mod.id);
      customFiles = customFiles.filter(f => f.id !== mod.id);
      saveState();
      searchMods(); 
    });
    div.appendChild(item);
  });
  return div;
}

// --- MRPACK EXPORT ---
async function exportMrPack() {
  if (state.mods.length === 0) return alert("Add some mods first!");
  if (!window.JSZip || !window.saveAs) return alert("Export libraries failed to load.");

  const exportButtons = document.querySelectorAll('.btn-export:not(#btn-export-quests)');
  const resetButtons = () => {
    exportButtons.forEach(btn => {
      btn.textContent = "Export as .mrpack";
      btn.disabled = false;
    });
  };

  exportButtons.forEach(btn => {
    btn.textContent = "Generating...";
    btn.disabled = true;
  });

  try {
    const zip = new JSZip();

    let loaderVersion;
    if (state.loaderVersion.trim() !== "") {
        loaderVersion = state.loaderVersion.trim();
    } else {
        try {
            const prismUidMap = { 'fabric': 'net.fabricmc.fabric-loader', 'forge': 'net.minecraftforge', 'quilt': 'org.quiltmc.quilt-loader', 'neoforge': 'net.neoforged' };
            const uid = prismUidMap[state.loader];
            if (uid) {
                const metaRes = await fetch(`https://meta.prismlauncher.org/v1/${uid}/index.json`);
                if (metaRes.ok) {
                    const metaData = await metaRes.json();
                    const validVersions = metaData.versions.filter(v => v.requires && v.requires.some(req => req.uid === 'net.minecraft' && req.equals === state.mcVersion));
                    if (validVersions.length > 0) {
                        const recommended = validVersions.find(v => v.recommended);
                        loaderVersion = recommended ? recommended.version : validVersions[0].version;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch loader version:", e);
        }
    }

    if (!loaderVersion) {
        alert("Could not automatically determine a compatible loader version. Please enter a specific version in the 'Loader Version' text box and try exporting again.");
        resetButtons();
        return;
    }

    const indexJson = {
      formatVersion: 1, game: "minecraft", versionId: "1.0.0", name: state.name || "Custom Modpack",
      dependencies: { minecraft: state.mcVersion }, files:[]
    };
    
    const loaderKeyMap = { 'fabric': 'fabric-loader', 'forge': 'forge', 'quilt': 'quilt-loader', 'neoforge': 'neoforge' };
    const loaderKey = loaderKeyMap[state.loader] || state.loader;
    indexJson.dependencies[loaderKey] = loaderVersion;

    state.mods.forEach(mod => {
      if (mod.custom) {
        const cf = customFiles.find(c => c.id === mod.id);
        if (cf && cf.file) {
          zip.file("overrides/mods/" + mod.slug, cf.file);
        } else {
          console.warn("Custom mod file missing in session:", mod.slug);
        }
      } 
      else if (mod.source === 'modrinth' && mod.mrpackData) {
        indexJson.files.push(mod.mrpackData);
      }
      else if (mod.source === 'curseforge') {
        console.warn("CurseForge mods cannot be bundled perfectly into mrpack via browser yet.");
      }
    });

    zip.file("modrinth.index.json", JSON.stringify(indexJson, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, (state.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "modpack") + ".mrpack");
  } catch (err) {
    console.error(err);
    alert("An unexpected error occurred during export.");
  } finally {
    resetButtons();
  }
}