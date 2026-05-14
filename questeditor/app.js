// Data Models
const state = {
  activeSidebar: 'panel-info',
  activeCenterTab: 'tab-search',
  selectedMods: new Set(),
  
  // Canvas logic
  canvasConfig: {
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    startX: 0,
    startY: 0
  },
  
  questNodes: []
};

// --- TAB SWITCHING LOGIC ---
document.querySelectorAll('.activity-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    // UI Update
    document.querySelectorAll('.activity-tab').forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    // Panel Update
    const targetId = e.currentTarget.getAttribute('data-target');
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(targetId).classList.remove('hidden');
    state.activeSidebar = targetId;
  });
});

document.querySelectorAll('.center-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    // UI Update
    document.querySelectorAll('.center-tab').forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    // Panel Update
    const targetId = e.currentTarget.getAttribute('data-target');
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    document.getElementById(targetId).classList.remove('hidden');
    state.activeCenterTab = targetId;
  });
});


// --- MOD LIST LOGIC (STUB) ---
const modListContainer = document.getElementById('mod-list-container');
document.getElementById('btn-add-custom').addEventListener('click', () => {
  const modName = prompt("Enter Custom Mod ID/Name:");
  if (modName && !state.selectedMods.has(modName)) {
    state.selectedMods.add(modName);
    renderModList();
  }
});

function renderModList() {
  modListContainer.innerHTML = `<div class="mod-category-title">Selected Mods</div>`;
  state.selectedMods.forEach(mod => {
    const el = document.createElement('div');
    el.className = 'mod-item';
    el.innerHTML = `
      <span class="mod-item-name">${mod}</span>
      <button class="mod-item-del" data-mod="${mod}">×</button>
    `;
    modListContainer.appendChild(el);
  });

  // Attach delete handlers
  document.querySelectorAll('.mod-item-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.selectedMods.delete(e.target.getAttribute('data-mod'));
      renderModList();
    });
  });
}


// --- QUEST CANVAS LOGIC ---
const canvasContainer = document.getElementById('quest-canvas-container');
const canvas = document.getElementById('quest-canvas');

// Panning
canvasContainer.addEventListener('mousedown', (e) => {
  if (e.target.classList.contains('quest-node')) return; // Don't pan if clicking a node
  state.canvasConfig.isDragging = true;
  state.canvasConfig.startX = e.clientX - state.canvasConfig.offsetX;
  state.canvasConfig.startY = e.clientY - state.canvasConfig.offsetY;
});

window.addEventListener('mouseup', () => {
  state.canvasConfig.isDragging = false;
});

window.addEventListener('mousemove', (e) => {
  if (!state.canvasConfig.isDragging) return;
  
  state.canvasConfig.offsetX = e.clientX - state.canvasConfig.startX;
  state.canvasConfig.offsetY = e.clientY - state.canvasConfig.startY;
  
  canvas.style.transform = `translate(${state.canvasConfig.offsetX}px, ${state.canvasConfig.offsetY}px)`;
  
  // Pan background grid
  canvasContainer.style.backgroundPosition = `${state.canvasConfig.offsetX}px ${state.canvasConfig.offsetY}px`;
});

// Render Nodes
function renderQuestCanvas() {
  canvas.innerHTML = ''; // clear
  state.questNodes.forEach(node => {
    const el = document.createElement('div');
    el.className = 'quest-node';
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    
    // First letter of title as icon placeholder
    el.innerHTML = `
      ${node.title.charAt(0).toUpperCase()}
      <div class="quest-node-label">${node.title}</div>
    `;
    
    canvas.appendChild(el);
  });
}

// Add Node Button
document.getElementById('btn-add-node').addEventListener('click', () => {
  state.questNodes.push({
    id: Date.now().toString(16), // basic hex ID
    title: `Quest Node ${state.questNodes.length + 1}`,
    x: (-state.canvasConfig.offsetX) + (canvasContainer.clientWidth / 2),
    y: (-state.canvasConfig.offsetY) + (canvasContainer.clientHeight / 2)
  });
  renderQuestCanvas();
});


// --- BLUEPRINT AUTO-GENERATOR LOGIC ---
document.getElementById('btn-generate-blueprints').addEventListener('click', () => {
  if (state.selectedMods.size === 0) {
    alert("Please add some mods to your list first!");
    return;
  }

  // Switch to Quest Tab
  document.querySelector('[data-target="tab-quests"]').click();

  // Create a spaced-out grid of quests based on the selected mods
  let index = 0;
  state.selectedMods.forEach(mod => {
    // Dummy layout logic: place them in a line
    state.questNodes.push({
      id: Date.now().toString(16) + index,
      title: `${mod} Basics`,
      x: 100 + (index * 120),
      y: 100
    });
    index++;
  });

  // Reset View
  state.canvasConfig.offsetX = 0;
  state.canvasConfig.offsetY = 0;
  canvas.style.transform = `translate(0px, 0px)`;
  canvasContainer.style.backgroundPosition = `0px 0px`;

  renderQuestCanvas();
});

document.getElementById('btn-clear-canvas').addEventListener('click', () => {
  state.questNodes = [];
  renderQuestCanvas();
});


// Init Setup
state.selectedMods.add("Create");
state.selectedMods.add("Mekanism");
renderModList();
renderQuestCanvas();
