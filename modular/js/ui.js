import { state, saveState, removeCustomFile } from './state.js';
import { escapeHtml } from './utils.js';
import { searchModrinth, searchCurseForge, fetchModrinthVersionData } from './api.js';

// THIS MUST HAVE THE 'export' KEYWORD
export async function executeSearch(query, source, category, resultsDiv) {
  resultsDiv.innerHTML = '<span class="text-muted">Searching...</span>';
  try {
    let hits = source === 'modrinth' ? await searchModrinth(query, category) : await searchCurseForge(query, category);
    renderSearchResults(hits, resultsDiv, source);
  } catch (err) {
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
    
    // Hardened Template Injection
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
          } catch(e) { console.error(e); }
        } else {
            mrpackData = { isCurseForge: true };
        }

        state.mods.push({
          id, slug, title,
          category: defaultCat.charAt(0).toUpperCase() + defaultCat.slice(1),
          custom: false, source, mrpackData
        });
        saveState();
      });
    }
    fragment.appendChild(div);
  });
  container.appendChild(fragment);
}

export function renderModList() {
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

  const fragment = document.createDocumentFragment();
  for(let [cat, mods] of Object.entries(groups).sort()) fragment.appendChild(createCategoryDOM(cat, mods));
  if(shaderGroup.length > 0) fragment.appendChild(createCategoryDOM('Shader', shaderGroup));
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
    item.innerHTML = `
      <span class="mod-item-name" title="${escapeHtml(mod.title)}">${mod.source === 'curseforge' ? '🔥 ' : ''}${escapeHtml(mod.title)}</span>
      <button class="mod-item-del" title="Remove">&times;</button>
    `;
    item.querySelector('.mod-item-del').addEventListener('click', () => {
      state.mods = state.mods.filter(m => m.id !== mod.id);
      removeCustomFile(mod.id);
      saveState();
    });
    div.appendChild(item);
  });
  return div;
}
