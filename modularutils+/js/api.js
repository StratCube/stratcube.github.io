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
  // Logic: If Sinytra is enabled and we are on Forge/NeoForge, we search for BOTH Forge and Fabric
  let loaderFacet = state.loader;
  if (state.sinytraEnabled && (state.loader === 'forge' || state.loader === 'neoforge')) {
    loaderFacet = `${state.loader},fabric`;
  }

  const facetsArr = [["project_type:mod"], [`versions:${state.mcVersion}`], [`categories:${loaderFacet}`]];
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

  const cfLoader = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }[state.loader] || 4;
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
    loaders: JSON.stringify([state.loader]),
    game_versions: JSON.stringify([state.mcVersion])
  });

  // If Sinytra is on, also try to resolve Fabric versions of dependencies
  const altParams = new URLSearchParams({
    loaders: JSON.stringify(['fabric']),
    game_versions: JSON.stringify([state.mcVersion])
  });

  while(queue.length > 0) {
    const currentId = queue.shift();
    try {
      let versions = await fetchModrinthVersionData(currentId, params);
      
      // If no versions found and Sinytra is enabled, try Fabric versions
      if ((!versions || versions.length === 0) && state.sinytraEnabled && (state.loader === 'forge' || state.loader === 'neoforge')) {
        versions = await fetchModrinthVersionData(currentId, altParams);
      }

      if(!versions || versions.length === 0 || !versions[0].dependencies) continue;

      for(let dep of versions[0].dependencies) {
        if(dep.dependency_type === 'required' && dep.project_id && !processed.has(dep.project_id)) {
          processed.add(dep.project_id);
          
          const proj = await fetchModrinthProjectData(dep.project_id);
          
          // Same logic for dependency's version: check native loader first, then Fabric if Sinytra on
          let depVersions = await fetchModrinthVersionData(proj.id, params);
          if ((!depVersions || depVersions.length === 0) && state.sinytraEnabled && (state.loader === 'forge' || state.loader === 'neoforge')) {
            depVersions = await fetchModrinthVersionData(proj.id, altParams);
          }
          
          if(depVersions && depVersions.length > 0) {
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

export async function fetchModrinthVersionData(slugOrId, params = null) {
  if (!params) {
    params = new URLSearchParams({ loaders: JSON.stringify([state.loader]), game_versions: JSON.stringify([state.mcVersion]) });
  }
  const url = `https://api.modrinth.com/v2/project/${slugOrId}/version?${params}`;
  return await cachedFetch(url);
}

export async function fetchModrinthProjectData(slugOrId) {
  const url = `https://api.modrinth.com/v2/project/${slugOrId}`;
  return await cachedFetch(url);
}
