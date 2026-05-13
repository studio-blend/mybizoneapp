'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface DailyRevenue {
  date: string;
  revenue: number;
}

export function DailyRevenueChart({ data }: { data: DailyRevenue[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => `₹${(Number(v) / 1000).toFixed(0)}k`}
        />
        <Tooltip
          formatter={(v) =>
            `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
          }
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          name="Revenue"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
