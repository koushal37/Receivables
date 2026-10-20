alter table public.business_memberships
  add column display_name text,
  add column phone text,
  add column email text;

create unique index memberships_business_phone_uniq
  on public.business_memberships (business_id, phone)
  where phone is not null;

notify pgrst, 'reload schema';
