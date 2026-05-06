import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { brands, catalogues, stores } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { DeleteCatalogueButton } from './_components/delete-button';

export const dynamic = 'force-dynamic';

export default async function CataloguesPage() {
  const user = await requireUser();
  const rows = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({
        id: catalogues.id,
        name: catalogues.name,
        fileKey: catalogues.fileKey,
        brandName: brands.name,
        storeName: stores.name,
        createdAt: catalogues.createdAt,
      })
      .from(catalogues)
      .leftJoin(brands, eq(catalogues.brandId, brands.id))
      .leftJoin(stores, eq(catalogues.storeId, stores.id))
      .orderBy(desc(catalogues.createdAt)),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catalogues</h1>
        <Button asChild>
          <Link href="/catalogues/new">Upload catalogue</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No catalogues yet</CardTitle>
            <CardDescription>
              Upload PDF or image catalogues so employees can view them on their devices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/catalogues/new">Upload catalogue</Link>
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
                  <TableHead>Brand</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.brandName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.storeName ?? 'All stores'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/catalogues/${c.id}`}>View</Link>
                        </Button>
                        <DeleteCatalogueButton id={c.id} name={c.name} />
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
