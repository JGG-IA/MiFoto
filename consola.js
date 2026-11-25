import { MARCA, SUPABASE_URL, SUPABASE_ANON_KEY, RUTAS_LIMPIAS } from "./config.js?v=7";

const $ = (id) => document.getElementById(id);
const COLORS = ["#A3195B", "#7A1F4E", "#C2185B", "#B8893B", "#1F6F78", "#2E4A8C", "#5B2A86", "#2F6B3A", "#8C3B2E", "#333333"];
const SAFE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin letras que se confunden (0/O, 1/I/L)
let sb, events = [], stats = new Map(), editing = null, newKey = "";

/* ── utilidades ── */
function toast(msg, ms = 2600) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}
function rand(n) {
  const a = new Uint32Array(n); crypto.getRandomValues(a);
  return [...a].map((x) => SAFE[x % SAFE.length]).join("");
}
const genCode = () => rand(6);
const genKey = () => `${rand(4)}-${rand(4)}-${rand(4)}`;
function slugify(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 41);
}
function albumBase() { return location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, ""); }
function albumUrl(slug, code) {
  const base = RUTAS_LIMPIAS ? `${location.origin}/${slug}` : `${albumBase()}?e=${encodeURIComponent(slug)}`;
  return code ? base + (base.includes("?") ? "&" : "?") + "c=" + encodeURIComponent(code) : base;
}
function fmtDate(d) {
  if (!d) return "Sin fecha";
  return new Date(d + "T12:00:00").toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}
function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s);
  });
}

/* ── arranque ── */
async function main() {
  $("brand").textContent = MARCA.nombre;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { $("loading").textContent = "Falta configurar Supabase en config.js."; return; }
  await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js");
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  let { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const r = await sb.auth.signInAnonymously();
    if (r.error) { $("loading").textContent = "No se pudo conectar. Revisa tu conexión y recarga la página."; return; }
  }
  const { data } = await sb.rpc("is_platform_admin");
  $("loading").hidden = true;
  if (data === true) showDash(); else $("login").hidden = false;
}

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-btn").disabled = true; $("login-err").hidden = true;
  const { data, error } = await sb.rpc("claim_platform_admin", { p_key: $("master").value });
  $("login-btn").disabled = false;
  if (error || data !== true) {
    $("login-err").textContent = error ? "No se pudo verificar. Revisa tu conexión." : "Clave incorrecta.";
    $("login-err").hidden = false; return;
  }
  $("login").hidden = true; showDash();
});

/* ── lista ── */
async function showDash() {
  $("dash").hidden = false; $("new-btn").hidden = false;
  await loadEvents();
}
async function loadEvents() {
  const [ev, st] = await Promise.all([
    sb.from("events").select("*").order("fecha", { ascending: false, nullsFirst: true }),
    sb.rpc("event_stats"),
  ]);
  if (ev.error) { toast("No se pudieron cargar los eventos."); console.error(ev.error); return; }
  events = ev.data;
  stats = new Map((st.data || []).map((s) => [s.event_id, s]));
  renderEvents();
}
function renderEvents() {
  const box = $("events"); box.replaceChildren();
  $("no-events").hidden = events.length > 0;
  let fotos = 0; stats.forEach((s) => (fotos += Number(s.fotos)));
  $("totals").textContent = `${events.length} ${events.length === 1 ? "evento" : "eventos"} · ${fotos.toLocaleString("es")} ${fotos === 1 ? "foto" : "fotos"}`;
  for (const e of events) {
    const s = stats.get(e.id) || { fotos: 0, invitados: 0, codigo: null };
    const card = document.createElement("article"); card.className = "ev";
    card.style.setProperty("--d", box.children.length);
    const head = document.createElement("div"); head.className = "ev-head";
    const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = e.color;
    const t = document.createElement("div"); t.className = "ev-t";
    const b = document.createElement("b"); b.textContent = e.nombre;
    const sp = document.createElement("span"); sp.textContent = `${e.tipo} · ${fmtDate(e.fecha)}${e.lugar ? " · " + e.lugar : ""}`;
    t.append(b, sp);
    const pill = document.createElement("span"); pill.className = "pill " + (e.abierto ? "on" : "off");
    pill.textContent = e.abierto ? "Recibe fotos" : "Cerrado";
    head.append(dot, t, pill);

    const nums = document.createElement("div"); nums.className = "ev-nums";
    const n1 = document.createElement("span"); const n1b = document.createElement("b"); n1b.textContent = Number(s.fotos).toLocaleString("es"); n1.append(n1b, Number(s.fotos) === 1 ? " foto" : " fotos");
    const n2 = document.createElement("span"); const n2b = document.createElement("b"); n2b.textContent = Number(s.invitados).toLocaleString("es"); n2.append(n2b, Number(s.invitados) === 1 ? " invitado" : " invitados");
    const n3 = document.createElement("span"); n3.textContent = s.codigo ? `Código ${s.codigo}` : "Sin código";
    nums.append(n1, n2, n3);

    const sl = document.createElement("div"); sl.className = "ev-slug"; sl.textContent = albumUrl(e.slug);

    const act = document.createElement("div"); act.className = "ev-actions";
    const mk = (label, cls, fn) => { const x = document.createElement("button"); x.className = "btn btn-sm " + cls; x.textContent = label; x.onclick = fn; act.append(x); return x; };
    mk("Datos para el cliente", "btn-primary", () => openDeliver(e, s.codigo, ""));
    mk("Editar", "btn-ghost", () => openEditor(e, s.codigo));
    mk(e.abierto ? "Cerrar recepción" : "Abrir recepción", "btn-ghost", () => toggleOpen(e));
    const open = document.createElement("a"); open.className = "btn btn-sm btn-ghost"; open.textContent = "Ver álbum";
    open.href = albumUrl(e.slug, s.codigo); open.target = "_blank"; open.rel = "noopener"; act.append(open);
    mk("Borrar", "btn-ghost", () => openDelete(e, s));

    card.append(head, nums, sl, act);
    box.append(card);
  }
}

async function toggleOpen(e) {
  const { error } = await sb.rpc("set_event_open", { p_event: e.id, p_open: !e.abierto });
  if (error) { toast("No se pudo cambiar."); return; }
  toast(e.abierto ? "Recepción cerrada" : "Recepción abierta");
  loadEvents();
}

/* ── editor ── */
function renderSwatches(selected) {
  const box = $("swatches"); box.replaceChildren();
  for (const c of COLORS) {
    const b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.style.background = c;
    b.setAttribute("aria-label", "Color " + c); b.setAttribute("aria-pressed", String(c.toLowerCase() === selected.toLowerCase()));
    b.onclick = () => { $("f-color").value = c; renderSwatches(c); updatePreview(); };
    box.append(b);
  }
  let input = $("f-color");
  if (!input) { input = document.createElement("input"); input.type = "color"; input.id = "f-color"; input.title = "Otro color"; }
  input.value = selected; input.oninput = () => { renderSwatches(input.value); updatePreview(); };
  box.append(input);
}
function updatePreview() {
  $("pv").style.setProperty("--pv", $("f-color").value);
  $("pv-tipo").textContent = $("f-tipo").value;
  $("pv-nombre").textContent = $("f-nombre").value || "Nombre";
  $("pv-titulo").textContent = $("f-titulo").value;
  const parts = [];
  if ($("f-fecha").value) parts.push(fmtDate($("f-fecha").value));
  if ($("f-lugar").value) parts.push($("f-lugar").value);
  $("pv-meta").textContent = parts.join(" · ");
  $("slug-preview").textContent = $("f-slug").value ? albumUrl($("f-slug").value) : "";
  $("code-field").hidden = !$("f-usecode").checked;
}
let slugTouched = false;
function autoSlug() {
  if (slugTouched) return;
  $("f-slug").value = slugify(`${$("f-nombre").value} ${$("f-etiqueta").value || $("f-tipo").value}`);
}

function openEditor(e, code) {
  editing = e || null;
  slugTouched = !!e;
  $("ed-title").textContent = e ? e.nombre : "Nuevo evento";
  $("f-tipo").value = e?.tipo || "Quince años";
  $("f-nombre").value = e?.nombre || "";
  $("f-titulo").value = e?.titulo || "";
  $("f-etiqueta").value = e?.etiqueta ?? "XV";
  $("f-fecha").value = e?.fecha || "";
  $("f-lugar").value = e?.lugar || "";
  $("f-mensaje").value = e?.mensaje || "";
  $("f-slug").value = e?.slug || "";
  $("f-usecode").checked = e ? !!code : true;
  $("f-codigo").value = code || genCode();
  newKey = e ? "" : genKey();
  $("f-clave").value = newKey;
  $("ed-err").hidden = true;
  renderSwatches(e?.color || COLORS[0]);
  updatePreview();
  $("editor").hidden = false; document.body.style.overflow = "hidden";
  $("f-nombre").focus();
}
function closeEditor() { $("editor").hidden = true; document.body.style.overflow = ""; }

$("new-btn").onclick = () => openEditor(null, "");
$("ed-cancel").onclick = closeEditor;
$("ed-cancel2").onclick = closeEditor;
$("gen-code").onclick = () => { $("f-codigo").value = genCode(); };
$("gen-key").onclick = () => { newKey = genKey(); $("f-clave").value = newKey; };
$("f-slug").addEventListener("input", () => { slugTouched = true; $("f-slug").value = slugify($("f-slug").value); updatePreview(); });
for (const id of ["f-tipo", "f-nombre", "f-titulo", "f-etiqueta", "f-fecha", "f-lugar", "f-usecode"]) {
  $(id).addEventListener("input", () => { if (id === "f-nombre" || id === "f-etiqueta" || id === "f-tipo") autoSlug(); updatePreview(); });
}

$("ed-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const row = {
    tipo: $("f-tipo").value, nombre: $("f-nombre").value.trim(), titulo: $("f-titulo").value.trim(),
    etiqueta: $("f-etiqueta").value.trim(), fecha: $("f-fecha").value || null, lugar: $("f-lugar").value.trim(),
    mensaje: $("f-mensaje").value.trim(), color: $("f-color").value, slug: $("f-slug").value,
  };
  const code = $("f-usecode").checked ? $("f-codigo").value.trim().toUpperCase() : "";
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(row.slug)) return showErr("El nombre del enlace debe tener al menos 3 letras o números, sin espacios ni tildes.");
  if ($("f-usecode").checked && code.length < 4) return showErr("El código para invitados debe tener al menos 4 caracteres.");
  $("ed-save").disabled = true; $("ed-err").hidden = true;
  try {
    let id = editing?.id;
    if (editing) {
      const { error } = await sb.from("events").update(row).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from("events").insert(row).select("id").single();
      if (error) throw error;
      id = data.id;
    }
    const { error: e2 } = await sb.rpc("set_event_secrets", { p_event: id, p_codigo: code, p_clave: newKey || null });
    if (e2) throw e2;
    closeEditor();
    await loadEvents();
    const saved = events.find((x) => x.id === id);
    openDeliver(saved, code, newKey);
    newKey = "";
  } catch (err) {
    console.error(err);
    showErr(/duplicate|unique/i.test(err?.message || "") ? "Ese nombre de enlace ya lo usa otro evento. Elige otro." : "No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
  } finally { $("ed-save").disabled = false; }
});
function showErr(m) { $("ed-err").textContent = m; $("ed-err").hidden = false; }

/* ── datos para el cliente ── */
let deliverText = "";
function openDeliver(e, code, key) {
  const url = albumUrl(e.slug, code);
  $("dl-link").textContent = url;
  $("dl-code-row").hidden = !code; $("dl-code").textContent = code || "";
  $("dl-key-row").hidden = !key; $("dl-key-warn").hidden = !key; $("dl-key").textContent = key || "";
  $("dl-open").href = url;
  const q = window.qrcode(0, "M"); q.addData(url); q.make();
  $("dl-qr").innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  deliverText = [
    `Álbum de fotos: ${e.nombre}${e.titulo ? " · " + e.titulo : ""}`,
    `Enlace para invitados: ${url}`,
    code ? `Código del álbum: ${code}` : "",
    key ? `Clave del organizador (no compartir con invitados): ${key}` : "",
    key ? `Para entrar al panel: abrir el álbum, tocar tu nombre arriba a la derecha → "Soy quien organiza" → escribir la clave.` : "",
  ].filter(Boolean).join("\n");
  $("deliver").hidden = false;
}
$("dl-copy").onclick = async () => {
  try { await navigator.clipboard.writeText(deliverText); toast("Datos copiados"); }
  catch { toast("No se pudo copiar automáticamente; selecciona el texto a mano."); }
};
$("dl-close").onclick = () => ($("deliver").hidden = true);
$("deliver").onclick = (e) => { if (e.target === $("deliver")) $("deliver").hidden = true; };

/* ── borrar evento ── */
let deleting = null;
function openDelete(e, s) {
  deleting = e;
  $("del-n").textContent = Number(s.fotos).toLocaleString("es");
  $("del-slug").textContent = e.slug;
  $("del-input").value = ""; $("del-go").disabled = true; $("del-prog").textContent = "";
  $("del").hidden = false; $("del-input").focus();
}
$("del-input").addEventListener("input", () => { $("del-go").disabled = $("del-input").value.trim() !== deleting?.slug; });
$("del-cancel").onclick = () => ($("del").hidden = true);
$("del-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if ($("del-input").value.trim() !== deleting.slug) return;
  $("del-go").disabled = true; $("del-cancel").disabled = true;
  try {
    const { data: photos, error } = await sb.from("photos").select("path,thumb_path").eq("event_id", deleting.id).limit(10000);
    if (error) throw error;
    const paths = photos.flatMap((p) => [p.path, p.thumb_path]);
    for (let i = 0; i < paths.length; i += 100) {
      $("del-prog").textContent = `Borrando archivos… ${Math.min(i + 100, paths.length)} de ${paths.length}`;
      const r = await sb.storage.from("fotos").remove(paths.slice(i, i + 100));
      if (r.error) throw r.error;
    }
    const { error: e2 } = await sb.from("events").delete().eq("id", deleting.id);
    if (e2) throw e2;
    $("del").hidden = true; toast("Evento borrado"); loadEvents();
  } catch (err) {
    console.error(err); $("del-prog").textContent = "No se pudo terminar de borrar. Intenta de nuevo.";
  } finally { $("del-cancel").disabled = false; }
});

main();
