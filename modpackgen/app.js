// Initialize Icons
lucide.createIcons();

const state = {
    gameVersions: [],
    selectedMods: [], // Array of {id, slug, name, category}
    packConfig: {
        name: "My Awesome Pack",
        version: "1.20.1",
        loader: "fabric"
    }
};

// --- API FETCHERS ---

async function init() {
    // Fetch game versions for dropdown
    try {
        const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
        const data = await res.json();
        // Filter for major releases only
        state.gameVersions = data.filter(v => v.version_type === 'release').map(v => v.version);
        
        const select = document.getElementById('game-version');
        state.gameVersions.slice(0, 30).forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            select.appendChild(opt);
        });
        select.value = "1.20.1"; // Default
    } catch (e) {
        console.error("Failed to fetch versions", e);
    }
}

async function searchMods(query) {
    const loader = document.getElementById('mod-loader').value;
    const version = document.getElementById('game-version').value;
    const resultsContainer = document.getElementById('search-results');
    
    resultsContainer.innerHTML = '<div class="empty-state">Searching...</div>';

    const url = `https://api.modrinth.com/v2/search?query=${query}&facets=[["categories:${loader}"],["versions:${version}"],["project_type:mod"]]`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        renderSearchResults(data.hits);
    } catch (e) {
        resultsContainer.innerHTML = '<div class="empty-state">Error fetching mods</div>';
    }
}

// --- UI RENDERING ---

function renderSearchResults(hits) {
    const container = document.getElementById('search-results');
    container.innerHTML = hits.length === 0 ? '<div class="empty-state">No mods found</div>' : '';

    hits.forEach(mod => {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.innerHTML = `
            <img src="${mod.icon_url || 'https://modrinth.com/img/placeholder.svg'}" alt="icon">
            <div class="search-info">
                <h4>${mod.title}</h4>
                <p>${mod.description.substring(0, 80)}...</p>
            </div>
            <button class="add-btn" onclick="addMod('${mod.project_id}', '${mod.slug}', '${mod.title.replace(/'/g, "\\'")}')">Add</button>
        `;
        container.appendChild(div);
    });
}

function renderManifest() {
    const list = document.getElementById('manifest-list');
    const categories = ['essential', 'content', 'uncategorized'];
    
    // Clear lists
    categories.forEach(cat => {
        list.querySelector(`[data-cat="${cat}"] .mod-items`).innerHTML = '';
    });

    state.selectedMods.forEach(mod => {
        const cat = mod.category || 'uncategorized';
        const row = document.createElement('div');
        row.className = 'mod-row';
        row.innerHTML = `
            <span>${mod.name}</span>
            <button class="remove-btn" onclick="removeMod('${mod.id}')">
                <i data-lucide="trash-2" style="width:14px;height:14px"></i>
            </button>
        `;
        list.querySelector(`[data-cat="${cat}"] .mod-items`).appendChild(row);
    });

    document.getElementById('mod-count-tag').textContent = `${state.selectedMods.length} Mods`;
    lucide.createIcons();
}

// --- LOGIC ---

window.addMod = (id, slug, name) => {
    if (state.selectedMods.find(m => m.id === id)) return;
    
    // Auto-categorize based on common keywords
    let category = 'uncategorized';
    const lowName = name.toLowerCase();
    if (lowName.includes('sodium') || lowName.includes('lithium') || lowName.includes('api') || lowName.includes('optimization')) {
        category = 'essential';
    } else if (lowName.includes('magic') || lowName.includes('tech') || lowName.includes('world') || lowName.includes('dungeon')) {
        category = 'content';
    }

    state.selectedMods.push({ id, slug, name, category });
    renderManifest();
};

window.removeMod = (id) => {
    state.selectedMods = state.selectedMods.filter(m => m.id !== id);
    renderManifest();
};

// --- EXPORT ---

document.getElementById('export-btn').onclick = async () => {
    if (state.selectedMods.length === 0) {
        alert("Add some mods first!");
        return;
    }

    const btn = document.getElementById('export-btn');
    btn.textContent = "Architecting...";
    btn.disabled = true;

    const zip = new JSZip();
    const loader = document.getElementById('mod-loader').value;
    const gameVer = document.getElementById('game-version').value;

    // 1. Resolve versions from Modrinth for every mod
    const files = [];
    for (const mod of state.selectedMods) {
        try {
            const res = await fetch(`https://api.modrinth.com/v2/project/${mod.id}/version?loaders=["${loader}"]&game_versions=["${gameVer}"]`);
            const versions = await res.json();
            if (versions.length > 0) {
                const latest = versions[0];
                const file = latest.files.find(f => f.primary) || latest.files[0];
                files.push({
                    path: `mods/${file.filename}`,
                    hashes: file.hashes,
                    downloads: [file.url],
                    fileSize: file.size
                });
            }
        } catch (e) { console.error("Error resolving", mod.name); }
    }

    // 2. Build index.json (mrpack format)
    const index = {
        formatVersion: 1,
        game: "minecraft",
        versionId: "1.0.0",
        name: document.getElementById('pack-name').value,
        dependencies: {
            minecraft: gameVer,
            [loader]: "latest" // In a real app, you'd fetch the specific loader version
        },
        files: files
    };

    zip.file("modrinth.index.json", JSON.stringify(index, null, 2));
    zip.folder("overrides"); // Empty config folder

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `${index.name}.mrpack`;
    link.click();

    btn.innerHTML = '<i data-lucide="download"></i> Export .mrpack';
    btn.disabled = false;
    lucide.createIcons();
};

// --- EVENTS ---

document.getElementById('mod-search').oninput = (e) => {
    if (e.target.value.length > 2) {
        searchMods(e.target.value);
    }
};

document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.onclick = () => {
        searchMods(btn.dataset.slug);
    };
});

init();
