// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN DE LA FIESTA
//  Cambia estos datos para cada evento.
// ─────────────────────────────────────────────────────────────
export const EVENTO = {
  nombre: "Valentina",            // nombre de la quinceañera
  titulo: "Mis XV",               // aparece debajo del nombre
  fecha: "2026-12-12",            // AAAA-MM-DD
  lugar: "Salón Los Jazmines",    // opcional, puede quedar ""
  mensaje: "Gracias por acompañarme en esta noche. Sube tus fotos y armemos juntos el álbum de la fiesta.",
};

// ─────────────────────────────────────────────────────────────
//  CONEXIÓN A SUPABASE (base de datos + almacenamiento de fotos)
//  Si estos dos valores quedan vacíos, la app funciona en
//  MODO DEMO: las fotos quedan solo en ese dispositivo y se
//  pierden al recargar. Ver LEEME.md para crear el proyecto.
// ─────────────────────────────────────────────────────────────
export const SUPABASE_URL = "";       // ej: "https://abcd1234.supabase.co"
export const SUPABASE_ANON_KEY = "";  // la clave "anon public" del proyecto
