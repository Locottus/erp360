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
header.text = "ERP360  |  Operación y configuración  |  Edición 3.12"
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
p(f"Edición 3.12 · Generado {datetime.now():%Y-%m-%d} · Idioma: español")
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
    ("Empresas y usuarios", "Mi empresa, Usuarios y Acceso", "Perfil e identidad revisionados con motivo/auditoría, invitaciones y revocación. Sin MFA ni membresías multiempresa."),
    ("Maestros", "Catálogos, Operaciones y API", "Alta, edición, desactivación, exportación JSON e importación atómica de hasta 200 altas."),
    ("Ventas / compras", "Operaciones, Recepciones y API", "Recepciones parciales con ingreso físico atómico; devengo al completar y devolución con crédito proporcional."),
    ("Inventario", "Inventario, Control operativo y API", "Saldos, kardex, reservas, despacho, transferencias, conteos y reposición sugerida; sin valoración, lotes ni series."),
    ("Facturación comercial", "Facturación, Control operativo y API", "Folio automático opcional, moneda en documentos nuevos, PDF, crédito total y reembolso registrado. Sin certificación fiscal."),
    ("Contabilidad", "Libro mayor, Operaciones y API", "Plan base, asientos por origen, pagos, apertura/acumulado exactos por cuenta, balance y cierre. No suite financiera completa."),
    ("Fiscal GT/SV/DO", "API sandbox", "Adaptadores simulados; producción bloqueada, sin certificación legal."),
    ("RRHH", "Operaciones, Personas y API", "Empleados, bajas, jornadas y cancelación auditada de ausencias. No nómina ni saldos legales."),
    ("eCommerce", "Estudio, tienda pública y Control operativo", "Checkout idempotente, reserva MAIN, dirección, seguimiento manual y baja privada. Sin cobro, flete ni transportista externo."),
    ("Portal", "Consulta web + API administrativa", "Token temporal, hasta 20 cotizaciones/pedidos/facturas recientes por categoría."),
    ("XML-RPC", "API", "Solo los métodos compatibles documentados; no todos los de un ERP legado."),
    ("Ayuda y futuro chat", "Ayuda mock local", "Respuestas predefinidas y contexto mínimo opt-in. Sin proveedor IA, lectura de documentos ni escrituras."),
    ("Cartera SaaS", "Consola de plataforma y Mi suscripción", "Contratos por módulos, facturas internas, ingresos recibidos y seguimiento. Sin cobro bancario ni bloqueo automático."),
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
  "es un registro laboral, no una cuenta con acceso. Usuarios administra invitaciones y roles existentes. "
  "No hay cambio libre de empresa; para otro contexto se necesita una cuenta autorizada.")
h("3.2 Alta inicial controlada", 2)
steps(["El responsable de infraestructura habilita BOOTSTRAP_ENABLED=true temporalmente y reinicia API en una red restringida.",
       "Abre Acceso y expande Alta inicial de una empresa nueva.",
       "Introduce código único (letras/números/_/-, máximo 32), nombre, administrador, correo válido y contraseña de 12 o más caracteres.",
       "Crea la empresa; un código o correo ya registrado produce rechazo. El alta no agrega administradores a empresas existentes.",
       "Desactiva la bandera y reinicia API; luego inicia sesión con la cuenta creada."])
note("No habilites el alta pública para resolver una contraseña olvidada ni para dar acceso a otro empleado. "
     "Invita desde Usuarios en la empresa existente. No uses el alta inicial como recuperación.")
h("3.3 Iniciar y terminar sesión", 2)
steps(["Abre Acceso. Introduce Correo de trabajo y Contraseña.",
       "Puedes pegar/autocompletar credenciales y usar Mostrar contraseña si el entorno es privado.",
       "Pulsa Entrar a mi empresa o Enter. La aplicación abre el dashboard.",
       "Comprueba el nombre de usuario y código/nombre de empresa de la barra superior antes de operar.",
       "Al terminar pulsa Cerrar sesión. En equipos compartidos cierra también las pestañas."])
p("La sesión se almacena en sessionStorage, no en localStorage; puede sobrevivir recargas de la pestaña. "
  "La vigencia del JWT es 8 horas. Cerrar sesión revoca TODAS las sesiones de la cuenta en el servidor. "
  "La API y XML-RPC comprueban usuario/empresa activos, roles actuales y versión de sesión. "
  "Un 401 en API privada termina la sesión local; si el logout no llega al servidor, se muestra error "
  "y la limpieza local no garantiza revocación remota.")
table(["Situación", "Qué hacer"], [
    ("Correo o contraseña incorrectos", "Contactar al administrador para una clave privada de recuperación. No hay envío automático por correo."),
    ("Alta deshabilitada", "Es el estado normal. Solo infraestructura puede habilitar una ventana controlada."),
    ("Empresa ya existe", "No reintentar con otros correos para asumirla; solicitar acceso por un canal administrativo."),
    ("Error de conexión", "Comprobar health, proxy y DB; usar Ayuda para generar referencia sin credenciales."),
])
image("06-login.png", "Acceso con campos etiquetados y alta inicial separada")
h("3.4 Invitar, activar, recuperar y desactivar", 2)
steps(["Como administrador abre Usuarios. Introduce nombre, correo y roles existentes para invitar.",
       "Copia la clave de activación que se muestra una sola vez. Entrégala por un canal privado; no uses URL, chat ni capturas.",
       "La persona abre Acceso → activación/restablecimiento, pega la clave y define una contraseña de 12 a 256 caracteres.",
       "La clave de activación vence a las 24 horas y solo sirve una vez. No es una contraseña ni inicia sesión por sí sola.",
       "Para recuperar acceso, genera una nueva clave desde Usuarios: vence en una hora e invalida claves anteriores.",
       "Edita nombre, estado o roles con autorización y motivo de 10 a 1000 caracteres. Conserva la revisión cargada; los cambios revocan sesiones anteriores.",
       "Si aparece conflicto, actualiza la lista y pulsa Editar de nuevo: revisa los cambios ajenos antes de reintentar. No se sobrescriben ediciones simultáneas.",
       "Para una incidencia usa Revocar sesiones. No se permite quitar o desactivar al último administrador activo."])
note("El rol sales permite consultar clientes, cotizaciones, pedidos, facturas, PDF comercial y "
  "pedidos de surtido de la empresa; purchases permite consultar proveedores y solicitudes de compra. "
  "El balance contable, los documentos fiscales y los datos privados de RRHH requieren admin. "
  "Las escrituras comerciales, contables y de inventario siguen reservadas a admin. La consulta de "
  "ventas no distingue por vendedor; no existe aún un rol contable independiente. Productos, "
  "impuestos y saldos de inventario siguen accesibles a usuarios autenticados de la empresa. "
  "No hay MFA ni correo transaccional automático.")
image("12-users.png", "Administración de usuarios de una empresa ficticia")
image("25-user-revision.png", "Edición de usuario con revisión, motivo y roles; sin clave de activación visible")
h("3.5 Actualizar el perfil de la empresa", 2)
steps(["Como administrador abre Mi empresa y verifica el código inmutable de la empresa autenticada.",
       "Revisa nombre e identificación tributaria. Vaciar identificación la retira de forma explícita; no constituye validación fiscal.",
       "Introduce motivo de 10 a 1000 caracteres y pulsa Guardar perfil de empresa.",
       "El nombre actualizado aparece en la barra superior sin cambiar de tenant. Se conserva auditoría antes/después, actor y motivo.",
       "Ante conflicto pulsa Recargar perfil y revisa la versión actual antes de editar nuevamente."])
note("Solo se actualizan nombre e identificación tributaria: no código, país, moneda, actividad, usuarios ni contrato SaaS. "
     "Las facturas con instantánea conservan el nombre de emisión. Los PDF legados sin instantánea muestran datos "
     "descriptivos actuales con un aviso; no se inventan ni reescriben instantáneas históricas.")
p("API: PATCH /companies/current requiere name, taxId (texto o null explícito), expectedRevision y reason. "
  "PATCH /auth/users/:id ahora requiere expectedRevision (management_revision del listado) y reason "
  "además de fullName, roles e isActive. Los clientes anteriores deben actualizar sus cuerpos; no se admite "
  "omitir revisión para saltar el control de concurrencia.")
image("26-company-profile.png", "Perfil empresarial revisionado y alcance explícito de los cambios")

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
       "Elige recoger en tienda o solicitar envío; para envío completa dirección y teléfono. Su costo se cotiza aparte y no está incluido.",
       "Lee el aviso: se creará un pedido y se reservará inventario, sin cobro en línea.",
       "Pulsa Confirmar pedido una sola vez. Espera el mensaje con número de pedido y consérvalo.",
       "Si hay un error, revisa disponibilidad y pide al operador comprobar si se creó el pedido "
       "antes de reintentar tras una desconexión.",
       "El operador continúa despacho, factura y cobro por los procesos administrativos."])
p("El checkout crea un cliente invitado separado: no asocia una identidad existente por correo/código "
  "sin verificar. Genera documentos y reserva únicamente en MAIN; el catálogo muestra la misma ubicación. "
  "No conecta tarjeta, banco, transportista ni calcula flete. El seguimiento administrativo es manual "
  "en Control operativo. No reserves de nuevo un pedido web.")
note("El servidor bloquea el carrito y serializa confirmaciones: repetir checkout del mismo carrito "
     "devuelve el mismo número sin duplicar pedido/reserva. Un cambio de precio, publicación o producto "
     "obliga a revisar y actualizar el carrito antes de confirmar. No reutilices el carrito para otra compra.")
image("08-checkout.png", "Confirmación de pedido sin pasarela de pago")

h("7. Suscripción de clientes por empresa")
steps(["Carga la tienda correcta antes de suscribirte.",
       "En Suscríbete a novedades indica nombre opcional y correo válido.",
       "Marca de forma voluntaria la casilla de consentimiento; no está preseleccionada.",
       "Pulsa Suscribirme y espera Suscripción registrada correctamente.",
       "Guarda la clave privada de baja que se muestra una vez. No la publiques ni la captures.",
       "Para dejar de recibir comunicaciones, pega la clave en Cancelar suscripción al pie de la tienda.",
       "Si perdiste la clave, contacta al soporte de la empresa; el administrador también puede registrar la baja."])
p("El registro de suscriptor se segmenta por empresa. No es una cuenta de acceso, un token de portal "
  "ni un cobro periódico. La baja pública requiere la clave privada y guarda solo su hash; no necesita login. "
  "Volver a suscribirse emite una clave nueva que reemplaza la anterior. No hay campañas, correo automático "
  "ni double opt-in: configurar privacidad y cumplimiento antes de marketing real.")
table(["Acción del administrador (API)", "Datos / resultado"], [
    ("GET /ecommerce/admin/subscribers", "Lista registros de la empresa autenticada."),
    ("POST /ecommerce/admin/subscribers/:id/unsubscribe", "Marca baja del registro de esa empresa."),
    ("POST /ecommerce/storefront/:companyCode/unsubscribe", "Cuerpo {token}; clave privada, no correo. Puede repetirse sin volver a activar la suscripción."),
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

h("9. Maestros y preparación de operación")
p("Catálogos ofrece altas, edición y desactivación para administradores. "
  "El anexo A recoge las rutas y el anexo B el diccionario de entrada. "
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
p("Este ejemplo contiene datos ficticios, no IDs reutilizables.")
h("9.1 Editar, desactivar e importar", 2)
steps(["Abre Catálogos, selecciona clientes/productos/proveedores/impuestos y busca el registro.",
       "Selecciona Editar, modifica campos permitidos y guarda. Código/SKU existente es inmutable.",
       "Desactiva en lugar de borrar para conservar historial. Los nuevos documentos rechazan clientes/proveedores inactivos.",
       "No se puede desactivar un impuesto todavía predeterminado en la tienda; cambia primero la configuración.",
       "Exporta JSON para obtener el formato de importación. La exportación es del catálogo seleccionado, no un respaldo completo.",
       "Prepara un arreglo JSON con hasta 200 registros NUEVOS y códigos únicos. No es CSV ni actualización masiva.",
       "Importa y revisa resultado. Si falla un registro, se revierte TODO el lote; corrige antes de repetir."])
image("13-catalogs.png", "Edición e intercambio JSON de maestros")

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
       "Selecciona un pedido confirmado: deja folio vacío para AUTO-INV por empresa, o escribe una referencia comercial propia.",
       "Emite una sola vez. Comprueba el número y cliente en la tabla de facturas.",
       "Usa Contabilizar y luego registra cada pago real con referencia única e importe no mayor al saldo.",
       "Comprueba total, moneda, pago acumulado, saldo e indicador de contabilización.",
       "Pulsa Descargar PDF para guardar el documento comercial. Conserva el archivo en el expediente autorizado."])
note("No es factura electrónica fiscal. Documentos nuevos copian la moneda empresarial (USD inicial); "
     "los históricos sin moneda NO se etiquetan retroactivamente. No existe conversión multimoneda. "
     "Nuevas facturas conservan snapshot de empresa, cliente y descripciones; el PDF histórico sin snapshot lo advierte. "
     "El folio automático comercial no reemplaza numeración fiscal autorizada.")
p("No escribas prefijos reservados AUTO-INV, WEBQ o WEBO en folios manuales; "
  "para factura automática deja el campo vacío. La secuencia omite números históricos ya ocupados.")
image("16-invoicing.png", "Facturas comerciales, moneda explícita y descarga PDF")
h("10.3 Revisión y errores", 2)
bullets(["Consulta GET /commerce/sales/quotations para identificar cotizaciones y totales de tu empresa.",
         "Número duplicado: corregir convención o localizar el documento original, no crear copias.",
         "Stock insuficiente: revisar disponible por ubicación, otras reservas y compras pendientes.",
         "Pedido ya facturado o cotización ya aprobada: retomar desde el resultado anterior.",
         "Para cancelar o acreditar usa Control operativo según el estado. No modificar SQL directamente."])
h("10.4 Cancelar, acreditar y devolver", 2)
steps(["Antes de facturar/despachar, abre Control operativo → Cancelar pedido sin entrega y elige venta o compra.",
       "Escribe un motivo de 10 a 1000 caracteres y confirma. La venta libera reservas sin cambiar el físico.",
       "Una venta facturada/despachada o una compra recibida/contabilizada no admite cancelación simple.",
       "Para una factura CONTABILIZADA usa Nota de crédito total. Selecciona factura y motivo.",
       "Marca devolución física SOLO si se recibió toda la mercancía despachada. Si no hubo despacho, las reservas se liberan sin sumar físico.",
       "Confirma: se crea AUTO-CN, reversión contable, factura void y pedido cancelled en una transacción.",
       "Los cobros anteriores se conservan. Consulta Saldos a devolver y registra cada reembolso realmente efectuado con referencia e importe.",
       "El importe de reembolso no puede exceder lo cobrado menos lo ya devuelto. Se registra su asiento; no se envía dinero.",
       "Si acreditaste sin retorno y la mercancía llega después, en la tabla de notas usa Retorno físico posterior: referencia única, motivo y confirmación de recepción TOTAL.",
       "Confirma Registrar retorno físico total. Se repone una sola vez en las ubicaciones originales del despacho, sin volver a acreditar ni reembolsar."])
note("Crédito y retorno físico solo TOTALES, una vez por factura. No hay crédito ni retorno parcial "
     "de venta. No anula documentos fiscales. El crédito requiere período abierto "
     "y cuentas contables base. Para una factura no contabilizada, revisar/postear antes de acreditar.")
note("El retorno físico posterior no crea asiento financiero adicional: registra la fecha real del "
     "movimiento de almacén, incluso si el crédito pertenece a un mes cerrado. La valoración/COGS "
     "sigue pendiente. Sin despacho no se ofrece retorno; si ya se devolvió al acreditar, se rechaza repetirlo.")
code('POST /commerce/sales/quotations\n'
     '{"quotationNumber":"COT-DEMO-001","customerId":"<UUID cliente>",'
     '"taxRateCode":"IVA13","lines":[{"productId":"<UUID producto>","quantity":2,"unitPrice":25}]}')
h("10.5 Vigencia y revisión de cotizaciones", 2)
steps(["En Operaciones → Ventas crea la cotización. Válida hasta es opcional; sin fecha conserva vigencia ilimitada.",
       "La fecha incluye todo el día en UTC. El servidor rechaza fechas inexistentes y nuevas fechas pasadas.",
       "En Cotizaciones y pedidos revisa Vigencia UTC. Una vencida sigue siendo borrador, pero ya no permite confirmar.",
       "Para renovarla abre Revisar vigencia de cotización, selecciona el borrador y revisa precios/condiciones.",
       "Indica fecha nueva y motivo de 10 a 1000 caracteres. Retirar fecha de caducidad elimina el límite solo si lo eliges explícitamente.",
       "Marca la revisión de condiciones y pulsa Guardar nueva vigencia. Se conserva auditoría de la fecha anterior.",
       "Si devuelve conflicto, actualiza: otra persona pudo confirmar o revisar la oferta. No sobrescribas una revisión más reciente.",
       "Confirma el pedido únicamente después de revisar la oferta vigente. La renovación no cambia precios ni recalcula impuestos."])
p("API: validUntil opcional en POST /commerce/sales/quotations; GET devuelve valid_until, "
  "revision e is_expired. PATCH /commerce/sales/quotations/:id/validity recibe "
  "{validUntil, expectedRevision, reason}; null retira la fecha. Solo admin de la misma "
  "empresa puede revisar borradores. Confirmar vencidas produce 409 sin crear pedido. "
  "Un pedido ya aprobado no caduca retroactivamente.")
note("Adaptación propia basada en el proceso observado en la fuente local de Odoo, no una copia "
     "de su código. Usamos UTC deliberadamente. No se implementan firma de oferta, aceptación "
     "pública ni pago del portal. Si cambian precios o líneas, crea una cotización nueva; "
     "renovar la vigencia no autoriza a cambiar condiciones económicas silenciosamente.")
image("24-quotation-validity.png", "Vigencia de cotización y revisión auditada desde Operaciones")

h("11. Compras: recepciones parciales y devoluciones")
flow("11.1 Flujo de compra", "Aprovisionar productos y reconocer el impacto físico/contable en su orden.",
     "Proveedor/productos/impuesto creados y costos revisados.",
     [
         ("1", "POST /commerce/purchases/requests: requestNumber, supplierId, taxRateCode?, lines[{productId,quantity,unitCost?}]", "Conservar id de solicitud y totales."),
         ("2", "POST /commerce/purchases/requests/:id/approve: {orderNumber}", "Conservar purchaseOrderId."),
         ("3", "Recepciones → seleccionar compra aprobada", "Líneas pedidas, recibidas y pendientes con su costo."),
         ("4", "Referencia, ubicación y cantidades reales → Confirmar recepción e inventario", "Lote e ingreso físico atómicos; partially_received hasta completar."),
         ("5", "POST /accounting/purchase-orders/:id/post", "Asiento de devengo y obligación registrado."),
     ], "Compra recibida en operación, inventario y contabilidad.",
     "La recepción nueva actualiza inventario directamente; NO ejecutar después la aplicación total histórica ni un ajuste por el mismo material. "
     "El devengo sigue siendo por la orden completa, no contabilidad de cada entrega parcial.")
h("11.2 Recibir una entrega parcial desde la pantalla", 2)
p("En Operaciones → Compras pulsa Ver detalle de la solicitud para revisar proveedor, moneda, productos, "
  "cantidades, costos y totales antes de aprobar o rechazar. Es una consulta independiente: vuelve a "
  "cargarla y actualiza la lista si el estado cambia; la revisión no bloquea el documento. "
  "GET /commerce/purchases/requests/:id está disponible para admin y purchases de la empresa autenticada. "
  "La pantalla de Operaciones requiere admin. Si faltan líneas, investiga antes de aprobar.")
p("Antes de aprobar, el administrador puede rechazar una solicitud abierta en Operaciones → Compras: "
  "escribe un motivo de 10 a 1000 caracteres y pulsa Rechazar solicitud. Se conserva el motivo en auditoría "
  "y en el listado; no se crea una orden. El rechazo no es reversible ni sustituye la cancelación o devolución "
  "de una orden ya aprobada. Si otra persona aprueba o rechaza simultáneamente, actualiza el estado antes de continuar. "
  "API: POST /commerce/purchases/requests/:id/reject con {reason}.")
image("29-purchase-rejection.png", "Solicitud de compra rechazada con motivo auditado")
steps(["Crea solicitud con proveedor/productos activos en Operaciones → Compras y apruébala con número de orden único.",
       "Abre Recepciones en el menú, o Recibir por cantidades desde el seguimiento de compras.",
       "Selecciona la orden. Revisa producto, cantidad pedida, recibido acumulado, pendiente y costo unitario.",
       "Escribe referencia única del comprobante de entrega y ubicación explícita (por ejemplo MAIN); los códigos se normalizan a mayúsculas.",
       "Introduce cantidades SOLO de lo físicamente recibido. Deja cero las otras líneas. Se admiten hasta cuatro decimales y no más del pendiente.",
       "Marca la confirmación física y envía. Se crea lote, snapshot del costo de orden, kardex y saldo en una transacción.",
       "El estado es Recibida parcialmente mientras falte alguna línea. Repite con otra referencia para cada entrega real.",
       "Cuando todas las líneas estén completas, usa Contabilizar compra completa. Inicializa las cuentas base y comprueba período abierto."])
table(["Ejemplo: orden de 5 unidades", "Qué introducir", "Resultado esperado"], [
    ("Primera entrega", "RCV-001, MAIN, cantidad 2", "Físico +2, recibido 2, pendiente 3, estado parcial."),
    ("Segunda entrega", "RCV-002, MAIN, cantidad 3", "Físico +3, recibido 5, pendiente 0, estado completo."),
    ("Reintento por conexión", "Misma referencia y mismos datos", "Mismo receiptId, replayed=true; NO aumenta físico."),
    ("Referencia con otros datos", "RCV-001 cambiando cantidad/ubicación/orden", "409; verificar documento antes de reintentar."),
])
p("API nueva: GET /inventory/purchases/orders/:id/receipts devuelve líneas, lotes, remanentes, "
  "histórico legado y devoluciones. POST al mismo endpoint exige reference, locationCode y "
  "lines[{lineId,quantity}]. lineId es el UUID de línea de orden, no el UUID de producto. "
  "Máximo 200 líneas por envío; no se admiten duplicadas. Las referencias son únicas por empresa.")
h("11.3 Devolver mercancía al proveedor", 2)
steps(["Completa y contabiliza la compra antes de devolver. No está soportada la devolución mientras aún faltan entregas.",
       "En Recepciones selecciona la compra y revisa Devolución a proveedor: cada lote indica referencia, ubicación original, cantidad, costo y cantidad sin devolver.",
       "Introduce unidades a devolver por lote, una referencia nueva y motivo de 10 a 1000 caracteres.",
       "Confirma SOLO si la entrega física al proveedor y el crédito comercial fueron acordados. No representa solicitud futura ni anulación fiscal.",
       "Al confirmar se descuenta stock disponible de la ubicación original, se conserva la trazabilidad y se revierte proporcionalmente inventario/crédito fiscal contra proveedores.",
       "Si moviste las unidades a otra ubicación, transfiérelas físicamente y registra el traslado de vuelta antes de devolver. No se consumen unidades reservadas.",
       "Consulta historial y Control operativo → Cuentas por pagar. El crédito reduce la obligación; no borra pagos anteriores.",
       "Saldo negativo: hay crédito a recuperar del proveedor, NO efectivo recibido. Cuando recibas el dinero, regístralo en Control operativo → Recuperar crédito del proveedor (capítulo 13.5). No hay compensación entre compras ni conciliación bancaria."])
p("API: POST /accounting/purchase-orders/:id/returns con reference, reason y lines[{lineId,quantity}]. "
  "Aquí lineId es el UUID de línea de RECEPCIÓN. Stock, devolución, crédito y asiento son atómicos. "
  "El reintento idéntico devuelve replayed=true; cantidades excesivas y referencias alteradas se rechazan.")
note("La devolución no reabre la orden ni reduce recibido acumulado. Para reposición, crea una nueva compra. "
     "Importes e impuesto se calculan con NUMERIC en PostgreSQL a cuatro decimales; el último retorno "
     "absorbe el residuo de redondeo acumulado. Esto NO equivale a FIFO/promedio ni costo de ventas.")
h("11.4 Compras históricas y errores frecuentes", 2)
bullets(["Las recepciones antiguas sin líneas muestran advertencia. No se inventan sus ubicaciones/costos históricos ni se convierten silenciosamente en lotes.",
         "Solo para ese flujo legado: recepción comercial /commerce/purchases/orders/:id/receive seguida de aplicación /inventory/purchases/orders/:id/receive.",
         "No mezclar lotes nuevos y recepción total antigua. El backend impide doble ingreso. Para devolver históricos se requiere conciliación autorizada.",
         "409: otro operador recibió/devolvió unidades, o referencia usada con otros datos. Actualiza y comprueba antes de reintentar.",
         "400 en devolución: revisa compra completa/contabilizada, disponible en ubicación original, motivo y período abierto.",
         "Una recepción parcial no habilita pago proveedor; primero se completa y contabiliza. No existe cierre del remanente ni modificación de orden aprobada.",
         "No hay conversión multimoneda, integración bancaria ni comprobante fiscal de crédito proveedor."])
image("18-receiving.png", "Recepciones parciales, lotes, devolución a proveedor e historial")

h("12. Inventario, reservas y ubicación")
p("Ubicación omitida se normaliza a MAIN; los códigos se convierten a mayúsculas. Usa la misma "
  "ubicación al reservar y despachar. Existencia disponible = on_hand − reserved. Las reservas "
  "reducen disponible, no físico; el despacho reduce ambos y marca la reserva fulfilled.")
p("La pantalla Inventario presenta saldos por ubicación y un kardex paginado. Puedes filtrar por "
  "producto; al dejar ubicación vacía se consultan todas. Los ajustes requieren rol administrador "
  "y motivo. Los pedidos confirmados muestran su reserva y ubicación; el despacho solicita una "
  "confirmación adicional y conserva la ubicación reservada. Al aplicar filtros se vuelve a la "
  "primera página del kardex. Transferencias y conteos están en Control operativo.")
table(["Operación", "Endpoint / entrada", "Control del operador"], [
    ("Consulta", "GET /inventory/stock?locationCode=MAIN", "Revisar on_hand, reserved y disponible por producto/ubicación."),
    ("Kardex", "GET /inventory/movements?productId=<UUID>&locationCode=MAIN&page=1&pageSize=50", "Consultar movimientos con filtros y paginación; cantidades positivas, tipo indica su efecto."),
    ("Ajuste", "POST /inventory/adjustments: productId, direction in|out, quantity, locationCode?, notes?", "Cantidad positiva y motivo; es corrección, no sustituto de recepción/despacho."),
    ("Reserva", "POST /inventory/sales/orders/:id/reserve", "Pedido confirmed/invoiced, disponible suficiente y sin reserva ya procesada."),
    ("Despacho", "POST /inventory/sales/orders/:id/dispatch", "Requiere reserva activa y ubicación consistente."),
    ("Recepción nueva por cantidades", "POST /inventory/purchases/orders/:id/receipts", "Referencia/ubicación explícitas y líneas de orden; ingreso de stock atómico."),
    ("Recepción histórica", "POST /inventory/purchases/orders/:id/receive", "Solo legado sin lotes; orden received y aplicación no repetida."),
])
steps(["Antes: anota producto/ubicación y saldo esperado.",
       "Aplica la operación adecuada y conserva su respuesta.",
       "Después: consulta el saldo y comprueba el cambio exacto.",
       "Si la respuesta fue incierta por desconexión, comprobar primero el estado; no repetir a ciegas.",
       "Ante un descuadre detener el siguiente paso y revisar documentos/auditoría con soporte."])
note("Los bloqueos transaccionales ayudan a proteger el stock. Antes de alto volumen se necesitan "
     "pruebas simultáneas adicionales de recepción, reserva y despacho e idempotencia transversal.")
h("12.1 Reposición por producto y ubicación", 2)
steps(["Como administrador abre Inventario → Reposición por ubicación. Pulsa Actualizar reposición si es necesario.",
       "Selecciona producto e introduce ubicación; se cargan la regla y su revisión, o revisión cero para una regla nueva.",
       "Indica mínimo y objetivo (objetivo mayor o igual al mínimo), usando punto decimal y hasta cuatro decimales.",
       "Introduce un motivo de 10 a 1000 caracteres y guarda. Revisa la sugerencia y las compras ya pendientes antes de comprar.",
       "Pulsa Ver órdenes del producto para consultar orden, proveedor, estado, cantidad pedida y recepción documentada. Si figura excluida, revisa la causa antes de decidir.",
       "Para desactivar una alerta guarda mínimo cero. Un producto inactivo no genera sugerencias.",
       "Ante conflicto actualiza reposición y revisa la regla antes de volver a guardar."])
p("Disponible = físico menos reservado. Hay alerta solamente cuando disponible es estrictamente menor que mínimo "
  "y mínimo es positivo; alcanzar exactamente el mínimo no genera alerta. La sugerencia es objetivo menos disponible. "
  "Incluye productos configurados sin saldo, cuyo disponible inicial es cero. La regla no crea saldos físicos, "
  "órdenes de compra, reservas, movimientos ni asientos, y no descuenta mercancía en tránsito.")
p("Compra pendiente de empresa suma, por producto, cantidades de órdenes aprobadas aún no recibidas "
  "(ordenadas o parcialmente recibidas), restando recepciones por línea. Se actualiza tras recibir o cancelar "
  "y excluye órdenes completamente recibidas y canceladas. Se calcula en la misma consulta que el saldo de inventario. "
  "No representa un destino ni fecha: las órdenes actuales no indican ubicación hasta recibir. El total se repite "
  "para las reglas del mismo producto y no debe sumarse entre ubicaciones. Una devolución a proveedor no reabre la orden.")
note("Órdenes abiertas con recibo histórico sin líneas o cantidades recibidas inconsistentes se excluyen del total "
     "y se señalan para revisión. El cero mostrado puede ser incompleto si existe ese aviso. Revisar la orden antes "
     "de comprar; la sugerencia no descuenta el compromiso y no es una propuesta aprobada.")
p("Ejemplo exacto: disponible 1.0001, mínimo 2.0001, objetivo 5.0002 → sugerencia 4.0001. "
  "Las cantidades JSON son cadenas decimales, no números de coma flotante. "
  "GET /inventory/replenishment admite locationCode; PATCH /inventory/replenishment/:productId exige "
  "locationCode, minimumQuantity, targetQuantity, expectedRevision y reason. Cada regla tiene revisión independiente por ubicación.")
p("La lectura agrega pending_purchase_quantity (cadena exacta), pending_purchase_orders y "
  "purchase_orders_requiring_review (contadores por orden) en cada regla. Es informativa; no cambia estados "
  "ni asigna el pedido pendiente a la ubicación de la regla.")
p("El detalle se consulta independientemente y puede cambiar entre lecturas: actualiza reposición y vuelve a abrir "
  "Ver órdenes para obtener datos recientes. GET /inventory/replenishment/:productId/purchase-commitments "
  "requiere administrador y producto de la empresa autenticada. En órdenes excluidas pending_quantity es null; "
  "la recepción documentada puede estar incompleta cuando hay recibos históricos sin detalle.")
image("27-replenishment.png", "Reglas de reposición y sugerencias exactas, sin compra automática")
p("Para proponer, pulsa Preparar propuesta en una regla de producto activo. Revisa las compras pendientes "
  "y las solicitudes manuales de toda la empresa; indica número único, proveedor activo, cantidad, costo "
  "unitario y motivo. Confirma la revisión y crea la solicitud en borrador sin impuesto. La cantidad sugerida "
  "es editable y no descuenta compromisos: puede haber cambiado desde la lectura. No se asigna un destino "
  "a la orden ni se crea movimiento o asiento. En Compras consulta la solicitud y aprueba o rechaza por separado.")
note("Solo se permite una propuesta abierta generada para la misma regla. La protección no detecta solicitudes "
     "manuales ni propuestas de otras ubicaciones. Al aprobar o rechazar se libera la regla: antes de crear otra "
     "revisa la orden pendiente. No existe aún segregación obligatoria de quien crea y aprueba.")
p("El detalle de la solicitud conserva ubicación de origen, revisión de regla y motivo; la ubicación es informativa "
  "y no obliga a recibir allí. POST /inventory/replenishment/:productId/proposals exige administrador, "
  "locationCode, expectedRevision, supplierId, requestNumber, quantity y unitCost decimales como cadenas, "
  "reason y reviewedCommitments=true. Una revisión obsoleta o propuesta abierta devuelve 409.")
image("30-replenishment-proposal.png", "Propuesta manual de reposición antes de crear el borrador")

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
    "El posteo debe preceder al pago. Una referencia de pago es única por empresa. Los importes "
    "de cobro aceptan hasta cuatro decimales; solo el saldo cero marca factura paid. Revisa los "
    "documentos históricos que muestren estado pagado y saldo pendiente: esta actualización no "
    "modifica registros anteriores. No confundir con conciliación bancaria automática ni "
    "importación de extractos. La política de redondeo por moneda sigue pendiente.")
h("13.3 Cierre mensual", 2)
steps(["Conciliar documentos, cobros y movimientos del mes con el responsable contable.",
       "Consultar balance con rango correcto y revisar también documentos pendientes de contabilizar.",
       "Ejecutar POST /accounting/periods/close con year y month solo después de autorización.",
       "Para una corrección autorizada, abre Control operativo, elige el período cerrado y escribe motivo de 10 a 1000 caracteres.",
       "Reabre, corrige y vuelve a cerrar desde Operaciones. Los asientos nuevos se rechazan durante el cierre.",
       "Si se rechaza, resolver la causa explícita; no cambiar fechas para saltarse controles."])
p("Balanceado significa igualdad aritmética de débitos/créditos, no exactitud económica ni cumplimiento legal. "
  "El balance filtrado presenta movimientos del intervalo, no saldos de apertura; las cuentas sin movimientos "
  "en el intervalo aparecen con cero. Las fechas deben ser válidas y el inicio no puede superar el fin. "
  "La consulta requiere administrador. La contabilidad actual es un núcleo: no incluye toda la planificación, activos, bancos, consolidación "
  "y obligaciones de una suite financiera completa.")
h("13.3.1 Consultar el libro mayor desde Contabilidad", 3)
steps(["Abre Contabilidad con rol administrador. Las cuentas se cargan sin ejecutar el balance completo.",
       "Selecciona cuenta, Desde y Hasta (ambas fechas incluidas). Pulsa Consultar libro mayor.",
       "Revisa saldo inicial anterior a Desde, débitos/créditos del intervalo y saldo final acumulado.",
       "Rastrea número de asiento, descripción y tipo de origen en cada línea; solo se incluyen asientos publicados.",
       "Usa Anterior/Siguiente. El acumulado incluye las líneas de páginas anteriores; cambiar filtros exige consultar de nuevo."])
p("Todos los saldos usan signo débito menos crédito, también para pasivos/ingresos: no se invierte "
  "automáticamente el signo por naturaleza de cuenta. Saldo inicial + débitos − créditos = saldo final. "
  "Si no hay movimientos del intervalo, el saldo anterior permanece. Un error muestra alerta, nunca saldos cero ficticios.")
p("API: GET /accounting/accounts lista el plan de la empresa. "
  "GET /accounting/reports/general-ledger requiere accountCode, fromDate y toDate; "
  "page comienza en 1 y pageSize admite 1–100 (por defecto 25). Devuelve account, summary "
  "(opening/debit/credit/closing), items (con running_balance), total, page, pageSize y fechas. "
  "Los importes son cadenas decimales exactas y cálculo, totales y página comparten una instantánea SQL. "
  "No se inventa moneda base ni se ofrece estado financiero certificado o conciliación bancaria.")
image("28-general-ledger.png", "Libro mayor con factura y abono de 0.0001; cierre exacto de 12.3455")
h("13.4 Tesorería e inventario en Control operativo", 2)
steps(["Cuentas por pagar muestra compras, proveedor, total, pagado y saldo. Recibe y contabiliza la compra antes de registrar un pago.",
       "Registra solo el egreso ya realizado, con referencia única y monto no mayor al saldo. Se crea débito a proveedores/crédito a caja.",
       "Para transferir, selecciona saldo de origen, destino distinto, cantidad disponible, motivo y referencia única.",
       "Una transferencia conserva el total físico y no mueve unidades reservadas. Repetir referencia con los mismos datos no duplica; otros datos se rechazan.",
       "Para conteo selecciona saldo, introduce físico contado y referencia. No puede ser menor a reservado.",
       "Si cambió el físico esperado, actualiza y vuelve a contar. No reintentes con una referencia distinta para ocultar el conflicto."])
note("No hay extractos bancarios, conciliación bancaria completa, valoración/COGS ni lotes/series "
     "de trazabilidad de producto. Los lotes documentales de recepción no sustituyen series/lotes de fabricación. "
     "El balance no demuestra rentabilidad real ni cumplimiento financiero.")
image("14-controls.png", "Controles de inventario, tesorería, créditos y entregas")
h("13.5 Recuperar un crédito del proveedor", 2)
p("Disponible para el administrador en Control operativo. Una devolución de mercancía reduce la "
  "obligación, pero no significa que el proveedor haya reembolsado dinero. Si la compra estaba pagada, "
  "puede quedar saldo negativo. Registra el ingreso solo después de comprobar su recepción real.")
steps(["Revisa Cuentas por pagar: Total, Pagado, Crédito por devolución, Recuperado y Saldo.",
       "Abre Recuperar crédito del proveedor y selecciona una compra contabilizada con saldo negativo.",
       "Introduce una referencia única por empresa, importe realmente recibido (hasta cuatro decimales) y motivo de 10 a 1000 caracteres.",
       "Verifica el comprobante bancario/de caja y marca Confirmo que el dinero ya fue recibido.",
       "Confirma Registrar ingreso del proveedor. El sistema crea registro, asiento y auditoría en una transacción; no llama a un banco.",
       "Selecciona la compra en Compra para historial para ver referencia, importe, motivo y fecha de cada recuperación.",
       "Comprueba que Recuperado aumentó y el saldo se acercó a cero sin cambiar pagos ni créditos originales.",
       "Ante desconexión consulta historial. La misma referencia con los mismos datos devuelve el ingreso anterior sin duplicarlo; cambiar orden/importe/motivo provoca 409."])
table(["Ejemplo: compra pagada de 1500", "Saldo / control esperado"], [
    ("Pagado 1500; devolución comercial 300", "Saldo -300: crédito aún no recuperado."),
    ("Proveedor devuelve realmente 100", "Registrar ingreso 100: Recuperado 100, saldo -200."),
    ("Proveedor devuelve los 200 restantes", "Registrar otra referencia por 200: saldo cero."),
    ("Intento de registrar más del crédito", "Se rechaza; dos operadores no pueden recuperar el mismo remanente."),
])
p("API: GET /accounting/purchase-orders/:id/refunds consulta historial; POST al mismo endpoint "
  "recibe {reference, amount, reason}. Ambos requieren admin y propiedad de empresa. El límite se "
  "calcula con NUMERIC en PostgreSQL, bajo bloqueo de la orden compartido con pagos/devoluciones. "
  "Asiento: débito 1110 Caja y bancos, crédito 2100 Proveedores. El período actual debe estar abierto.")
note("Registra dinero en la moneda original, sin conversión ni fecha contable retroactiva. No es un "
     "cobro automático, conciliación de extractos, compensación entre compras ni devolución fiscal. "
     "Las referencias incorrectas no se borran desde UI: exige conciliación con el responsable; "
     "no registres otro movimiento para ocultar el error.")
image("19-supplier-recovery.png", "Recuperación parcial del crédito del proveedor e historial de ingresos")

h("14. Fiscal regional: solo homologación simulada")
note("Los adaptadores GT FEL, SV DTE y DO e-CF son simuladores. Un estado accepted en sandbox "
     "NO es una autorización tributaria real. Envíos con entorno production se rechazan expresamente.")
steps(["Configurar POST /fiscal/providers/config con countryCode GT/SV/DO, providerCode, "
       "environment sandbox, endpointUrl y credentials opcionales de prueba.",
       "Emitir factura comercial y conservar invoiceId.",
       "POST /fiscal/invoices/:id/documents con countryCode y documentType opcional.",
       "POST /fiscal/documents/:id/submit para obtener resultado simulado.",
       "GET /fiscal/documents/:id y GET /fiscal/documents?countryCode=GT para revisar documento, estado y trazabilidad."])
p("No se crean ni transmiten documentos de facturas comerciales void/acreditadas. Un accepted no admite "
  "reenvío. La emisión/transmisión se serializa con el estado de factura. Acreditar comercialmente NO "
  "cambia un accepted fiscal a anulado: su estado/trazas permanecen y no constituyen una cancelación legal.")
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
h("15.1 Expedientes y correcciones", 2)
steps(["Desde Personas elige expediente y modifica nombre, correo, puesto, fecha o estado con motivo.",
       "No cambies código laboral ni elimines historial. Para desactivar, cierra primero jornadas abiertas.",
       "Un empleado inactivo no admite nuevas entradas ni solicitudes de ausencia.",
       "Para corregir una jornada, elige una CERRADA e introduce entrada y salida en UTC, con motivo.",
       "La salida debe ser posterior a la entrada. No se permiten solapamientos ni períodos de ausencia aprobada.",
       "Una revisión concurrente rechaza cambios obsoletos: actualiza y revisa; no repitas a ciegas.",
       "Las solicitudes de ausencia pendientes/aprobadas no pueden solaparse. Antes de aprobar, concilia asistencia."])
p("La corrección guarda antes/después en auditoría. Los calendarios de ausencias son UTC; aún no hay "
  "zona horaria laboral por empresa, feriados, devengo legal, salarios ni nómina. La lista muestra hasta "
  "500 asistencias recientes; registros anteriores requieren una futura consulta paginada.")
image("15-people.png", "Administración auditada de personas y jornadas")
h("15.2 Cancelar una ausencia sin borrar historial", 2)
steps(["Abre Personas → Cancelar ausencia con auditoría. Solo administradores pueden confirmar.",
       "Selecciona una ausencia Pendiente o Aprobada. Revisa persona y fechas UTC; rechazadas/canceladas no se ofrecen.",
       "Introduce un motivo administrativo de 10 a 1000 caracteres, sin diagnósticos ni datos sensibles innecesarios.",
       "Confirma la cancelación administrativa y pulsa Cancelar ausencia y auditar.",
       "Comprueba el estado Cancelada y motivo en la tabla. Fechas, solicitud, aprobación/rechazo original y nota de decisión se conservan.",
       "Si alguien decidió/canceló simultáneamente, el control de revisión devuelve 409: actualiza y vuelve a revisar.",
       "Si necesitas fechas corregidas, cancela y crea una solicitud nueva en Operaciones; no reescribas el documento original.",
       "Concilia por separado vacaciones legales, nómina o exportaciones ya realizadas. La cancelación administrativa no las recalcula."])
p("API: POST /hr/leave-requests/:id/cancel con {reason, expectedRevision}. El listado incluye revision, "
  "cancelled_at y cancellation_reason. Aprobar/rechazar incrementa revision; cancelar también. "
  "La operación bloquea empleado/ausencia en el mismo orden que asistencia y decisiones. Puede "
  "retirar solicitudes de empleados inactivos y conserva la decisión previa sin reemplazarla.")
note("Una ausencia cancelada deja de bloquear solapamientos y asistencia por ausencia aprobada. "
     "No genera una jornada ni justifica días trabajados. No existe reactivación directa de una "
     "cancelada ni modificación retroactiva de nómina. Las fechas pasadas se pueden corregir "
     "administrativamente, siempre con motivo, pero requieren revisión de sus efectos externos.")
image("20-leave-cancellation.png", "Cancelación administrativa de ausencia aprobada con decisión original conservada")

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
note("La consulta de Ayuda responde un MOCK local explícito: escribe una duda de hasta 500 caracteres "
     "y pulsa Consultar mock. Usa reglas predefinidas y la guía de pantalla, no un modelo generativo. "
     "No envía la consulta a servicios externos, no lee documentos ni ejecuta correcciones. "
     "No introducir secretos. Se limpia la consulta después de responder y al cerrar sesión.")
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
p("Se ejecutaron builds de API/Angular, 36 pruebas unitarias API, 78 e2e API y 61 de frontend. "
  "El navegador real comprobó login con Enter, dashboard de DB, carrito, checkout con aumento exacto "
  "de reserva, consentimiento, portal con revocación y diagnóstico sin tokens. También completó desde "
  "formularios dos recepciones parciales, contabilización, devolución a proveedor, retorno físico de venta posterior al crédito, "
  "recuperación parcial del crédito proveedor y cancelación auditada de una ausencia aprobada. "
  "Se comprobaron 13 rutas administrativas y públicas en cuatro anchos: 320/390/768/1440 (52 casos). "
  "El archivo evidence.json conserva el resultado real y fecha de la última ejecución; no se asume certificación WCAG.")
billing_evidence = json.loads((HERE / "billing-evidence.json").read_text(encoding="utf-8"))
if billing_evidence["pageErrors"] or any(
    check["scroll"] > check["width"] + 1 for check in billing_evidence["responsive"]
):
    raise ValueError("La evidencia de cartera SaaS contiene errores o desbordamiento de página")
p(f"Consola SaaS: verificación real {billing_evidence['capturedAt']}; "
  f"{len(billing_evidence['flows'])} flujos y {len(billing_evidence['responsive'])} "
  "comprobaciones de ruta/ancho. Se verificaron pagos parciales, historial, seguimiento "
  "y aislamiento del contrato de empresa. Las capturas son de datos ficticios; no acreditan "
  "cargos de pasarela, mensajes enviados ni certificación fiscal.")
quotation_evidence = json.loads((HERE / "quotation-evidence.json").read_text(encoding="utf-8"))
if quotation_evidence["pageErrors"] or any(
    check["scroll"] > check["width"] + 1 for check in quotation_evidence["responsive"]
):
    raise ValueError("La evidencia de vigencia contiene errores o desbordamiento")
p(f"Vigencia de cotizaciones: {quotation_evidence['capturedAt']}; "
  f"{len(quotation_evidence['flows'])} flujos y {len(quotation_evidence['responsive'])} "
  "anchos comprobados. Se creó una oferta desde UI, se comprobó rechazo 409 al vencer "
  "y se renovó/confirmó conservando importes. La fixture vencida usa datos ficticios "
  "y no modifica el reloj del servidor.")
management_evidence = json.loads((HERE / "management-evidence.json").read_text(encoding="utf-8"))
if management_evidence["pageErrors"] or any(
    check["scroll"] > check["width"] + 1 for check in management_evidence["responsive"]
):
    raise ValueError("La evidencia de gestión contiene errores o desbordamiento")
p(f"Gestión de usuarios/empresa, reposición y libro mayor: {management_evidence['capturedAt']}; "
  f"{len(management_evidence['flows'])} flujos y {len(management_evidence['responsive'])} "
  "comprobaciones de ruta/ancho sin errores. Formularios reales para usuario, perfil y regla; "
  "compra/recepción parcial de prueba por API para revisar el pendiente en pantalla y "
  "propuesta de reposición creada desde UI, revisión de importes y aprobación separada; "
  "factura y pago de prueba por API para verificar el libro mayor desde pantalla. "
  "Los e2e además comprueban apertura histórica, acumulado entre páginas, cantidades mínimas, "
  "conflictos simultáneos y aislamiento. Las evidencias de las etapas anteriores conservan sus propias fechas.")
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
bullets(["Antes de producción: MFA, correo de activación/recuperación, membresías multiempresa y permisos de escritura granulares.",
         "Implementar proveedor fiscal real y pasarela de pago solo si se necesitan; la base actual no los sustituye.",
         "Endurecer sesión con evaluación BFF/cookies HttpOnly/CSRF, rate limit distribuido, CSP frontend y secretos gestionados.",
         "Añadir pruebas simultáneas e idempotencia transversal en operaciones sensibles.",
         "Completar auditoría accesible con lectores de pantalla/zoom/contraste y pruebas con usuarios.",
         "Revisar políticas de privacidad, consentimiento, retención y seguridad antes de datos reales o chat externo."])
image("07-processes.png", "Guía de procesos: orden, canal y límites por módulo")

h("21. Entregas y modelo comercial por empresa")
h("21.1 Preparación y seguimiento de tienda", 2)
steps(["El cliente elige recogida o solicita envío con dirección y teléfono. No se calcula ni cobra flete.",
       "Abre Control operativo → Entregas de tienda online y verifica datos por el número de pedido.",
       "Confirma preparación. Para recogida sigue a Listo para recoger; para envío añade transportista y guía.",
       "Confirma la salida física desde Inventario antes de marcar Enviado o Entregado. Cambiar estado no descuenta stock por sí mismo.",
       "Marca Entregado solo cuando se confirmó la entrega real. No se permiten saltos ni volver a estados anteriores.",
       "Un pedido cancelado no admite avanzar la entrega. El listado administrativo muestra hasta 500 entregas recientes."])
note("El seguimiento es manual; no llama a transportistas, no manda correos y no ofrece cuenta "
     "de cliente con historial. No confundir dirección registrada con servicio de envío pagado/contratado.")
image("17-studio.png", "Configuración y publicación del escaparate")
h("21.2 Catálogo SaaS y separación de responsabilidades", 2)
p("Se recomienda base por empresa + módulos + excedentes medibles, separados de permisos y de "
  "las facturas de venta del ERP. El documento docs/MODELO_COMERCIAL_SAAS.md define precios "
  "ilustrativos, dependencias, métricas idempotentes, prorrateo, gracia, modo cierre y criterios de aceptación.")
table(["Concepto ilustrativo", "Importe mensual USD antes de impuestos"], [
    ("Base", "29"), ("Ventas / Compras / Inventario", "15 por módulo"),
    ("Contabilidad / Tienda", "25 por módulo"), ("Personas sin nómina", "10"),
    ("Usuarios", "5 incluidos; 4 por adicional"),
    ("Operaciones comerciales", "1.000 incluidas; 0,02 por excedente"),
])
p("Ejemplo de precio futuro con uso: paquete Comercio 124 + 2 usuarios extra 8 + 300 operaciones "
  "extra 6 = USD 138 antes de impuestos. La consola actual registra los importes fijos aceptados "
  "por módulo, no mide ni cobra automáticamente usuarios, operaciones o almacenamiento. Aprobar "
  "contrato y medición shadow antes de facturar esos extras. El mock de ayuda no se factura como IA.")
h("21.3 Acceso a la consola de plataforma", 2)
p("El administrador de empresa no es administrador de la plataforma. La consola requiere una "
  "autorización adicional, concedida por el responsable del servidor a una cuenta existente. No "
  "hay alta pública de operadores ni ascenso desde Usuarios. La membresía se consulta en servidor; "
  "el correo o rol admin del JWT por sí solos no autorizan acceso global.")
table(["Perfil", "Ámbito"], [
    ("Propietario / cobranza de plataforma", "Gestionar contratos y movimientos SaaS autorizados; no asumir la identidad de empresas."),
    ("Consulta de plataforma", "Consultar cartera e historial sin registrar movimientos."),
    ("Usuario de empresa", "Consultar únicamente el contrato de su empresa en Mi suscripción."),
])
note("Los datos SaaS son distintos de las facturas, pagos y clientes operativos que cada empresa "
     "registra dentro del ERP. Compartir pagador no autoriza compartir inventario, ventas ni personas.")
h("21.4 Consultar quién está al día", 2)
steps(["Abre la consola SaaS con una cuenta autorizada de plataforma.",
       "Selecciona la fecha de corte y actualiza la cartera. El reporte es por fecha; no mezcles sus saldos con el detalle actual del cliente.",
       "Revisa los totales por moneda: abierto, vencido y antigüedad de 1–30, 31–60, 61–90 y más de 90 días.",
       "Filtra clientes y abre la ficha del pagador para revisar empresas, módulos contratados y documentos.",
       "Revisa el vencimiento más antiguo y las próximas tareas, no solo el color del estado.",
       "Descarga CSV para conciliar el reporte a esa fecha. Custodia el archivo: puede contener contactos y saldos."])
p("Al día significa sin saldo vencido a la fecha de corte, no ausencia de facturas abiertas. "
  "Una factura que vence hoy aún no lleva un día de atraso. Sin contrato no significa pagado. "
  "Los módulos son contratados por empresa, no por usuario individual; los permisos operativos "
  "siguen siendo independientes. No se asigna un abono parcial arbitrariamente a un módulo.")
image("21-billing-portfolio.png", "Cartera SaaS por moneda y fecha de corte, con seguimiento de clientes")
h("21.5 Contratos, facturas y pagos recibidos", 2)
steps(["Crea la cuenta pagadora con nombre y correo de facturación.",
       "Relaciona una empresa autorizada mediante su contrato: fecha inicial, renovación y módulos con precio aceptado.",
       "Incluye Base y respeta dependencias; Tienda necesita Ventas e Inventario. Los precios de ejemplo no constituyen una oferta contractual.",
       "Genera la factura interna del período con referencia única y vencimiento. Comprueba los precios y módulos copiados del contrato.",
       "Los cambios de contrato usan revisión y motivo; no reescriben líneas de facturas ya emitidas. Ante 409, actualiza y vuelve a revisar.",
       "Cuando recibas realmente dinero, selecciona su factura y registra referencia, importe, fecha, medio y motivo. Confirma la recepción.",
       "Revisa el historial y saldo. Se admiten abonos; la suma aplicada no puede superar el remanente.",
       "Si registraste un ingreso incorrecto, usa su reversión con referencia y motivo. No borres ni edites el movimiento original.",
       "Para reducir la obligación comercial, registra crédito con motivo. Un crédito no equivale a dinero devuelto por banco."])
p("La factura SaaS actual es un documento interno de control del servicio, no un comprobante "
  "fiscal certificado ni un asiento dentro de la contabilidad operativa del cliente. El registro "
  "de pagos documenta dinero recibido fuera del sistema: no captura tarjetas ni realiza transferencias. "
  "No registre anticipos o saldos sin factura como si fueran pagos aplicados.")
note("Reutiliza la misma referencia únicamente para reintentar la misma operación; una referencia "
     "existente con carga distinta debe rechazarse. Si hubo desconexión, consulta el historial "
     "antes de intentar otro movimiento. No generes una nueva referencia para ocultar un duplicado.")
image("22-billing-account.png", "Ficha del pagador: contrato, documentos, ingresos y seguimiento sin borrar historial")
h("21.6 Seguimiento de cobranza", 2)
steps(["Abre la ficha del cliente y registra la llamada, nota, correo manual o promesa.",
       "Indica responsable, próxima fecha y descripción suficiente para continuar el caso.",
       "Para una promesa agrega la fecha comprometida y verifica después el ingreso real.",
       "Marca la tarea atendida o pausada con motivo; las actualizaciones usan revisión para detectar cambios simultáneos.",
       "Una nota de correo no significa que se envió un mensaje. Usa tu canal autorizado y registra el resultado real.",
       "Antes de contactar, vuelve a consultar el saldo. No reclames una factura ya saldada ni interpretes una promesa como pago."])
p("Los avisos, reintentos de tarjeta y suspensión requieren proveedores y política contractual "
  "configurados. La consola muestra la ausencia de esas integraciones; no simula entregas de correo, "
  "pagos exitosos ni bloqueos. Una restricción futura deberá conservar consulta, exportación y "
  "cierre correctivo sin romper dependencias.")
p("Agenda interna de cobranza → Consultar agenda interna muestra candidatos por fecha "
  "para D-3, D0, D+3 y D+7. Con confirmación, Preparar seguimiento interno crea tareas "
  "sin enviar mensajes. La combinación factura/etapa evita duplicados; la creación vuelve "
  "a comprobar el saldo actual bajo bloqueo y respeta pausas de tareas de cobranza. No es "
  "un proceso programado ni reconstruye automáticamente todas las etapas omitidas.")
note("Los precios actuales se copian al emitir manualmente; no hay prorrateo, cobro recurrente "
     "ni agenda de revisiones futuras. Revisa períodos y referencias para no emitir dos "
     "documentos por el mismo servicio. Renovación es un dato del contrato, no una prueba "
     "de que se haya cargado dinero. Anticipos, cancelación contractual y reglas de "
     "gracia/restricción requieren la siguiente etapa descrita en los pendientes.")
h("21.7 Consultar Mi suscripción", 2)
steps(["Inicia sesión con la cuenta de tu empresa y abre Mi suscripción.",
       "Comprueba los módulos contratados, precios, renovación, saldo abierto/vencido y cantidad de usuarios de esa empresa.",
       "Si no hay contrato, solicita su registro al operador; no crees pagos desde el navegador para habilitar funciones.",
       "Solicita correcciones por el canal de soporte. No se ofrecen datos de otras empresas aunque compartan pagador."])
image("23-subscription.png", "Consulta del contrato de la empresa sin acceso a la cartera global")
p("La bitácora docs/BITACORA_CONTINUIDAD.md es la referencia de implementación, riesgos, pruebas "
  "y orden de continuación. El documento docs/PENDIENTES_DESARROLLO.md permite retomar "
  "la siguiente etapa con dependencias y criterios de aceptación. No confundir la entrega "
  "actual con un ERP completo listo para producción.")

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
    guarded = "@UseGuards(AuthGuard)" in class_decorators
    class_roles_match = re.search(r"@Roles\(([^)]*)\)", class_decorators)
    class_roles = re.findall(r"'([^']+)'", class_roles_match.group(1)) if class_roles_match else []
    rows = []
    for index, match in enumerate(matches):
        block = text[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(text)]
        method_roles_match = re.search(r"@Roles\(([^)]*)\)", block)
        declared_roles = re.findall(r"'([^']+)'", method_roles_match.group(1)) if method_roles_match else class_roles
        roles = " / ".join(declared_roles) if declared_roles else (
          "JWT" if guarded or "@UseGuards(AuthGuard)" in block else "Público*"
        )
        route = "/" + "/".join(part.strip("/") for part in [prefix, match.group(2) or ""] if part)
        if prefix == "saas":
            roles = "JWT de empresa" if route in ("/saas/operator", "/saas/subscription") else (
                "Operador plataforma (consulta incluida)" if match.group(1) == "Get"
                else "Operador plataforma (propietario/cobranza)"
            )
        rows.append((match.group(1).upper(), route, roles))
        endpoint_count += 1
    table(["Método", "Ruta", "Acceso declarado"], rows)
    p("Fuente: " + str(source.relative_to(ROOT)).replace("\\", "/"), "Caption")
note("Público* no significa sin controles: bootstrap requiere habilitación temporal; portal exige token "
     "vigente; carritos exigen x-cart-token en sus acciones. Health/tienda no conceden sesión administrativa. "
     "AuthGuard también aplica las restricciones de roles correspondientes. Las rutas SaaS globales "
     "requieren además membresía de plataforma activa comprobada en base de datos; admin de empresa "
     "no concede ese permiso. El catálogo distingue esa autorización adicional.")

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
         "docs/MODELO_COMERCIAL_SAAS.md: cartera SaaS implementada y propuesta de medición/cobro automático pendiente de configuración.",
         "docs/BITACORA_CONTINUIDAD.md: estado verificable y trabajo siguiente.",
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
