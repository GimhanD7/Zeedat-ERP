import { useState } from 'react';
import { Building2, Check, KeyRound, Mail, Palette, Save, UserRound } from 'lucide-react';
import { Badge, Button, Field, Modal, Select } from '../../components/common';
import { initials, roles } from '../../utils';
import { themeCatalog } from './appearance';

const emptyPassword = { current_password: '', new_password: '', confirmation: '' };

export function ProfileModal({ ctx, onClose }) {
  const { user, appearance, updateAppearance } = ctx;
  const [tab, setTab] = useState('appearance');
  const [password, setPassword] = useState(emptyPassword);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [appearanceMessage, setAppearanceMessage] = useState('');
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

  function changeAppearance(field, value) {
    const saved = updateAppearance({ ...appearance, [field]: value });
    setAppearanceMessage(saved ? 'Saved on this device.' : 'Applied for this session.');
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
          <button type="button" role="tab" aria-selected={tab === 'appearance'}
            className={tab === 'appearance' ? 'selected' : ''} onClick={() => setTab('appearance')}>
            <Palette size={15} /> Themes
          </button>
          <button type="button" role="tab" aria-selected={tab === 'password'}
            className={tab === 'password' ? 'selected' : ''} onClick={() => setTab('password')}>
            <KeyRound size={15} /> Password
          </button>
        </div>

        {tab === 'appearance' && (
          <section className="account-form">
            <div className="theme-grid" role="radiogroup" aria-label="Color theme">
              {themeCatalog.map(([id, label, primary, dark]) => (
                <button key={id} type="button" role="radio" aria-checked={appearance.accent === id}
                  className={'theme-card' + (appearance.accent === id ? ' active' : '')}
                  onClick={() => changeAppearance('accent', id)}>
                  <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${primary} 0%, ${dark} 100%)` }}>
                    {appearance.accent === id && <Check size={16} />}
                  </span>
                  <span className="theme-name">{label}</span>
                </button>
              ))}
            </div>
            <div className="profile-options">
              <Field label="Sidebar theme">
                <Select value={appearance.sidebar} options={[['light', 'Light'], ['dark', 'Dark']]}
                  onChange={event => changeAppearance('sidebar', event.target.value)} />
              </Field>
              <Field label="Sidebar spacing">
                <Select value={appearance.density} options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]}
                  onChange={event => changeAppearance('density', event.target.value)} />
              </Field>
            </div>
            {appearanceMessage && <p role="status" className="text-green">{appearanceMessage}</p>}
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
