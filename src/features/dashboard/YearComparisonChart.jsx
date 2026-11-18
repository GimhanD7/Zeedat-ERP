import { useState } from 'react';
import { money } from '../../utils';

export function YearComparisonChart({ branch, month, previousMonth, date }) {
  const [mode, setMode] = useState('cumulative');
  const [hover, setHover] = useState(null);
  let currentSum = 0;
  let previousSum = 0;
  const points = branch.points.map(point => {
    currentSum += point.current ?? 0;
    previousSum += point.previous ?? 0;
    return {
      ...point,
      current: point.current == null ? null : mode === 'cumulative' ? currentSum : point.current,
      previous: point.previous == null ? null : mode === 'cumulative' ? previousSum : point.previous,
    };
  });
  const values = points.flatMap(point => [point.current, point.previous]).filter(value => value != null);
  const min = Math.min(0, ...values);
  const max = Math.max(10000, ...values);
  const low = min < 0 ? min - (max - min) * .05 : 0;
  const high = max + (max - low) * .08;
  const x = index => 95 + index / Math.max(1, points.length - 1) * 675;
  const y = value => 18 + (1 - (value - low) / (high - low)) * 205;
  const path = key => {
    let connected = false;
    return points.map((point, index) => {
      if (point[key] == null) { connected = false; return ''; }
      const command = connected ? 'L' : 'M';
      connected = true;
      return command + x(index) + ',' + y(point[key]);
    }).join(' ');
  };
  const currentTotal = branch.points.reduce((sum, point) => sum + (point.current ?? 0), 0);
  const matched = branch.points.filter(point => point.current != null && point.previous != null);
  const previousTotal = matched.reduce((sum, point) => sum + point.previous, 0);
  const matchedCurrent = matched.reduce((sum, point) => sum + point.current, 0);
  const previousFull = branch.points.reduce((sum, point) => sum + (point.previous ?? 0), 0);
  const fullBaseline = branch.points.every(point => point.previous != null);
  const focus = points[hover ?? Math.max(0, points.findLastIndex(point => point.current != null))];
  const lastYear = previousMonth.slice(0, 4);
  const thisYear = month.slice(0, 4);
  return (
    <section className="year-comparison">
      <header>
        <strong>{branch.name}</strong>
        <select aria-label={branch.name + ' chart view'} value={mode} onChange={event => setMode(event.target.value)}>
          <option value="cumulative">Month progress</option>
          <option value="daily">Daily revenue</option>
        </select>
      </header>
      <div className="year-comparison-metrics">
        <div><small>{thisYear} · through {date.slice(8)}</small><b>{money(currentTotal)}</b></div>
        <div><small>{lastYear} · same elapsed days</small><b>{matched.length ? money(previousTotal) : 'No historical data'}</b></div>
        <div><small>{lastYear} · {fullBaseline ? 'full month' : 'available dates'}</small><b>{branch.points.some(point => point.previous != null) ? money(previousFull) : 'Unavailable'}</b></div>
        <div><small>Change over matched days</small><b>{previousTotal > 0 ? ((matchedCurrent - previousTotal) * 100 / previousTotal).toFixed(1) + '%' : '—'}</b></div>
      </div>
      <div className="year-comparison-legend">
        <span><i style={{ background: '#009b86' }} />{thisYear}</span>
        <span><i style={{ background: '#7178dc' }} />{lastYear}</span>
        <small>{mode === 'cumulative' ? 'Cumulative net revenue' : 'Daily net revenue'} · LKR</small>
      </div>
      <svg viewBox="0 0 800 258" role="img" aria-label={branch.name + ' revenue comparison for ' + month + ' and ' + previousMonth} onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map(index => {
          const amount = low + (high - low) * index / 4;
          return <g key={index}><line x1="95" x2="770" y1={y(amount)} y2={y(amount)} stroke="var(--line)" />
            <text x="85" y={y(amount) + 4} textAnchor="end">{Math.round(amount / 100).toLocaleString()}</text></g>;
        })}
        <path d={path('previous')} fill="none" stroke="#7178dc" strokeWidth="3" strokeDasharray="7 4" />
        <path d={path('current')} fill="none" stroke="#009b86" strokeWidth="3.5" />
        {points.map((point, index) => <g key={point.day}>
          {(index % 5 === 0 || index === points.length - 1) && <text x={x(index)} y="246" textAnchor="middle">{point.day}</text>}
          <rect x={x(index) - 11} y="12" width="22" height="215" fill="transparent" onMouseEnter={() => setHover(index)} />
          {['current', 'previous'].map(key => point[key] != null
            ? <circle key={key} cx={x(index)} cy={y(point[key])} r={index === hover ? 5 : 2} fill={key === 'current' ? '#009b86' : '#7178dc'} />
            : null)}
        </g>)}
      </svg>
      {focus && <div className="year-comparison-detail" aria-live="polite">
        <span>Day {focus.day}</span><span>{thisYear}: {focus.current == null ? 'Future day' : money(focus.current)}</span>
        <span>{lastYear}: {focus.previous == null ? 'No historical data' : money(focus.previous)}</span>
      </div>}
    </section>
  );
}
