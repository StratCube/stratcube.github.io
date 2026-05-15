// --- STATE MANAGEMENT ---
let state = {
  name: "My Modpack",
  mcVersion: "",
  loader: "fabric",
  shaderLoader: "none",
  mods:[] // { id, slug, title, category, custom, source, mrpackData, fileBlob }
};

let customFiles =[]; // Holds actual File objects for custom uploaded mods during session

const STORAGE_KEY = "modpackgen_state";

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    state.name = parsed.name || "My Modpack";
    state.mcVersion = parsed.mcVersion || "";
    state.loader = parsed.loader || "fabric";
    state.shaderLoader = parsed.shaderLoader || "none";
    state.mods = parsed.mods ||[];
  }
}

function saveState() {
  // Save everything except full fileBlobs to avoid quota limits
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
  updateWebLLMState();
  loadAddons();
  searchMods(); // Trigger default search (popular mods)
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
      if(!confirm("Changing Minecraft version will clear all current mods. Proceed?")) {
        e.target.value = state.mcVersion; return;
      }
      state.mods = []; customFiles =[];
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
      state.mods = []; customFiles =[];
    }
    state.loader = e.target.value;
    saveState();
    searchMods();
  });

  // Search Logic
  document.getElementById('btn-search').addEventListener('click', searchMods);
  document.getElementById('mod-search').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') searchMods();
  });
  document.getElementById('search-source').addEventListener('change', searchMods);
  document.getElementById('search-category').addEventListener('change', searchMods);

  // Custom Mod Upload
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

  // Export Button
  document.getElementById('btn-export').addEventListener('click', exportMrPack);
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
    btn.innerHTML = `Download Quest Ai<br><span class="text-xs text-muted">Only download if you want quests</span>`;
  } else {
    btn.disabled = true;
    btn.textContent = "Requires 1.20.1 (Fabric/Forge)";
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
    
    // empty query automatically fetches top trending based on facets
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

  // ModLoader mapping for CF
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
    // Clear key if it's completely failing
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
      defaultCat = 'Utility'; // Simplified for CF
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
          // Fetch specific version data required for .mrpack
          try {
            const verRes = await fetch(`https://api.modrinth.com/v2/project/${slug}/version?loaders=["${state.loader}"]&game_versions=["${state.mcVersion}"]`);
            const versions = await verRes.json();
            if(versions.length > 0) {
              const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
              mrpackData = {
                path: "mods/" + file.filename,
                hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 },
                env: { client: "required", server: "required" },
                downloads: [file.url],
                fileSize: file.size
              };
            }
          } catch(e) { console.error("Failed to fetch version info", e); }
        } else {
            // Best effort for CF. Note: CF direct URLs often lack standard SHA hashes easily accessible without deeper API calls.
            mrpackData = { isCurseForge: true };
        }

        state.mods.push({
          id, slug, title,
          category: defaultCat.charAt(0).toUpperCase() + defaultCat.slice(1),
          custom: false, source, mrpackData
        });
        saveState();
        searchMods(); // Refresh ui
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
      searchMods(); // refresh UI buttons
    });
    div.appendChild(item);
  });
  return div;
}

// --- MRPACK EXPORT ---
async function exportMrPack() {
  if (state.mods.length === 0) return alert("Add some mods first!");
  if (!window.JSZip || !window.saveAs) return alert("Export libraries failed to load.");

  const btn = document.getElementById('btn-export');
  btn.textContent = "Generating...";
  btn.disabled = true;

  try {
    const zip = new JSZip();

    // 1. Generate modrinth.index.json
    const indexJson = {
      formatVersion: 1,
      game: "minecraft",
      versionId: "1.0.0",
      name: state.name || "Custom Modpack",
      dependencies: {
        minecraft: state.mcVersion,
      },
      files:[]
    };
    
    // Assign loader dependency
    indexJson.dependencies[`${state.loader}-loader`] = "*";

    // 2. Process Mods
    state.mods.forEach(mod => {
      if (mod.custom) {
        // Find Blob in memory
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

    // 3. Trigger Download
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, (state.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "modpack") + ".mrpack");
  } catch (err) {
    console.error(err);
    alert("Failed to export .mrpack!");
  } finally {
    btn.textContent = "Export as .mrpack";
    btn.disabled = false;
  }
}
