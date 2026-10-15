'use client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function ActivityChart({ data }: { data: { date: string; revenue: number }[] }) {
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
      <div role="img" aria-label="Net sales by day for the selected period" className="min-w-0">
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
                'Net sales',
              ]}
            />
            <Area
              type="linear"
              dataKey="revenue"
              stroke="#047857"
              strokeWidth={2}
              fill="#047857"
              fillOpacity={0.08}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">View chart data</summary>
        <table className="mt-2 w-full">
          <caption className="sr-only">Daily net sales</caption>
          <thead>
            <tr>
              <th className="text-left">Date</th>
              <th className="text-right">Net sales</th>
            </tr>
          </thead>
          <tbody>
            {labels.map((row) => (
              <tr key={row.date}>
                <td className="py-1">{row.label}</td>
                <td className="text-right">
                  ₹{row.revenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
