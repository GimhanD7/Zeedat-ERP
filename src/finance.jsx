import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, CalendarDays, CircleCheck, Clock3, FileText, LockKeyhole, Package, Plus, Search, ShoppingBag, Truck, Wallet } from 'lucide-react';
import { DataView, useData } from './data';
import { Receipt } from './pos';
import { Alert, Badge, Button, Empty, Field, FilterTabs, Heading, Panel, SearchBox, Select, Stats, Table, cents, dateLabel, managers, money, options, ref, tenders, timeLabel, today } from './ui';

const branchOf = ctx => ctx.branch || ctx.branches[0]?.id;
const canManage = ctx => managers.includes(ctx.user.role);
const dateField = {name:'business_date',label:'Business date',type:'date'};
const amountField = {name:'amount',label:'Amount (LKR)',type:'money',min:.01};

export function Drawer({ctx}) {
  const state=useData(ctx,{register:'drawer'});
  const open=()=>ctx.setDialog({
    title:'Open cash drawer',description:'Record the opening float for the current business day.',route:'drawer.open',submit:'Open drawer',
    fields:[{name:'opening',label:'Opening float (LKR)',type:'money',full:true}],values:{opening:0},transform:v=>({...v,opening:cents(v.opening)})
  });
  const close=drawer=>ctx.setDialog({
    title:'Reconcile and close drawer',description:'Expected cash · '+money(drawer.expected),route:'drawer.close',submit:'Close drawer',
    fields:v=>[{name:'counted',label:'Counted cash (LKR)',type:'money',full:true},{name:'notes',label:'Variance notes',type:'textarea',optional:cents(v.counted)===drawer.expected}],
    transform:v=>({...v,counted:cents(v.counted)}),
    onSuccess:r=>ctx.setNotice('Drawer closed · variance '+money(r.variance))
  });
  const movement=direction=>ctx.setDialog({
    title:'Cash '+direction.toLowerCase(),route:'drawer.movement',values:{direction},fields:[amountField,{name:'reason',label:'Reason / reference',full:true}],transform:v=>({...v,amount:cents(v.amount)})
  });
  return <DataView state={state}>{({register:{drawer,movements,history,blocked}})=>{
    const inflow=movements.reduce((s,r)=>s+Math.max(0,r.amount),0);
    const outflow=movements.reduce((s,r)=>s+Math.min(0,r.amount),0);
    const current=drawer?.business_date===today();
    return <>
      <Heading title="Cash Register" description="Track physical cash, reconcile the drawer and close your business day.">
        <span className="date-chip"><CalendarDays size={16}/>{dateLabel(today())}</span>
        {drawer?<Button icon={LockKeyhole} variant="primary" onClick={()=>close(drawer)}>Close drawer</Button>:<Button icon={Plus} variant="primary" disabled={blocked} onClick={open}>Open drawer</Button>}
      </Heading>
      {blocked&&<Alert>This branch has an open drawer assigned to another cashier.</Alert>}
      {drawer&&!current&&<Alert>The previous business date is still open. Reconcile it before starting today's sales.</Alert>}
      <Stats items={[
        {icon:Wallet,label:'Opening Float',value:money(drawer?.opening),note:drawer?.operator||'Drawer closed'},
        {icon:ArrowDownLeft,label:'Cash In',value:money(inflow),note:'Confirmed cash movements',tone:'mint'},
        {icon:ArrowUpRight,label:'Cash Out',value:money(-outflow),note:'Refunds and disbursements',tone:'red'},
        {icon:Banknote,label:'Expected Cash',value:money(drawer?.expected),note:drawer?'Live drawer balance':'No open session',tone:'violet'}
      ]}/>
      <div className="stack">
        <Panel title="Drawer Movements" icon={Wallet} action={drawer&&current&&canManage(ctx)&&<div className="row-actions"><Button icon={ArrowDownLeft} onClick={()=>movement('In')}>Cash in</Button><Button icon={ArrowUpRight} onClick={()=>movement('Out')}>Cash out</Button></div>}>
          <Table rows={movements} columns={[[ 'Date & time',r=>timeLabel(r.created_at)],['Movement','kind'],['Reference','reference'],['Amount',r=><strong className={r.amount<0?'text-red':'text-green'}>{money(r.amount)}</strong>]]}/>
        </Panel>
        <Panel title="Closed Sessions" icon={LockKeyhole} action={canManage(ctx)&&<Button onClick={()=>ctx.setDialog({title:'Close business day',route:'cycle.close',values:{business_date:today()},fields:[dateField],submit:'Close day'})}>Close business day</Button>}>
          <Table rows={history} columns={[[ 'Business date',r=>dateLabel(r.business_date)],['Operator','operator'],['Opening',r=>money(r.opening)],['Expected',r=>money(r.expected)],['Counted',r=>money(r.counted)],['Variance',r=>money(r.counted-r.expected)],['Notes','notes']]}/>
        </Panel>
      </div>
    </>;
  }}</DataView>;
}

export function Returns({ctx}) {
  const state=useData(ctx,{returns:'returns',settings:'settings'});
  const [lookup,setLookup]=useState('');
  const [invoice,setInvoice]=useState(null);
  const [catalog,setCatalog]=useState({products:[],units:[]});
  const [viewReceipt,setViewReceipt]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [filter,setFilter]=useState(ctx.intent==='pending'?'Pending':'All');
  useEffect(()=>{if(ctx.intent==='pending'){setFilter('Pending');ctx.clearIntent();}},[ctx.intent]);
  const find=async e=>{
    e.preventDefault();setLoading(true);setError('');setInvoice(null);
    try{
      const found=await ctx.get('invoice',{id:lookup});
      if (found.payments.some(p=>p.method==='Cash')) {
        const [products,units]=await Promise.all(['products','units'].map(route=>ctx.get(route,{branch:found.branch_id})));
        setCatalog({products,units});
      }
      setInvoice(found);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  };
  const request=(item,exchange=false)=>ctx.setDialog({
    title:exchange?'New exchange request':'New return request',description:ref('INV',invoice.id)+' · '+item.name,route:'return.request',submit:'Submit request',
    values:{branch:invoice.branch_id,item_id:item.id,qty:1,method:exchange?'Cash':invoice.payments[0]?.method||'Cash',replacement_qty:1},
    fields:v=>{
      const product=catalog.products.find(p=>p.id===Number(v.replacement_product_id));
      return [
        {name:'qty',label:'Quantity to return',type:'number',min:1,max:item.qty-item.refunded_qty},
        ...(!exchange?[{name:'method',label:'Original payment method',choices:[...new Set(invoice.payments.map(p=>p.method))].concat(invoice.payments.length?[]:['Cash'])}]:[]),
        {name:'condition_note',label:'Item condition',full:true},{name:'reason',label:'Reason for return',type:'textarea'},
        ...(!item.unit_id?[{name:'restock',label:'Item is sellable and can return to stock',type:'checkbox'}]:[]),
        ...(exchange?[
          {name:'replacement_product_id',label:'Replacement product',choices:options(catalog.products.filter(p=>p.qty>0&&p.category!=='Services'))},
          {name:'replacement_qty',label:'Replacement quantity',type:'number',min:1,max:product?.serialized?1:product?.qty},
          ...(product?.serialized?[{name:'replacement_unit_id',label:'Replacement device',choices:options(catalog.units.filter(u=>u.product_id===product.id&&u.state==='Available'),'code')}]:[])
        ]:[])
      ];
    },
    onSuccess:()=>ctx.setNotice(exchange?'Exchange submitted for approval':'Return submitted for approval')
  });
  const resolve=(row,decision)=>ctx.setDialog({
    title:decision==='Completed'?(row.replacement?'Approve & process exchange':'Approve & process return'):'Reject request',
    description:ref('RET',row.id)+' · '+row.product+' · '+(row.replacement
      ? (row.quoted_total>=row.amount?'Cash to collect ':'Cash to refund ')+money(Math.abs(row.quoted_total-row.amount))
      :row.reason),route:'return.resolve',
    submit:decision==='Completed'?(row.replacement?'Process exchange':'Process refund'):'Reject request',danger:decision==='Rejected',
    values:{branch:row.branch_id,id:row.id,decision},
    fields:decision==='Completed'&&row.method!=='Cash'&&row.amount>0?[{name:'reference',label:'Confirmed refund reference',full:true}]:[]
  });
  return <DataView state={state}>{({returns,settings})=><>
    <Heading title="Returns & Exchanges" description="Look up an invoice, record returned items and review refund or exchange requests."/>
    <Stats items={[
      {icon:ArrowLeftRight,label:'Return Requests',value:returns.length,note:'Recent requests'},
      {icon:Clock3,label:'Pending',value:returns.filter(r=>r.status==='Pending').length,note:'Awaiting review',tone:'amber'},
      {icon:CircleCheck,label:'Completed',value:returns.filter(r=>r.status==='Completed').length,note:'Processed refunds',tone:'mint'}
    ]}/>
    <div className="stack">
      <Panel title="Original Invoice" icon={FileText}>
        <form className="panel-tools toolbar" onSubmit={find}><Field label="Search by invoice number"><input value={lookup} placeholder="INV-000042" onChange={e=>setLookup(e.target.value)} required/></Field><Button type="submit" icon={Search} variant="primary" disabled={loading}>{loading?'Searching…':'Find invoice'}</Button></form>
        <div className="inset"><Alert>{error}</Alert></div>
        {invoice&&<><div className="detail"><div><small>Invoice</small><strong>{ref('INV',invoice.id)}</strong></div><div><small>Customer</small><strong>{invoice.customer}</strong></div><div><small>Branch</small><strong>{invoice.branch}</strong></div><div><small>Total</small><strong>{money(invoice.total)}</strong></div><Button onClick={()=>setViewReceipt(true)}>View receipt</Button></div>
          <Table rows={invoice.items} columns={[[ 'Item','name'],['IMEI / serial',r=>r.imei||r.code||'—'],['Sold','qty'],['Returned','refunded_qty'],['Total',r=>money(r.total)],['Action',r=><div className="row-actions">
            <Button variant="soft" disabled={r.qty===r.refunded_qty||!!invoice.credit} onClick={()=>request(r)}>Request return</Button>
            {invoice.payments.some(p=>p.method==='Cash')&&<Button disabled={r.qty===r.refunded_qty||!!invoice.credit} onClick={()=>request(r,true)}>Request exchange</Button>}
          </div>]]}/>
          {!!invoice.credit&&<p className="note-strip">Settle the outstanding credit before requesting a refund.</p>}
        </>}
      </Panel>
      <Panel title="Return History" icon={ArrowLeftRight} action={<FilterTabs choices={['All','Pending','Completed','Rejected']} value={filter} onChange={setFilter}/>}>
        <Table rows={returns.filter(r=>filter==='All'||r.status===filter)} columns={[[ 'Return #',r=>ref('RET',r.id)],['Invoice',r=>ref('INV',r.sale_id)],['Item','product'],['Customer','customer'],['Type',r=>r.replacement?<><Badge tone="blue">Exchange</Badge>{r.replacement_sale_id&&<small className="subtext">{ref('INV',r.replacement_sale_id)}</small>}</>:<Badge tone="violet">Refund</Badge>],['Refund method','method'],['Amount',r=>money(r.amount)],['Status',r=><Badge>{r.status}</Badge>],
          ['Actions',r=>r.status==='Pending'&&canManage(ctx)?<div className="row-actions"><Button variant="soft" onClick={()=>resolve(r,'Completed')}>Approve</Button><Button variant="outline-red" onClick={()=>resolve(r,'Rejected')}>Reject</Button></div>:null]]}/>
      </Panel>
    </div>
    {viewReceipt&&<Receipt invoice={invoice} settings={settings} onClose={()=>setViewReceipt(false)}/>}
  </>}</DataView>;
}

const deviceFields = [{name:'code',label:'Internal unit code'},{name:'imei',label:'IMEI / serial',optional:true},{name:'grade',label:'Condition grade',choices:['New','Used','Refurbished']}];

export function Purchases({ctx}) {
  const state=useData(ctx,{purchases:'purchases',suppliers:'suppliers',products:'products'});
  const [query,setQuery]=useState('');
  const [onlyUnpaid,setOnlyUnpaid]=useState(false);
  const supplier=()=>ctx.setDialog({title:'New supplier',route:'supplier.create',fields:[{name:'name',label:'Supplier name'},{name:'phone',label:'Phone',type:'tel',optional:true}]});
  const receive=(suppliers,products)=>ctx.setDialog({
    title:'Receive stock',description:'Record the supplier invoice and add accepted stock to the branch.',route:'purchase.receive',wide:true,submit:'Receive stock',
    values:{branch:branchOf(ctx),qty:1,grade:'New'},
    fields:v=>{
      const serialized=products.find(p=>p.id===Number(v.product_id))?.serialized;
      return [{name:'branch',label:'Receiving branch',choices:options(ctx.branches)},{name:'supplier_id',label:'Supplier',choices:options(suppliers)},
        {name:'invoice',label:'Supplier invoice number'},{name:'product_id',label:'Product',choices:options(products.filter(p=>p.category!=='Services'))},
        {name:'qty',label:'Quantity',type:'number',min:1,max:serialized?1:10000},{name:'unit_cost',label:'Unit cost (LKR)',type:'money'},
        ...(serialized?deviceFields:[])];
    },transform:v=>({...v,unit_cost:cents(v.unit_cost)})
  });
  const pay=r=>ctx.setDialog({title:'Pay supplier from drawer',description:r.supplier+' · '+money(r.balance)+' remaining',route:'purchase.pay',submit:'Record payment',values:{branch:r.branch_id,id:r.id},fields:[amountField],transform:v=>({...v,amount:cents(v.amount)})});
  return <DataView state={state}>{({purchases,suppliers,products})=><>
    <Heading title="Purchasing & Suppliers" description="Receive stock, track supplier invoices and settle outstanding balances.">
      <Button icon={Plus} onClick={supplier}>New supplier</Button><Button variant="primary" icon={Package} onClick={()=>receive(suppliers,products)}>Receive stock</Button>
    </Heading>
    <Stats items={[
      {icon:ShoppingBag,label:'Purchases Received',value:purchases.length,note:'Recent supplier invoices'},
      {icon:Wallet,label:'Outstanding Payables',value:money(purchases.reduce((s,r)=>s+Number(r.balance),0)),note:'Remaining supplier balances',tone:'amber'},
      {icon:Truck,label:'Suppliers',value:suppliers.length,note:'Supplier directory',tone:'mint'}
    ]}/>
    <div className="stack">
      <Panel title="Purchase History" icon={ShoppingBag}>
        <div className="panel-tools toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search supplier, item or invoice…"/><Button variant={onlyUnpaid?'primary':''} onClick={()=>setOnlyUnpaid(!onlyUnpaid)}>Unpaid only</Button></div>
        <Table rows={purchases.filter(r=>(!onlyUnpaid||r.balance>0)&&[r.supplier,r.invoice,r.product].some(v=>v.toLowerCase().includes(query.toLowerCase())))} columns={[
          ['Reference',r=>ref('PO',r.id)],['Supplier invoice','invoice'],['Supplier','supplier'],['Product','product'],['Qty','qty'],['Total',r=>money(r.qty*r.unit_cost)],['Balance',r=><Badge tone={r.balance?'amber':'green'}>{money(r.balance)}</Badge>],['Actions',r=>canManage(ctx)&&!!r.balance?<Button variant="soft" onClick={()=>pay(r)}>Pay supplier</Button>:null]
        ]}/>
      </Panel>
      <Panel title="Suppliers" icon={Truck}><Table rows={suppliers} columns={[[ 'Supplier','name'],['Phone','phone']]}/></Panel>
    </div>
  </>}</DataView>;
}

export function Transfers({ctx}) {
  const source=branchOf(ctx);
  const state=useData(ctx,{items:['products',{branch:source}],units:['units',{branch:source}],transfers:'transfers'});
  const [filter,setFilter]=useState('All');
  const request=(items,units)=>ctx.setDialog({
    title:'Request stock transfer',description:'From '+ctx.branches.find(b=>b.id===source)?.name,route:'transfer.request',submit:'Request transfer',
    values:{branch:source,qty:1},fields:v=>{
      const serialized=items.find(p=>p.id===Number(v.product_id))?.serialized;
      return [{name:'to_branch',label:'Destination branch',choices:options(ctx.destinations.filter(b=>b.id!==source))},
        {name:'product_id',label:'Product',choices:options(items.filter(p=>p.qty>0&&p.category!=='Services'))},
        {name:'qty',label:'Quantity',type:'number',min:1,max:serialized?1:undefined},
        ...(serialized?[{name:'unit_id',label:'Available device',choices:options(units.filter(u=>u.product_id===Number(v.product_id)&&u.state==='Available'),'code')}]:[])];
    }
  });
  const update=(r,status,branch)=>ctx.setDialog({title:status==='Dispatched'?'Approve & dispatch':status==='Received'?'Confirm receipt':'Reject transfer',
    description:ref('ST',r.id)+' · '+r.qty+' × '+r.product+' · '+r.source+' → '+r.destination,route:'transfer.update',submit:status==='Received'?'Receive stock':status==='Dispatched'?'Dispatch stock':'Reject transfer',
    danger:status==='Rejected',values:{id:r.id,status,branch},fields:[]});
  return <DataView state={state}>{({items,units,transfers})=><>
    <Heading title="Stock Transfers" description="Move inventory between branches and confirm receipt at the destination."><Button icon={Plus} variant="primary" onClick={()=>request(items,units)}>Request transfer</Button></Heading>
    <Panel title="Transfer History" icon={ArrowLeftRight} action={<FilterTabs choices={['All','Requested','Dispatched','Received','Rejected']} value={filter} onChange={setFilter}/>}>
      <Table rows={transfers.filter(r=>filter==='All'||r.status===filter)} columns={[
        ['Reference',r=>ref('ST',r.id)],['Source','source'],['Destination','destination'],['Product','product'],['Qty','qty'],['Status',r=><Badge>{r.status}</Badge>],
        ['Actions',r=>r.status==='Requested'&&canManage(ctx)&&(ctx.user.role==='owner'||ctx.branch===r.from_branch)?<div className="row-actions"><Button variant="soft" onClick={()=>update(r,'Dispatched',r.from_branch)}>Dispatch</Button><Button variant="outline-red" onClick={()=>update(r,'Rejected',r.from_branch)}>Reject</Button></div>:
          r.status==='Dispatched'&&(ctx.user.role==='owner'||ctx.branch===r.to_branch)?<Button variant="soft" onClick={()=>update(r,'Received',r.to_branch)}>Receive</Button>:null]
      ]}/>
    </Panel>
  </>}</DataView>;
}
