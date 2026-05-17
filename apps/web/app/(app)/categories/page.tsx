import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { categories, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { asc } from 'drizzle-orm';
import Link from 'next/link';
import { DeleteCategoryButton } from './_components/delete-button';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const user = await requireUser();
  const { rows, storeNames } = await withTenant(db, user.businessId, async (tx) => {
    const cats = await tx
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        storeId: categories.storeId,
        sortOrder: categories.sortOrder,
        attributes: categories.attributes,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    const storeRows = await tx
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .orderBy(asc(stores.name));
    return {
      rows: cats,
      storeNames: new Map(storeRows.map((s) => [s.id, s.name])),
    };
  });

  // Build tree: top-level first, then each child under its parent
  const byId = new Map(rows.map((r) => [r.id, r]));
  const topLevel = rows.filter((r) => !r.parentId);
  const childrenOf = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.parentId) {
      const arr = childrenOf.get(r.parentId) ?? [];
      arr.push(r);
      childrenOf.set(r.parentId, arr);
    }
  }

  // Flatten into display order: parent → its children (indent level 1)
  const ordered: Array<{ row: (typeof rows)[number]; depth: number }> = [];
  for (const top of topLevel) {
    ordered.push({ row: top, depth: 0 });
    for (const child of childrenOf.get(top.id) ?? []) {
      ordered.push({ row: child, depth: 1 });
      // Support depth-2 children
      for (const grandchild of childrenOf.get(child.id) ?? []) {
        ordered.push({ row: grandchild, depth: 2 });
      }
    }
  }
  // Append any orphaned rows not reached via top-level traversal
  const seen = new Set(ordered.map((o) => o.row.id));
  for (const r of rows) {
    if (!seen.has(r.id)) ordered.push({ row: r, depth: 0 });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Button asChild>
          <Link href="/categories/new">New category</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No categories yet</CardTitle>
            <CardDescription>
              Categories group your products. Create a top-level one first, then add sub-categories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/categories/new">Create category</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Attributes / Dimensions</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="w-16 text-right">Sort</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map(({ row: c, depth }) => {
                  const attrs = (c.attributes ?? []) as { name: string; unit?: string }[];
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <span
                          className="flex items-center gap-1.5"
                          style={{ paddingLeft: depth * 20 }}
                        >
                          {depth > 0 && (
                            <svg
                              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          )}
                          {c.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {attrs.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {attrs.map((a) => (
                              <span
                                key={a.name}
                                className="inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs"
                              >
                                {a.name}
                                {a.unit && (
                                  <span className="text-muted-foreground">({a.unit})</span>
                                )}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.storeId ? (storeNames.get(c.storeId) ?? '—') : 'All stores'}
                      </TableCell>
                      <TableCell className="text-right">{c.sortOrder}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/categories/${c.id}/edit`}>Edit</Link>
                          </Button>
                          <DeleteCategoryButton id={c.id} name={c.name} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
