import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function DesktopUpdateNotice({ compact = false }) {
  const api = window.electronAPI;
  const [patch, setPatch] = useState(null);
  const [installer, setInstaller] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api?.isElectron) return;
    let active = true;
    const offPatch = api.onUpdateStatus?.(setPatch);
    const offInstaller = api.onInstallerUpdateStatus?.(setInstaller);
    api.getUpdateStatus?.().then(status => { if (active) setPatch(status); }).catch(() => {});
    api.getInstallerUpdateStatus?.().then(status => { if (active) setInstaller(status); }).catch(() => {});
    return () => {
      active = false;
      offPatch?.();
      offInstaller?.();
    };
  }, [api]);

  const fullUpdate = ['available', 'downloading', 'installing', 'error'].includes(installer?.state);
  const status = fullUpdate ? installer : patch;
  const working = busy || ['downloading', 'installing'].includes(status?.state);
  const label = status?.state === 'installing' ? 'Installing update…'
    : working ? 'Downloading update…'
      : status?.state === 'error' ? 'Retry update' : 'Update & restart';
  if (!working && !error && !['available', 'ready', 'error'].includes(status?.state)) return null;

  async function update() {
    setError('');
    setBusy(true);
    try {
      if (fullUpdate) {
        const result = await api.installWindowsUpdate();
        setInstaller(result);
      } else {
        const result = status?.state === 'ready' ? status : await api.applyUpdate();
        setPatch(result);
        if (result?.state === 'ready') await api.restartApp();
        else if (result?.state === 'error') setError(result.error || 'Update failed.');
      }
    } catch (failure) {
      setError(failure.message || 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  const message = error || (status?.state === 'error' ? status.error : '');
  return (
    <div className={`desktop-update-notice${compact ? ' compact' : ''}`} role="status">
      {!compact && <span>{working ? 'Keep the app open while the update is prepared.' : 'A Zeedat POS update is available.'}</span>}
      <Button type="button" variant="primary" icon={working ? RefreshCw : Download}
        onClick={update} disabled={working} title={message || undefined}>{label}</Button>
      {message && <small className="desktop-update-error">{message}</small>}
    </div>
  );
}
