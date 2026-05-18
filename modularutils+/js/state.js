import { newId } from './utils.js';

export const state = {
  name: "My Modpack",
  mcVersion: "",
  loader: "fabric",
  loaderVersion: "",
  sinytraEnabled: false, // Added Sinytra state
  mods: []
};

export let customFiles = [];

export const questState = {
  chapters: [{
    id: newId(), filename: 'getting_started', title: 'Getting Started',
    order_index: 0, quests: []
  }],
  activeChapter: 0,
  selectedQuestId: null,
  linkSource: null,
  canvasOffset: { x: 60, y: 60 },
  canvasScale: 1,
  dragging: null,
  isPanning: false,
  panStart: null,
  modsData: [],
  expandedMod: null
};

const STORAGE_KEY = "modpackgen_state";
const listeners = [];

export function onStateChange(fn) { listeners.push(fn); }

export function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    Object.assign(state, parsed, { mods: parsed.mods || [] });
  }
}

export function saveState() {
  const stateToSave = { ...state, mods: state.mods.map(m => ({ ...m, fileBlob: null })) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  listeners.forEach(fn => fn());
}

export function loadQuestState() {
  const saved = localStorage.getItem('modpackgen_quests');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed.chapters) questState.chapters = parsed.chapters;
  }
}

export function saveQuestState() {
  localStorage.setItem('modpackgen_quests', JSON.stringify({ chapters: questState.chapters }));
}

export function addCustomFile(modObj, file) {
  state.mods.push(modObj);
  customFiles.push({ id: modObj.id, file: file });
  saveState();
}

export function removeCustomFile(id) {
  customFiles = customFiles.filter(f => f.id !== id);
}
