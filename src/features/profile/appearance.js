export const appearanceDefaults = {
  accent: 'teal', sidebar: 'light', density: 'comfortable', mode: 'light',
  font: 'system', corners: 'soft', textSize: 'standard',
  accentColor: '', workspaceColor: '', surfaceColor: '', sidebarColor: '',
};

// [id, label, primary, dark]
export const themeCatalog = [
  ['teal', 'Aurora Light', '#007e83', '#00656b'],
  ['aurora-dark', 'Aurora Dark', '#29b8b0', '#007e83', { mode: 'dark', sidebar: 'dark' }],
  ['classic', 'Classic Gray', '#526477', '#34465a', { corners: 'square', density: 'compact' }],
  ['legacy-dark', 'Legacy Dark', '#6594bd', '#34597d', { mode: 'dark', sidebar: 'dark', corners: 'square' }],
  ['comfort', 'Comfort Light', '#557e9f', '#3b607f', { density: 'relaxed', textSize: 'large' }],
  ['terminal', 'Terminal Green', '#6ec575', '#287737', { mode: 'dark', sidebar: 'dark', font: 'mono', corners: 'square' }],
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


const colorFields = ['accentColor', 'workspaceColor', 'surfaceColor', 'sidebarColor'];
const choices = {
  accent: themeCatalog.map(([value]) => value),
  sidebar: ['light', 'dark'],
  mode: ['light', 'dark'],
  density: ['comfortable', 'compact', 'relaxed'],
  font: ['system', 'humanist', 'mono'],
  corners: ['square', 'soft', 'round'],
  textSize: ['small', 'standard', 'large'],
};

export function normalizeAppearance(input = {}) {
  const theme = { ...appearanceDefaults };
  for (const [field, values] of Object.entries(choices)) {
    if (values.includes(input?.[field])) theme[field] = input[field];
  }
  for (const field of colorFields) {
    if (/^#[a-f0-9]{6}$/i.test(input?.[field] || '')) theme[field] = input[field];
  }
  return theme;
}

const luminance = color => channels(color).map(channel => {
  const normalized = channel / 255;
  return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
const readable = color => luminance(color) > .179 ? '#10151e' : '#ffffff';
const accentOn = (accent, surface) => {
  const contrast = color => {
    const a = luminance(color);
    const b = luminance(surface);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  };
  const ink = readable(surface);
  for (const weight of [1, .75, .5, .25]) {
    const candidate = mix(accent, ink, weight);
    if (contrast(candidate) >= 4.5) return candidate;
  }
  return ink;
};

export function themeVars(input) {
  const theme = normalizeAppearance(input);
  const [, , presetColor, presetButton] = themeCatalog.find(([id]) => id === theme.accent);
  const dark = theme.mode === 'dark';
  const accent = theme.accentColor || presetColor;
  const button = theme.accentColor || presetButton;
  const workspace = theme.workspaceColor || (dark ? '#101723' : mix(accent, '#f3f6fa', .04));
  const surface = theme.surfaceColor || (dark ? '#1a2433' : '#ffffff');
  const sidebar = theme.sidebarColor || (theme.sidebar === 'dark' ? '#101c31' : surface);
  const ink = readable(surface) === '#ffffff' ? '#f3f6fa' : '#142136';
  return {
    '--teal': accent, '--teal-dark': button, '--teal-text': accentOn(accent, surface),
    '--theme-on-accent': readable(button),
    '--theme-workspace': workspace, '--theme-surface': surface,
    '--theme-workspace-ink': readable(workspace), '--theme-sidebar': sidebar, '--theme-sidebar-ink': readable(sidebar),
    '--theme-ink': ink, '--muted': mix(ink, surface, .75),
    '--line': mix(ink, surface, .18), '--soft': mix(ink, surface, .06),
    '--theme-soft': mix(accent, surface, .12),
    '--radius': { square: '2px', soft: '13px', round: '22px' }[theme.corners],
    '--theme-font': { system: "'Segoe UI', system-ui, sans-serif", humanist: 'Calibri, system-ui, sans-serif', mono: 'Consolas, monospace' }[theme.font],
    '--theme-scale': { small: '.94', standard: '1', large: '1.08' }[theme.textSize],
    '--theme-space': { compact: '5px', comfortable: '8px', relaxed: '12px' }[theme.density],
    colorScheme: readable(surface) === '#ffffff' ? 'dark' : 'light',
  };
}

const key = user => 'zeedat.appearance.' + String(user.email || user.id).toLowerCase();

export function readAppearance(user) {
  if (user?.appearance) return normalizeAppearance(user.appearance);
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(key(user))));
  } catch {
    return { ...appearanceDefaults };
  }
}

export function cacheAppearance(user, appearance) {
  try { localStorage.setItem(key(user), JSON.stringify(appearance)); } catch {}
}
