# MiFoto — álbumes compartidos para eventos

- Consola: https://jgg-ia.github.io/MiFoto/admin.html
- Álbum de un evento: `https://jgg-ia.github.io/MiFoto/?e=nombre-del-evento`

Desarrollado por **Julián García** · https://jgg-ia.github.io/portafolio/

Cada evento (XV, boda, cumpleaños…) tiene su propio álbum: los invitados escanean un QR,
escriben su nombre y suben fotos desde el celular. Todos ven el álbum común en vivo.
Un solo sitio y un solo proyecto de Supabase atienden a todos los clientes.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `app.js` | El álbum que usan los invitados |
| `admin.html`, `consola.js` | La **consola**: crear y administrar eventos |
| `config.js` | Nombre de la marca, conexión a Supabase |
| `supabase.sql` | Crea la base de datos, las reglas de seguridad y el almacenamiento |
| `_redirects` | Solo para Netlify: enlaces cortos `tusitio.com/valentina-xv` |

## Cómo se usa

### Crear un evento (tú, en la consola)
1. Abrir `admin.html` (por ejemplo `https://tusitio/admin.html`) y entrar con la **clave maestra**.
2. **＋ Nuevo evento** → tipo, nombre, subtítulo, fecha, lugar, mensaje y color.
   El nombre del enlace, el código para invitados y la clave del organizador se generan solos.
3. **Guardar** → aparece la ficha **Datos para el cliente**: QR, enlace, código y clave.
   **Copiar todo** y enviárselo al cliente. La clave del organizador se muestra una sola vez
   (si se pierde: **Editar → Generar nueva**).

### Invitados
Escanean el QR (ya trae el código), escriben su nombre y suben fotos.
Si alguien entra solo con el enlace, el álbum le pide el código.

### Quien organiza el evento (tu cliente)
En el álbum: tocar su nombre (arriba a la derecha) → **Soy quien organiza** → escribir la clave.
Aparece la corona con el panel: resumen, QR para compartir, **cerrar o abrir la recepción de fotos**,
descargar todo en .zip y borrar fotos.

### Desde la consola, por evento
Ver fotos e invitados, editar datos y colores, cerrar o abrir la recepción, abrir el álbum,
y **borrar el evento con todas sus fotos** (se confirma escribiendo el nombre del enlace).

## Seguridad y privacidad
- Las fotos son **privadas**: solo las ven los invitados del evento (enlaces firmados que vencen).
- Cada evento tiene su código; nadie entra solo adivinando el enlace.
- Las claves se comprueban en el servidor: la del organizador se guarda cifrada y la maestra
  en un esquema privado. Ninguna clave está en el código publicado.
- Las páginas piden a los buscadores no indexarse.

## Instalación desde cero (nuevo proyecto de Supabase)
1. Crear el proyecto en https://supabase.com.
2. **Authentication → Sign In / Providers** → activar **Allow anonymous sign-ins** → **Save changes**.
3. **SQL Editor** → pegar todo `supabase.sql` → **Run**.
4. En otra consulta, definir la clave maestra (mínimo 10 caracteres) y **Run**:
   `update privado.config set clave = 'TU-CLAVE-MAESTRA' where true;`
5. **Project Settings → API Keys** → copiar la URL del proyecto y la **Publishable key** (`sb_publishable_…`)
   en `config.js`. **Nunca** uses la **Secret key** (`sb_secret_…`).
6. Publicar los archivos en el hosting.

## Hosting
- **Netlify** (recomendado para uso comercial): arrastrar la carpeta en https://app.netlify.com/drop
  o conectar el repositorio de GitHub. Para enlaces cortos, poner `RUTAS_LIMPIAS = true` en `config.js`.
- **GitHub Pages**: sirve para pruebas; sus reglas no permiten usarlo para un servicio comercial.

## Límites del plan gratis de Supabase
1 GB de fotos (≈2.000 en total), 5 GB de descarga al mes, y el proyecto se pausa tras 1 semana sin uso.
Con clientes reales conviene el plan Pro (25 USD/mes): 100 GB de fotos, 250 GB de descarga, sin pausas.
Borra los eventos viejos desde la consola para liberar espacio.
