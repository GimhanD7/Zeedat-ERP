import { AlertTriangle, ArrowRight, ArrowUpRight, Banknote, BellRing, CalendarDays, ChartNoAxesCombined, ChevronRight, ClipboardCheck, Clock3, CreditCard, FileText, List, Package, Store, UserRound, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DataView, useData } from './data';
import { Badge, Button, Empty, FilterTabs, Heading, Panel, Stats, Table, dateLabel, money, number, ref, rupees, timeLabel, today } from './ui';

const ranges = [[7,'7 Days'],[30,'30 Days'],[90,'3 Months'],[365,'Year']];
const formatScale = v => v >= 100000 ? 'LKR ' + Math.round(v/1000).toLocaleString() + 'k' : 'LKR ' + Math.round(v).toLocaleString();
function Trend({ trend }) {
  const [hover,setHover] = useState(null);
  const [width,setWidth] = useState(850);
  const chart=useRef(null);
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setWidth(Math.max(280,Math.round(entry.contentRect.width))));
    observer.observe(chart.current);
    return ()=>observer.disconnect();
  },[]);
  const compact=width<500;
  const height=compact?174:216,pad=compact?68:92,top=16,right=16,bottom=32;
  const plotHeight=height-top-bottom;
  const values=trend.map(p=>rupees(p.total));
  const maxValue=Math.max(100,...values);
  const step=Math.pow(10,Math.floor(Math.log10(maxValue/5)));
  const max=Math.ceil(maxValue/step)*step;
  const x=i=>pad+(width-pad-right)*(i/Math.max(1,trend.length-1));
  const y=v=>top+plotHeight*(1-v/max);
  const points=values.map((v,i)=>[x(i),y(v)]);
  const polyline=points.map(p=>p.join(',')).join(' ');
  const sample=Math.ceil(trend.length/(compact?5:7));
  const mark=hover ?? values.length-1;
  const tooltipX=100*x(mark)/width;
  return <div className={'trend '+(compact?'compact':'')} ref={chart} onMouseLeave={()=>setHover(null)}>
    <svg viewBox={'0 0 '+width+' '+height} role="img" aria-label="Daily gross sales in Sri Lankan rupees">
      <defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#2bbdb7" stopOpacity=".47"/><stop offset="1" stopColor="#2bbdb7" stopOpacity=".05"/></linearGradient></defs>
      {[0,1,2,3,4,5].map(i=>{
        const tick=max*i/5;
        return <g key={i}><line x1={pad} x2={width-right} y1={y(tick)} y2={y(tick)} stroke="#e3ebf0"/><text x={pad-10} y={y(tick)+4} textAnchor="end">{formatScale(tick)}</text></g>;
      })}
      {trend.length>0&&<><polygon points={pad+','+y(0)+' '+polyline+' '+x(values.length-1)+','+y(0)} fill="url(#trend-fill)"/>
        <polyline points={polyline} stroke="#029790" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
        {trend.map((p,i)=>(i%sample===0||i===trend.length-1)&&<g key={p.day}><circle cx={x(i)} cy={y(values[i])} r={i===mark?5.2:3.4} fill={i===mark?'#029790':'#fff'} stroke="#029790" strokeWidth="2"/>
          <text x={x(i)} y={height-13} textAnchor={i===values.length-1?'end':i===0?'start':'middle'}>{dateLabel(p.day,{day:'2-digit',month:'short'})}</text></g>)}
        {trend.map((p,i)=><rect key={p.day} x={x(i)-Math.min(25,310/trend.length)} y="0" width={Math.min(50,620/trend.length)} height={height-bottom} fill="transparent" onMouseEnter={()=>setHover(i)}/>)}
      </>}
    </svg>
    {trend[mark] && <div className="trend-tooltip" style={{left:tooltipX+'%',transform:tooltipX>55?'translateX(-100%)':undefined,top:Math.max(1,100*y(values[mark])/height-20)+'%'}}>
      <span>{dateLabel(trend[mark].day)}</span><strong>{money(trend[mark].total)}</strong>
    </div>}
  </div>;
}
export const saleColumns = [
  ['Invoice #',r=><strong className="mono">{ref('INV',r.id)}</strong>],
  ['Date & time',r=>timeLabel(r.created_at)],['Branch','branch'],['Type',()=> <Badge tone="green">Sale</Badge>],
  ['Customer','customer'],['Items','items'],['Amount',r=><strong>{money(r.total)}</strong>]
];
function LinkButton({ children, onClick }) { return <Button variant="link" onClick={onClick} icon={undefined}>{children}<ArrowRight size={15}/></Button>; }

export function Dashboard({ ctx }) {
  const [days,setDays] = useState(7);
  const state = useData(ctx,{dashboard:['dashboard',{days}]});
  useEffect(()=>{
    if(ctx.intent==='alerts' && state.data){document.getElementById('dashboard-alerts')?.scrollIntoView({behavior:'smooth',block:'nearest'});ctx.clearIntent();}
  },[ctx.intent,state.data]);
  return <DataView state={state}>{({dashboard:d})=>{
    const alerts = [
      [AlertTriangle,'Low Stock Items','Items at or below reorder level',d.low.length,'red','inventory','low'],
      [Clock3,'Pending Approvals','Return requests awaiting review',d.pending.length,'blue','returns','pending'],
      [Wrench,'Overdue Repairs','Open jobs past their promised date',d.repairs.overdue,'blue','repairs','overdue'],
      [UserRound,'Unpaid Balances','Customers with an outstanding balance',d.credit_accounts,'blue','customers','credit'],
    ];
    return <>
      <Heading title={ctx.branch?'Branch Dashboard':'Owner Dashboard'} description={'Business overview '+(ctx.branch?'for your branch':'across all branches')+' — sales, repairs, inventory and operations.'}>
        <span className="date-chip"><CalendarDays size={17}/> Today, {dateLabel(d.today)}</span>
      </Heading>
      <Stats items={[
        {icon:ChartNoAxesCombined,label:'Total Sales Today',value:money(d.sales),note:<><ArrowUpRight size={14}/> {number(d.bills)} posted invoices</>},
        {icon:Banknote,label:'Collections',value:money(d.collected),note:'Payments received today',tone:'mint'},
        {icon:CreditCard,label:'Outstanding Credit',value:money(d.credit),note:number(d.credit_accounts)+' customer accounts',tone:'violet'},
        {icon:Wrench,label:'Open Repairs',value:number(d.repairs.open_count),note:number(d.repairs.overdue)+' overdue',tone:'teal'},
        {icon:AlertTriangle,label:'Low Stock Alerts',value:number(d.low.length),note:'At or below reorder level',tone:'red'},
      ]}/>
      <div className="dashboard-grid">
        <div className="stack">
          <Panel title="Branch Performance" icon={Store} action={<LinkButton onClick={()=>ctx.navigate('reports')}>View branch report</LinkButton>}>
            <div className="branch-grid">{d.branches.map((b,i)=><div className={'branch-card '+(i===0?'featured':'')} key={b.id}><strong><Store size={17}/>{b.name}</strong><b>{money(b.sales)}</b><span>{number(b.bills)} sales <i/> {number(b.repairs)} repairs</span></div>)}</div>
          </Panel>
          <Panel title={'Sales Trend '+(!ctx.branch?'– All Branches':'')} icon={ChartNoAxesCombined} action={<FilterTabs choices={ranges} value={days} onChange={setDays}/>}>
            <Trend trend={d.trend}/>
          </Panel>
          <Panel title="Recent Transactions" icon={List} action={<LinkButton onClick={()=>ctx.navigate('sales')}>View all transactions</LinkButton>}>
            <Table columns={saleColumns} rows={d.recent}/>
          </Panel>
        </div>
        <div className="stack" id="dashboard-alerts">
          <Panel title="Alerts & Notices" icon={BellRing}>
            <div className="alert-list">{alerts.map(([Icon,label,note,count,tone,page,intent])=>
              <button key={label} className="alert-row" onClick={()=>ctx.navigate(page,intent)}><span className={'stat-icon '+tone}><Icon size={19}/></span><span><strong>{label}</strong><small>{note}</small></span><Badge tone={count?tone:'green'}>{number(count)}</Badge><ChevronRight size={15}/></button>
            )}</div>
          </Panel>
          <Panel title={'Approvals ('+d.pending.length+' Pending)'} icon={ClipboardCheck} action={<LinkButton onClick={()=>ctx.navigate('returns','pending')}>View all</LinkButton>}>
            {d.pending.length?<div className="alert-list">{d.pending.map(r=><button className="alert-row approval" key={r.id} onClick={()=>ctx.navigate('returns','pending')}><span className="stat-icon teal"><FileText size={18}/></span><span><strong>Return request · {ref('RET',r.id)}</strong><small>{r.branch} · {money(r.amount)}</small></span><Badge tone="amber">Review</Badge></button>)}</div>:<Empty>No requests awaiting review.</Empty>}
          </Panel>
          <Panel title="Quick Actions" icon={Package}>
            <div className="quick-actions"><Button variant="primary" onClick={()=>ctx.navigate('pos')}>New sale <ArrowRight size={15}/></Button><Button onClick={()=>ctx.navigate('repairs','new')}>New repair <ArrowRight size={15}/></Button></div>
          </Panel>
        </div>
      </div>
    </>;
  }}</DataView>;
}
export function Reports({ctx}) {
  const [days,setDays] = useState(7);
  const state = useData(ctx,{dashboard:['dashboard',{days}]});
  return <DataView state={state}>{({dashboard:d})=><>
    <Heading title="Reports" description="Review sales, payments and inventory across your selected branches."><FilterTabs choices={ranges} value={days} onChange={setDays}/></Heading>
    <Stats items={[
      {icon:ChartNoAxesCombined,label:'Gross Sales',value:money(d.trend.reduce((sum,r)=>sum+r.total,0)),note:'Last '+days+' days'},
      {icon:CreditCard,label:'Payments Collected',value:money(d.collections.reduce((sum,r)=>sum+Number(r.total),0)),note:'Last '+days+' days',tone:'violet'},
      {icon:Wrench,label:'Open Repairs',value:d.repairs.open_count,note:d.repairs.overdue+' overdue',tone:'blue'},
      {icon:AlertTriangle,label:'Reorder Alerts',value:d.low.length,note:'Current branch stock',tone:'red'}
    ]}/>
    <div className="dashboard-grid"><div className="stack"><Panel title="Daily Gross Sales" icon={ChartNoAxesCombined}><Trend trend={d.trend}/></Panel>
    <Panel title="Low Stock Report" icon={Package}><Table rows={d.low} columns={[[ 'Product','name'],['SKU','sku'],['Branch','branch'],['On hand','qty'],['Reorder level','reorder_level']]}/></Panel></div>
    <div className="stack"><Panel title="Payments by Method" icon={CreditCard}><Table rows={d.collections} columns={[[ 'Method','method'],['Amount',r=>money(r.total)]]}/></Panel>
    <Panel title="Branch Performance Today" icon={Store}><Table rows={d.branches} columns={[[ 'Branch','name'],['Gross sales',r=>money(r.sales)],['Bills','bills']]}/></Panel></div></div>
  </>}</DataView>;
}
