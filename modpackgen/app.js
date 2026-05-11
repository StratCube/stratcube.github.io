lucide.createIcons();

const state = {
    selectedMods: [], // {id, slug, name, categories[]}
    searchTimeout: null
};

/**
 * INITIALIZATION
 */
async function init() {
    try {
        const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
        const data = await res.json();
        const select = document.getElementById('game-version');
        data.filter(v => v.version_type === 'release').slice(0, 25).forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.version; opt.textContent = v.version;
            select.appendChild(opt);
        });
        select.value = "1.20.1";

        const addonRes = await fetch('data.json');
        const addonData = await addonRes.json();
        const list = document.getElementById('addon-list');
        addonData.addons.forEach(addon => {
            const btn = document.createElement('button');
            btn.className = 'addon-btn';
            btn.textContent = addon.name;
            btn.onclick = () => addAddon(addon.mods);
            list.appendChild(btn);
        });
        
        search(); // Initial load
    } catch (e) {
        console.error("Init Error:", e);
    }
}

/**
 * COMPATIBILITY & DEPENDENCIES
 */

async function getProjectVersions(projectId) {
    const loader = document.getElementById('mod-loader').value;
    const version = document.getElementById('game-version').value;
    const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version?loaders=["${loader}"]&game_versions=["${version}"]`);
    return await res.json();
}

async function validateAllMods() {
    const loader = document.getElementById('mod-loader').value;
    const version = document.getElementById('game-version').value;
    document.getElementById('mod-count-tag').textContent = "...";

    const validMods = [];
    for (const mod of state.selectedMods) {
        const versions = await getProjectVersions(mod.id);
        if (versions.length > 0) validMods.push(mod);
    }
    state.selectedMods = validMods;
    renderWorkspace();
    search();
}

async function addWithDependencies(projectId) {
    if (state.selectedMods.find(m => m.id === projectId)) return;

    const loader = document.getElementById('mod-loader').value;
    const version = document.getElementById('game-version').value;
    
    try {
        // 1. Get Project info
        const pRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}`);
        const project = await pRes.json();

        // 2. Get the specific version to find dependencies
        const vData = await getProjectVersions(projectId);
        if (vData.length === 0) return; // Incompatible

        const currentVersion = vData[0];

        // 3. Add this mod
        state.selectedMods.push({
            id: project.id,
            slug: project.slug,
            name: project.title,
            categories: project.categories
        });

        // 4. Resolve Dependencies recursively
        for (const dep of currentVersion.dependencies) {
            if (dep.dependency_type === "required") {
                // Dependency can be project_id or version_id. Modrinth API usually uses project_id here.
                const depId = dep.project_id || dep.version_id;
                if (depId) await addWithDependencies(depId);
            }
        }
        renderWorkspace();
    } catch (e) {
        console.error("Dep Resolution Error:", e);
    }
}

async function addAddon(slugs) {
    for (const slug of slugs) {
        await addWithDependencies(slug);
    }
}

/**
 * SEARCH
 */

async function search() {
    const query = document.getElementById('mod-search').value.trim();
    const loader = document.getElementById('mod-loader').value;
    const version = document.getElementById('game-version').value;
    const container = document.getElementById('search-results');

    container.style.opacity = "0.4";

    let url = `https://api.modrinth.com/v2/search?facets=[["categories:${loader}"],["versions:${version}"],["project_type:mod"]]`;
    if (query) {
        url += `&query=${encodeURIComponent(query)}`;
    } else {
        url += `&index=downloads`;
    }

    try {
        const res = await fetch(url);
        const data = await res.json();
        container.innerHTML = '';
        container.style.opacity = "1";

        data.hits.forEach(hit => {
            const isAdded = state.selectedMods.find(m => m.id === hit.project_id);
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `
                <img src="${hit.icon_url}" alt="icon" onerror="this.src='https://modrinth.com/img/placeholder.svg'">
                <div class="item-info">
                    <h4>${hit.title}</h4>
                    <p>${hit.description}</p>
                </div>
                <button class="icon-btn" ${isAdded ? 'style="opacity:0.3;cursor:default"' : ''} 
                        onclick="addWithDependencies('${hit.project_id}')">
                    <i data-lucide="${isAdded ? 'check' : 'plus'}"></i>
                </button>
            `;
            container.appendChild(div);
        });
        lucide.createIcons();
    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--danger)">Search Error</div>`;
    }
}

document.getElementById('mod-search').oninput = () => {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(search, 350);
};

/**
 * WORKSPACE
 */

function renderWorkspace() {
    const container = document.getElementById('manifest-content');
    container.innerHTML = '';
    
    const groups = {};
    state.selectedMods.forEach(mod => {
        const primaryCat = mod.categories[0] || 'general';
        if (!groups[primaryCat]) groups[primaryCat] = [];
        groups[primaryCat].push(mod);
    });

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

window.removeMod = (id) => {
    state.selectedMods = state.selectedMods.filter(m => m.id !== id);
    renderWorkspace();
    search();
};

/**
 * EXPORT
 */

document.getElementById('export-btn').onclick = async () => {
    if (state.selectedMods.length === 0) return;
    const btn = document.getElementById('export-btn');
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader"></i> <span>Processing...</span>`;
    lucide.createIcons();

    try {
        const zip = new JSZip();
        const loader = document.getElementById('mod-loader').value;
        const gameVer = document.getElementById('game-version').value;
        const packName = document.getElementById('pack-name').value || "Modpack";

        const files = [];
        for (const mod of state.selectedMods) {
            const vData = await getProjectVersions(mod.id);
            if (vData.length > 0) {
                const ver = vData[0];
                const file = ver.files.find(f => f.primary) || ver.files[0];
                files.push({
                    path: `mods/${file.filename}`,
                    hashes: file.hashes,
                    downloads: [file.url],
                    fileSize: file.size
                });
            }
        }

        const index = {
            formatVersion: 1, game: "minecraft", versionId: "1.0.0",
            name: packName, dependencies: { minecraft: gameVer, [loader]: "latest" },
            files: files
        };

        zip.file("modrinth.index.json", JSON.stringify(index, null, 2));
        zip.folder("overrides");

        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${packName.replace(/\s+/g, '_')}.mrpack`;
        a.click();
    } catch (e) {
        alert("Export failed!");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="download"></i> <span>Export .mrpack</span>`;
        lucide.createIcons();
    }
};

init();
