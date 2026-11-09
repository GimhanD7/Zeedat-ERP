import { createContext, useContext, useState, useEffect } from 'react';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 3600);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const closeDialog = () => setDialog(null);
  const clearNotice = () => setNotice('');

  return (
    <DialogContext.Provider
      value={{
        dialog,
        setDialog,
        closeDialog,
        notice,
        setNotice,
        clearNotice,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useDialog must be used within a DialogProvider');
  return context;
}
