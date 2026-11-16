-- Public bucket for marketplace photos. Objects are stored under "<org_id>/..."
-- and only members of that org can write or delete them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listings', 'listings', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "listing images public read" on storage.objects for select using (bucket_id = 'listings');
create policy "org members upload listing images" on storage.objects for insert to authenticated
  with check (bucket_id = 'listings' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "org members delete listing images" on storage.objects for delete to authenticated
  using (bucket_id = 'listings' and public.is_member(((storage.foldername(name))[1])::uuid));
