const CONFIG = {
    MODRINTH_API: 'https://api.modrinth.com/v2',
    USER_AGENT: 'ModpackGen/1.0 (contact@yourdomain.com)', // Modrinth requires a user-agent to prevent blocks
    LOCAL_STORAGE_KEY: 'modpack_gen_state'
};

let state = {
    version: '1.20.1', 
    loader: 'fabric',
    selectedBase: null,
    selectedMods:[] 
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await fetchVersions(); // Now dynamically fetches all Minecraft versions!
    await loadBases();
    loadFromLocalStorage();
});

// 1. Dynamically Fetch Game Versions from Modrinth
async function fetchVersions() {
    const picker = document.getElementById('version-picker');
    picker.innerHTML = '<option>Loading versions...</option>';
    
    try {
        const response = await fetch(`${CONFIG.MODRINTH_API}/tag/game_version`);
        const versionsData = await response.json();
        
        picker.innerHTML = '';
        
        // Filter out snapshots, only show stable releases
        const releases = versionsData.filter(v => v.version_type === 'release');
        
        releases.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.version;
            opt.textContent = v.version;
            picker.appendChild(opt);
        });
        
        // Check if saved state version exists, otherwise default to latest
        if (releases.some(v => v.version === state.version)) {
            picker.value = state.version;
        } else if (releases.length > 0) {
            state.version = releases[0].version;
            picker.value = state.version;
        }
    } catch (err) {
        console.error("Failed to fetch versions:", err);
        picker.innerHTML = '<option value="1.20.1">1.20.1 (Offline Fallback)</option>';
    }
}

// 2. Load Bases from data.json
async function loadBases() {
    try {
        const response = await fetch('data.json');
        const data = await response.json();
        const container = document.getElementById('base-container');

        container.innerHTML = ''; // Clear container
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
        console.error("Error loading bases:", err);
        document.getElementById('base-container').innerHTML = '<p style="color: red;">Failed to load data.json</p>';
    }
}

// 3. Modrinth API Integration
async function searchMods(query) {
    const resultsContainer = document.getElementById('search-results');
    
    if (!query.trim()) {
        resultsContainer.innerHTML = '<p class="placeholder-text">Enter keywords to find mods</p>';
        return;
    }
    
    resultsContainer.innerHTML = '<p class="purple">Searching Data-Streams...</p>';

    try {
        // Proper URL-encoding for the facets array
        const facets = `[["versions:${state.version}"],["categories:${state.loader}"]]`;
        const url = `${CONFIG.MODRINTH_API}/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}`;
        
        const response = await fetch(url, {
            headers: { 'User-Agent': CONFIG.USER_AGENT }
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        resultsContainer.innerHTML = '';
        
        if (data.hits.length === 0) {
            resultsContainer.innerHTML = `<p class="placeholder-text">No mods found for ${state.loader} ${state.version}.</p>`;
            return;
        }

        data.hits.forEach(mod => {
            const el = document.createElement('div');
            el.className = 'card';
            el.innerHTML = `
                <h4>${mod.title}</h4>
                <p>${mod.description.substring(0, 60)}...</p>
            `;
            el.onclick = () => addMod({ id: mod.project_id, title: mod.title, slug: mod.slug });
            resultsContainer.appendChild(el);
        });
    } catch (err) {
        console.error("Search API Error:", err);
        resultsContainer.innerHTML = '<p style="color: red;">API Error: Could not fetch mods.</p>';
    }
}

// 4. State Management
function addMod(mod) {
    if (!state.selectedMods.find(m => m.id === mod.id)) {
        state.selectedMods.push(mod);
        renderSelectedMods();
        saveToLocalStorage();
    }
}

function selectBase(base) {
    state.selectedBase = base.id;
    // Add default mods from base
    base.default_mods.forEach(slug => {
        addMod({ id: slug, title: slug, slug: slug });
    });
    saveToLocalStorage();
    alert(`Base "${base.name}" applied. Data-streams updated.`);
}

function renderSelectedMods() {
    const list = document.getElementById('selected-mods');
    if (state.selectedMods.length === 0) {
        list.innerHTML = '<p class="placeholder-text">No mods selected yet.</p>';
        return;
    }
    
    list.innerHTML = state.selectedMods.map(mod => `
        <div class="card" style="border-color: var(--purple)">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span>${mod.title}</span>
                <span onclick="removeMod('${mod.id}')" style="color:var(--purple); cursor:pointer; font-weight:bold; padding:0 5px;">X</span>
            </div>
        </div>
    `).join('');
}

window.removeMod = (id) => {
    state.selectedMods = state.selectedMods.filter(m => m.id !== id);
    renderSelectedMods();
    saveToLocalStorage();
};

// 5. Config Export/Import
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
    reader.onload = (event) => {
        try {
            state = JSON.parse(event.target.result);
            renderSelectedMods();
            
            // Sync UI inputs
            const picker = document.getElementById('version-picker');
            if (picker.querySelector(`option[value="${state.version}"]`)) {
                picker.value = state.version;
            }
            
            document.querySelectorAll('.loader-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.loader === state.loader);
            });
            
            alert("Configuration Override Successful.");
            saveToLocalStorage();
        } catch (err) {
            alert("Invalid JSON configuration file.");
        }
    };
    reader.readAsText(file);
}

// Helpers
function setupEventListeners() {
    // Search with debounce to prevent spamming the API
    let timeout;
    document.getElementById('mod-search').addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => searchMods(e.target.value), 600);
    });

    // Version/Loader pickers update state and trigger a new search
    document.getElementById('version-picker').addEventListener('change', (e) => {
        state.version = e.target.value;
        saveToLocalStorage();
        searchMods(document.getElementById('mod-search').value); 
    });

    document.getElementById('loader-picker').addEventListener('click', (e) => {
        if (e.target.classList.contains('loader-btn')) {
            state.loader = e.target.dataset.loader;
            document.querySelectorAll('.loader-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            saveToLocalStorage();
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
        } catch (e) {
            console.error("Failed to parse local storage", e);
        }
    }
}
