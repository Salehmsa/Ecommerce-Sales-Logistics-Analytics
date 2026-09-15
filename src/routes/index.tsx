import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";
import aggData from "@/data/agg.json";
import topDistrictsData from "@/data/top_districts.json";
import statesData from "@/data/states.json";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart,
} from "recharts";

export const Route = createFileRoute("/")({ component: Dashboard });

type Row = {
  Month_No: number; Status: string; BU: string; Category: string;
  Logistics_Type: string; Breach: number; Logistic_Partner: string;
  State: string; Region: string; Circle: string;
  units: number; orders: number;
};

const ALL = "All";
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = [
  "var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)",
  "var(--color-chart-4)", "var(--color-chart-5)",
  "oklch(0.55 0.20 280)", "oklch(0.65 0.18 25)", "oklch(0.45 0.15 200)",
];
const STATUS_COLORS: Record<string, string> = {
  DELIVERED: "oklch(0.65 0.18 150)",
  Cancelled: "oklch(0.65 0.20 30)",
  Return: "oklch(0.70 0.18 60)",
};

const data = aggData as Row[];

const fmt = (n: number) =>
  n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` :
  n >= 1e5 ? `${(n / 1e5).toFixed(2)} L` :
  n >= 1e3 ? `${(n / 1e3).toFixed(1)} K` : `${n}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)).sort() as T[]; }

function Dashboard() {
  const opts = useMemo(() => ({
    months: uniq(data.map(d => d.Month_No)),
    bus: uniq(data.map(d => d.BU)),
    cats: uniq(data.map(d => d.Category)),
    states: uniq(data.map(d => d.State)),
    regions: uniq(data.map(d => d.Region)),
    partners: uniq(data.map(d => d.Logistic_Partner)),
    logTypes: uniq(data.map(d => d.Logistics_Type)),
    statuses: uniq(data.map(d => d.Status)),
  }), []);

  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (typeof window !== "undefined") localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const [fMonth, setFMonth] = useState(ALL);
  const [fBU, setFBU] = useState(ALL);
  const [fState, setFState] = useState(ALL);
  const [fPartner, setFPartner] = useState(ALL);
  const [fLogType, setFLogType] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fCat, setFCat] = useState(ALL);

  const filtered = useMemo(() => data.filter(d =>
    (fMonth === ALL || d.Month_No === Number(fMonth)) &&
    (fBU === ALL || d.BU === fBU) &&
    (fCat === ALL || d.Category === fCat) &&
    (fState === ALL || d.State === fState) &&
    (fPartner === ALL || d.Logistic_Partner === fPartner) &&
    (fLogType === ALL || d.Logistics_Type === fLogType) &&
    (fStatus === ALL || d.Status === fStatus)
  ), [fMonth, fBU, fCat, fState, fPartner, fLogType, fStatus]);

  // Status filter applies to all visuals; alias for clarity
  const filteredAllStatus = filtered;

  const kpis = useMemo(() => {
    const total = filteredAllStatus.reduce((s, d) => s + d.units, 0);
    const orders = filteredAllStatus.reduce((s, d) => s + d.orders, 0);
    const delivered = filteredAllStatus.filter(d => d.Status === "DELIVERED").reduce((s, d) => s + d.units, 0);
    const returned = filteredAllStatus.filter(d => d.Status === "Return").reduce((s, d) => s + d.units, 0);
    const cancelled = filteredAllStatus.filter(d => d.Status === "Cancelled").reduce((s, d) => s + d.units, 0);
    const breached = filteredAllStatus.filter(d => d.Breach === 1).reduce((s, d) => s + d.orders, 0);
    return {
      total, orders, delivered, returned, cancelled, breached,
      delRate: total ? delivered / total : 0,
      retRate: total ? returned / total : 0,
      cancRate: total ? cancelled / total : 0,
      breachRate: orders ? breached / orders : 0,
      onTimeRate: orders ? 1 - (breached / orders) : 0,
      leakage: returned + cancelled,
    };
  }, [filteredAllStatus]);

  // 1. Monthly trend (units by month)
  const monthlyTrend = useMemo(() => {
    const m = new Map<number, { month: string; units: number; delivered: number; returned: number; cancelled: number }>();
    for (const d of filteredAllStatus) {
      const k = d.Month_No;
      if (!m.has(k)) m.set(k, { month: MONTHS[k], units: 0, delivered: 0, returned: 0, cancelled: 0 });
      const o = m.get(k)!;
      o.units += d.units;
      if (d.Status === "DELIVERED") o.delivered += d.units;
      if (d.Status === "Return") o.returned += d.units;
      if (d.Status === "Cancelled") o.cancelled += d.units;
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }, [filteredAllStatus]);

  // 2. MoM growth (delivered)
  const momGrowth = useMemo(() => {
    return monthlyTrend.map((m, i) => ({
      month: m.month,
      delivered: m.delivered,
      growth: i === 0 || monthlyTrend[i - 1].delivered === 0 ? 0
        : ((m.delivered - monthlyTrend[i - 1].delivered) / monthlyTrend[i - 1].delivered) * 100,
    }));
  }, [monthlyTrend]);

  // 3. BU mix
  const buMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filtered) m.set(d.BU, (m.get(d.BU) || 0) + d.units);
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  // 4. State distribution
  const stateMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filtered) m.set(d.State, (m.get(d.State) || 0) + d.units);
    return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  // 5. Status funnel
  const statusFunnel = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filteredAllStatus) m.set(d.Status, (m.get(d.Status) || 0) + d.units);
    return ["DELIVERED", "Return", "Cancelled"].map(s => ({ status: s, units: m.get(s) || 0 }));
  }, [filteredAllStatus]);

  // 6. Return rate by BU
  const retByBU = useMemo(() => {
    const m = new Map<string, { total: number; ret: number; canc: number }>();
    for (const d of filteredAllStatus) {
      if (!m.has(d.BU)) m.set(d.BU, { total: 0, ret: 0, canc: 0 });
      const o = m.get(d.BU)!;
      o.total += d.units;
      if (d.Status === "Return") o.ret += d.units;
      if (d.Status === "Cancelled") o.canc += d.units;
    }
    return Array.from(m.entries()).map(([BU, o]) => ({
      BU, retRate: o.total ? (o.ret / o.total) * 100 : 0,
      cancRate: o.total ? (o.canc / o.total) * 100 : 0,
    })).sort((a, b) => b.retRate - a.retRate);
  }, [filteredAllStatus]);

  // 7. SLA breach by partner
  const breachByPartner = useMemo(() => {
    const m = new Map<string, { orders: number; breach: number; units: number }>();
    for (const d of filteredAllStatus) {
      if (!m.has(d.Logistic_Partner)) m.set(d.Logistic_Partner, { orders: 0, breach: 0, units: 0 });
      const o = m.get(d.Logistic_Partner)!;
      o.orders += d.orders;
      o.units += d.units;
      if (d.Breach === 1) o.breach += d.orders;
    }
    return Array.from(m.entries()).map(([partner, o]) => ({
      partner, orders: o.orders, units: o.units,
      breachRate: o.orders ? (o.breach / o.orders) * 100 : 0,
    }));
  }, [filteredAllStatus]);

  // 8. Breach by logistics type
  const breachByLogType = useMemo(() => {
    const m = new Map<string, { orders: number; breach: number }>();
    for (const d of filteredAllStatus) {
      if (!m.has(d.Logistics_Type)) m.set(d.Logistics_Type, { orders: 0, breach: 0 });
      const o = m.get(d.Logistics_Type)!;
      o.orders += d.orders;
      if (d.Breach === 1) o.breach += d.orders;
    }
    return Array.from(m.entries()).map(([type, o]) => ({
      type, orders: o.orders, onTime: o.orders - o.breach, breach: o.breach,
      breachRate: o.orders ? (o.breach / o.orders) * 100 : 0,
    }));
  }, [filteredAllStatus]);

  // 9. Partner mix (units share)
  const partnerMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filtered) m.set(d.Logistic_Partner, (m.get(d.Logistic_Partner) || 0) + d.units);
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // 10. Top districts
  const topDistricts = useMemo(() => (topDistrictsData as any[]).slice(0, 10).map(d => ({
    district: d.District, units: d.units,
    retRate: d.units ? (d.ret_units / d.units) * 100 : 0,
  })), []);

  // 11. Region x BU heatmap (simple grid)
  const regionBU = useMemo(() => {
    const regions = uniq(filtered.map(d => d.Region)).slice(0, 8);
    const bus = uniq(filtered.map(d => d.BU));
    const m = new Map<string, number>();
    for (const d of filtered) m.set(`${d.Region}|${d.BU}`, (m.get(`${d.Region}|${d.BU}`) || 0) + d.units);
    const max = Math.max(...Array.from(m.values()), 1);
    return { regions, bus, get: (r: string, b: string) => m.get(`${r}|${b}`) || 0, max };
  }, [filtered]);

  // 12. Leakage waterfall
  const waterfall = useMemo(() => {
    const tot = kpis.total;
    return [
      { stage: "Total Units", value: tot, color: "var(--color-chart-3)" },
      { stage: "Cancelled", value: -kpis.cancelled, color: STATUS_COLORS.Cancelled },
      { stage: "Returned", value: -kpis.returned, color: STATUS_COLORS.Return },
      { stage: "Net Delivered", value: kpis.delivered, color: STATUS_COLORS.DELIVERED },
    ];
  }, [kpis]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">E-Commerce Performance Dashboard</h1>
            <p className="text-sm text-muted-foreground">FY2023 · Growth, Leakage & Logistics Insights</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Prepared by</div>
              <div className="text-lg font-bold tracking-tight bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
                SALEH MAHBUB
              </div>
            </div>
            <button
              onClick={() => setDark(d => !d)}
              aria-label="Toggle theme"
              className="rounded-md border p-2 hover:bg-accent transition-colors"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Filters */}
        <Card title="Filters">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Filter label="Month" value={fMonth} onChange={setFMonth} options={opts.months.map(m => ({ value: String(m), label: MONTHS[m] }))} />
            <Filter label="Business Unit" value={fBU} onChange={setFBU} options={opts.bus.map(o => ({ value: o, label: o }))} />
            <Filter label="Category" value={fCat} onChange={setFCat} options={opts.cats.map(o => ({ value: o, label: o }))} />
            <Filter label="State" value={fState} onChange={setFState} options={opts.states.map(o => ({ value: o, label: o }))} />
            <Filter label="Logistic Partner" value={fPartner} onChange={setFPartner} options={opts.partners.map(o => ({ value: o, label: o }))} />
            <Filter label="Logistics Type" value={fLogType} onChange={setFLogType} options={opts.logTypes.map(o => ({ value: o, label: o }))} />
            <Filter label="Status" value={fStatus} onChange={setFStatus} options={opts.statuses.map(o => ({ value: o, label: o }))} />
          </div>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Total Units" value={fmt(kpis.total)} sub={`${fmt(kpis.orders)} orders`} />
          <Kpi label="Delivered" value={fmt(kpis.delivered)} sub={pct(kpis.delRate)} accent="success" />
          <Kpi label="Returned (Leakage)" value={fmt(kpis.returned)} sub={pct(kpis.retRate)} accent="warn" />
          <Kpi label="Cancelled" value={fmt(kpis.cancelled)} sub={pct(kpis.cancRate)} accent="danger" />
          <Kpi label="SLA Breach Rate" value={pct(kpis.breachRate)} sub={`${fmt(kpis.breached)} late orders`} accent="danger" />
          <Kpi label="On-Time Rate" value={pct(kpis.onTimeRate)} sub="orders within SLA" accent="success" />
        </div>

        {/* Charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="1. Monthly Trend — Units by Status" subtitle="Stacked area showing total volume composition over the year">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" /><YAxis tickFormatter={fmt} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
                <Area type="monotone" dataKey="delivered" stackId="1" stroke={STATUS_COLORS.DELIVERED} fill={STATUS_COLORS.DELIVERED} />
                <Area type="monotone" dataKey="returned" stackId="1" stroke={STATUS_COLORS.Return} fill={STATUS_COLORS.Return} />
                <Area type="monotone" dataKey="cancelled" stackId="1" stroke={STATUS_COLORS.Cancelled} fill={STATUS_COLORS.Cancelled} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="2. MoM Growth — Delivered Units (%)" subtitle="Month-over-month % change in delivered volume">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={momGrowth}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" /><YAxis yAxisId="l" tickFormatter={fmt} /><YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
                <Bar yAxisId="l" dataKey="delivered" fill="var(--color-chart-1)" name="Delivered units" />
                <Line yAxisId="r" type="monotone" dataKey="growth" stroke="var(--color-chart-2)" strokeWidth={2} name="MoM Growth %" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="3. Business Unit Mix" subtitle="Share of units by BU under current filters">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={buMix} dataKey="value" nameKey="name" outerRadius={100} label={(e: any) => `${e.name} ${((e.percent ?? 0) * 100).toFixed(0)}%`}>
                  {buMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="4. Geographic Distribution — by State" subtitle="Units shipped per state">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stateMix} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tickFormatter={fmt} /><YAxis dataKey="name" type="category" width={100} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Bar dataKey="value" fill="var(--color-chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="5. Order Status Funnel" subtitle="From total to net delivered — see where volume drops off">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statusFunnel}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="status" /><YAxis tickFormatter={fmt} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Bar dataKey="units">{statusFunnel.map((d, i) => <Cell key={i} fill={STATUS_COLORS[d.status]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="6. Leakage Rate by Business Unit" subtitle="Return % and Cancellation % per BU — flags problem categories">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={retByBU}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="BU" angle={-20} textAnchor="end" height={60} interval={0} fontSize={11} />
                <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
                <Bar dataKey="retRate" name="Return %" fill={STATUS_COLORS.Return} />
                <Bar dataKey="cancRate" name="Cancel %" fill={STATUS_COLORS.Cancelled} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="7. SLA Breach by Logistic Partner" subtitle="Volume vs on-time performance per partner">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={breachByPartner}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="partner" />
                <YAxis yAxisId="l" tickFormatter={fmt} /><YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
                <Bar yAxisId="l" dataKey="orders" fill="var(--color-chart-3)" name="Orders" />
                <Line yAxisId="r" type="monotone" dataKey="breachRate" stroke="oklch(0.65 0.20 30)" strokeWidth={3} name="Breach %" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="8. SLA Breach by Logistics Type" subtitle="On-time vs breach per delivery type">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={breachByLogType}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="type" /><YAxis tickFormatter={fmt} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
                <Bar dataKey="onTime" stackId="a" fill={STATUS_COLORS.DELIVERED} name="On-time orders" />
                <Bar dataKey="breach" stackId="a" fill={STATUS_COLORS.Cancelled} name="Breached orders" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="9. Partner Volume Mix" subtitle="Share of units per logistic partner">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={partnerMix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100} label={(e: any) => `${e.name} ${((e.percent ?? 0) * 100).toFixed(0)}%`}>
                  {partnerMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="10. Top 10 Districts by Volume" subtitle="Concentration risk — units and return rate per district">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={topDistricts}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="district" angle={-25} textAnchor="end" height={70} interval={0} fontSize={10} />
                <YAxis yAxisId="l" tickFormatter={fmt} /><YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
                <Bar yAxisId="l" dataKey="units" fill="var(--color-chart-1)" name="Units" />
                <Line yAxisId="r" type="monotone" dataKey="retRate" stroke={STATUS_COLORS.Return} strokeWidth={2} name="Return %" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="11. Region × BU Heatmap" subtitle="Units shipped — darker = larger; spot under-served region/BU pairs">
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr><th className="text-left p-1 sticky left-0 bg-card">Region</th>
                    {regionBU.bus.map(b => <th key={b} className="p-1 text-right">{b}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {regionBU.regions.map(r => (
                    <tr key={r}>
                      <td className="p-1 font-medium sticky left-0 bg-card">{r}</td>
                      {regionBU.bus.map(b => {
                        const v = regionBU.get(r, b);
                        const intensity = v / regionBU.max;
                        return (
                          <td key={b} className="p-1 text-right" style={{
                            background: `oklch(0.7 ${0.05 + intensity * 0.18} 250 / ${0.1 + intensity * 0.9})`,
                            color: intensity > 0.5 ? "white" : "var(--color-foreground)",
                          }}>{v ? fmt(v) : "—"}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="12. Leakage Waterfall" subtitle="From total volume to net delivered, with cancellation & return drops">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={waterfall}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="stage" /><YAxis tickFormatter={fmt} />
                <Tooltip formatter={(v: number) => fmt(Math.abs(v))} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Bar dataKey="value">{waterfall.map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Insights */}
        <Card title="Executive Insights">
          <div className="grid md:grid-cols-2 gap-6 text-sm leading-relaxed">
            <div>
              <h3 className="font-semibold mb-2 text-base">Growth</h3>
              <ul className="space-y-1.5 list-disc pl-5 text-muted-foreground">
                <li>Total volume processed: <span className="text-foreground font-medium">{fmt(kpis.total)} units</span> across <span className="text-foreground font-medium">{fmt(kpis.orders)} orders</span>.</li>
                <li>Delivery rate stands at <span className="text-foreground font-medium">{pct(kpis.delRate)}</span> — net delivered volume of {fmt(kpis.delivered)} units.</li>
                <li>Strongest BU by volume: <span className="text-foreground font-medium">{buMix[0]?.name}</span> ({buMix[0] ? pct(buMix[0].value / kpis.total) : "0%"} share).</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2 text-base">Leakage</h3>
              <ul className="space-y-1.5 list-disc pl-5 text-muted-foreground">
                <li>Combined leakage (returns + cancellations): <span className="text-destructive font-medium">{fmt(kpis.leakage)} units</span> ({pct((kpis.leakage) / Math.max(kpis.total, 1))}).</li>
                <li>SLA breach rate: <span className="text-destructive font-medium">{pct(kpis.breachRate)}</span> — major operational risk.</li>
                <li>Highest-leakage BU: <span className="text-foreground font-medium">{retByBU[0]?.BU}</span> ({retByBU[0]?.retRate.toFixed(1)}% return rate).</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2 text-base">Logistics Health</h3>
              <ul className="space-y-1.5 list-disc pl-5 text-muted-foreground">
                {breachByPartner.map(p => (
                  <li key={p.partner}>
                    <span className="text-foreground font-medium">{p.partner}</span>: {fmt(p.orders)} orders · {p.breachRate.toFixed(1)}% breach
                  </li>
                ))}
                <li>Logistics type with highest breach: <span className="text-foreground font-medium">{[...breachByLogType].sort((a, b) => b.breachRate - a.breachRate)[0]?.type}</span>.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2 text-base">Geographic & Recommendations</h3>
              <ul className="space-y-1.5 list-disc pl-5 text-muted-foreground">
                <li>Top state: <span className="text-foreground font-medium">{stateMix[0]?.name}</span> drives {stateMix[0] ? pct(stateMix[0].value / kpis.total) : "0%"} of volume — concentration risk.</li>
                <li>Top district {topDistricts[0]?.district} alone accounts for {fmt(topDistricts[0]?.units || 0)} units.</li>
                <li><span className="text-foreground font-medium">Action:</span> renegotiate SLA with worst partner; investigate return reasons for top-leakage BU; diversify geographic mix beyond top state.</li>
              </ul>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold text-sm">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>}
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "success" | "warn" | "danger" }) {
  const accentColor = accent === "success" ? "oklch(0.55 0.15 150)"
    : accent === "warn" ? "oklch(0.65 0.18 60)"
    : accent === "danger" ? "oklch(0.55 0.20 30)"
    : "var(--color-foreground)";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: accentColor }}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
        <option value={ALL}>All</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
