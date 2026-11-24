# Álbum de la Fiesta — XV de Valentina

App web para que los invitados suban sus fotos y todos vean el álbum común, en vivo, desde el celular.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Pantallas y diseño |
| `app.js` | Lógica: registro, subida, visor, me gusta, QR |
| `config.js` | **Lo único que se edita por fiesta**: nombre, fecha, lugar, mensaje y la conexión a Supabase |
| `supabase.sql` | Crea la base de datos y el almacenamiento de fotos |
| `serve.js` | Servidor para probar en la computadora (`node serve.js`) |

Sin datos de Supabase la app corre en **modo demo** (fotos solo en ese dispositivo).

## Poner la app en línea para la fiesta (≈15 minutos, gratis)

### 1. Base de datos y fotos (Supabase)
1. Crear una cuenta en https://supabase.com y un proyecto nuevo (plan Free).
2. **Authentication → Sign In / Providers** → activar **Allow anonymous sign-ins**.
   (Así cada invitado "crea su usuario" solo con su nombre, sin email ni contraseña.)
3. **SQL Editor** → pegar todo `supabase.sql`.
4. Ahí mismo, en el editor, reemplazar `'CAMBIA-ESTA-CLAVE'` por la **clave de la organizadora**
   (mínimo 10 caracteres) y tocar **Run**.
   ⚠ No escribas la clave en el archivo `supabase.sql` del repositorio: GitHub lo muestra públicamente.
5. **Project Settings → API** → copiar **Project URL** y la clave **anon public**
   y pegarlas en `config.js` (`SUPABASE_URL` y `SUPABASE_ANON_KEY`).
   La clave *anon* es pública por diseño; la seguridad la dan las reglas del SQL.
   **Nunca** pegues la clave `service_role`.

### 2. Publicar la página (GitHub Pages)
1. En https://github.com/new crear un repositorio **público** (p. ej. `album-xv`).
2. En el repositorio: **Add file → Upload files** → arrastrar `index.html`, `app.js`, `config.js`,
   `supabase.sql`, `LEEME.md` y `.nojekyll` → **Commit changes**.
3. **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)` → **Save**.
4. En 1–2 minutos queda en `https://TU-USUARIO.github.io/album-xv/`.

Para cambiar algo después (por ejemplo pegar los datos de Supabase en `config.js`):
abrir el archivo en GitHub → ícono del lápiz → editar → **Commit changes**. La página se actualiza sola en 1–2 minutos.

### 3. En la fiesta
- Abrir el álbum, tocar el ícono de QR arriba y mostrar o imprimir el código en las mesas.
- Cada invitado escanea, escribe su nombre y sube fotos (cámara o galería, varias a la vez).

## Cómo funciona
- Las fotos se achican en el celular antes de subir (máx. 2048 px + miniatura de 480 px): suben rápido y ocupan ~400 KB.
  El plan gratis de Supabase (1 GB) alcanza para unas 2.000 fotos.
- Todos ven todas las fotos; cada uno puede borrar solo las suyas.
- El usuario queda guardado en el celular: si cierra y vuelve a abrir, entra directo.
- Las fotos nuevas aparecen solas en todos los celulares.

## Para otra fiesta
Crear otro proyecto de Supabase (o vaciar las tablas), cambiar `config.js` y volver a publicar.

## Panel de la organizadora
1. En el álbum, tocar tu nombre (arriba a la derecha) → **Soy la organizadora** → escribir la clave.
2. Ese celular queda como organizador para siempre y aparece el ícono de **corona** arriba.

Desde el panel se puede:
- Ver el resumen: fotos, invitados y "me gusta".
- **Descargar todo el álbum** en .zip, en tamaño completo y ordenado por hora
  (`0001_2215_Tia-Marta.jpg`). Si hay más de 150 fotos, se divide en partes de 150.
- Ver cuántas fotos subió cada invitado y **borrar todas las de una persona** (hay que tocar dos veces para confirmar).
- Borrar **cualquier foto puntual** desde el visor (el botón Borrar aparece en todas).

La clave se comprueba en el servidor; no aparece en el código de la página.
Si hay que cambiarla después: en el SQL Editor ejecutar
`update privado.config set clave = 'NUEVA-CLAVE';`

En modo demo la clave es `1234`.
