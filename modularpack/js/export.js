import { state, questState, customFiles } from './state.js';
import { toSNBT } from './utils.js';

export async function exportQuestsZip() {
  if (!window.JSZip || !window.saveAs) return alert("Export libraries failed to load.");
  
  const zip = new JSZip();
  zip.file('data.snbt', toSNBT({ version: 3, default_quest_shape: '', default_quest_disableable: false }));
  zip.file('chapter_groups.snbt', toSNBT({ chapter_groups: [] }));
  
  const chaptersFolder = zip.folder('chapters');
  questState.chapters.forEach(ch => {
    const questObjs = ch.quests.map(q => ({
      title: q.title,
      subtitle: q.subtitle || undefined,
      description: q.description && q.description.length ? q.description : undefined,
      x: `__RAW__${q.x}d`,
      y: `__RAW__${q.y}d`,
      shape: q.shape && q.shape !== 'default' ? q.shape : undefined,
      dependencies: q.dependencies && q.dependencies.length ? q.dependencies : undefined,
      always_invisible: (!q.dependencies || q.dependencies.length === 0) ? false : undefined,
      tasks: q.tasks.map(t => {
        if(t.taskType === 'kill') return { id: t.id, type: 'kill', entity: t.item, value: `__RAW__${t.count||1}L` };
        if(t.taskType === 'checkmark') return { id: t.id, type: 'checkmark', title: t.item };
        return { id: t.id, type: 'item', item: { id: t.item, Count: `__RAW__1b` }, count: t.count > 1 ? `__RAW__${t.count}L` : undefined };
      }),
      rewards: q.rewards.map(r => {
        if(r.rewardType === 'xp') return { id: r.id, type: 'xp', xp: r.count||100 };
        if(r.rewardType === 'command') return { id: r.id, type: 'command', command: r.item, player_command: false };
        return { id: r.id, type: 'item', item: { id: r.item, Count: `__RAW__${r.count||1}b` } };
      }),
      id: q.id
    }));
    
    const chapterObj = {
      id: ch.id,
      group: '',
      order_index: ch.order_index,
      filename: ch.filename,
      title: ch.title || undefined,
      default_quest_shape: '',
      quests: questObjs,
      quest_links: []
    };
    
    chaptersFolder.file(`${ch.filename}.snbt`, toSNBT(chapterObj));
  });
  
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "ftbquests.zip");
}

export async function exportMrPack() {
  if (state.mods.length === 0) return alert("Add some mods first!");
  if (!window.JSZip || !window.saveAs) return alert("Export libraries failed to load.");

  const exportButtons = document.querySelectorAll('.btn-export:not(#btn-export-quests)');
  const resetButtons = () => {
    exportButtons.forEach(btn => {
      btn.textContent = "Export as .mrpack";
      btn.disabled = false;
    });
  };

  exportButtons.forEach(btn => {
    btn.textContent = "Generating...";
    btn.disabled = true;
  });

  try {
    const zip = new JSZip();

    let loaderVersion;
    if (state.loaderVersion.trim() !== "") {
        loaderVersion = state.loaderVersion.trim();
    } else {
        try {
            const prismUidMap = { 'fabric': 'net.fabricmc.fabric-loader', 'forge': 'net.minecraftforge', 'quilt': 'org.quiltmc.quilt-loader', 'neoforge': 'net.neoforged' };
            const uid = prismUidMap[state.loader];
            if (uid) {
                const metaRes = await fetch(`https://meta.prismlauncher.org/v1/${uid}/index.json`);
                if (metaRes.ok) {
                    const metaData = await metaRes.json();
                    const validVersions = metaData.versions.filter(v => v.requires && v.requires.some(req => req.uid === 'net.minecraft' && req.equals === state.mcVersion));
                    if (validVersions.length > 0) {
                        const recommended = validVersions.find(v => v.recommended);
                        loaderVersion = recommended ? recommended.version : validVersions[0].version;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch loader version:", e);
        }
    }

    if (!loaderVersion) {
        alert("Could not automatically determine a compatible loader version. Please enter a specific version in the 'Loader Version' text box and try exporting again.");
        resetButtons();
        return;
    }

    const indexJson = {
      formatVersion: 1, game: "minecraft", versionId: "1.0.0", name: state.name || "Custom Modpack",
      dependencies: { minecraft: state.mcVersion }, files:[]
    };
    
    const loaderKeyMap = { 'fabric': 'fabric-loader', 'forge': 'forge', 'quilt': 'quilt-loader', 'neoforge': 'neoforge' };
    const loaderKey = loaderKeyMap[state.loader] || state.loader;
    indexJson.dependencies[loaderKey] = loaderVersion;

    state.mods.forEach(mod => {
      if (mod.custom) {
        const cf = customFiles.find(c => c.id === mod.id);
        if (cf && cf.file) {
          zip.file("overrides/mods/" + mod.slug, cf.file);
        } else {
          console.warn("Custom mod file missing in session:", mod.slug);
        }
      } 
      else if (mod.source === 'modrinth' && mod.mrpackData) {
        indexJson.files.push(mod.mrpackData);
      }
    });

    zip.file("modrinth.index.json", JSON.stringify(indexJson, null, 2));

    // PACK TOOLS: You Shall Not Spawn (YSNS)
    if (state.packTools && state.packTools.ysns) {
      const ysns = state.packTools.ysns;
      
      if (ysns.disabled.length > 0) {
        const disabledTpl = `{
  // ----------------------------------------------------------------------------------------------------------------
  //                                     You Shall Not Spawn by ElocinDev.
  //                                          disabled_entities.json5
  // ----------------------------------------------------------------------------------------------------------------
  //  
  // Here you can disable entities from spawning globally, with no exceptions.
  // Format: "modid:entity_name"
  // Example: "minecraft:zombie"
  //  
  // Note: As a more advanced method, you can use regex by starting the entry with !
  // Format: "!{Regular expression}"
  // Example: "!minecraft:.*" will disable all entities from minecraft. (NOT RECOMMENDED, JUST AN EXAMPLE)
  //  
  "disabled": ${JSON.stringify(ysns.disabled, null, 4)},
  // Don't touch this!
  "CONFIG_VERSION": 1
}`;
        zip.file("overrides/config/ysns/disabled_entities.json5", disabledTpl);
      }

      if (ysns.dimensions.length > 0) {
        const dimTpl = `{
  // ----------------------------------------------------------------------------------------------------------------
  //                                     You Shall Not Spawn by ElocinDev.
  //                                       per_dimension_entities.json5
  // ----------------------------------------------------------------------------------------------------------------
  //  
  //  entity: The entity's id you want to adjust. (For example: minecraft:zombie, regex can be used.)
  //  dimension: The dimension id you want to adjust. (For example: minecraft:overworld, regex can be used.)
  //  spawn_chance: The chance of the entity spawning. (For example: 0.1 is 10%, 0.5 is 50%, 0.0 will disable the spawn.)
  //  
  //  The example below adds a modifier for the zombie, with 1.0 spawn chance (100%).
  //  By default, this does nothing, but you for example set the spawn chance to 0.5, making zombies spawn half the time they usually do.
  //  
  //  YSNS CAN'T INCREASE SPAWN RATES! ANYTHING ABOVE 1.0 WILL NOT INCREASE SPAWNRATE!
  //  
  // Note: As a more advanced method, you can use regex by starting the entry with !
  // With regex, you can do things such as disabling multiple entities in a single entry, or cover multiple (or all) dimensions
  // Format: "!{Regular expression}"
  // Example: "!minecraft:.*" will disable all entities from minecraft. (NOT RECOMMENDED, JUST AN EXAMPLE)
  //  
  // Regex works on both entity and dimension entries.
  "dimensions": ${JSON.stringify(ysns.dimensions, null, 4)},
  // Don't touch this!
  "CONFIG_VERSION": 1
}`;
        zip.file("overrides/config/ysns/per_dimension_entities.json5", dimTpl);
      }
    }

    // INJECT QUESTS INTO MRPACK OVERRIDES
    if (questState && questState.chapters && questState.chapters.some(c => c.quests.length > 0)) {
      const questsDir = zip.folder("overrides/config/ftbquests/quests");
      
      questsDir.file('data.snbt', toSNBT({ version: 3, default_quest_shape: '', default_quest_disableable: false }));
      questsDir.file('chapter_groups.snbt', toSNBT({ chapter_groups: [] }));
      
      const chaptersFolder = questsDir.folder('chapters');
      questState.chapters.forEach(ch => {
        const questObjs = ch.quests.map(q => ({
          title: q.title,
          subtitle: q.subtitle || undefined,
          description: q.description && q.description.length ? q.description : undefined,
          x: `__RAW__${q.x}d`,
          y: `__RAW__${q.y}d`,
          shape: q.shape && q.shape !== 'default' ? q.shape : undefined,
          dependencies: q.dependencies && q.dependencies.length ? q.dependencies : undefined,
          always_invisible: (!q.dependencies || q.dependencies.length === 0) ? false : undefined,
          tasks: q.tasks.map(t => {
            if(t.taskType === 'kill') return { id: t.id, type: 'kill', entity: t.item, value: `__RAW__${t.count||1}L` };
            if(t.taskType === 'checkmark') return { id: t.id, type: 'checkmark', title: t.item };
            return { id: t.id, type: 'item', item: { id: t.item, Count: `__RAW__1b` }, count: t.count > 1 ? `__RAW__${t.count}L` : undefined };
          }),
          rewards: q.rewards.map(r => {
            if(r.rewardType === 'xp') return { id: r.id, type: 'xp', xp: r.count||100 };
            if(r.rewardType === 'command') return { id: r.id, type: 'command', command: r.item, player_command: false };
            return { id: r.id, type: 'item', item: { id: r.item, Count: `__RAW__${r.count||1}b` } };
          }),
          id: q.id
        }));
        
        const chapterObj = {
          id: ch.id,
          group: '',
          order_index: ch.order_index,
          filename: ch.filename,
          title: ch.title || undefined,
          default_quest_shape: '',
          quests: questObjs,
          quest_links: []
        };
        
        chaptersFolder.file(`${ch.filename}.snbt`, toSNBT(chapterObj));
      });
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, (state.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "modpack") + ".mrpack");
  } catch (err) {
    console.error(err);
    alert("An unexpected error occurred during export.");
  } finally {
    resetButtons();
  }
}
