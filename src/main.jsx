import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeftRight, ArrowRight, Bell, Boxes, Building2, ChevronDown, ChevronRight, CircleHelp, ClipboardList, LayoutDashboard, LogOut, Menu, Package, Search, Settings, ShieldCheck, ShoppingCart, Smartphone, Store, Users, Wallet, Wrench, ChartNoAxesCombined, X } from 'lucide-react';
import { Alert, Button, FormDialog, Modal, Select, Spinner, initials, roles, sellers, managers, stockRoles } from './ui';
import { Dashboard, Reports } from './dashboard';
import { Pos, SalesHistory } from './pos';
import { Inventory, Repairs, Customers } from './operations';
import { Drawer, Returns, Purchases, Transfers } from './finance';
import { Staff, SettingsPage } from './admin';
import './style.css';

const pages = [
  ['dashboard','Dashboard',LayoutDashboard,managers,Dashboard],
  ['pos','POS / Sales',ShoppingCart,sellers,Pos],
  ['repairs','Repairs',Wrench,[...sellers,'technician'],Repairs],
  ['inventory','Inventory',Package,stockRoles,Inventory],
  ['drawer','Cash Register',Wallet,sellers,Drawer],
  ['returns','Returns',ArrowLeftRight,sellers,Returns],
  ['purchases','Purchases',ClipboardList,stockRoles,Purchases],
  ['transfers','Stock Transfers',Boxes,stockRoles,Transfers],
  ['customers','Customers',Users,sellers,Customers],
  ['reports','Reports',ChartNoAxesCombined,managers,Reports],
  ['sales','Sales History',ChartNoAxesCombined,sellers,SalesHistory],
  ['staff','Staff',ShieldCheck,['owner'],Staff],
  ['settings','Settings',Settings,['owner'],SettingsPage],
];
const apiPath = new URL("api/index.php", document.baseURI).pathname;

async function api(route, { query={}, data, csrf, key }={}) {
  const params = new URLSearchParams({route,...query});
  let response;
  try {
    response = await fetch(apiPath + '?' + params, data ? {
      method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf || '', 'Idempotency-Key':key || ''},
      body:JSON.stringify(data)
    } : {});
  } catch { throw new Error('Connection unavailable. Check the server and try again.'); }
  const result = await response.json().catch(()=>({error:'The PHP API is unavailable. Check that the server is running.'}));
  if (!response.ok || result.error) throw Object.assign(new Error(result.error || 'Request failed.'),{status:response.status});
  return result;
}
function requestKey() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function Logo() {
  return <div className="brand"><span className="brand-mark"><Smartphone size={25} strokeWidth={2.4}/></span><span><strong>ZEEDAT <em>POS</em></strong><small>RETAIL & REPAIR</small></span></div>;
}
function Login({ onLogin, error:initialError }) {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [error,setError] = useState(initialError || '');
  const [busy,setBusy] = useState(false);
  const submit = async e=>{
    e.preventDefault();setBusy(true);setError('');
    try {onLogin(await api('login',{data:{email,password}}));} catch(e) {setError(e.message);} finally {setBusy(false);}
  };
  return <main className="login">
    <aside className="login-aside"><Logo/>
      <div className="login-message"><span className="eyebrow"><span className="dot"/> ZEEDAT WORKSPACE</span>
        <h1>One workspace for your shop.</h1>
        <p>Sell products, track repairs, and manage stock across branches.</p>
        <div className="login-visual" aria-hidden="true">
          <div className="visual-grid"/><span className="visual-orb one"/><span className="visual-orb two"/>
          <div className="visual-card card-a"><ShoppingCart/><span>POINT OF SALE</span><b>Checkout</b><div className="visual-line"/></div>
          <div className="visual-card card-b"><Wrench/><span>REPAIR DESK</span><b>Track every job</b><div className="visual-line"/></div>
          <div className="visual-card card-c"><Package/><span>INVENTORY</span><b>Branch stock</b><div className="visual-line"/></div>
        </div>
      </div><div className="login-bottom"><ShieldCheck size={17}/> Secure branch access</div>
    </aside>
    <section className="login-main"><div className="login-form"><span className="login-icon"><ShieldCheck size={26}/></span>
      <h2>Sign in to ZEEDAT POS</h2><p>Use your staff account to open the workspace.</p>
      <form onSubmit={submit}>
        <Alert>{error}</Alert>
        <label className="field"><span>Email address</span><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@yourshop.lk" required/></label>
        <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" required/></label>
        <Button type="submit" variant="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}<ArrowRight size={18}/></Button>
      </form><div className="login-support"><CircleHelp size={17}/> Contact your shop administrator for account access.</div>
    </div></section>
  </main>;
}
const firstPage = {owner:'dashboard',manager:'dashboard',cashier:'pos',technician:'repairs',stock:'inventory'};
const allBranchPages = ['dashboard','repairs','inventory','returns','purchases','transfers','customers','reports','sales','staff','settings'];

function Workspace({ session, onLogout }) {
  const {user,csrf} = session;
  const available = pages.filter(page=>page[3].includes(user.role));
  const getPage = () => available.find(p=>p[0]===location.hash.slice(1))?.[0] || firstPage[user.role];
  const [page,setPage] = useState(getPage);
  const [branch,setBranch] = useState(user.branch_id || 0);
  const [branches,setBranches] = useState([]);
  const [destinations,setDestinations] = useState([]);
  const [branchError,setBranchError] = useState('');
  const [revision,setRevision] = useState(0);
  const [dialog,setDialog] = useState(null);
  const [notice,setNotice] = useState('');
  const [menu,setMenu] = useState(false);
  const [profile,setProfile] = useState(false);
  const [quick,setQuick] = useState('');
  const [search,setSearch] = useState('');
  const [online,setOnline] = useState(navigator.onLine);
  const [intent,setIntent] = useState('');
  const [appError,setAppError] = useState('');
  const [mutationKeys] = useState(()=>new Map());
  const activeBranch = branch || (allBranchPages.includes(page)?0:branches[0]?.id || 0);

  useEffect(()=>{
    api('branches').then(setBranches).catch(e=>setBranchError(e.message));
    if(stockRoles.includes(user.role)) api('destinations').then(setDestinations).catch(e=>setBranchError(e.message));
    const changed=()=>{setPage(getPage());setMenu(false);};
    const network=()=>setOnline(navigator.onLine);
    window.addEventListener('hashchange',changed);window.addEventListener('online',network);window.addEventListener('offline',network);
    return ()=>{window.removeEventListener('hashchange',changed);window.removeEventListener('online',network);window.removeEventListener('offline',network);};
  },[]);
  useEffect(()=>{if(notice){const t=setTimeout(()=>setNotice(''),3600);return ()=>clearTimeout(t);}},[notice]);

  const navigate = (target, mode='')=>{
    setIntent(mode);setPage(target);location.hash=target;setQuick('');setMenu(false);
  };
  const get = useCallback(async (route,query={})=>{
    try {return await api(route,{query:{branch:activeBranch,...query}});}
    catch(e){if(e.status===401)onLogout();throw e;}
  },[activeBranch,onLogout]);
  const mutate = async (route,values)=>{
    const data = {branch:activeBranch,...values};
    const signature=JSON.stringify([route,data]);
    const key=mutationKeys.get(signature)||requestKey();
    mutationKeys.set(signature,key);
    try {
      const result=await api(route,{data,csrf,key});
      mutationKeys.delete(signature);
      setRevision(v=>v+1);setNotice('Changes saved');
      return result;
    } catch(e) {
      if(e.status && e.status<500) mutationKeys.delete(signature);
      if(e.status===401)onLogout();
      throw e;
    }
  };
  const context = {user,branches,destinations,branch:activeBranch,get,mutate,revision,navigate,setDialog,setNotice,intent,clearIntent:()=>setIntent('')};
  const Page = available.find(item=>item[0]===page)?.[4] || Dashboard;
  const selectedName=branches.find(b=>b.id===activeBranch)?.name || 'All Branches';
  return <div className="app">
    {menu && <button className="mobile-shade" onClick={()=>setMenu(false)} aria-label="Close navigation"/>}
    <aside className={'sidebar '+(menu?'shown':'')}><Logo/>
      <div className="side-scroll">
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">{available.map(([id,label,Icon])=>
          <a key={id} href={'#'+id} className={page===id?'active':''} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}>
            <Icon size={19}/><span>{label}</span>{page===id&&<ChevronRight size={14} className="active-arrow"/>}
          </a>
        )}</nav>
      </div>
      <div className="side-footer"><div className="side-footer-icon"><Smartphone size={20}/></div><div><strong>ZEEDAT POS</strong><small>Retail & Repair Suite</small></div><span className={'dot '+(!online?'offline':'')}/></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="top-left"><Button icon={Menu} className="icon-only mobile-menu" aria-label="Open menu" onClick={()=>setMenu(true)}/>
          <div className="branch-control"><Building2 size={18}/><Select aria-label="Active branch" value={activeBranch} options={[
            ...(user.role==='owner'&&allBranchPages.includes(page)?[[0,'All Branches']]:[]),...branches.map(b=>[b.id,b.name])
          ]} onChange={e=>setBranch(Number(e.target.value))}/></div>
        </div>
        <div className="top-right">
          <span className={'connection '+(!online?'offline':'')}><span className="dot"/>{online?'Online':'Offline'}</span>
          <Button icon={Search} className="icon-only header-icon" aria-label="Find a module" onClick={()=>{setSearch('');setQuick('search');}}/>
          <Button icon={Bell} className="icon-only header-icon" aria-label="Open alerts" onClick={()=>managers.includes(user.role)?navigate('dashboard','alerts'):setQuick('notices')}/>
          <div className="profile-wrap">
            <button className="profile" aria-expanded={profile} onClick={()=>setProfile(!profile)}><span className="avatar">{initials(user.name)}</span><span className="profile-text"><strong>{user.name}</strong><small>{roles[user.role]}</small></span><ChevronDown size={15}/></button>
            {profile&&<div className="profile-menu"><small>{user.email}</small><Button icon={LogOut} onClick={async()=>{try{await api('logout',{data:{},csrf});onLogout();}catch(e){setAppError(e.message);setProfile(false);}}}>Sign out</Button></div>}
          </div>
        </div>
      </header>
      <main className="content"><Alert>{branchError || appError}</Alert>{branches.length?<Page key={page+'-'+activeBranch} ctx={context}/>:!branchError&&<Spinner/>}</main>
      <footer className="workspace-footer"><span><Store size={14}/> {selectedName}</span><span>ZEEDAT POS <b>·</b> Asia/Colombo <b>·</b> LKR</span></footer>
    </div>
    {dialog&&<FormDialog key={dialog.title} spec={dialog} close={()=>setDialog(null)} mutate={mutate}/>}
    {notice&&<div className="toast"><Alert tone="success">{notice}</Alert><Button icon={X} className="icon-only" aria-label="Dismiss message" onClick={()=>setNotice('')}/></div>}
    {quick&&<Modal title={quick==='search'?'Find a module':'Notifications'} onClose={()=>setQuick('')}>
      <div className="modal-body">{quick==='search'?<><input className="quick-input" autoFocus type="search" aria-label="Search modules" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search modules…"/><div className="quick-results">{available.filter(p=>p[1].toLowerCase().includes(search.toLowerCase())).map(([id,label,Icon])=><Button key={id} icon={Icon} onClick={()=>navigate(id)}>{label}<ArrowRight size={15}/></Button>)}</div></>:<p>No new notifications.</p>}</div>
    </Modal>}
  </div>;
}
function App() {
  const [session,setSession] = useState(null);
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState('');
  const logout = useCallback(()=>{setSession(null);location.hash='';},[]);
  useEffect(()=>{api('session').then(data=>setSession(data.user?data:null)).catch(e=>setError(e.message)).finally(()=>setLoaded(true));},[]);
  if(!loaded)return <Spinner/>;
  return session?<Workspace session={session} onLogout={logout}/>:<Login onLogin={data=>{location.hash=firstPage[data.user.role];setSession(data);}} error={error}/>;
}

createRoot(document.getElementById('root')).render(<App/>);

