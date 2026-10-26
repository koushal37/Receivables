-- 001_core_tables.sql

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  timezone text not null default 'Asia/Kolkata',
  currency_code char(3) not null default 'INR',
  business_settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'employee', 'read_only')),
  status text not null default 'active' check (status in ('active', 'invited', 'revoked')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  external_customer_reference text,
  email text,
  phone text,
  preferred_channel text,
  communication_permission_status text not null default 'unknown',
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one external reference per business, but only when a reference exists
create unique index customers_business_ref_uniq
  on public.customers (business_id, external_customer_reference)
  where external_customer_reference is not null;

create index customers_business_idx on public.customers (business_id);
create index memberships_user_idx on public.business_memberships (user_id);


-- security: no row is visible to anyone until a policy allows it
alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.customers enable row level security;

-- your backend (secret key) needs explicit table access, because
-- "automatically expose new tables" was switched off
grant select, insert, update, delete on
  public.businesses, public.business_memberships, public.customers
  to service_role;