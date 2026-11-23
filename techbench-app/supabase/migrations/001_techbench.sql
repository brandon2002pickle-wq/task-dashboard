-- Tech Bench: one table of records per user, field-level merge, private photo bucket.
-- Run once in the Supabase SQL editor (or `supabase db push`).

create sequence if not exists public.records_seq;

create table if not exists public.records (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('job', 'seg', 'entry', 'photo')),
  parent_id  uuid,
  fields     jsonb not null default '{}'::jsonb,
  deleted    boolean not null default false,
  seq        bigint not null default nextval('public.records_seq'),
  updated_at timestamptz not null default now()
);

create index if not exists records_user_seq on public.records (user_id, seq);

-- every write moves the row to the end of the change feed
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.seq := nextval('public.records_seq');
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before update on public.records
  for each row execute function public.records_touch();

alter table public.records enable row level security;

drop policy if exists records_select on public.records;
drop policy if exists records_insert on public.records;
drop policy if exists records_update on public.records;
create policy records_select on public.records for select using (user_id = auth.uid());
create policy records_insert on public.records for insert with check (user_id = auth.uid());
create policy records_update on public.records for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.records to authenticated;
grant usage on sequence public.records_seq to authenticated;
-- no delete policy: records are soft-deleted with deleted = true so every device hears about it

-- Idempotent field-level push.
--   patch:    fields this device changed            {"wo": "123"}
--   expected: what this device last saw for them    {"wo": "120"}
-- A field is written only if the server still holds the expected value (or already holds the
-- new one). Otherwise it is returned in "conflicts" with the server's value and left untouched.
-- Retrying the same call is safe: a create that already landed just re-applies the same values.
create or replace function public.push_record(
  p_id uuid, p_kind text, p_parent uuid, p_patch jsonb, p_expected jsonb, p_deleted boolean default null
) returns jsonb
language plpgsql security invoker as $$
declare
  cur public.records;
  k text;
  conflicts jsonb := '{}'::jsonb;
  merged jsonb;
begin
  select * into cur from public.records where id = p_id for update;
  if not found then
    insert into public.records (id, kind, parent_id, fields, deleted)
      values (p_id, p_kind, p_parent, coalesce(p_patch, '{}'::jsonb), coalesce(p_deleted, false))
      on conflict (id) do nothing;
    select * into cur from public.records where id = p_id;
    return jsonb_build_object('conflicts', conflicts, 'seq', cur.seq, 'fields', cur.fields);
  end if;

  merged := cur.fields;
  for k in select jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) loop
    if p_expected ? k
       and (cur.fields -> k) is distinct from (p_expected -> k)
       and (cur.fields -> k) is distinct from (p_patch -> k) then
      conflicts := conflicts || jsonb_build_object(k, coalesce(cur.fields -> k, 'null'::jsonb));
    else
      merged := merged || jsonb_build_object(k, p_patch -> k);
    end if;
  end loop;

  if merged is distinct from cur.fields or (p_deleted is not null and p_deleted <> cur.deleted) then
    update public.records set fields = merged, deleted = coalesce(p_deleted, deleted) where id = p_id
      returning * into cur;
  end if;
  return jsonb_build_object('conflicts', conflicts, 'seq', cur.seq, 'fields', cur.fields);
end $$;

grant execute on function public.push_record(uuid, text, uuid, jsonb, jsonb, boolean) to authenticated;

-- Private photo storage: each user can only touch files under their own user-id folder.
insert into storage.buckets (id, name, public)
  values ('photos', 'photos', false)
  on conflict (id) do update set public = false;

drop policy if exists photos_own_read on storage.objects;
drop policy if exists photos_own_insert on storage.objects;
drop policy if exists photos_own_update on storage.objects;
create policy photos_own_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_own_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
