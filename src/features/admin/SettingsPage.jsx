import { ClipboardList, Pencil, Settings } from 'lucide-react';
import { useData } from '../../hooks/useData';
import { Button, Heading, Panel, Table } from '../../components/common';
import { DataView } from '../../components/feedback';
import { cents, timeLabel } from '../../utils';
import { BackupSyncManager } from './BackupSyncManager';

export function SettingsPage({ ctx }) {
  const state = useData(ctx, { settings: 'settings', audit: 'audit' });

  const openSettingsForm = currentSettings => {
    ctx.setDialog({
      title: 'Edit shop settings',
      route: 'settings.save',
      values: { ...currentSettings, tax: currentSettings.tax_bps / 100 },
      fields: [
        { name: 'shop_name', label: 'Receipt shop name', full: true },
        { name: 'tax', label: 'Tax rate (%)', type: 'money', min: 0, max: 100 },
        { name: 'paper_width', label: 'Receipt width (mm)', choices: ['58', '80'] },
      ],
      transform: v => ({
        shop_name: v.shop_name,
        paper_width: v.paper_width,
        tax_bps: cents(v.tax),
      }),
    });
  };

  return (
    <DataView state={state}>
      {({ settings, audit }) => (
        <>
          <Heading
            title="Settings"
            description="Configure receipt and tax preferences, and review the audit trail."
          />
          <div className="stack">
            <Panel
              title="Shop Settings"
              icon={Settings}
              action={
                <Button icon={Pencil} onClick={() => openSettingsForm(settings)}>
                  Edit settings
                </Button>
              }
            >
              <div className="detail">
                <div>
                  <small>Receipt shop name</small>
                  <strong>{settings.shop_name}</strong>
                </div>
                <div>
                  <small>Tax rate</small>
                  <strong>{settings.tax_bps / 100}%</strong>
                </div>
                <div>
                  <small>Paper width</small>
                  <strong>{settings.paper_width} mm</strong>
                </div>
                <div>
                  <small>Timezone</small>
                  <strong>Asia/Colombo</strong>
                </div>
              </div>
            </Panel>
            <BackupSyncManager ctx={ctx} />
            <Panel title="Recent Audit Events" icon={ClipboardList}>
              <Table
                rows={audit}
                columns={[
                  ['Date & time', r => timeLabel(r.created_at)],
                  ['Actor', 'actor'],
                  ['Action', r => <span className="mono">{r.action}</span>],
                  ['Details', r => <code>{r.details}</code>],
                ]}
              />
            </Panel>
          </div>
        </>
      )}
    </DataView>
  );
}
