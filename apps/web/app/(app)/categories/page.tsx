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

  // Build display labels: prefix sub-categories with their parent name.
  const byId = new Map(rows.map((r) => [r.id, r.name]));

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
                  <TableHead>Parent</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="w-32">Sort</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.parentId ? (byId.get(c.parentId) ?? '—') : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.storeId ? (storeNames.get(c.storeId) ?? '—') : 'All stores'}
                    </TableCell>
                    <TableCell>{c.sortOrder}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/categories/${c.id}/edit`}>Edit</Link>
                        </Button>
                        <DeleteCategoryButton id={c.id} name={c.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
