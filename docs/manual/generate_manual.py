from datetime import datetime
from io import BytesIO
from pathlib import Path
import re
import json

from PIL import Image
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "MANUAL_ERP360_OPERACION_Y_CONFIGURACION.docx"
doc = Document()
section = doc.sections[0]
section.page_width = Inches(8.27)
section.page_height = Inches(11.69)
section.top_margin = section.bottom_margin = Inches(.7)
section.left_margin = section.right_margin = Inches(.75)
section.header_distance = section.footer_distance = Inches(.3)
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(10.5)
normal.paragraph_format.space_after = Pt(7)
for name in ["Title", "Heading 1", "Heading 2", "Heading 3"]:
    doc.styles[name].font.name = "Calibri"
    doc.styles[name].font.color.rgb = RGBColor.from_string("17365D")
    doc.styles[name].paragraph_format.keep_with_next = True
doc.styles["Heading 1"].paragraph_format.page_break_before = True
header = section.header.paragraphs[0]
header.text = "ERP360  |  Operación y configuración  |  Edición 2.0"
header.style = doc.styles["Caption"]
footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
footer.add_run("Documento de referencia · Página ")
field = OxmlElement("w:fldSimple")
field.set(qn("w:instr"), "PAGE")
footer._p.append(field)
doc.core_properties.title = "ERP360 · Manual de operación y configuración"
doc.core_properties.subject = "Procedimientos reales, configuración, límites y soporte"
doc.core_properties.author = "ERP360"
doc.core_properties.language = "es"
chapters = []


def p(text="", style=None):
    return doc.add_paragraph(text, style)


def h(text, level=1):
    if level == 1:
        chapters.append(text)
    return doc.add_heading(text, level)


def bullets(items):
    for text in items:
        p(text, "List Bullet")


def steps(items):
    for number, text in enumerate(items, 1):
        p(f"{number}. {text}")


def note(text):
    paragraph = p()
    paragraph.add_run("IMPORTANTE. ").bold = True
    paragraph.add_run(text)


def table(headers, rows):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Light Shading Accent 1"
    for cell, text in zip(t.rows[0].cells, headers):
        cell.text = str(text)
    repeat = OxmlElement("w:tblHeader")
    t.rows[0]._tr.get_or_add_trPr().append(repeat)
    for row in rows:
        cells = t.add_row().cells
        for cell, text in zip(cells, row):
            cell.text = str(text)
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(4)
                for run in paragraph.runs:
                    run.font.size = Pt(9)
    p("")
    return t


def code(text):
    paragraph = p()
    run = paragraph.add_run(text)
    run.font.name = "Consolas"
    run.font.size = Pt(8.5)


figure = 0


def image(filename, caption, mobile=False):
    global figure
    source = HERE / "images" / filename
    if not source.exists():
        raise FileNotFoundError(f"Falta captura verificada: {source.name}")
    with Image.open(source) as original:
        width, height = original.size
        target_width = 3.2 if mobile else 6.65
        max_height = int(width * 7.9 / target_width)
        parts = (height + max_height - 1) // max_height
        for index in range(parts):
            figure += 1
            start = index * max_height
            crop = original.crop((0, start, width, min(height, start + max_height)))
            data = BytesIO()
            crop.save(data, format="PNG")
            data.seek(0)
            paragraph = p()
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            picture = paragraph.add_run().add_picture(data, width=Inches(target_width))
            picture._inline.docPr.set("descr", caption)
            label = f"Figura {figure}. {caption}"
            if parts > 1:
                label += f" · parte {index + 1}/{parts}"
            p(label, "Caption")


def flow(title, purpose, prerequisites, operations, result, controls):
    h(title, 2)
    p(purpose)
    p("Antes de comenzar: " + prerequisites)
    table(["Paso", "Operación / cuerpo mínimo", "Resultado que debes comprobar"], operations)
    p("Resultado final: " + result)
    note(controls)


doc.add_heading("ERP360", 0)
p("MANUAL DE OPERACIÓN Y CONFIGURACIÓN", "Subtitle")
p("Guía de usuario, administración funcional e integración")
p(f"Edición 2.0 · Generado {datetime.now():%Y-%m-%d} · Idioma: español")
p("Audiencia: usuarios, responsables de empresa, integradores y soporte.")
note("Este manual describe la implementación existente, no una promesa de paridad con otro ERP. "
     "Distingue pantallas web de operaciones disponibles solo por API. Fiscal es simulación sandbox; "
     "el checkout no cobra en línea. Las capturas son de datos ficticios y los tokens usados se revocaron.")
p("Cómo leerlo: comienza por alcance y acceso; usa capítulos de tienda/portal para clientes "
  "y capítulos de procesos/API para operadores e integradores. En Word puedes navegar por los "
  "encabezados desde Vista → Panel de navegación.")
h("Contenido", 2)
contents = p("")

h("1. Alcance real y mapa de funciones")
p("ERP360 utiliza Angular para experiencia web, NestJS para servicios y PostgreSQL para persistencia. "
  "Varias empresas comparten esquema con separación lógica por company_id. La empresa administrativa "
  "proviene de la sesión JWT; el código de tienda identifica un catálogo público, no concede permisos.")
table(["Área", "Canal existente", "Límites relevantes"], [
    ("Inicio, acceso, dashboard", "Pantallas web", "Login y alta inicial controlada. Sin gestión completa de usuarios/roles."),
    ("Maestros", "Centro de operaciones + API", "Alta de clientes, productos, proveedores e impuestos; no hay edición/baja integral."),
    ("Ventas / compras", "Centro de operaciones + API", "Flujos comerciales núcleo; recepción física y contabilidad son pasos separados."),
    ("Inventario", "Pantalla web + API", "Saldos, kardex paginado, ajustes, reservas y despachos; sin costos, lotes ni transferencias."),
    ("Facturación comercial", "Pantalla web + API contable", "Emisión desde pedido, posteo y pagos parciales. Sin moneda, PDF, folios automáticos ni certificación fiscal."),
    ("Contabilidad", "API", "Plan base, asientos por origen, pagos, balance y cierre. No suite financiera completa."),
    ("Fiscal GT/SV/DO", "API sandbox", "Adaptadores simulados; producción bloqueada, sin certificación legal."),
    ("RRHH", "Centro de operaciones + API", "Empleados, asistencia, salidas y ausencias. No nómina."),
    ("eCommerce", "Estudio, tienda web pública y API", "Marca, secciones, catálogo, carrito, pedido, reserva y consentimiento. Sin cobro ni logística externa."),
    ("Portal", "Consulta web + API administrativa", "Token temporal, hasta 20 cotizaciones/pedidos/facturas recientes por categoría."),
    ("XML-RPC", "API", "Solo los métodos compatibles documentados; no todos los de un ERP legado."),
    ("Ayuda y futuro chat", "Ayuda local", "Contexto mínimo opt-in. No hay proveedor IA conectado."),
])
p("Identificadores: los IDs internos son UUID devueltos por la API; códigos y números visibles son "
  "referencias funcionales. Nunca reemplaces un UUID por un código ni reutilices IDs de otra empresa.")
image("01-home.png", "Inicio y navegación unificada")

h("2. Instalación, arranque y configuración")
h("2.1 Requisitos y puertos", 2)
bullets(["Node.js 24 y npm, Docker Desktop activo, navegador moderno.",
         "Directorio de trabajo: C:\\angular\\erp360\\erp360-modernizado.",
         "PostgreSQL local: 5432, contenedor erp360-db; API ERP: 3001; frontend de revisión: 4201.",
         "El puerto 3000 puede pertenecer a otro proyecto. No apagar servicios ajenos.",
         "En producción: HTTPS, secretos propios, respaldos, monitoreo y configuración del reverse proxy."])
h("2.2 Preparar una instalación nueva", 2)
steps(["Copiar .env.example a .env y revisar DB, PORT, JWT y CORS. No compartir este archivo.",
       "Levantar solo la DB del proyecto con docker compose up -d db.",
       "Comprobar el contenedor healthy y ejecutar migraciones SQL en orden de nombre, deteniéndose ante un error.",
       "En una base existente comprobar primero qué migraciones se aplicaron y realizar respaldo. No repetir scripts a ciegas.",
       "Restaurar dependencias con npm ci en api y frontend solo si faltan.",
       "Compilar API y arrancarla cargando expresamente el archivo de entorno."])
code("Set-Location C:\\angular\\erp360\\erp360-modernizado\\api\n"
     "npm run build\n"
     "if ($LASTEXITCODE -eq 0) { node --env-file=..\\.env dist\\main.js }")
code("Set-Location C:\\angular\\erp360\\erp360-modernizado\\frontend\n"
     "npm start -- --host 127.0.0.1 --port 4201")
p("Verifica http://127.0.0.1:3001/health/ready y "
  "http://127.0.0.1:4201/api/health/live antes de abrir la aplicación.")
h("2.3 Parámetros", 2)
table(["Variable", "Uso", "Cuidado"], [
    ("PORT", "Puerto de la API; ejemplo local 3001", "Es PORT, no API_PORT."),
    ("NODE_ENV", "development / test / production", "No desplegar producción con NODE_ENV=test."),
    ("BOOTSTRAP_ENABLED", "false normalmente; true solo aprovisionamiento", "Habilita registro sin autenticación. Restringir red y desactivar al terminar."),
    ("JWT_SECRET", "Clave de firma de sesión", "Generar secreto aleatorio fuerte; no usar la clave de ejemplo en producción."),
    ("JWT_SECRETS_JSON / JWT_ACTIVE_KID", "Rotación con conjunto de claves y kid activo", "Retirar una clave invalida todos sus tokens."),
    ("CORS_ORIGIN", "Orígenes autorizados separados por coma", "No sustituye autorización por tenant ni protege por sí solo contra XSS."),
    ("PORTAL_RATE_LIMIT_PER_MINUTE", "Límite público por IP y familia de rutas; valor habitual 60", "Memoria local por instancia; usar solución distribuida al escalar."),
    ("POSTGRES_HOST/PORT/DB/USER/PASSWORD", "Conexión DB", "No exponer DB públicamente ni publicar credenciales."),
    ("FRONTEND_PORT", "Referencia de configuración", "Angular requiere --port; esta variable no lo configura automáticamente."),
])
note("El proxy Angular solo existe durante desarrollo. Producción debe servir /api en el mismo origen, "
     "reescribiendo el prefijo hacia la API. La CSP que protege Angular debe aplicarse donde se sirve su HTML. "
     "Consulta docs/DESPLIEGUE_LOCAL.md para migraciones, rotación y parada segura.")

h("3. Empresas, usuarios, acceso y permisos")
h("3.1 Modelo multiempresa", 2)
p("Una empresa puede tener sus empleados y otra los suyos, independientemente de compartir base de datos. "
  "Los datos operativos están asociados al tenant. Un administrador es administrador de SU empresa, no "
  "un superadministrador global. La API no permite usar un ID de otra empresa para obtener su ficha.")
p("Cada cuenta pertenece a una empresa y el correo de usuario es globalmente único. Un empleado de RRHH "
  "es un registro laboral, no una cuenta con acceso. No hay interfaz de invitaciones, asignación de roles "
  "ni cambio de empresa. Para otro contexto se necesita una cuenta autorizada de esa empresa.")
h("3.2 Alta inicial controlada", 2)
steps(["El responsable de infraestructura habilita BOOTSTRAP_ENABLED=true temporalmente y reinicia API en una red restringida.",
       "Abre Acceso y expande Alta inicial de una empresa nueva.",
       "Introduce código único (letras/números/_/-, máximo 32), nombre, administrador, correo válido y contraseña de 12 o más caracteres.",
       "Crea la empresa; un código o correo ya registrado produce rechazo. El alta no agrega administradores a empresas existentes.",
       "Desactiva la bandera y reinicia API; luego inicia sesión con la cuenta creada."])
note("No habilites el alta pública para resolver una contraseña olvidada ni para dar acceso a otro empleado. "
     "La gestión de identidades restante requiere un mecanismo administrativo seguro pendiente de completar.")
h("3.3 Iniciar y terminar sesión", 2)
steps(["Abre Acceso. Introduce Correo de trabajo y Contraseña.",
       "Puedes pegar/autocompletar credenciales y usar Mostrar contraseña si el entorno es privado.",
       "Pulsa Entrar a mi empresa o Enter. La aplicación abre el dashboard.",
       "Comprueba el nombre de usuario y código/nombre de empresa de la barra superior antes de operar.",
       "Al terminar pulsa Cerrar sesión. En equipos compartidos cierra también las pestañas."])
p("La sesión se almacena en sessionStorage, no en localStorage; puede sobrevivir recargas de la pestaña. "
  "La vigencia del JWT es 8 horas. El logout elimina la sesión del navegador, no implementa por sí solo "
  "revocación inmediata de un JWT que ya haya sido copiado. Un 401 en API privada termina la sesión local.")
table(["Situación", "Qué hacer"], [
    ("Correo o contraseña incorrectos", "Revisar correo/teclado y contactar al administrador. No hay recuperación automática."),
    ("Alta deshabilitada", "Es el estado normal. Solo infraestructura puede habilitar una ventana controlada."),
    ("Empresa ya existe", "No reintentar con otros correos para asumirla; solicitar acceso por un canal administrativo."),
    ("Error de conexión", "Comprobar health, proxy y DB; usar Ayuda para generar referencia sin credenciales."),
])
image("06-login.png", "Acceso con campos etiquetados y alta inicial separada")

h("4. Navegación, accesibilidad y apariencia")
steps(["En escritorio utiliza Inicio, Dashboard, Acceso, Tienda, Portal cliente y Procesos desde la barra lateral.",
       "En móvil pulsa Menú para expandir/contraer enlaces. También puede abrirse con Enter o Espacio.",
       "Usa Claro/Oscuro para cambiar apariencia; la preferencia visual se conserva localmente.",
       "Usa Tab para recorrer acciones y el enlace Saltar al contenido para omitir navegación.",
       "La navegación coloca el foco en el contenido y actualiza el título de la pestaña.",
       "Abre Ayuda para los pasos correspondientes a la pantalla actual."])
p("Las tablas y el gráfico pueden desplazarse horizontalmente dentro de su contenedor; el sitio "
  "no debe requerir scroll horizontal global en los anchos probados. Si prefieres menos animación, "
  "activa reducir movimiento en el sistema. Los avisos de error y éxito se anuncian semánticamente.")
p("El documento HTML declara español y las fechas/números de pantalla usan formato español. "
  "La moneda se indica por su código cuando la operación lo proporciona; los cuerpos JSON de API "
  "mantienen números técnicos, no cadenas con formato de presentación.")
note("Se hicieron comprobaciones de accesibilidad y tamaños, pero no una certificación completa WCAG. "
     "Ante una barrera registra pantalla, tarea, ancho/zoom y referencia, sin datos personales.")
image("10-mobile.png", "Dashboard móvil, navegación compacta y scroll local del gráfico", True)
image("11-dark.png", "Modo oscuro con datos reales de demostración")

h("5. Dashboard e interpretación de indicadores")
steps(["Inicia sesión y abre Dashboard.",
       "Comprueba contexto de empresa/roles y la última actualización.",
       "Pulsa Actualizar después de completar operaciones para traer datos nuevos.",
       "En Agrupar por elige Día, Semana o Mes.",
       "Expande Ver datos del gráfico para consultar cantidades exactas en una tabla."])
p("Las tarjetas son totales históricos, no importes del período seleccionado. Saldos de inventario "
  "cuenta registros de saldo, no suma unidades. Tokens de portal y publicaciones son conteos, "
  "no una garantía de que todos estén activos/publicados. El gráfico cuenta pedidos creados, "
  "excluyendo cancelados; no es facturación, ingreso ni utilidad.")
table(["Agrupación", "Ventana", "Reglas"], [
    ("Día", "Últimos 14 días", "UTC, incluye el día actual parcial."),
    ("Semana", "Últimas 12 semanas", "UTC, lunes como inicio; semana actual parcial."),
    ("Mes", "Últimos 12 meses", "UTC; mes actual parcial."),
])
p("Las franjas sin operaciones se muestran con cero. Una falla de carga se informa como error, "
  "no como datos cero. No hay mezcla de monedas porque el gráfico muestra cantidades de documentos.")
table(["Rol reconocido", "Visibilidad del dashboard"], [
    ("admin", "Todas las tarjetas y series de venta/compra."),
    ("sales", "Clientes, cotizaciones, inventario y serie de venta."),
    ("purchases", "Proveedores, solicitudes, inventario y serie de compra."),
    ("Otros", "Productos e inventario, sin series comerciales."),
])
p("Estos códigos deben existir y estar asignados por un mecanismo autorizado. La visibilidad del "
  "dashboard no amplía permisos de los demás módulos ni agrega pantallas para administrar roles.")
image("04-dashboard.png", "Dashboard semanal y tabla de valores exactos")

h("6. Tienda: buscar, carrito y pedido")
h("6.1 Cargar y explorar", 2)
steps(["Abre el enlace compartido /shop/identificador o Tienda e introduce el código de empresa que te facilitaron.",
       "Comprueba el nombre, moneda, anuncio y contenido de inicio de la empresa.",
       "Selecciona una categoría o filtra por nombre/descripción en Buscar productos.",
       "Ordena por nombre, precio ascendente/descendente o disponibilidad.",
       "Selecciona 8, 12 o 24 por página y navega con Anterior/Siguiente cuando haya más resultados."])
p("Un catálogo vacío puede deberse al filtro, a una tienda sin publicaciones o a productos no "
  "publicados. Un error de carga no significa stock cero. El código público no autentica al cliente "
  "ni da acceso a otras empresas administrativas. La empresa puede compartir la dirección por slug "
  "configurada en Commerce Studio; el slug identifica una tienda activa, no es un secreto.")
image("02-storefront.png", "Catálogo ficticio por empresa con búsqueda y cantidades")
h("6.2 Agregar y corregir el carrito", 2)
steps(["Define una cantidad entera positiva. El botón no permite agregar un producto sin stock visible.",
       "Pulsa Agregar al carrito. La operación queda bloqueada mientras el servidor responde.",
       "Revisa nombre, cantidad, total por línea y total del carrito.",
       "Para retirar una línea pulsa Eliminar; se recalcula el total.",
       "Si quieres otra empresa, carga expresamente su tienda. Un carrito no se traslada entre empresas."])
p("El contexto del carrito queda vinculado al código de la tienda cargada. El navegador guarda en "
  "sessionStorage el identificador y el token del carrito para restaurarlo en la misma pestaña; el "
  "servidor conserva únicamente el hash del token y vuelve a comprobar acceso, precio y stock. No "
  "copies ni compartas ese token. Agregar al carrito no equivale a reservar inventario.")
image("05-cart.png", "Carrito y formulario antes de confirmar")
h("6.3 Confirmar pedido", 2)
steps(["Introduce nombre y correo de cliente válidos.",
       "Lee el aviso: se creará un pedido y se reservará inventario, sin cobro en línea.",
       "Pulsa Confirmar pedido una sola vez. Espera el mensaje con número de pedido y consérvalo.",
       "Si hay un error, revisa disponibilidad y pide al operador comprobar si se creó el pedido "
       "antes de reintentar tras una desconexión.",
       "El operador continúa despacho, factura y cobro por los procesos administrativos."])
p("El checkout crea o vincula cliente, genera documentación comercial y reserva stock dentro del "
  "flujo del módulo. No conecta tarjeta, banco, transportista, cálculo de flete, devolución o seguimiento "
  "de entrega externo. No reserves de nuevo manualmente un pedido web que ya tenga reserva.")
note("El bloqueo de botón evita doble envío en esta pantalla, pero no sustituye idempotencia "
     "distribuida para integraciones o reintentos de red. Ante resultado incierto conciliar primero.")
image("08-checkout.png", "Confirmación de pedido sin pasarela de pago")

h("7. Suscripción de clientes por empresa")
steps(["Carga la tienda correcta antes de suscribirte.",
       "En Suscríbete a novedades indica nombre opcional y correo válido.",
       "Marca de forma voluntaria la casilla de consentimiento; no está preseleccionada.",
       "Pulsa Suscribirme y espera Suscripción registrada correctamente.",
       "Para dejar de recibir comunicaciones contacta al soporte de esa empresa; el administrador "
       "puede ejecutar la baja por API."])
p("El registro de suscriptor se segmenta por empresa. No es una cuenta de acceso, un token de portal "
  "ni un cobro periódico. No se incorporó plataforma de campañas, double opt-in ni enlace público de "
  "baja automática. Antes de usar marketing real hay que configurar privacidad y cumplimiento aplicable.")
table(["Acción del administrador (API)", "Datos / resultado"], [
    ("GET /ecommerce/admin/subscribers", "Lista registros de la empresa autenticada."),
    ("POST /ecommerce/admin/subscribers/:id/unsubscribe", "Marca baja del registro de esa empresa."),
])
note("Un suscriptor no implica necesariamente un cliente comercial ya creado. No exportar listas "
     "a servicios externos sin autorización y base de tratamiento.")

h("8. Portal del cliente")
h("8.1 Obtener y usar acceso", 2)
steps(["Solicita al administrador un token vigente para tu cliente. Se entrega fuera del chat y por canal seguro.",
       "Abre Portal cliente y pégalo en Token de acceso privado. El campo está protegido visualmente.",
       "Pulsa Consultar documentos.",
       "Revisa nombre/código del cliente y tablas de cotizaciones, pedidos y facturas.",
       "Al terminar pulsa Limpiar consulta; elimina campo y resultados de esta pantalla."])
p("Cada tabla muestra número, estado e importe en la moneda de sus documentos, sin asumir moneda "
  "universal. El endpoint devuelve hasta 20 documentos recientes por categoría. Los contadores son "
  "las filas recibidas, no el total histórico. No permite editar, descargar PDFs certificados ni pagar.")
p("El token no se guarda en localStorage/sessionStorage. Un token da acceso al resumen de ese cliente, "
  "por lo que debe tratarse como contraseña. No enviarlo a un asistente, captura pública ni email masivo.")
h("8.2 Administración de tokens (API)", 2)
steps(["POST /portal/access-tokens con customerId y expiresInDays opcional (1–365; por defecto 30).",
       "Guardar de forma segura el token mostrado solo en la respuesta de creación y entregarlo al cliente correcto.",
       "GET /portal/access-tokens permite listar metadatos/prefijos y filtrar por customerId; no recupera el secreto original.",
       "POST /portal/access-tokens/:id/revoke invalida el acceso. Ante exposición, revocar y crear otro.",
       "Comprobar que un acceso revocado o vencido no devuelve documentos."])
note("Los logs de API redactan este token del path, pero un proxy, APM o gateway externo también debe "
     "configurarse para no registrar el path sensible. No es suficiente proteger solo el frontend.")
image("03-portal.png", "Portal con documentos reales de demostración y token oculto")

h("9. Maestros y preparación de operación (API)")
p("Estos procedimientos requieren integrador/operador autorizado; todavía no hay formularios de "
  "edición completos en Angular. El anexo A recoge las rutas y el anexo B el diccionario de entrada. "
  "Usa la sesión de la empresa correcta; no incluyas companyId para intentar cambiarla.")
table(["Catálogo / POST", "Campos", "Comprobación"], [
    ("/masters/customers", "code, name; email y taxId opcionales", "Guardar id del cliente; consultar GET /masters/customers."),
    ("/masters/products", "sku, name, unitPrice; description opcional", "Precio no implica stock. Guardar id del producto."),
    ("/masters/suppliers", "code, name; email y taxId opcionales", "Usar proveedor de la misma empresa en solicitudes."),
    ("/masters/tax-rates", "code, name, rate, taxType", "taxType: vat, withholding u other. rate se expresa como porcentaje."),
])
steps(["Acordar convenciones de códigos y números de documento con el responsable de empresa.",
       "Crear impuestos antes de referenciarlos en operaciones comerciales o tienda.",
       "Crear productos, clientes y proveedores y conservar sus UUID devueltos.",
       "Registrar saldo inicial justificado en inventario; un producto recién creado no tiene existencia.",
       "Inicializar plan de cuentas antes de contabilizar.",
       "Probar un flujo con datos ficticios antes de cargar información real."])
code('POST /masters/products\n{"sku":"DEMO-001","name":"Producto de prueba","unitPrice":25}')
p("Este ejemplo contiene datos ficticios, no IDs reutilizables. Los catálogos existentes ofrecen "
  "creación/listado; no asumir CRUD, importación masiva o bajas que no figuren en el catálogo de endpoints.")

h("10. Ventas: de cotización a factura (API)")
flow("10.1 Flujo comercial", "Crear una venta trazable sin mezclar decisión comercial y movimiento físico.",
     "Cliente/producto/impuesto del mismo tenant y un admin autorizado.",
     [
         ("1", "POST /commerce/sales/quotations: quotationNumber, customerId, taxRateCode opcional, lines[{productId,quantity,unitPrice?}]", "Respuesta id, status draft, subtotal, taxTotal y grandTotal."),
         ("2", "POST /commerce/sales/quotations/:id/confirm: {orderNumber}", "Cotización approved; devuelve orderId y pedido confirmed."),
         ("3", "POST /inventory/sales/orders/:id/reserve: {locationCode:'MAIN'}", "Stock disponible suficiente y reserva registrada."),
         ("4", "POST /inventory/sales/orders/:id/dispatch: {locationCode:'MAIN'}", "Disminuyen físico y reservado; reserva fulfilled."),
         ("5", "POST /commerce/sales/orders/:id/invoice: {invoiceNumber}", "Devuelve invoiceId; factura issued y pedido invoiced."),
         ("6", "Contabilizar y registrar pagos en capítulo 13", "Asiento y saldo de la factura comprobados."),
     ], "Venta con documentos y movimientos separados, identificados por sus respuestas.",
     "La confirmación comercial no reserva stock automáticamente fuera del checkout web. La factura "
     "tampoco sustituye despacho, contabilidad ni transmisión fiscal. No repetir confirmación o factura ya aplicada.")
h("10.2 Pantalla de facturación", 2)
steps(["Abre Facturación desde la navegación principal e inicia sesión como administrador.",
       "Selecciona un pedido confirmado pendiente de factura e introduce el folio que corresponda a tu proceso autorizado.",
       "Emite una sola vez. Comprueba el número y cliente en la tabla de facturas.",
       "Usa Contabilizar y luego registra cada pago real con referencia única e importe no mayor al saldo.",
       "Comprueba total, pago acumulado, saldo e indicador de contabilización antes de cerrar la operación."])
note("La factura es un documento comercial, no una factura electrónica fiscal. No hay moneda asociada "
     "en el esquema; confirma la moneda antes de emitir. El folio es manual y no existe PDF, nota de crédito ni anulación.")
h("10.3 Revisión y errores", 2)
bullets(["Consulta GET /commerce/sales/quotations para identificar cotizaciones y totales de tu empresa.",
         "Número duplicado: corregir convención o localizar el documento original, no crear copias.",
         "Stock insuficiente: revisar disponible por ubicación, otras reservas y compras pendientes.",
         "Pedido ya facturado o cotización ya aprobada: retomar desde el resultado anterior.",
         "Cancelar, devolver o reabrir son extensiones pendientes si no existe un endpoint explícito; no modificar SQL en producción."])
code('POST /commerce/sales/quotations\n'
     '{"quotationNumber":"COT-DEMO-001","customerId":"<UUID cliente>",'
     '"taxRateCode":"IVA13","lines":[{"productId":"<UUID producto>","quantity":2,"unitPrice":25}]}')

h("11. Compras: solicitud, orden y recepción (API)")
flow("11.1 Flujo de compra", "Aprovisionar productos y reconocer el impacto físico/contable en su orden.",
     "Proveedor/productos/impuesto creados y costos revisados.",
     [
         ("1", "POST /commerce/purchases/requests: requestNumber, supplierId, taxRateCode?, lines[{productId,quantity,unitCost?}]", "Conservar id de solicitud y totales."),
         ("2", "POST /commerce/purchases/requests/:id/approve: {orderNumber}", "Conservar purchaseOrderId."),
         ("3", "POST /commerce/purchases/orders/:id/receive: {receiptNumber}", "Orden con estado received y referencia de recepción."),
         ("4", "POST /inventory/purchases/orders/:id/receive: {locationCode:'MAIN'}", "Existencia física incrementada una sola vez."),
         ("5", "POST /accounting/purchase-orders/:id/post", "Asiento de devengo y obligación registrado."),
     ], "Compra recibida en operación, inventario y contabilidad.",
     "La recepción comercial y la de inventario son endpoints diferentes. No usar un ajuste manual "
     "además de la recepción para el mismo material. El módulo actual no registra todo un ciclo bancario de pagos a proveedor.")
bullets(["Orden todavía no received: completar recepción comercial antes de la física.",
         "Recepción ya aplicada: consultar el saldo y trazabilidad; no duplicar existencias.",
         "Descuadre de costos/impuestos: revisar el documento fuente antes del posteo.",
         "No asumir recepciones parciales, devoluciones ni compras multimoneda avanzadas sin una extensión explícita."])

h("12. Inventario, reservas y ubicación")
p("Ubicación omitida se normaliza a MAIN; los códigos se convierten a mayúsculas. Usa la misma "
  "ubicación al reservar y despachar. Existencia disponible = on_hand − reserved. Las reservas "
  "reducen disponible, no físico; el despacho reduce ambos y marca la reserva fulfilled.")
p("La pantalla Inventario presenta saldos por ubicación y un kardex paginado. Puedes filtrar por "
  "producto; al dejar ubicación vacía se consultan todas. Los ajustes requieren rol administrador "
  "y motivo. Los pedidos confirmados muestran su reserva y ubicación; el despacho solicita una "
  "confirmación adicional y conserva la ubicación reservada.")
table(["Operación", "Endpoint / entrada", "Control del operador"], [
    ("Consulta", "GET /inventory/stock?locationCode=MAIN", "Revisar on_hand, reserved y disponible por producto/ubicación."),
    ("Kardex", "GET /inventory/movements?productId=<UUID>&locationCode=MAIN&page=1&pageSize=50", "Consultar movimientos con filtros y paginación; cantidades positivas, tipo indica su efecto."),
    ("Ajuste", "POST /inventory/adjustments: productId, direction in|out, quantity, locationCode?, notes?", "Cantidad positiva y motivo; es corrección, no sustituto de recepción/despacho."),
    ("Reserva", "POST /inventory/sales/orders/:id/reserve", "Pedido confirmed/invoiced, disponible suficiente y sin reserva ya procesada."),
    ("Despacho", "POST /inventory/sales/orders/:id/dispatch", "Requiere reserva activa y ubicación consistente."),
    ("Recepción", "POST /inventory/purchases/orders/:id/receive", "Orden received; no previamente aplicada al stock."),
])
steps(["Antes: anota producto/ubicación y saldo esperado.",
       "Aplica la operación adecuada y conserva su respuesta.",
       "Después: consulta el saldo y comprueba el cambio exacto.",
       "Si la respuesta fue incierta por desconexión, comprobar primero el estado; no repetir a ciegas.",
       "Ante un descuadre detener el siguiente paso y revisar documentos/auditoría con soporte."])
note("Los bloqueos transaccionales ayudan a proteger el stock. Antes de alto volumen se necesitan "
     "pruebas simultáneas adicionales de recepción, reserva y despacho e idempotencia transversal.")

h("13. Contabilidad, cobros y cierre")
h("13.1 Preparación del plan base", 2)
p("POST /accounting/bootstrap-accounts inicializa cuentas de sistema por empresa, sin recrear "
  "las que ya existan. Este plan base no sustituye el plan legal específico de cada organización.")
table(["Código", "Cuenta"], [
    ("1100", "Cuentas por cobrar"), ("1110", "Caja y bancos"), ("1200", "Inventario"),
    ("1300", "Crédito fiscal"), ("2100", "Cuentas por pagar"), ("2200", "IVA por pagar"),
    ("4100", "Ingresos por ventas"),
])
flow("13.2 Contabilizar y cobrar", "Registrar partida por origen y cobro de una factura.",
     "Factura emitida, plan base inicializado y período habilitado.",
     [
         ("1", "POST /accounting/sales-invoices/:id/post", "Asiento: débito CxC, crédito ingreso e IVA si aplica; journalEntryId."),
         ("2", "POST /accounting/sales-invoices/:id/payments: {paymentReference, amount}", "Pago positivo no superior al saldo; conciliación básica y remainingBalance."),
         ("3", "GET /accounting/reports/trial-balance?fromDate=AAAA-MM-DD&toDate=AAAA-MM-DD", "Revisar cuentas, débitos/créditos y totals.isBalanced."),
         ("4", "POST /accounting/purchase-orders/:id/post para devengo de compras", "Asiento de la compra sin duplicar origen."),
     ], "Factura parcial o totalmente cobrada y evidencias contables balanceadas.",
     "El posteo debe preceder al pago. Una referencia de pago es única por empresa. Saldo cero marca "
     "factura paid; no confundir con conciliación bancaria automática ni importación de extractos.")
h("13.3 Cierre mensual", 2)
steps(["Conciliar documentos, cobros y movimientos del mes con el responsable contable.",
       "Consultar balance con rango correcto y revisar también documentos pendientes de contabilizar.",
       "Ejecutar POST /accounting/periods/close con year y month solo después de autorización.",
       "Guardar evidencia y no asumir posibilidad de reapertura: no se ofrece un proceso completo de reapertura.",
       "Si se rechaza, resolver la causa explícita; no cambiar fechas para saltarse controles."])
p("Balanceado significa igualdad aritmética de débitos/créditos, no exactitud económica ni cumplimiento legal. "
  "La contabilidad actual es un núcleo: no incluye toda la planificación, activos, bancos, consolidación "
  "y obligaciones de una suite financiera completa.")

h("14. Fiscal regional: solo homologación simulada")
note("Los adaptadores GT FEL, SV DTE y DO e-CF son simuladores. Un estado accepted en sandbox "
     "NO es una autorización tributaria real. Envíos con entorno production se rechazan expresamente.")
steps(["Configurar POST /fiscal/providers/config con countryCode GT/SV/DO, providerCode, "
       "environment sandbox, endpointUrl y credentials opcionales de prueba.",
       "Emitir factura comercial y conservar invoiceId.",
       "POST /fiscal/invoices/:id/documents con countryCode y documentType opcional.",
       "POST /fiscal/documents/:id/submit para obtener resultado simulado.",
       "GET /fiscal/documents/:id y GET /fiscal/documents?countryCode=GT para revisar documento, estado y trazabilidad."])
p("endpointUrl es configuración almacenada; el adaptador actual no demuestra una transmisión externa "
  "real. Antes de producción deben implementarse contrato/protocolo de proveedor, firma, certificados, "
  "validaciones nacionales, respuestas, reintentos seguros, contingencia y homologación.")
bullets(["No introducir credenciales fiscales reales en un simulador.",
         "No entregar la captura de sandbox como comprobante fiscal al cliente.",
         "Conservar separación entre factura comercial, asiento contable y documento fiscal.",
         "Verificar también frontend/operación para no presentar 'éxito' ante una respuesta fallida."])

h("15. Recursos humanos: empleados, asistencia y ausencias")
p("El núcleo de RRHH es administrativo por API y aislado por empresa. Las acciones de creación y "
  "decisión requieren admin; no existe portal de autoservicio del empleado ni cálculo de nómina.")
table(["Acción", "Endpoint / entrada", "Resultado"], [
    ("Alta", "POST /hr/employees: employeeCode, fullName; email?, jobTitle?, hireDate?", "UUID de empleado; no crea cuenta de acceso."),
    ("Listado", "GET /hr/employees", "Empleados del tenant."),
    ("Entrada", "POST /hr/attendance/check-in: employeeId, checkInAt?", "UUID del registro de asistencia."),
    ("Salida", "POST /hr/attendance/check-out: attendanceId, checkOutAt?", "Cierra el registro abierto."),
    ("Ausencia", "POST /hr/leave-requests: employeeId, startDate, endDate, reason?", "Solicitud pendiente."),
    ("Decisión", "POST /hr/leave-requests/:id/approve o /reject: {note?}", "Estado aprobado/rechazado y observación."),
    ("Consulta", "GET /hr/leave-requests", "Solicitudes de empresa."),
])
steps(["Crear empleado con código único y fecha laboral revisada.",
       "Registrar entrada; conservar attendanceId para la salida correspondiente.",
       "No crear entradas duplicadas para simular una corrección.",
       "Crear solicitud con rango de fechas y justificación mínima necesaria.",
       "El responsable revisa y aprueba/rechaza; consultar el listado para confirmar el estado."])
note("No almacenar diagnósticos médicos ni información sensible innecesaria en motivos o en el chat. "
     "Las solicitudes no calculan automáticamente vacaciones legales, prestaciones, salarios o impuestos laborales.")

h("16. Configuración de tienda e integración")
p("El administrador configura la tienda desde Diseñador de tienda (Commerce Studio). El catálogo "
  "público consume publicaciones vinculadas a productos e inventario de la empresa. Se pueden ajustar "
  "nombre, slug compartible, moneda, impuesto predeterminado, correo de soporte, publicación, plantilla, "
  "colores, anuncio, portada, textos, orden de secciones y suscripción con consentimiento.")
steps(["Crear productos y saldo inicial en MAIN.",
       "Crear impuesto por código si corresponde y validar política de precios.",
       "Abre Operaciones → Catálogos para crear productos, clientes, proveedores e impuestos.",
       "Abre Diseñador de tienda, completa nombre y slug, moneda, correo y estado Publicar tienda.",
       "Personaliza estilos y contenido; reorganiza secciones con flechas y pulsa Guardar y publicar.",
       "Crea categorías y publicaciones en las pestañas de Catálogo y categorías.",
       "Publicar con POST /ecommerce/admin/listings: productId, slug, title, unitPrice; categoryCode, "
       "descripciones, compareAtPrice, featuredImageUrl, sortOrder, isPublished opcionales.",
       "Abre Vista previa o /shop/<slug> en una pestaña aparte y revisa catálogo, enlace y presentación.",
       "Verificar precio, impuesto, disponibilidad y checkout con un cliente ficticio antes del lanzamiento."])
p("El editor ordena bloques disponibles (portada, categorías, catálogo y suscripción), no ofrece "
  "arrastrar y soltar libre, páginas arbitrarias, dominios personalizados, campañas ni integración de pago. "
  "La URL de imagen principal debe ser HTTPS. El precio de publicación es independiente del precio "
  "maestro; revisa coherencia. Las plantillas son estilos predeterminados, no un constructor Wix completo.")
p("La dirección pública tiene formato /shop/<slug>. La tienda admite búsqueda, categoría, orden, "
  "paginación, disponibilidad, carrito recuperable durante la sesión, consentimiento de marketing y "
  "confirmación de pedido. Al confirmar se valida stock, crea una cotización/pedido y reserva inventario.")
p("Solo productos maestros activos pueden publicarse. Si un producto se desactiva después, deja de "
  "mostrarse y la API rechaza agregarlo al carrito aunque alguien conserve un enlace anterior.")
p("Consultar GET /ecommerce/storefront/:companyCode carga el catálogo público. Las operaciones de "
  "carrito usan cartId y cabecera x-cart-token; estos no son JWT administrativos. No compartirlos "
  "ni registrarlos en un chat o telemetría.")
table(["Paso de integración pública", "Ruta relativa y entrada"], [
    ("Crear carrito", "POST /ecommerce/storefront/:companyCode/carts"),
    ("Agregar", "POST .../carts/:cartId/items con listingId y quantity; x-cart-token"),
    ("Eliminar", "DELETE .../carts/:cartId/items/:itemId; x-cart-token"),
    ("Revisar", "GET .../carts/:cartId; x-cart-token"),
    ("Confirmar", "POST .../carts/:cartId/checkout con customerName, customerEmail; "
     "customerCode?, customerTaxId?, notes?; x-cart-token"),
    ("Suscribir", "POST /ecommerce/storefront/:companyCode/subscribe con email, fullName?, "
     "acceptsMarketing y consentVersion?"),
])

h("17. Compatibilidad XML-RPC")
p("POST /rpc/xmlrpc recibe XML-RPC; es una capa de compatibilidad acotada, no paridad de todos "
  "los modelos/métodos de otra plataforma. Usar HTTPS en redes reales y no incluir XML con "
  "contraseñas/tokens en tickets o logs.")
table(["Método", "Parámetros", "Alcance"], [
    ("common.authenticate", "email, password", "Devuelve uid, company_id, token y roles de esa cuenta."),
    ("object.execute_kw", "token, model, method, payload", "Verifica JWT y deriva empresa; no acepta empresa arbitraria."),
    ("res.company / current", "object.execute_kw", "Empresa del token."),
    ("hr.employee / search_read", "object.execute_kw", "Empleados del tenant."),
    ("sale.order / search_read", "payload.limit opcional", "Pedidos recientes; predeterminado 50, acotado 1–200."),
])
p("Otros métodos producen error explícito. No asumir creación, actualización o borrado por RPC. "
  "Una respuesta XML-RPC puede contener un fault aunque el transporte HTTP funcione: analizar "
  "la estructura, no solo el código HTTP.")

h("18. Ayuda contextual, soporte y futuro chat")
steps(["Abre Ayuda desde la barra superior.",
       "Lee los pasos de la pantalla actual.",
       "Si necesitas soporte pulsa Preparar diagnóstico seguro.",
       "Revisa el JSON antes de compartirlo por el canal autorizado.",
       "Añade una descripción breve: qué intentabas, qué ocurrió y cuándo; sin nombres de clientes, "
       "importes sensibles, contraseñas o tokens."])
code('{"schemaVersion":1,"screen":"/portal","title":"Portal cliente",'
     '"incident":{"status":401,"reference":null}}')
p("El diagnóstico contiene ruta allowlisted sin query, título genérico y status/referencia validada "
  "del último error cuando existe. Una referencia no permite leer registros de otros usuarios. "
  "No exporta DOM, formularios, companyId ni información del cliente.")
note("No hay chat IA conectado ni llamadas de inferencia externas. La ayuda actual no ejecuta "
     "acciones ni corrige registros. No enviar información real a un proveedor hasta aprobar privacidad y arquitectura.")
p("Diseño futuro recomendado: gateway backend autenticado, conocimiento del manual versionado, "
  "herramientas read-only con autorización server-side, citas, minimización y consentimiento. "
  "Las escrituras exigirán confirmación explícita, idempotencia y auditoría; el modelo nunca decide permisos. "
  "Consultar docs/REVISION_UI_SEGURIDAD_IA.md para el contrato propuesto y pruebas de prompt injection.")
image("09-help.png", "Ayuda local y diagnóstico sin credenciales")

h("19. Errores, recuperación y controles diarios")
table(["Síntoma / status", "Interpretación", "Acción segura"], [
    ("400", "Datos o transición inválida", "Revisar campos, estado, ubicación y documento fuente; no repetir sin corregir."),
    ("401", "Sesión/token incorrecto, vencido o revocado", "Login nuevo o token portal nuevo; no compartir el anterior."),
    ("403", "Acción no autorizada o alta deshabilitada", "Solicitar permiso; no cambiar IDs, roles o empresa en la petición."),
    ("404", "Recurso no disponible en ese contexto", "Verificar UUID y empresa con el operador autorizado."),
    ("409", "Código/referencia ya existente", "Buscar el original y conciliar antes de crear otro."),
    ("429", "Límite de solicitudes", "Esperar la ventana indicada; no reintentar en bucle."),
    ("500 / proxy / red", "Problema servidor/conectividad", "Anotar hora, pantalla y referencia; revisar health y logs redactados."),
    ("Sin tienda", "Código/configuración/publicación o fallo red", "Comprobar el código con la empresa y las publicaciones."),
    ("Stock insuficiente", "Disponible menor a lo solicitado", "Revisar ubicación y reservas; reducir cantidad o recibir existencias."),
    ("Sin datos gráfico", "No hay pedidos del período o sin permisos de serie", "Distinguir estado vacío de error; actualizar y revisar agrupación."),
])
h("19.1 Apertura y cierre diario", 2)
bullets(["Inicio: revisar health y empresa activa; confirmar stock/precios, pedidos pendientes y novedades.",
         "Durante operación: conservar números/UUID de cada paso y revisar respuesta; no asumir que crear implica despachar/postear.",
         "Fin: conciliar pedidos, reservas, recepciones y cobros; reportar errores con diagnóstico mínimo.",
         "Seguridad: revocar accesos portal expuestos, cerrar sesión y no dejar contraseñas en pantallas.",
         "Contabilidad: los cierres de período son autorizados, no un botón rutinario de cierre de navegador."])
h("19.2 Respaldo y actualizaciones", 2)
steps(["Respaldar PostgreSQL antes de migrar; cifrar y restringir acceso al backup.",
       "Probar restauración en una base aislada y comparar recuentos/documentos clave.",
       "Leer cambios de API y ejecutar builds/unitarias/e2e en entorno de validación.",
       "Aplicar migraciones pendientes en orden y parar si falla alguna.",
       "Verificar health, login, tenant, tienda, stock, portal y flujos críticos tras desplegar.",
       "Nunca usar docker compose down -v como método de actualización."])
p("No hay pantalla completa de auditoría o restauración. El equipo autorizado debe consultar "
  "audit_log y registros con mínimo privilegio y redacción, no entregarlos directamente al usuario o a una IA.")

h("20. Criterios de aceptación, límites y recomendaciones")
p("Se ejecutaron builds de API/Angular, 28 pruebas unitarias API, 19 e2e API y 11 de frontend. "
  "El navegador real comprobó login con Enter, dashboard de DB, carrito, checkout con aumento exacto "
  "de reserva, consentimiento, portal con revocación y diagnóstico sin tokens. Se comprobaron seis "
  "rutas en cuatro anchos: 320/390/768/1440, sin overflow global y sin errores de ejecución de página.")
p("Los procesos internos sin UI se validan con pruebas de backend y procedimientos API, no "
  "con pantallas inexistentes. npm audit --omit=dev reportó cero avisos conocidos al verificar las "
  "dependencias de producción; no implica ausencia de riesgos ni cubre herramientas de desarrollo.")
p("El audit completo sí detectó avisos en desarrollo: API 23 moderados y 5 bajos; frontend "
  "16 moderados. No hubo altos/críticos en esos informes. `npm audit fix` compatible actualizó "
  "babel-plugin-istanbul 8.0.0 a 8.0.2, pero no redujo el total: continúan glob 13.0.x, "
  "minimatch 10.2.6 y deepmerge 4.3.1 en herramientas dev. El fix automático restante exige "
  "Nest CLI 12 / Angular CLI 22 (saltos mayores), por lo que queda para migración aislada con CI. "
  "No exponer servidores de desarrollo a Internet.")
p("Advisories: https://github.com/advisories/GHSA-3g3m-2fjr-6pw4 ; "
  "https://github.com/advisories/GHSA-g3hv-75wg-m249 ; "
  "https://github.com/advisories/GHSA-gcqx-w48m-w2h4")
bullets(["Antes de producción: terminar administración de usuarios/roles, recuperación/MFA y pantallas operativas necesarias.",
         "Implementar proveedor fiscal real y pasarela de pago solo si se necesitan; la base actual no los sustituye.",
         "Endurecer sesión con evaluación BFF/cookies HttpOnly/CSRF, rate limit distribuido, CSP frontend y secretos gestionados.",
         "Añadir pruebas simultáneas e idempotencia transversal en operaciones sensibles.",
         "Completar auditoría accesible con lectores de pantalla/zoom/contraste y pruebas con usuarios.",
         "Revisar políticas de privacidad, consentimiento, retención y seguridad antes de datos reales o chat externo."])
image("07-processes.png", "Guía de procesos: orden, canal y límites por módulo")

h("Anexo A. Catálogo de endpoints generado desde controladores")
p("Prefijos: desde navegador de desarrollo usar /api antes de estas rutas; en API directa puerto 3001 "
  "no existe ese prefijo. :id y otros parámetros se sustituyen por identificadores válidos. "
  "Las autorizaciones de esta tabla reflejan decoradores; algunos endpoints públicos exigen token "
  "de portal o carrito. Ver procedimiento específico antes de llamar.")
endpoint_count = 0
for source in sorted((ROOT / "api" / "src").rglob("*.controller.ts")):
    text = source.read_text(encoding="utf-8-sig")
    controller = re.search(r"@Controller\((?:'([^']*)')?\)", text)
    if not controller:
        continue
    prefix = controller.group(1) or ""
    matches = list(re.finditer(r"@(Get|Post|Delete|Patch|Put)\((?:'([^']*)')?\)", text))
    if not matches:
        continue
    h(prefix or "Servicio raíz", 2)
    class_text = text[:matches[0].start()]
    # Class decorators occur before `export class`, method decorators after it.
    class_decorators = class_text.split("export class")[0]
    guarded = "@UseGuards(AuthGuard)" in text
    class_admin = "@Roles('admin')" in class_decorators
    rows = []
    for index, match in enumerate(matches):
        block = text[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(text)]
        roles = "admin" if class_admin or "@Roles('admin')" in block else ("JWT" if guarded else "Público*")
        route = "/" + "/".join(part.strip("/") for part in [prefix, match.group(2) or ""] if part)
        rows.append((match.group(1).upper(), route, roles))
        endpoint_count += 1
    table(["Método", "Ruta", "Acceso declarado"], rows)
    p("Fuente: " + str(source.relative_to(ROOT)).replace("\\", "/"), "Caption")
note("Público* no significa sin controles: bootstrap requiere habilitación temporal; portal exige token "
     "vigente; carritos exigen x-cart-token en sus acciones. Health/tienda no conceden sesión administrativa. "
     "AuthGuard también aplica las restricciones de roles correspondientes.")

h("Anexo B. Diccionario de entradas API")
p("Campos generados de los contratos TypeScript actuales. «Opcional» significa que el contrato "
  "permite omitirlo; validaciones y reglas del procedimiento siguen aplicando. En los cuerpos inline "
  "de transiciones usar los campos indicados en los capítulos funcionales.")
for source in sorted((ROOT / "api" / "src").rglob("*.types.ts")):
    text = source.read_text(encoding="utf-8-sig")
    for match in re.finditer(r"export type (\w+(?:Input)) = \{(.*?)^\};", text, re.S | re.M):
        fields = re.findall(r"^\s+(\w+)(\?)?:\s*(.*?);", match.group(2), re.M)
        if not fields:
            continue
        h(f"{source.parent.name} · {match.group(1)}", 2)
        table(["Campo", "Obligatoriedad del contrato", "Tipo / valores"], [
            (name, "Opcional" if optional else "Requerido", kind)
            for name, optional, kind in fields
        ])
p("Las líneas de ventas usan productId, quantity y unitPrice opcional; las de compra productId, "
  "quantity y unitCost opcional. Reutiliza únicamente UUID de la empresa autenticada.")

h("Anexo C. Uso seguro de API y ejemplo de integración")
p("Ejemplo PowerShell local para un operador autorizado. El correo se pide interactivamente y "
  "la contraseña no se escribe en el script. No imprimir el resultado completo del login ni "
  "guardar el bearer en documentos. Las llamadas siguientes están limitadas al origen local.")
code("$base = 'http://127.0.0.1:3001'\n"
     "$credentials = Get-Credential -Message 'Cuenta autorizada de empresa'\n"
     "$loginBody = @{ email = $credentials.UserName;\n"
     "  password = $credentials.GetNetworkCredential().Password } | ConvertTo-Json\n"
     "$session = Invoke-RestMethod \"$base/auth/login\" -Method Post `\n"
     "  -ContentType 'application/json' -Body $loginBody\n"
     "$headers = @{ Authorization = 'Bearer ' + $session.access_token }\n"
     "Invoke-RestMethod \"$base/companies/current\" -Headers $headers\n"
     "Invoke-RestMethod \"$base/inventory/stock?locationCode=MAIN\" -Headers $headers\n"
     "Remove-Variable session,headers,loginBody,credentials")
p("Antes de un POST administrativo revisa la empresa actual, forma del cuerpo, duplicados y "
  "estado. Ante un error no transformar la respuesta en un éxito ni sustituir campos por valores "
  "ficticios. Un cliente de integración debe usar timeouts, cancelación, validación e idempotencia "
  "según el endpoint y evitar reintentar automáticamente operaciones no idempotentes.")

h("Anexo D. Glosario")
table(["Término", "Significado"], [
    ("Tenant / empresa", "Contexto empresarial aislado lógicamente dentro del esquema compartido."),
    ("JWT / Bearer", "Credencial temporal de sesión; no debe compartirse ni enviarse a terceros."),
    ("UUID", "Identificador técnico de un registro; distinto de su código o número visible."),
    ("Disponible", "Existencia física menos reservada."),
    ("Reserva", "Compromiso de unidades para pedido; no salida física."),
    ("Posteo", "Registro de asientos derivados de un documento comercial."),
    ("Sandbox", "Entorno de pruebas; aquí fiscal simulado, sin validez de emisión legal."),
    ("Correlation ID", "Referencia de diagnóstico validada; no contiene credenciales ni otorga permisos."),
    ("API-first / headless", "Lógica expuesta por servicios; no implica que exista pantalla para toda operación."),
    ("RAG", "Consulta de conocimiento documentado para asistencia IA futura, con fuentes y control de acceso."),
])
h("Anexo E. Referencias y control documental")
bullets(["docs/DESPLIEGUE_LOCAL.md: arranque, entorno y operación segura.",
         "docs/REVISION_UI_SEGURIDAD_IA.md: cambios, evidencia, pendientes y diseño futuro de asistencia.",
         "WCAG 2.2: https://www.w3.org/WAI/WCAG22/quickref/",
         "Angular Security: https://angular.dev/best-practices/security",
         "Carbon Data Table: https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines",
         "OWASP LLM Prompt Injection Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html"])
p("Capturas: navegador Chrome con API y DB locales, sin respuestas mock. Se renovaron las imágenes "
  "antiguas; no se incluyen tokens visibles, contraseñas ni datos reales. Los conteos de demostración "
  "pueden variar tras repetir pruebas y no constituyen una plantilla de saldos iniciales.")
p("Validación documental: estructura DOCX, imágenes, encabezados, catálogo y ausencia de patrones "
  "de secretos. La paginación final depende del procesador Word instalado; las capturas largas "
  "se segmentan para no exceder el área imprimible.")
contents.text = "\n".join(chapters)
doc.save(OUTPUT)
print(json.dumps({"document": OUTPUT.name, "chapters": len(chapters),
                  "figures": figure, "endpoints": endpoint_count, "tables": len(doc.tables)}, ensure_ascii=False))
