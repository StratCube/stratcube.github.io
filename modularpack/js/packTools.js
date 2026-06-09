import { state, saveState } from './state.js';
import { escapeHtml } from './utils.js';

export function initPackTools() {
  bindAccordions();
  bindYSNS();
  renderYSNS();
}

function bindAccordions() {
  document.querySelectorAll('.tool-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const targetId = header.dataset.target;
      if (!targetId) return;
      
      const body = document.getElementById(targetId);
      const isActive = header.classList.contains('active');
      
      if (isActive) {
        // Close it
        header.classList.remove('active');
        body.classList.add('hidden');
      } else {
        // Open it
        header.classList.add('active');
        body.classList.remove('hidden');
      }
    });
  });
}

function bindYSNS() {
  document.getElementById('btn-ysns-add-global').addEventListener('click', () => {
    const input = document.getElementById('ysns-global-input');
    const val = input.value.trim();
    if (val) {
      state.packTools.ysns.disabled.push(val);
      saveState();
      renderYSNS();
      input.value = '';
    }
  });

  document.getElementById('btn-ysns-add-dim').addEventListener('click', () => {
    const ent = document.getElementById('ysns-dim-entity').value.trim();
    const dim = document.getElementById('ysns-dim-id').value.trim();
    const chance = parseFloat(document.getElementById('ysns-dim-chance').value);
    
    if (ent && dim && !isNaN(chance)) {
      state.packTools.ysns.dimensions.push({ entityId: ent, dimension: dim, spawn_chance: chance });
      saveState();
      renderYSNS();
      
      document.getElementById('ysns-dim-entity').value = '';
      document.getElementById('ysns-dim-id').value = '';
      document.getElementById('ysns-dim-chance').value = '';
    }
  });
}

export function renderYSNS() {
  const globalList = document.getElementById('ysns-global-list');
  globalList.innerHTML = '';
  
  const dfGlobal = document.createDocumentFragment();
  state.packTools.ysns.disabled.forEach((entity, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding:2px 4px; border-radius:3px; font-size:10px; color:var(--text);';
    div.innerHTML = `<span>${escapeHtml(entity)}</span> <button class="icon-btn" style="color:#ff4466; font-size:12px;">×</button>`;
    
    div.querySelector('button').addEventListener('click', () => {
      state.packTools.ysns.disabled.splice(idx, 1);
      saveState();
      renderYSNS();
    });
    dfGlobal.appendChild(div);
  });
  globalList.appendChild(dfGlobal);

  const dimList = document.getElementById('ysns-dim-list');
  dimList.innerHTML = '';
  
  const dfDim = document.createDocumentFragment();
  state.packTools.ysns.dimensions.forEach((rule, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding:4px 6px; border-radius:3px; font-size:10px; color:var(--text); margin-bottom:2px;';
    div.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px;">
        <span><b style="color:var(--green)">Ent:</b> ${escapeHtml(rule.entityId)}</span>
        <span><b style="color:var(--green)">Dim:</b> ${escapeHtml(rule.dimension)}</span>
        <span><b style="color:var(--green)">Chance:</b> ${rule.spawn_chance}</span>
      </div>
      <button class="icon-btn" style="color:#ff4466; font-size:14px;">×</button>
    `;
    
    div.querySelector('button').addEventListener('click', () => {
      state.packTools.ysns.dimensions.splice(idx, 1);
      saveState();
      renderYSNS();
    });
    dfDim.appendChild(div);
  });
  dimList.appendChild(dfDim);
}
