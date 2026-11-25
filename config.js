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
