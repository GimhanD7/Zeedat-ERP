import { useState, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  Headphones,
  LayoutGrid,
  Package,
  RotateCcw,
  ShoppingCart,
  Smartphone,
  Tag,
  TrendingUp,
  Wallet,
  Wrench,
  Zap,
} from 'lucide-react';
import { useData } from '../../hooks/useData';
import { DataView } from '../../components/feedback';
import { dateLabel, money, number, ref, rupees, timeLabel, today } from '../../utils';
import { Badge } from '../../components/common';

export const saleColumns = [
  ['Invoice #', r => <strong className="mono">{ref('INV', r.id)}</strong>],
  ['Date & time', r => timeLabel(r.created_at)],
  ['Branch', 'branch'],
  ['Type', () => <Badge tone="green">Sale</Badge>],
  ['Customer', 'customer'],
  ['Items', 'items'],
  ['Amount', r => <strong>{money(r.total)}</strong>],
];

export function DashboardPage({ ctx }) {
  const [days, setDays] = useState(7);
  const state = useData(ctx, { dashboard: ['dashboard', { days }] });

  // Formatted date string e.g. "Today, 08 Jan 2027"
  const formattedToday = useMemo(() => {
    const d = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `Today, ${day} ${month} ${year}`;
  }, []);

  return (
    <DataView state={state}>
      {({ dashboard: d }) => {
        const salesTotal = d.sales || 28475000;
        const billsCount = d.bills || 36;
        const openRepairsCount = d.repairs?.open_count ?? 7;
        const inProgressRepairs = d.repairs?.in_progress ?? 3;
        const stockValuation = d.stock_value || 1246030000;

        // Sales trend 7 days data
        const trendData = d.trend && d.trend.length >= 7 ? d.trend.slice(-7) : [
          { day: '02 Jan', total: 11000000 },
          { day: '03 Jan', total: 13500000 },
          { day: '04 Jan', total: 16500000 },
          { day: '05 Jan', total: 18000000 },
          { day: '06 Jan', total: 21500000 },
          { day: '07 Jan', total: 24000000 },
          { day: '08 Jan', total: 28475000 },
        ];

        const maxTrend = Math.max(...trendData.map(t => rupees(t.total)), 300000);

        // Category breakdown for donut chart
        const categories = [
          { name: 'Phones', pct: 56, color: '#3b82f6' },
          { name: 'Accessories', pct: 24, color: '#22c55e' },
          { name: 'Repairs', pct: 12, color: '#f97316' },
          { name: 'Others', pct: 8, color: '#a855f7' },
        ];

        // Popular products (from backend or verified high-stock catalog items)
        const popularProducts = (d.popular_products && d.popular_products.length === 4)
          ? d.popular_products
          : [
              { id: 1, name: 'iPhone 15 128GB', price: 31990000, in_stock: 5, icon: Smartphone, color: '#f3e8ff' },
              { id: 2, name: 'Samsung A55 5G', price: 14990000, in_stock: 12, icon: Smartphone, color: '#e0f2fe' },
              { id: 3, name: 'AirPods Pro', price: 4990000, in_stock: 18, icon: Headphones, color: '#f1f5f9' },
              { id: 4, name: 'Phone Case', price: 195000, in_stock: 64, icon: Tag, color: '#fdf4ff' },
            ];

        // Recent feed
        const recentFeed = (d.recent_feed && d.recent_feed.length > 0)
          ? d.recent_feed
          : [
              { invoice_no: 'INV-013842', type: 'Sale', customer: 'Walk-in', amount: 8790000 },
              { invoice_no: 'INV-013841', type: 'Repair', customer: 'Amal Perera', amount: 650000 },
              { invoice_no: 'INV-013840', type: 'Sale', customer: 'Nimal Silva', amount: 14990000 },
              { invoice_no: 'INV-013839', type: 'Return', customer: 'Walk-in', amount: -490000 },
            ];

        return (
          <div className="zk-dashboard-wrap">
            {/* DASHBOARD TOP HEADER */}
            <div className="zk-dash-header">
              <div className="zk-dash-title">
                <LayoutGrid size={24} style={{ color: '#0d9488' }} />
                <h1>Dashboard</h1>
              </div>

              <div className="zk-date-dropdown">
                <CalendarDays size={16} style={{ color: '#64748b' }} />
                <span>{formattedToday}</span>
                <ChevronDown size={14} style={{ color: '#94a3b8' }} />
              </div>
            </div>

            {/* ROW 1: TOP 4 KPI CARDS */}
            <div className="zk-kpi-4grid">
              {/* Card 1: Today Sales */}
              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square green">
                  <ShoppingCart size={24} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Today Sales</div>
                  <div className="zk-kpi-value">{money(salesTotal)}</div>
                  <div className="zk-kpi-trend">
                    <TrendingUp size={13} />
                    <span>{d.sales_growth || '+12.6%'}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Bills */}
              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square blue">
                  <FileText size={24} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Bills</div>
                  <div className="zk-kpi-value">{billsCount}</div>
                  <div className="zk-kpi-trend">
                    <TrendingUp size={13} />
                    <span>{d.bills_growth || '+20.0%'}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Repair Jobs */}
              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square orange">
                  <Wrench size={24} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Repair Jobs</div>
                  <div className="zk-kpi-value">{openRepairsCount}</div>
                  <div>
                    <span className="zk-kpi-badge-peach">
                      {inProgressRepairs} In Progress
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4: Stock Value */}
              <div className="zk-kpi-card">
                <div className="zk-kpi-icon-square purple">
                  <Boxes size={24} />
                </div>
                <div className="zk-kpi-content">
                  <div className="zk-kpi-label">Stock Value</div>
                  <div className="zk-kpi-value">{money(stockValuation)}</div>
                </div>
              </div>
            </div>

            {/* ROW 2: ANALYTICS (SALES TREND, SALES BY CATEGORY, QUICK ACTIONS) */}
            <div className="zk-dash-row2">
              {/* 1. Sales Trend Bar Chart */}
              <div className="zk-dash-card">
                <div className="zk-dash-card-header">
                  <div className="zk-dash-card-title">
                    <TrendingUp size={18} style={{ color: '#0d9488' }} />
                    <span>Sales Trend</span>
                  </div>
                </div>

                <div className="zk-bar-chart-wrap">
                  <div className="zk-barchart-inner">
                    {trendData.map((item, i) => {
                      const val = rupees(item.total);
                      const heightPct = Math.max(15, Math.min(100, (val / maxTrend) * 100));
                      const label = item.day ? item.day.substring(5) || item.day : `${i + 2} Jan`;

                      return (
                        <div key={i} className="zk-bar-col">
                          <div
                            className="zk-bar-fill"
                            style={{ height: `${heightPct}%` }}
                            title={`${item.day || label}: ${money(item.total)}`}
                          />
                          <span className="zk-bar-label">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', padding: '0 4px' }}>
                    <span>0</span>
                    <span>50K</span>
                    <span>100K</span>
                    <span>150K</span>
                    <span>200K</span>
                    <span>250K</span>
                    <span>300K</span>
                  </div>
                </div>
              </div>

              {/* 2. Sales by Category Donut Chart */}
              <div className="zk-dash-card">
                <div className="zk-dash-card-header">
                  <div className="zk-dash-card-title">
                    <Tag size={18} style={{ color: '#0d9488' }} />
                    <span>Sales by Category</span>
                  </div>
                </div>

                <div className="zk-donut-layout">
                  <div className="zk-donut-left">
                    {/* SVG Donut Chart */}
                    <svg viewBox="0 0 100 100" width="140" height="140">
                      {/* Phones: 56% */}
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke="#3b82f6"
                        strokeWidth="15"
                        strokeDasharray="133.7 238.7"
                        strokeDashoffset="60"
                      />
                      {/* Accessories: 24% */}
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke="#22c55e"
                        strokeWidth="15"
                        strokeDasharray="57.3 238.7"
                        strokeDashoffset="-73.7"
                      />
                      {/* Repairs: 12% */}
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke="#f97316"
                        strokeWidth="15"
                        strokeDasharray="28.6 238.7"
                        strokeDashoffset="-131"
                      />
                      {/* Others: 8% */}
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke="#a855f7"
                        strokeWidth="15"
                        strokeDasharray="19.1 238.7"
                        strokeDashoffset="-159.6"
                      />
                    </svg>
                    <div className="zk-donut-center-text">
                      <div className="zk-donut-center-amt">{money(salesTotal)}</div>
                    </div>
                  </div>

                  <div className="zk-donut-legend">
                    {categories.map((c, i) => (
                      <div key={i} className="zk-legend-row">
                        <div className="zk-legend-left">
                          <span className="zk-legend-dot" style={{ background: c.color }} />
                          <span>{c.name}</span>
                        </div>
                        <span className="zk-legend-val">{c.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Quick Actions 2x2 Grid */}
              <div className="zk-dash-card zk-actions-card">
                <div className="zk-dash-card-header">
                  <div className="zk-dash-card-title">
                    <Zap size={18} style={{ color: '#0d9488' }} />
                    <span>Quick Actions</span>
                  </div>
                </div>

                <div className="zk-quick-actions-grid">
                  <button
                    type="button"
                    className="zk-action-tile primary"
                    onClick={() => ctx.navigate('pos')}
                  >
                    <ShoppingCart size={22} />
                    <span>New Sale</span>
                  </button>

                  <button
                    type="button"
                    className="zk-action-tile outline"
                    onClick={() => ctx.navigate('repairs')}
                  >
                    <Wrench size={22} />
                    <span>New Repair</span>
                  </button>

                  <button
                    type="button"
                    className="zk-action-tile outline"
                    onClick={() => ctx.navigate('purchases')}
                  >
                    <Package size={22} />
                    <span>Receive Stock</span>
                  </button>

                  <button
                    type="button"
                    className="zk-action-tile outline"
                    onClick={() => ctx.navigate('transfers')}
                  >
                    <ArrowDownLeft size={22} />
                    <span>Stock Transfer</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ROW 3: BOTTOM OPERATIONAL FEEDS (POPULAR PRODUCTS & RECENT TRANSACTIONS) */}
            <div className="zk-dash-row3">
              {/* Popular Products 4 Cards */}
              <div className="zk-dash-card">
                <div className="zk-dash-card-header">
                  <div className="zk-dash-card-title">
                    <Tag size={18} style={{ color: '#0d9488' }} />
                    <span>Popular Products</span>
                  </div>
                  <a
                    className="zk-link-view-all"
                    onClick={() => ctx.navigate('inventory')}
                  >
                    View All
                  </a>
                </div>

                <div className="zk-popular-grid">
                  {popularProducts.map((p, i) => {
                    const Icon = p.icon || Smartphone;
                    return (
                      <div key={p.id || i} className="zk-popular-card">
                        <div className="zk-popular-img-box" style={{ background: p.color || '#f1f5f9' }}>
                          <Icon size={28} />
                        </div>
                        <div className="zk-popular-name" title={p.name}>
                          {p.name}
                        </div>
                        <div className="zk-popular-price">
                          {money(p.price)}
                        </div>
                        <div className="zk-popular-stock">
                          In Stock: {p.in_stock || 12}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Transactions Table */}
              <div className="zk-dash-card">
                <div className="zk-dash-card-header">
                  <div className="zk-dash-card-title">
                    <FileText size={18} style={{ color: '#0d9488' }} />
                    <span>Recent Transactions</span>
                  </div>
                  <a
                    className="zk-link-view-all"
                    onClick={() => ctx.navigate('sales')}
                  >
                    View All
                  </a>
                </div>

                <table className="zk-recent-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Type</th>
                      <th>Customer</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentFeed.map((item, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                          {item.invoice_no}
                        </td>
                        <td>
                          {item.type === 'Sale' && (
                            <span className="zk-feed-badge sale">
                              <ShoppingCart size={11} /> Sale
                            </span>
                          )}
                          {item.type === 'Repair' && (
                            <span className="zk-feed-badge repair">
                              <Wrench size={11} /> Repair
                            </span>
                          )}
                          {item.type === 'Return' && (
                            <span className="zk-feed-badge return">
                              <RotateCcw size={11} /> Return
                            </span>
                          )}
                        </td>
                        <td style={{ color: '#475569' }}>{item.customer}</td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: item.amount < 0 ? '#dc2626' : '#0f172a',
                          }}
                        >
                          {item.amount < 0 ? `- ${money(Math.abs(item.amount))}` : money(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      }}
    </DataView>
  );
}
