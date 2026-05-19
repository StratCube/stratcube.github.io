import { state } from './state.js';

const cache = new Map();

async function cachedFetch(url, signal) {
  if (cache.has(url)) return cache.get(url);
  
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  const data = await res.json();
  
  cache.set(url, data);
  return data;
}

// Determines the loaders array dynamically. Includes fabric if Sinytra is enabled on Forge/NeoForge.
export function getLoaders() {
  if (state.sinytraEnabled && (state.loader === 'forge' || state.loader === 'neoforge')) {
    return [state.loader, "fabric"];
  }
  return [state.loader];
}

export async function fetchGameVersions() {
  try {
    const data = await cachedFetch('https://api.modrinth.com/v2/tag/game_version');
    return data.filter(v => v.version_type === 'release').map(v => v.version);
  } catch (err) {
    console.error("Failed to fetch game versions", err);
    return [];
  }
}

export async function searchModrinth(query, category, signal) {
  // Use OR logic for Modrinth Facets if Sinytra is enabled
  const loaderFacet = state.sinytraEnabled && (state.loader === 'forge' || state.loader === 'neoforge') 
    ? [`categories:${state.loader}`, `categories:fabric`] 
    : [`categories:${state.loader}`];

  const facetsArr = [["project_type:mod"], [`versions:${state.mcVersion}`], loaderFacet];
  if (category) facetsArr.push([`categories:${category}`]);
  
  const params = new URLSearchParams({
    query: query,
    facets: JSON.stringify(facetsArr),
    limit: 15
  });
  
  const res = await fetch(`https://api.modrinth.com/v2/search?${params}`, { signal });
  if (!res.ok) throw new Error("Modrinth API Error");
  return (await res.json()).hits;
}

export async function searchCurseForge(query, category, signal) {
  let apiKey = localStorage.getItem('cf_api_key');
  if(!apiKey) {
    apiKey = prompt("CurseForge API requires an API key.\nEnter your key:");
    if(apiKey) localStorage.setItem('cf_api_key', apiKey);
    else throw new Error("No API Key");
  }

  let cfLoader = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }[state.loader] || 4;
  
  // CurseForge API doesn't support an array of loaders, so we request "Any" (0) if Sinytra is enabled
  if (state.sinytraEnabled && (state.loader === 'forge' || state.loader === 'neoforge')) {
    cfLoader = 0; 
  }

  const params = new URLSearchParams({
    gameId: 432, classId: 6, searchFilter: query,
    gameVersion: state.mcVersion, modLoaderType: cfLoader,
    sortField: 2, sortOrder: "desc", pageSize: 15
  });

  const res = await fetch(`https://api.curseforge.com/v1/mods/search?${params}`, {
    signal,
    headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
  });
  
  if(!res.ok) {
    if(res.status === 403) localStorage.removeItem('cf_api_key');
    throw new Error("CORS or Invalid Key");
  }
  return (await res.json()).data;
}

export async function resolveDependencies() {
  let addedCount = 0;
  let queue = state.mods.filter(m => m.source === 'modrinth').map(m => m.id); 
  let processed = new Set(state.mods.map(m => m.id));

  const params = new URLSearchParams({
    loaders: JSON.stringify(getLoaders()), // <-- Fetch fabric deps natively if Sinytra is on
    game_versions: JSON.stringify([state.mcVersion])
  });

  while(queue.length > 0) {
    const currentId = queue.shift();
    try {
      const url = `https://api.modrinth.com/v2/project/${currentId}/version?${params}`;
      const versions = await cachedFetch(url);
      if(versions.length === 0 || !versions[0].dependencies) continue;

      for(let dep of versions[0].dependencies) {
        if(dep.dependency_type === 'required' && dep.project_id && !processed.has(dep.project_id)) {
          processed.add(dep.project_id);
          
          const proj = await fetchModrinthProjectData(dep.project_id);
          const depVersions = await fetchModrinthVersionData(proj.id);
          
          if(depVersions.length > 0) {
            const file = depVersions[0].files.find(f => f.primary) || depVersions[0].files[0];
            let cat = proj.categories && proj.categories.length > 0 ? proj.categories[0] : 'Utility';
            if(proj.categories && proj.categories.includes('shader')) cat = 'Shader';

            state.mods.push({
              id: proj.id, slug: proj.slug, title: proj.title,
              category: cat.charAt(0).toUpperCase() + cat.slice(1),
              custom: false, source: 'modrinth',
              mrpackData: {
                path: "mods/" + file.filename,
                hashes: { sha1: file.hashes.sha1, sha512: file.hashes.sha512 },
                env: { client: "required", server: "required" },
                downloads: [file.url], fileSize: file.size
              }
            });
            addedCount++;
            queue.push(proj.id); 
          }
        }
      }
    } catch(e) { console.error("Resolver error for", currentId, e); }
  }
  return addedCount;
}

export async function fetchModrinthVersionData(slugOrId) {
  const params = new URLSearchParams({ 
    loaders: JSON.stringify(getLoaders()), 
    game_versions: JSON.stringify([state.mcVersion]) 
  });
  const url = `https://api.modrinth.com/v2/project/${slugOrId}/version?${params}`;
  return await cachedFetch(url);
}

export async function fetchModrinthProjectData(slugOrId) {
  const url = `https://api.modrinth.com/v2/project/${slugOrId}`;
  return await cachedFetch(url);
}
