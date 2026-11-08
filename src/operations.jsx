import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowUpDown, Box, CalendarDays, CheckCircle2, CreditCard, DollarSign, Layers3, Package, Pencil, Plus, Smartphone, UserRound, Users, Wrench } from 'lucide-react';
import { DataView, useData } from './data';
import { Badge, Button, Empty, FilterTabs, Heading, Modal, Panel, ProductArt, SearchBox, Select, Stats, Table, categories, cents, dateLabel, initials, money, options, ref, rupees, stockStatus, tenders, today, transitions } from './ui';

const actionBranch = ctx => ctx.branch || ctx.branches[0]?.id;
const branchField = ctx => ({name:'branch',label:'Branch',choices:options(ctx.branches)});
const itemFilter = (item,q,fields) => fields.some(key=>String(item[key]||'').toLowerCase().includes(q.trim().toLowerCase()));
const stateTone = status => ({'Low Stock':'amber','Out of Stock':'red','In Stock':'green'})[status];

export function Inventory({ctx}) {
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('');
  const [brand,setBrand]=useState('');
  const [filter,setFilter]=useState(ctx.intent==='low'?'Reorder alerts':'');
  const [tab,setTab]=useState('Products');
  const [unitBranch,setUnitBranch]=useState(actionBranch(ctx));
  const state=useData(ctx,{items:'products',units:['units',{branch:unitBranch}]});
  useEffect(()=>{if(ctx.intent==='low'){setFilter('Reorder alerts');ctx.clearIntent();}},[ctx.intent]);
  const form=(item)=>ctx.setDialog({
    title:item?'Edit product':'Add product',route:'product.save',submit:item?'Save product':'Create product',wide:true,
    values:{...item,branch:actionBranch(ctx),category:item?.category||'Accessories',cost:rupees(item?.cost),price:rupees(item?.price),reorder_level:item?.reorder_level||0},
    fields:values=>[
      branchField(ctx),{name:'sku',label:'SKU'},{name:'name',label:'Product name'},{name:'barcode',label:'Barcode',optional:true},
      {name:'brand',label:'Brand',optional:true},{name:'category',label:'Category',choices:categories},
      {name:'cost',label:'Cost (LKR)',type:'money'},{name:'price',label:'Selling price (LKR)',type:'money'},
      {name:'reorder_level',label:'Reorder level',type:'number',min:0},
      ...(!item&&values.category==='Accessories'?[{name:'serialized',label:'Track by individual serial number',type:'checkbox'}]:[])
    ], transform:v=>({...v,cost:cents(v.cost),price:cents(v.price)})
  });
  const adjust=(items)=>ctx.setDialog({title:'Stock adjustment',route:'stock.adjust',values:{branch:actionBranch(ctx),direction:'In'},
    fields:[branchField(ctx),{name:'product_id',label:'Product',choices:options(items.filter(p=>!p.serialized&&p.category!=='Services'))},
      {name:'direction',label:'Direction',choices:['In','Out']},{name:'qty',label:'Quantity',type:'number',min:1},{name:'reason',label:'Reason',full:true}]});
  const receive=(items)=>ctx.setDialog({title:'Receive device unit',route:'unit.receive',values:{branch:unitBranch,grade:'New'},
    fields:[branchField(ctx),{name:'product_id',label:'Serialized product',choices:options(items.filter(p=>p.serialized))},{name:'code',label:'Internal unit code'},
      {name:'imei',label:'IMEI / serial',optional:true},{name:'grade',label:'Condition grade',choices:['New','Used','Refurbished']}]});
  return <DataView state={state}>{({items,units})=>{
    const low=items.filter(p=>stockStatus(p)==='Low Stock').length;
    const out=items.filter(p=>stockStatus(p)==='Out of Stock').length;
    const matching=items.filter(p=>(!category||category===p.category)&&(!brand||brand===p.brand)&&
      (!filter||filter===stockStatus(p)||(filter==='Reorder alerts'&&p.category!=='Services'&&p.qty<=p.reorder_level))&&itemFilter(p,query,['name','sku','barcode','brand']));
    return <>
      <Heading title="Products & Inventory" description="Manage your catalog, branch stock levels, pricing and individual device units.">
        <Button icon={ArrowUpDown} onClick={()=>adjust(items)}>Adjust stock</Button><Button icon={Plus} variant="primary" onClick={()=>form()}>Add product</Button>
      </Heading>
      <Stats items={[
        {icon:Package,label:'Total Products',value:items.length,note:'Shared catalog'},
        {icon:Layers3,label:'In Stock',value:items.filter(p=>p.qty>0).length,note:'Products with available units',tone:'mint'},
        {icon:AlertTriangle,label:'Low Stock',value:low,note:'At or below reorder level',tone:'amber'},
        {icon:Box,label:'Out of Stock',value:out,note:'Products with no available units',tone:'red'},
        {icon:DollarSign,label:'Stock Value (Cost)',value:money(items.reduce((sum,p)=>sum+p.qty*p.cost,0)),note:'Selected branch scope',tone:'violet'}
      ]}/>
      <Panel title={tab==='Products'?'Product Catalog':'Serialized Devices'} icon={tab==='Products'?Package:Smartphone} action={<FilterTabs choices={['Products','Device Units']} value={tab} onChange={v=>{setTab(v);setQuery('');}}/>}>
        {tab==='Products'?<>
          <div className="panel-tools toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search by SKU, product or barcode…"/>
            <Select aria-label="Category" blank="All categories" value={category} onChange={e=>setCategory(e.target.value)} options={categories}/>
            <Select aria-label="Brand" blank="All brands" value={brand} onChange={e=>setBrand(e.target.value)} options={[...new Set(items.map(p=>p.brand).filter(Boolean))].sort()}/>
            <Select aria-label="Stock status" blank="All stock statuses" value={filter} onChange={e=>setFilter(e.target.value)} options={['In Stock','Low Stock','Out of Stock','Reorder alerts']}/>
            <Button variant="link" onClick={()=>{setQuery('');setBrand('');setFilter('');setCategory('');}}>Clear filters</Button>
          </div>
          <Table rows={matching} columns={[[ 'SKU',r=><span className="mono">{r.sku}</span>],
            ['Product',r=><div className="table-product"><ProductArt item={r} small/><span><strong>{r.name}</strong><small className="subtext">{r.brand||r.category}</small></span></div>],
            ['Category',r=><Badge tone="blue">{r.category}</Badge>],['Stock',r=><strong>{r.category==='Services'?'—':r.qty}</strong>],
            ['Reorder level','reorder_level'],['Buy price',r=>money(r.cost)],['Sell price',r=>money(r.price)],['Status',r=><Badge tone={stateTone(stockStatus(r))}>{stockStatus(r)}</Badge>],
            ['Edit',r=><Button icon={Pencil} className="icon-only" aria-label={'Edit '+r.name} onClick={()=>form(r)}/>]]}/>
          <div className="panel-foot">Showing {matching.length} of {items.length} products</div>
        </>:<>
          <div className="panel-tools toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Find unit code or IMEI…"/>
            <Select aria-label="Device branch" value={unitBranch} onChange={e=>setUnitBranch(Number(e.target.value))} options={options(ctx.branches)}/>
            <Button icon={Plus} variant="primary" onClick={()=>receive(items)}>Receive device</Button></div>
          <Table rows={units.filter(u=>itemFilter(u,query,['code','imei','grade','state']))} columns={[[ 'Unit code','code'],['Product',r=>items.find(p=>p.id===r.product_id)?.name],['IMEI','imei'],['Grade','grade'],['Status',r=><Badge>{r.state}</Badge>],
            ['Actions',r=>r.state==='Inspection'?<Button onClick={()=>ctx.setDialog({title:'Release inspected device',description:r.code,route:'unit.release',values:{id:r.id,branch:unitBranch},fields:[{name:'reason',label:'Inspection outcome',full:true}]})}>Release to stock</Button>:null]]}/>
        </>}
      </Panel>
    </>;
  }}</DataView>;
}

export function Repairs({ctx}) {
  const tech=ctx.user.role==='technician';
  const [intakeBranch,setIntakeBranch]=useState(actionBranch(ctx));
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState(ctx.intent==='overdue'?'Overdue':'All jobs');
  const [view,setView]=useState('Board');
  const [assigned,setAssigned]=useState('');
  const [detail,setDetail]=useState(null);
  const state=useData(ctx,{jobs:'repairs',...(!tech?{customers:['customers',{branch:intakeBranch}],technicians:['technicians',{branch:intakeBranch}]}:{})});
  const intake=(customers,technicians)=>ctx.setDialog({
    title:'New Repair Job',description:'Record the customer, device condition and reported issue.',route:'repair.create',wide:true,submit:'Create repair job',
    values:{branch:intakeBranch,due_date:today(),estimate:0},
    fields:[{name:'customer_id',label:'Customer',choices:options(customers)},{name:'technician_id',label:'Assigned technician',choices:options(technicians),optional:true},
      {name:'device',label:'Device brand and model'},{name:'serial',label:'IMEI / Serial number',optional:true},{name:'issue',label:'Reported issue',type:'textarea'},
      {name:'notes',label:'Physical condition notes',type:'textarea',optional:true},{name:'accessories',label:'Accessories handed over',optional:true},
      {name:'estimate',label:'Estimated cost (LKR)',type:'money'},{name:'due_date',label:'Promised date',type:'date'}],
    transform:v=>({...v,estimate:cents(v.estimate)})
  });
  useEffect(()=>{
    if(ctx.intent==='overdue'){setFilter('Overdue');ctx.clearIntent();}
    if(ctx.intent==='new'&&state.data&&!tech){intake(state.data.customers,state.data.technicians);ctx.clearIntent();}
  },[ctx.intent,state.data]);
  const openJob = job => {
    const next=(transitions[job.status]||[]).filter(s=>tech?!['Cancelled','Delivered'].includes(s):ctx.user.role==='cashier'?s==='Delivered':true);
    if(!next.length) {setDetail(job);return;}
    ctx.setDialog({
      title:ref('REP',job.id)+' · '+job.device,description:job.customer+' · '+job.issue+' · '+job.status,
      route:'repair.status',submit:'Update status',values:{branch:job.branch_id,id:job.id},fields:[{name:'status',label:'Next status',choices:next,full:true}],
    });
  };
  const groups = [
    ['Received',['Received'],'blue'],['Diagnosing',['Diagnosing','Awaiting Approval'],'blue'],
    ['In progress',['Waiting for Parts','In Progress','Testing'],'amber'],['Ready',['Ready'],'violet'],['Delivered',['Delivered','Cancelled'],'mint']
  ];
  return <DataView state={state}>{({jobs,customers,technicians})=>{
    const active=jobs.filter(j=>!['Delivered','Cancelled'].includes(j.status));
    const overdue=active.filter(j=>j.due_date<today());
    const due=active.filter(j=>j.due_date===today());
    const results=jobs.filter(j=>(!assigned||String(j.technician_id)===assigned)&&
      (filter==='All jobs'||(filter==='Overdue'?overdue.includes(j):due.includes(j)))&&
      (itemFilter(j,query,['customer','device','issue','serial'])||ref('REP',j.id).toLowerCase().includes(query.toLowerCase())));
    return <>
      <Heading title={tech?'My Repair Jobs':'Repair Jobs Board'} description="Manage and track devices from intake to delivery.">
        {!tech&&<><Select aria-label="Intake branch" value={intakeBranch} onChange={e=>setIntakeBranch(Number(e.target.value))} options={options(ctx.branches)}/><Button icon={Plus} variant="primary" disabled={state.pending} onClick={()=>intake(customers,technicians)}>New repair job</Button></>}
      </Heading>
      <Stats items={[
        {icon:Wrench,label:'Open Repairs',value:active.length,note:'Active service jobs'},
        {icon:AlertTriangle,label:'Overdue Repairs',value:overdue.length,note:'Past promised date',tone:'red'},
        {icon:CheckCircle2,label:'Delivered',value:jobs.filter(j=>j.status==='Delivered').length,note:'Handed to customer',tone:'mint'},
        {icon:CalendarDays,label:'Due Today',value:due.length,note:dateLabel(today()),tone:'blue'}
      ]}/>
      <Panel className="repair-tools"><div className="panel-tools toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Search job, device or customer…"/>
        {!tech&&<Select aria-label="Technician" value={assigned} onChange={e=>setAssigned(e.target.value)} blank="All technicians" options={[...new Map(jobs.filter(j=>j.technician_id).map(j=>[j.technician_id,j.technician])).entries()]}/>}
        <FilterTabs choices={['All jobs','Overdue','Due today']} value={filter} onChange={setFilter}/>
        <FilterTabs choices={['Board','List']} value={view} onChange={setView}/>
      </div></Panel>
      {view==='Board'?<div className="kanban">{groups.map(([group,states,tone])=>{
        const list=results.filter(j=>states.includes(j.status));
        return <section className={'kanban-column '+tone} key={group}><header><strong>{group}</strong><Badge tone={tone==='mint'?'green':tone}>{list.length}</Badge></header>
          <div className="kanban-list">{list.map(j=><article className="repair-card" key={j.id}><div><strong className="mono">{ref('REP',j.id)}</strong><Badge>{j.status}</Badge></div>
            <h3>{j.device}</h3><p>{j.issue}</p><small><UserRound size={14}/>{j.customer}</small><small><CalendarDays size={14}/>{dateLabel(j.due_date)}</small>
            <div><b>{money(j.estimate)}</b><Button className="icon-only" icon={ArrowRight} aria-label={'Open '+ref('REP',j.id)} onClick={()=>openJob(j)}/></div></article>)}
            {!list.length&&<Empty>No jobs</Empty>}</div></section>;
      })}</div>:<Panel title="Repair Jobs" icon={Wrench}><Table rows={results} onRow={openJob} columns={[[ 'Job',r=>ref('REP',r.id)],['Device','device'],['Customer','customer'],['Technician','technician'],['Promised date',r=>dateLabel(r.due_date)],['Estimate',r=>money(r.estimate)],['Status',r=><Badge>{r.status}</Badge>]]}/></Panel>}
      {detail&&<Modal title={ref('REP',detail.id)+' · '+detail.device} description={detail.customer+' · '+detail.status} onClose={()=>setDetail(null)}>
        <div className="modal-body"><p>{detail.issue}</p><div className="detail"><div><small>Technician</small><strong>{detail.technician||'Unassigned'}</strong></div>
          <div><small>Promised date</small><strong>{dateLabel(detail.due_date)}</strong></div><div><small>Estimate</small><strong>{money(detail.estimate)}</strong></div></div></div>
        <div className="modal-footer"><Button onClick={()=>setDetail(null)}>Close</Button></div>
      </Modal>}
    </>;
  }}</DataView>;
}

export function Customers({ctx}) {
  const state=useData(ctx,{customers:'customers',sales:'sales',repairs:'repairs'});
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState(null);
  const [onlyCredit,setOnlyCredit]=useState(ctx.intent==='credit');
  useEffect(()=>{if(ctx.intent==='credit'){setOnlyCredit(true);ctx.clearIntent();}},[ctx.intent]);
  const form=person=>ctx.setDialog({
    title:person?'Edit customer':'New customer',route:'customer.save',
    values:{...person,branch:person?.branch_id||actionBranch(ctx)},
    fields:[...(!person?[branchField(ctx)]:[]),{name:'name',label:'Full name'},{name:'phone',label:'Phone number',type:'tel'},
      {name:'email',label:'Email',type:'email',optional:true},{name:'notes',label:'Notes',type:'textarea',optional:true}],
    onSuccess:r=>setSelected(r.id)
  });
  return <DataView state={state}>{({customers,sales,repairs})=>{
    const filtered=customers.filter(c=>itemFilter(c,query,['name','phone','email'])&&(!onlyCredit||c.credit>0));
    const person=filtered.find(c=>c.id===selected)||filtered[0];
    const personSales=person?sales.filter(s=>s.customer_id===person.id):[];
    const receivables=personSales.filter(s=>s.credit>0);
    const payment=()=>ctx.setDialog({
      title:'Record credit payment',description:person.name+' · '+money(person.credit)+' outstanding',route:'sale.credit',submit:'Record payment',
      values:{branch:person.branch_id,method:'Cash',invoice:receivables[0]?ref('INV',receivables[0].id):''},
      fields:v=>[{name:'invoice',label:'Invoice number'},{name:'amount',label:'Amount (LKR)',type:'money',min:.01},{name:'method',label:'Payment method',choices:tenders},
        ...(v.method!=='Cash'?[{name:'reference',label:'Confirmed transaction reference'}]:[])],
      transform:v=>({...v,amount:cents(v.amount)})
    });
    return <>
      <Heading title="Customers & Credit" description="Manage customer profiles, purchase history and outstanding credit."><Button icon={Plus} variant="primary" onClick={()=>form()}>New customer</Button></Heading>
      <Stats items={[
        {icon:Users,label:'Total Customers',value:customers.length,note:'Selected branch scope'},
        {icon:CreditCard,label:'Outstanding Credit',value:money(customers.reduce((s,c)=>s+Number(c.credit),0)),note:'Open receivables',tone:'violet'},
        {icon:DollarSign,label:'Total Purchases',value:money(customers.reduce((s,c)=>s+Number(c.total),0)),note:'Posted sales to customers',tone:'mint'}
      ]}/>
      <div className="split-grid">
        <Panel title="Customer List" icon={Users}>
          <div className="panel-tools toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search by name, phone or email…"/><Button variant={onlyCredit?'primary':''} onClick={()=>setOnlyCredit(!onlyCredit)}>Credit only</Button></div>
          <Table rows={filtered} onRow={c=>setSelected(c.id)} columns={[[ 'Customer',c=><div className="table-product"><span className="avatar mini">{initials(c.name)}</span><span><strong>{c.name}</strong><small className="subtext">{ref('CUS',c.id)}</small></span></div>],['Phone','phone'],['Branch','branch'],['Credit',c=><Badge tone={c.credit>0?'red':'green'}>{money(c.credit)}</Badge>]]}/>
        </Panel>
        {person?<div className="stack"><Panel title={person.name} icon={UserRound} action={<Button icon={Pencil} onClick={()=>form(person)}>Edit</Button>}>
          <div className="detail"><div><small>Customer ID</small><strong>{ref('CUS',person.id)}</strong></div><div><small>Phone</small><strong>{person.phone}</strong></div><div><small>Email</small><strong>{person.email||'—'}</strong></div><div><small>Branch</small><strong>{person.branch}</strong></div></div>
          {person.notes&&<p className="note-strip">{person.notes}</p>}
          <div className="panel-tools toolbar"><strong>Credit balance · {money(person.credit)}</strong><Button icon={CreditCard} variant="primary" disabled={!Number(person.credit)} onClick={payment}>Record payment</Button></div>
        </Panel><Panel title="Recent Sales" icon={CreditCard}><Table rows={personSales.slice(0,5)} columns={[[ 'Invoice',r=>ref('INV',r.id)],['Items','items'],['Total',r=>money(r.total)],['Credit',r=>money(r.credit)]]}/></Panel>
        <Panel title="Repair History" icon={Wrench}><Table rows={repairs.filter(r=>r.customer_id===person.id).slice(0,5)} columns={[[ 'Job',r=>ref('REP',r.id)],['Device','device'],['Status',r=><Badge>{r.status}</Badge>]]}/></Panel></div>:<Panel><Empty>Select a customer to view details.</Empty></Panel>}
      </div>
    </>;
  }}</DataView>;
}
