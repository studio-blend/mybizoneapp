'use client';

import type { PieLabelRenderProps } from 'recharts';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#65a30d'];

function rupee(v: unknown) {
  return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
}

export interface CategoryData {
  name: string;
  value: number;
}

export interface PaymentData {
  method: string;
  amount: number;
}

export interface TopProduct {
  name: string;
  revenue: number;
}

export function RevenueTrendChart({ data }: { data: MonthlyRevenue[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(Number(v) / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => rupee(v)} labelFormatter={(l) => `Month: ${l}`} />
        <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonutChart({ data }: { data: CategoryData[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }: PieLabelRenderProps) =>
            `${name ?? ''} ${percent !== undefined ? `${(Number(percent) * 100).toFixed(0)}%` : ''}`
          }
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => rupee(v)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function PaymentSplitBar({ data }: { data: PaymentData[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <XAxis dataKey="method" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(Number(v) / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => rupee(v)} />
        <Bar dataKey="amount" name="Amount" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopProductsBar({ data }: { data: TopProduct[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(Number(v) / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={55} />
        <Tooltip formatter={(v) => rupee(v)} />
        <Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
