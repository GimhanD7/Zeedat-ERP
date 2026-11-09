import { useEffect, useRef, useState } from 'react';
import { dateLabel, money, rupees } from '../../utils';

const formatScale = v =>
  v >= 100000
    ? 'LKR ' + Math.round(v / 1000).toLocaleString() + 'k'
    : 'LKR ' + Math.round(v).toLocaleString();

export function TrendChart({ trend }) {
  const [hover, setHover] = useState(null);
  const [width, setWidth] = useState(850);
  const chart = useRef(null);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, Math.round(entry.contentRect.width)))
    );
    if (chart.current) observer.observe(chart.current);
    return () => observer.disconnect();
  }, []);

  const compact = width < 500;
  const height = compact ? 174 : 216;
  const pad = compact ? 68 : 92;
  const top = 16;
  const right = 16;
  const bottom = 32;
  const plotHeight = height - top - bottom;
  const values = trend.map(p => rupees(p.total));
  const maxValue = Math.max(100, ...values);
  const step = Math.pow(10, Math.floor(Math.log10(maxValue / 5)));
  const max = Math.ceil(maxValue / step) * step;

  const x = i => pad + (width - pad - right) * (i / Math.max(1, trend.length - 1));
  const y = v => top + plotHeight * (1 - v / max);
  const points = values.map((v, i) => [x(i), y(v)]);
  const polyline = points.map(p => p.join(',')).join(' ');
  const sample = Math.ceil(trend.length / (compact ? 5 : 7));
  const mark = hover ?? values.length - 1;
  const tooltipX = (100 * x(mark)) / width;

  return (
    <div
      className={'trend ' + (compact ? 'compact' : '')}
      ref={chart}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={'0 0 ' + width + ' ' + height}
        role="img"
        aria-label="Daily gross sales in Sri Lankan rupees"
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#2bbdb7" stopOpacity=".47" />
            <stop offset="1" stopColor="#2bbdb7" stopOpacity=".05" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4, 5].map(i => {
          const tick = (max * i) / 5;
          return (
            <g key={i}>
              <line
                x1={pad}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#e3ebf0"
              />
              <text x={pad - 10} y={y(tick) + 4} textAnchor="end">
                {formatScale(tick)}
              </text>
            </g>
          );
        })}
        {trend.length > 0 && (
          <>
            <polygon
              points={
                pad +
                ',' +
                y(0) +
                ' ' +
                polyline +
                ' ' +
                x(values.length - 1) +
                ',' +
                y(0)
              }
              fill="url(#trend-fill)"
            />
            <polyline
              points={polyline}
              stroke="#029790"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            />
            {trend.map(
              (p, i) =>
                (i % sample === 0 || i === trend.length - 1) && (
                  <g key={p.day}>
                    <circle
                      cx={x(i)}
                      cy={y(values[i])}
                      r={i === mark ? 5.2 : 3.4}
                      fill={i === mark ? '#029790' : '#fff'}
                      stroke="#029790"
                      strokeWidth="2"
                    />
                    <text
                      x={x(i)}
                      y={height - 13}
                      textAnchor={
                        i === values.length - 1
                          ? 'end'
                          : i === 0
                            ? 'start'
                            : 'middle'
                      }
                    >
                      {dateLabel(p.day, { day: '2-digit', month: 'short' })}
                    </text>
                  </g>
                )
            )}
            {trend.map((p, i) => (
              <rect
                key={p.day}
                x={x(i) - Math.min(25, 310 / trend.length)}
                y="0"
                width={Math.min(50, 620 / trend.length)}
                height={height - bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </>
        )}
      </svg>
      {trend[mark] && (
        <div
          className="trend-tooltip"
          style={{
            left: tooltipX + '%',
            transform: tooltipX > 55 ? 'translateX(-100%)' : undefined,
            top: Math.max(1, (100 * y(values[mark])) / height - 20) + '%',
          }}
        >
          <span>{dateLabel(trend[mark].day)}</span>
          <strong>{money(trend[mark].total)}</strong>
        </div>
      )}
    </div>
  );
}
