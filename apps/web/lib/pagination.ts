export const PAGE_SIZE = 50;

export function parsePage(value?: string): number {
  const page = Number(value);
  return Number.isSafeInteger(page) &&
    page > 0 &&
    page <= Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE)
    ? page
    : 1;
}

export function pageHref(path: string, filters: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && key !== 'page') params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
