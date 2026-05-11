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
    selectedAddons:[], // Array of addon IDs
    selectedMods:[] // Objects: {id, title, slug, categories, source: 'manual'|'base'|'addon_ID'}
};

let globalData = { bases: [], addons:[] }; // Stores data.json
let currentTab = 'All';
let currentSearchResults =[]; // Stores the last search to update UI instantly

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await fetchVersions();
    await loadJSONData();
    loadFromLocalStorage();
});

// --- INIT & DATA FETCHING ---
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
        if (releases.some(v => v.version === state.version)) picker.value = state.version;
        else if (releases.length > 0) { state.version = releases[0].version; picker.value = state.version; }
    } catch (err) {
        picker.innerHTML = '<option value="1.20.1">1.20.1 (Offline Fallback)</option>';
    }
}

async function loadJSONData() {
    try {
        const response = await fetch('data.json');
        globalData = await response.json();
        renderBaseDropdown();
        renderAddons();
    } catch (err) {
        console.error('Failed to load data.json', err);
    }
}

// --- UI COMPONENTS: DROPDOWN & ADDONS ---
function renderBaseDropdown() {
    const list = document.getElementById('base-list');
    list.innerHTML = `<div class="dropdown-item ${!state.selectedBase ? 'active' : ''}" onclick="selectBase(null)">None</div>`;
    
    globalData.bases.forEach(base => {
        const isActive = state.selectedBase === base.id ? 'active' : '';
        list.innerHTML += `<div class="dropdown-item ${isActive}" onclick="selectBase('${base.id}')">${base.icon} ${base.name}</div>`;
    });
    updateBaseDropdownText();
}

function updateBaseDropdownText() {
    const textEl = document.getElementById('base-dropdown-text');
    const base = globalData.bases.find(b => b.id === state.selectedBase);
    textEl.innerHTML = base ? `<span>${base.icon} ${base.name}</span><span>▼</span>` : `<span>No Base Selected</span><span>▼</span>`;
}

function renderAddons() {
    const container = document.getElementById('addon-container');
    container.innerHTML = '';
    globalData.addons.forEach(addon => {
        const isActive = state.selectedAddons.includes(addon.id) ? 'active' : '';
        container.innerHTML += `<div class="addon-pill ${isActive}" onclick="toggleAddon('${addon.id}')">${addon.icon} ${addon.name}</div>`;
    });
}

// --- CORE LOGIC: API VALIDATION ---
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
    } catch (e) { return null; }
}

// --- CORE LOGIC: BASE & ADDON SELECTION ---
async function selectBase(baseId) {
    document.getElementById('base-dropdown').classList.remove('open');
    
    // Remove old base mods
    state.selectedMods = state.selectedMods.filter(m => m.source !== 'base');
    state.selectedBase = baseId;
    renderBaseDropdown();
    
    if (baseId) {
        const base = globalData.bases.find(b => b.id === baseId);
        document.getElementById('selected-mods').innerHTML = '<p class="green blink">Validating Base Mods via API...</p>';
        for (const slug of base.default_mods) {
            const modData = await getValidModData(slug, state.version, state.loader);
            if (modData && !state.selectedMods.find(m => m.id === modData.id)) {
                modData.source = 'base';
                state.selectedMods.push(modData);
            }
        }
    }
    
    saveToLocalStorage();
    renderSelectedMods();
    renderSearchResultsHTML(); // Update search UI highlight
}

async function toggleAddon(addonId) {
    const isAdding = !state.selectedAddons.includes(addonId);
    
    if (isAdding) {
        state.selectedAddons.push(addonId);
        renderAddons();
        const addon = globalData.addons.find(a => a.id === addonId);
        document.getElementById('selected-mods').innerHTML = '<p class="green blink">Validating Addon Mods via API...</p>';
        
        for (const slug of addon.default_mods) {
            const modData = await getValidModData(slug, state.version, state.loader);
            if (modData && !state.selectedMods.find(m => m.id === modData.id)) {
                modData.source = `addon_${addonId}`;
                state.selectedMods.push(modData);
            }
        }
    } else {
        // Remove addon
        state.selectedAddons = state.selectedAddons.filter(id => id !== addonId);
        state.selectedMods = state.selectedMods.filter(m => m.source !== `addon_${addonId}`);
        renderAddons();
    }
    
    saveToLocalStorage();
    renderSelectedMods();
    renderSearchResultsHTML();
}

// --- CORE LOGIC: SEARCH ---
async function performSearch() {
    const query = document.getElementById('mod-search').value;
    const category = document.getElementById('search-category').value;
    const resultsContainer = document.getElementById('search-results');
    
    if (!query.trim() && !category) {
        resultsContainer.innerHTML = '<p class="placeholder-text">Enter keywords or pick a category to find mods.</p>';
        currentSearchResults =[];
        return;
    }
    
    resultsContainer.innerHTML = '<p class="green blink">Searching Data-Streams...</p>';

    try {
        let facetsArr = [[`versions:${state.version}`], [`categories:${state.loader}`]];
        if (category) facetsArr.push([`categories:${category}`]);
        
        const facets = JSON.stringify(facetsArr);
        const url = `${CONFIG.MODRINTH_API}/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}`;
        
        const response = await fetch(url, { headers: { 'User-Agent': CONFIG.USER_AGENT } });
        const data = await response.json();
        
        currentSearchResults = data.hits;
        renderSearchResultsHTML();
    } catch (err) {
        resultsContainer.innerHTML = '<p style="color: red;">API Error.</p>';
    }
}

// Dynamically draws search results and checks if they are currently "selected"
function renderSearchResultsHTML() {
    const container = document.getElementById('search-results');
    if (!currentSearchResults || currentSearchResults.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No mods found matching criteria.</p>';
        return;
    }

    container.innerHTML = currentSearchResults.map(mod => {
        const isSelected = state.selectedMods.some(m => m.id === mod.project_id);
        const activeClass = isSelected ? 'selected' : '';
        
        return `
            <div class="card ${activeClass}" onclick="toggleSearchMod('${mod.project_id}', '${mod.slug}', '${mod.title.replace(/'/g, "\\'")}', '${(mod.categories ||[]).join(',')}')">
                <h4>${mod.title}</h4>
                <p>${mod.description.substring(0, 60)}...</p>
            </div>
        `;
    }).join('');
}

window.toggleSearchMod = (id, slug, title, categoriesStr) => {
    const exists = state.selectedMods.find(m => m.id === id);
    if (exists) {
        // Remove it
        state.selectedMods = state.selectedMods.filter(m => m.id !== id);
    } else {
        // Add it
        const categories = categoriesStr ? categoriesStr.split(',').filter(c => !CONFIG.IGNORE_CATEGORIES.includes(c)) :[];
        state.selectedMods.push({ id, slug, title, categories, source: 'manual' });
    }
    saveToLocalStorage();
    renderSelectedMods();
    renderSearchResultsHTML(); // Update the green highlight instantly
};

// --- CORE LOGIC: REVALIDATION ON VERSION/LOADER SWAP ---
async function revalidateMods() {
    if (state.selectedMods.length === 0) return;
    document.getElementById('selected-mods').innerHTML = '<p class="green blink">Re-evaluating compatibilities...</p>';

    const validationPromises = state.selectedMods.map(async (mod) => {
        const modData = await getValidModData(mod.slug, state.version, state.loader);
        if (modData) modData.source = mod.source; // Preserve where it came from
        return modData;
    });

    const results = await Promise.all(validationPromises);
    state.selectedMods = results.filter(m => m !== null);
    
    saveToLocalStorage();
    renderSelectedMods();
    renderSearchResultsHTML();
}

// --- RENDER MOD LIST & TABS ---
window.setTab = (tab) => { currentTab = tab; renderSelectedMods(); };

function renderSelectedMods() {
    const list = document.getElementById('selected-mods');
    const tabsContainer = document.getElementById('category-tabs');
    
    if (state.selectedMods.length === 0) {
        list.innerHTML = '<p class="placeholder-text">No mods selected yet.</p>';
        tabsContainer.innerHTML = '';
        return;
    }
    
    const allCategories = new Set();
    state.selectedMods.forEach(mod => { if (mod.categories) mod.categories.forEach(c => allCategories.add(c)); });
    if (currentTab !== 'All' && !allCategories.has(currentTab)) currentTab = 'All';

    const tabsHTML = ['All', ...Array.from(allCategories)].map(cat => {
        return `<button class="tab-btn ${cat === currentTab ? 'active' : ''}" onclick="setTab('${cat}')">${cat}</button>`;
    }).join('');
    tabsContainer.innerHTML = tabsHTML;

    const visibleMods = currentTab === 'All' ? state.selectedMods : state.selectedMods.filter(m => m.categories && m.categories.includes(currentTab));
    
    list.innerHTML = visibleMods.map(mod => `
        <div class="card" style="border-color: var(--green-dim)">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="font-weight:bold; color:var(--text);">${mod.title}</span>
                    <div style="font-size:0.65rem; color:var(--green-dim); margin-top:6px; text-transform:capitalize;">
                        ${(mod.categories ||[]).join(' • ')} 
                        ${mod.source !== 'manual' ? `<span style="color:#888;">[${mod.source}]</span>` : ''}
                    </div>
                </div>
                <span onclick="toggleSearchMod('${mod.id}')" style="color:var(--green); cursor:pointer; font-weight:bold; padding:0 5px; font-size:1.2rem;">×</span>
            </div>
        </div>
    `).join('');
}

// --- IO & EVENTS ---
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
            
            // Sync UI
            const picker = document.getElementById('version-picker');
            if (picker.querySelector(`option[value="${state.version}"]`)) picker.value = state.version;
            document.querySelectorAll('.loader-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.loader === state.loader));
            renderBaseDropdown();
            renderAddons();
            
            await revalidateMods();
            performSearch(); // Refresh search view if applicable
        } catch (err) { alert("Import failed."); }
    };
    reader.readAsText(file);
}

function setupEventListeners() {
    // Custom Dropdown logic
    document.getElementById('base-dropdown-text').addEventListener('click', () => {
        document.getElementById('base-dropdown').classList.toggle('open');
    });
    // Close dropdown if clicked outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#base-dropdown')) document.getElementById('base-dropdown').classList.remove('open');
    });

    let timeout;
    document.getElementById('mod-search').addEventListener('input', () => { clearTimeout(timeout); timeout = setTimeout(performSearch, 500); });
    document.getElementById('search-category').addEventListener('change', performSearch);

    document.getElementById('version-picker').addEventListener('change', async (e) => {
        state.version = e.target.value; saveToLocalStorage(); await revalidateMods(); performSearch();
    });

    document.getElementById('loader-picker').addEventListener('click', async (e) => {
        if (e.target.classList.contains('loader-btn')) {
            state.loader = e.target.dataset.loader;
            document.querySelectorAll('.loader-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            saveToLocalStorage(); await revalidateMods(); performSearch();
        }
    });

    document.getElementById('export-btn').onclick = exportConfig;
    document.getElementById('import-input').onchange = importConfig;
}

function saveToLocalStorage() { localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(state)); }
function loadFromLocalStorage() {
    const saved = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
    if (saved) {
        try {
            state = JSON.parse(saved);
            renderSelectedMods();
            renderBaseDropdown();
            renderAddons();
            document.querySelectorAll('.loader-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.loader === state.loader));
            if (document.getElementById('mod-search').value) performSearch();
        } catch (e) {}
    }
}
