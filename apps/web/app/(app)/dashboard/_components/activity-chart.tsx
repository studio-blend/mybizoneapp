'use client';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function ActivityChart({
  data,
  showProfit = false,
}: { data: { date: string; revenue: number; profit?: number | null }[]; showProfit?: boolean }) {
  const [selected, setSelected] = useState<'revenue' | 'profit'>('revenue');
  const metric = showProfit ? selected : 'revenue';
  const metricLabel = metric === 'profit' ? 'Gross profit' : 'Net billed sales';
  const labels = data.map((row) => ({
    ...row,
    label: new Date(`${row.date}T12:00:00+05:30`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    }),
  }));
  return (
    <div>
      {showProfit && (
        <fieldset className="mb-4 flex min-w-0 flex-wrap gap-2">
          <legend className="sr-only">Chart measure</legend>
          {(['revenue', 'profit'] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={metric === value}
              onClick={() => setSelected(value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${metric === value ? 'border-emerald-700/30 bg-emerald-700/10 text-emerald-800 dark:text-emerald-300' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {value === 'profit' ? 'Gross profit' : 'Net billed sales'}
            </button>
          ))}
        </fieldset>
      )}
      <div
        role="img"
        aria-label={`${metricLabel} by day for the selected period`}
        className="min-w-0"
      >
        <ResponsiveContainer width="100%" height={245}>
          <AreaChart
            data={labels}
            margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} stroke="currentColor" opacity={0.08} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              minTickGap={25}
            />
            <YAxis
              domain={['auto', 'auto']}
              tickLine={false}
              axisLine={false}
              width={58}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              tickFormatter={(v) =>
                `₹${Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v))}`
              }
            />
            <Tooltip
              formatter={(v) => [
                `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
                metricLabel,
              ]}
            />
            <Area
              type="linear"
              dataKey={metric}
              connectNulls={false}
              stroke="#047857"
              strokeWidth={2}
              fill="#047857"
              fillOpacity={0.08}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {showProfit && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Billed sales include GST. Gross profit excludes GST and operating expenses; returns and
          free-item costs are included. Days with missing costs have gaps in the profit line.
        </p>
      )}
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">View chart data</summary>
        <table className="mt-2 w-full">
          <caption className="sr-only">
            Daily billed sales{showProfit ? ' and gross profit' : ''}
          </caption>
          <thead>
            <tr>
              <th className="text-left">Date</th>
              <th className="text-right">Net billed sales</th>
              {showProfit && <th className="pl-3 text-right">Gross profit</th>}
            </tr>
          </thead>
          <tbody>
            {labels.map((row) => (
              <tr key={row.date}>
                <td className="py-1">{row.label}</td>
                <td className="text-right">
                  ₹{row.revenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </td>
                {showProfit && (
                  <td className="pl-3 text-right">
                    {row.profit == null
                      ? 'Cost missing'
                      : `₹${row.profit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
