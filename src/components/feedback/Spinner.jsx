import { LoaderCircle } from 'lucide-react';

export function Spinner({ message = 'Loading workspace…' }) {
  return (
    <div className="empty">
      <LoaderCircle className="spin" size={22} /> {message}
    </div>
  );
}
