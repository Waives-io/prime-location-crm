-- Prime Location CRM – migration 006: an added field ("+ שדה חדש") can be removed from the form.
-- Removing hides it; values already saved in deals stay in the database. Safe to re-run.
alter table public.custom_fields add column if not exists hidden boolean not null default false;
