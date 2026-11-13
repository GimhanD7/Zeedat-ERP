export const appearanceDefaults = { accent: 'teal', sidebar: 'light', density: 'comfortable' };

const choices = {
  accent: ['teal', 'blue', 'violet'],
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
