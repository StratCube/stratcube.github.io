import { state, loadState, saveState, onStateChange, addCustomFile, loadQuestState } from './state.js';
import { fetchGameVersions, resolveDependencies } from './api.js';
import { renderModList, executeSearch, renderAddons } from './ui.js';
import { debounce } from './utils.js';
import { initQuests, triggerQuestRenders } from './quests.js';
import { exportMrPack, exportQuestsZip } from './export.js';

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved states from LocalStorage
  loadState();
  loadQuestState();
  
  // Register state listener for UI updates (this will now re-render the mod list on addon install)
  onStateChange(() => {
    renderModList();
    triggerSearch(); // Re-run search to update "Add" buttons
  });
  
  // Bind UI interactions
  bindNavigation();
  bindFormInputs();
  bindExportButtons();
  
  // Fetch required data and initialize sub-systems
  await populateGameVersions();
  await initQuests();
  await renderAddons(); // <-- ADDED THIS LINE to load and display addons
  
  // Initial renders
  renderModList();
  triggerSearch();
});

function bindNavigation() {
  // Left Sidebar Activity Tabs
  document.querySelectorAll('.activity-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.activity-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.add('hidden'));
      
      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.dataset.target);
      targetPanel.classList.remove('hidden');
      targetPanel.classList.add('active');
    });
  });

  // Center Main Workspace Tabs
  document.querySelectorAll('.center-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.center-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
      
      btn.classList.add('active');
      const targetPane = document.getElementById(btn.dataset.target);
      targetPane.classList.remove('hidden');
      targetPane.classList.add('active');
      
      // Swap Right Sidebar context based on selected center tab
      if (btn.dataset.target === 'tab-quests') {
        document.getElementById('right-mods-view').classList.add('hidden');
        document.getElementById('right-quest-view').classList.remove('hidden');
        triggerQuestRenders(); 
      } else {
        document.getElementById('right-mods-view').classList.remove('hidden');
        document.getElementById('right-quest-view').classList.add('hidden');
      }
    });
  });
}

function bindFormInputs() {
  // Pack Info Inputs
  document.getElementById('pack-name').value = state.name;
  document.getElementById('pack-name').addEventListener('input', e => { state.name = e.target.value; saveState(); });

  document.getElementById('loader-version').value = state.loaderVersion;
  document.getElementById('loader-version').addEventListener('input', e => { state.loaderVersion = e.target.value; saveState(); });

  // Game/Loader changes (with confirmation to clear mods)
  document.getElementById('mc-version').addEventListener('change', e => handleClearStateConfirm(e, 'mcVersion', "Changing Minecraft version will clear all current mods. Proceed?"));
  document.getElementById('pack-loader').addEventListener('change', e => handleClearStateConfirm(e, 'loader', "Changing Mod Loader will clear all current mods. Proceed?"));

  // Mod Search UI (Debounced)
  const debouncedSearch = debounce(triggerSearch, 300);
  document.getElementById('mod-search').addEventListener('input', debouncedSearch);
  document.getElementById('search-source').addEventListener('change', triggerSearch);
  document.getElementById('search-category').addEventListener('change', triggerSearch);

  // Auto-Dependency Button
  document.getElementById('btn-auto-dep').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.textContent = "Resolving...";
    btn.disabled = true;
    
    const addedCount = await resolveDependencies();
    btn.textContent = addedCount > 0 ? `Added ${addedCount} mods` : "All good!";
    
    // Only save state if mods were actually added
    if (addedCount > 0) saveState();
    
    setTimeout(() => { btn.textContent = "Resolve Dependencies"; btn.disabled = false; }, 3000);
  });

  // Custom Mod Upload
  document.getElementById('btn-add-custom').addEventListener('click', () => document.getElementById('custom-mod-input').click());
  document.getElementById('custom-mod-input').addEventListener('change', (e) => {
    for(let file of e.target.files) {
      addCustomFile({
        id: 'custom-' + Date.now() + Math.random(), 
        slug: file.name, 
        title: file.name, 
        category: 'Custom', 
        custom: true
      }, file);
    }
    e.target.value = '';
  });
}

function bindExportButtons() {
  // Bind the .mrpack exports
  const exportButtons = document.querySelectorAll('.btn-export:not(#btn-export-quests)');
  exportButtons.forEach(btn => {
    btn.addEventListener('click', exportMrPack);
  });

  // Bind the Quests ZIP export
  const exportQuestsBtn = document.getElementById('btn-export-quests');
  if (exportQuestsBtn) {
    exportQuestsBtn.addEventListener('click', exportQuestsZip);
  }
}

function handleClearStateConfirm(e, stateKey, msg) {
  if(state.mods.length > 0) {
    if(!confirm(msg)) { 
      e.target.value = state[stateKey]; 
      return; 
    }
    state.mods = []; 
  }
  state[stateKey] = e.target.value;
  saveState();
  triggerSearch();
}

async function populateGameVersions() {
  const versions = await fetchGameVersions();
  const select = document.getElementById('mc-version');
  select.innerHTML = '';
  
  versions.forEach(ver => {
    const opt = document.createElement('option');
    opt.value = ver; 
    opt.textContent = ver;
    select.appendChild(opt);
  });
  
  if(!state.mcVersion || !versions.includes(state.mcVersion)) {
    state.mcVersion = versions[0];
  }
  select.value = state.mcVersion;
  document.getElementById('pack-loader').value = state.loader;
}

function triggerSearch() {
  if(!state.mcVersion || !state.loader) return;
  const query = document.getElementById('mod-search').value.trim();
  const source = document.getElementById('search-source').value;
  const category = document.getElementById('search-category').value;
  const resultsDiv = document.getElementById('search-results');
  
  executeSearch(query, source, category, resultsDiv);
}
