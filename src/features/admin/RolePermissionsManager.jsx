import { Fragment, useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Lock,
  RotateCcw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react';
import { Badge, Button, FilterTabs, SearchBox } from '../../components/common';
import { initials, roles } from '../../utils';

export function RolePermissionsManager({
  permissionsData,
  staff = [],
  ctx,
  onRefresh,
  initialStaffId = null,
}) {
  const serverMatrix = permissionsData?.matrix || {};
  const serverOverrides = permissionsData?.user_overrides || {};
  const allPermissions = permissionsData?.permissions || [];

  const nonOwnerStaff = useMemo(
    () => staff.filter(s => s.role !== 'owner'),
    [staff]
  );

  const [mode, setMode] = useState(initialStaffId ? 'Individual Staff Overrides' : 'Role Permissions Matrix');
  const [selectedStaffId, setSelectedStaffId] = useState(
    initialStaffId ? String(initialStaffId) : String(nonOwnerStaff[0]?.id || '')
  );

  useEffect(() => {
    if (initialStaffId) {
      setMode('Individual Staff Overrides');
      setSelectedStaffId(String(initialStaffId));
    }
  }, [initialStaffId]);

  useEffect(() => {
    if (!selectedStaffId && nonOwnerStaff.length > 0) {
      setSelectedStaffId(String(nonOwnerStaff[0].id));
    }
  }, [nonOwnerStaff, selectedStaffId]);

  // Role matrix local state
  const [localMatrix, setLocalMatrix] = useState(() => ({
    owner: allPermissions.map(p => p.id),
    manager: [...(serverMatrix.manager || [])],
    cashier: [...(serverMatrix.cashier || [])],
    technician: [...(serverMatrix.technician || [])],
    stock: [...(serverMatrix.stock || [])],
  }));

  useEffect(() => {
    if (permissionsData?.matrix) {
      setLocalMatrix({
        owner: allPermissions.map(p => p.id),
        manager: [...(permissionsData.matrix.manager || [])],
        cashier: [...(permissionsData.matrix.cashier || [])],
        technician: [...(permissionsData.matrix.technician || [])],
        stock: [...(permissionsData.matrix.stock || [])],
      });
    }
  }, [permissionsData, allPermissions.length]);

  // Selected staff local overrides state
  const [localUserOverrides, setLocalUserOverrides] = useState({});
  useEffect(() => {
    if (selectedStaffId) {
      setLocalUserOverrides({ ...(serverOverrides[selectedStaffId] || {}) });
    }
  }, [selectedStaffId, permissionsData]);

  const [query, setQuery] = useState('');
  const [staffQuery, setStaffQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Dirty check for role matrix
  const isRoleDirty = useMemo(() => {
    if (!permissionsData?.matrix) return false;
    const server = permissionsData.matrix;
    for (const r of ['manager', 'cashier', 'technician', 'stock']) {
      const serverSet = new Set(server[r] || []);
      const localSet = new Set(localMatrix[r] || []);
      if (serverSet.size !== localSet.size) return true;
      for (const p of serverSet) {
        if (!localSet.has(p)) return true;
      }
    }
    return false;
  }, [localMatrix, permissionsData]);

  // Dirty check for individual staff overrides
  const isStaffDirty = useMemo(() => {
    const serverForUser = serverOverrides[selectedStaffId] || {};
    const allKeys = new Set([...Object.keys(serverForUser), ...Object.keys(localUserOverrides)]);
    for (const k of allKeys) {
      const sVal = serverForUser[k] || 'inherit';
      const lVal = localUserOverrides[k] || 'inherit';
      if (sVal !== lVal) return true;
    }
    return false;
  }, [localUserOverrides, serverOverrides, selectedStaffId]);

  const categories = useMemo(() => {
    const map = new Map();
    for (const perm of allPermissions) {
      const cat = perm.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(perm);
    }
    return Array.from(map.entries());
  }, [allPermissions]);

  const togglePermission = (role, permId) => {
    if (role === 'owner') return;
    setLocalMatrix(prev => {
      const currentList = prev[role] || [];
      const has = currentList.includes(permId);
      const updated = has ? currentList.filter(id => id !== permId) : [...currentList, permId];
      return { ...prev, [role]: updated };
    });
  };

  const enableAllForRole = role => {
    if (role === 'owner') return;
    setLocalMatrix(prev => ({
      ...prev,
      [role]: allPermissions.map(p => p.id),
    }));
  };

  const clearAllForRole = role => {
    if (role === 'owner') return;
    setLocalMatrix(prev => ({
      ...prev,
      [role]: [],
    }));
  };

  const handleSaveRoles = async () => {
    setSaving(true);
    try {
      await ctx.mutate('permissions.save', { matrix: localMatrix });
      ctx.setNotice('Role permissions updated successfully.');
      if (ctx.refreshUser) await ctx.refreshUser();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to save role permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setSaving(true);
    try {
      await ctx.mutate('permissions.reset', {});
      setConfirmReset(false);
      ctx.setNotice('Permissions reset to factory defaults.');
      if (ctx.refreshUser) await ctx.refreshUser();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to reset permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardRoles = () => {
    if (permissionsData?.matrix) {
      setLocalMatrix({
        owner: allPermissions.map(p => p.id),
        manager: [...(permissionsData.matrix.manager || [])],
        cashier: [...(permissionsData.matrix.cashier || [])],
        technician: [...(permissionsData.matrix.technician || [])],
        stock: [...(permissionsData.matrix.stock || [])],
      });
    }
  };

  const setStaffOverride = (permId, value) => {
    setLocalUserOverrides(prev => {
      const next = { ...prev };
      if (value === 'inherit') {
        delete next[permId];
      } else {
        next[permId] = value;
      }
      return next;
    });
  };

  const handleSaveStaffOverrides = async () => {
    if (!selectedStaffId) return;
    setSaving(true);
    try {
      await ctx.mutate('user.permissions.save', {
        user_id: Number(selectedStaffId),
        overrides: localUserOverrides,
      });
      ctx.setNotice('Individual staff permissions updated.');
      if (ctx.refreshUser) await ctx.refreshUser();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to save staff permissions.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearStaffOverrides = async () => {
    if (!selectedStaffId) return;
    setLocalUserOverrides({});
  };

  const selectedMember = nonOwnerStaff.find(s => String(s.id) === selectedStaffId) || null;
  const roleEntries = Object.entries(roles);

  return (
    <div className="permissions-container">
      {/* Mode Switcher Bar */}
      <div className="zk-perm-mode-bar">
        <FilterTabs
          choices={['Role Permissions Matrix', 'Individual Staff Overrides']}
          value={mode}
          onChange={setMode}
        />
        <span style={{ fontSize: '12.5px', color: '#64748b' }}>
          {mode === 'Role Permissions Matrix'
            ? 'Configure default module access for every role.'
            : 'Grant extra permissions or restrict specific modules for individual employees.'}
        </span>
      </div>

      {/* MODE 1: ROLE PERMISSIONS MATRIX */}
      {mode === 'Role Permissions Matrix' && (
        <>
          <div className="role-cards-grid">
            {roleEntries.map(([roleKey, roleLabel]) => {
              const staffCount = staff.filter(s => s.role === roleKey && s.active).length;
              const allowedCount =
                roleKey === 'owner'
                  ? allPermissions.length
                  : (localMatrix[roleKey] || []).length;
              const percent = Math.round((allowedCount / (allPermissions.length || 1)) * 100);

              return (
                <div
                  key={roleKey}
                  className={'role-card ' + (roleKey === 'owner' ? 'is-owner' : '')}
                >
                  <div className="role-card-header">
                    <span className="role-card-title">{roleLabel}</span>
                    {roleKey === 'owner' ? (
                      <Badge tone="amber">Superadmin</Badge>
                    ) : (
                      <Badge tone="mint">{staffCount} Active</Badge>
                    )}
                  </div>

                  <div className="role-card-stats">
                    <div className="role-perm-count">
                      <span>{allowedCount} of {allPermissions.length} modules</span>
                      <span>{percent}%</span>
                    </div>
                    <div className="role-perm-bar">
                      <div className="role-perm-fill" style={{ width: `${percent}%` }} />
                    </div>
                  </div>

                  {roleKey !== 'owner' ? (
                    <div className="role-card-actions">
                      <button
                        type="button"
                        className="role-quick-btn"
                        onClick={() => enableAllForRole(roleKey)}
                      >
                        Allow all
                      </button>
                      <button
                        type="button"
                        className="role-quick-btn"
                        onClick={() => clearAllForRole(roleKey)}
                      >
                        Clear all
                      </button>
                    </div>
                  ) : (
                    <div className="role-card-actions">
                      <small className="subtext text-amber" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Lock size={12} /> Permanent Full Access
                      </small>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isRoleDirty && (
            <div className="matrix-actions-bar unsaved">
              <div className="matrix-status-msg">
                <AlertTriangle size={18} />
                <span>You have unsaved changes to role permissions. Click Save to apply access across all accounts.</span>
              </div>
              <div className="matrix-actions-buttons">
                <Button icon={RotateCcw} onClick={handleDiscardRoles} disabled={saving}>
                  Discard
                </Button>
                <Button
                  icon={Save}
                  variant="primary"
                  onClick={handleSaveRoles}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save permissions'}
                </Button>
              </div>
            </div>
          )}

          <div className="permissions-toolbar">
            <div style={{ maxWidth: 360, width: '100%' }}>
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="Search permissions by name or description…"
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                icon={RotateCcw}
                onClick={() => setConfirmReset(true)}
                disabled={saving}
              >
                Reset defaults
              </Button>

              {isRoleDirty && (
                <Button
                  icon={Save}
                  variant="primary"
                  onClick={handleSaveRoles}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              )}
            </div>
          </div>

          {confirmReset && (
            <div className="matrix-actions-bar unsaved" style={{ borderColor: '#f87171', background: '#fef2f2' }}>
              <div className="matrix-status-msg" style={{ color: '#991b1b' }}>
                <AlertTriangle size={18} />
                <span>Are you sure you want to reset all role permissions to factory defaults?</span>
              </div>
              <div className="matrix-actions-buttons">
                <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
                <Button variant="danger" onClick={handleResetDefaults} disabled={saving}>
                  Yes, reset to defaults
                </Button>
              </div>
            </div>
          )}

          <table className="permissions-matrix-table" role="table">
            <thead>
              <tr>
                <th className="col-module">Module / Capability</th>
                {roleEntries.map(([roleKey, roleLabel]) => (
                  <th key={roleKey} style={{ width: '12%' }}>
                    {roleLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map(([categoryName, perms]) => {
                const filteredPerms = perms.filter(
                  p =>
                    !query ||
                    p.name.toLowerCase().includes(query.toLowerCase()) ||
                    p.description.toLowerCase().includes(query.toLowerCase())
                );

                if (filteredPerms.length === 0) return null;

                return (
                  <Fragment key={categoryName}>
                    <tr className="category-row">
                      <th colSpan={1 + roleEntries.length}>
                        {categoryName} ({filteredPerms.length})
                      </th>
                    </tr>
                    {filteredPerms.map(perm => (
                      <tr key={perm.id}>
                        <td>
                          <div className="perm-info-cell">
                            <span className="perm-info-title">{perm.name}</span>
                            <span className="perm-info-desc">{perm.description}</span>
                          </div>
                        </td>

                        {roleEntries.map(([roleKey]) => {
                          if (roleKey === 'owner') {
                            return (
                              <td key={roleKey} className="perm-check-cell">
                                <button
                                  type="button"
                                  className="perm-toggle-btn locked"
                                  disabled
                                  title="Owner has permanent superadmin access"
                                >
                                  <Lock size={15} />
                                </button>
                              </td>
                            );
                          }

                          const isChecked = (localMatrix[roleKey] || []).includes(perm.id);

                          return (
                            <td key={roleKey} className="perm-check-cell">
                              <button
                                type="button"
                                className={'perm-toggle-btn ' + (isChecked ? 'checked' : '')}
                                onClick={() => togglePermission(roleKey, perm.id)}
                                role="checkbox"
                                aria-checked={isChecked}
                                title={`${isChecked ? 'Disable' : 'Enable'} ${perm.name} for ${roles[roleKey]}`}
                              >
                                {isChecked && <Check size={16} strokeWidth={3} />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* MODE 2: INDIVIDUAL STAFF OVERRIDES */}
      {mode === 'Individual Staff Overrides' && (
        <div className="zk-staff-perm-layout">
          {/* LEFT: STAFF PICKER LIST */}
          <div className="zk-staff-picker-list">
            <div style={{ marginBottom: '6px' }}>
              <SearchBox
                value={staffQuery}
                onChange={setStaffQuery}
                placeholder="Filter staff..."
              />
            </div>

            {nonOwnerStaff.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12.5px', padding: '1rem' }}>
                No non-owner staff accounts found. Add a cashier, manager, or technician first.
              </p>
            ) : (
              nonOwnerStaff
                .filter(s =>
                  `${s.name} ${s.email} ${s.role} ${s.branch || ''}`
                    .toLowerCase()
                    .includes(staffQuery.toLowerCase())
                )
                .map(s => {
                  const ovCount = Object.keys(serverOverrides[String(s.id)] || {}).length;
                  const active = String(s.id) === selectedStaffId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`zk-staff-picker-item ${active ? 'active' : ''}`}
                      onClick={() => setSelectedStaffId(String(s.id))}
                    >
                      <span className="avatar mini">{initials(s.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {roles[s.role] || s.role} · {s.branch || 'No Branch'}
                        </div>
                      </div>
                      {ovCount > 0 && (
                        <Badge tone="violet">{ovCount}</Badge>
                      )}
                    </button>
                  );
                })
            )}
          </div>

          {/* RIGHT: PER-STAFF PERMISSIONS MATRIX */}
          <div>
            {!selectedMember ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: '14px' }}>
                Select a staff member on the left to configure individual permissions.
              </div>
            ) : (
              <div>
                {/* Staff Member Header Card */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="avatar">{initials(selectedMember.name)}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '15px', color: '#0f172a' }}>{selectedMember.name}</strong>
                        <Badge>{roles[selectedMember.role] || selectedMember.role}</Badge>
                        {!selectedMember.active && <Badge tone="amber">Inactive</Badge>}
                      </div>
                      <small style={{ color: '#64748b' }}>
                        {selectedMember.email} · {selectedMember.branch || 'All Branches'}
                      </small>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {Object.keys(localUserOverrides).length > 0 && (
                      <Button icon={RotateCcw} variant="outline" onClick={handleClearStaffOverrides} disabled={saving}>
                        Reset to Role Default
                      </Button>
                    )}
                    <Button
                      icon={Save}
                      variant="primary"
                      onClick={handleSaveStaffOverrides}
                      disabled={saving || !isStaffDirty}
                    >
                      {saving ? 'Saving...' : 'Save Staff Permissions'}
                    </Button>
                  </div>
                </div>

                {isStaffDirty && (
                  <div className="matrix-actions-bar unsaved" style={{ marginBottom: '12px' }}>
                    <div className="matrix-status-msg">
                      <AlertTriangle size={16} />
                      <span>Unsaved permission overrides for <strong>{selectedMember.name}</strong>.</span>
                    </div>
                    <Button icon={Save} variant="primary" onClick={handleSaveStaffOverrides} disabled={saving}>
                      {saving ? 'Saving…' : 'Save Overrides'}
                    </Button>
                  </div>
                )}

                <table className="permissions-matrix-table">
                  <thead>
                    <tr>
                      <th>Module / Capability</th>
                      <th style={{ width: '16%', textAlign: 'center' }}>Role Default</th>
                      <th style={{ width: '32%', textAlign: 'center' }}>User Override</th>
                      <th style={{ width: '16%', textAlign: 'center' }}>Effective Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map(([categoryName, perms]) => (
                      <Fragment key={categoryName}>
                        <tr className="category-row">
                          <th colSpan={4}>{categoryName}</th>
                        </tr>
                        {perms.map(perm => {
                          const roleAllowed = (serverMatrix[selectedMember.role] || []).includes(perm.id);
                          const overrideMode = localUserOverrides[perm.id] || 'inherit';
                          const effective =
                            overrideMode === 'allow'
                              ? true
                              : overrideMode === 'deny'
                              ? false
                              : roleAllowed;

                          return (
                            <tr key={perm.id}>
                              <td>
                                <div className="perm-info-cell">
                                  <span className="perm-info-title">{perm.name}</span>
                                  <span className="perm-info-desc">{perm.description}</span>
                                </div>
                              </td>

                              <td style={{ textAlign: 'center' }}>
                                <Badge tone={roleAllowed ? 'mint' : 'amber'}>
                                  {roleAllowed ? 'Allowed' : 'Blocked'}
                                </Badge>
                              </td>

                              <td style={{ textAlign: 'center' }}>
                                <div className="zk-3way-group">
                                  <button
                                    type="button"
                                    className={`zk-3way-btn ${overrideMode === 'inherit' ? 'active-inherit' : ''}`}
                                    onClick={() => setStaffOverride(perm.id, 'inherit')}
                                  >
                                    Default
                                  </button>
                                  <button
                                    type="button"
                                    className={`zk-3way-btn ${overrideMode === 'allow' ? 'active-allow' : ''}`}
                                    onClick={() => setStaffOverride(perm.id, 'allow')}
                                  >
                                    + Allow
                                  </button>
                                  <button
                                    type="button"
                                    className={`zk-3way-btn ${overrideMode === 'deny' ? 'active-deny' : ''}`}
                                    onClick={() => setStaffOverride(perm.id, 'deny')}
                                  >
                                    − Deny
                                  </button>
                                </div>
                              </td>

                              <td style={{ textAlign: 'center' }}>
                                <Badge tone={effective ? 'green' : 'red'}>
                                  {effective ? 'Granted' : 'Restricted'}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
