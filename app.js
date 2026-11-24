import { EVENTO, SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const $ = (id) => document.getElementById(id);
const FULL_MAX = 2048;   // lado mayor de la foto guardada (px)
const THUMB_MAX = 480;   // lado mayor de la miniatura (px)

const state = {
  me: null,            // {id, name}
  photos: [],          // [{id,userId,name,url,thumb,createdAt}]
  likes: new Map(),    // photoId -> Set(userId)
  filter: "all",
  current: -1,         // índice en la lista visible
  pending: [],         // subidas en curso [{key, thumb, p}]
  admin: false,        // este celular es de la organizadora
  armedGuest: null,    // invitado cuyo "borrar todo" espera confirmación
};
const ZIP_PART = 150;  // fotos por archivo .zip (≈60 MB cada uno)
let backend;

/* ───────────────────────── utilidades ───────────────────────── */

function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
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
function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error("No se pudo cargar " + src));
    document.head.appendChild(s);
  });
}

/* Reduce la foto en el celular antes de subirla: sube rápido aunque la señal sea mala. */
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

/* ───────────────────────── backend: Supabase ───────────────────────── */

async function supabaseBackend() {
  await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js");
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const bucket = sb.storage.from("fotos");
  const pub = (p) => bucket.getPublicUrl(p).data.publicUrl;
  const map = (r) => ({
    id: r.id, userId: r.user_id, name: r.guests?.name || "Invitado",
    url: pub(r.path), thumb: pub(r.thumb_path), path: r.path, thumbPath: r.thumb_path,
    download: bucket.getPublicUrl(r.path, { download: `fiesta-${r.id.slice(0, 8)}.jpg` }).data.publicUrl,
    createdAt: r.created_at,
  });
  const uid = async () => (await sb.auth.getSession()).data.session?.user.id;

  return {
    demo: false,
    async session() {
      const id = await uid(); if (!id) return null;
      const { data } = await sb.from("guests").select("name").eq("id", id).maybeSingle();
      return data ? { id, name: data.name } : null;
    },
    async register(name) {
      let id = await uid();
      if (!id) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        id = data.user.id;
      }
      const { error } = await sb.from("guests").upsert({ id, name });
      if (error) throw error;
      return { id, name };
    },
    async rename(name) {
      const { error } = await sb.from("guests").update({ name }).eq("id", state.me.id);
      if (error) throw error;
    },
    async isAdmin() {
      const { data } = await sb.from("admins").select("user_id").eq("user_id", state.me.id).maybeSingle();
      return !!data;
    },
    async claimAdmin(pin) {
      const { data, error } = await sb.rpc("claim_admin", { pin });
      if (error) throw error;
      return data === true;
    },
    async list() {
      const [p, l] = await Promise.all([
        sb.from("photos").select("id,user_id,path,thumb_path,created_at,guests!photos_user_id_fkey(name)").order("created_at", { ascending: false }).limit(2000),
        sb.from("likes").select("photo_id,user_id").limit(20000),
      ]);
      if (p.error) throw p.error;
      return { photos: p.data.map(map), likes: l.data || [] };
    },
    async upload(full, thumb, onProgress) {
      const id = crypto.randomUUID();
      const base = `${state.me.id}/${id}`;
      const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
      let r = await bucket.upload(`${base}.jpg`, full.blob, opts); if (r.error) throw r.error;
      onProgress(0.85);
      r = await bucket.upload(`${base}_t.jpg`, thumb.blob, opts); if (r.error) throw r.error;
      const { error } = await sb.from("photos").insert({
        id, user_id: state.me.id, path: `${base}.jpg`, thumb_path: `${base}_t.jpg`, width: full.w, height: full.h,
      });
      if (error) throw error;
    },
    async remove(p) {
      const { error } = await sb.from("photos").delete().eq("id", p.id);
      if (error) throw error;
      await bucket.remove([p.path, p.thumbPath]);
    },
    async like(photoId, on) {
      const q = on
        ? sb.from("likes").insert({ photo_id: photoId, user_id: state.me.id })
        : sb.from("likes").delete().eq("photo_id", photoId).eq("user_id", state.me.id);
      const { error } = await q; if (error) throw error;
    },
    subscribe(onChange) {
      sb.channel("album")
        .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, onChange)
        .subscribe();
    },
  };
}

/* ───────────────────────── backend: modo demo (local) ───────────────────────── */

function demoBackend() {
  const store = { photos: [], likes: [] };
  const samples = [
    ["Ejemplo · Sofi", ["#A3195B", "#F0659F"], "Vals"],
    ["Ejemplo · Tío Juan", ["#B8893B", "#F3D9A4"], "Brindis"],
    ["Ejemplo · Abuela Rosa", ["#5B2A86", "#C79BE8"], "Torta"],
    ["Ejemplo · Sofi", ["#1F6F78", "#8FD3CF"], "Pista"],
    ["Ejemplo · Mateo", ["#7A1E2E", "#E58C8A"], "Entrada"],
    ["Ejemplo · Tío Juan", ["#2E3A87", "#9AA8F0"], "Mesa 4"],
  ];
  samples.forEach(([name, [a, b], label], i) => {
    const c = document.createElement("canvas"); c.width = c.height = 600;
    const g = c.getContext("2d"); const gr = g.createLinearGradient(0, 0, 600, 600);
    gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, 600, 600);
    g.fillStyle = "rgba(255,255,255,.9)"; g.font = "600 54px Outfit, sans-serif"; g.textAlign = "center";
    g.fillText(label, 300, 300); g.font = "400 26px Outfit, sans-serif"; g.fillText("foto de ejemplo", 300, 345);
    const url = c.toDataURL("image/jpeg", 0.8);
    store.photos.push({ id: "s" + i, userId: "demo-" + name, name, url, thumb: url, download: url,
      createdAt: new Date(Date.now() - (i + 1) * 7 * 60000).toISOString() });
  });
  store.likes.push({ photo_id: "s0", user_id: "x1" }, { photo_id: "s0", user_id: "x2" }, { photo_id: "s2", user_id: "x1" });
  let listener = () => {};
  const key = "albumxv-demo-me";
  const read = () => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };

  return {
    demo: true,
    async session() { return read(); },
    async register(name) { const me = { id: "u" + Math.random().toString(36).slice(2), name }; write(me); return me; },
    async rename(name) {
      write({ ...state.me, name });
      store.photos.forEach((p) => { if (p.userId === state.me.id) p.name = name; });
    },
    async isAdmin() { try { return localStorage.getItem(key + "-admin") === "1"; } catch { return false; } },
    async claimAdmin(pin) {   // en modo demo la clave es 1234
      if (pin !== "1234") return false;
      try { localStorage.setItem(key + "-admin", "1"); } catch {}
      return true;
    },
    async list() { return { photos: [...store.photos], likes: [...store.likes] }; },
    async upload(full, thumb, onProgress) {
      await new Promise((r) => setTimeout(r, 400)); onProgress(0.85);
      const url = URL.createObjectURL(full.blob);
      store.photos.unshift({ id: crypto.randomUUID(), userId: state.me.id, name: state.me.name, url,
        thumb: URL.createObjectURL(thumb.blob), download: url, createdAt: new Date().toISOString() });
    },
    async remove(p) { store.photos = store.photos.filter((x) => x.id !== p.id); },
    async like(photoId, on) {
      store.likes = store.likes.filter((l) => !(l.photo_id === photoId && l.user_id === state.me.id));
      if (on) store.likes.push({ photo_id: photoId, user_id: state.me.id });
    },
    subscribe(fn) { listener = fn; },
  };
}

/* ───────────────────────── datos ───────────────────────── */

async function refresh() {
  try {
    const { photos, likes } = await backend.list();
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

function fillEventText() {
  document.title = `${EVENTO.nombre} · ${EVENTO.titulo}`;
  $("w-name").textContent = EVENTO.nombre;
  $("a-name").textContent = EVENTO.nombre;
  $("w-title").textContent = EVENTO.titulo;
  $("w-msg").textContent = EVENTO.mensaje || "";
  const parts = [];
  if (EVENTO.fecha) {
    const d = new Date(EVENTO.fecha + "T12:00:00");
    parts.push(d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }
  if (EVENTO.lugar) parts.push(EVENTO.lugar);
  $("w-meta").textContent = parts.join(" · ");
}

function renderMe() {
  $("me-name").textContent = state.me.name;
  $("me-av").textContent = initials(state.me.name);
  $("me-av").style.background = colorFor(state.me.id);
}

function render() {
  const list = visible();
  const guests = new Set(state.photos.map((p) => p.userId)).size;
  const n = state.photos.length;
  $("stats").innerHTML = "";
  const b1 = document.createElement("b"); b1.textContent = n;
  const b2 = document.createElement("b"); b2.textContent = guests;
  $("stats").append(b1, n === 1 ? " foto · " : " fotos · ", b2, guests === 1 ? " invitado" : " invitados");

  const grid = $("grid");
  const frag = document.createDocumentFragment();
  for (const u of state.pending) {
    const t = document.createElement("div"); t.className = "tile pending"; t.style.setProperty("--p", u.p);
    const img = document.createElement("img"); img.src = u.thumb; img.alt = "Subiendo…"; t.append(img);
    frag.append(t);
  }
  list.forEach((p, i) => {
    const t = document.createElement("button"); t.className = "tile";
    t.setAttribute("aria-label", `Foto de ${p.name}`);
    const img = document.createElement("img"); img.src = p.thumb; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
    img.onerror = () => { img.style.visibility = "hidden"; };
    const who = document.createElement("span"); who.className = "who"; who.textContent = p.name;
    t.append(img, who);
    const c = state.likes.get(p.id)?.size || 0;
    if (c) { const h = document.createElement("span"); h.className = "hearts"; h.textContent = "♥ " + c; t.append(h); }
    t.onclick = () => openViewer(i);
    frag.append(t);
  });
  grid.replaceChildren(frag);

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

/* ── Organizadora ── */
function renderAdmin() {
  $("panel-btn").hidden = !state.admin;
  $("admin-link").hidden = state.admin;
}

function slug(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "foto";
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
    const all = [...state.photos].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const slice = all.slice(k * ZIP_PART, (k + 1) * ZIP_PART);
    const zip = new window.JSZip();
    const queue = slice.map((p, i) => ({ p, n: k * ZIP_PART + i + 1 }));
    let done = 0, fail = 0;
    progress(0, `Descargando 0 de ${slice.length}…`);
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
        progress(done / slice.length, `Descargando ${done} de ${slice.length}…`);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    progress(1, "Armando el archivo .zip…");
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(EVENTO.nombre)}-${slug(EVENTO.titulo)}${parts > 1 ? `-parte-${k + 1}` : ""}.zip`;
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
  // de a dos en paralelo para no saturar el celular
  const queue = list.map((file) => ({ file, key: Math.random(), p: 0, thumb: "" }));
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
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (queue.length) await run(queue.shift());
  });
  await Promise.all(workers);
  await refresh();
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
  // precarga la siguiente
  const nx = list[state.current + 1]; if (nx) new Image().src = nx.url;
}
function step(d) { const n = visible().length; if (!n) return; state.current = (state.current + d + n) % n; resetDelete(); showCurrent(); }

async function toggleLike() {
  const p = visible()[state.current]; if (!p) return;
  if (!state.likes.has(p.id)) state.likes.set(p.id, new Set());
  const set = state.likes.get(p.id); const on = !set.has(state.me.id);
  on ? set.add(state.me.id) : set.delete(state.me.id);
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

/* gestos: deslizar para cambiar de foto, hacia abajo para cerrar */
let sx = 0, sy = 0;
$("v-stage").addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
$("v-stage").addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  else if (dy > 90) closeViewer();
});

/* ── Compartir ── */
function openShare() {
  const url = location.href.split("#")[0];
  $("share-link").value = url;
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

/* ───────────────────────── arranque ───────────────────────── */

function enterAlbum() {
  $("welcome").hidden = true; $("album").hidden = false;
  $("demo-banner").hidden = !backend.demo;
  renderMe(); render(); refresh();
  backend.isAdmin().then((a) => { state.admin = a; renderAdmin(); }).catch(() => {});
  backend.subscribe(scheduleRefresh);
  // respaldo por si la conexión en tiempo real se corta
  setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
}

async function main() {
  fillEventText();
  try { backend = SUPABASE_URL && SUPABASE_ANON_KEY ? await supabaseBackend() : demoBackend(); }
  catch (e) { console.error(e); backend = demoBackend(); }

  state.me = await backend.session().catch(() => null);
  if (state.me) enterAlbum(); else { $("welcome").hidden = false; }

  $("join").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("name-input").value.trim().replace(/\s+/g, " ");
    if (!name) return;
    $("join-btn").disabled = true; $("join-err").hidden = true;
    try { state.me = await backend.register(name); enterAlbum(); }
    catch (err) {
      console.error(err);
      $("join-err").textContent = "No pudimos crear tu usuario. Revisa tu conexión e intenta de nuevo.";
      $("join-err").hidden = false;
    } finally { $("join-btn").disabled = false; }
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
        state.admin = true; renderAdmin(); render();
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
  $("profile").onclick = (e) => { if (e.target === $("profile")) $("profile").hidden = true; };
  $("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("rename-input").value.trim().replace(/\s+/g, " "); if (!name) return;
    try { await backend.rename(name); state.me.name = name; renderMe(); $("profile").hidden = true; toast("Nombre actualizado"); refresh(); }
    catch (err) { console.error(err); toast("No se pudo cambiar el nombre."); }
  });
}

main();
