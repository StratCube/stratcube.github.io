// Initialize Lucide Icons
lucide.createIcons();

const state = {
    selectedMods: [], // {id, slug, name, categories[]}
    searchTimeout: null
};

/**
 * INITIALIZATION
 */
async function init() {
    // 1. Populate Game Version Dropdown
    try {
        const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
        const data = await res.json();
        const select = document.getElementById('game-version');
        
        // Filter for major releases and populate
        data.filter(v => v.version_type === 'release').slice(0, 25).forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.version; 
            opt.textContent = v.version;
            select.appendChild(opt);
        });
        select.value = "1.20.1"; // Default starting version
    } catch (e) {
        console.error("Error fetching game versions:", e);
    }

    // 2. Load Addons from data.json
    try {
        const addonRes = await fetch('data.json');
        const addonData = await addonRes.json();
        const list = document.getElementById('addon-list');
        
        addonData.addons.forEach(addon => {
            const btn = document.createElement('button');
            btn.className = 'addon-btn';
            btn.innerHTML = `<i data-lucide="plus-circle" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:5px"></i> ${addon.name}`;
            btn.onclick = () => addAddon(addon.mods);
            list.appendChild(btn);
        });
        lucide.createIcons();
    } catch (e) {
        console.error("Error loading addons:", e);
    }

    // 3. Initial "Featured" Search (Empty state)
    search();
}

/**
 * COMPATIBILITY LOGIC
 */

// Checks if a single project has a version for the current UI settings
async function checkCompatibility(projectId) {
    const loader = document.getElementById('mod-loader').value;
    const version = document.getElementById('game-version').value;
    try {
        const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version?loaders=["${loader}"]&game_versions=["${version}"]`);
        const data = await res.json();
        return data.length > 0;
    } catch (e) {
        return false;
    }
}

// Runs when Loader or Version changes: removes mods that are no longer compatible
async function validateAllMods() {
    const loader = document.getElementById('mod-loader').value;
    const version = document.getElementById('game-version').value;
    
    // Show loading state on selection
    document.getElementById('mod-count-tag').textContent = "Validating...";

    const validMods = [];
    for (const mod of state.selectedMods) {
        const isOk = await checkCompatibility(mod.id);
        if (isOk) {
            validMods.push(mod);
        }
    }
    
    state.selectedMods = validMods;
    renderWorkspace();
    search(); // Refresh search results to match new compatibility
}

/**
 * ADDON & MOD MANAGEMENT
 */

async function addAddon(slugs) {
    for (const slug of slugs) {
        try {
            const res = await fetch(`https://api.modrinth.com/v2/project/${slug}`);
            if (!res.ok) continue;
            const mod = await res.json();
            
            const isOk = await checkCompatibility(mod.id);
            if (isOk && !state.selectedMods.find(m => m.id === mod.id)) {
                state.selectedMods.push({
                    id: mod.id,
                    slug: mod.slug,
                    name: mod.title,
                    categories: mod.categories
                });
            }
        } catch (e) {
            console.error("Error adding addon mod:", slug, e);
        }
    }
    renderWorkspace();
}

window.addOneMod = (id, slug, name, cats) => {
    if (state.selectedMods.find(m => m.id === id)) return;
    state.selectedMods.push({ 
        id, 
        slug, 
        name, 
        categories: cats.split(',') 
    });
    renderWorkspace();
};

window.removeMod = (id) => {
    state.selectedMods = state.selectedMods.filter(m => m.id !== id);
    renderWorkspace();
};

/**
 * SEARCH LOGIC
 */

async function search() {
    const query = document.getElementById('mod-search').value.trim();
    const loader = document.getElementById('mod-loader').value;
    const version = document.getElementById('game-version').value;
    const container = document.getElementById('search-results');

    // Show a small loading indicator or just clear
    container.style.opacity = "0.5";

    // Build facets for filtered search
    // If query is empty, we search for most downloaded mods (popular)
    let url = `https://api.modrinth.com/v2/search?facets=[["categories:${loader}"],["versions:${version}"],["project_type:mod"]]`;
    
    if (query.length > 0) {
        url += `&query=${encodeURIComponent(query)}`;
    } else {
        // Default "Home Page" sorting: by downloads
        url += `&index=downloads`;
    }

    try {
        const res = await fetch(url);
        const data = await res.json();
        
        container.innerHTML = '';
        container.style.opacity = "1";

        if (data.hits.length === 0) {
            container.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--dim)">No compatible mods found for ${loader} ${version}</div>`;
            return;
        }

        data.hits.forEach(hit => {
            const isAdded = state.selectedMods.find(m => m.id === hit.project_id);
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `
                <img src="${hit.icon_url || 'https://modrinth.com/img/placeholder.svg'}" alt="icon" onerror="this.src='https://modrinth.com/img/placeholder.svg'">
                <div class="item-info">
                    <h4>${hit.title}</h4>
                    <p>${hit.description ? hit.description.substring(0, 70) : 'No description available'}...</p>
                </div>
                <button class="icon-btn" ${isAdded ? 'style="background:var(--border);cursor:default"' : ''} 
                    onclick="addOneMod('${hit.project_id}', '${hit.slug}', '${hit.title.replace(/'/g, "\\'")}', '${hit.categories.join(',')}')">
                    <i data-lucide="${isAdded ? 'check' : 'plus'}"></i>
                </button>
            `;
            container.appendChild(div);
        });
        lucide.createIcons();
    } catch (e) {
        console.error("Search error:", e);
        container.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--danger)">Search failed. Check your connection.</div>`;
    }
}

// Debounced search input
document.getElementById('mod-search').oninput = () => {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => {
        search();
    }, 300); // Wait 300ms after user stops typing
};

/**
 * UI RENDERING
 */

function renderWorkspace() {
    const container = document.getElementById('manifest-content');
    container.innerHTML = '';
    
    if (state.selectedMods.length === 0) {
        container.innerHTML = `<div style="padding:2rem; text-align:center; color:var(--dim); font-size:0.8rem">No mods selected</div>`;
        document.getElementById('mod-count-tag').textContent = "0";
        return;
    }

    // Grouping by Modrinth Categories
    const groups = {};
    state.selectedMods.forEach(mod => {
        // Use the first category tag as the primary group
        const primaryCat = mod.categories[0] || 'general';
        if (!groups[primaryCat]) groups[primaryCat] = [];
        groups[primaryCat].push(mod);
    });

    // Render each group
    Object.keys(groups).sort().forEach(cat => {
        const section = document.createElement('div');
        section.className = 'cat-block';
        section.innerHTML = `<div class="cat-title">${cat.replace(/-/g, ' ')}</div>`;
        
        groups[cat].forEach(mod => {
            const pill = document.createElement('div');
            pill.className = 'mod-pill';
            pill.innerHTML = `
                <span>${mod.name}</span>
                <button class="rm-btn" onclick="removeMod('${mod.id}')"><i data-lucide="x"></i></button>
            `;
            section.appendChild(pill);
        });
        container.appendChild(section);
    });

    document.getElementById('mod-count-tag').textContent = state.selectedMods.length;
    lucide.createIcons();
}

/**
 * EXPORT LOGIC
 */

document.getElementById('export-btn').onclick = async () => {
    if (state.selectedMods.length === 0) return alert("Select at least one mod.");

    const fab = document.getElementById('export-btn');
    const originalContent = fab.innerHTML;
    fab.innerHTML = `<i data-lucide="loader" class="spin"></i> <span>Preparing...</span>`;
    lucide.createIcons();

    try {
        const zip = new JSZip();
        const loader = document.getElementById('mod-loader').value;
        const gameVer = document.getElementById('game-version').value;
        const packName = document.getElementById('pack-name').value || "Unnamed Pack";

        const fileList = [];

        // Fetch primary file for each mod
        for (const mod of state.selectedMods) {
            const res = await fetch(`https://api.modrinth.com/v2/project/${mod.id}/version?loaders=["${loader}"]&game_versions=["${gameVer}"]`);
            const versions = await res.json();
            if (versions.length > 0) {
                const latest = versions[0];
                const primaryFile = latest.files.find(f => f.primary) || latest.files[0];
                
                fileList.push({
                    path: `mods/${primaryFile.filename}`,
                    hashes: primaryFile.hashes,
                    downloads: [primaryFile.url],
                    fileSize: primaryFile.size
                });
            }
        }

        const index = {
            formatVersion: 1,
            game: "minecraft",
            versionId: "1.0.0",
            name: packName,
            dependencies: {
                minecraft: gameVer,
                [loader]: "latest"
            },
            files: fileList
        };

        zip.file("modrinth.index.json", JSON.stringify(index, null, 2));
        zip.folder("overrides");

        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `${packName.replace(/\s+/g, '_')}.mrpack`;
        link.click();
    } catch (e) {
        alert("Export failed. Check console for details.");
        console.error(e);
    } finally {
        fab.innerHTML = originalContent;
        lucide.createIcons();
    }
};

// Start the app
init();
