
export async function onRequestPost(context) {
  const { request, env } = context;

  // Solo aceptar solicitudes desde la página pública de ScanPet.
  const origen = request.headers.get("Origin");

  if (origen && origen !== "https://scanpet-publico.pages.dev") {
    return respuesta({
      ok: false,
      mensaje: "Origen no permitido."
    }, 403);
  }

  let datos;

  try {
    const tipoContenido = request.headers.get("content-type") || "";

    if (!tipoContenido.toLowerCase().includes("application/json")) {
      return respuesta({
        ok: false,
        mensaje: "Tipo de solicitud no válido."
      }, 415);
    }

    const texto = await request.text();

    if (texto.length > 5000) {
      return respuesta({
        ok: false,
        mensaje: "La solicitud es demasiado grande."
      }, 413);
    }

    datos = JSON.parse(texto);
  } catch (error) {
    return respuesta({
      ok: false,
      mensaje: "No se pudo leer la solicitud."
    }, 400);
  }

  const codigo = String(datos.codigo || "").trim().toUpperCase();
  const codigoActivacion = String(datos.codigoActivacion || "")
    .trim()
    .toUpperCase();

  if (
    !/^SP-[A-Z0-9]{8}$/.test(codigo) ||
    !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigoActivacion)
  ) {
    return respuesta({
      ok: false,
      mensaje: "Verifica el código del llavero y el código de activación."
    }, 400);
  }

  if (!env.SCANPET_API_SECRET) {
    console.error("Falta configurar SCANPET_API_SECRET.");
    return respuesta({
      ok: false,
      mensaje: "El servicio de activación no está configurado."
    }, 500);
  }

  const urlAppsScript =
    "https://script.google.com/macros/s/AKfycbwzUak9OhTv-vNBoirta-p-B2TeOJ3NX97YjRnQOMjsqyvDxp3fw0D7tJVr92VxJpthkQ/exec";

  try {
    const respuestaServidor = await fetch(urlAppsScript, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api: "validarActivacion",
        apiSecret: env.SCANPET_API_SECRET,
        codigo: codigo,
        codigoActivacion: codigoActivacion
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
        mensaje: "No fue posible validar el código en este momento."
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
