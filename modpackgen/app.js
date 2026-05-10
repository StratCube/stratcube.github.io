/**
 * ModpackGen - Terminal Logic
 */

const CONFIG = {
    MODRINTH_API: 'https://api.modrinth.com/v2',
    USER_AGENT: 'ModpackGen/1.0 (contact@yourdomain.com)',
    LOCAL_STORAGE_KEY: 'modpack_gen_state'
};

let state = {
    version: '1.20.1',
    loader: 'fabric',
    selectedBase: null,
    selectedMods: [] // Array of Mod Objects
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    initVersionPicker();
    setupEventListeners();
    await loadBases();
    loadFromLocalStorage();
});

// 1. Setup Version Picker (1.8 to 1.21.x)
function initVersionPicker() {
    const picker = document.getElementById('version-picker');
    const versions = ['1.21.1', '1.21', '1.20.4', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.8.9'];
    versions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        picker.appendChild(opt);
    });
    picker.value = state.version;
}

// 2. Load Bases from data.json
async function loadBases() {
    try {
        const response = await fetch('data.json');
        const data = await response.json();
        const container = document.getElementById('base-container');

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
    }
}

// 3. Modrinth API Integration
async function searchMods(query) {
    if (!query) return;
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '<p class="purple">Searching Data-Streams...</p>';

    try {
        const url = `${CONFIG.MODRINTH_API}/search?query=${query}&facets=[["versions:${state.version}"],["categories:${state.loader}"]]`;
        const response = await fetch(url, {
            headers: { 'User-Agent': CONFIG.USER_AGENT }
        });
        const data = await response.json();

        resultsContainer.innerHTML = '';
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
        resultsContainer.innerHTML = '<p class="error">API Error: Timeout</p>';
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
    alert(`Base ${base.name} applied. System updated.`);
}

function renderSelectedMods() {
    const list = document.getElementById('selected-mods');
    list.innerHTML = state.selectedMods.map(mod => `
        <div class="card" style="border-color: var(--purple)">
            <div style="display:flex; justify-content:space-between">
                <span>${mod.title}</span>
                <span onclick="removeMod('${mod.id}')" style="color:var(--purple); cursor:pointer">X</span>
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
    const reader = new FileReader();
    reader.onload = (event) => {
        state = JSON.parse(event.target.result);
        renderSelectedMods();
        document.getElementById('version-picker').value = state.version;
        // Sync UI loader buttons
        document.querySelectorAll('.loader-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.loader === state.loader);
        });
        alert("Configuration Override Successful.");
    };
    reader.readAsText(file);
}

// Helpers
function setupEventListeners() {
    // Search with debounce
    let timeout;
    document.getElementById('mod-search').addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => searchMods(e.target.value), 500);
    });

    // Version/Loader pickers
    document.getElementById('version-picker').addEventListener('change', (e) => {
        state.version = e.target.value;
        saveToLocalStorage();
    });

    document.getElementById('loader-picker').addEventListener('click', (e) => {
        if (e.target.classList.contains('loader-btn')) {
            state.loader = e.target.dataset.loader;
            document.querySelectorAll('.loader-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            saveToLocalStorage();
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
        state = JSON.parse(saved);
        renderSelectedMods();
    }
}
