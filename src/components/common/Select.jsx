import { ChevronDown } from 'lucide-react';

export function Select({ children, options: choices = [], blank, ...props }) {
  return (
    <span className="select-wrap">
      <select {...props}>
        {blank !== undefined && <option value="">{blank}</option>}
        {choices.map(item => {
          const [id, name] = Array.isArray(item) ? item : [item, item];
          return (
            <option key={id} value={id}>
              {name}
            </option>
          );
        })}
        {children}
      </select>
      <ChevronDown size={14} />
    </span>
  );
}
