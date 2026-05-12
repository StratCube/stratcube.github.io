// --- STATE MANAGEMENT ---
let state = {
  name: "My Modpack",
  mcVersion: "",
  loader: "fabric",
  loaderVersion: "",
  shaderLoader: "none",
  mods:[] // Array of { id, slug, title, category, custom }
};

const STORAGE_KEY = "modpackgen_state";

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) state = { ...state, ...JSON.parse(saved) };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderModList();
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
  loadState();
  bindUI();
  await fetchGameVersions();
  populateForm();
  renderModList();
  loadAddons();
});

// --- UI BINDINGS ---
function bindUI() {
  // Activity Bar
  document.querySelectorAll('.activity-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.activity-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.remove('hidden');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  // Center Tabs
  document.querySelectorAll('.center-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.center-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.remove('hidden');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  // Form Inputs
  const elName = document.getElementById('pack-name');
  const elMcVersion = document.getElementById('mc-version');
  const elLoader = document.getElementById('pack-loader');
  const elLoaderVer = document.getElementById('loader-version');
  const elShader = document.getElementById('shader-loader');

  elName.addEventListener('input', e => { state.name = e.target.value; saveState(); });
  elLoaderVer.addEventListener('input', e => { state.loaderVersion = e.target.value; saveState(); });
  elShader.addEventListener('change', e => { state.shaderLoader = e.target.value; saveState(); });

  elMcVersion.addEventListener('change', e => {
    if(state.mods.length > 0) {
      if(!confirm("Changing Minecraft version will clear all current mods. Proceed?")) {
        e.target.value = state.mcVersion; return;
      }
      state.mods =[];
    }
    state.mcVersion = e.target.value;
    saveState();
  });

  elLoader.addEventListener('change', e => {
    if(state.mods.length > 0) {
      if(!confirm("Changing Mod Loader will clear all current mods. Proceed?")) {
        e.target.value = state.loader; return;
      }
      state.mods =[];
    }
    state.loader = e.target.value;
    saveState();
  });

  // Search
  document.getElementById('btn-search').addEventListener('click', () => {
    const query = document.getElementById('mod-search').value;
    if(query.trim()) searchModrinth(query);
  });
  document.getElementById('mod-search').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') document.getElementById('btn-search').click();
  });

  // Custom Mod
  document.getElementById('btn-add-custom').addEventListener('click', () => {
    document.getElementById('custom-mod-input').click();
  });
  document.getElementById('custom-mod-input').addEventListener('change', (e) => {
    for(let file of e.target.files) {
      state.mods.push({
        id: 'custom-' + Date.now() + Math.random(),
        slug: file.name,
        title: file.name,
        category: 'Custom',
        custom: true
      });
    }
    saveState();
    e.target.value = ''; // Reset
  });
}

function populateForm() {
  document.getElementById('pack-name').value = state.name;
  document.getElementById('pack-loader').value = state.loader;
  document.getElementById('loader-version').value = state.loaderVersion;
  document.getElementById('shader-loader').value = state.shaderLoader;
}

// --- API & DATA FETCHING ---
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

    if(!state.mcVersion || !releases.includes(state.mcVersion)) {
      state.mcVersion = releases[0];
    }
    select.value = state.mcVersion;
  } catch (err) {
    console.error("Failed to fetch game versions", err);
  }
}

async function searchModrinth(query) {
  if(!state.mcVersion || !state.loader) return alert("Select MC Version and Loader first!");
  
  const resultsDiv = document.getElementById('search-results');
  resultsDiv.innerHTML = '<span class="text-muted">Searching...</span>';
  
  try {
    // URL Encode Facets for Modrinth API: project_type=mod, versions=mcVersion, categories=loader
    const facets = `[["project_type:mod"],["versions:${state.mcVersion}"],["categories:${state.loader}"]]`;
    const res = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=15`);
    const data = await res.json();
    
    resultsDiv.innerHTML = '';
    if(data.hits.length === 0) {
      resultsDiv.innerHTML = '<span class="text-muted">No mods found for this configuration.</span>';
      return;
    }

    data.hits.forEach(hit => {
      const isAdded = state.mods.some(m => m.id === hit.project_id);
      
      const div = document.createElement('div');
      div.className = 'mod-card';
      div.innerHTML = `
        <div class="mod-info">
          <h4>${hit.title}</h4>
          <p>${hit.description}</p>
        </div>
        <button class="btn-primary" ${isAdded ? 'disabled' : ''}>
          ${isAdded ? 'Added' : 'Add'}
        </button>
      `;

      if(!isAdded) {
        div.querySelector('button').addEventListener('click', () => {
          let cat = hit.categories && hit.categories.length > 0 ? hit.categories[0] : 'Utility';
          if(hit.categories && hit.categories.includes('shader')) cat = 'Shader'; // Shaders rule
          
          state.mods.push({
            id: hit.project_id,
            slug: hit.slug,
            title: hit.title,
            category: cat.charAt(0).toUpperCase() + cat.slice(1),
            custom: false
          });
          saveState();
          searchModrinth(query); // Refresh buttons
        });
      }
      resultsDiv.appendChild(div);
    });
  } catch (err) {
    resultsDiv.innerHTML = '<span class="text-muted">Error searching Modrinth.</span>';
  }
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
        <button class="btn-primary w-full">Check & Install</button>
      `;

      div.querySelector('button').addEventListener('click', async (e) => {
        if(!state.mcVersion || !state.loader) return alert("Set MC version and loader!");
        const btn = e.target;
        btn.textContent = "Checking...";
        btn.disabled = true;

        let addedCount = 0;
        for(let slug of addon.mods) {
          if(state.mods.some(m => m.slug === slug)) continue; // Already added

          try {
            // Check compatibility
            const verRes = await fetch(`https://api.modrinth.com/v2/project/${slug}/version?loaders=["${state.loader}"]&game_versions=["${state.mcVersion}"]`);
            const versions = await verRes.json();

            if(versions && versions.length > 0) {
              // Get project info for Title and Categories
              const projRes = await fetch(`https://api.modrinth.com/v2/project/${slug}`);
              const proj = await projRes.json();
              
              let cat = proj.categories && proj.categories.length > 0 ? proj.categories[0] : 'Utility';
              state.mods.push({
                id: proj.id,
                slug: proj.slug,
                title: proj.title,
                category: cat.charAt(0).toUpperCase() + cat.slice(1),
                custom: false
              });
              addedCount++;
            } else {
              console.warn(`${slug} incompatible with ${state.loader} ${state.mcVersion}`);
            }
          } catch(e) {
            console.error(`Failed to fetch addon mod ${slug}`);
          }
        }
        saveState();
        btn.textContent = addedCount > 0 ? `Added ${addedCount} mods!` : "None Compatible / Already Added";
        setTimeout(() => { btn.textContent = "Check & Install"; btn.disabled = false; }, 2000);
      });

      container.appendChild(div);
    });
  } catch (err) {
    document.getElementById('addons-list').innerHTML = '<span class="text-muted p-2">No data.json found or invalid format.</span>';
  }
}

// --- RENDERING MOD LIST ---
function renderModList() {
  const container = document.getElementById('mod-list-container');
  container.innerHTML = '';

  if(state.mods.length === 0) {
    container.innerHTML = '<p class="text-muted text-xs text-center mt-2">No mods added.</p>';
    return;
  }

  // Group by category
  const groups = {};
  state.mods.forEach(mod => {
    let c = mod.category || 'Unknown';
    if(c.toLowerCase() === 'shaders') c = 'Shader'; // Normalization
    if(!groups[c]) groups[c] = [];
    groups[c].push(mod);
  });

  // Extract 'Shader' to render it last
  let shaderGroup = groups['Shader'] || [];
  delete groups['Shader'];

  // Render normal categories
  for(let [cat, mods] of Object.entries(groups).sort()) {
    container.appendChild(createCategoryDOM(cat, mods));
  }

  // Render Shaders bottom-most
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
      <span class="mod-item-name" title="${mod.title}">${mod.title}</span>
      <button class="mod-item-del" title="Remove">&times;</button>
    `;
    item.querySelector('.mod-item-del').addEventListener('click', () => {
      state.mods = state.mods.filter(m => m.id !== mod.id);
      saveState();
      // If we are on the Modrinth tab, we might need to refresh search results to show "Add" again
      const query = document.getElementById('mod-search').value;
      if(query) searchModrinth(query);
    });
    div.appendChild(item);
  });
  return div;
}
