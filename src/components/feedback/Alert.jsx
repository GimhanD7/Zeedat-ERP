import { AlertTriangle, Check } from 'lucide-react';

export function Alert({ children, tone = 'error' }) {
  if (!children) return null;
  const Icon = tone === 'success' ? Check : AlertTriangle;
  return (
    <div className={'alert ' + tone} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={17} />
      <span>{children}</span>
    </div>
  );
}
