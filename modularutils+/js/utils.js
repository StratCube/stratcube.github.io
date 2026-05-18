// Secure, collision-resistant ID generation
export function newId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').toUpperCase();
  }
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Performance utility for search inputs
export function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Critical XSS prevention for innerHTML insertions
export function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function shortName(itemId) {
  if (!itemId) return '?';
  const parts = itemId.split(':');
  const name = parts[parts.length - 1];
  return escapeHtml(name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 22));
}

// Robust SNBT Object Serializer
export function toSNBT(val, depth = 0) {
  const t = '\t'.repeat(depth);
  const t1 = '\t'.repeat(depth + 1);
  if (val === null || val === undefined) return '""';
  if (typeof val === 'string' && val.startsWith('__RAW__')) return val.slice(7);
  if (typeof val === 'string') return `"${val.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'number') return Number.isInteger(val) ? String(val) : `${val}d`;
  
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    return `[\n${val.map(v => `${t1}${toSNBT(v, depth+1)}`).join(',\n')}\n${t}]`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val).filter(([,v]) => v !== undefined && v !== null);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([k,v]) => `${t1}${k}: ${toSNBT(v, depth+1)}`).join(',\n')}\n${t}}`;
  }
  return String(val);
}

export const TASK_ICONS = { collect: '📦', craft: '⚒️', explore: '🗺️', kill: '⚔️', use: '🤲', checkmark: '✅' };
