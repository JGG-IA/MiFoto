-- ════════════════════════════════════════════════════════════
--  Álbum de la fiesta — estructura de la base de datos
--  Pegar TODO este archivo en Supabase > SQL Editor > Run
-- ════════════════════════════════════════════════════════════

-- Invitados (uno por celular; se crea al escribir el nombre)
create table if not exists public.guests (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- Fotos
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.guests on delete cascade,
  path text not null,
  thumb_path text not null,
  width int,
  height int,
  created_at timestamptz not null default now()
);
create index if not exists photos_created_idx on public.photos (created_at desc);

-- Me gusta
create table if not exists public.likes (
  photo_id uuid not null references public.photos on delete cascade,
  user_id uuid not null default auth.uid() references public.guests on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

-- ── Seguridad: todos ven todo; cada uno modifica solo lo suyo ──
alter table public.guests enable row level security;
alter table public.photos enable row level security;
alter table public.likes  enable row level security;

create policy "ver invitados"      on public.guests for select to authenticated using (true);
create policy "crear mi usuario"   on public.guests for insert to authenticated with check (id = auth.uid());
create policy "editar mi usuario"  on public.guests for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "ver fotos"          on public.photos for select to authenticated using (true);
create policy "subir mis fotos"    on public.photos for insert to authenticated with check (user_id = auth.uid());
create policy "borrar mis fotos"   on public.photos for delete to authenticated using (user_id = auth.uid());

create policy "ver me gusta"       on public.likes for select to authenticated using (true);
create policy "dar me gusta"       on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "quitar me gusta"    on public.likes for delete to authenticated using (user_id = auth.uid());

-- ── Actualización en vivo (las fotos nuevas aparecen solas) ──
alter publication supabase_realtime add table public.photos, public.likes;

-- ── Almacenamiento de las fotos ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "subir a mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar de mi carpeta" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ════════════════════════════════════════════════════════════
--  ACCESO DE LA ORGANIZADORA
--  ⚠ Cambia la clave de abajo DENTRO DEL SQL EDITOR DE SUPABASE,
--    justo antes de tocar Run. NO la guardes en este archivo:
--    está publicado en GitHub y cualquiera podría leerla.
--    (mínimo 10 caracteres, que no sea fácil de adivinar).
-- ════════════════════════════════════════════════════════════
create schema if not exists privado;   -- este esquema NO es visible desde la app
create table if not exists privado.config (clave text not null);
delete from privado.config;
insert into privado.config (clave) values ('CAMBIA-ESTA-CLAVE');

create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "ver si soy organizadora" on public.admins for select to authenticated using (user_id = auth.uid());

-- ¿El usuario actual es organizadora?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Canjear la clave: si es correcta, este celular pasa a ser organizadora
create or replace function public.claim_admin(pin text) returns boolean
language plpgsql security definer set search_path = public, privado as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from privado.config c
             where c.clave = pin and c.clave <> 'CAMBIA-ESTA-CLAVE' and char_length(c.clave) >= 6) then
    insert into public.admins (user_id) values (auth.uid()) on conflict do nothing;
    return true;
  end if;
  perform pg_sleep(1);  -- frena a quien intente adivinar la clave
  return false;
end $$;
revoke all on function public.claim_admin(text) from public, anon;
grant execute on function public.claim_admin(text) to authenticated;

-- La organizadora puede borrar cualquier foto
create policy "organizadora borra fotos" on public.photos for delete to authenticated using (public.is_admin());
create policy "organizadora borra archivos" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.is_admin());
