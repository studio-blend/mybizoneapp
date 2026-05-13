import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { expenseEntries } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Card, CardContent, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DeleteEntryButton } from './_components/delete-entry-button';
import { ExpenseForm } from './_components/expense-form';

export const dynamic = 'force-dynamic';

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
};

export default async function ExpensesPage() {
  const user = await requireUser();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { rows, incomeTotal, expenseTotal } = await withTenant(
    db,
    user.businessId,
    async (tx) => {
      const rows = await tx
        .select({
          id: expenseEntries.id,
          type: expenseEntries.type,
          category: expenseEntries.category,
          description: expenseEntries.description,
          amount: expenseEntries.amount,
          paymentMethod: expenseEntries.paymentMethod,
          referenceNo: expenseEntries.referenceNo,
          entryDate: expenseEntries.entryDate,
        })
        .from(expenseEntries)
        .where(eq(expenseEntries.businessId, user.businessId))
        .orderBy(desc(expenseEntries.entryDate))
        .limit(100);

      const [summary] = await tx
        .select({
          incomeTotal: sql<string>`COALESCE(SUM(CASE WHEN ${expenseEntries.type} = 'income' THEN ${expenseEntries.amount} ELSE 0 END), 0)`,
          expenseTotal: sql<string>`COALESCE(SUM(CASE WHEN ${expenseEntries.type} = 'expense' THEN ${expenseEntries.amount} ELSE 0 END), 0)`,
        })
        .from(expenseEntries)
        .where(
          and(
            eq(expenseEntries.businessId, user.businessId),
            gte(expenseEntries.entryDate, monthStart),
          ),
        );

      return {
        rows,
        incomeTotal: summary?.incomeTotal ?? '0',
        expenseTotal: summary?.expenseTotal ?? '0',
      };
    },
  );

  const net = Number(incomeTotal) - Number(expenseTotal);
  const netPositive = net >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Income &amp; Expenses</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Income this month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-green-600">
              ₹{Number(incomeTotal).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expenses this month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-red-600">
              ₹{Number(expenseTotal).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net this month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-semibold ${netPositive ? 'text-green-600' : 'text-red-600'}`}
            >
              {netPositive ? '+' : ''}₹{net.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick entry form */}
      <div className="mx-auto max-w-lg">
        <ExpenseForm />
      </div>

      {/* Entries table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No entries yet. Add your first entry above.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.entryDate)}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.type === 'income'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {r.type === 'income' ? 'Income' : 'Expense'}
                      </span>
                    </TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                    <TableCell className="text-right font-medium">
                      {Number(r.amount).toFixed(2)}
                    </TableCell>
                    <TableCell>{PAYMENT_LABELS[r.paymentMethod] ?? r.paymentMethod}</TableCell>
                    <TableCell>
                      <DeleteEntryButton id={r.id} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
