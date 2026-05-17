import { state, questState, saveQuestState } from './state.js';
import { newId, escapeHtml, shortName, TASK_ICONS, debounce } from './utils.js';

export async function initQuests() {
  await loadQuestData();
  bindQuestUI();
}

export function triggerQuestRenders() {
  renderQuestChapters();
  renderQuestMods();
  renderQuestCanvas();
  renderQuestEditor();
}

async function loadQuestData() {
  try {
    const res = await fetch('mods.json');
    if (!res.ok) throw new Error("Failed to load mods.json");
    questState.modsData = await res.json();
  } catch(e) {
    console.error("Failed to load mods.json for quests", e);
  }
}

function bindQuestUI() {
  // Debounce the search to prevent UI lag on rapid typing
  const debouncedSearch = debounce(renderQuestMods, 250);
  document.getElementById('quest-mod-search').addEventListener('input', debouncedSearch);
  
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
  
  // FIX: Reliable background click detection
  qcContainer.addEventListener('mousedown', (e) => {
    const isNode = e.target.closest('.quest-node');
    const isBackgroundClick = !isNode;
    
    if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && isBackgroundClick)) {
      questState.isPanning = true;
      questState.panStart = { x: e.clientX - questState.canvasOffset.x, y: e.clientY - questState.canvasOffset.y };
      e.preventDefault();
      qcContainer.style.cursor = 'grabbing';
      
      questState.selectedQuestId = null;
      questState.linkSource = null;
      renderQuestCanvas();
      renderQuestEditor();
    }
  });
  
  // Use requestAnimationFrame for smoother dragging/panning
  let rafPending = false;
  window.addEventListener('mousemove', (e) => {
    if (!questState.isPanning && !questState.dragging) return;
    
    if (!rafPending) {
      requestAnimationFrame(() => {
        if (questState.isPanning && questState.panStart) {
          questState.canvasOffset.x = e.clientX - questState.panStart.x;
          questState.canvasOffset.y = e.clientY - questState.panStart.y;
          
          const inner = document.getElementById('quest-canvas-inner');
          if (inner) inner.style.transform = `translate(${questState.canvasOffset.x}px, ${questState.canvasOffset.y}px) scale(${questState.canvasScale})`;
        }
        
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
        rafPending = false;
      });
      rafPending = true;
    }
  });
  
  window.addEventListener('mouseup', () => {
    if(questState.isPanning) qcContainer.style.cursor = 'default';
    questState.isPanning = false;
    questState.panStart = null;
    
    if(questState.dragging) {
      saveQuestState();
      questState.dragging = null;
      renderQuestEditor(); 
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
    triggerQuestRenders();
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

export function renderQuestMods() {
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
  
  const fragment = document.createDocumentFragment();
  
  availableMods.forEach(mod => {
    const div = document.createElement('div');
    div.style.marginBottom = '2px';
    
    const isOpen = questState.expandedMod === mod.namespace;
    const safeModName = escapeHtml(mod.mod);
    
    div.innerHTML = `
      <button class="quest-mod-btn" style="width:100%; display:flex; align-items:center; gap:6px; background:${isOpen ? 'rgba(255,255,255,0.05)' : 'transparent'}; border:none; border-radius:4px; padding:5px 6px; cursor:pointer; text-align:left;">
        <span style="font-size:9px; font-weight:700; background:var(--green-dim); color:#fff; border-radius:3px; padding:1px 5px; flex-shrink:0;">${mod.difficulty_weight}</span>
        <span style="color:${isOpen ? 'var(--green)' : 'var(--text)'}; font-size:11px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeModName}</span>
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
        
        const safeStageName = escapeHtml(stageName);
        const safeDesc = escapeHtml(stage.description);
        
        stageBtn.innerHTML = `
          <span style="color:var(--green); font-size:11px; font-weight:600;">${safeStageName}</span>
          <span style="color:var(--muted); font-size:10px;">${safeDesc}</span>
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
    fragment.appendChild(div);
  });
  
  container.appendChild(fragment);
}

export function renderQuestChapters() {
  const container = document.getElementById('quest-chapters-list');
  if(!container) return;
  container.innerHTML = '';
  
  const fragment = document.createDocumentFragment();
  
  questState.chapters.forEach((ch, idx) => {
    const btn = document.createElement('button');
    btn.className = idx === questState.activeChapter ? 'btn-primary active' : 'btn-primary';
    btn.style.cssText = `padding:4px 8px; font-size:11px; display:inline-flex; align-items:center; ${idx === questState.activeChapter ? 'background:var(--green); color:#000;' : ''}`;
    
    const safeTitle = escapeHtml(ch.title);
    btn.innerHTML = `<span>${safeTitle} (${ch.quests.length})</span>`;
    
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
          triggerQuestRenders();
        }
      });
      btn.appendChild(delBtn);
    }
    
    btn.addEventListener('click', () => {
      questState.activeChapter = idx;
      questState.selectedQuestId = null;
      triggerQuestRenders();
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
    
    fragment.appendChild(btn);
  });
  container.appendChild(fragment);
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
      
      const W = 150, H = 70;
      const cx1 = (dep.x * 80) + 75;
      const cy1 = (dep.y * 80) + 35;
      const cx2 = (quest.x * 80) + 75;
      const cy2 = (quest.y * 80) + 35;
      
      const dx = cx2 - cx1;
      const dy = cy2 - cy1;
      const distance = Math.sqrt(dx*dx + dy*dy);
      
      if (distance < 10) return;
      
      const angle = Math.atan2(dy, dx);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      const pBackTargetX = cos !== 0 ? Math.abs((W/2 + 10) / cos) : Infinity;
      const pBackTargetY = sin !== 0 ? Math.abs((H/2 + 10) / sin) : Infinity;
      const pullBackTarget = Math.min(pBackTargetX, pBackTargetY);
      
      const pBackSourceX = cos !== 0 ? Math.abs((W/2 + 2) / cos) : Infinity;
      const pBackSourceY = sin !== 0 ? Math.abs((H/2 + 2) / sin) : Infinity;
      const pullBackSource = Math.min(pBackSourceX, pBackSourceY);
      
      if (distance <= pullBackTarget + pullBackSource) return;

      const startX = cx1 + cos * pullBackSource;
      const startY = cy1 + sin * pullBackSource;
      const targetX = cx2 - cos * pullBackTarget;
      const targetY = cy2 - sin * pullBackTarget;
      
      edgesHtml += `
        <path d="M ${startX} ${startY} L ${targetX} ${targetY}"
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

export function renderQuestCanvas() {
  const inner = document.getElementById('quest-canvas-inner');
  if(!inner) return;
  inner.style.transform = `translate(${questState.canvasOffset.x}px, ${questState.canvasOffset.y}px) scale(${questState.canvasScale})`;
  
  const chapter = questState.chapters[questState.activeChapter];
  if(!chapter) return;
  
  renderQuestEdges();
  
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
  
  const fragment = document.createDocumentFragment();
  
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
      taskHtml += `<span style="font-size:9px; background:#1e293b; border-radius:3px; padding:1px 5px; color:#94a3b8; border:1px solid #37415133; margin:1px;">${icon}${escapeHtml(shortName(t.item))}</span>`;
    });
    if(quest.tasks.length > 4) taskHtml += `<span style="font-size:9px; color:#64748b;">+${quest.tasks.length-4}</span>`;
    if(quest.tasks.length === 0) taskHtml += `<span style="font-size:9px; color:#374151; font-style:italic;">no tasks</span>`;
    
    const safeTitle = escapeHtml(quest.title || 'Untitled');
    const safeShape = escapeHtml(quest.shape);
    
    node.innerHTML = `
      <div style="background:${isSelected ? '#1a2035' : '#141414'}; border:2px solid ${isSelected ? '#f59e0b' : isLinkSrc ? '#4ade80' : '#374151'}; border-radius:6px; padding:6px 8px; box-shadow:${isSelected ? '0 0 16px #f59e0b44' : '0 2px 8px #00000088'};">
        ${quest.shape && quest.shape !== 'default' ? `<span style="position:absolute; top:2px; right:4px; font-size:9px; color:#64748b;">${safeShape}</span>` : ''}
        <div style="font-size:11px; font-weight:700; color:${isSelected ? '#f59e0b' : '#e2e8f0'}; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeTitle}</div>
        <div style="display:flex; flex-wrap:wrap; gap:2px;">${taskHtml}</div>
        ${quest.dependencies.length > 0 ? `<div style="margin-top:3px; font-size:9px; color:#78350f;">⬅ ${quest.dependencies.length} dep(s)</div>` : ''}
      </div>
      <div style="text-align:center; font-size:8px; color:#334155; margin-top:1px; letter-spacing:0.05em;">${quest.id}</div>
    `;
    
    node.addEventListener('mousedown', (e) => {
      if(e.button !== 0) return;
      e.stopPropagation();
      if(questState.linkSource !== null) {
        if(questState.linkSource !== quest.id && !quest.dependencies.includes(questState.linkSource)) {
          quest.dependencies.push(questState.linkSource);
          saveQuestState();
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
    
    fragment.appendChild(node);
  });
  
  nodesContainer.appendChild(fragment);
  
  const statusBar = document.getElementById('quest-status-bar');
  if(statusBar) {
    statusBar.innerHTML = `
      <span class="status-chip">${Math.round(questState.canvasScale * 100)}%</span>
      <span class="status-chip">${chapter.quests.length} quests</span>
      ${questState.linkSource ? `<span class="status-chip" style="background:#1e3a1e; color:#4ade80; border-color:#4ade80;">🔗 Click target quest to link dependency</span>` : ''}
    `;
  }
}

export function renderQuestEditor() {
  const container = document.getElementById('quest-editor-container');
  if(!container) return;
  
  const chapter = questState.chapters[questState.activeChapter];
  const quest = chapter ? chapter.quests.find(q => q.id === questState.selectedQuestId) : null;
  
  if(!quest) {
    container.innerHTML = `<div class="text-muted text-center" style="margin-top:20px;">No quest selected.</div>`;
    return;
  }
  
  // XSS Protection for Editor Inputs
  const safeTitle = escapeHtml(quest.title);
  const safeSubtitle = escapeHtml(quest.subtitle || '');
  
  let html = `
    <div style="font-size:9px; color:var(--muted); margin-bottom:8px; font-family:monospace; background:rgba(0,0,0,0.2); border-radius:3px; padding:2px 6px;">${quest.id}</div>
    
    <div class="input-group" style="padding:0; border:none; margin-bottom:8px;">
      <label>Title</label>
      <input type="text" id="qe-title" value="${safeTitle}">
    </div>
    
    <div class="input-group" style="padding:0; border:none; margin-bottom:8px;">
      <label>Subtitle</label>
      <input type="text" id="qe-subtitle" value="${safeSubtitle}">
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
          const depName = escapeHtml(depObj ? depObj.title : depId);
          return `<div style="display:flex; align-items:center; gap:4px;">
                    <span style="flex:1; font-size:10px; color:var(--green); background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${depName}</span>
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
      <input type="text" value="${escapeHtml(line)}" class="qe-desc-line" data-index="${i}" style="flex:1;">
      <button class="btn-del-desc icon-btn" data-index="${i}" style="color:#ff4466; font-size:14px;">×</button>
    `;
    descContainer.appendChild(div);
  });
  
  const tasksContainer = document.getElementById('qe-tasks');
  quest.tasks.forEach(t => {
    const div = document.createElement('div');
    div.style.cssText = "display:flex; gap:4px; margin-bottom:4px; align-items:center;";
    div.innerHTML = `
      <span style="font-size:10px; color:var(--muted); width:40px; overflow:hidden;">${escapeHtml(t.taskType)}</span>
      <input type="text" value="${escapeHtml(t.item)}" class="qe-task-item" data-id="${t.id}" style="flex:1;">
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
      <span style="font-size:10px; color:var(--muted); width:40px; overflow:hidden;">${escapeHtml(r.rewardType)}</span>
      <input type="text" value="${escapeHtml(r.item)}" class="qe-reward-item" data-id="${r.id}" style="flex:1;">
      <input type="number" value="${r.count || 1}" class="qe-reward-count" data-id="${r.id}" style="width:40px;" ${r.rewardType === 'command' ? 'disabled' : ''}>
      <button class="btn-del-reward icon-btn" data-id="${r.id}" style="color:#ff4466; font-size:14px;">×</button>
    `;
    rewardsContainer.appendChild(div);
  });
  
  // Re-bind Editor Events
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