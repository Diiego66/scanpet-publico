
export async function onRequestPost(context) {
  const { request, env } = context;

  const origen = request.headers.get("Origin");

  if (origen && origen !== "https://scanpet-publico.pages.dev") {
    return respuesta({ ok: false, mensaje: "Origen no permitido." }, 403);
  }

  const tipoContenido = request.headers.get("content-type") || "";

  if (!tipoContenido.toLowerCase().includes("application/json")) {
    return respuesta({ ok: false, mensaje: "Tipo de solicitud no válido." }, 415);
  }

  let datos;

  try {
    const texto = await request.text();

    if (!texto || texto.length > 4500000) {
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

  const codigo = String(datos.codigo || "").trim().toUpperCase();

  if (!/^SP-[A-Z0-9]{8}$/.test(codigo)) {
    return respuesta({
      ok: false,
      mensaje: "El código del llavero no es válido."
    }, 400);
  }

  // Mantener compatibilidad con el formulario de activación actual.
  const operacion = datos.operacion ||
    (datos.codigoActivacion ? "validarActivacion" : "");

  let solicitudServidor;

  if (operacion === "validarActivacion") {
    const codigoActivacion = String(datos.codigoActivacion || "")
      .trim()
      .toUpperCase();

    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigoActivacion)) {
      return respuesta({
        ok: false,
        mensaje: "Verifica el código de activación."
      }, 400);
    }

    solicitudServidor = {
      api: "validarActivacion",
      codigo: codigo,
      codigoActivacion: codigoActivacion
    };

  } else if (operacion === "registrarMascota") {
    const token = String(datos.tokenAutorizacion || "");

    if (!/^[a-fA-F0-9]{64}$/.test(token)) {
      return respuesta({
        ok: false,
        mensaje: "La autorización no es válida. Valida nuevamente tu llavero."
      }, 400);
    }

    if (
      !datos.mascota ||
      typeof datos.mascota !== "object" ||
      Array.isArray(datos.mascota) ||
      datos.consentimiento !== true
    ) {
      return respuesta({
        ok: false,
        mensaje: "Faltan los datos del registro o el consentimiento."
      }, 400);
    }

    // Solo aceptar los campos esperados del formulario.
    const m = datos.mascota;

    const mascota = {
      nombre: m.nombre,
      especie: m.especie,
      raza: m.raza,
      anioNacimiento: m.anioNacimiento,
      colorSenas: m.colorSenas,
      municipioZona: m.municipioZona,
      cuidadosEspeciales: m.cuidadosEspeciales,
      mensajePersonal: m.mensajePersonal,
      nombreContacto: m.nombreContacto,
      telefono: m.telefono,
      whatsapp: m.whatsapp,
      correoPropietario: m.correoPropietario
    };

    let foto = null;

    if (datos.foto != null) {
      if (
        typeof datos.foto !== "object" ||
        typeof datos.foto.base64 !== "string" ||
        typeof datos.foto.tipo !== "string"
      ) {
        return respuesta({
          ok: false,
          mensaje: "El archivo de fotografía no es válido."
        }, 400);
      }

      foto = {
        tipo: datos.foto.tipo,
        base64: datos.foto.base64
      };
    }

    solicitudServidor = {
      api: "registrarMascota",
      codigo: codigo,
      tokenAutorizacion: token,
      mascota: mascota,
      consentimiento: true,
      foto: foto
    };

  } else {
    return respuesta({
      ok: false,
      mensaje: "Operación no permitida."
    }, 400);
  }

  if (!env.SCANPET_API_SECRET) {
    console.error("Falta configurar SCANPET_API_SECRET.");

    return respuesta({
      ok: false,
      mensaje: "El servicio no está configurado."
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
        ...solicitudServidor,
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
