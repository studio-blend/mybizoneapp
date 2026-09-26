/** Stage the Windows standalone build and its migration runner without secrets. */
import { access, cp, mkdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = join(root, 'apps/web/.next/standalone');
const target = join(root, 'dist/desktop/app');
await access(join(standalone, 'apps/web/server.js'));
await mkdir(target, { recursive: true });
await cp(standalone, target, {
  recursive: true,
  // Next's traced tree may contain dotenv files; never redistribute credentials.
  filter: (source) => !/(^|[\\/])\.env(?:\.[^\\/]*)?$/.test(source),
});
await cp(join(root, 'apps/web/.next/static'), join(target, 'apps/web/.next/static'), {
  recursive: true,
});
try {
  await cp(join(root, 'apps/web/public'), join(target, 'apps/web/public'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(join(target, 'scripts/node_modules'), { recursive: true });
await cp(join(root, 'packages/db/scripts/migrate.mjs'), join(target, 'scripts/migrate.mjs'));
await cp(join(root, 'packages/db/migrations'), join(target, 'migrations'), { recursive: true });
const postgresRoot = await realpath(join(root, 'packages/db/node_modules/postgres'));
await cp(postgresRoot, join(target, 'scripts/node_modules/postgres'), {
  recursive: true,
  dereference: true,
});
console.info(`Desktop application staged at ${target}`);
