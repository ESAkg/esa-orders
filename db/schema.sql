-- SQL-база сайта заказов ESA (Postgres / Neon). Сервер выполняет этот файл сам при запуске.
create table if not exists esa_kv (
  store      text        not null,           -- orders / reviews / misc
  key        text        not null,           -- ESA-123456, ok/abc, state/123 ...
  value      jsonb       not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store, key)
);
create index if not exists esa_kv_updated on esa_kv (store, updated_at);

-- Удобный просмотр заказов (например, в консоли Neon: select * from esa_orders_view;)
create or replace view esa_orders_view as
select key as id,
       value->>'status'  as status,
       value->>'service' as service,
       value->>'name'    as name,
       value->>'contact' as contact,
       value->>'details' as details,
       to_timestamp((value->>'createdAt')::bigint / 1000.0) as created
from esa_kv where store = 'orders'
order by created desc;
