import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowRight, Banknote, Barcode, CalendarDays, CreditCard, FileText, History, Minus, Plus, Printer, ReceiptText, ShoppingCart, Trash2, Wallet } from 'lucide-react';
import { DataView, useData } from './data';
import { saleColumns } from './dashboard';
import { Alert, Badge, Button, Empty, Field, FilterTabs, Heading, Modal, Panel, ProductArt, SearchBox, Select, Table, categories, cents, dateLabel, managers, money, options, ref, rupees, tenders, today } from './ui';

const keys = ['Cash','Card','Bank Transfer','Koko'];
const lineKey = (product,unit) => product + ':' + (unit || '');
const amountDue = (subtotal,discount,tax)=>subtotal-discount+tax;

export function Receipt({ invoice, settings, onClose }) {
  return <Modal title={ref('INV',invoice.id)} description="Sales receipt" onClose={onClose}>
    <div className="modal-body">
      <div className="receipt-print" style={{'--paper':settings.paper_width+'mm'}}>
        <h2>{settings.shop_name}</h2><p>{invoice.branch}</p><p>{ref('INV',invoice.id)} · {dateLabel(invoice.created_at)}</p><p>{invoice.customer}</p>
        <Table rows={invoice.items} columns={[[ 'Item',r=><>{r.name}{r.code&&<small className="subtext">{r.code}{r.imei?' · '+r.imei:''}</small>}</>],['Qty','qty'],['Price',r=>money(r.price)],['Total',r=>money(r.total)]]}/>
        <div className="totals">
          <div><span>Subtotal</span><strong>{money(invoice.subtotal)}</strong></div>
          <div><span>Discount</span><strong>− {money(invoice.discount)}</strong></div>
          <div><span>Tax</span><strong>{money(invoice.tax)}</strong></div>
          <div className="total"><span>Total</span><strong>{money(invoice.total)}</strong></div>
          {invoice.payments.map((p,i)=><div key={i}><span>{p.method}{p.kind==='Credit'?' repayment':''}</span><strong>{money(p.amount)}</strong></div>)}
          {!!invoice.credit&&<div><span>Balance due · {dateLabel(invoice.due_date)}</span><strong>{money(invoice.credit)}</strong></div>}
          {!!invoice.change&&<div><span>Change</span><strong>{money(invoice.change)}</strong></div>}
          {!!invoice.refunded&&<div><span>Refunded</span><strong>{money(invoice.refunded)}</strong></div>}
        </div>
      </div>
    </div><div className="modal-footer"><Button onClick={onClose}>Close</Button><Button icon={Printer} variant="primary" onClick={()=>window.print()}>Print receipt</Button></div>
  </Modal>;
}

function Checkout({ ctx, onClose, onComplete, lines, subtotal, discount, tax, total, customer, discountBps, draftId }) {
  const [method,setMethod] = useState('Cash');
  const [tender,setTender] = useState({Cash:String(rupees(total))});
  const [refs,setRefs] = useState({});
  const [credit,setCredit] = useState(false);
  const [due,setDue] = useState(today());
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const split = method==='Split';
  const activeMethods = method==='Credit'?[]:split?keys:[method];
  const paid = activeMethods.reduce((sum,key)=>sum+cents(tender[key]),0);
  const balance = Math.max(total-paid,0);
  const change = Math.max(paid-total,0);
  const canCredit = managers.includes(ctx.user.role) && customer;
  const selectMethod = value => {
    setMethod(value);
    setTender(value==='Split'||value==='Credit'?{}:{[value]:String(rupees(total))});
    setCredit(value==='Credit');setError('');
  };
  const complete = async e=>{
    e.preventDefault();
    setBusy(true);setError('');
    try {
      const invoice=await ctx.mutate('sale.checkout',{
        items:lines.map(({product_id,unit_id,qty})=>({product_id,unit_id,qty})),
        discount_bps:discountBps,customer_id:customer,draft_id:draftId,expected_total:total,
        payments:activeMethods.filter(key=>cents(tender[key])>0).map(key=>({method:key,amount:cents(tender[key]),reference:refs[key]||''})),
        allow_credit:credit,due_date:due,
      });
      onComplete(invoice);
    } catch(e){setError(e.message);} finally {setBusy(false);}
  };
  return <Modal title="Checkout / Payment" description="Review the bill, record the tender and complete the sale." onClose={onClose} wide busy={busy}>
    <form onSubmit={complete}>
      <div className="modal-body"><Alert>{error}</Alert>
        <div className="checkout-grid">
          <Panel title="Current Bill" icon={ReceiptText}>
            <div className="checkout-items">{lines.map(line=><div key={line.id}><ProductArt item={line.product} small/><span><strong>{line.product.name}</strong><small>{line.qty} × {money(line.product.price)}</small></span><b>{money(line.qty*line.product.price)}</b></div>)}</div>
            <div className="totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Discount</span><strong>− {money(discount)}</strong></div><div><span>Tax</span><strong>{money(tax)}</strong></div><div className="total"><span>Total payable</span><strong>{money(total)}</strong></div></div>
          </Panel>
          <Panel title="Payment Method" icon={CreditCard}>
            <div className="payment-body">
              <FilterTabs choices={[...tenders,'Split',...(canCredit?['Credit']:[])]} value={method} onChange={selectMethod}/>
              <div className="form-grid">
                {activeMethods.map(key=><div className="tender-fields" key={key}>
                  <Field label={key+' amount (LKR)'}><input type="number" min="0" step=".01" value={tender[key]??''} onChange={e=>setTender({...tender,[key]:e.target.value})} placeholder="0.00" required={!split}/></Field>
                  {key!=='Cash'&&cents(tender[key])>0&&<Field label={key==='Koko'?'Verified Koko merchant reference':'Confirmed transaction reference'}><input value={refs[key]??''} onChange={e=>setRefs({...refs,[key]:e.target.value})} maxLength={100} required/></Field>}
                </div>)}
              </div>
              {canCredit&&balance>0&&method!=='Credit'&&<label className="inline-field"><input type="checkbox" checked={credit} onChange={e=>setCredit(e.target.checked)}/> Record remainder as shop credit</label>}
              {credit&&balance>0&&<Field label="Credit due date"><input type="date" min={today()} value={due} onChange={e=>setDue(e.target.value)} required/></Field>}
              <div className="totals payment-totals"><div><span>{credit?'Credit balance':'Balance due'}</span><strong>{money(balance)}</strong></div><div className="total"><span>Change</span><strong>{money(change)}</strong></div></div>
            </div>
          </Panel>
        </div>
      </div>
      <div className="modal-footer"><Button onClick={onClose} disabled={busy}>Back to bill</Button><Button type="submit" icon={ArrowRight} variant="primary" disabled={busy||(balance>0&&!credit)}>{busy?'Posting sale…':'Complete sale'}</Button></div>
    </form>
  </Modal>;
}

export function Pos({ctx}) {
  const state = useData(ctx,{products:'products',units:'units',customers:'customers',register:'drawer',drafts:'drafts',settings:'settings'});
  return <DataView state={state}>{data=><Billing ctx={ctx} data={data}/>}</DataView>;
}
function Billing({ctx,data}) {
  const {products,units,customers,register,drafts,settings}=data;
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('All Products');
  const [cart,setCart]=useState([]);
  const [customer,setCustomer]=useState('');
  const [discountPct,setDiscountPct]=useState('0');
  const [draftId,setDraftId]=useState(null);
  const [device,setDevice]=useState(null);
  const [chosenUnit,setChosenUnit]=useState('');
  const [checkout,setCheckout]=useState(false);
  const [receipt,setReceipt]=useState(null);
  const [held,setHeld]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const input=useRef(null);
  const branch=ctx.branches.find(b=>b.id===ctx.branch);
  const lines=cart.flatMap(line=>{
    const product=products.find(p=>p.id===line.product_id);
    return product?[{...line,product,id:lineKey(line.product_id,line.unit_id)}]:[];
  });
  const subtotal=lines.reduce((sum,r)=>sum+r.qty*r.product.price,0);
  const discountBps=Math.min(ctx.user.role==='cashier'?500:10000,Math.max(0,cents(discountPct)));
  const discount=Math.floor((subtotal*discountBps+5000)/10000);
  const tax=Math.floor(((subtotal-discount)*settings.tax_bps+5000)/10000);
  const total=amountDue(subtotal,discount,tax);
  const reserved = new Set(cart.map(r=>r.unit_id));
  const clear = ()=>{setCart([]);setCustomer('');setDiscountPct('0');setDraftId(null);setError('');};
  const add = (product,unit)=>{
    setError('');
    const id=product.id;
    if (product.serialized && !unit) {setChosenUnit('');setDevice(product);return;}
    const existing=cart.find(r=>r.product_id===id && r.unit_id===(unit?.id||null));
    if (existing && (unit|| (product.category!=='Services' && existing.qty>=product.qty))) {setError('No more available stock for this item.');return;}
    if (existing) setCart(cart.map(r=>r===existing?{...r,qty:r.qty+1}:r));
    else setCart([...cart,{product_id:id,unit_id:unit?.id||null,qty:1}]);
  };
  const increment = (line,delta)=>{
    if(delta>0){add(line.product);return;}
    setCart(cart.map(r=>lineKey(r.product_id,r.unit_id)===line.id?{...r,qty:r.qty-1}:r).filter(r=>r.qty>0));
  };
  const handleScan=e=>{
    if(e.key!=='Enter')return;
    const value=query.trim().toLowerCase();
    if(!value)return;
    const unit=units.find(u=>u.state==='Available'&&[u.code,u.imei].some(s=>s?.toLowerCase()===value));
    const product=products.find(p=>unit?p.id===unit.product_id:[p.sku,p.barcode].some(s=>s?.toLowerCase()===value));
    if(product&&(product.qty||product.category==='Services')){e.preventDefault();add(product,unit);setQuery('');}
  };
  useEffect(()=>{
    const handle=e=>{
      if(device||held||checkout||receipt||document.querySelector('.modal'))return;
      if(e.key==='F2'){e.preventDefault();input.current?.focus();}
      if(e.key==='F7'&&lines.length&&register.drawer?.business_date===today()){e.preventDefault();setCheckout(true);}
    };
    window.addEventListener('keydown',handle);
    return ()=>window.removeEventListener('keydown',handle);
  },[device,held,checkout,receipt,lines.length,register.drawer]);
  const hold=async()=>{
    setBusy(true);setError('');
    try{await ctx.mutate('draft.save',{id:draftId,payload:{cart,customer,discountPct}});clear();ctx.setNotice('Bill held');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const current=register.drawer?.business_date===today();
  const q=query.trim().toLowerCase();
  const matched=new Set(units.filter(u=>[u.imei,u.code].some(v=>v?.toLowerCase().includes(q))).map(u=>u.product_id));
  const filtered=products.filter(p=>(category==='All Products'||p.category===category)&&
    (!q||[p.name,p.sku,p.barcode,p.brand].some(s=>s?.toLowerCase().includes(q))||matched.has(p.id)));
  return <>
    <Heading title="POS / Billing" description={'Create bills, sell products and record payments — '+branch?.name}>
      <Button icon={Wallet} onClick={()=>ctx.navigate('drawer')}>Cash register <Badge tone={current?'green':'red'}>{current?'Open':'Closed'}</Badge></Button>
      <span className="date-chip"><CalendarDays size={16}/>{dateLabel(today())}</span>
    </Heading>
    <Alert>{error}</Alert>
    <div className="pos-grid">
      <Panel title="Product Catalog" icon={Barcode}>
        <div className="panel-tools"><SearchBox value={query} onChange={setQuery} onKeyDown={handleScan} inputRef={input} placeholder="Search by product, SKU, barcode or IMEI…"/><FilterTabs choices={['All Products',...categories]} value={category} onChange={setCategory}/></div>
        <div className="catalog">{filtered.map(item=><article key={item.id} className="product-card">
          <div className="product-image"><ProductArt item={item}/><Badge tone={item.category==='Services'?'blue':item.qty?'green':'red'}>{item.category==='Services'?'Service':item.qty+' in stock'}</Badge></div>
          <div className="product-info"><small>{item.sku}</small><strong>{item.name}</strong><b>{money(item.price)}</b></div>
          <Button icon={Plus} variant="soft" disabled={!item.qty&&item.category!=='Services'} onClick={()=>add(item)}>Add item</Button>
        </article>)}</div>
        {!filtered.length&&<Empty>No products match your search.</Empty>}
      </Panel>
      <div className="stack">
        <Panel title="Current Bill" icon={ShoppingCart} action={<Badge tone="blue">{draftId?ref('HLD',draftId):'New sale'}</Badge>}>
          <div className="panel-tools"><Field label="Customer"><Select options={options(customers)} value={customer} onChange={e=>setCustomer(e.target.value)} blank="Walk-in customer"/></Field></div>
          <Table rows={lines} empty="Add a product to start a bill." columns={[
            ['Item',r=><><strong>{r.product.name}</strong><small className="subtext">{units.find(u=>u.id===r.unit_id)?.code||r.product.sku}</small></>],
            ['Qty',r=><span className="stepper"><Button icon={Minus} className="icon-only" aria-label={'Decrease '+r.product.name} onClick={()=>increment(r,-1)}/><b>{r.qty}</b><Button icon={Plus} className="icon-only" aria-label={'Increase '+r.product.name} disabled={!!r.unit_id} onClick={()=>increment(r,1)}/></span>],
            ['Amount',r=><strong>{money(r.product.price*r.qty)}</strong>],
            ['Action',r=><Button icon={Trash2} className="icon-only text-red" aria-label={'Remove '+r.product.name} onClick={()=>setCart(cart.filter(x=>lineKey(x.product_id,x.unit_id)!==r.id))}/>],
          ]}/>
          <div className="bill-actions"><Button icon={Trash2} variant="outline-red" disabled={!cart.length||busy} onClick={clear}>Clear cart</Button><Button icon={Archive} disabled={!cart.length||busy} onClick={hold}>Hold bill</Button><Button icon={History} onClick={()=>setHeld(true)}>Held ({drafts.length})</Button></div>
          <div className="totals bill-totals">
            <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <div><label className="inline-field">Discount (%) <input aria-label="Discount percentage" type="number" min="0" max={ctx.user.role==='cashier'?5:100} step=".01" value={discountPct} onChange={e=>setDiscountPct(e.target.value)}/></label><strong>− {money(discount)}</strong></div>
            <div><span>Tax ({settings.tax_bps/100}%)</span><strong>{money(tax)}</strong></div>
            <div className="total"><span>Total payable</span><strong>{money(total)}</strong></div>
            {!current&&<Alert>Open today’s cash register before checkout.</Alert>}
            <Button className="checkout-button" icon={Banknote} variant="primary" disabled={!lines.length||!current||busy} onClick={()=>setCheckout(true)}>Review & checkout <ArrowRight size={17}/></Button>
          </div>
        </Panel>
      </div>
    </div>
    {device&&<Modal title="Select a device unit" description={device.name} onClose={()=>setDevice(null)}><div className="modal-body">
      <Field label="Available serial / IMEI"><Select value={chosenUnit} onChange={e=>setChosenUnit(e.target.value)} blank="Select a device" options={units.filter(u=>u.product_id===device.id&&u.state==='Available'&&!reserved.has(u.id)).map(u=>[u.id,u.code+' · '+u.grade+(u.imei?' · '+u.imei:'')])}/></Field>
    </div><div className="modal-footer"><Button onClick={()=>setDevice(null)}>Cancel</Button><Button variant="primary" disabled={!chosenUnit} icon={Plus} onClick={()=>{add(device,units.find(u=>u.id===Number(chosenUnit)));setDevice(null);}}>Add device</Button></div></Modal>}
    {held&&<Modal title="Held Bills" onClose={()=>setHeld(false)} busy={busy}><div className="modal-body"><Alert>{error}</Alert>
      <Table rows={drafts} columns={[[ 'Bill',r=>ref('HLD',r.id)],['Date',r=>dateLabel(r.created_at)],['Actions',r=><div className="row-actions">
        <Button disabled={busy||cart.length>0} variant="soft" onClick={()=>{const p=JSON.parse(r.payload);setCart(p.cart);setCustomer(p.customer);setDiscountPct(p.discountPct);setDraftId(r.id);setHeld(false);}}>Resume</Button>
        <Button icon={Trash2} className="icon-only text-red" aria-label="Remove held bill" disabled={busy} onClick={async()=>{setBusy(true);try{await ctx.mutate('draft.remove',{id:r.id});}catch(e){setError(e.message);}finally{setBusy(false);}}}/>
      </div>]]}/>{cart.length>0&&<p className="muted">Hold or clear the current cart to resume another bill.</p>}
    </div></Modal>}
    {checkout&&<Checkout ctx={ctx} onClose={()=>setCheckout(false)} onComplete={invoice=>{setCheckout(false);clear();setReceipt(invoice);ctx.setNotice('Sale posted');}} {...{lines,subtotal,discount,tax,total,customer,discountBps,draftId}}/>}
    {receipt&&<Receipt invoice={receipt} settings={settings} onClose={()=>setReceipt(null)}/>}
  </>;
}
export function SalesHistory({ctx}) {
  const state=useData(ctx,{sales:'sales',settings:'settings'});
  const [query,setQuery]=useState('');
  const [receipt,setReceipt]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  return <DataView state={state}>{({sales,settings})=><>
    <Heading title="Sales History" description="Find posted invoices and reprint receipts."/>
    <Alert>{error}</Alert>
    <Panel title="Posted Invoices" icon={FileText} action={<SearchBox value={query} onChange={setQuery} placeholder="Search invoice, customer or item…"/>}>
      <Table rows={sales.filter(r=>[ref('INV',r.id),r.items,r.customer,r.branch].some(v=>v?.toLowerCase().includes(query.toLowerCase())))} columns={[
        ...saleColumns,['Receipt',r=><Button icon={ReceiptText} disabled={loading} onClick={async()=>{setError('');setLoading(true);try{setReceipt(await ctx.get('invoice',{id:r.id}));}catch(e){setError(e.message);}finally{setLoading(false);}}}>View</Button>]
      ]}/>
    </Panel>
    {receipt&&<Receipt invoice={receipt} settings={settings} onClose={()=>setReceipt(null)}/>}
  </>}</DataView>;
}
