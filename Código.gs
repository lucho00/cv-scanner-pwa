/**
 * ====================================================================
 * PROYECTO: CV Scanner & Sender - API Backend (Google Apps Script)
 * ARCHIVO: Código.gs
 * ====================================================================
 * 
 * Funcionalidades:
 * 1. Conexión automática con tu CARPETA PRINCIPAL de Drive (detecta subcarpetas por nombre).
 * 2. Conexión bidireccional con tu GOOGLE SHEET (agrega nuevos, vacía enviados, reenvía todo).
 * 3. API doGet() y doPost() para la PWA móvil con bypass de CORS.
 * 4. Macros para ejecutar y resetear envíos masivos diarios directamente en Sheets.
 */

/**
 * ⚡ EJECUTA ESTA FUNCIÓN UNA SOLA VEZ EN EL EDITOR PARA AUTORIZAR GOOGLE SHEETS
 * (En el menú desplegable de arriba selecciona 'autorizarPermisos' y presiona 'Ejecutar')
 * Es 100% GRATUITO. Solo otorga permiso a tu propio script para leer tu planilla.
 */
function autorizarPermisos() {
  const sheet = getTargetSheet();
  const filas = leerFilasSheet();
  Logger.log("✅ Permisos autorizados exitosamente. Total de filas en tu Google Sheet: " + filas.length);
}

// =========================================================================
// 1. CONFIGURACIÓN PRINCIPAL DE DRIVE, SHEETS Y REMITENTE
// =========================================================================

/**
 * ID de tu carpeta principal de Google Drive que contiene las subcarpetas de categorías
 * (ej: Administrativo, Atencion al publico, Cajero, Gastronomia, etc.)
 */
const CARPETA_PRINCIPAL_ID = "1nfgYTpwADKl6lnCBue75xuDs3GYDpiAW";

/**
 * ID de tu Google Sheet (Base de Datos de postulaciones)
 * URL: https://docs.google.com/spreadsheets/d/1wxaW6KsNdn-eIk8rrUPGXAeFET2T9005x-onPBFlH60/edit
 */
const SPREADSHEET_ID = "1wxaW6KsNdn-eIk8rrUPGXAeFET2T9005x-onPBFlH60";

/**
 * Nombre del remitente para correos salientes
 */
const NOMBRE_REMITENTE = "Luciano Bibbo";

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
// 2. UTILIDADES DE GOOGLE SHEETS (BASE DE DATOS EN LA NUBE)
// =========================================================================

/**
 * Abre la hoja de cálculo configurada
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim().length > 10) {
    return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  }
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    return null;
  }
}

/**
 * Obtiene la pestaña de datos (por defecto la primera hoja)
 */
function getTargetSheet() {
  try {
    const ss = getSpreadsheet();
    if (!ss) {
      Logger.log('⚠️ getSpreadsheet() retornó null. Verifica SPREADSHEET_ID.');
      return null;
    }
    const sheets = ss.getSheets();
    if (!sheets || sheets.length === 0) return null;
    // Siempre usar la primera hoja del libro para evitar fallos con getActiveSheet()
    return sheets[0];
  } catch (err) {
    Logger.log('⚠️ Error en getTargetSheet(): ' + err.toString());
    return null;
  }
}

/**
 * Lee todas las filas existentes en el Google Sheet
 * Columnas: [Email Destino, Categoria, Asunto, Estado]
 */
function leerFilasSheet() {
  const sheet = getTargetSheet();
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const range = sheet.getRange(2, 1, lastRow - 1, 4);
  const values = range.getValues();

  const filas = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    filas.push({
      rowIndex: i + 2,
      email: (row[0] || '').toString().trim(),
      category: (row[1] || '').toString().trim(),
      subject: (row[2] || '').toString().trim(),
      status: (row[3] || '').toString().trim()
    });
  }
  return filas;
}

/**
 * Sincroniza la lista de la app con el Google Sheet:
 * 1. Agrega los nuevos correos extraídos de las imágenes que no estén en la planilla.
 * 2. Devuelve la lista completa (viejos + nuevos) para la app móvil.
 */
function sincronizarConSheet(itemsNuevos) {
  const sheet = getTargetSheet();
  if (!sheet) {
    throw new Error('No se pudo acceder a la hoja de Google Sheets. Verifica el ID.');
  }

  // Asegurar encabezados si está vacía
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Email Destino', 'Categoria', 'Asunto', 'Estado']);
  }

  const filasActuales = leerFilasSheet();
  const mapaEmails = new Map();
  filasActuales.forEach(f => {
    if (f.email) mapaEmails.set(f.email.toLowerCase(), f);
  });

  let agregados = 0;
  if (Array.isArray(itemsNuevos) && itemsNuevos.length > 0) {
    for (let i = 0; i < itemsNuevos.length; i++) {
      const item = itemsNuevos[i];
      if (!item || !item.email) continue;

      const emailLimpio = item.email.trim();
      const emailLower = emailLimpio.toLowerCase();

      // Si no existe en la planilla, lo agregamos como nueva fila
      if (!mapaEmails.has(emailLower)) {
        const cat = item.category || 'Administrativo';
        const asunto = `Presentación para vacante de ${cat} - ${NOMBRE_REMITENTE}`;
        const estadoInicial = item.status === 'sent' ? 'Enviado' : '';

        sheet.appendRow([emailLimpio, cat, asunto, estadoInicial]);
        mapaEmails.set(emailLower, {
          email: emailLimpio,
          category: cat,
          subject: asunto,
          status: estadoInicial
        });
        agregados++;
      }
    }
  }

  // Volver a leer la base de datos completa actualizada
  const baseDeDatosCompleta = leerFilasSheet();
  return {
    success: true,
    agregados: agregados,
    total: baseDeDatosCompleta.length,
    contactos: baseDeDatosCompleta
  };
}

/**
 * Vacía la columna D ("Estado") en el Google Sheet para reiniciar el reenvío diario
 */
function vaciarColumnaEnviadosSheet() {
  const sheet = getTargetSheet();
  if (!sheet) {
    throw new Error('No se pudo acceder a la hoja de Google Sheets.');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, count: 0, message: 'La planilla no tiene filas para vaciar.' };
  }

  // Limpiar rango de la columna D desde la fila 2
  const range = sheet.getRange(2, 4, lastRow - 1, 1);
  range.clearContent();

  return {
    success: true,
    count: lastRow - 1,
    message: `Se vaciaron los estados de ${lastRow - 1} filas en el Google Sheet. ¡Listos para reenviar!`
  };
}

/**
 * Actualiza o registra un envío en el Google Sheet
 */
function registrarOActualizarEnSheet(emailDestino, categoria, asunto, estado) {
  try {
    const sheet = getTargetSheet();
    if (!sheet) return;

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Email Destino', 'Categoria', 'Asunto', 'Estado']);
    }

    const emailLower = (emailDestino || '').toLowerCase().trim();
    const lastRow = sheet.getLastRow();

    if (lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
      for (let i = 0; i < values.length; i++) {
        if ((values[i][0] || '').toString().toLowerCase().trim() === emailLower) {
          // Actualizar estado en columna D (col 4)
          sheet.getRange(i + 2, 4).setValue(estado);
          if (categoria) sheet.getRange(i + 2, 2).setValue(categoria);
          return;
        }
      }
    }

    // Si no estaba en el Sheet, agregarlo
    sheet.appendRow([emailDestino, categoria, asunto, estado]);
  } catch (err) {
    Logger.log('Aviso al actualizar Sheet: ' + err.toString());
  }
}

/**
 * Envía todos los correos de la planilla (viejos y nuevos) recompletando la columna Estado
 */
function enviarTodosDesdeSheet(resetearPrimero = false) {
  const sheet = getTargetSheet();
  if (!sheet) {
    throw new Error('No se pudo acceder al Google Sheet.');
  }

  if (resetearPrimero) {
    vaciarColumnaEnviadosSheet();
  }

  const filas = leerFilasSheet();
  let enviados = 0;
  let errores = 0;
  const resultados = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila.email || fila.status === 'Enviado') {
      continue;
    }

    const res = enviarCVCategoria(fila.email, fila.category);
    if (res.success) {
      sheet.getRange(fila.rowIndex, 4).setValue('Enviado');
      enviados++;
    } else {
      sheet.getRange(fila.rowIndex, 4).setValue('Error: ' + res.message);
      errores++;
    }
    resultados.push({
      email: fila.email,
      category: fila.category,
      ...res
    });
  }

  return {
    success: true,
    total: filas.length,
    enviados: enviados,
    errores: errores,
    resultados: resultados
  };
}

// =========================================================================
// 3. UTILIDADES DE BÚSQUEDA DINÁMICA EN GOOGLE DRIVE
// =========================================================================

function normalizarTexto(str) {
  return (str || '')
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obtenerCategorias() {
  // Retorna estrictamente tus 8 categorías reales de trabajo
  return Object.keys(CARPETAS_DRIVE).sort();
}

function buscarCarpetaCategoria(categoriaSeleccionada) {
  if (!categoriaSeleccionada) return null;

  if (CARPETA_PRINCIPAL_ID && CARPETA_PRINCIPAL_ID !== 'ID_CARPETA_PRINCIPAL_AQUI') {
    try {
      const carpetaPrincipal = DriveApp.getFolderById(CARPETA_PRINCIPAL_ID);
      
      const directas = carpetaPrincipal.getFoldersByName(categoriaSeleccionada);
      if (directas.hasNext()) {
        return directas.next();
      }

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
// 4. MOTOR DE ENVÍO DE CV POR GMAIL
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

    const folder = buscarCarpetaCategoria(categoriaSeleccionada);
    if (!folder) {
      throw new Error(`No se encontró la carpeta de Drive para "${categoriaSeleccionada}". Verifica que exista una subcarpeta con ese nombre dentro de tu Carpeta Principal.`);
    }

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

    candidatos.sort((a, b) => b.updated - a.updated);
    const cvSeleccionado = candidatos[0];

    let adjuntoBlob;
    if (cvSeleccionado.isGoogleDoc) {
      adjuntoBlob = cvSeleccionado.file.getAs(MimeType.PDF);
      adjuntoBlob.setName(cvSeleccionado.name + '.pdf');
    } else {
      adjuntoBlob = cvSeleccionado.file.getBlob();
    }

    GmailApp.sendEmail(emailLimpio, ASUNTO_CORREO, CUERPO_CORREO, {
      name: NOMBRE_REMITENTE,
      attachments: [adjuntoBlob]
    });

    Logger.log(`[Éxito] CV "${cvSeleccionado.name}" enviado a "${emailLimpio}" [${categoriaSeleccionada}].`);

    // Sincronizar estado en Google Sheet
    registrarOActualizarEnSheet(emailLimpio, categoriaSeleccionada, ASUNTO_CORREO, 'Enviado');

    return {
      success: true,
      message: `CV ("${cvSeleccionado.name}") enviado correctamente a ${emailLimpio}.`
    };

  } catch (error) {
    Logger.log('Error en enviarCVCategoria(): ' + error.toString());
    registrarOActualizarEnSheet(emailDestino, categoriaSeleccionada, ASUNTO_CORREO, 'Error: ' + error.message);
    return {
      success: false,
      message: error.message || 'Ocurrió un error inesperado al procesar el envío del CV.'
    };
  }
}

// =========================================================================
// 5. ENDPOINTS WEB APP (doGet y doPost para la PWA)
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

    if (action === 'getSheetData') {
      const filas = leerFilasSheet();
      return jsonResponse({
        success: true,
        total: filas.length,
        contactos: filas
      });
    }

    if (action === 'syncSheet') {
      let items = [];
      if (params.items) {
        try {
          items = JSON.parse(params.items);
        } catch (e) {
          items = [];
        }
      }
      const res = sincronizarConSheet(items);
      return jsonResponse(res);
    }

    if (action === 'resetSheetStatus') {
      const res = vaciarColumnaEnviadosSheet();
      return jsonResponse(res);
    }

    if (action === 'sendAllFromSheet') {
      const reset = params.resetFirst === 'true' || params.resetFirst === true;
      const res = enviarTodosDesdeSheet(reset);
      return jsonResponse(res);
    }

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
      service: 'CV Scanner API Backend con Sheets',
      version: '3.1.0',
      spreadsheetId: SPREADSHEET_ID,
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

    const action = payload.action;

    // Sincronizar items de la PWA con el Sheet
    if (action === 'syncSheet') {
      const res = sincronizarConSheet(payload.items || []);
      return jsonResponse(res);
    }

    // Vaciar columna Estado en Sheet
    if (action === 'resetSheetStatus') {
      const res = vaciarColumnaEnviadosSheet();
      return jsonResponse(res);
    }

    // Enviar todos los del Sheet
    if (action === 'sendAllFromSheet') {
      const res = enviarTodosDesdeSheet(payload.resetFirst === true);
      return jsonResponse(res);
    }

    // Envío por lote desde la PWA
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

    // Envío individual
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
// 6. MACROS PARA EJECUTAR DIRECTAMENTE DESDE LA INTERFAZ DE GOOGLE SHEETS
// =========================================================================

/**
 * Macro para tu Google Sheet:
 * Envía los CVs de todas las filas pendientes y marca "Enviado".
 */
function enviarMailsConCV() {
  return enviarTodosDesdeSheet(false);
}

/**
 * Macro para tu Google Sheet:
 * Vacía la columna Estado para volver a enviar todo al día siguiente.
 */
function resetearColumnaEnviados() {
  var res = vaciarColumnaEnviadosSheet();
  SpreadsheetApp.getUi().alert("✅ " + res.message);
}
