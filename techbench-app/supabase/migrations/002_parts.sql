-- Tech Bench parts lookup: lets imported SIS 2.0 parts rows ('part' records) sync between devices.
-- Same table, same row-level security and push_record function as jobs; only the allowed kinds change.
-- Safe to run more than once. Until it runs, the app keeps parts rows on the device and jobs sync as normal.
alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('job', 'seg', 'entry', 'photo', 'part'));
