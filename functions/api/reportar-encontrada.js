
export async function onRequestPost(context) {
  const { request, env } = context;

  // Validar el origen de la solicitud.
  const origen = request.headers.get("Origin");

  if (origen && origen !== "https://scanpet-publico.pages.dev") {
    return respuesta({
      ok: false,
      mensaje: "Origen no permitido."
    }, 403);
  }

  // Aceptar únicamente solicitudes JSON.
  const tipoContenido = request.headers.get("content-type") || "";

  if (!tipoContenido.toLowerCase().includes("application/json")) {
    return respuesta({
      ok: false,
      mensaje: "Tipo de solicitud no válido."
    }, 415);
  }

  let datos;

  try {
    const texto = await request.text();

    if (!texto || texto.length > 10000) {
      return respuesta({
        ok: false,
        mensaje: "La solicitud está vacía o es demasiado grande."
      }, 413);
    }

    datos = JSON.parse(texto);
  } catch (error) {
    return respuesta({
      ok: false,
      mensaje: "No se pudo leer la solicitud."
    }, 400);
  }

  // Validar el código del llavero ScanPet.
  const codigo = String(datos.codigo || "")
    .trim()
    .toUpperCase();

  if (!/^SP-[A-Z0-9]{8}$/.test(codigo)) {
    return respuesta({
      ok: false,
      mensaje: "El código del llavero no es válido."
    }, 400);
  }

  // La ubicación debe llegar con ambas coordenadas o sin ninguna.
  const tieneLatitud = datos.latitud !== null &&
    datos.latitud !== undefined;

  const tieneLongitud = datos.longitud !== null &&
    datos.longitud !== undefined;

  if (tieneLatitud !== tieneLongitud) {
    return respuesta({
      ok: false,
      mensaje: "La ubicación está incompleta."
    }, 400);
  }

  let latitud = null;
  let longitud = null;

  if (tieneLatitud && tieneLongitud) {
    latitud = datos.latitud;
    longitud = datos.longitud;

    if (
      typeof latitud !== "number" ||
      !Number.isFinite(latitud) ||
      latitud < -90 ||
      latitud > 90 ||
      typeof longitud !== "number" ||
      !Number.isFinite(longitud) ||
      longitud < -180 ||
      longitud > 180
    ) {
      return respuesta({
        ok: false,
        mensaje: "Las coordenadas no son válidas."
      }, 400);
    }
  }

  // El secreto permanece en Cloudflare y Apps Script.
  if (!env.SCANPET_API_SECRET) {
    console.error("Falta configurar SCANPET_API_SECRET.");

    return respuesta({
      ok: false,
      mensaje: "El servicio no está configurado."
    }, 500);
  }

  const urlAppsScript =
    "https://script.google.com/macros/s/AKfycbyKJuTw7nA1ixIw3B4KviaYlh8yZEnxLP6iuF7d-KRxJecO0gRJMUAuhpAaihnwB4rq/exec";

  try {
    const respuestaServidor = await fetch(urlAppsScript, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api: "reportarMascotaEncontrada",
        codigo: codigo,
        latitud: latitud,
        longitud: longitud,
        apiSecret: env.SCANPET_API_SECRET
      }),
      redirect: "follow"
    });

    const contenido = await respuestaServidor.text();
    let resultado;

    try {
      resultado = JSON.parse(contenido);
    } catch (error) {
      console.error("Apps Script devolvió una respuesta no JSON.");

      return respuesta({
        ok: false,
        mensaje: "No fue posible procesar la respuesta del servidor."
      }, 502);
    }

    return respuesta(resultado, respuestaServidor.ok ? 200 : 502);

  } catch (error) {
    console.error("Error de comunicación con Apps Script:", error.message);

    return respuesta({
      ok: false,
      mensaje: "No fue posible conectar con el servidor."
    }, 502);
  }
}

function respuesta(datos, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
