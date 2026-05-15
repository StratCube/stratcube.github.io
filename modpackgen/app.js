document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    const state = {
        mods: [],
        questbook: {
            id: "0000000000000001", // FTB Quests file ID
            title: "My Quest Pack",
            chapters: []
        },
        selectedChapterId: null,
        selectedQuestId: null,
    };
    
    let modsDatabase = [];
    let addonsDatabase = [];

    // --- DOM ELEMENTS ---
    const modSearchInput = document.getElementById('mod-search');
    const btnSearch = document.getElementById('btn-search');
    const searchResultsContainer = document.getElementById('search-results');
    const modListContainer = document.getElementById('mod-list-container');
    const mcVersionSelect = document.getElementById('mc-version');
    const packNameInput = document.getElementById('pack-name');
    const packLoaderSelect = document.getElementById('pack-loader');
    const btnExport = document.getElementById('btn-export');
    const btnAddCustom = document.getElementById('btn-add-custom');
    const customModInput = document.getElementById('custom-mod-input');
    const activityTabs = document.querySelectorAll('.activity-tab');
    const sidebarPanels = document.querySelectorAll('.sidebar-panel');
    const centerTabs = document.querySelectorAll('.center-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const addonsList = document.getElementById('addons-list');
    const btnDownloadAi = document.getElementById('btn-dl-ai');
    
    // Quest Editor Elements
    const chapterListContainer = document.getElementById('chapter-list-container');
    const btnAddChapter = document.getElementById('btn-add-chapter');
    const btnExportQuests = document.getElementById('btn-export-quests');
    const questGridContent = document.getElementById('quest-grid-content');
    const questGridTitle = document.getElementById('quest-grid-title');
    const btnAddQuest = document.getElementById('btn-add-quest');
    const inspectorContent = document.getElementById('inspector-content');
    const btnGenerateAllQuests = document.getElementById('btn-generate-all-quests');

    // --- INITIALIZATION ---
    async function init() {
        await fetchMinecraftVersions();
        await fetchData();
        bindEvents();
        renderAddons();
        renderModList();
    }

    async function fetchData() {
        try {
            const [modsRes, addonsRes] = await Promise.all([
                fetch('mods.json'),
                fetch('data.json')
            ]);
            modsDatabase = await modsRes.json();
            addonsDatabase = (await addonsRes.json()).addons;
        } catch (error) {
            console.error("Failed to load databases:", error);
        }
    }

    async function fetchMinecraftVersions() {
        try {
            const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
            const data = await response.json();
            const versions = data.versions
                .filter(v => v.type === 'release')
                .map(v => v.id);
            
            mcVersionSelect.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
            mcVersionSelect.value = data.latest.release; // Default to latest release
        } catch (error) {
            console.error("Failed to fetch Minecraft versions:", error);
            mcVersionSelect.innerHTML = '<option>Error loading versions</option>';
        }
    }

    // --- EVENT BINDING ---
    function bindEvents() {
        btnSearch.addEventListener('click', searchMods);
        modSearchInput.addEventListener('keypress', (e) => e.key === 'Enter' && searchMods());
        btnExport.addEventListener('click', exportMrpack);
        btnAddCustom.addEventListener('click', () => customModInput.click());
        customModInput.addEventListener('change', handleCustomModFiles);
        mcVersionSelect.addEventListener('change', checkAIButtonState);
        packLoaderSelect.addEventListener('change', checkAIButtonState);
        
        activityTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.dataset.target;
                activityTabs.forEach(t => t.classList.remove('active'));
                sidebarPanels.forEach(p => p.classList.add('hidden'));
                tab.classList.add('active');
                document.getElementById(targetId).classList.remove('hidden');
            });
        });

        centerTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.dataset.target;
                centerTabs.forEach(t => t.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active', 'hidden'); p.classList.add('hidden'));
                tab.classList.add('active');
                document.getElementById(targetId).classList.remove('hidden');
                document.getElementById(targetId).classList.add('active');
            });
        });
        
        // Quest Editor Events
        btnAddChapter.addEventListener('click', () => createChapter());
        btnAddQuest.addEventListener('click', () => createQuest());
        btnExportQuests.addEventListener('click', exportQuestsAsSnbt);
        btnGenerateAllQuests.addEventListener('click', generateAllQuestsFromModlist);
    }
    
    // --- CORE LOGIC ---
    
    // MOD SEARCH & MANAGEMENT
    async function searchMods() {
        const query = modSearchInput.value.trim();
        const source = document.getElementById('search-source').value;
        const category = document.getElementById('search-category').value;
        const mcVersion = mcVersionSelect.value;
        const loader = packLoaderSelect.value;

        // Use Modrinth API for searching
        let url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=20&facets=[["project_type:mod"],["versions:${mcVersion}"],["categories:${loader}"]]`;
        if (category) {
            url += `&facets=[["categories:${category}"]]`;
        }

        try {
            const response = await fetch(url);
            const data = await response.json();
            renderSearchResults(data.hits);
        } catch (error) {
            console.error("Mod search failed:", error);
            searchResultsContainer.innerHTML = '<p class="text-muted">Error fetching mods.</p>';
        }
    }

    function addMod(mod) {
        if (!state.mods.some(m => m.project_id === mod.project_id)) {
            state.mods.push(mod);
            renderModList();
        }
    }

    function removeMod(projectId) {
        state.mods = state.mods.filter(m => m.project_id !== projectId);
        renderModList();
    }
    
    function handleCustomModFiles(event) {
        // Placeholder for custom file handling
        console.log("Custom files selected:", event.target.files);
    }

    // ADDONS
    function addAddon(addon) {
        // This is a placeholder. A real implementation would fetch mod details for each mod in the addon.
        console.log(`Adding mods from addon: ${addon.name}`);
        addon.mods.forEach(modSlug => {
            // In a real app, you'd call the search API for each slug to get full mod data
            // For now, we'll just log it.
            console.log(`- Fetching details for ${modSlug}...`);
        });
    }

    // --- UI RENDERING ---

    // MODS
    function renderSearchResults(mods) {
        if (mods.length === 0) {
            searchResultsContainer.innerHTML = '<p class="text-muted">No mods found.</p>';
            return;
        }
        searchResultsContainer.innerHTML = mods.map(mod => `
            <div class="mod-card">
                <img src="${mod.icon_url}" alt="${mod.title}" class="mod-icon">
                <div class="mod-info">
                    <h4>${mod.title}</h4>
                    <p>${mod.description}</p>
                </div>
                <button class="btn-primary" data-mod-id="${mod.project_id}">Add</button>
            </div>
        `).join('');
        
        searchResultsContainer.querySelectorAll('.btn-primary').forEach(btn => {
            btn.addEventListener('click', () => {
                const mod = mods.find(m => m.project_id === btn.dataset.modId);
                addMod(mod);
            });
        });
    }

    function renderModList() {
        const categories = {};
        state.mods.forEach(mod => {
            const cat = mod.categories?.[0] || 'uncategorized';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(mod);
        });

        modListContainer.innerHTML = Object.entries(categories).map(([category, mods]) => `
            <div class="mod-category">
                <div class="mod-category-title">${category}</div>
                ${mods.map(mod => `
                    <div class="mod-item">
                        <span class="mod-item-name">${mod.title}</span>
                        <div class="mod-item-actions">
                           <button class="mod-item-gen" data-mod-slug="${mod.slug}" title="Generate Quests for ${mod.title}">
                               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px;"><path d="m12 3-1.41 1.41L16.17 10H4v2h12.17l-5.58 5.59L12 19l8-8-8-8z"></path></svg>
                           </button>
                           <button class="mod-item-del" data-mod-id="${mod.project_id}" title="Remove ${mod.title}">×</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `).join('');
        
        modListContainer.querySelectorAll('.mod-item-del').forEach(btn => {
            btn.addEventListener('click', () => removeMod(btn.dataset.modId));
        });
        
        modListContainer.querySelectorAll('.mod-item-gen').forEach(btn => {
            btn.addEventListener('click', () => generateQuestsForMod(btn.dataset.modSlug));
        });
    }

    function renderAddons() {
        addonsList.innerHTML = addonsDatabase.map(addon => `
            <div class="addon-item">
                <h4>${addon.name}</h4>
                <p>${addon.description}</p>
                <button class="btn-primary w-full">Add Addon</button>
            </div>
        `).join('');

        addonsList.querySelectorAll('.btn-primary').forEach((btn, index) => {
            btn.addEventListener('click', () => addAddon(addonsDatabase[index]));
        });
    }
    
    // QUESTS
    function renderChapterList() {
        chapterListContainer.innerHTML = state.questbook.chapters.map(ch => `
            <div class="chapter-item ${ch.id === state.selectedChapterId ? 'active' : ''}" data-chapter-id="${ch.id}">
                <span>${ch.filename}</span>
                <button class="icon-btn chapter-item-del" data-chapter-id="${ch.id}" title="Delete Chapter">×</button>
            </div>
        `).join('');
        
        chapterListContainer.querySelectorAll('.chapter-item').forEach(el => {
            el.addEventListener('click', (e) => {
                 if (e.target.classList.contains('chapter-item-del')) return;
                 selectChapter(el.dataset.chapterId);
            });
        });
        
        chapterListContainer.querySelectorAll('.chapter-item-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChapter(btn.dataset.chapterId);
            });
        });
    }
    
    function renderQuestGrid() {
        const chapter = state.questbook.chapters.find(c => c.id === state.selectedChapterId);
        if (!chapter) {
            questGridContent.innerHTML = `<div class="placeholder-text"><h3>No Chapter Selected</h3><p>Select a chapter from the left panel or create a new one to begin.</p></div>`;
            questGridTitle.textContent = 'Select a Chapter';
            btnAddQuest.classList.add('hidden');
            return;
        }
        
        questGridTitle.textContent = chapter.title;
        btnAddQuest.classList.remove('hidden');

        if (chapter.quests.length === 0) {
            questGridContent.innerHTML = `<div class="placeholder-text"><p>This chapter has no quests. Click '+' to add one.</p></div>`;
            return;
        }

        questGridContent.innerHTML = chapter.quests.map(quest => `
            <div class="quest-node ${quest.id === state.selectedQuestId ? 'active' : ''}" data-quest-id="${quest.id}" style="position: absolute; left: ${quest.x * 110}px; top: ${quest.y * 100}px;">
                <img src="https://api.modrinth.com/v2/project/${quest.icon}/icon" alt="icon" onerror="this.src='https://i.imgur.com/aYfK2s2.png'">
                <span class="quest-node-title">${quest.title}</span>
                <button class="icon-btn quest-node-del" data-quest-id="${quest.id}" title="Delete Quest">×</button>
            </div>
        `).join('');
        
        questGridContent.style.position = 'relative'; // Required for absolute positioning of quests
        
        questGridContent.querySelectorAll('.quest-node').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('quest-node-del')) return;
                selectQuest(el.dataset.questId);
            });
        });

        questGridContent.querySelectorAll('.quest-node-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteQuest(btn.dataset.questId);
            });
        });
    }

    function renderInspector() {
        let content = `<div class="placeholder-text"><p>Select an object to inspect.</p></div>`;
        const chapter = state.questbook.chapters.find(c => c.id === state.selectedChapterId);
        const quest = chapter?.quests.find(q => q.id === state.selectedQuestId);

        if (quest) {
            // Render Quest Inspector
            content = `
                <div class="panel-header">QUEST</div>
                <div class="input-group">
                    <label>Title</label>
                    <input type="text" data-property="title" value="${quest.title}">
                </div>
                 <div class="input-group">
                    <label>Icon (Mod Slug)</label>
                    <input type="text" data-property="icon" value="${quest.icon}">
                </div>
                <div class="input-group">
                    <label>Description</label>
                    <textarea data-property="description">${quest.description.join('\\n')}</textarea>
                </div>
                <div class="input-group">
                    <label>X Coordinate</label>
                    <input type="number" step="0.5" data-property="x" value="${quest.x}">
                </div>
                 <div class="input-group">
                    <label>Y Coordinate</label>
                    <input type="number" step="0.5" data-property="y" value="${quest.y}">
                </div>
            `;
        } else if (chapter) {
            // Render Chapter Inspector
            content = `
                <div class="panel-header">CHAPTER</div>
                <div class="input-group">
                    <label>Title</label>
                    <input type="text" data-property="title" value="${chapter.title}">
                </div>
                <div class="input-group">
                    <label>Filename (ID)</label>
                    <input type="text" data-property="filename" value="${chapter.filename}">
                </div>
                <div class="input-group">
                    <label>Subtitle / Description</label>
                    <textarea data-property="description">${chapter.description.join('\\n')}</textarea>
                </div>
            `;
        }

        inspectorContent.innerHTML = content;
        
        // Add event listeners for the new inputs
        inspectorContent.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', (e) => {
                updateInspectedProperty(e.target.dataset.property, e.target.value);
            });
        });
    }

    // --- QUEST LOGIC (CRUD & State Changes) ---
    
    function generateUUID() {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16).toUpperCase()
        );
    }
    
    function createChapter(title = 'New Chapter', description = []) {
        const newChapter = {
            id: generateUUID(),
            filename: title.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            title,
            description,
            quests: [],
        };
        state.questbook.chapters.push(newChapter);
        renderChapterList();
        selectChapter(newChapter.id);
    }
    
    function deleteChapter(chapterId) {
        if (confirm('Are you sure you want to delete this chapter and all its quests?')) {
            state.questbook.chapters = state.questbook.chapters.filter(c => c.id !== chapterId);
            if (state.selectedChapterId === chapterId) {
                selectChapter(null);
            }
            renderChapterList();
        }
    }
    
    function createQuest() {
        const chapter = state.questbook.chapters.find(c => c.id === state.selectedChapterId);
        if (!chapter) return;
        
        const newQuest = {
            id: generateUUID(),
            title: 'New Quest',
            icon: 'minecraft', // Default icon
            description: [],
            x: chapter.quests.length, // Simple horizontal placement
            y: 0,
            tasks: [],
            rewards: []
        };
        chapter.quests.push(newQuest);
        renderQuestGrid();
        selectQuest(newQuest.id);
    }

    function deleteQuest(questId) {
        const chapter = state.questbook.chapters.find(c => c.id === state.selectedChapterId);
        if (chapter) {
            chapter.quests = chapter.quests.filter(q => q.id !== questId);
            if (state.selectedQuestId === questId) {
                selectQuest(null);
            }
            renderQuestGrid();
        }
    }

    function selectChapter(chapterId) {
        state.selectedChapterId = chapterId;
        state.selectedQuestId = null;
        renderChapterList();
        renderQuestGrid();
        renderInspector();
    }
    
    function selectQuest(questId) {
        state.selectedQuestId = questId;
        renderQuestGrid();
        renderInspector();
    }
    
    function updateInspectedProperty(property, value) {
        const chapter = state.questbook.chapters.find(c => c.id === state.selectedChapterId);
        const quest = chapter?.quests.find(q => q.id === state.selectedQuestId);
        
        let target = quest || chapter;
        if (!target) return;
        
        if (property === 'description') {
            target[property] = value.split('\\n');
        } else {
            target[property] = value;
        }
        
        // Re-render relevant parts
        if (property === 'title' || property === 'filename') {
            if (quest) renderQuestGrid(); else renderChapterList();
        }
    }

    // --- AUTO-GENERATION LOGIC ---

    function generateAllQuestsFromModlist() {
        if (!confirm(`This will generate questlines for all supported mods in your modlist (${state.mods.length} total). Continue?`)) {
            return;
        }
        state.mods.forEach(mod => generateQuestsForMod(mod.slug, true));
    }

    function generateQuestsForMod(modSlug, silent = false) {
        const modData = modsDatabase.find(m => m.namespace === modSlug);
        if (!modData) {
            if (!silent) alert(`Mod '${modSlug}' not found in the quest database.`);
            return;
        }

        Object.entries(modData.progression).forEach(([chapterTitle, chapterData], chapterIndex) => {
            const chapterId = generateUUID();
            const newChapter = {
                id: chapterId,
                filename: chapterTitle.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                title: `${modData.mod}: ${chapterTitle}`,
                description: chapterData.description ? [chapterData.description] : [],
                quests: [],
            };

            chapterData.tasks.forEach((task, taskIndex) => {
                 newChapter.quests.push({
                    id: generateUUID(),
                    title: `${capitalize(task.type)}: ${task.item.split(':').pop().replace(/_/g, ' ')}`,
                    icon: modSlug, // Use mod slug for icon lookup
                    description: [],
                    x: task.priority || taskIndex,
                    y: chapterIndex * 2.0,
                    tasks: [{ id: generateUUID(), type: "item", item: task.item, count: 1 }],
                    rewards: []
                });
            });
            
            state.questbook.chapters.push(newChapter);
        });
        
        renderChapterList();
        if (!silent) alert(`Generated quests for ${modData.mod}!`);
    }
    
    function capitalize(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    // --- EXPORT LOGIC ---
    function exportMrpack() {
        const packName = packNameInput.value || 'My-Modpack';
        const zip = new JSZip();

        const modrinthIndex = {
            formatVersion: 1,
            game: 'minecraft',
            versionId: packName,
            name: packName,
            dependencies: {
                minecraft: mcVersionSelect.value,
                [packLoaderSelect.value]: '*' // Let Modrinth figure out the best version
            },
            files: state.mods.map(mod => ({
                path: `mods/${mod.slug}.jar`, // Path inside the pack
                hashes: { sha1: mod.versions[0]?.files[0]?.hashes?.sha1 }, // Assuming latest version
                env: { client: "required", server: "required" },
                downloads: [`https://api.modrinth.com/v2/project/${mod.project_id}/version/${mod.versions[0]?.id}/file/${mod.versions[0]?.files[0]?.hashes?.sha1}/download`]
            }))
        };
        
        zip.file('modrinth.index.json', JSON.stringify(modrinthIndex, null, 2));
        zip.generateAsync({ type: 'blob' }).then(content => {
            saveAs(content, `${packName}.mrpack`);
        });
    }
    
    function exportQuestsAsSnbt() {
        const zip = new JSZip();
        const chaptersFolder = zip.folder("quests").folder("chapters");
        
        if (state.questbook.chapters.length === 0) {
            alert("No chapters to export!");
            return;
        }

        state.questbook.chapters.forEach(chapter => {
            let snbt = "{\n";
            snbt += `\tid: "${chapter.id.replace(/-/g, '').substring(0, 16)}"\n`;
            snbt += `\torder_index: ${state.questbook.chapters.indexOf(chapter)}\n`;
            snbt += `\tfilename: "${chapter.filename}"\n`;
            snbt += `\ttitle: "${chapter.title}"\n`;
            snbt += `\tquests: [\n`;
            
            chapter.quests.forEach(quest => {
                snbt += "\t\t{\n";
                snbt += `\t\t\tx: ${quest.x}d\n`;
                snbt += `\t\t\ty: ${quest.y}d\n`;
                snbt += `\t\t\tid: "${quest.id.replace(/-/g, '').substring(0, 16)}"\n`;
                snbt += `\t\t\ttasks: [\n`;
                quest.tasks.forEach(task => {
                    snbt += "\t\t\t\t{\n";
                    snbt += `\t\t\t\t\tid: "${task.id.replace(/-/g, '').substring(0, 16)}"\n`;
                    snbt += `\t\t\t\t\ttype: "${task.type}"\n`;
                    snbt += `\t\t\t\t\titem: "${task.item}"\n`;
                    snbt += `\t\t\t\t\tcount: ${task.count}L\n`;
                    snbt += "\t\t\t\t}\n";
                });
                snbt += `\t\t\t]\n`;
                snbt += "\t\t}\n";
            });
            
            snbt += "\t]\n";
            snbt += "}\n";
            chaptersFolder.file(`${chapter.filename}.snbt`, snbt);
        });
        
        zip.generateAsync({ type: 'blob' }).then(content => {
            saveAs(content, `ftbquests-export.zip`);
        });
    }

    function checkAIButtonState() {
        const mcVersion = mcVersionSelect.value;
        const loader = packLoaderSelect.value;
        btnDownloadAi.disabled = !(mcVersion === '1.20.1' && (loader === 'fabric' || loader === 'forge'));
    }

    // --- STARTUP ---
    init();
});
