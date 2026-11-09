import { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { stockRoles } from '../utils/constants';

const BranchContext = createContext(null);

export function BranchProvider({ user, children }) {
  const [branch, setBranch] = useState(user?.branch_id || 0);
  const [branches, setBranches] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [branchError, setBranchError] = useState('');

  useEffect(() => {
    if (!user) return;
    apiClient('branches')
      .then(setBranches)
      .catch(e => setBranchError(e.message));

    if (stockRoles.includes(user.role)) {
      apiClient('destinations')
        .then(setDestinations)
        .catch(e => setBranchError(e.message));
    }
  }, [user]);

  return (
    <BranchContext.Provider
      value={{
        branch,
        setBranch,
        branches,
        destinations,
        branchError,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) throw new Error('useBranch must be used within a BranchProvider');
  return context;
}
