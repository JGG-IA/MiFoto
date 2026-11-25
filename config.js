// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN DE LA PLATAFORMA
//  Los eventos (nombre, fecha, colores, códigos) se crean en la
//  consola: admin.html. Aquí solo va lo que es igual para todos.
// ─────────────────────────────────────────────────────────────
export const MARCA = {
  nombre: "MiFoto",           // nombre de la plataforma: portada, pestañas y consola
  soporte: "",                // opcional: teléfono o WhatsApp de ayuda que verán los invitados
};

// Conexión a Supabase. Si quedan vacíos, la app corre en MODO DEMO.
export const SUPABASE_URL = "https://tmutsqhtyheemnvwwcfp.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_pc2ykwhYbkMVFqWDzOlaLw_VNri9BRq"; // clave pública: es seguro que esté en la página

// true solo si el hosting reescribe rutas (Netlify con el archivo _redirects):
// permite enlaces tipo  tusitio.com/valentina-xv  además de  tusitio.com/?e=valentina-xv
export const RUTAS_LIMPIAS = false;

// Evento de ejemplo para el modo demo
export const EVENTO_DEMO = {
  id: "demo", slug: "demo", tipo: "Quince años", nombre: "Valentina", etiqueta: "XV", titulo: "Mis XV",
  fecha: "2026-12-12", lugar: "Salón Los Jazmines", color: "#A3195B", abierto: true, requiere_codigo: false,
  mensaje: "Gracias por acompañarme en esta noche. Sube tus fotos y armemos juntos el álbum de la fiesta.",
};

// Fuentes para el nombre del evento (estilo tarjeta de invitación).
// "escala" ajusta el tamaño: las caligráficas se ven más pequeñas que las de molde.
export const FUENTES = [
  { nombre: "Pinyon Script",      estilo: "Caligráfica elegante", css: '"Pinyon Script", cursive',          escala: 1 },
  { nombre: "Great Vibes",        estilo: "Caligráfica fluida",   css: '"Great Vibes", cursive',            escala: 1 },
  { nombre: "Parisienne",         estilo: "Caligráfica clásica",  css: '"Parisienne", cursive',             escala: 0.9 },
  { nombre: "Alex Brush",         estilo: "Pincel",               css: '"Alex Brush", cursive',             escala: 1 },
  { nombre: "Allura",             estilo: "Caligráfica suave",    css: '"Allura", cursive',                 escala: 1.05 },
  { nombre: "Dancing Script",     estilo: "Manuscrita alegre",    css: '"Dancing Script", cursive',         escala: 0.8 },
  { nombre: "Sacramento",         estilo: "Trazo fino",           css: '"Sacramento", cursive',             escala: 1.05 },
  { nombre: "Playfair Display",   estilo: "Serif editorial",      css: '"Playfair Display", Georgia, serif', escala: 0.62 },
  { nombre: "Cormorant Garamond", estilo: "Serif romántica",      css: '"Cormorant Garamond", Georgia, serif', escala: 0.7 },
  { nombre: "Cinzel",             estilo: "Romana de lujo",       css: '"Cinzel", Georgia, serif',          escala: 0.5 },
  { nombre: "Cinzel Decorative",  estilo: "Romana ornamental",    css: '"Cinzel Decorative", Georgia, serif', escala: 0.48 },
  { nombre: "Abril Fatface",      estilo: "Moderna gruesa",       css: '"Abril Fatface", Georgia, serif',   escala: 0.58 },
  { nombre: "Montserrat",         estilo: "Moderna limpia",       css: '"Montserrat", system-ui, sans-serif', escala: 0.5 },
];

/* Carga una fuente de Google Fonts solo cuando se necesita. */
export function cargarFuente(nombre) {
  const f = FUENTES.find((x) => x.nombre === nombre) || FUENTES[0];
  const id = "font-" + f.nombre.replace(/\s+/g, "-");
  if (!document.getElementById(id)) {
    const l = document.createElement("link");
    l.id = id; l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${f.nombre.replace(/\s+/g, "+")}&display=swap`;
    document.head.append(l);
  }
  return f;
}