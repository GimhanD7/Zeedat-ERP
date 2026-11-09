import { X } from 'lucide-react';
import { Button } from '../common/Button';
import { Alert } from './Alert';

export function Toast({ notice, onClose }) {
  if (!notice) return null;

  return (
    <div className="toast">
      <Alert tone="success">{notice}</Alert>
      <Button
        icon={X}
        className="icon-only"
        aria-label="Dismiss message"
        onClick={onClose}
      />
    </div>
  );
}
