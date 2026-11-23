-- PSR Tool: one row per case (or per machine's telematics) per user. Newest "upd" wins.
-- Same Supabase project as Tech Bench. Run once in the SQL Editor (or `supabase db push`).

create sequence if not exists public.psr_docs_seq;

create table if not exists public.psr_docs (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id       text not null check (char_length(id) between 1 and 100),
  doc      jsonb,
  upd      bigint not null default 0,          -- device clock (ms) of the last change
  deleted  boolean not null default false,     -- tombstone so other devices drop it too
  seq      bigint not null default nextval('public.psr_docs_seq'),
  primary key (user_id, id)
);
create index if not exists psr_docs_user_seq on public.psr_docs (user_id, seq);

alter table public.psr_docs enable row level security;
drop policy if exists psr_docs_select on public.psr_docs;
drop policy if exists psr_docs_insert on public.psr_docs;
drop policy if exists psr_docs_update on public.psr_docs;
create policy psr_docs_select on public.psr_docs for select using (user_id = auth.uid());
create policy psr_docs_insert on public.psr_docs for insert with check (user_id = auth.uid());
create policy psr_docs_update on public.psr_docs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.psr_docs to authenticated;
grant usage on sequence public.psr_docs_seq to authenticated;

-- Idempotent write: applies only if it is at least as new as what the server holds, so a retry or
-- a late push from a stale device can never overwrite a newer copy. Returns the row's new seq,
-- or null when the server already had something newer (the device picks that up on its next pull).
create or replace function public.psr_put(p_id text, p_doc jsonb, p_upd bigint, p_deleted boolean default false)
returns bigint language plpgsql security invoker as $$
declare s bigint;
begin
  if octet_length(coalesce(p_doc::text, '')) > 4000000 then
    raise exception 'case too large (over 4 MB)';
  end if;
  insert into public.psr_docs (user_id, id, doc, upd, deleted)
    values (auth.uid(), p_id, case when p_deleted then null else p_doc end, p_upd, coalesce(p_deleted, false))
  on conflict (user_id, id) do update
    set doc = excluded.doc, upd = excluded.upd, deleted = excluded.deleted, seq = nextval('public.psr_docs_seq')
    where public.psr_docs.upd <= excluded.upd
  returning seq into s;
  return s;
end $$;
grant execute on function public.psr_put(text, jsonb, bigint, boolean) to authenticated;
