import {
  damageLogs,
  kitchenConsumptions,
  kitchenRecipeItems,
  kitchenRecipes,
  kitchenTickets,
  kitchenWaste,
  products,
  stores,
} from '@mybizone/db';
import { withTenant } from '@mybizone/db/tenant';
import { hasPermission } from '@mybizone/domain';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { getUserRoles } from './get-user-roles';
import { requireUser } from './session';
import { batchChoices, sellableStockSql } from './stock-batches';
export async function loadKitchenData(selectedStore?: string, view?: string) {
  const user = await requireUser();
  const roles = await getUserRoles(user);
  return withTenant(db, user.businessId, async (tx) => {
    const allStores = await tx
      .select()
      .from(stores)
      .where(eq(stores.businessId, user.businessId))
      .orderBy(asc(stores.name));
    const allowed = allStores.filter((s) =>
      hasPermission(roles, 'manage_inventory', { storeId: s.id }),
    );
    if (!allowed.length && !hasPermission(roles, 'manage_inventory'))
      throw new Error('Permission denied');
    if (selectedStore && !allowed.some((s) => s.id === selectedStore))
      throw new Error('Permission denied');
    const ids = allowed.filter((s) => !selectedStore || s.id === selectedStore).map((s) => s.id);
    const scope = ids.length ? inArray(kitchenTickets.storeId, ids) : sql`FALSE`;
    const stock = ids.length
      ? await tx
          .select({
            id: products.id,
            name: products.name,
            storeId: products.storeId,
            unitType: products.unitType,
            unitSymbol: products.unitSymbol,
            inventory: products.inventory,
            sellable: sellableStockSql,
            batchTracking: products.batchTracking,
            serialTracking: products.serialTracking,
            active: products.active,
          })
          .from(products)
          .where(and(eq(products.businessId, user.businessId), inArray(products.storeId, ids)))
          .orderBy(asc(products.name))
      : [];
    const recipes = ids.length
      ? await tx
          .select()
          .from(kitchenRecipes)
          .where(
            and(
              eq(kitchenRecipes.businessId, user.businessId),
              inArray(kitchenRecipes.storeId, ids),
            ),
          )
          .orderBy(desc(kitchenRecipes.active), desc(kitchenRecipes.createdAt))
      : [];
    const items = recipes.length
      ? await tx
          .select()
          .from(kitchenRecipeItems)
          .where(
            and(
              eq(kitchenRecipeItems.businessId, user.businessId),
              inArray(
                kitchenRecipeItems.recipeId,
                recipes.map((r) => r.id),
              ),
            ),
          )
      : [];
    const tickets = await tx
      .select()
      .from(kitchenTickets)
      .where(
        and(
          eq(kitchenTickets.businessId, user.businessId),
          scope,
          view && ['queued', 'preparing', 'completed', 'cancelled'].includes(view)
            ? eq(kitchenTickets.status, view)
            : undefined,
        ),
      )
      .orderBy(desc(kitchenTickets.createdAt), desc(kitchenTickets.id))
      .limit(100);
    const [totals] = await tx
      .select({
        queued: sql<number>`count(*) FILTER(WHERE ${kitchenTickets.status}='queued')::int`,
        preparing: sql<number>`count(*) FILTER(WHERE ${kitchenTickets.status}='preparing')::int`,
        today: sql<number>`count(*) FILTER(WHERE (${kitchenTickets.completedAt} AT TIME ZONE 'Asia/Kolkata')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::int`,
      })
      .from(kitchenTickets)
      .where(and(eq(kitchenTickets.businessId, user.businessId), scope));
    const waste = ids.length
      ? await tx
          .select({
            id: kitchenWaste.id,
            storeId: kitchenWaste.storeId,
            reason: kitchenWaste.reason,
            createdAt: kitchenWaste.createdAt,
            productName: damageLogs.productName,
            qty: damageLogs.qty,
            unitSymbol: damageLogs.unitSymbol,
            totalValue: damageLogs.totalValue,
            notes: damageLogs.notes,
          })
          .from(kitchenWaste)
          .innerJoin(
            damageLogs,
            and(
              eq(damageLogs.id, kitchenWaste.damageId),
              eq(damageLogs.businessId, kitchenWaste.businessId),
            ),
          )
          .where(
            and(eq(kitchenWaste.businessId, user.businessId), inArray(kitchenWaste.storeId, ids)),
          )
          .orderBy(desc(kitchenWaste.createdAt), desc(kitchenWaste.id))
          .limit(100)
      : [];
    const [wasteTotal] = ids.length
      ? await tx
          .select({
            value: sql<string>`coalesce(sum(${damageLogs.totalValue}),0)::text`,
            unknown: sql<number>`count(*) FILTER(WHERE ${damageLogs.totalValue} IS NULL)::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(kitchenWaste)
          .innerJoin(
            damageLogs,
            and(
              eq(damageLogs.id, kitchenWaste.damageId),
              eq(damageLogs.businessId, kitchenWaste.businessId),
            ),
          )
          .where(
            and(
              eq(kitchenWaste.businessId, user.businessId),
              inArray(kitchenWaste.storeId, ids),
              sql`${kitchenWaste.createdAt} >= (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 29)::timestamp AT TIME ZONE 'Asia/Kolkata')`,
            ),
          )
      : [];
    const batches = (await batchChoices(tx, user.businessId)).filter((b) =>
      stock.some((p) => p.id === b.productId),
    );
    return {
      stores: allowed,
      products: stock,
      recipes,
      items,
      tickets,
      totals: totals ?? { queued: 0, preparing: 0, today: 0 },
      waste,
      wasteTotal: wasteTotal ?? { value: '0', unknown: 0, count: 0 },
      batches,
      canConfigure: allowed.some((s) => hasPermission(roles, 'manage_products', { storeId: s.id })),
      configureStores: allowed
        .filter((s) => hasPermission(roles, 'manage_products', { storeId: s.id }))
        .map((s) => s.id),
    };
  });
}
export async function loadKitchenTicket(id: string) {
  const data = await loadKitchenData();
  const user = await requireUser();
  return withTenant(db, user.businessId, async (tx) => {
    const [ticket] = await tx
      .select()
      .from(kitchenTickets)
      .where(and(eq(kitchenTickets.id, id), eq(kitchenTickets.businessId, user.businessId)));
    if (!ticket) return null;
    if (!data.stores.some((s) => s.id === ticket.storeId)) throw new Error('Permission denied');
    const recipe = data.recipes.find((r) => r.id === ticket.recipeId);
    if (!recipe) throw new Error('Recipe unavailable');
    const consumed = await tx
      .select()
      .from(kitchenConsumptions)
      .where(
        and(
          eq(kitchenConsumptions.ticketId, id),
          eq(kitchenConsumptions.businessId, user.businessId),
        ),
      );
    return {
      ...data,
      ticket,
      recipe,
      ingredients: data.items.filter((i) => i.recipeId === recipe.id),
      consumed,
    };
  });
}
export type KitchenData = Awaited<ReturnType<typeof loadKitchenData>>;
