import { MARCA, SUPABASE_URL, SUPABASE_ANON_KEY, RUTAS_LIMPIAS, EVENTO_DEMO } from "./config.js";

const $ = (id) => document.getElementById(id);
const FULL_MAX = 2048;   // lado mayor de la foto guardada (px)
const THUMB_MAX = 480;   // lado mayor de la miniatura (px)
const ZIP_PART = 150;    // fotos por archivo .zip (≈60 MB cada uno)

const state = {
  slug: "",
  event: null,         // datos públicos del evento
  me: null,            // {id, name}
  photos: [],          // [{id,userId,name,url,thumb,download,createdAt,path,thumbPath}]
  likes: new Map(),    // photoId -> Set(userId)
  filter: "all",
  current: -1,
  pending: [],
  admin: false,
  code: "",            // código de invitados (si se conoce)
  armedGuest: null,
};
let backend;

/* ───────────────────────── utilidades ───────────────────────── */

function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}

/* ── efectos ── */
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
function addSparks() {
  if (calm) return;
  document.querySelectorAll(".fx").forEach((fx) => {
    if (fx.querySelector(".spark")) return;
    for (let i = 0; i < 16; i++) {
      const s = document.createElement("span"); s.className = "spark";
      const size = 3 + Math.random() * 5;
      s.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;animation-duration:${7 + Math.random() * 9}s;animation-delay:${-Math.random() * 12}s`;
      if (i % 3 === 0) { s.style.background = "var(--berry)"; s.style.boxShadow = "0 0 10px var(--berry)"; }
      fx.append(s);
    }
  });
}
function confetti() {
  if (calm) return;
  const c = $("confetti"); c.hidden = false;
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const g = c.getContext("2d"); g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const cols = [css.getPropertyValue("--berry").trim() || "#A3195B", "#D9AE62", "#F0659F", "#7B3FE4", "#35e6f2"];
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight - 90,
    vx: (Math.random() - 0.5) * 11, vy: -8 - Math.random() * 11, r: 3 + Math.random() * 5,
    a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, col: cols[Math.floor(Math.random() * cols.length)],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const k = (t - t0) / 1800;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.globalAlpha = Math.max(0, 1 - k);
      g.fillStyle = p.col; g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); g.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else c.hidden = true;
  })(t0);
}
/* Intro: logo JG y, como el disparo de una cámara, pasa a la pantalla principal.
   Se muestra una vez por visita (al recargar no se repite). Tocar la pantalla la salta. */
function runIntro() {
  const el = $("intro");
  const ready = () => document.body.classList.remove("wait");
  let seen = false;
  try { seen = sessionStorage.getItem("mifoto-intro") === "1"; } catch {}
  if (!el || calm || seen) { el?.remove(); ready(); return; }
  try { sessionStorage.setItem("mifoto-intro", "1"); } catch {}
  let t1, t2, started = false;
  const start = () => {
    if (started) return; started = true;
    el.classList.add("go");
    t1 = setTimeout(ready, 2400);          // la página arranca justo cuando se abre el obturador
    t2 = setTimeout(() => el.remove(), 3100);
  };
  const img = el.querySelector("img");
  if (img.complete && img.naturalWidth) start();
  else { img.onload = start; img.onerror = start; setTimeout(start, 1200); }
  el.addEventListener("click", () => {
    clearTimeout(t1); clearTimeout(t2);
    el.classList.add("out"); ready();
    setTimeout(() => el.remove(), 320);
  });
}
runIntro();

function heartBurst() {
  if (calm) return;
  const b = document.createElement("div"); b.className = "burst";
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="120" height="120"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z"/></svg>';
  $("v-stage").append(b); setTimeout(() => b.remove(), 950);
}
function colorFor(id) {
  let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}
function initials(name) {
  const words = (name || "").trim().split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  return (words.slice(0, 2).map((w) => [...w][0]).join("") || "?").toUpperCase();
}
function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function slug(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "foto";
}
function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error("No se pudo cargar " + src));
    document.head.appendChild(s);
  });
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

function readSlug() {
  const q = new URLSearchParams(location.search);
  let s = q.get("e") || "";
  if (!s && RUTAS_LIMPIAS) {
    const last = location.pathname.split("/").filter(Boolean).pop() || "";
    if (last && !/\.[a-z0-9]+$/i.test(last)) s = last;
  }
  return decodeURIComponent(s).toLowerCase().trim();
}
function eventUrl(withCode) {
  const base = RUTAS_LIMPIAS
    ? `${location.origin}/${state.slug}`
    : `${location.origin}${location.pathname.replace(/[^/]*$/, "")}?e=${encodeURIComponent(state.slug)}`;
  if (!withCode || !state.code) return base;
  return base + (base.includes("?") ? "&" : "?") + "c=" + encodeURIComponent(state.code);
}

/* Reduce la foto en el celular antes de subirla. */
async function resize(file, max, quality) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch {
    src = await new Promise((ok, fail) => {
      const img = new Image(); img.onload = () => ok(img); img.onerror = fail;
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  const k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(src, 0, 0, w, h);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", quality));
  return { blob, w, h };
}

/* Colores del evento */
function applyTheme(hex) {
  const root = document.documentElement;
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return;
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  root.style.setProperty("--event", hex);
  root.style.setProperty("--event-ink", lum > 0.4 ? "#1E1016" : "#FFFFFF");
}

/* ───────────────────────── backend: Supabase ───────────────────────── */

async function supabaseBackend() {
  await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js");
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const bucket = sb.storage.from("fotos");
  const uid = async () => (await sb.auth.getSession()).data.session?.user.id;
  const signed = new Map(); // path -> {url, exp}
  const TTL = 6 * 3600;

  async function sign(paths) {
    const now = Date.now();
    const need = [...new Set(paths)].filter((p) => !(signed.get(p)?.exp > now + 10 * 60000));
    for (let i = 0; i < need.length; i += 400) {
      const chunk = need.slice(i, i + 400);
      const { data, error } = await bucket.createSignedUrls(chunk, TTL);
      if (error) throw error;
      data.forEach((d) => { if (d.signedUrl) signed.set(d.path, { url: d.signedUrl, exp: now + TTL * 1000 }); });
    }
  }
  const urlOf = (p) => signed.get(p)?.url || "";

  return {
    demo: false,
    async eventInfo(s) {
      const { data, error } = await sb.rpc("event_info", { p_slug: s });
      if (error) throw error;
      return data?.[0] || null;
    },
    async session() {
      const id = await uid(); if (!id) return null;
      const { data } = await sb.from("guests").select("name").eq("event_id", state.event.id).eq("user_id", id).maybeSingle();
      return data ? { id, name: data.name } : null;
    },
    async join(name, code) {
      let id = await uid();
      if (!id) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        id = data.user.id;
      }
      const { error } = await sb.rpc("join_event", { p_slug: state.slug, p_code: code || "", p_name: name });
      if (error) throw error;
      return { id, name };
    },
    async rename(name) {
      const { error } = await sb.from("guests").update({ name }).eq("event_id", state.event.id).eq("user_id", state.me.id);
      if (error) throw error;
    },
    async isAdmin() {
      const { data } = await sb.rpc("is_event_admin", { e: state.event.id });
      return data === true;
    },
    async claimAdmin(key) {
      const { data, error } = await sb.rpc("claim_event_admin", { p_slug: state.slug, p_key: key });
      if (error) throw error;
      return data === true;
    },
    async guestCode() {
      const { data } = await sb.rpc("event_code", { p_event: state.event.id });
      return data || "";
    },
    async setOpen(open) {
      const { error } = await sb.rpc("set_event_open", { p_event: state.event.id, p_open: open });
      if (error) throw error;
    },
    async list() {
      const ev = state.event.id;
      const [p, l] = await Promise.all([
        sb.from("photos").select("id,user_id,path,thumb_path,created_at,guests!photos_guest_fk(name)")
          .eq("event_id", ev).order("created_at", { ascending: false }).limit(3000),
        sb.from("likes").select("photo_id,user_id").eq("event_id", ev).limit(30000),
      ]);
      if (p.error) throw p.error;
      await sign(p.data.flatMap((r) => [r.path, r.thumb_path]));
      const photos = p.data.map((r) => ({
        id: r.id, userId: r.user_id, name: r.guests?.name || "Invitado",
        url: urlOf(r.path), thumb: urlOf(r.thumb_path),
        download: urlOf(r.path) + `&download=${encodeURIComponent(`${state.slug}-${r.id.slice(0, 8)}.jpg`)}`,
        path: r.path, thumbPath: r.thumb_path, createdAt: r.created_at,
      }));
      return { photos, likes: l.data || [] };
    },
    async upload(full, thumb, onProgress) {
      const id = crypto.randomUUID();
      const base = `${state.event.id}/${state.me.id}/${id}`;
      const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
      let r = await bucket.upload(`${base}.jpg`, full.blob, opts); if (r.error) throw r.error;
      onProgress(0.85);
      r = await bucket.upload(`${base}_t.jpg`, thumb.blob, opts); if (r.error) throw r.error;
      const { error } = await sb.from("photos").insert({
        id, event_id: state.event.id, user_id: state.me.id,
        path: `${base}.jpg`, thumb_path: `${base}_t.jpg`, width: full.w, height: full.h,
      });
      if (error) { await bucket.remove([`${base}.jpg`, `${base}_t.jpg`]); throw error; }
    },
    async remove(p) {
      const { error } = await sb.from("photos").delete().eq("id", p.id);
      if (error) throw error;
      await bucket.remove([p.path, p.thumbPath]);
    },
    async like(photoId, on) {
      const q = on
        ? sb.from("likes").insert({ photo_id: photoId, user_id: state.me.id, event_id: state.event.id })
        : sb.from("likes").delete().eq("photo_id", photoId).eq("user_id", state.me.id);
      const { error } = await q; if (error) throw error;
    },
    subscribe(onChange) {
      const f = `event_id=eq.${state.event.id}`;
      sb.channel("album-" + state.event.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "photos", filter: f }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "likes", filter: f }, onChange)
        .subscribe();
    },
  };
}

/* ───────────────────────── backend: modo demo (local) ───────────────────────── */

function demoBackend() {
  const db = { photos: [], likes: [] };
  [["Ejemplo · Sofi", "#A3195B", "#F0659F", "Vals"], ["Ejemplo · Tío Juan", "#B8893B", "#F3D9A4", "Brindis"],
   ["Ejemplo · Abuela Rosa", "#5B2A86", "#C79BE8", "Torta"], ["Ejemplo · Mateo", "#7A1E2E", "#E58C8A", "Entrada"]]
    .forEach(([name, a, b, label], i) => {
      const c = document.createElement("canvas"); c.width = c.height = 600;
      const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 600, 600);
      gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, 600, 600);
      g.fillStyle = "rgba(255,255,255,.9)"; g.font = "600 54px Outfit, sans-serif"; g.textAlign = "center";
      g.fillText(label, 300, 300); g.font = "400 26px Outfit, sans-serif"; g.fillText("foto de ejemplo", 300, 345);
      const url = c.toDataURL("image/jpeg", 0.8);
      db.photos.push({ id: "s" + i, userId: "demo-" + name, name, url, thumb: url, download: url,
        createdAt: new Date(Date.now() - (i + 1) * 7 * 60000).toISOString() });
    });
  const key = "albumxv-demo-me";
  return {
    demo: true,
    async eventInfo() { return { ...EVENTO_DEMO }; },
    async session() { try { return JSON.parse(store.get(key)); } catch { return null; } },
    async join(name) { const me = { id: "u" + Math.random().toString(36).slice(2), name }; store.set(key, JSON.stringify(me)); return me; },
    async rename(name) { store.set(key, JSON.stringify({ ...state.me, name })); db.photos.forEach((p) => { if (p.userId === state.me.id) p.name = name; }); },
    async isAdmin() { return store.get(key + "-admin") === "1"; },
    async claimAdmin(k) { if (k !== "1234") return false; store.set(key + "-admin", "1"); return true; },
    async guestCode() { return ""; },
    async setOpen(open) { state.event.abierto = open; },
    async list() { return { photos: [...db.photos], likes: [...db.likes] }; },
    async upload(full, thumb, onProgress) {
      await new Promise((r) => setTimeout(r, 400)); onProgress(0.85);
      const url = URL.createObjectURL(full.blob);
      db.photos.unshift({ id: crypto.randomUUID(), userId: state.me.id, name: state.me.name, url,
        thumb: URL.createObjectURL(thumb.blob), download: url, createdAt: new Date().toISOString() });
    },
    async remove(p) { db.photos = db.photos.filter((x) => x.id !== p.id); },
    async like(photoId, on) {
      db.likes = db.likes.filter((l) => !(l.photo_id === photoId && l.user_id === state.me.id));
      if (on) db.likes.push({ photo_id: photoId, user_id: state.me.id });
    },
    subscribe() {},
  };
}

/* ───────────────────────── datos ───────────────────────── */

async function refresh() {
  try {
    const [{ photos, likes }, ev] = await Promise.all([backend.list(), backend.eventInfo(state.slug)]);
    if (ev) { state.event = { ...state.event, ...ev }; renderClosed(); }
    state.photos = photos;
    state.likes = new Map();
    for (const l of likes) {
      if (!state.likes.has(l.photo_id)) state.likes.set(l.photo_id, new Set());
      state.likes.get(l.photo_id).add(l.user_id);
    }
    render();
  } catch (e) {
    console.error(e);
    toast("No se pudieron cargar las fotos. Revisa tu conexión.");
  }
}
let refreshTimer;
function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 400); }

const visible = () => state.filter === "mine" ? state.photos.filter((p) => p.userId === state.me.id) : state.photos;

/* ───────────────────────── interfaz ───────────────────────── */

function showScreen(name) {
  for (const id of ["landing", "welcome", "album"]) $(id).hidden = id !== name;
  document.body.classList.toggle("in-album", name === "album");
  if (name !== "album") addSparks();
}

function fillEventText() {
  const e = state.event;
  document.title = `${e.nombre} · ${e.titulo || e.tipo} | ${MARCA.nombre}`;
  applyTheme(e.color);
  $("w-tipo").textContent = e.tipo || "";
  $("w-name").textContent = e.nombre;
  $("a-name").textContent = e.nombre;
  $("a-tag").textContent = e.etiqueta || "";
  $("w-title").textContent = e.titulo || "";
  $("w-title").hidden = !e.titulo;
  $("w-msg").textContent = e.mensaje || "";
  const parts = [];
  if (e.fecha) {
    const d = new Date(e.fecha + "T12:00:00");
    parts.push(d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }
  if (e.lugar) parts.push(e.lugar);
  $("w-meta").textContent = parts.join(" · ");
  $("code-row").hidden = !e.requiere_codigo;
  $("code-input").required = !!e.requiere_codigo;
  if (state.code) $("code-input").value = state.code;
}

function renderMe() {
  $("me-name").textContent = state.me.name;
  $("me-av").textContent = initials(state.me.name);
  $("me-av").style.background = colorFor(state.me.id);
}

function renderClosed() {
  const closed = !state.event.abierto;
  $("closed-banner").hidden = !closed;
  $("upload-btn").hidden = closed && !state.admin;
}

const tiles = new Map();   // photoId -> elemento (se reutiliza para no repetir animaciones)
const seen = new Set();   // fotos ya mostradas
let firstPaint = true, lastStats = [null, null];

function setStat(el, v, prev) {
  el.textContent = v;
  if (prev !== null && prev !== v && !calm) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
}

function render() {
  const list = visible();
  const guests = new Set(state.photos.map((p) => p.userId)).size;
  const n = state.photos.length;
  const b1 = document.createElement("b"), b2 = document.createElement("b");
  $("stats").replaceChildren(b1, n === 1 ? " foto · " : " fotos · ", b2, guests === 1 ? " invitado" : " invitados");
  setStat(b1, n, lastStats[0]); setStat(b2, guests, lastStats[1]);
  lastStats = [n, guests];

  const frag = document.createDocumentFragment();
  for (const u of state.pending) {
    const t = document.createElement("div"); t.className = "tile pending"; t.style.setProperty("--p", u.p);
    const img = document.createElement("img"); img.src = u.thumb; img.alt = "Subiendo…"; img.className = "ok"; t.append(img);
    frag.append(t);
  }
  let entering = 0;
  const freshOthers = [];
  list.forEach((p, i) => {
    let t = tiles.get(p.id);
    if (!t) {
      t = document.createElement("button"); t.className = "tile";
      t.setAttribute("aria-label", `Foto de ${p.name}`);
      const img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      img.onload = () => img.classList.add("ok");
      img.onerror = () => { img.style.visibility = "hidden"; };
      img.src = p.thumb;
      const who = document.createElement("span"); who.className = "who";
      t.append(img, who);
      if (!calm) {
        t.style.setProperty("--d", Math.min(entering++, 14));
        t.classList.add("enter");
        t.addEventListener("animationend", () => t.classList.remove("enter"), { once: true });
      }
      if (!firstPaint && !seen.has(p.id)) {
        t.classList.add("fresh");
        setTimeout(() => t.classList.remove("fresh"), 2500);
        if (p.userId !== state.me.id) freshOthers.push(p.name);
      }
      tiles.set(p.id, t);
    }
    seen.add(p.id);
    t.querySelector(".who").textContent = p.name;
    const img = t.querySelector("img");
    if (img.dataset.src !== p.thumb && p.thumb) { img.dataset.src = p.thumb; if (img.src !== p.thumb) img.src = p.thumb; }
    const c = state.likes.get(p.id)?.size || 0;
    let h = t.querySelector(".hearts");
    if (c) { if (!h) { h = document.createElement("span"); h.className = "hearts"; t.append(h); } h.textContent = "♥ " + c; }
    else if (h) h.remove();
    t.onclick = () => openViewer(i);
    frag.append(t);
  });
  $("grid").replaceChildren(frag);
  for (const id of [...tiles.keys()]) if (!state.photos.some((p) => p.id === id)) tiles.delete(id);
  if (state.photos.length) firstPaint = false;
  if (freshOthers.length === 1) toast(`Nueva foto de ${freshOthers[0]}`);
  else if (freshOthers.length > 1) toast(`${freshOthers.length} fotos nuevas en el álbum`);
  $("upload-btn").classList.toggle("hint", !state.photos.some((p) => p.userId === state.me.id));

  const isEmpty = list.length === 0 && state.pending.length === 0;
  $("empty").hidden = !isEmpty;
  if (isEmpty) {
    $("empty-title").textContent = state.filter === "mine" ? "Aún no subiste fotos" : "Todavía no hay fotos";
    $("empty-text").textContent = state.filter === "mine"
      ? "Toca “Subir fotos” y elige las que quieras compartir."
      : "Sé la primera persona en subir una. Toca “Subir fotos”.";
  }
  if (!$("viewer").hidden) showCurrent();
  if (!$("panel").hidden) renderPanel();
}

function setFilter(f) {
  state.filter = f;
  $("f-all").setAttribute("aria-pressed", f === "all");
  $("f-mine").setAttribute("aria-pressed", f === "mine");
  render();
}

/* ── Subida ── */
async function handleFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  if (!list.length) return;
  let ok = 0, fail = 0;
  const queue = list.map((file) => ({ file, p: 0, thumb: "" }));
  const run = async (u) => {
    try {
      const thumb = await resize(u.file, THUMB_MAX, 0.8);
      u.thumb = URL.createObjectURL(thumb.blob); state.pending.push(u); render();
      const full = await resize(u.file, FULL_MAX, 0.86);
      u.p = 0.3; render();
      await backend.upload(full, thumb, (p) => { u.p = p; render(); });
      ok++;
    } catch (e) {
      console.error(e); fail++;
    } finally {
      state.pending = state.pending.filter((x) => x !== u);
      toast(`Subiendo… ${ok + fail} de ${list.length}`, 1500);
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (queue.length) await run(queue.shift());
  }));
  await refresh();
  if (ok) confetti();
  if (fail) toast(`Se subieron ${ok} fotos. ${fail} no se pudieron subir; intenta de nuevo.`, 4000);
  else toast(ok === 1 ? "¡Tu foto ya está en el álbum!" : `¡Tus ${ok} fotos ya están en el álbum!`);
}

/* ── Visor ── */
function openViewer(i) {
  state.current = i;
  $("viewer").hidden = false;
  document.body.style.overflow = "hidden";
  showCurrent();
}
function closeViewer() {
  $("viewer").hidden = true; document.body.style.overflow = ""; state.current = -1; resetDelete();
}
function showCurrent() {
  const list = visible();
  if (!list.length) return closeViewer();
  state.current = Math.max(0, Math.min(state.current, list.length - 1));
  const p = list[state.current];
  $("v-img").src = p.url;
  $("v-img").alt = `Foto de ${p.name}`;
  $("v-name").textContent = p.name;
  $("v-time").textContent = `${timeAgo(p.createdAt)} · ${state.current + 1} de ${list.length}`;
  const likes = state.likes.get(p.id);
  const mine = likes?.has(state.me.id);
  $("v-like").classList.toggle("liked", !!mine);
  $("v-like").setAttribute("aria-label", mine ? "Quitar me gusta" : "Me gusta");
  $("v-likes").textContent = likes?.size || 0;
  $("v-dl").href = p.download;
  $("v-dl").setAttribute("download", "");
  $("v-del").hidden = !(p.userId === state.me.id || state.admin);
  const nx = list[state.current + 1]; if (nx) new Image().src = nx.url;
}
function step(d) {
  const n = visible().length; if (!n) return;
  state.current = (state.current + d + n) % n; resetDelete(); showCurrent();
  const img = $("v-img"); img.classList.remove("go-next", "go-prev"); void img.offsetWidth;
  img.classList.add(d > 0 ? "go-next" : "go-prev");
}

async function toggleLike() {
  const p = visible()[state.current]; if (!p) return;
  if (!state.likes.has(p.id)) state.likes.set(p.id, new Set());
  const set = state.likes.get(p.id); const on = !set.has(state.me.id);
  on ? set.add(state.me.id) : set.delete(state.me.id);
  if (on) heartBurst();
  render();
  try { await backend.like(p.id, on); } catch (e) { console.error(e); toast("No se pudo guardar el me gusta."); scheduleRefresh(); }
}

let delArmed = false;
function resetDelete() { delArmed = false; $("v-del").classList.remove("danger"); $("v-del-label").textContent = "Borrar"; }
async function deleteCurrent() {
  const p = visible()[state.current]; if (!p) return;
  if (!delArmed) { delArmed = true; $("v-del").classList.add("danger"); $("v-del-label").textContent = "¿Borrar? Toca otra vez"; return; }
  resetDelete();
  try { await backend.remove(p); toast("Foto borrada"); await refresh(); }
  catch (e) { console.error(e); toast("No se pudo borrar la foto."); }
}

let sx = 0, sy = 0;
$("v-stage").addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
$("v-stage").addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  else if (dy > 90) closeViewer();
});

/* ── Compartir ── */
function openShare() {
  const url = eventUrl(true);
  $("share-link").value = url;
  $("share-code").hidden = !state.code;
  $("share-code-val").textContent = state.code;
  const box = $("qr"); box.innerHTML = "";
  if (window.qrcode) {
    const q = window.qrcode(0, "M"); q.addData(url); q.make();
    box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  } else box.textContent = url;
  $("share").hidden = false;
}
async function copyLink() {
  const v = $("share-link").value;
  try { await navigator.clipboard.writeText(v); toast("Enlace copiado"); }
  catch { $("share-link").select(); toast("Mantén presionado el enlace para copiarlo"); }
}

/* ── Organizador ── */
async function renderAdmin() {
  $("panel-btn").hidden = !state.admin;
  $("admin-link").hidden = state.admin;
  renderClosed();
  if (state.admin && !state.code) {
    state.code = await backend.guestCode().catch(() => "") || "";
  }
}

let dlBusy = false;
function renderPanel() {
  const n = state.photos.length;
  const guests = new Map();
  for (const p of state.photos) {
    const g = guests.get(p.userId) || { id: p.userId, name: p.name, count: 0, likes: 0 };
    g.count++; g.likes += state.likes.get(p.id)?.size || 0;
    guests.set(p.userId, g);
  }
  let likes = 0; state.likes.forEach((s) => (likes += s.size));
  const stat = (v, label) => {
    const d = document.createElement("div"); d.className = "p-stat";
    const b = document.createElement("b"); b.textContent = v.toLocaleString("es");
    const s = document.createElement("span"); s.textContent = label;
    d.append(b, s); return d;
  };
  $("p-stats").replaceChildren(stat(n, n === 1 ? "foto" : "fotos"), stat(guests.size, guests.size === 1 ? "invitado" : "invitados"), stat(likes, "me gusta"));

  const open = !!state.event.abierto;
  $("p-open-state").textContent = open ? "Abierto: los invitados pueden subir fotos." : "Cerrado: el álbum se puede ver, pero no se suben fotos nuevas.";
  $("p-open-btn").textContent = open ? "Cerrar la recepción de fotos" : "Volver a abrir la recepción";
  $("p-code").textContent = state.code || "Este álbum no pide código";

  if (!dlBusy) {
    const parts = Math.ceil(n / ZIP_PART);
    const box = $("p-dl"); box.replaceChildren();
    if (!n) {
      const p = document.createElement("p"); p.className = "p-empty"; p.textContent = "Todavía no hay fotos para descargar.";
      box.append(p);
    }
    for (let k = 0; k < parts; k++) {
      const from = k * ZIP_PART + 1, to = Math.min(n, (k + 1) * ZIP_PART);
      const b = document.createElement("button"); b.className = "btn " + (k === 0 ? "btn-primary" : "btn-ghost");
      b.textContent = parts === 1 ? `Descargar las ${n} fotos` : `Descargar parte ${k + 1} (fotos ${from}–${to})`;
      b.onclick = () => downloadPart(k, parts);
      box.append(b);
    }
  }

  const ul = $("p-guests"); ul.replaceChildren();
  const list = [...guests.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (!list.length) {
    const li = document.createElement("li"); li.className = "p-empty"; li.textContent = "Nadie subió fotos todavía."; ul.append(li);
  }
  for (const g of list) {
    const li = document.createElement("li");
    const av = document.createElement("i"); av.textContent = initials(g.name); av.style.background = colorFor(g.id);
    const info = document.createElement("div"); info.className = "g";
    const nm = document.createElement("b"); nm.textContent = g.name + (g.id === state.me.id ? " (tú)" : "");
    const meta = document.createElement("span");
    meta.textContent = `${g.count} ${g.count === 1 ? "foto" : "fotos"} · ${g.likes} ♥`;
    info.append(nm, meta);
    const del = document.createElement("button");
    const armed = state.armedGuest === g.id;
    del.className = "minibtn" + (armed ? " danger" : "");
    del.textContent = armed ? `¿Borrar ${g.count}? Toca otra vez` : "Borrar sus fotos";
    del.onclick = () => deleteGuestPhotos(g.id);
    li.append(av, info, del); ul.append(li);
  }
}

async function toggleOpen() {
  const next = !state.event.abierto;
  try {
    await backend.setOpen(next);
    state.event.abierto = next; renderClosed(); renderPanel();
    toast(next ? "Recepción de fotos abierta" : "Recepción de fotos cerrada");
  } catch (e) { console.error(e); toast("No se pudo cambiar. Intenta de nuevo."); }
}

async function deleteGuestPhotos(id) {
  if (state.armedGuest !== id) { state.armedGuest = id; renderPanel(); return; }
  state.armedGuest = null;
  const list = state.photos.filter((p) => p.userId === id);
  let fail = 0;
  for (const p of list) { try { await backend.remove(p); } catch (e) { console.error(e); fail++; } }
  toast(fail ? `Se borraron ${list.length - fail} fotos; ${fail} no se pudieron borrar.` : `Se borraron ${list.length} fotos.`);
  await refresh();
}

function progress(frac, text) {
  $("p-prog").hidden = false;
  $("p-prog").firstElementChild.style.width = Math.round(frac * 100) + "%";
  $("p-prog-text").textContent = text;
}

async function downloadPart(k, parts) {
  if (dlBusy) return;
  dlBusy = true;
  $("p-dl").querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    if (!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    await refresh(); // enlaces de descarga recién firmados
    const all = [...state.photos].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const part = all.slice(k * ZIP_PART, (k + 1) * ZIP_PART);
    const zip = new window.JSZip();
    const queue = part.map((p, i) => ({ p, n: k * ZIP_PART + i + 1 }));
    let done = 0, fail = 0;
    progress(0, `Descargando 0 de ${part.length}…`);
    const worker = async () => {
      while (queue.length) {
        const { p, n } = queue.shift();
        try {
          const r = await fetch(p.url);
          if (!r.ok) throw new Error(r.status);
          const t = new Date(p.createdAt);
          const hhmm = String(t.getHours()).padStart(2, "0") + String(t.getMinutes()).padStart(2, "0");
          zip.file(`${String(n).padStart(4, "0")}_${hhmm}_${slug(p.name)}.jpg`, await r.blob());
        } catch (e) { console.error(e); fail++; }
        done++;
        progress(done / part.length, `Descargando ${done} de ${part.length}…`);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    progress(1, "Armando el archivo .zip…");
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.slug}${parts > 1 ? `-parte-${k + 1}` : ""}.zip`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 120000);
    progress(1, fail
      ? `Listo. ${fail} ${fail === 1 ? "foto no se pudo" : "fotos no se pudieron"} incluir; vuelve a intentarlo más tarde.`
      : "Listo. Revisa la carpeta de descargas.");
  } catch (e) {
    console.error(e);
    progress(0, "No se pudo armar la descarga. Revisa tu conexión e intenta de nuevo.");
  } finally {
    dlBusy = false;
    renderPanel();
  }
}

function openPanel() {
  state.armedGuest = null;
  $("panel").hidden = false; document.body.style.overflow = "hidden";
  renderPanel();
}
function closePanel() { $("panel").hidden = true; document.body.style.overflow = ""; }

/* ───────────────────────── arranque ───────────────────────── */

function showLanding(msg) {
  document.title = `${MARCA.nombre} · Álbum compartido del evento`;
  $("l-brand").textContent = MARCA.nombre;
  $("l-msg").textContent = msg;
  $("l-help").hidden = !MARCA.soporte;
  $("l-help").textContent = MARCA.soporte ? `¿Necesitas ayuda? Escríbenos: ${MARCA.soporte}` : "";
  showScreen("landing");
}

function enterAlbum() {
  showScreen("album");
  $("demo-banner").hidden = !backend.demo;
  renderMe(); renderClosed(); render(); refresh();
  backend.isAdmin().then((a) => { state.admin = a; renderAdmin(); }).catch(() => {});
  backend.subscribe(scheduleRefresh);
  setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
}

async function main() {
  const demo = !(SUPABASE_URL && SUPABASE_ANON_KEY);
  try { backend = demo ? demoBackend() : await supabaseBackend(); }
  catch (e) { console.error(e); return showLanding("No pudimos conectar con el álbum. Revisa tu conexión y vuelve a abrir el enlace."); }

  state.slug = demo ? "demo" : readSlug();
  if (!state.slug) return showLanding("Abre el enlace o escanea el código QR de tu invitación para entrar al álbum del evento.");

  try { state.event = await backend.eventInfo(state.slug); } catch (e) { console.error(e); }
  if (!state.event) return showLanding("No encontramos este evento. Revisa que el enlace esté completo o vuelve a escanear el código QR.");

  const q = new URLSearchParams(location.search);
  state.code = (q.get("c") || store.get(`album-code-${state.slug}`) || "").toUpperCase();
  fillEventText();

  state.me = await backend.session().catch(() => null);
  if (state.me) enterAlbum(); else showScreen("welcome");
}

/* ── eventos de la interfaz ── */
$("join").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("name-input").value.trim().replace(/\s+/g, " ");
  const code = $("code-input").value.trim().toUpperCase();
  if (!name) return;
  $("join-btn").disabled = true; $("join-err").hidden = true;
  try {
    state.me = await backend.join(name, code);
    if (code) { state.code = code; store.set(`album-code-${state.slug}`, code); }
    enterAlbum();
  } catch (err) {
    console.error(err);
    const bad = /codigo_incorrecto/.test(err?.message || "");
    $("join-err").textContent = bad
      ? "El código no coincide. Revísalo en tu invitación o en la tarjeta de la mesa."
      : "No pudimos crear tu usuario. Revisa tu conexión e intenta de nuevo.";
    $("join-err").hidden = false;
  } finally { $("join-btn").disabled = false; }
});
$("landing-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("landing-input").value.trim().toLowerCase().replace(/\s+/g, "-");
  if (v) location.href = `${location.pathname}?e=${encodeURIComponent(v)}`;
});

$("upload-btn").onclick = () => $("file").click();
$("file").onchange = (e) => { handleFiles(e.target.files); e.target.value = ""; };
$("f-all").onclick = () => setFilter("all");
$("f-mine").onclick = () => setFilter("mine");
$("v-close").onclick = closeViewer;
$("v-prev").onclick = () => step(-1);
$("v-next").onclick = () => step(1);
$("v-like").onclick = toggleLike;
$("v-del").onclick = deleteCurrent;
$("v-img").ondblclick = toggleLike;
document.addEventListener("keydown", (e) => {
  if ($("viewer").hidden) return;
  if (e.key === "Escape") closeViewer();
  if (e.key === "ArrowRight") step(1);
  if (e.key === "ArrowLeft") step(-1);
});
$("share-btn").onclick = openShare;
$("share-close").onclick = () => ($("share").hidden = true);
$("share").onclick = (e) => { if (e.target === $("share")) $("share").hidden = true; };
$("copy-btn").onclick = copyLink;
$("me-btn").onclick = () => { $("rename-input").value = state.me.name; $("profile").hidden = false; $("rename-input").focus(); };
$("profile-close").onclick = () => ($("profile").hidden = true);
$("profile").onclick = (e) => { if (e.target === $("profile")) $("profile").hidden = true; };
$("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("rename-input").value.trim().replace(/\s+/g, " "); if (!name) return;
  try { await backend.rename(name); state.me.name = name; renderMe(); $("profile").hidden = true; toast("Nombre actualizado"); refresh(); }
  catch (err) { console.error(err); toast("No se pudo cambiar el nombre."); }
});
$("admin-link").onclick = () => {
  $("profile").hidden = true; $("admin-err").hidden = true; $("admin-pin").value = "";
  $("admin-login").hidden = false; $("admin-pin").focus();
};
$("admin-cancel").onclick = () => ($("admin-login").hidden = true);
$("admin-login").onclick = (e) => { if (e.target === $("admin-login")) $("admin-login").hidden = true; };
$("admin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("admin-submit").disabled = true; $("admin-err").hidden = true;
  try {
    if (await backend.claimAdmin($("admin-pin").value)) {
      state.admin = true; await renderAdmin(); render();
      $("admin-login").hidden = true; openPanel();
    } else {
      $("admin-err").textContent = "Clave incorrecta. Revisa mayúsculas y espacios.";
      $("admin-err").hidden = false;
    }
  } catch (err) {
    console.error(err);
    $("admin-err").textContent = "No se pudo verificar la clave. Revisa tu conexión.";
    $("admin-err").hidden = false;
  } finally { $("admin-submit").disabled = false; }
});
$("panel-btn").onclick = openPanel;
$("panel-close").onclick = closePanel;
$("p-open-btn").onclick = toggleOpen;
$("p-share-btn").onclick = () => { closePanel(); openShare(); };

main();
