import { useState, useMemo, useEffect } from 'react';
import {
  Check,
  Lock,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { Badge, Button, SearchBox } from '../../components/common';
import { roles } from '../../utils';
import { apiClient } from '../../api/client';

export function RolePermissionsManager({ permissionsData, staff = [], ctx, onRefresh }) {
  const serverMatrix = permissionsData?.matrix || {};
  const allPermissions = permissionsData?.permissions || [];

  const [localMatrix, setLocalMatrix] = useState(() => ({
    owner: allPermissions.map(p => p.id),
    manager: [...(serverMatrix.manager || [])],
    cashier: [...(serverMatrix.cashier || [])],
    technician: [...(serverMatrix.technician || [])],
    stock: [...(serverMatrix.stock || [])],
  }));

  // Sync if server data changes
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
  }, [permissionsData]);

  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Check if modified compared to server
  const isDirty = useMemo(() => {
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

  // Group permissions by category
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
    if (role === 'owner') return; // Owner always has all permissions

    setLocalMatrix(prev => {
      const currentList = prev[role] || [];
      const has = currentList.includes(permId);
      const updated = has
        ? currentList.filter(id => id !== permId)
        : [...currentList, permId];
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient('permissions.save', {
        data: { matrix: localMatrix },
      });
      ctx.setNotice('Role permissions updated successfully.');
      if (ctx.refreshUser) {
        await ctx.refreshUser();
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      alert(err.message || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setSaving(true);
    try {
      await apiClient('permissions.reset', {
        data: {},
      });
      setConfirmReset(false);
      ctx.setNotice('Permissions reset to factory defaults.');
      if (ctx.refreshUser) {
        await ctx.refreshUser();
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      alert(err.message || 'Failed to reset permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
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

  const roleEntries = Object.entries(roles);

  return (
    <div className="permissions-container">
      {/* Role Summary & Quick Controls */}
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

      {/* Unsaved Changes Banner */}
      {isDirty && (
        <div className="matrix-actions-bar unsaved">
          <div className="matrix-status-msg">
            <AlertTriangle size={18} />
            <span>You have unsaved changes to role permissions. Click Save to apply access across all accounts.</span>
          </div>
          <div className="matrix-actions-buttons">
            <Button icon={RotateCcw} onClick={handleDiscard} disabled={saving}>
              Discard
            </Button>
            <Button
              icon={Save}
              variant="primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save permissions'}
            </Button>
          </div>
        </div>
      )}

      {/* Permissions Toolbar */}
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

          {isDirty && (
            <Button
              icon={Save}
              variant="primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {confirmReset && (
        <div className="matrix-actions-bar unsaved" style={{ borderColor: '#f87171', background: '#fef2f2' }}>
          <div className="matrix-status-msg" style={{ color: '#991b1b' }}>
            <AlertTriangle size={18} />
            <span>Are you sure you want to reset all role permissions to factory defaults? Custom changes will be overwritten.</span>
          </div>
          <div className="matrix-actions-buttons">
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={handleResetDefaults}
              disabled={saving}
            >
              Yes, reset to defaults
            </Button>
          </div>
        </div>
      )}

      {/* Permissions Matrix Grid Table */}
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
            const filteredPerms = perms.filter(p =>
              !query ||
              p.name.toLowerCase().includes(query.toLowerCase()) ||
              p.description.toLowerCase().includes(query.toLowerCase())
            );

            if (filteredPerms.length === 0) return null;

            return (
              <tbody key={categoryName}>
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
                              aria-label="Owner always allowed"
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
                            aria-label={`Toggle ${perm.name} for ${roles[roleKey]}`}
                            title={`${isChecked ? 'Disable' : 'Enable'} ${perm.name} for ${roles[roleKey]}`}
                          >
                            {isChecked && <Check size={16} strokeWidth={3} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
