import { state, saveState, removeCustomFile } from './state.js';
import { escapeHtml } from './utils.js';
import { searchModrinth, searchCurseForge, fetchModrinthVersionData, fetchModrinthProjectData } from './api.js';

// --- TOAST SYSTEM (Hardened) ---
export function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  
  // Self-healing: Create container if it doesn't exist to prevent crashes
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  toast.innerHTML = `
    <div class="toast-title">${type.toUpperCase()}</div>
    <div class="toast-msg">${escapeHtml(message)}</div>
  `;
  
  container.appendChild(toast);
  
  // Smooth removal logic
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function createProgressToast(title) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast progress';
  
  toast.innerHTML = `
    <div class="toast-title">${escapeHtml(title)}</div>
    <div class="toast-msg">Initializing...</div>
  `;
  
  container.appendChild(toast);
  
  return {
    update: (msg) => {
      const msgEl = toast.querySelector('.toast-msg');
      if (msgEl) msgEl.textContent = msg;
    },
    remove: () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  };
}

// --- SEARCH LOGIC ---
let currentSearchController = null;

export async function executeSearch(query, source, category, resultsDiv) {
  if (currentSearchController) {
    currentSearchController.abort();
  }

  currentSearchController = new AbortController();
  const { signal } = currentSearchController;

  resultsDiv.innerHTML = '<span class="text-muted">Searching...</span>';
  
  try {
    let hits = source === 'modrinth' 
      ? await searchModrinth(query, category, signal) 
      : await searchCurseForge(query, category, signal);
      
    renderSearchResults(hits, resultsDiv, source);
  } catch (err) {
    if (err.name === 'AbortError') return;
    showToast(err.message, 'error');
    resultsDiv.innerHTML = `<span class="text-muted" style="color:#ff4466">Search Error: ${escapeHtml(err.message)}</span>`;
  }
}

export function renderSearchResults(hits, container, source) {
  container.innerHTML = '';
  if(hits.length === 0) {
    container.innerHTML = '<span class="text-muted">No mods found for this configuration.</span>';
    return;
  }

  const fragment = document.createDocumentFragment();

  hits.forEach(hit => {
    let id, title, desc, icon, slug, defaultCat;
    
    if (source === 'modrinth') {
      id = hit.project_id; slug = hit.slug; title = hit.title; desc = hit.description;
      icon = hit.icon_url || 'https://docs.modrinth.com/img/logo.svg';
      defaultCat = hit.categories && hit.categories.length > 0 ? hit.categories[0] : 'Utility';
    } else {
      id = hit.id.toString(); slug = hit.slug; title = hit.name; desc = hit.summary;
      icon = hit.logo ? hit.logo.thumbnailUrl : 'https://docs.modrinth.com/img/logo.svg';
      defaultCat = 'Utility';
    }

    const isAdded = state.mods.some(m => m.id === id);
    const div = document.createElement('div');
    div.className = 'mod-card';
    
    div.innerHTML = `
      <img src="${escapeHtml(icon)}" class="mod-icon" alt="icon">
      <div class="mod-info">
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(desc)}</p>
      </div>
      <button class="btn-primary" ${isAdded ? 'disabled' : ''}>${isAdded ? 'Added' : 'Add'}</button>
    `;

    if(!isAdded) {
      const btn = div.querySelector('button');
      btn.addEventListener('click', async () => {
        btn.textContent = "Adding...";
        btn.disabled = true;
        let mrpackData = null;

        if(source === 'modrinth') {
          try {
            const versions = await fetchModrinthVersionData(slug);
            if(versions.length > 0) {
              const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
              mrpackData = {
                path: "mods/" + file.filename,
                hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 },
                env: { client: "required", server: "required" },
                downloads: [file.url], fileSize: file.size
              };
            }
          } catch(e) { 
            console.error(e); 
            showToast("Failed to fetch mod file data", "error");
          }
        } else {
            mrpackData = { isCurseForge: true };
        }

        state.mods.push({
          id, slug, title,
          category: defaultCat.charAt(0).toUpperCase() + defaultCat.slice(1),
          custom: false, source, mrpackData
        });
        
        saveState(); // Update data first
        showToast(`${title} added to pack`, 'success'); // Show toast second
      });
    }
    fragment.appendChild(div);
  });
  container.appendChild(fragment);
}

export function renderModList() {
  const container = document.getElementById('mod-list-container');
  if (!container) return;
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

  const fragment = document.createDocumentFragment();
  for(let [cat, mods] of Object.entries(groups).sort()) {
    fragment.appendChild(createCategoryDOM(cat, mods));
  }
  if(shaderGroup.length > 0) {
    fragment.appendChild(createCategoryDOM('Shader', shaderGroup));
  }
  container.appendChild(fragment);
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
    // FIX: Changed escapeHml back to escapeHtml
    item.innerHTML = `
      <span class="mod-item-name" title="${escapeHtml(mod.title)}">${mod.source === 'curseforge' ? '🔥 ' : ''}${escapeHtml(mod.title)}</span>
      <button class="mod-item-del" title="Remove">&times;</button>
    `;
    item.querySelector('.mod-item-del').addEventListener('click', () => {
      state.mods = state.mods.filter(m => m.id !== mod.id);
      removeCustomFile(mod.id);
      saveState();
      showToast(`${mod.title} removed`, 'info');
    });
    div.appendChild(item);
  });
  return div;
}

export async function renderAddons() {
  const container = document.getElementById('addons-list');
  if (!container) return;

  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error("data.json not found");
    const data = await res.json();
    
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    data.addons.forEach(addon => {
      const div = document.createElement('div');
      div.className = 'addon-item';
      div.innerHTML = `
        <h4>${escapeHtml(addon.name)}</h4>
        <p>${escapeHtml(addon.description)}</p>
        <button class="btn-primary w-full">Install Addon</button>
      `;

      div.querySelector('button').addEventListener('click', async (e) => {
        if(!state.mcVersion || !state.loader) {
            showToast("Set MC version and loader first!", "error");
            return;
        }
        const btn = e.target;
        btn.textContent = "Installing...";
        btn.disabled = true;

        let added = 0;
        for(let slug of addon.mods) {
          if(state.mods.some(m => m.slug === slug)) continue; 
          try {
            const versions = await fetchModrinthVersionData(slug);
            if(versions && versions.length > 0) {
              const proj = await fetchModrinthProjectData(slug);
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
          } catch(err) {
            console.warn(`Could not install ${slug}:`, err);
          }
        }
        
        if (added > 0) {
            saveState();
            showToast(`Successfully added ${added} mods from ${addon.name}`, 'success');
        } else {
            showToast("All mods from this addon are already installed", "info");
        }
        
        btn.textContent = "Install Addon";
        btn.disabled = false;
      });
      fragment.appendChild(div);
    });
    container.appendChild(fragment);
  } catch (err) {
    container.innerHTML = `<span class="text-muted p-2">Failed to load Addons: ${escapeHtml(err.message)}</span>`;
  }
}
