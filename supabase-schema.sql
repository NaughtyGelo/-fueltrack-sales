-- FuelTrack shared sync schema for Supabase.
-- 1. Replace CHANGE-THIS-SYNC-CODE with a private code only you know.
-- 2. Run this file in Supabase SQL Editor.
-- 3. Put your Supabase Project URL and anon public key in config.js.

create extension if not exists pgcrypto;

create table if not exists public.fueltrack_state (
  station_id text primary key,
  sync_secret_hash text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.fueltrack_state enable row level security;
revoke all on public.fueltrack_state from anon, authenticated;

insert into public.fueltrack_state (station_id, sync_secret_hash, data)
values (
  'micro-gasoline-station',
  crypt('CHANGE-THIS-SYNC-CODE', gen_salt('bf')),
  '{
    "nextId": 1,
    "filter": "all",
    "setup": {
      "Premium": { "price": 65.5, "cost": 58, "capacity": 10000, "stock": 10000 },
      "Unleaded": { "price": 63, "cost": 56, "capacity": 10000, "stock": 10000 },
      "Diesel": { "price": 62, "cost": 55, "capacity": 10000, "stock": 10000 }
    },
    "sales": []
  }'::jsonb
)
on conflict (station_id) do nothing;

create or replace function public.fueltrack_get_state(
  p_station_id text,
  p_sync_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select data
    into result
    from public.fueltrack_state
   where station_id = p_station_id
     and sync_secret_hash = crypt(p_sync_secret, sync_secret_hash);

  return result;
end;
$$;

create or replace function public.fueltrack_save_state(
  p_station_id text,
  p_sync_secret text,
  p_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fueltrack_state
     set data = p_data,
         updated_at = now()
   where station_id = p_station_id
     and sync_secret_hash = crypt(p_sync_secret, sync_secret_hash);

  return found;
end;
$$;

grant execute on function public.fueltrack_get_state(text, text) to anon;
grant execute on function public.fueltrack_save_state(text, text, jsonb) to anon;
