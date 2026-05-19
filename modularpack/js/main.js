import { state, loadState, saveState, onStateChange, addCustomFile, loadQuestState } from './state.js';
import { fetchGameVersions, resolveDependencies, fetchModrinthVersionData, fetchModrinthProjectData } from './api.js';
import { renderModList, executeSearch, renderAddons } from './ui.js';
import { debounce } from './utils.js';
import { initQuests, triggerQuestRenders } from './quests.js';
import { exportMrPack, exportQuestsZip } from './export.js';
import { initPackTools } from './packTools.js'; // NEW IMPORT

document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  loadQuestState();
  
  onStateChange(() => {
    renderModList();
    triggerSearch(); 
  });
  
  bindNavigation();
  bindFormInputs();
  bindExportButtons();
  
  await populateGameVersions();
  updateSinytraVisibility(); 

  await initQuests();
  await renderAddons();
  initPackTools(); // NEW INIT
  
  renderModList();
  triggerSearch();
});

function bindNavigation() {
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

  document.querySelectorAll('.center-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.center-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
      
      btn.classList.add('active');
      const targetPane = document.getElementById(btn.dataset.target);
      targetPane.classList.remove('hidden');
      targetPane.classList.add('active');
      
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
  document.getElementById('pack-name').value = state.name;
  document.getElementById('pack-name').addEventListener('input', e => { state.name = e.target.value; saveState(); });

  document.getElementById('loader-version').value = state.loaderVersion;
  document.getElementById('loader-version').addEventListener('input', e => { state.loaderVersion = e.target.value; saveState(); });

  document.getElementById('mc-version').addEventListener('change', e => handleClearStateConfirm(e, 'mcVersion', "Changing Minecraft version will clear all current mods. Proceed?"));
  document.getElementById('pack-loader').addEventListener('change', e => handleClearStateConfirm(e, 'loader', "Changing Mod Loader will clear all current mods. Proceed?"));

  const debouncedSearch = debounce(triggerSearch, 300);
  document.getElementById('mod-search').addEventListener('input', debouncedSearch);
  document.getElementById('search-source').addEventListener('change', triggerSearch);
  document.getElementById('search-category').addEventListener('change', triggerSearch);

  document.getElementById('btn-auto-dep').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.textContent = "Resolving...";
    btn.disabled = true;
    
    const addedCount = await resolveDependencies();
    btn.textContent = addedCount > 0 ? `Added ${addedCount} mods` : "All good!";
    
    if (addedCount > 0) saveState();
    setTimeout(() => { btn.textContent = "Resolve Dependencies"; btn.disabled = false; }, 3000);
  });

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

  const sinytraToggle = document.getElementById('sinytra-toggle');
  sinytraToggle.addEventListener('change', async (e) => {
    state.sinytraEnabled = e.target.checked;
    
    if (state.sinytraEnabled) {
      sinytraToggle.disabled = true;
      await installSinytraMods();
      sinytraToggle.disabled = false;
    } else {
      removeSinytraMods();
    }
    
    saveState();
    triggerSearch(); 
  });
}

function updateSinytraVisibility() {
  const sinytraGroup = document.getElementById('sinytra-group');
  const sinytraToggle = document.getElementById('sinytra-toggle');

  if (state.loader === 'forge' || state.loader === 'neoforge') {
    sinytraGroup.style.display = 'block';
    sinytraToggle.checked = state.sinytraEnabled;
  } else {
    sinytraGroup.style.display = 'none';
    if (state.sinytraEnabled) {
      state.sinytraEnabled = false;
      removeSinytraMods();
      saveState();
    }
  }
}

async function installSinytraMods() {
  const slugs = ['connector', 'connector-extras', 'forgified-fabric-api'];
  let added = 0;
  
  for (let slug of slugs) {
    if (state.mods.some(m => m.slug === slug)) continue;
    try {
      const versions = await fetchModrinthVersionData(slug);
      if (versions && versions.length > 0) {
        const proj = await fetchModrinthProjectData(slug);
        const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
        
        state.mods.push({
          id: proj.id, slug: proj.slug, title: proj.title,
          category: 'Utility', custom: false, source: 'modrinth',
          mrpackData: {
            path: "mods/" + file.filename,
            hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 },
            env: { client: "required", server: "required" },
            downloads: [file.url], fileSize: file.size
          }
        });
        added++;
      }
    } catch (err) {
      console.warn(`Could not auto-install Sinytra requirement: ${slug}`, err);
    }
  }
  
  if (added === 0 && slugs.some(s => !state.mods.some(m => m.slug === s))) {
    alert("Warning: Could not fetch Sinytra mods. Ensure they exist for this Minecraft version.");
  }
}

function removeSinytraMods() {
  const slugs = ['connector', 'connector-extras', 'forgified-fabric-api'];
  state.mods = state.mods.filter(m => !slugs.includes(m.slug));
}

function bindExportButtons() {
  document.querySelectorAll('.btn-export:not(#btn-export-quests)').forEach(btn => {
    btn.addEventListener('click', exportMrPack);
  });
  
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
  updateSinytraVisibility();
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
