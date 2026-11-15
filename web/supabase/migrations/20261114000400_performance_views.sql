create table public.performance_views (
  slug text references public.performances on delete cascade,
  browser uuid,
  primary key (slug, browser)
);

alter table public.performance_views enable row level security;
revoke all on public.performance_views from anon, authenticated, public;
grant select, insert on public.performance_views to service_role;
