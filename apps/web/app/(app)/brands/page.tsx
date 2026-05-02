import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { brands } from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@mybizone/ui/table';
import { asc } from 'drizzle-orm';
import Link from 'next/link';
import { DeleteBrandButton } from './_components/delete-button';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  const user = await requireUser();
  const rows = await withTenant(db, user.businessId, (tx) =>
    tx
      .select({
        id: brands.id,
        name: brands.name,
        description: brands.description,
      })
      .from(brands)
      .orderBy(asc(brands.name)),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Brands</h1>
        <Button asChild>
          <Link href="/brands/new">New brand</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No brands yet</CardTitle>
            <CardDescription>Brands let you tag products by manufacturer or label.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/brands/new">Create brand</Link>
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
                  <TableHead>Description</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground">{b.description ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/brands/${b.id}/edit`}>Edit</Link>
                        </Button>
                        <DeleteBrandButton id={b.id} name={b.name} />
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
