/**
 * ====================================================================
 * PROYECTO: CV Scanner & Sender - API Backend (Google Apps Script)
 * ARCHIVO: Código.gs
 * ====================================================================
 * 
 * Funcionalidades:
 * 1. Conexión automática con tu CARPETA PRINCIPAL de Drive (detecta subcarpetas por nombre).
 * 2. API doGet() y doPost() para la PWA móvil con bypass de CORS.
 * 3. Integración con Google Sheets para base de datos centralizada de envíos.
 * 4. Macros para ejecutar y resetear envíos masivos diarios directamente en Sheets.
 */

// =========================================================================
// 1. CONFIGURACIÓN PRINCIPAL DE DRIVE Y REMITENTE
// =========================================================================

/**
 * ID de tu carpeta principal de Google Drive que contiene las subcarpetas de categorías
 * (ej: Administrativo, Atencion al publico, Cajero, Gastronomia, etc.)
 */
const CARPETA_PRINCIPAL_ID = "1nfgYTpwADKl6lnCBue75xuDs3GYDpiAW";

/**
 * Nombre del remitente para correos salientes
 */
const NOMBRE_REMITENTE = "Luciano Bibbo";

/**
 * ID opcional de tu Google Sheet para almacenar la base de datos de todos los envíos.
 * Si vinculas este script a una hoja (Extensiones > Apps Script), no necesitas poner el ID.
 * Si es un script independiente y quieres registrar en una hoja, pega su ID aquí:
 */
const SPREADSHEET_ID = "";

/**
 * Mapeo de respaldo de carpetas específicas en Google Drive (por si alguna estuviera fuera de la principal).
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
 * Token de seguridad opcional (dejar vacío si no se requiere).
 */
const API_SECRET_TOKEN = '';

// =========================================================================
// 2. UTILIDADES DE BÚSQUEDA DINÁMICA DE CATEGORÍAS Y CARPETAS
// =========================================================================

/**
 * Normaliza texto eliminando acentos, mayúsculas y espacios sobrantes
 */
function normalizarTexto(str) {
  return (str || '')
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Obtiene la lista dinámica de categorías leyendo las subcarpetas de la Carpeta Principal
 */
function obtenerCategorias() {
  const categorias = new Set();

  if (CARPETA_PRINCIPAL_ID && CARPETA_PRINCIPAL_ID !== 'ID_CARPETA_PRINCIPAL_AQUI') {
    try {
      const carpetaPrincipal = DriveApp.getFolderById(CARPETA_PRINCIPAL_ID);
      const subcarpetas = carpetaPrincipal.getFolders();
      while (subcarpetas.hasNext()) {
        categorias.add(subcarpetas.next().getName());
      }
    } catch (err) {
      Logger.log('Aviso al leer CARPETA_PRINCIPAL_ID: ' + err.toString());
    }
  }

  // Si no se encontraron o como respaldo, agregar las categorías fijas
  if (categorias.size === 0) {
    Object.keys(CARPETAS_DRIVE).forEach(cat => categorias.add(cat));
  }

  return Array.from(categorias);
}

/**
 * Busca de forma inteligente la subcarpeta de una categoría:
 * 1. Por coincidencia en la Carpeta Principal (exacta o insensible a acentos/mayúsculas).
 * 2. Por ID directo en CARPETAS_DRIVE como respaldo.
 */
function buscarCarpetaCategoria(categoriaSeleccionada) {
  if (!categoriaSeleccionada) return null;

  // 1. Buscar en la carpeta principal
  if (CARPETA_PRINCIPAL_ID && CARPETA_PRINCIPAL_ID !== 'ID_CARPETA_PRINCIPAL_AQUI') {
    try {
      const carpetaPrincipal = DriveApp.getFolderById(CARPETA_PRINCIPAL_ID);
      
      // Coincidencia exacta
      const directas = carpetaPrincipal.getFoldersByName(categoriaSeleccionada);
      if (directas.hasNext()) {
        return directas.next();
      }

      // Coincidencia insensible a tildes (ej: "Atencion al publico" == "Atención al público")
      const catNorm = normalizarTexto(categoriaSeleccionada);
      const todas = carpetaPrincipal.getFolders();
      while (todas.hasNext()) {
        const sub = todas.next();
        if (normalizarTexto(sub.getName()) === catNorm) {
          return sub;
        }
      }
    } catch (e) {
      Logger.log('Error buscando en CARPETA_PRINCIPAL_ID: ' + e.toString());
    }
  }

  // 2. Buscar en diccionario CARPETAS_DRIVE si existe ID válido
  if (CARPETAS_DRIVE.hasOwnProperty(categoriaSeleccionada)) {
    const idDirecto = CARPETAS_DRIVE[categoriaSeleccionada];
    if (idDirecto && idDirecto.length >= 28 && idDirecto !== 'ID_CARPETA_AQUI') {
      try {
        return DriveApp.getFolderById(idDirecto);
      } catch (e) {
        Logger.log('Error accediendo a carpeta directa: ' + e.toString());
      }
    }
  }

  return null;
}

// =========================================================================
// 3. REGISTRO EN GOOGLE SHEETS (BASE DE DATOS EN LA NUBE)
// =========================================================================

/**
 * Anota automáticamente el envío en Google Sheets para control y reenvío diario
 */
function registrarEnGoogleSheet(emailDestino, categoria, asunto, estado) {
  try {
    let ss = null;
    if (SPREADSHEET_ID && SPREADSHEET_ID !== 'ID_PLANILLA_AQUI') {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } else {
      try {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      } catch (e) {}
    }

    if (!ss) return;

    let sheet = ss.getSheetByName('Envíos') || ss.getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Email Destino', 'Categoría', 'Asunto', 'Estado', 'Fecha y Hora']);
    }

    const fechaStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm:ss');
    sheet.appendRow([emailDestino, categoria, asunto, estado, fechaStr]);
  } catch (sheetErr) {
    Logger.log('Aviso (Registro en Google Sheet omitido): ' + sheetErr.toString());
  }
}

// =========================================================================
// 4. ENDPOINTS WEB APP (doGet y doPost para la PWA)
// =========================================================================

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

    // Soporte para envío vía GET (fallback de máxima confiabilidad móvil)
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
      version: '3.0.0',
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

function doPost(e) {
  try {
    let payload = {};

    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    if (API_SECRET_TOKEN && payload.apiToken !== API_SECRET_TOKEN) {
      return jsonResponse({
        success: false,
        message: 'Acceso no autorizado: Token de seguridad inválido.'
      });
    }

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

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// =========================================================================
// 5. MOTOR DE ENVÍO DE CV MEDIANTE GMAIL
// =========================================================================

function enviarCVCategoria(emailDestino, categoriaSeleccionada) {
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
    if (!emailDestino || typeof emailDestino !== 'string') {
      throw new Error('Debes indicar un correo electrónico de destino.');
    }

    const emailLimpio = emailDestino.trim().toLowerCase();
    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
    if (!regexEmail.test(emailLimpio)) {
      throw new Error(`El correo "${emailDestino}" no tiene un formato válido.`);
    }

    if (!categoriaSeleccionada) {
      throw new Error('Debes seleccionar una categoría de CV.');
    }

    // 1. Localizar la carpeta correspondiente
    const folder = buscarCarpetaCategoria(categoriaSeleccionada);
    if (!folder) {
      throw new Error(`No se encontró la carpeta de Drive para "${categoriaSeleccionada}". Verifica que exista una subcarpeta con ese nombre dentro de tu Carpeta Principal.`);
    }

    // 2. Buscar archivos de CV válidos (PDF, Word o Google Doc)
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
      throw new Error(`La carpeta de Drive para "${categoriaSeleccionada}" está vacía o no contiene ningún archivo de CV (PDF o Word).`);
    }

    // Seleccionar el archivo modificado más recientemente
    candidatos.sort((a, b) => b.updated - a.updated);
    const cvSeleccionado = candidatos[0];

    // 3. Preparar archivo adjunto
    let adjuntoBlob;
    if (cvSeleccionado.isGoogleDoc) {
      adjuntoBlob = cvSeleccionado.file.getAs(MimeType.PDF);
      adjuntoBlob.setName(cvSeleccionado.name + '.pdf');
    } else {
      adjuntoBlob = cvSeleccionado.file.getBlob();
    }

    // 4. Enviar mediante GmailApp
    GmailApp.sendEmail(emailLimpio, ASUNTO_CORREO, CUERPO_CORREO, {
      name: NOMBRE_REMITENTE,
      attachments: [adjuntoBlob]
    });

    Logger.log(`[Éxito] CV "${cvSeleccionado.name}" enviado a "${emailLimpio}" [${categoriaSeleccionada}].`);

    // 5. Registrar en Google Sheet
    registrarEnGoogleSheet(emailLimpio, categoriaSeleccionada, ASUNTO_CORREO, 'Enviado');

    return {
      success: true,
      message: `CV ("${cvSeleccionado.name}") enviado correctamente a ${emailLimpio}.`
    };

  } catch (error) {
    Logger.log('Error en enviarCVCategoria(): ' + error.toString());
    registrarEnGoogleSheet(emailDestino, categoriaSeleccionada, ASUNTO_CORREO, 'Error: ' + error.message);
    return {
      success: false,
      message: error.message || 'Ocurrió un error inesperado al procesar el envío del CV.'
    };
  }
}

// =========================================================================
// 6. MACROS COMPATIBLES PARA EJECUTAR DIRECTAMENTE EN GOOGLE SHEETS
// =========================================================================

/**
 * Macro para tu Google Sheet:
 * Recorre las filas desde la fila 2 y envía los CVs de los que no digan "Enviado".
 */
function enviarMailsConCV() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var emailDestino = data[i][0];
    var categoria = data[i][1];
    var estado = data[i][3];

    if (!emailDestino || estado === "Enviado") {
      continue;
    }

    var resultado = enviarCVCategoria(emailDestino, categoria);
    if (resultado.success) {
      sheet.getRange(i + 1, 4).setValue("Enviado");
    } else {
      sheet.getRange(i + 1, 4).setValue("Error: " + resultado.message);
    }
  }
}

/**
 * Macro para tu Google Sheet:
 * Limpia la columna D (Estado) con un clic para volver a enviar todo al día siguiente.
 */
function resetearColumnaEnviados() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var val = data[i][3];
    if (val === "Enviado" || (typeof val === "string" && val.startsWith("Error"))) {
      sheet.getRange(i + 1, 4).setValue("");
    }
  }
  SpreadsheetApp.getUi().alert("✅ Se limpiaron los estados de la columna 'Estado'. ¡Listos para volver a enviar hoy!");
}
