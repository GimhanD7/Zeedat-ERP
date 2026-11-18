import { useEffect, useState } from 'react';
import { Target, TrendingUp } from 'lucide-react';
import { useData } from '../../hooks/useData';
import { DataView } from '../../components/feedback';
import { Panel } from '../../components/common';
import { dateLabel, money, today } from '../../utils';
import './dailyTarget.css';

export function DailyTarget({ ctx, date }) {
  const state = useData(ctx, { target: ['daily.target', { date }] });
  useEffect(() => {
    const timer = setInterval(state.refresh, 60000);
    return () => clearInterval(timer);
  }, [state.refresh]);
  return <DataView state={state}>{({ target }) => (
    <Panel title="Daily revenue target" icon={Target}>
      <p className="daily-target-caption">Compared with {dateLabel(target.baseline_date)} · Net invoice revenue after completed returns</p>
      <div className="daily-target-grid">
        {target.branches.map(branch => (
          <article className="daily-target-card" key={branch.id}>
            <header><strong>{branch.name}</strong><TrendingUp size={18} /></header>
            <div className="daily-target-values">
              <div><small>{date === today() ? "Today's revenue" : 'Selected-day revenue'}</small><b>{money(branch.actual)}</b></div>
              <div><small>Last-year daily target</small><b>{branch.target == null ? 'Unavailable' : money(branch.target)}</b></div>
            </div>
            {branch.target > 0 && <div className="daily-target-track" role="progressbar" aria-label={branch.name + ' daily target'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, branch.progress)}>
              <span style={{ width: Math.min(100, branch.progress) + '%' }} />
            </div>}
            <footer>{branch.target == null
              ? <span>Add this branch's previous-year backup to calculate its target.</span>
              : branch.target === 0
                ? <span>Previous-year net revenue was zero or negative. No positive target for this date.</span>
                : <><span>{branch.progress}% achieved</span><strong>{branch.remaining > 0 ? money(branch.remaining) + ' remaining' : 'Target achieved'}</strong></>}
            </footer>
            {branch.source && <small className="daily-target-source">{branch.source} · {branch.baseline == null ? '' : money(branch.baseline)}</small>}
          </article>
        ))}
      </div>
    </Panel>
  )}</DataView>;
}

export function StaffDashboardPage({ ctx }) {
  const [date, setDate] = useState(today);
  useEffect(() => {
    const timer = setInterval(() => setDate(today()), 60000);
    return () => clearInterval(timer);
  }, []);
  return <div className="staff-target-dashboard"><header><h1>Today's dashboard</h1><p>{dateLabel(date)}</p></header><DailyTarget ctx={ctx} date={date} /></div>;
}
