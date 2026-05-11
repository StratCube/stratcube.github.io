const CONFIG = {
    MODRINTH_API: 'https://api.modrinth.com/v2',
    USER_AGENT: 'ModpackGen/1.0 (contact@yourdomain.com)',
    LOCAL_STORAGE_KEY: 'modpack_gen_state',
    IGNORE_CATEGORIES:['fabric', 'forge', 'quilt', 'neoforge', 'modpack', 'resourcepack']
};

let state = {
    version: '1.20.1', 
    loader: 'fabric',
    selectedBase: null,
    selectedMods:[] 
};

let currentTab = 'All';

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await fetchVersions();
    await loadBases();
    loadFromLocalStorage();
});

async function fetchVersions() {
    const picker = document.getElementById('version-picker');
    picker.innerHTML = '<option>Loading versions...</option>';
    try {
        const response = await fetch(`${CONFIG.MODRINTH_API}/tag/game_version`);
        const versionsData = await response.json();
        
        picker.innerHTML = '';
        const releases = versionsData.filter(v => v.version_type === 'release');
        releases.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.version;
            opt.textContent = v.version;
            picker.appendChild(opt);
        });
        
        if (releases.some(v => v.version === state.version)) {
            picker.value = state.version;
        } else if (releases.length > 0) {
            state.version = releases[0].version;
            picker.value = state.version;
        }
    } catch (err) {
        picker.innerHTML = '<option value="1.20.1">1.20.1 (Offline Fallback)</option>';
    }
}

async function loadBases() {
    try {
        const response = await fetch('data.json');
        const data = await response.json();
        const container = document.getElementById('base-container');

        container.innerHTML = '';
        data.bases.forEach(base => {
            const el = document.createElement('div');
            el.className = 'card';
            el.innerHTML = `
                <h4>${base.icon} ${base.name}</h4>
                <p>${base.description}</p>
            `;
            el.onclick = () => selectBase(base);
            container.appendChild(el);
        });
    } catch (err) {
        document.getElementById('base-container').innerHTML = '<p style="color: red;">Failed to load data.json</p>';
    }
}

async function getValidModData(slug, version, loader) {
    try {
        const verRes = await fetch(`${CONFIG.MODRINTH_API}/project/${slug}/version?game_versions=["${version}"]&loaders=["${loader}"]`, { headers: { 'User-Agent': CONFIG.USER_AGENT } });
        if (!verRes.ok) return null;
        
        const versions = await verRes.json();
        if (versions.length === 0) return null;
        
        const projRes = await fetch(`${CONFIG.MODRINTH_API}/project/${slug}`, { headers: { 'User-Agent': CONFIG.USER_AGENT } });
        if (!projRes.ok) return null;
        
        const project = await projRes.json();
        return {
            id: project.id,
            slug: project.slug,
            title: project.title,
            categories: project.categories.filter(c => !CONFIG.IGNORE_CATEGORIES.includes(c))
        };
    } catch (e) {
        return null;
    }
}

async function searchMods(query) {
    const resultsContainer = document.getElementById('search-results');
    if (!query.trim()) {
        resultsContainer.innerHTML = '<p class="placeholder-text">Enter keywords to find mods</p>';
        return;
    }
    resultsContainer.innerHTML = '<p class="green blink">Searching Data-Streams...</p>';

    try {
        const facets = `[["versions:${state.version}"],["categories:${state.loader}"]]`;
        const url = `${CONFIG.MODRINTH_API}/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}`;
        const response = await fetch(url, { headers: { 'User-Agent': CONFIG.USER_AGENT } });
        const data = await response.json();
        resultsContainer.innerHTML = '';
        
        if (data.hits.length === 0) {
            resultsContainer.innerHTML = `<p class="placeholder-text">No mods found.</p>`;
            return;
        }

        data.hits.forEach(mod => {
            const el = document.createElement('div');
            el.className = 'card';
            el.innerHTML = `
                <h4>${mod.title}</h4>
                <p>${mod.description.substring(0, 60)}...</p>
            `;
            el.onclick = () => addMod({ 
                id: mod.project_id, 
                title: mod.title, 
                slug: mod.slug,
                categories: mod.categories ? mod.categories.filter(c => !CONFIG.IGNORE_CATEGORIES.includes(c)) :[]
            });
            resultsContainer.appendChild(el);
        });
    } catch (err) {
        resultsContainer.innerHTML = '<p style="color: red;">API Error.</p>';
    }
}

function addMod(mod) {
    if (!state.selectedMods.find(m => m.id === mod.id)) {
        state.selectedMods.push(mod);
        renderSelectedMods();
        saveToLocalStorage();
    }
}

async function selectBase(base) {
    state.selectedBase = base.id;
    const list = document.getElementById('selected-mods');
    list.innerHTML = '<p class="green blink">Validating Base Mods via API...</p>';

    for (const slug of base.default_mods) {
        const modData = await getValidModData(slug, state.version, state.loader);
        if (modData && !state.selectedMods.find(m => m.id === modData.id)) {
            state.selectedMods.push(modData);
        }
    }
    saveToLocalStorage();
    renderSelectedMods();
}

async function revalidateMods() {
    if (state.selectedMods.length === 0) return;
    const list = document.getElementById('selected-mods');
    list.innerHTML = '<p class="green blink">Re-evaluating mod compatibilities...</p>';

    const validationPromises = state.selectedMods.map(async (mod) => {
        const modData = await getValidModData(mod.slug, state.version, state.loader);
        return modData;
    });

    const results = await Promise.all(validationPromises);
    state.selectedMods = results.filter(m => m !== null);
    saveToLocalStorage();
    renderSelectedMods();
}

window.setTab = (tab) => {
    currentTab = tab;
    renderSelectedMods();
};

function renderSelectedMods() {
    const list = document.getElementById('selected-mods');
    const tabsContainer = document.getElementById('category-tabs');
    
    if (state.selectedMods.length === 0) {
        list.innerHTML = '<p class="placeholder-text">No mods selected yet.</p>';
        tabsContainer.innerHTML = '';
        return;
    }
    
    const allCategories = new Set();
    state.selectedMods.forEach(mod => {
        if (mod.categories) mod.categories.forEach(c => allCategories.add(c));
    });

    if (currentTab !== 'All' && !allCategories.has(currentTab)) currentTab = 'All';

    const tabsHTML =['All', ...Array.from(allCategories)].map(cat => {
        const isActive = cat === currentTab ? 'active' : '';
        return `<button class="tab-btn ${isActive}" onclick="setTab('${cat}')">${cat}</button>`;
    }).join('');
    tabsContainer.innerHTML = tabsHTML;

    const visibleMods = currentTab === 'All' 
        ? state.selectedMods 
        : state.selectedMods.filter(m => m.categories && m.categories.includes(currentTab));
    
    list.innerHTML = visibleMods.map(mod => `
        <div class="card" style="border-color: var(--green-dim)">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="font-weight:bold; color:var(--text);">${mod.title}</span>
                    <div style="font-size:0.65rem; color:var(--green-dim); margin-top:6px; text-transform:capitalize;">
                        ${(mod.categories ||[]).join(' • ')}
                    </div>
                </div>
                <span onclick="removeMod('${mod.id}')" style="color:var(--green); cursor:pointer; font-weight:bold; padding:0 5px; font-size:1.2rem;">×</span>
            </div>
        </div>
    `).join('');
}

window.removeMod = (id) => {
    state.selectedMods = state.selectedMods.filter(m => m.id !== id);
    renderSelectedMods();
    saveToLocalStorage();
};

function exportConfig() {
    const configData = JSON.stringify(state, null, 2);
    const blob = new Blob([configData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modpack-config-${state.version}.json`;
    a.click();
}

function importConfig(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            state = JSON.parse(event.target.result);
            currentTab = 'All';
            const picker = document.getElementById('version-picker');
            if (picker.querySelector(`option[value="${state.version}"]`)) picker.value = state.version;
            document.querySelectorAll('.loader-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.loader === state.loader);
            });
            await revalidateMods();
        } catch (err) {}
    };
    reader.readAsText(file);
}

function setupEventListeners() {
    let timeout;
    document.getElementById('mod-search').addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => searchMods(e.target.value), 600);
    });

    document.getElementById('version-picker').addEventListener('change', async (e) => {
        state.version = e.target.value;
        saveToLocalStorage();
        await revalidateMods();
        searchMods(document.getElementById('mod-search').value); 
    });

    document.getElementById('loader-picker').addEventListener('click', async (e) => {
        if (e.target.classList.contains('loader-btn')) {
            state.loader = e.target.dataset.loader;
            document.querySelectorAll('.loader-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            saveToLocalStorage();
            await revalidateMods();
            searchMods(document.getElementById('mod-search').value);
        }
    });

    document.getElementById('export-btn').onclick = exportConfig;
    document.getElementById('import-input').onchange = importConfig;
}

function saveToLocalStorage() {
    localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(state));
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
    if (saved) {
        try {
            state = JSON.parse(saved);
            renderSelectedMods();
            document.querySelectorAll('.loader-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.loader === state.loader);
            });
        } catch (e) {}
    }
}
