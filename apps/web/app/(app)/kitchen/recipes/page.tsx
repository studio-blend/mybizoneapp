import { loadKitchenData } from '@/lib/kitchen-queries';
import Link from 'next/link';
import { ArchiveRecipe, RecipeForm } from '../forms';
export const dynamic = 'force-dynamic';
export default async function RecipesPage() {
  const data = await loadKitchenData();
  if (!data.canConfigure) throw new Error('Permission denied');
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/kitchen" className="text-sm underline">
        Kitchen preparation
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">Recipe versions</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Define ingredients and expected yield for one complete recipe batch. Prepared goods and
          ingredients must already exist as separate products in the same store. Saving a recipe
          moves no stock.
        </p>
      </header>
      <div className="grid items-start gap-7 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Add recipe version</h2>
          {data.products.some(
            (p) => p.active && !p.serialTracking && data.configureStores.includes(p.storeId),
          ) ? (
            <RecipeForm data={data} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Add ingredient and prepared-stock products first.
            </p>
          )}
        </section>
        <section className="min-w-0 space-y-4">
          <h2 className="text-lg font-semibold">Saved recipes</h2>
          {!data.recipes.length && (
            <p className="rounded-xl border p-6 text-sm text-muted-foreground">
              No recipe versions yet. Use actual quantities from your kitchen's recipe.
            </p>
          )}
          {data.recipes.map((r) => (
            <article key={r.id} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-semibold">{r.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {r.active ? 'Active' : 'Archived'}
                </span>
              </div>
              <p className="text-sm">
                {r.yieldQty} {r.unitSymbol} of {r.outputName} ·{' '}
                {data.stores.find((s) => s.id === r.storeId)?.name}
              </p>
              <ul className="space-y-2 border-t pt-3 text-sm">
                {data.items
                  .filter((i) => i.recipeId === r.id)
                  .map((i) => (
                    <li key={i.id}>
                      {i.productName}: {i.qty} {i.unitSymbol}
                    </li>
                  ))}
              </ul>
              {r.active && data.configureStores.includes(r.storeId) && <ArchiveRecipe id={r.id} />}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
