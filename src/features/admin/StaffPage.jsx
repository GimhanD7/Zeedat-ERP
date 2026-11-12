import { useState } from 'react';
import { 
  Barcode,
  Building2,
  CheckCircle2,
  Eye,
  Lock,
  Mail,
  Pencil, 
  Plus, 
  Printer,
  Shield, 
  ShieldCheck, 
  ShoppingCart, 
  SlidersHorizontal,
  Trash2, 
  UserCheck, 
  UserRound, 
  Users, 
  UserX, 
  Wallet, 
  Wrench,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import {
  Badge,
  BarcodeSvg,
  Button,
  FilterTabs,
  Heading,
  Modal,
  Panel,
  SearchBox,
  Select,
  Stats,
  Table,
} from '../../components/common';
import { DataView } from '../../components/feedback';
import { initials, money, options, printHtmlDocument, roles } from '../../utils';
import { RolePermissionsManager } from './RolePermissionsManager';
import { buildStaffBadgesPrintHtml, getStaffBadgeCode } from './staffBadgePrint';

export function StaffPage({ ctx }) {
  const state = useData(ctx, { staff: 'staff', permissionsData: 'permissions' });
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('Staff accounts');
  const [branchFilter, setBranchFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [profileModalMember, setProfileModalMember] = useState(null);
  const [badgeModalMember, setBadgeModalMember] = useState(null);
  const [permStaffId, setPermStaffId] = useState(null);
  const [branchModalMember, setBranchModalMember] = useState(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState([]);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState('');

  const openStaffPermissions = member => {
    setPermStaffId(member.id);
    setTab('Role permissions');
  };

  const openBranchAssignModal = member => {
    const existingIds = Array.isArray(member.branch_ids) && member.branch_ids.length > 0
      ? member.branch_ids.map(Number)
      : (member.branch_id ? [Number(member.branch_id)] : []);
    setSelectedBranchIds(existingIds);
    setAssignError('');
    setBranchModalMember(member);
  };

  const toggleBranchSelection = branchId => {
    const numericId = Number(branchId);
    setSelectedBranchIds(prev => (
      prev.includes(numericId)
        ? prev.filter(id => id !== numericId)
        : [...prev, numericId]
    ));
  };

  const handleSaveBranchAssignment = async () => {
    if (!branchModalMember) return;
    if (selectedBranchIds.length === 0) {
      setAssignError('Select at least one branch for this staff member.');
      return;
    }
    setAssignBusy(true);
    setAssignError('');
    try {
      await ctx.mutate('staff.assign_branches', {
        user_id: branchModalMember.id,
        branch_ids: selectedBranchIds,
      });
      await state.refresh();
      ctx.setNotice(`Updated assigned branches for ${branchModalMember.name}.`);
      setBranchModalMember(null);
    } catch (err) {
      setAssignError(err?.message || 'Unable to update assigned branches.');
    } finally {
      setAssignBusy(false);
    }
  };

  const openStaffForm = member => {
    const defaultBranchId =
      member?.branch_id ||
      ctx.branches.find(b => b.name === member?.branch)?.id ||
      ctx.branches[0]?.id;

    ctx.setDialog({
      title: member ? `Edit Staff Account: ${member.name}` : 'Add New Staff Account',
      description: member
        ? 'Update branch assignment, system role, or reset password.'
        : 'Create login credentials and assign role & branch for a new employee.',
      route: 'staff.save',
      wide: true,
      values: {
        ...member,
        branch_id: defaultBranchId,
        role: member?.role || 'cashier',
        active: member?.active ?? true,
      },
      fields: [
        { name: 'name', label: 'Full Name', placeholder: 'e.g. Kasun Perera' },
        { 
          name: 'email', 
          label: 'Email / Username (Used to sign in)', 
          type: 'email', 
          placeholder: 'e.g. kasun@zeedat.local' 
        },
        {
          name: 'role',
          label: 'System Access Role',
          choices: Object.entries(roles).filter(([id]) => id !== 'owner'),
        },
        { 
          name: 'branch_id', 
          label: 'Assigned Shop Branch', 
          choices: options(ctx.branches) 
        },
        {
          name: 'password',
          label: member ? 'New Password (leave blank to keep unchanged)' : 'Login Password (minimum 6 characters)',
          type: 'password',
          optional: Boolean(member),
          placeholder: member ? '••••••••' : 'Enter login password',
        },
        ...(member ? [{ name: 'active', label: 'Account Active (Authorized to sign in)', type: 'checkbox' }] : []),
      ],
      onSuccess: () => {
        ctx.setNotice(member ? 'Staff account updated.' : 'Staff account created successfully.');
      },
    });
  };

  const confirmDelete = member => {
    if (member.id === ctx.user.id) {
      alert('You cannot delete your own active account while logged in.');
      return;
    }
    if (member.role === 'owner') {
      alert('The Owner account cannot be deleted.');
      return;
    }

    if (
      window.confirm(
        `Are you sure you want to delete staff account "${member.name}" (${member.email})?\n\nIf this staff member has past sales, repairs, or cash sessions, their account will be safely deactivated to preserve financial audit history.`
      )
    ) {
      ctx.mutate('staff.delete', { id: member.id })
        .then(res => {
          ctx.setNotice(res.message || 'Staff account updated.');
        })
        .catch(err => {
          alert(err.message || 'Failed to remove staff account.');
        });
    }
  };

  const toggleStatus = member => {
    if (member.id === ctx.user.id) {
      alert('You cannot deactivate your own account.');
      return;
    }
    ctx.mutate('staff.toggle', { id: member.id })
      .then(res => {
        ctx.setNotice(res.message || 'Staff status updated.');
      })
      .catch(err => {
        alert(err.message || 'Failed to change staff status.');
      });
  };

  return (
    <DataView state={state}>
      {({ staff = [], permissionsData }) => {
        const filteredStaff = staff.filter(s => {
          const matchesQuery = [s.name, s.email, roles[s.role] || ''].some(v =>
            (v || '').toLowerCase().includes(query.toLowerCase())
          );
          const matchesBranch =
            branchFilter === 'all' ||
            (Array.isArray(s.branch_names) &&
              s.branch_names.some(bn => bn && bn.toLowerCase() === branchFilter.toLowerCase())) ||
            (s.branch && s.branch.toLowerCase() === branchFilter.toLowerCase());
          const matchesRole = roleFilter === 'all' || s.role === roleFilter;
          const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'active' && Boolean(s.active)) ||
            (statusFilter === 'inactive' && !s.active);

          return matchesQuery && matchesBranch && matchesRole && matchesStatus;
        });

        const activeCount = staff.filter(s => s.active).length;
        const cashiersCount = staff.filter(s => s.role === 'cashier').length;
        const techsCount = staff.filter(s => s.role === 'technician').length;

        return (
          <>
            <Heading
              title="Staff & Access Control"
              description="Manage employee accounts, ID barcode badges, branch access, and role permissions."
            >
              {tab === 'Staff accounts' && (
                <>
                  <Button
                    icon={Printer}
                    variant="soft"
                    onClick={() => printHtmlDocument(buildStaffBadgesPrintHtml(staff.filter(s => s.active)))}
                  >
                    Print All Badges
                  </Button>
                  <Button icon={Plus} variant="primary" onClick={() => openStaffForm()}>
                    Add Staff Member
                  </Button>
                </>
              )}
            </Heading>

            <Stats
              items={[
                {
                  icon: Users,
                  label: 'Total Staff',
                  value: staff.length,
                  note: 'Across all branches',
                },
                {
                  icon: UserCheck,
                  label: 'Active Accounts',
                  value: activeCount,
                  note: 'Authorized to sign in',
                  tone: 'mint',
                },
                {
                  icon: ShoppingCart,
                  label: 'Cashiers & Sellers',
                  value: cashiersCount,
                  note: 'POS terminal operators',
                  tone: 'violet',
                },
                {
                  icon: Wrench,
                  label: 'Technicians',
                  value: techsCount,
                  note: 'Repair desk personnel',
                  tone: 'amber',
                },
              ]}
            />

            <Panel
              title={tab === 'Staff accounts' ? 'Staff Directory & Activity' : 'Role Permissions & Access Matrix'}
              icon={tab === 'Staff accounts' ? Users : SlidersHorizontal}
              action={
                <FilterTabs
                  choices={['Staff accounts', 'Role permissions']}
                  value={tab}
                  onChange={nextTab => {
                    if (nextTab === 'Staff accounts') setPermStaffId(null);
                    setTab(nextTab);
                  }}
                />
              }
            >
              {tab === 'Staff accounts' ? (
                <>
                  <div 
                    className="panel-tools" 
                    style={{ 
                      display: 'flex', 
                      gap: '0.75rem', 
                      flexWrap: 'wrap', 
                      alignItems: 'center',
                      marginBottom: '1rem' 
                    }}
                  >
                    <div style={{ flex: '1 1 240px' }}>
                      <SearchBox
                        value={query}
                        onChange={setQuery}
                        placeholder="Search staff name, email, or role…"
                      />
                    </div>
                    <div style={{ minWidth: '170px' }}>
                      <Select
                        aria-label="Filter by Branch"
                        value={branchFilter}
                        options={[
                          ['all', 'All Branches'],
                          ...ctx.branches.map(b => [b.name, b.name]),
                        ]}
                        onChange={e => setBranchFilter(e.target.value)}
                      />
                    </div>
                    <div style={{ minWidth: '150px' }}>
                      <Select
                        aria-label="Filter by Role"
                        value={roleFilter}
                        options={[
                          ['all', 'All Roles'],
                          ...Object.entries(roles).map(([k, v]) => [k, v]),
                        ]}
                        onChange={e => setRoleFilter(e.target.value)}
                      />
                    </div>
                    <div style={{ minWidth: '140px' }}>
                      <Select
                        aria-label="Filter by Status"
                        value={statusFilter}
                        options={[
                          ['all', 'All Status'],
                          ['active', 'Active Only'],
                          ['inactive', 'Inactive Only'],
                        ]}
                        onChange={e => setStatusFilter(e.target.value)}
                      />
                    </div>
                  </div>

                  <Table
                    rows={filteredStaff}
                    columns={[
                      [
                        'Staff Member',
                        s => (
                          <div className="table-product">
                            <span className="avatar mini">{initials(s.name)}</span>
                            <span>
                              <strong>{s.name}</strong>
                              <small className="subtext">
                                #{s.id} · {getStaffBadgeCode(s)} · {s.email}
                              </small>
                            </span>
                          </div>
                        ),
                      ],
                      [
                        'Role & Access',
                        s => {
                          const ovCount = Object.keys(
                            permissionsData?.user_overrides?.[String(s.id)] || {}
                          ).length;
                          return (
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <Badge>{roles[s.role] || s.role}</Badge>
                              {ovCount > 0 && (
                                <Badge tone="violet">{ovCount} Custom</Badge>
                              )}
                            </div>
                          );
                        },
                      ],
                      [
                        'Assigned Branches',
                        s => {
                          if (s.role === 'owner') {
                            return <Badge tone="green">All Branches</Badge>;
                          }
                          const names = Array.isArray(s.branch_names) && s.branch_names.length > 0
                            ? s.branch_names
                            : (s.branch ? [s.branch] : []);
                          if (names.length === 0) {
                            return <span style={{ color: '#94a3b8' }}>Unassigned</span>;
                          }
                          return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                              {names.map((bn, idx) => (
                                <Badge key={`${s.id}-br-${idx}`} tone={idx === 0 ? 'blue' : 'slate'}>
                                  {bn}{names.length > 1 && idx === 0 ? ' (Primary)' : ''}
                                </Badge>
                              ))}
                            </div>
                          );
                        },
                      ],
                      [
                        'Activity Track',
                        s => (
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {s.sales_count > 0 && (
                              <Badge tone="green">
                                🛒 {s.sales_count} sales ({money(s.sales_total)})
                              </Badge>
                            )}
                            {s.repairs_count > 0 && (
                              <Badge tone="violet">
                                🔧 {s.repairs_count} repairs
                              </Badge>
                            )}
                            {s.drawers_count > 0 && (
                              <Badge>
                                💼 {s.drawers_count} shifts
                              </Badge>
                            )}
                            {s.sales_count === 0 && s.repairs_count === 0 && s.drawers_count === 0 && (
                              <small style={{ color: '#94a3b8' }}>No recorded transactions</small>
                            )}
                          </div>
                        ),
                      ],
                      [
                        'Status',
                        s => (
                          <Badge tone={s.active ? 'green' : 'amber'}>
                            {s.active ? 'Active' : 'Inactive'}
                          </Badge>
                        ),
                      ],
                      [
                        'Actions',
                        s => (
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <Button
                              icon={Barcode}
                              aria-label={`View ID barcode badge for ${s.name}`}
                              variant="outline"
                              onClick={() => setBadgeModalMember(s)}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', color: '#0f766e' }}
                            >
                              Badge
                            </Button>

                            {s.role !== 'owner' && (
                              <>
                                <Button
                                  icon={ShieldCheck}
                                  aria-label={`Manage permissions for ${s.name}`}
                                  variant="outline"
                                  onClick={() => openStaffPermissions(s)}
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', color: '#0d9488' }}
                                >
                                  Permissions
                                </Button>
                                <Button
                                  icon={Pencil}
                                  aria-label={`Edit ${s.name}`}
                                  variant="outline"
                                  onClick={() => openStaffForm(s)}
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  icon={s.active ? UserX : UserCheck}
                                  aria-label={s.active ? `Deactivate ${s.name}` : `Activate ${s.name}`}
                                  variant="outline"
                                  onClick={() => toggleStatus(s)}
                                  style={{ 
                                    padding: '0.25rem 0.5rem', 
                                    fontSize: '0.85rem',
                                    color: s.active ? '#b45309' : '#15803d'
                                  }}
                                >
                                  {s.active ? 'Deactivate' : 'Activate'}
                                </Button>
                                <Button
                                  icon={Trash2}
                                  aria-label={`Delete ${s.name}`}
                                  variant="outline"
                                  onClick={() => confirmDelete(s)}
                                  style={{ 
                                    padding: '0.25rem 0.5rem', 
                                    fontSize: '0.85rem',
                                    color: '#dc2626' 
                                  }}
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
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
                  onRefresh={state.refresh}
                  initialStaffId={permStaffId}
                />
              )}
            </Panel>

            {/* STAFF PROFILE & ACTIVITY MODAL */}
            {profileModalMember && (
              <Modal
                title={`Staff Profile: ${profileModalMember.name}`}
                description={`Role: ${roles[profileModalMember.role] || profileModalMember.role} · Branch: ${profileModalMember.branch || 'All Branches'}`}
                onClose={() => setProfileModalMember(null)}
              >
                <div style={{ padding: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                    <span className="avatar" style={{ width: '48px', height: '48px', fontSize: '1.2rem' }}>
                      {initials(profileModalMember.name)}
                    </span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{profileModalMember.name}</h3>
                      <p style={{ margin: '0.25rem 0', color: '#64748b', fontSize: '0.9rem' }}>
                        {profileModalMember.email}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <Badge tone={profileModalMember.active ? 'green' : 'amber'}>
                          {profileModalMember.active ? 'Account Active' : 'Account Suspended'}
                        </Badge>
                        <Badge>{roles[profileModalMember.role] || profileModalMember.role}</Badge>
                      </div>
                    </div>
                  </div>

                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#334155' }}>
                    Historical Activity Track Record
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>TOTAL SALES VOLUME</span>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#15803d' }}>
                        {money(profileModalMember.sales_total || 0)}
                      </div>
                      <small style={{ color: '#64748b' }}>{profileModalMember.sales_count || 0} completed invoices</small>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>REPAIR JOBS HANDLED</span>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#7c3aed' }}>
                        {profileModalMember.repairs_count || 0} jobs
                      </div>
                      <small style={{ color: '#64748b' }}>Assigned technician records</small>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>DRAWER SHIFTS CLOSED</span>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0284c7' }}>
                        {profileModalMember.drawers_count || 0} shifts
                      </div>
                      <small style={{ color: '#64748b' }}>Cash register sessions</small>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>BRANCH LOCATION</span>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#334155' }}>
                        {profileModalMember.branch || 'All Branches'}
                      </div>
                      <small style={{ color: '#64748b' }}>Assigned station</small>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      <span>STAFF ID BARCODE BADGE</span>
                      <span>ID #{profileModalMember.id} · {getStaffBadgeCode(profileModalMember)}</span>
                    </div>
                    <BarcodeSvg value={getStaffBadgeCode(profileModalMember)} height={44} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                    <Button
                      icon={Printer}
                      variant="soft"
                      onClick={() => printHtmlDocument(buildStaffBadgesPrintHtml([profileModalMember]))}
                    >
                      Print Badge
                    </Button>
                    <Button variant="outline" onClick={() => setProfileModalMember(null)}>
                      Close
                    </Button>
                    {profileModalMember.role !== 'owner' && (
                      <>
                        <Button
                          icon={Building2}
                          variant="outline"
                          onClick={() => {
                            const m = profileModalMember;
                            setProfileModalMember(null);
                            openBranchAssignModal(m);
                          }}
                        >
                          Assign Branches
                        </Button>
                        <Button 
                          icon={Pencil} 
                          variant="primary" 
                          onClick={() => {
                            const m = profileModalMember;
                            setProfileModalMember(null);
                            openStaffForm(m);
                          }}
                        >
                          Edit Staff Account
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Modal>
            )}

            {/* STAFF BARCODE BADGE MODAL */}
            {badgeModalMember && (
              <Modal
                title={`Staff Barcode Badge · ${badgeModalMember.name}`}
                description={`ID #${badgeModalMember.id} · ${roles[badgeModalMember.role] || badgeModalMember.role} · Scan or enter at POS to credit sales commission`}
                onClose={() => setBadgeModalMember(null)}
              >
                <div style={{ padding: '0.5rem', display: 'grid', gap: '1rem' }}>
                  <div style={{ border: '1.5px solid #0d9488', borderRadius: '12px', padding: '1rem 1.25rem', background: '#ffffff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.6rem', marginBottom: '0.8rem' }}>
                      <strong style={{ color: '#0f766e', letterSpacing: '0.5px', fontSize: '0.85rem' }}>ZEEDAT STAFF BADGE</strong>
                      <Badge tone="blue">ID #{badgeModalMember.id}</Badge>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '0.9rem' }}>
                      <span className="avatar" style={{ width: '44px', height: '44px', fontSize: '1rem' }}>
                        {initials(badgeModalMember.name)}
                      </span>
                      <div>
                        <strong style={{ fontSize: '1.05rem', display: 'block' }}>{badgeModalMember.name}</strong>
                        <span className="muted" style={{ fontSize: '0.85rem' }}>
                          {roles[badgeModalMember.role] || badgeModalMember.role} · {badgeModalMember.branch || 'All Branches'}
                        </span>
                      </div>
                    </div>
                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.75rem' }}>
                      <BarcodeSvg value={getStaffBadgeCode(badgeModalMember)} height={54} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <Button variant="outline" onClick={() => setBadgeModalMember(null)}>Close</Button>
                    <Button
                      icon={Printer}
                      variant="primary"
                      onClick={() => printHtmlDocument(buildStaffBadgesPrintHtml([badgeModalMember]))}
                    >
                      Print Staff Badge
                    </Button>
                  </div>
                </div>
              </Modal>
            )}

            {/* MULTI-BRANCH ASSIGNMENT MODAL */}
            {branchModalMember && (
              <Modal
                title={`Assign Branches: ${branchModalMember.name}`}
                description={`Select one or more shop branches ${branchModalMember.name} is allowed to operate in. The first selected branch is set as primary.`}
                onClose={() => !assignBusy && setBranchModalMember(null)}
              >
                <div style={{ padding: '0.25rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                      {selectedBranchIds.length} of {ctx.branches.length} branches selected
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button
                        variant="outline"
                        disabled={assignBusy}
                        onClick={() => setSelectedBranchIds(ctx.branches.map(b => Number(b.id)))}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        disabled={assignBusy}
                        onClick={() => setSelectedBranchIds([])}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto', marginBottom: '1rem' }}>
                    {ctx.branches.map(branch => {
                      const bId = Number(branch.id);
                      const checked = selectedBranchIds.includes(bId);
                      const isPrimary = checked && selectedBranchIds[0] === bId;
                      return (
                        <label
                          key={branch.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: checked ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                            background: checked ? '#f0f9ff' : '#ffffff',
                            cursor: assignBusy ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={assignBusy}
                              onChange={() => toggleBranchSelection(bId)}
                            />
                            <div>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{branch.name}</div>
                              {branch.address && (
                                <small style={{ color: '#64748b' }}>{branch.address}</small>
                              )}
                            </div>
                          </div>
                          {isPrimary && (
                            <Badge tone="blue">Primary</Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  {assignError && (
                    <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.75rem', fontWeight: 500 }}>
                      {assignError}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <Button
                      variant="outline"
                      disabled={assignBusy}
                      onClick={() => setBranchModalMember(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      icon={CheckCircle2}
                      disabled={assignBusy || selectedBranchIds.length === 0}
                      onClick={handleSaveBranchAssignment}
                    >
                      {assignBusy ? 'Saving...' : 'Save Branch Assignment'}
                    </Button>
                  </div>
                </div>
              </Modal>
            )}
          </>
        );
      }}
    </DataView>
  );
}
