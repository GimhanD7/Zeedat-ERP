import { useState } from 'react';
import { Building2, Check, KeyRound, Mail, Palette, Save, ShoppingBag, UserRound } from 'lucide-react';
import { Badge, Button, Field, Modal, Select } from '../../components/common';
import { initials, roles } from '../../utils';
import { appearanceDefaults, themeCatalog, themeVars } from './appearance';
import { PersonalSales } from './PersonalSales';

const emptyPassword = { current_password: '', new_password: '', confirmation: '' };

export function ProfileModal({ ctx, onClose }) {
  const { user, appearance, updateAppearance } = ctx;
  const [tab, setTab] = useState('sales');
  const [password, setPassword] = useState(emptyPassword);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [draft, setDraft] = useState(appearance);
  const [appearanceFeedback, setAppearanceFeedback] = useState(null);
  const [savingTheme, setSavingTheme] = useState(false);
  const preview = themeVars(draft);
  const themeChanged = Object.keys(appearanceDefaults).some(key => draft[key] !== appearance[key]);
  const assigned = new Set((user.branch_ids?.length ? user.branch_ids : [user.branch_id]).map(Number));
  const branchNames = ctx.branches.filter(branch => assigned.has(Number(branch.id))).map(branch => branch.name);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (password.new_password !== password.confirmation) {
      setFeedback({ error: true, text: 'The new passwords do not match.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await ctx.mutate('profile.password', {
        current_password: password.current_password,
        new_password: password.new_password,
      });
      setPassword(emptyPassword);
      setFeedback({ text: result.message || 'Password updated.' });
    } catch (error) {
      setFeedback({ error: true, text: error.message });
    } finally {
      setBusy(false);
    }
  }

  function editTheme(next) {
    setDraft(next);
    setAppearanceFeedback(null);
  }

  async function saveTheme() {
    setSavingTheme(true);
    try {
      await updateAppearance(draft);
      setAppearanceFeedback({ text: 'Theme saved to your profile.' });
    } catch (error) {
      setAppearanceFeedback({ error: true, text: error.message });
    } finally {
      setSavingTheme(false);
    }
  }

  return (
    <Modal title="My Profile" description="Manage your account, password and workspace theme." onClose={onClose} wide>
      <div className="modal-body profile-modal">
        <section className="account-identity">
          <span className="account-avatar" aria-hidden="true">{initials(user.name)}</span>
          <div>
            <h2>{user.name}</h2>
            <div className="account-meta">
              <span><Mail size={15} /> {user.email}</span>
              <span><Building2 size={15} /> {user.role === 'owner' ? 'All branches' : branchNames.join(', ') || 'No assigned branches'}</span>
            </div>
          </div>
          <Badge tone="blue"><UserRound size={13} /> {roles[user.role] || user.role}</Badge>
        </section>

        <div className="profile-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'sales'}
            className={tab === 'sales' ? 'selected' : ''} onClick={() => setTab('sales')}>
            <ShoppingBag size={15} /> My sales
          </button>
          <button type="button" role="tab" aria-selected={tab === 'appearance'}
            className={tab === 'appearance' ? 'selected' : ''} onClick={() => setTab('appearance')}>
            <Palette size={15} /> Themes
          </button>
          <button type="button" role="tab" aria-selected={tab === 'password'}
            className={tab === 'password' ? 'selected' : ''} onClick={() => setTab('password')}>
            <KeyRound size={15} /> Password
          </button>
        </div>

        {tab === 'sales' && <PersonalSales ctx={ctx} />}
        {tab === 'appearance' && (
          <section className="theme-studio">
            <div className="theme-presets" aria-label="Theme presets">
              {themeCatalog.map(([id, label, primary, dark, preferences]) => (
                <button key={id} type="button" aria-pressed={draft.accent === id}
                  className={'theme-card' + (draft.accent === id ? ' active' : '')}
                  disabled={savingTheme}
                  onClick={() => editTheme({ ...appearanceDefaults, ...preferences, accent: id })}>
                  <span className="theme-swatch" style={{ background: primary, borderColor: dark }} />
                  <span>{label}</span>
                  {draft.accent === id && <Check size={15} />}
                </button>
              ))}
            </div>
            <div className="theme-editor">
              <div className="theme-preview" style={preview}>
                <aside><strong>ZEEDAT POS</strong><span>Dashboard</span><span>Inventory</span></aside>
                <section>
                  <header><b>Sales overview</b><span>Today</span></header>
                  <div className="theme-preview-body">
                    <div className="theme-preview-actions"><span className="theme-preview-primary">New sale</span><span>Reports</span></div>
                    <table aria-label="Theme sample"><thead><tr><th>Item</th><th>Amount</th></tr></thead>
                      <tbody><tr><td>Screen protector</td><td>LKR 950</td></tr><tr><td>Phone case</td><td>LKR 1,500</td></tr></tbody>
                    </table>
                  </div>
                </section>
              </div>
              <div className="profile-options theme-colors">
                {[
                  ['accentColor', 'Accent', '--teal'], ['workspaceColor', 'Workspace', '--theme-workspace'],
                  ['surfaceColor', 'Panels & forms', '--theme-surface'], ['sidebarColor', 'Sidebar', '--theme-sidebar'],
                ].map(([field, label, variable]) => (
                  <Field label={label} key={field}>
                    <span className="theme-color-control">
                      <input type="color" value={draft[field] || preview[variable]} disabled={savingTheme}
                        onChange={event => editTheme({ ...draft, [field]: event.target.value })} />
                      <code>{draft[field] || preview[variable]}</code>
                      {draft[field] && <button type="button" disabled={savingTheme} onClick={() => editTheme({ ...draft, [field]: '' })}>Reset</button>}
                    </span>
                  </Field>
                ))}
              </div>
              <div className="profile-options">
                {[
                  ['mode', 'Workspace mode', [['light', 'Light'], ['dark', 'Dark']]],
                  ['sidebar', 'Sidebar mode', [['light', 'Light'], ['dark', 'Dark']]],
                  ['font', 'Typeface', [['system', 'System'], ['humanist', 'Humanist'], ['mono', 'Monospace']]],
                  ['textSize', 'Text size', [['small', 'Small'], ['standard', 'Standard'], ['large', 'Large']]],
                  ['density', 'Spacing', [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['relaxed', 'Relaxed']]],
                  ['corners', 'Corners', [['square', 'Square'], ['soft', 'Soft'], ['round', 'Round']]],
                ].map(([field, label, choices]) => (
                  <Field label={label} key={field}>
                    <Select value={draft[field]} options={choices} disabled={savingTheme}
                      onChange={event => editTheme({ ...draft, [field]: event.target.value })} />
                  </Field>
                ))}
              </div>
              <div className="theme-editor-footer">
                {appearanceFeedback && <span role={appearanceFeedback.error ? 'alert' : 'status'} className={appearanceFeedback.error ? 'text-red' : 'text-green'}>{appearanceFeedback.text}</span>}
                <Button onClick={() => editTheme({ ...appearanceDefaults })} disabled={savingTheme}>Restore defaults</Button>
                <Button variant="primary" icon={Save} disabled={savingTheme || !themeChanged} onClick={saveTheme}>
                  {savingTheme ? 'Saving…' : 'Save theme'}
                </Button>
              </div>
            </div>
          </section>
        )}

        {tab === 'password' && (
          <form className="account-form" onSubmit={submit}>
            {[
              ['current_password', 'Current password', 'current-password'],
              ['new_password', 'New password', 'new-password'],
              ['confirmation', 'Confirm new password', 'new-password'],
            ].map(([name, label, autoComplete]) => (
              <Field key={name} label={label}>
                <input type="password" required autoComplete={autoComplete} maxLength={72}
                  minLength={name === 'current_password' ? undefined : 6} value={password[name]}
                  onChange={event => setPassword({ ...password, [name]: event.target.value })} />
              </Field>
            ))}
            {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-red' : 'text-green'}>{feedback.text}</p>}
            <Button type="submit" variant="primary" icon={Save} disabled={busy}>{busy ? 'Saving…' : 'Update Password'}</Button>
          </form>
        )}
      </div>
    </Modal>
  );
}
