-- ════════════════════════════════════════════════════════════
--  PLATAFORMA DE ÁLBUMES PARA EVENTOS — base de datos
--  Un solo proyecto de Supabase atiende todos los eventos.
--  Instalación nueva: pegar TODO en Supabase > SQL Editor > Run.
--
--  ⚠ Ninguna clave va en este archivo (está publicado en GitHub).
--    Después de ejecutarlo, define la CLAVE MAESTRA de la consola
--    en una consulta aparte:
--      update privado.config set clave = 'TU-CLAVE-MAESTRA' where true;
-- ════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── Datos privados (no visibles desde la app) ──
create schema if not exists privado;
create table if not exists privado.config (clave text not null);
alter table privado.config enable row level security;
insert into privado.config (clave)
  select 'CAMBIA-ESTA-CLAVE' where not exists (select 1 from privado.config);

-- ── Eventos ──
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  tipo text not null default 'Quince años',        -- texto pequeño arriba del nombre
  nombre text not null,                             -- nombre grande (ej. Valentina)
  etiqueta text not null default 'XV',             -- etiqueta corta en la barra (ej. XV, Boda)
  titulo text not null default '',                  -- ej. Mis XV
  fecha date,
  lugar text not null default '',
  mensaje text not null default '',
  color text not null default '#A3195B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  abierto boolean not null default true,            -- ¿se pueden subir fotos?
  created_at timestamptz not null default now()
);

create table if not exists privado.event_secrets (
  event_id uuid primary key references public.events on delete cascade,
  codigo_invitados text,                 -- null = el álbum no pide código
  clave_organizador_hash text not null   -- guardada cifrada (bcrypt)
);
alter table privado.event_secrets enable row level security;

-- ── Personas ──
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.event_admins (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (event_id, user_id)
);
create table if not exists public.guests (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ── Fotos y me gusta ──
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null default auth.uid(),
  path text not null,
  thumb_path text not null,
  width int,
  height int,
  created_at timestamptz not null default now(),
  constraint photos_guest_fk foreign key (event_id, user_id)
    references public.guests (event_id, user_id) on delete cascade
);
create index if not exists photos_event_idx on public.photos (event_id, created_at desc);

create table if not exists public.likes (
  photo_id uuid not null references public.photos on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create index if not exists likes_event_idx on public.likes (event_id);

-- ── ¿Quién es quién? ──
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
create or replace function public.is_event_admin(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or exists (select 1 from public.event_admins where event_id = e and user_id = auth.uid());
$$;
create or replace function public.is_member(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.guests where event_id = e and user_id = auth.uid())
      or public.is_event_admin(e);
$$;

-- ── Seguridad por filas ──
alter table public.events          enable row level security;
alter table public.platform_admins enable row level security;
alter table public.event_admins    enable row level security;
alter table public.guests          enable row level security;
alter table public.photos          enable row level security;
alter table public.likes           enable row level security;

grant select, insert, update, delete on public.events to authenticated;
grant select on public.platform_admins, public.event_admins to authenticated;
grant select on public.guests to authenticated;
grant update (name) on public.guests to authenticated;     -- solo se puede cambiar el nombre
grant select, insert, delete on public.photos, public.likes to authenticated;

create policy "eventos: ver los propios" on public.events for select to authenticated using (public.is_member(id));
create policy "eventos: crear (consola)" on public.events for insert to authenticated with check (public.is_platform_admin());
create policy "eventos: editar (consola)" on public.events for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "eventos: borrar (consola)" on public.events for delete to authenticated using (public.is_platform_admin());

create policy "ver si soy admin de plataforma" on public.platform_admins for select to authenticated using (user_id = auth.uid());
create policy "ver organizadores" on public.event_admins for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create policy "invitados: ver los del evento" on public.guests for select to authenticated using (public.is_member(event_id));
create policy "invitados: cambiar mi nombre" on public.guests for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "fotos: ver las del evento" on public.photos for select to authenticated using (public.is_member(event_id));
create policy "fotos: subir" on public.photos for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.guests g where g.event_id = photos.event_id and g.user_id = auth.uid())
  and (exists (select 1 from public.events e where e.id = photos.event_id and e.abierto) or public.is_event_admin(event_id))
);
create policy "fotos: borrar mías o como organizador" on public.photos for delete to authenticated
  using (user_id = auth.uid() or public.is_event_admin(event_id));

create policy "me gusta: ver" on public.likes for select to authenticated using (public.is_member(event_id));
create policy "me gusta: dar" on public.likes for insert to authenticated with check (
  user_id = auth.uid() and public.is_member(event_id)
  and exists (select 1 from public.photos p where p.id = photo_id and p.event_id = likes.event_id)
);
create policy "me gusta: quitar" on public.likes for delete to authenticated using (user_id = auth.uid());

-- ── Funciones que usa la app ──

-- Datos públicos del evento (pantalla de bienvenida). No revela el código.
create or replace function public.event_info(p_slug text)
returns table (id uuid, slug text, tipo text, nombre text, etiqueta text, titulo text, fecha date,
               lugar text, mensaje text, color text, abierto boolean, requiere_codigo boolean)
language sql stable security definer set search_path = public, privado as $$
  select e.id, e.slug, e.tipo, e.nombre, e.etiqueta, e.titulo, e.fecha, e.lugar, e.mensaje, e.color, e.abierto,
         coalesce(s.codigo_invitados, '') <> ''
  from public.events e left join privado.event_secrets s on s.event_id = e.id
  where e.slug = lower(trim(p_slug));
$$;

-- Entrar a un evento con nombre (y código, si el evento lo pide)
create or replace function public.join_event(p_slug text, p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public, privado as $$
declare e uuid; c text;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  select ev.id, s.codigo_invitados into e, c
    from public.events ev left join privado.event_secrets s on s.event_id = ev.id
    where ev.slug = lower(trim(p_slug));
  if e is null then raise exception 'evento_no_existe'; end if;
  if coalesce(c, '') <> '' and upper(trim(coalesce(p_code, ''))) <> upper(c)
     and not public.is_event_admin(e) then
    perform pg_sleep(1);
    raise exception 'codigo_incorrecto';
  end if;
  insert into public.guests (event_id, user_id, name)
    values (e, auth.uid(), left(trim(p_name), 40))
    on conflict (event_id, user_id) do update set name = excluded.name;
  return e;
end $$;

-- Organizador: canjear la clave del evento
create or replace function public.claim_event_admin(p_slug text, p_key text) returns boolean
language plpgsql security definer set search_path = public, privado, extensions as $$
declare e uuid; h text;
begin
  if auth.uid() is null then return false; end if;
  select ev.id, s.clave_organizador_hash into e, h
    from public.events ev join privado.event_secrets s on s.event_id = ev.id
    where ev.slug = lower(trim(p_slug));
  if e is not null and h is not null and extensions.crypt(p_key, h) = h then
    insert into public.event_admins (event_id, user_id) values (e, auth.uid()) on conflict do nothing;
    return true;
  end if;
  perform pg_sleep(1);
  return false;
end $$;

-- Organizador: abrir o cerrar la recepción de fotos
create or replace function public.set_event_open(p_event uuid, p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_event_admin(p_event) then raise exception 'no_autorizado'; end if;
  update public.events set abierto = p_open where id = p_event;
end $$;

-- Organizador: ver el código de invitados (para compartirlo)
create or replace function public.event_code(p_event uuid) returns text
language sql stable security definer set search_path = public, privado as $$
  select s.codigo_invitados from privado.event_secrets s
  where s.event_id = p_event and public.is_event_admin(p_event);
$$;

-- Consola: canjear la clave maestra
create or replace function public.claim_platform_admin(p_key text) returns boolean
language plpgsql security definer set search_path = public, privado as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from privado.config c
             where c.clave = p_key and c.clave not like 'CAMBIA-ESTA%' and char_length(c.clave) >= 10) then
    insert into public.platform_admins (user_id) values (auth.uid()) on conflict do nothing;
    return true;
  end if;
  perform pg_sleep(1);
  return false;
end $$;

-- Consola: guardar código de invitados y clave del organizador
--   p_codigo: null = no cambiar, '' = sin código | p_clave: null o '' = no cambiar
create or replace function public.set_event_secrets(p_event uuid, p_codigo text, p_clave text) returns void
language plpgsql security definer set search_path = public, privado, extensions as $$
begin
  if not public.is_platform_admin() then raise exception 'no_autorizado'; end if;
  insert into privado.event_secrets (event_id, codigo_invitados, clave_organizador_hash)
  values (p_event, nullif(upper(trim(coalesce(p_codigo, ''))), ''),
          extensions.crypt(p_clave, extensions.gen_salt('bf')))
  on conflict (event_id) do update set
    codigo_invitados = case when p_codigo is null then privado.event_secrets.codigo_invitados
                            else nullif(upper(trim(p_codigo)), '') end,
    clave_organizador_hash = case when coalesce(p_clave, '') = '' then privado.event_secrets.clave_organizador_hash
                                  else extensions.crypt(p_clave, extensions.gen_salt('bf')) end;
end $$;

-- Consola: resumen de todos los eventos
create or replace function public.event_stats()
returns table (event_id uuid, fotos bigint, invitados bigint, codigo text)
language sql stable security definer set search_path = public, privado as $$
  select e.id,
         (select count(*) from public.photos p where p.event_id = e.id),
         (select count(*) from public.guests g where g.event_id = e.id),
         s.codigo_invitados
  from public.events e left join privado.event_secrets s on s.event_id = e.id
  where public.is_platform_admin();
$$;

revoke all on function public.join_event(text, text, text), public.claim_event_admin(text, text),
  public.set_event_open(uuid, boolean), public.event_code(uuid), public.claim_platform_admin(text),
  public.set_event_secrets(uuid, text, text), public.event_stats() from public, anon;
grant execute on function public.join_event(text, text, text), public.claim_event_admin(text, text),
  public.set_event_open(uuid, boolean), public.event_code(uuid), public.claim_platform_admin(text),
  public.set_event_secrets(uuid, text, text), public.event_stats() to authenticated;
grant execute on function public.event_info(text) to anon, authenticated;

-- ── Actualización en vivo ──
alter publication supabase_realtime add table public.photos, public.likes;

-- ── Fotos: almacenamiento PRIVADO (solo las ven los invitados del evento) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/jpeg'])
on conflict (id) do update set public = false;

-- Ruta de cada archivo: <id del evento>/<id del invitado>/<id de la foto>.jpg
create policy "archivos: ver los del evento" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "archivos: subir a mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos'
              and (storage.foldername(name))[2] = auth.uid()::text
              and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "archivos: borrar míos o como organizador" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos'
         and ((storage.foldername(name))[2] = auth.uid()::text
              or public.is_event_admin(((storage.foldername(name))[1])::uuid)));
