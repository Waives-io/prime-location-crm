-- Prime Location CRM – delete ALL records: every lead deal, owner deal and contact.
-- Kept: dropdown value lists (option_lists), added fields (custom_fields), users and access (crm_members).
-- This cannot be undone.
begin;
delete from public.lead_deals;
delete from public.owner_deals;
delete from public.contacts;
commit;

select (select count(*) from public.lead_deals)    as leads,
       (select count(*) from public.owner_deals)   as owners,
       (select count(*) from public.contacts)      as contacts,
       (select count(*) from public.option_lists)  as list_values_kept,
       (select count(*) from public.custom_fields) as added_fields_kept;
