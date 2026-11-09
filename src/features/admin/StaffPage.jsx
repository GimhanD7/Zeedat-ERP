import { useState } from 'react';
import { Pencil, Plus, ShieldCheck, UserRound, Users, SlidersHorizontal } from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  Button,
  FilterTabs,
  Heading,
  Panel,
  SearchBox,
  Stats,
  Table,
} from '../../components/common';
import { DataView } from '../../components/feedback';
import { initials, options, roles } from '../../utils';
import { RolePermissionsManager } from './RolePermissionsManager';

export function StaffPage({ ctx }) {
  const state = useData(ctx, { staff: 'staff', permissionsData: 'permissions' });
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
      {({ staff, permissionsData }) => (
        <>
          <Heading
            title="Staff & Access Control"
            description="Manage staff credentials, assigned branches, and role permissions."
          >
            {tab === 'Staff accounts' && (
              <Button icon={Plus} variant="primary" onClick={() => openStaffForm()}>
                Add staff
              </Button>
            )}
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
            title={tab === 'Staff accounts' ? 'Staff Accounts' : 'Role Permissions & Access Matrix'}
            icon={tab === 'Staff accounts' ? Users : SlidersHorizontal}
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
              <RolePermissionsManager
                permissionsData={permissionsData}
                staff={staff}
                ctx={ctx}
              />
            )}
          </Panel>
        </>
      )}
    </DataView>
  );
}
