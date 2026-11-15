create table public.delphi_worker_credentials (
  digest text primary key check (digest ~ '^[a-f0-9]{64}$')
);
alter table public.delphi_worker_credentials enable row level security;
revoke all on public.delphi_worker_credentials from anon, authenticated, public;
grant select on public.delphi_worker_credentials to service_role;
