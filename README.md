# 📱 CV Scanner & Sender (PWA)

Aplicación Web Progresiva (**PWA**) mobile-first para capturar o subir imágenes de currículums, extraer automáticamente correos electrónicos mediante OCR con **Tesseract.js** en el cliente, y despachar el CV correspondiente almacenado en **Google Drive** a través de **Gmail**.

---

## 🚀 Características Principales

- **Instalación como App Nativa (PWA)**: Compatible con Chrome en Android y Safari en iOS. Se instala con su propio icono, pantalla completa e inicio independiente (sin barra de navegador).
- **Persistencia Local Segura (IndexedDB)**:
  - Si sales de la app, cierras la pestaña por error o reinicias el teléfono, **no se pierde nada**.
  - Las fotos capturadas en alta resolución, los recortes efectuados, los correos, teléfonos y direcciones detectadas se restauran instantáneamente al reabrir la app.
  - Almacenamiento local de gran capacidad sin los límites restrictivos de localStorage.
- **Detección de WhatsApp y Enlace Directo**:
  - Extrae números de teléfono fijos y móviles de Argentina e internacionales (`+54 9...`, `11...`, `15...`).
  - **Botón directo "Abrir WhatsApp"**: genera el link oficial `wa.me/549...` con saludo y presentación automática redactada a nombre de Luciano Bibbo. El celular te permite elegir si abrirlo con la app de WhatsApp o WhatsApp Web.
  - **Botón "Copiar Teléfono"**: copia el número al portapapeles con un solo toque.
- **Detección de Dirección Postal y Google Maps**:
  - Reconoce direcciones físicas (Calles, Avenidas, Pasajes y numeración catastral).
  - Si un aviso no tiene correo electrónico ni WhatsApp, o para ubicar físicamente el comercio / entrevista, provee un botón directo **"🗺️ Ver en Google Maps"** para navegar de inmediato.
- **Subida Dual (Cámara o Galería)**:
  - Botón directo para tomar foto con la cámara trasera.
  - Botón para explorar la galería de fotos o archivos locales (JPG, PNG, WEBP).
- **Herramienta Integrada de Recorte y Zoom (Cropper.js)**:
  - Permite hacer zoom táctil (pinch-to-zoom), rotar fotos tomadas de lado (-90° / +90°) y encuadrar con precisión quirúrgica el bloque de datos de contacto o email.
  - Botón directo "⚡ Recortar y Leer" para escanear instantáneamente la selección.
  - Opción para restablecer la foto original en cualquier momento.
- **OCR de Alta Precisión y Alcance (Dual-Pass Engine)**:
  - Utiliza **Tesseract.js v5** con worker en memoria compartido (reduce el tiempo de escaneo a solo ~1-2 segundos).
  - **Filtro de Enfoque por Convolución (Sharpening 3x3)**: elimina el desenfoque típico de cámaras móviles y destaca los bordes de letras finas.
  - **Normalización de Iluminación y Alto Contraste**: ecualiza sombras de celulares y convierte fondos grises a blanco puro con letras oscuras nítidas.
  - **Estrategia Dual-Pass**: si el primer análisis no detecta contactos, automáticamente realiza una segunda pasada con inversión de color (ideal para avisos en modo oscuro o volantes con fondo de color).
  - **Normalizador Heurístico Avanzado**:
    - Correos: repara variantes de `@` (`[at]`, `(at)`, `[arroba]`, `©`, `®`), espacios accidentales y extensiones (.con, .cpm -> .com).
    - Teléfonos / WhatsApp: normaliza confusión de letra `O` por cero `0` y reconoce prefijos argentinos (+54 9, 15, 011).
    - Direcciones: reconoce calles, avenidas, numeraciones, pisos, deptos y locales.
  - **Sugerencias Múltiples**: si el CV contiene más de un correo o teléfono, presenta botones interactivos (chips) para alternar el destinatario con un solo toque.
- **Backend Serverless con Google Apps Script**:
  - Consulta dinámica de categorías configuradas en Google Drive (`doGet`).
  - Despacho de correos vía GmailApp con adjunto automático (`doPost`).
  - **Detección inteligente de CV**: ordena por fecha de última modificación para enviar siempre la versión más reciente.
  - **Soporte multiformato**: admite archivos PDF, Word (DOCX/DOC) y convierte automáticamente Google Docs a PDF.
- **Seguridad**:
  - Validación estricta de formato de correo (RFC 5322).
  - Diálogo de confirmación previo al envío para prevenir errores tipográficos del OCR.
  - Sanitización contra inyección de cabeceras.
  - Soporte de token de seguridad opcional (`API_SECRET_TOKEN`).

---

## 📁 Estructura del Proyecto

```text
cv-scanner-pwa/
├── index.html        # Frontend PWA (interfaz mobile-first, OCR y configuración)
├── manifest.json     # Manifiesto PWA para instalación nativa en Android/iOS
├── sw.js             # Service Worker (caché offline y cumplimiento PWA)
├── Código.gs         # Backend para Google Apps Script (Drive + Gmail)
├── icons/            # Iconos de la aplicación en 192x192 y 512x512
└── README.md         # Documentación de instalación y uso
```

---

## 🛠️ Guía de Configuración Paso a Paso

### 1. Configurar el Backend en Google Apps Script
1. Abre [script.google.com](https://script.google.com/) y crea un nuevo proyecto.
2. Copia y pega el contenido del archivo [`Código.gs`](./Código.gs) en el editor.
3. En la constante `CARPETAS_DRIVE`, reemplaza `'ID_CARPETA_AQUI'` con los IDs reales de tus carpetas en Google Drive para cada categoría (el ID es la cadena alfanumérica al final de la URL de cada carpeta en Drive).
4. Edita la variable `NOMBRE_REMITENTE` con tu nombre real.
5. Haz clic en **Implementar > Nueva implementación**:
   - **Tipo**: Aplicación web.
   - **Ejecutar como**: *Yo (tu_cuenta@gmail.com)*.
   - **Quién tiene acceso**: *Cualquier persona* (necesario para recibir las peticiones de la PWA).
6. Presiona **Implementar**, autoriza los permisos de Drive y Gmail, y copia la **URL de la aplicación web** (termina en `/exec`).

### 2. Conectar la PWA con tu Backend
1. Abre la PWA en tu navegador.
2. Toca el icono de engranaje (**⚙️**) en la esquina superior derecha.
3. Pega la URL de tu Web App de Google Apps Script copiada en el paso anterior y presiona **Guardar URL**.
4. ¡Listo! Las categorías se sincronizarán con tu Drive y los envíos se procesarán automáticamente.

---

## 📲 Instalación en Celulares

### En Android (Google Chrome):
1. Abre la URL en Chrome.
2. Verás el botón **"Instalar App"** en la parte superior, o puedes tocar los tres puntos de Chrome y seleccionar **"Instalar aplicación"** / **"Agregar a la pantalla principal"**.
3. La aplicación se instalará como una app independiente con su icono en el escritorio.

### En iPhone / iOS (Safari):
1. Abre la URL en Safari.
2. Toca el botón **Compartir** (icono de cuadrado con flecha hacia arriba).
3. Selecciona **"Agregar al inicio"** (*Add to Home Screen*).
