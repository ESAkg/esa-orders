// Хранилище: на Render — своя SQL-база Postgres (DATABASE_URL, например Neon), на Netlify — Netlify Blobs.
// Интерфейс одинаковый: get(key), setJSON(key, value), delete(key), list({prefix}).
import { readFile } from "node:fs/promises";

let poolPromise;
async function pool() {
  poolPromise ??= (async () => {
    const { default: pg } = await import("pg");
    const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000, ssl: { rejectUnauthorized: true } });
    const schema = await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8");
    await p.query(schema);
    return p;
  })().catch((e) => { poolPromise = undefined; throw e; });
  return poolPromise;
}

function sqlStore(name) {
  const q = async (text, params) => (await pool()).query(text, params);
  return {
    get: async (key) => (await q("select value from esa_kv where store=$1 and key=$2", [name, key])).rows[0]?.value ?? null,
    setJSON: async (key, value) => {
      await q(`insert into esa_kv (store, key, value) values ($1, $2, $3)
               on conflict (store, key) do update set value = excluded.value, updated_at = now()`, [name, key, JSON.stringify(value)]);
    },
    delete: async (key) => { await q("delete from esa_kv where store=$1 and key=$2", [name, key]); },
    list: async ({ prefix = "" } = {}) => {
      const r = await q("select key from esa_kv where store=$1 and starts_with(key, $2) order by updated_at limit 1000", [name, prefix]);
      return { blobs: r.rows.map(({ key }) => ({ key })) };
    },
  };
}

export async function getStore(opts) {
  if (process.env.DATABASE_URL) return sqlStore(opts.name);
  const { getStore: blobs } = await import("@netlify/blobs");
  return blobs(opts);
}

export const warmUp = () => (process.env.DATABASE_URL ? pool() : Promise.resolve());
