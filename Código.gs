/**
 * ====================================================================
 * PROYECTO: CV Scanner & Sender - API Backend (Google Apps Script)
 * ARCHIVO: Código.gs
 * ====================================================================
 * 
 * Backend seguro y robusto para la PWA:
 * 1. doGet(): Consulta de categorías dinámicas en JSON.
 * 2. doPost(): Envío del CV por Gmail con adjunto de Drive.
 * 3. Seguridad: Sanitización de inputs, selección del archivo más reciente,
 *    soporte de Google Docs a PDF y protección opcional con token.
 */

/**
 * Diccionario de carpetas en Google Drive asociadas a cada categoría de CV.
 * Reemplaza 'ID_CARPETA_AQUI' con el ID real de cada carpeta en tu Google Drive.
 */
const CARPETAS_DRIVE = {
  'Administrativo': '1rIrjR0KwGUFXK1uJKz6RuTQwIrZLoEEr',
  'Atencion al publico': '1ojCiyiW4zHwBynBdbw0I6INyo0',
  'Cajero': '10XuyJWshEMzvHs3jMJCLuumubbCrQ950',
  'Comunity': '1rKMjZwvp1qc2rh9zX9AhZS0ldYTg2LOB',
  'Gastronomia': '132qkj8QfcglRuwzXjDTdBb_8VtnnHG3W',
  'Repositor': '1I9HIM6mrGm6tdngjvFo7GFb112CYaDd9',
  'Seguridad': '1Qrdi5uCNO1j_hmG4D2CQFKgwlGK_qsiO',
  'tecno': '1LFXk3gdhTH7DaUVKaAfuS3SpL5iK_p5q'
};

/**
 * Token de seguridad opcional para proteger el backend contra llamadas no autorizadas.
 * Si lo dejas vacío (''), cualquier frontend conectado podrá enviar solicitudes.
 * Si le pones una clave (ej: 'mi_clave_123'), deberás poner la misma clave en la PWA.
 */
const API_SECRET_TOKEN = '';

/**
 * Devuelve la lista de categorías configuradas en Drive.
 * 
 * @return {string[]} Lista de nombres de categorías.
 */
function obtenerCategorias() {
  return Object.keys(CARPETAS_DRIVE);
}

/**
 * Endpoint HTTP GET:
 * Consulta pública de categorías disponibles en JSON.
 * Ejemplo: https://script.google.com/.../exec?action=getCategories
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action;

    if (action === 'getCategories') {
      return jsonResponse({
        success: true,
        categories: obtenerCategorias()
      });
    }

    // Soporte para envío de CV vía GET (máxima compatibilidad CORS en móviles y navegadores)
    if (action === 'sendCV') {
      if (API_SECRET_TOKEN && params.apiToken !== API_SECRET_TOKEN) {
        return jsonResponse({
          success: false,
          message: 'Acceso no autorizado: Token de seguridad inválido.'
        });
      }

      const emailDestino = params.emailDestino || params.email;
      const categoriaSeleccionada = params.categoriaSeleccionada || params.category;

      const resultado = enviarCVCategoria(emailDestino, categoriaSeleccionada);
      return jsonResponse(resultado);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'online',
      service: 'CV Scanner API Backend',
      version: '2.2.0',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('Error en doGet: ' + err.toString());
    return jsonResponse({
      success: false,
      message: 'Error al procesar petición GET: ' + err.message
    });
  }
}

/**
 * Endpoint HTTP POST:
 * Recibe email y categoría desde la PWA para procesar y enviar el CV vía Gmail.
 */
function doPost(e) {
  try {
    let payload = {};

    // 1. Extraer datos (admite JSON crudo y Form-Data)
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    // 2. Validación de Token si está configurado
    if (API_SECRET_TOKEN && payload.apiToken !== API_SECRET_TOKEN) {
      return jsonResponse({
        success: false,
        message: 'Acceso no autorizado: Token de seguridad inválido.'
      });
    }

    // 3. Ejecutar envío individual o por lote (batch)
    if (Array.isArray(payload.items) && payload.items.length > 0) {
      const results = [];
      for (let i = 0; i < payload.items.length; i++) {
        const item = payload.items[i];
        const res = enviarCVCategoria(item.emailDestino || item.email, item.categoriaSeleccionada || item.category);
        results.push({
          id: item.id || i,
          email: item.emailDestino || item.email,
          category: item.categoriaSeleccionada || item.category,
          ...res
        });
      }
      return jsonResponse({
        success: true,
        batch: true,
        results: results
      });
    }

    const emailDestino = payload.emailDestino || payload.email;
    const categoriaSeleccionada = payload.categoriaSeleccionada || payload.category;

    // 4. Ejecutar envío individual seguro
    const resultado = enviarCVCategoria(emailDestino, categoriaSeleccionada);
    return jsonResponse(resultado);

  } catch (error) {
    Logger.log('Error en doPost(): ' + error.toString());
    return jsonResponse({
      success: false,
      message: 'Error en el servidor: ' + (error.message || error.toString())
    });
  }
}

/**
 * Generador de respuestas JSON estándar compatible con CORS en Apps Script.
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Busca en la carpeta de Drive de la categoría el CV MÁS RECIENTE
 * (soporta PDF, Word DOCX/DOC y Google Docs convertidos a PDF),
 * y lo envía como adjunto al correo indicado utilizando GmailApp.
 *
 * @param {string} emailDestino Dirección de correo del destinatario.
 * @param {string} categoriaSeleccionada Nombre de la categoría elegida.
 * @return {Object} Resultado de la operación: { success: boolean, message: string }.
 */
function enviarCVCategoria(emailDestino, categoriaSeleccionada) {
  // =========================================================================
  // VARIABLES CONFIGURABLES DEL CORREO (Personaliza tus datos aquí)
  // =========================================================================
  const NOMBRE_REMITENTE = "Luciano Bibbo";
  const ASUNTO_CORREO = `Presentación para vacante de ${categoriaSeleccionada} - ${NOMBRE_REMITENTE}`;
  const CUERPO_CORREO = 
`Estimado/a responsable de selección,

Espero que se encuentre muy bien.

Le escribo para presentar mi postulación a las vacantes correspondientes al área de ${categoriaSeleccionada}. Adjunto a este correo encontrará mi Currículum Vitae actualizado con el detalle de mi experiencia laboral, formación y datos de contacto.

Quedo a su disposición ante cualquier consulta o para coordinar una entrevista.

Muchas gracias por su tiempo y consideración.

Atentamente,
${NOMBRE_REMITENTE}
`;

  try {
    // 1. Validación de seguridad en inputs
    if (!emailDestino || typeof emailDestino !== 'string') {
      throw new Error('Debes indicar un correo electrónico de destino.');
    }

    const emailLimpio = emailDestino.trim().toLowerCase();
    // Regex estricto RFC 5322 simplificado
    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
    if (!regexEmail.test(emailLimpio)) {
      throw new Error(`El correo "${emailDestino}" no tiene un formato válido.`);
    }

    if (!categoriaSeleccionada || !CARPETAS_DRIVE.hasOwnProperty(categoriaSeleccionada)) {
      throw new Error(`La categoría "${categoriaSeleccionada}" no es válida o no está registrada.`);
    }

    // 2. Obtener y validar el ID de carpeta en Google Drive
    const folderId = CARPETAS_DRIVE[categoriaSeleccionada];
    if (!folderId || folderId === 'ID_CARPETA_AQUI') {
      throw new Error(`La categoría "${categoriaSeleccionada}" aún no tiene configurado un ID de carpeta válido. Reemplaza 'ID_CARPETA_AQUI' en 'Código.gs' con el ID real de tu carpeta de Google Drive.`);
    }

    // 3. Acceso a la carpeta en Google Drive
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (driveErr) {
      Logger.log(`Error al acceder a carpeta ${folderId}: ` + driveErr.toString());
      throw new Error(`No se pudo acceder a la carpeta de Drive (ID: ${folderId}). Verifica el ID y los permisos.`);
    }

    // 4. Buscar archivos válidos y ordenar por última modificación (más reciente primero)
    const files = folder.getFiles();
    const candidatos = [];

    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();
      const fileName = file.getName().toLowerCase();

      const esPdf = mimeType === MimeType.PDF || fileName.endsWith('.pdf');
      const esWord = mimeType === MimeType.MICROSOFT_WORD ||
                     mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                     fileName.endsWith('.docx') || fileName.endsWith('.doc');
      const esGoogleDoc = mimeType === 'application/vnd.google-apps.document';

      if (esPdf || esWord || esGoogleDoc) {
        candidatos.push({
          file: file,
          name: file.getName(),
          updated: file.getLastUpdated().getTime(),
          isGoogleDoc: esGoogleDoc
        });
      }
    }

    if (candidatos.length === 0) {
      throw new Error(`La carpeta de Drive para "${categoriaSeleccionada}" está vacía o no contiene ningún archivo de CV compatible (PDF, Word o Google Doc).`);
    }

    // Tomar el archivo modificado más recientemente
    candidatos.sort((a, b) => b.updated - a.updated);
    const cvSeleccionado = candidatos[0];

    // 5. Preparar adjunto (convierte Google Docs a PDF si corresponde)
    let adjuntoBlob;
    if (cvSeleccionado.isGoogleDoc) {
      adjuntoBlob = cvSeleccionado.file.getAs(MimeType.PDF);
      adjuntoBlob.setName(cvSeleccionado.name + '.pdf');
    } else {
      adjuntoBlob = cvSeleccionado.file.getBlob();
    }

    // 6. Enviar el correo electrónico mediante GmailApp con el archivo adjunto
    GmailApp.sendEmail(emailLimpio, ASUNTO_CORREO, CUERPO_CORREO, {
      name: NOMBRE_REMITENTE,
      attachments: [adjuntoBlob]
    });

    Logger.log(`[Éxito] CV "${cvSeleccionado.name}" enviado a "${emailLimpio}" [${categoriaSeleccionada}].`);

    return {
      success: true,
      message: `CV ("${cvSeleccionado.name}") enviado correctamente a ${emailLimpio}.`
    };

  } catch (error) {
    Logger.log('Error en enviarCVCategoria(): ' + error.toString());
    return {
      success: false,
      message: error.message || 'Ocurrió un error inesperado al procesar el envío del CV.'
    };
  }
}
