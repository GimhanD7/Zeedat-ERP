import { useState } from 'react';
import {
  Check,
  ClipboardList,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { DataView, useData } from './data';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
  Panel,
  SearchBox,
  Stats,
  Table,
  cents,
  initials,
  managers,
  options,
  roles,
  sellers,
  stockRoles,
  timeLabel,
} from './ui';

const permissionMatrix = [
  ['Dashboard & reports', managers],
  ['POS, payments & credit collections', sellers],
  ['Refund approvals', managers],
  ['Repairs', [...sellers, 'technician']],
  ['Stock & purchase receiving', stockRoles],
  ['Supplier cash payments', managers],
  ['Customers', sellers],
  ['Staff & settings', ['owner']],
];

export function Staff({ ctx }) {
  const state = useData(ctx, { staff: 'staff' });
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('Staff accounts');

  const openStaffForm = member => {
    const defaultBranchId =
      ctx.branches.find(b => b.name === member?.branch)?.id || ctx.branches[0]?.id;

    ctx.setDialog({
      title: member ? 'Edit staff account' : 'Add staff account',
      route: 'staff.save',
      wide: true,
      values: {
        ...member,
        branch_id: defaultBranchId,
        role: member?.role || 'cashier',
        active: member?.active ?? true,
      },
      fields: [
        { name: 'name', label: 'Full name' },
        { name: 'email', label: 'Email', type: 'email' },
        {
          name: 'role',
          label: 'Role',
          choices: Object.entries(roles).filter(([id]) => id !== 'owner'),
        },
        { name: 'branch_id', label: 'Assigned branch', choices: options(ctx.branches) },
        {
          name: 'password',
          label: member ? 'New password (optional)' : 'Password (at least 12 characters)',
          type: 'password',
          optional: Boolean(member),
        },
        ...(member ? [{ name: 'active', label: 'Account active', type: 'checkbox' }] : []),
      ],
    });
  };

  return (
    <DataView state={state}>
      {({ staff }) => (
        <>
          <Heading
            title="Staff & Permissions"
            description="Manage staff accounts and branch access."
          >
            <Button icon={Plus} variant="primary" onClick={() => openStaffForm()}>
              Add staff
            </Button>
          </Heading>

          <Stats
            items={[
              {
                icon: Users,
                label: 'Staff Accounts',
                value: staff.length,
                note: 'Across all branches',
              },
              {
                icon: UserRound,
                label: 'Active Staff',
                value: staff.filter(s => s.active).length,
                note: 'Accounts with access',
                tone: 'mint',
              },
              {
                icon: ShieldCheck,
                label: 'Access Roles',
                value: Object.keys(roles).length,
                note: 'Server-enforced roles',
                tone: 'violet',
              },
            ]}
          />

          <Panel
            title={tab}
            icon={ShieldCheck}
            action={
              <FilterTabs
                choices={['Staff accounts', 'Role permissions']}
                value={tab}
                onChange={setTab}
              />
            }
          >
            {tab === 'Staff accounts' ? (
              <>
                <div className="panel-tools">
                  <SearchBox
                    value={query}
                    onChange={setQuery}
                    placeholder="Search staff name, email or role…"
                  />
                </div>
                <Table
                  rows={staff.filter(s =>
                    [s.name, s.email, roles[s.role]].some(v =>
                      v.toLowerCase().includes(query.toLowerCase())
                    )
                  )}
                  columns={[
                    [
                      'Staff member',
                      s => (
                        <div className="table-product">
                          <span className="avatar mini">{initials(s.name)}</span>
                          <span>
                            <strong>{s.name}</strong>
                            <small className="subtext">{s.email}</small>
                          </span>
                        </div>
                      ),
                    ],
                    ['Role', s => <Badge>{roles[s.role]}</Badge>],
                    ['Branch', s => s.branch || 'All Branches'],
                    ['Status', s => <Badge>{s.active ? 'Active' : 'Inactive'}</Badge>],
                    [
                      'Action',
                      s =>
                        s.role !== 'owner' && (
                          <Button
                            icon={Pencil}
                            aria-label={`Edit ${s.name}`}
                            onClick={() => openStaffForm(s)}
                          >
                            Edit
                          </Button>
                        ),
                    ],
                  ]}
                />
              </>
            ) : (
              <Table
                rows={permissionMatrix.map(([module, moduleRoles]) => ({
                  module,
                  roles: moduleRoles,
                }))}
                columns={[
                  ['Module', 'module'],
                  ...Object.entries(roles).map(([id, label]) => [
                    label,
                    r =>
                      r.roles.includes(id) ? (
                        <Check size={18} className="text-green" aria-label="Allowed" />
                      ) : (
                        '—'
                      ),
                  ]),
                ]}
              />
            )}
          </Panel>
        </>
      )}
    </DataView>
  );
}

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
