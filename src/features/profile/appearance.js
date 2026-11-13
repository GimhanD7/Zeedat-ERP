export const appearanceDefaults = { accent: 'teal', sidebar: 'light', density: 'comfortable' };

// [id, label, primary, dark]
export const themeCatalog = [
  ['teal', 'Standard Teal', '#007e83', '#00656b'],
  ['blue', 'Ocean Blue', '#2563eb', '#1d4ed8'],
  ['violet', 'Orchid Violet', '#7c3aed', '#6d28d9'],
  ['indigo', 'Midnight Indigo', '#4f46e5', '#4338ca'],
  ['emerald', 'Emerald', '#059669', '#047857'],
  ['green', 'Forest Green', '#16a34a', '#15803d'],
  ['lime', 'Fresh Lime', '#65a30d', '#4d7c0f'],
  ['amber', 'Amber Glow', '#d97706', '#b45309'],
  ['orange', 'Sunset Orange', '#ea580c', '#c2410c'],
  ['red', 'Crimson Red', '#dc2626', '#b91c1c'],
  ['rose', 'Rose Quartz', '#e11d48', '#be123c'],
  ['pink', 'Blush Pink', '#db2777', '#be185d'],
  ['fuchsia', 'Fuchsia Pop', '#c026d3', '#a21caf'],
  ['purple', 'Royal Purple', '#9333ea', '#7e22ce'],
  ['sky', 'Clear Sky', '#0284c7', '#0369a1'],
  ['cyan', 'Aqua Cyan', '#0891b2', '#0e7490'],
  ['slate', 'Slate Steel', '#475569', '#334155'],
  ['graphite', 'Graphite', '#374151', '#1f2937'],
  ['navy', 'Executive Navy', '#1e40af', '#1e3a8a'],
  ['gold', 'Antique Gold', '#a16207', '#854d0e'],
];

export const colorThemes = themeCatalog.map(([value, label]) => [value, label]);

const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, weight) => {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  const part = (x, y) => Math.round(x * weight + y * (1 - weight)).toString(16).padStart(2, '0');
  return '#' + part(r1, r2) + part(g1, g2) + part(b1, b2);
};

export function themeVars(accent) {
  const found = themeCatalog.find(([id]) => id === accent) || themeCatalog[0];
  const [, , primary, dark] = found;
  return {
    '--teal': primary,
    '--teal-dark': dark,
    '--teal-text': dark,
    '--theme-soft': mix(primary, '#ffffff', 0.1),
    '--theme-workspace': mix(primary, '#f3f6fa', 0.04),
  };
}

const choices = {
  accent: themeCatalog.map(([value]) => value),
  sidebar: ['light', 'dark'],
  density: ['comfortable', 'compact'],
};

const key = user => 'zeedat.appearance.' + String(user.email || user.id).toLowerCase();

export function readAppearance(user) {
  try {
    const saved = JSON.parse(localStorage.getItem(key(user))) || {};
    return Object.fromEntries(Object.entries(choices).map(([field, values]) =>
      [field, values.includes(saved[field]) ? saved[field] : appearanceDefaults[field]]
    ));
  } catch {
    return { ...appearanceDefaults };
  }
}

export function saveAppearance(user, appearance) {
  try {
    localStorage.setItem(key(user), JSON.stringify(appearance));
    return true;
  } catch {
    return false;
  }
}
