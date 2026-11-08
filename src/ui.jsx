import { useEffect, useId, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, LoaderCircle, Search, X } from 'lucide-react';

export const money = value => 'LKR ' + (Number(value || 0) / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rupees = value => Number(value || 0) / 100;
export const cents = value => Math.round(Number(value || 0) * 100);
export const number = value => Number(value || 0).toLocaleString('en-LK');
export const ref = (prefix, id) => prefix + '-' + String(id).padStart(6,'0');
export const roles = { owner:'Owner', manager:'Branch Manager', cashier:'Cashier', technician:'Technician', stock:'Inventory Staff' };
export const sellers = ['owner','manager','cashier'];
export const managers = ['owner','manager'];
export const stockRoles = ['owner','manager','stock'];
export const tenders = ['Cash','Card','Bank Transfer','Koko'];
export const categories = ['Phones','Accessories','Repair Parts','Services'];
export const statuses = ['Received','Diagnosing','Awaiting Approval','Waiting for Parts','In Progress','Testing','Ready','Delivered','Cancelled'];
export const transitions = {
  Received:['Diagnosing','Cancelled'], Diagnosing:['Awaiting Approval','Waiting for Parts','In Progress','Cancelled'],
  'Awaiting Approval':['Waiting for Parts','In Progress','Cancelled'], 'Waiting for Parts':['In Progress','Cancelled'],
  'In Progress':['Waiting for Parts','Testing','Cancelled'], Testing:['In Progress','Ready'], Ready:['Delivered','In Progress'],
};
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Colombo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
export const dateLabel = (date, opts = { day:'2-digit', month:'short', year:'numeric' }) => date
  ? new Intl.DateTimeFormat('en-GB', { ...opts, timeZone:'Asia/Colombo' }).format(new Date(date.length === 10 ? date + 'T00:00:00+05:30' : date.replace(' ','T') + '+05:30'))
  : '—';
export const timeLabel = date => dateLabel(date, {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true});
export const initials = name => name.split(/\s+/).slice(0,2).map(s => s[0]).join('').toUpperCase();
export const options = (data, display='name') => data.map(row => [row.id,row[display]]);

export function Button({ icon: Icon, children, variant='', className='', ...props }) {
  return <button type="button" className={'button ' + variant + ' ' + className} {...props}>{Icon && <Icon size={17} />}{children}</button>;
}
export function Heading({ title, description, children }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>;
}
export function Panel({ title, icon: Icon, action, children, className='' }) {
  return <section className={'panel '+className}>
    {title && <div className="panel-header"><h2>{Icon && <Icon size={19} />}{title}</h2>{action}</div>}
    {children}
  </section>;
}
export function Badge({ children, tone }) {
  const color = tone || (['Completed','Delivered','Available','Active','Ready','Open','Received'].includes(children) ? 'green' :
    ['Pending','Waiting for Parts','Low Stock','Inspection','Requested'].includes(children) ? 'amber' :
    ['Rejected','Cancelled','Out of Stock','Inactive'].includes(children) ? 'red' : 'blue');
  return <span className={'badge '+color}>{children}</span>;
}
export function Stats({ items }) {
  return <div className="stats">{items.map(({icon:Icon,label,value,note,tone='teal'}) =>
    <div className="stat" key={label}>
      <span className={'stat-icon '+tone}><Icon size={22} strokeWidth={1.9}/></span>
      <div><div className="stat-label">{label}</div><strong>{value}</strong><div className="stat-note">{note}</div></div>
    </div>)}</div>;
}
export function SearchBox({ value, onChange, placeholder, inputRef, onKeyDown }) {
  return <label className="search-box"><Search size={18}/><input ref={inputRef} type="search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} onKeyDown={onKeyDown}/></label>;
}
export function Select({ children, options: choices=[], blank, ...props }) {
  return <span className="select-wrap"><select {...props}>{blank !== undefined && <option value="">{blank}</option>}{choices.map(item => {
    const [id,name] = Array.isArray(item) ? item : [item,item];
    return <option key={id} value={id}>{name}</option>;
  })}{children}</select><ChevronDown size={14}/></span>;
}
export function Empty({ children = 'No records to display.' }) { return <div className="empty">{children}</div>; }
export function Spinner() { return <div className="empty"><LoaderCircle className="spin" size={22}/> Loading workspace…</div>; }
export function Alert({ children, tone='error' }) {
  if (!children) return null;
  const Icon = tone === 'success' ? Check : AlertTriangle;
  return <div className={'alert '+tone} role={tone==='error'?'alert':'status'}><Icon size={17}/><span>{children}</span></div>;
}
export function Table({ columns, rows, onRow, empty }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return <div className="table-wrap"><table><thead><tr>{columns.map(([label])=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
    {rows.map((row,index)=><tr key={row.id ?? index} className={onRow?'clickable':''} onClick={onRow?()=>onRow(row):undefined}
      onKeyDown={onRow?e=>{if(e.target===e.currentTarget && (e.key==='Enter'||e.key===' ')){e.preventDefault();onRow(row);}}:undefined} tabIndex={onRow?0:undefined}>
      {columns.map(([label, render])=><td key={label}>{typeof render==='function'?render(row,index):row[render]}</td>)}
    </tr>)}</tbody></table></div>;
}
export function Modal({ title, description, children, onClose, wide=false, busy=false }) {
  useEffect(() => {
    const previous = document.activeElement;
    const handle = e => {
      if (e.key==='Escape' && !busy) onClose();
      if (e.key==='Tab') {
        const items = [...document.querySelectorAll('.modal button:not([disabled]), .modal input:not([disabled]), .modal select:not([disabled]), .modal textarea:not([disabled])')].filter(el=>el.getClientRects().length);
        if (!items.length) return;
        if (e.shiftKey && document.activeElement===items[0]) {e.preventDefault();items.at(-1).focus();}
        if (!e.shiftKey && document.activeElement===items.at(-1)) {e.preventDefault();items[0].focus();}
      }
    };
    document.addEventListener('keydown',handle);
    document.querySelector('.modal [autofocus], .modal button')?.focus();
    return () => {document.removeEventListener('keydown',handle); previous?.focus?.();};
  }, [busy]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget && !busy)onClose();}}>
    <section className={'modal '+(wide?'wide':'')} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><Button icon={X} className="icon-only" aria-label="Close" disabled={busy} onClick={onClose}/></div>
      {children}
    </section>
  </div>;
}
export function Field({ label, children, full=false }) { return <label className={'field '+(full?'full':'')}><span>{label}</span>{children}</label>; }
export function FormDialog({ spec, close, mutate }) {
  const [values,setValues] = useState(spec.values || {});
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const update = (key,value) => setValues(v=>({...v,[key]:value}));
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await mutate(spec.route,spec.transform ? spec.transform(values) : values);
      spec.onSuccess?.(result);
      close();
    } catch (e) { setError(e.message); } finally {setBusy(false);}
  };
  return <Modal title={spec.title} description={spec.description} onClose={close} busy={busy} wide={spec.wide}>
    <form onSubmit={submit}>
      <div className="modal-body"><Alert>{error}</Alert><div className="form-grid">
        {(typeof spec.fields==='function'?spec.fields(values):spec.fields).map(({name,label,type='text',choices,optional,full,min,max,placeholder})=>{
          const value = values[name] ?? '';
          const props = { value, required:!optional, onChange:e=>update(name,e.target.value), placeholder };
          return <Field key={name} label={label} full={full || type==='textarea' || type==='checkbox'}>
            {choices ? <Select {...props} options={choices} blank="Select…" /> : type==='textarea' ? <textarea {...props} rows={3}/> :
              type==='checkbox' ? <input className="check" type="checkbox" checked={!!value} onChange={e=>update(name,e.target.checked)}/> :
              <input {...props} type={type==='money'?'number':type} min={min ?? (type==='money'?0:undefined)} max={max} step={type==='money'?'0.01':type==='number'?'1':undefined}/>}
          </Field>;
        })}
      </div></div>
      <div className="modal-footer"><Button onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant={spec.danger?'danger':'primary'} icon={busy?LoaderCircle:Check} disabled={busy}>{busy?'Saving…':(spec.submit||'Save changes')}</Button></div>
    </form>
  </Modal>;
}
export function FilterTabs({ choices, value, onChange }) {
  return <div className="tabs" role="group" aria-label="Filters">{choices.map(item=>{
    const [key,label] = Array.isArray(item)?item:[item,item];
    return <button key={key} className={key===value?'selected':''} type="button" aria-pressed={key===value} onClick={()=>onChange(key)}>{label}</button>;
  })}</div>;
}
export const stockStatus = item => item.category==='Services'?'Service':!item.qty?'Out of Stock':item.qty<=item.reorder_level?'Low Stock':'In Stock';
export function ProductArt({ item, small=false }) {
  const gradient=useId();
  const phone = item.category==='Phones' || item.category==='Repair Parts' || item.sku?.includes('CASE') || item.sku?.includes('GLASS');
  const color = item.brand==='Samsung'?'#a6a2e9':item.brand==='Xiaomi'?'#32bdc4':'#5f7ab6';
  return <span className={'product-art '+(small?'small':'')} aria-hidden="true">
    {phone ? <svg viewBox="0 0 96 84"><defs><linearGradient id={gradient} x2="100%" y2="100%"><stop stopColor={color}/><stop offset="1" stopColor="#e4effa"/></linearGradient></defs>
      <rect x="23" y="9" width="35" height="65" rx="8" fill={color} stroke="#47546d"/><circle cx="31" cy="18" r="4" fill="#15233c"/><circle cx="31" cy="28" r="4" fill="#15233c"/>
      <rect x="42" y="7" width="35" height="67" rx="8" fill="#162037"/><rect x="45" y="10" width="29" height="61" rx="5" fill={'url(#'+gradient+')'}/>
      <path d="M45 58L74 28v16L50 71h-5z" fill="#fff" opacity=".28"/><rect x="54" y="12" width="11" height="3" rx="1.5" fill="#162037"/></svg> :
      <svg viewBox="0 0 96 84">{item.sku?.includes('CBL') || item.sku?.includes('USB-C') ?
        <><ellipse cx="45" cy="43" rx="24" ry="19" fill="none" stroke="#8ca1b1" strokeWidth="5"/><ellipse cx="45" cy="43" rx="18" ry="14" fill="none" stroke="#c1d0dc" strokeWidth="4"/><path d="M60 58l10 8M24 53l-9 8" stroke="#8ca1b1" strokeWidth="6"/></> :
        item.sku?.includes('AP-') ? <><rect x="23" y="36" width="51" height="31" rx="12" fill="#fff" stroke="#b6c8da"/><path d="M24 48h48" stroke="#c6d2de"/><path d="M38 19v22m19-22v22" stroke="#a5b7c7" strokeWidth="7" strokeLinecap="round"/><ellipse cx="38" cy="22" rx="10" ry="8" fill="#f8fcff"/><ellipse cx="57" cy="22" rx="10" ry="8" fill="#f8fcff"/><circle cx="48" cy="57" r="2" fill="#2ed4a9"/></> :
        <><rect x="26" y="31" width="44" height="38" rx="9" fill="#fff" stroke="#b6c8da"/><path d="M39 32V18m18 14V18" stroke="#899dac" strokeWidth="5" strokeLinecap="round"/><rect x="42" y="57" width="12" height="4" rx="2" fill="#29384b"/></>}</svg>}
  </span>;
}
