create table public.performances (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 1 and 100),
  creator text not null check (char_length(creator) between 1 and 60),
  source text not null check (source in ('studio', 'spectacles')),
  created_at timestamptz not null default now()
);
create table public.likes (
  slug text references public.performances on delete cascade,
  browser uuid,
  primary key (slug, browser)
);
create table public.comments (
  id uuid primary key,
  slug text not null references public.performances on delete cascade,
  browser uuid not null,
  author text not null check (char_length(author) between 1 and 50),
  body text not null check (char_length(body) between 1 and 400),
  created_at timestamptz not null default now()
);
create index performances_recent_idx on public.performances (created_at desc);
create index comments_recent_idx on public.comments (slug, created_at desc);

alter table public.performances enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

revoke all on public.performances, public.likes, public.comments from anon, authenticated, public;
grant select, insert, update, delete on public.performances, public.likes, public.comments to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('performance-staging', 'performance-staging', false, 104857600),
       ('performance-media', 'performance-media', false, 104857600)
on conflict (id) do nothing;
