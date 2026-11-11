# Bitácora de implementación y continuidad de ERP360

Fecha de corte: 2026-11-11 UTC (2026-11-10 en el equipo de pruebas).
Proyecto: `C:\angular\erp360\erp360-modernizado`.

## 1. Resumen ejecutivo y límites de la entrega

Se amplió un núcleo ERP existente con identidad, mantenimiento de maestros,
controles de inventario/tesorería, cancelaciones, factura comercial PDF,
crédito total/reembolso registrado, checkout consistente, entregas manuales,
correcciones de RRHH y ayuda mock. Se diseñó el modelo de cobro SaaS.

**No se declara terminado todo el ERP ni listo para producción.** Siguen abiertos
devengo por recepción parcial, créditos/retornos parciales de venta,
valoración/COGS, conciliación bancaria,
estados financieros completos, fiscal certificado, pagos online, cuentas de
clientes, editor web avanzado y nómina. La sección 7 contiene el backlog y
criterios de aceptación para continuar sin confundir propuesta con implementación.

No se integró IA externa, no se cargaron tarjetas, no se enviaron reembolsos
bancarios, no se emitieron comprobantes fiscales reales ni se copiaron funciones
de otro ERP mediante código ajeno. Las pruebas usan empresas ficticias.

## 2. Estado por frente

| Frente | Entregado y verificado | Lo que NO significa |
|---|---|---|
| Identidad | Invitación/activación, recuperación administrativa, roles existentes, bajas, revocación en HTTP/RPC, último admin protegido | Sin MFA, email automático ni membresías multiempresa |
| Maestros | Altas normalizadas, edición, desactivación, exportación JSON e importación atómica de 1–200 altas | No CSV, upsert masivo, deduplicación ni historial visual de cambios |
| Inventario | Transferencias/conteos, disponible protegido, recepciones parciales por cantidades con ingreso físico atómico | Sin costo de ventas, valoración, lotes de fabricación, series ni vencimientos |
| Tesorería | Saldos/pagos proveedores, recuperación de crédito con historial, cobros/reembolsos acotados, asientos por origen | Registra dinero ya movido; no conecta bancos ni compensa entre compras |
| Comercial | Cancelación antes de factura/despacho/recepción; liberación de reservas; folio opcional automático; moneda explícita nueva | No anulación fiscal ni numeración legal autorizada |
| Documentos | PDF real, snapshot de descripciones/cliente/empresa de facturas nuevas | PDF histórico sin snapshot usa descripciones actuales y lo advierte |
| Créditos | Un crédito TOTAL por factura, retorno inmediato o total posterior idempotente, reversión y saldo a reembolsar | Sin crédito ni retorno parcial de venta; ningún reembolso automático |
| Compras por lotes documentales | Recibido/pendiente por línea, snapshot costo, referencias repetibles y devolución proveedor con crédito proporcional | Devengo solo al completar; no devolución de históricos ni cierre de remanente |
| Contabilidad | Posteo concurrente protegido, cierre/reapertura auditada, guard y trigger contra asientos nuevos en período cerrado | No suite financiera ni protección contra un DBA que modifique SQL |
| Tienda | Checkout serializado/repetible, precio/publicación revalidados, stock MAIN coherente, cliente invitado separado | Sin pasarela, pago, cuenta autenticada de cliente ni multicurrency |
| Entregas | Recogida/envío solicitado, dirección/teléfono, preparación, guía y entrega manual | No cotiza flete, contrata transportista ni envía avisos |
| Suscriptores | Consentimiento explícito y baja pública por clave privada hash | No double opt-in ni plataforma de campañas |
| Personas | Edición/baja, jornadas únicas, correcciones y cancelación de ausencias con revisión/auditoría, solapamientos protegidos | No nómina, reglas laborales locales ni zona laboral configurable |
| Asistencia | Respuesta mock local identificada, sin petición externa ni escritura | No es un modelo de IA ni conoce documentos del usuario |
| SaaS | Consola de cartera, contratos por módulos, ingresos recibidos e historial de seguimiento | Contratos informativos; sin pasarela, envíos ni restricciones automáticas |

## 3. Cambios funcionales y procedimientos

### 3.1 Identidad y aislamiento

Archivos: `api\src\auth\auth.service.ts`, controlador/guard/tipos; `rpc-legacy.service.ts`;
frontend `users.component.ts`, `auth-console.component.ts`, `session.service.ts`,
interceptor y shell.

- Cada cuenta sigue perteneciendo a una empresa y el correo es globalmente único.
- El JWT incluye versión de sesión. Cada petición valida usuario/empresa activos,
  versión y roles actuales consultados en DB; RPC usa el mismo mecanismo.
- Activación: clave privada, hash SHA-256 en DB, 24 horas, un solo uso.
- Recuperación administrativa: una hora, invalida claves anteriores.
- Cambiar nombre/roles/estado invalida sesiones. Último administrador activo
  protegido mediante bloqueo por empresa.
- Logout revoca TODAS las sesiones del usuario; si falla la red se limpia local
  y se informa el error, pero no se garantiza revocación remota.
- Las claves se muestran una vez, no se incluyen en URL ni auditoría.
- Roles comerciales no equivalen a permisos finos: muchas escrituras siguen admin.

Prueba: `identity-catalogs.e2e-spec.ts` incluye uso único, revocación, no-admin,
aislamiento y último admin. Guard tiene pruebas asíncronas.

### 3.2 Maestros

`master-input.ts` es whitelist de tablas/campos y validador runtime compartido.
Las altas usan los mismos valores normalizados que edición/importación
(incluidos email minúsculo y estado inactivo explícito).

- Código/SKU existente inmutable; se desactiva sin borrar historial.
- Nuevas operaciones rechazan cliente/proveedor inactivo.
- Producto inactivo no se publica ni se agrega al carrito.
- Impuesto predeterminado de tienda no se desactiva sin cambiar antes settings.
- Importación solo altas, arreglo JSON 1–200, transacción de lote completo.
- La exportación JSON no es respaldo integral ni importación de relaciones.

Frontend: `/catalogs`. Operaciones mantiene los flujos existentes.

### 3.3 Inventario y tesorería

- `/inventory/transfers`: bloqueo ordenado por ubicación, mueve solo disponible,
  conserva físico total y registra salida/entrada en kardex.
- `/inventory/counts`: exige `expectedOnHand`; cambio concurrente devuelve 409;
  físico inferior a reservado se rechaza.
- Una referencia aplicada con el mismo payload devuelve `replayed:true`;
  otra carga con esa referencia devuelve 409.
- Ajuste de salida tampoco consume reservado.
- `/accounting/payables` y pagos de compra: recibido + contabilizado, referencia
  única, importe positivo de hasta cuatro decimales y no mayor al saldo.
- Un pago crea egreso y asiento en la misma transacción; no ejecuta transferencia.

### 3.4 Documentos, cancelaciones y créditos

- Facturación permite folio vacío para `AUTO-INV-########`.
- Secuencias por empresa son atómicas y evitan números históricos ocupados.
  Los prefijos automáticos WEBQ/WEBO/AUTO-INV se reservan al generador.
- Cotizaciones/pedidos/facturas nuevos propagan moneda empresarial. USD es la
  moneda inicial, NO una reinterpretación de documentos históricos.
- Moneda histórica permanece NULL; no convertir saldos ni etiquetarlos como USD.
- PDF vía `GET /commerce/sales/invoices/:id/pdf`, aislado por empresa.
- Facturas nuevas conservan snapshot de nombre de empresa, cliente y líneas.
  El PDF incluye advertencia de documento comercial no fiscal.
- Cancelación simple exige motivo de 10–1000 caracteres. Venta con factura
  o despacho y compra recibida/posteada son rechazadas.
- Crédito total exige factura contabilizada, período abierto y motivo. Se crea
  `AUTO-CN`, se revierte ingreso/impuesto/CxC, se marca factura void y pedido
  cancelled. Originales y cobros se conservan.
- Si no hubo despacho, libera reservado sin aumentar físico.
- Si hubo despacho, `returnStock:true` significa mercancía realmente recibida;
  suma físico una sola vez. No usarlo para prometer una devolución futura.
- Crédito sin retorno físico admite ahora retorno TOTAL posterior vinculado,
  con referencia única y motivo: repone en ubicaciones originales una sola vez.
  No crea otro crédito, reembolso ni asiento financiero; crédito/retorno parcial
  de venta siguen pendientes.
- Reembolso registrado no puede exceder cobrado menos devuelto. Crea asiento
  de compensación CxC/caja y conserva referencias. No devuelve dinero por API bancaria.

Dependencia nueva: PDFKit y sus tipos en manifiesto/lockfile API.
La instalación informó 28 advisories del árbol completo (5 bajos, 23 moderados);
no se aplicaron upgrades mayores ni `audit fix --force`.

### 3.5 Cierre contable

`document-sequence.ts` genera folios contables. Lock por origen evita doble posteo.
Lock contable por empresa serializa alta de asientos y cierre/reapertura.
Trigger DB rechaza cabecera nueva en mes cerrado.

Reapertura exige motivo de 10–1000 caracteres y se audita; puede cerrarse otra vez.
El proceso no edita asientos históricos ni pretende impedir cambios directos
de un DBA en cabeceras/líneas: el rol DB productivo debe restringirse.

### 3.6 eCommerce

- Add/remove y checkout comparten bloqueo del carrito.
- Confirmar dos veces devuelve el mismo pedido y total; no duplica reserva.
- Revalida producto activo, publicación y precio; si cambian, 409 y revisión del carrito.
- Catálogo, validación y reserva usan MAIN. Otras ubicaciones no inflan disponibilidad.
- Secuencias WEBQ/WEBO/CHKO atómicas. Cliente invitado usa código aleatorio,
  sin vincularlo por correo/código no verificado a identidad previa.
- Tienda y carrito deben coincidir con moneda de empresa; no se hace conversión.
- Entrega: pickup predeterminado o delivery con dirección/teléfono. Costo de
  envío fuera del total y pendiente de cotización externa, explicado en pantalla.
- Estados de entrega: requested → preparing → ready → delivered en recogida;
  requested → preparing → shipped → delivered en envío.
- Enviado/entregado requiere despacho físico confirmado; guía/transportista
  requeridos para enviado. No se saltan ni retroceden estados.
- Un pedido cancelado no avanza seguimiento.
- Consentimiento de marketing exige booleano true. Clave de baja de 64 hex,
  solo hash persistido; baja idempotente por clave y empresa. Re-suscribirse
  reemplaza la clave; falta envío de email/double opt-in.

Frontend: tienda pública + `/controls` para preparación/entrega. Listado de
entregas limitado a las 500 más recientes; no es historial de cliente.

### 3.7 RRHH y mock

- Check-in serializado por empleado y UNIQUE de jornada abierta.
- Salida anterior/igual a entrada se rechaza; ya no se transforma en cero minutos.
- Entrada de inactivo y ausencia nueva de inactivo se rechazan.
- Baja requiere cerrar jornada abierta. Revisión evita sobrescribir otro cambio.
- Corrección solo de jornada cerrada, con motivo y antes/después en auditoría.
- Se rechazan solapamientos de asistencia y ausencias pendientes/aprobadas.
- Aprobación de ausencia se serializa con asistencia; calendarios interpretados
  en UTC y timestamps API requieren zona explícita.
- `/people` presenta correcciones en UTC. No implementar nómina sin jurisdicción.
- Ayuda: hasta 500 caracteres, respuesta predefinida MOCK local; no invoca red,
  proveedor, documentos ni herramientas de escritura.

### 3.8 UX y estabilidad

- Pantallas nuevas esperan restauración asíncrona de sesión y descartan
  respuestas de la identidad anterior. Se limpian listas y claves al perder sesión.
- Navegación con iconos existentes, etiquetas, anuncios de error y tablas con caption.
- Cantidad de producto tiene nombre accesible específico.
- Se corrigió cascada CSS: reglas móviles estaban antes de reglas base y se
  sobrescribían, produciendo 612 px de contenido en viewport de 320 px.
- La tabla de facturas conserva encabezados/importes legibles y scroll interno;
  tracks `minmax(0, 1fr)` y tarjetas con mínimo cero evitan que una tabla ancha
  expanda toda la página en tablet.
- La prueba real final exige `document.scrollWidth <= viewport + 1`, un h1 y
  navegación por teclado en móvil; pasa en los 52 casos registrados.
- API acepta `HOST` opcional para pruebas/instalaciones loopback, conservando
  el comportamiento de todas las interfaces cuando no se configura.

### 3.9 Continuación: recepciones parciales, proveedor y fiscal

- `/receiving`: selector de orden, pedido/recibido/pendiente por línea, cantidades
  reales, ubicación explícita y confirmación física. Una entrega incrementa
  inventario, crea lote documental/kardex y cambia estado en una transacción.
- Recepciones nuevas exigen 1–200 líneas sin duplicados, cantidades positivas
  de hasta cuatro decimales y referencia de empresa única. Snapshot del costo
  aprobado; bloqueo por orden y referencia evita sobre-recepción concurrente.
- Reintento idéntico devuelve el mismo documento sin repetir físico; referencia
  usada con otra carga produce 409. `partially_received` hasta completar todo.
- Recepción histórica de dos pasos se conserva, pero no se mezcla con lotes
  nuevos ni permite volver a ingresar una compra recibida por cantidades.
  No se inventan ubicaciones/costos documentales históricos.
- Devolución proveedor exige compra completa/contabilizada, lote documentado,
  unidades sin devolver y disponible en ubicación original. No consume reservas.
  Mercancía y crédito acordados se confirman juntos; no es una solicitud futura.
- Transacción única: salida física, líneas vinculadas al lote, crédito comercial,
  reversión de inventario/impuesto contra proveedores, auditoría. Un fallo de
  período cerrado revierte también stock y documento.
- Valor e impuesto se asignan con NUMERIC en PostgreSQL a cuatro decimales;
  cálculo acumulativo absorbe residuos en el último retorno. No es FIFO/COGS.
- Cuentas por pagar descuenta créditos sin borrar pagos. Saldo negativo es crédito
  del proveedor, no dinero recibido. La recuperación de efectivo ya recibido
  está implementada en 3.10; compensar compras entre sí sigue pendiente.
  No se reabre cantidad pendiente ni se genera reposición automáticamente.
- Retorno físico posterior de venta: solo TOTAL, vínculo a crédito y despachos,
  referencia repetible, motivo y confirmación. No repite crédito ni reembolso.
  Registro físico fechado hoy, sin asiento adicional; valoración pendiente.
- Fiscal: crear/transmitir serializa el estado de factura; void no se transmite,
  accepted no se reenvía. Crédito comercial conserva estado fiscal y sus trazas:
  no se transforma en anulación legal, ni siquiera si el sandbox dijo accepted.
- Nueva pantalla espera restauración de sesión, descarta respuestas de otra
  identidad y limpia campos. Pruebas frontend cubren cambio de empresa durante
  carga y envío de cantidades seleccionadas con confirmación obligatoria.

### 3.10 Recuperación de crédito proveedor y cancelación de ausencias

- Control operativo → Recuperar crédito del proveedor: selecciona compra con
  crédito pendiente, referencia, importe recibido y motivo; confirmación
  obligatoria de dinero ya recibido. Historial por compra con importe/fecha/motivo.
- El saldo es `total - pagado - créditos + recuperado`. Límite del ingreso:
  no más de `pagado + créditos - total - recuperado`, calculado con NUMERIC en
  PostgreSQL. Pago/devolución/recuperación comparten bloqueo de la orden.
- Referencia por empresa serializada: mismo pedido/importe/motivo devuelve
  replay sin asiento nuevo; otra carga con esa referencia produce 409.
- Compra completa y contabilizada, cuentas 1110/2100 y período abierto.
  Registro, débito caja/bancos, crédito proveedores y auditoría atómicos.
  Si el período está cerrado no se mueve saldo ni se crea historial.
- Dinero ingresado conserva moneda documental; no hay conversión, conexión a
  banco, conciliación de extracto, compensación entre compras ni reversión UI.
  No se borran pagos, devoluciones ni sus referencias.
- Personas → Cancelar ausencia con auditoría: pendiente/aprobada, motivo,
  confirmación y revisión esperada. Se serializa con empleado/ausencia
  preservando el orden de bloqueo de asistencia y decisiones.
- Aprobación/rechazo incrementan revisión; cancelar una versión obsoleta,
  rechazada o cancelada falla con 409. Se permite retiro administrativo de
  solicitudes de personas inactivas sin habilitarles asistencia.
- Se conservan solicitud, fechas y nota/actor/fecha de decisión originales.
  Cancelación agrega actor/fecha/motivo, revisión y evento con antes/después.
  No reactiva ni borra documentos. Para fechas distintas: cancelar y solicitar
  nuevamente; no existe edición directa de la solicitud.
- Canceladas no bloquean fechas/entrada por ausencia aprobada. No generan
  asistencia ni recalculan nómina, saldos legales o exportaciones anteriores;
  requieren conciliación externa cuando corresponda.
- Formularios nuevos descartan respuestas de identidad anterior y limpian datos
  al cambiar sesión; pruebas cubren confirmación, payload y descarte del resultado.
- Cuentas por pagar conserva encabezados/importes sin partir números; historial
  de ausencias mantiene fechas y estados completos con scroll interno en móvil.
  El capturador verifica líneas de texto reales además del ancho de página.

## 4. Migraciones aplicadas en PostgreSQL local

Contenedor existente `erp360-db`, base/usuario de desarrollo `erp360`.
Se aplicaron con `psql -v ON_ERROR_STOP=1`, sin borrar volúmenes.

| Migración | Cambio |
|---|---|
| 0013_identity_lifecycle | session_version, claves privadas hash y roles |
| 0014_operational_controls | secuencias, transferencias/conteos, pagos proveedor, reapertura y trigger |
| 0015_commercial_documents | moneda empresarial/documentos nuevos y crédito total |
| 0016_credit_refunds | registro de reembolsos de cliente |
| 0017_hr_lifecycle | revisión de empleados/asistencia y jornada abierta única |
| 0018_store_fulfillment | entrega manual y hash de clave de baja |
| 0019_invoice_snapshot | snapshot descriptivo en nuevas facturas |
| 0020_partial_purchase_receipts | lotes documentales, líneas/costos, devoluciones y estado parcial |
| 0021_deferred_sales_returns | retorno físico total posterior vinculado al crédito |
| 0022_supplier_refunds_leave_cancellation | ingresos recibidos de proveedor y cancelación/revisión de ausencias |
| 0023_saas_billing | operadores, contratos revisionados, documentos internos, cartera y seguimiento SaaS |

Antes de 0020 se realizó respaldo PostgreSQL custom en la carpeta privada de
sesión. No se eliminó ni reinicializó el volumen. Este respaldo NO equivale a
una restauración probada ni reemplaza política de backups productivos.
También se respaldó antes de 0022; no se borraron volúmenes ni documentos.
Antes de 0023 se generó otro respaldo custom y se comprobó su catálogo con
`pg_restore -l`. Es respaldo legible, no una restauración ensayada.

No se infiere que estén aplicadas en otra máquina. No hay un ledger completo
de migraciones automatizado: respaldar, revisar versión real y ejecutar solo
las pendientes en orden. Si 0017 detecta jornadas duplicadas, conciliar con
autorización antes de volver a ejecutar; no borrar evidencia.

## 5. Verificación y evidencia reproducible

| Verificación | Comando / evidencia | Resultado |
|---|---|---|
| API build | `npm run build` en api | Correcto |
| API unitaria | `npm test -- --runInBand` | 36 pruebas, 17 suites |
| API e2e | `npm run test:e2e -- --runInBand` | 57 pruebas, 13 suites |
| Frontend build | `npm run build` en frontend | Correcto |
| Frontend Chrome | `npm test -- --watch=false --browsers=ChromeHeadless` | 34 pruebas |
| Navegador real | `docs\manual\capture_manual.cjs` y `capture_billing.cjs` | 7+4 flujos, 52+8 casos de ruta/ancho, 0 errores de página |
| Health | API 3001, frontend/proxy 4201 actualizados | HTTP 200 |
| Manual | Generador Python + inspección de estructura DOCX | Edición 3.3: 26 capítulos/anexos, 35 figuras, 63 tablas y 129 endpoints |

Nuevas suites:

- `identity-catalogs`: identidad, permisos, tenant y rollback de importación.
- `operational-controls`: transferencias simultáneas/idempotencia, reservado,
  conteo obsoleto, cancelación, PDF válido, snapshot estable, doble posteo,
  período cerrado, crédito/retorno únicos, reembolso y sobrepago de proveedor.
- `store-controls`: MAIN, checkout concurrente repetible, precio/publicación
  cambiados, entrega condicionada al despacho, baja privada y aislamiento.
- `hr-lifecycle`: entrada/salida simultáneas, cronología, revisión, baja y ausencias.
- Unitaria de secuencia: omite número histórico ocupado.
- Frontend: mock sin eco de secretos, restauración de sesión y descarte de respuesta vieja.
- `partial-receipts`: 9 casos de cantidades/tipos, concurrencia, replay,
  snapshot, doble aplicación, aislamiento, permisos, período cerrado/rollback,
  disponible/reservado, crédito exacto y preservación histórica.
- Dos casos nuevos de recuperación proveedor: permisos/tenant, payload,
  sobreingreso, período cerrado/rollback, concurrencia, replay, saldo exacto,
  total de asientos/auditoría sin alterar documentos previos.
- RRHH suma cancelación concurrente, versión obsoleta, decisión conservada,
  liberación de solapamiento, empleado inactivo y permisos/tenant.
- Frontend suma cuatro regresiones de confirmación, payload y descarte de
  respuestas privadas ante pérdida de sesión.
- Operaciones añade retorno físico posterior sin asiento adicional y controles
  de void/accepted fiscal sin borrar trazabilidad.
- SaaS: 15 e2e de membresía separada, lectura por tenant, snapshots/revisiones,
  fechas y decimales estrictos, abonos/replay/concurrencia, sobrepago, créditos,
  reversiones, antigüedad a corte, roles de consulta, tareas y preparación
  idempotente. Dos unitarias comprueban dependencias de Tienda.
- La preparación de cobranza vuelve a comprobar saldo actual bajo bloqueo de
  factura, incluso al usar un corte histórico; un documento pagado hoy no
  genera una reclamación nueva por haber estado vencido ayer.
- Frontend SaaS suma 13 pruebas de autorización, formulario, confirmación,
  errores, revisiones y descarte de respuestas de una identidad anterior.

### Navegador y capturas

`docs\manual\evidence.json` contiene fecha real, empresa ficticia, anchos,
rutas y medidas. No contiene contraseñas ni tokens. Capturas nuevas 12–20
documentan Usuarios, Catálogos, Control operativo, Personas, Facturación, Estudio
y Recepciones, recuperación proveedor y cancelación de ausencia.
Las capturas anteriores se renovaron y el portal temporal se revocó.
Corrida final iniciada el 2026-11-11 a las 04:11:30 UTC, empresa ficticia
`GUIA-20261110221129`: 52 medidas sin desbordamiento de página y cero errores.
Se regeneró el Word con esas capturas y se comprobaron estructura, ausencia
de JWT, acceso público de login/restablecimiento y requisito admin de los
endpoints nuevos de recepción, devolución/recuperación proveedor, retorno de
venta y cancelación de ausencia.
Desde formularios reales se recibieron 2+3 unidades, contabilizó la compra,
devolvió una unidad al proveedor y registró retorno total de venta. Se verificaron
físico final 104. Después de pagar 1500 y devolver mercancía por 300 quedó
crédito proveedor de 300; recuperar 100 por formulario dejó saldo -200 e
historial de un ingreso. Una ausencia aprobada se canceló desde Personas:
revisión 2 y nota original de aprobación conservada.

Se probaron 13 rutas en 320/390/768/1440 px, incluyendo tablas pobladas de
Recepciones. No equivale a certificación WCAG:
faltan lectores de pantalla, zoom/contraste y evaluación con usuarios.
El runner pausa entre lotes para respetar rate limit de restauraciones HTTP,
en lugar de desactivar protección.

Para repetir, usar una empresa FICTICIA nueva. El runner admite
`ERP_DEMO_SEED=true`, código que comience `GUIA-`, credenciales por variables
de entorno y `PLAYWRIGHT_MODULE` si Playwright se encuentra fuera del proyecto.
El seed usa contexto Nest sin escuchar HTTP: no requiere abrir bootstrap público.
No escribir claves en archivos ni ejecutarlo sobre datos empresariales reales.

No se borraron empresas de prueba automáticamente. Revisar y retirar datos
ficticios mediante procedimiento autorizado antes de usar la DB en producción.

### Entorno compartido

En la entrega anterior se verificó en 3011/4211 sin tocar los servicios antiguos.
En esta continuación el usuario autorizó reiniciarlos: API actual en
`127.0.0.1:3001`, frontend actual en `127.0.0.1:4201`, ambos persistentes
en segundo plano y con proxy `/api`. Readiness y proxy devuelven HTTP 200.
PostgreSQL se conserva activo, bootstrap permanece deshabilitado. La clave
JWT efímera se renovó: las sesiones anteriores requieren iniciar sesión otra vez.

## 6. Modelo de cobro SaaS y consola entregados

Referencia: [MODELO_COMERCIAL_SAAS.md](MODELO_COMERCIAL_SAAS.md).

Incluye catálogo/precios ilustrativos, paquetes, base por empresa, dependencias
de módulos, usuarios y consumo extraordinario; separación pagador/empresa/contrato;
outbox y ledger idempotentes; prorrateo, alertas, gracia, modo solo cierre;
webhooks, estados, arquitectura y criterios previos a cobrar.

### Consola de plataforma

Se agregan `/platform/billing` y `/subscription`. La autorización global usa
membresía explícita de plataforma; el rol `admin` de empresa no basta.
El responsable del servidor provisiona cuentas existentes; no hay alta pública
de operadores ni ascenso desde el navegador.

La cartera agrupa pagador, empresas y contratos; los contactos no autorizan
lectura de documentos operativos de otros tenants. Los módulos se contratan por
empresa; el rol del usuario sigue siendo un control independiente.

La consola registra documentos internos SaaS con líneas snapshot, ingresos
recibidos aplicados a una factura, créditos y reversiones sin borrar historia.
No se reutilizan facturas ni asientos de las empresas del ERP. El reporte de
antigüedad tiene fecha de corte y moneda explícitas; no interpretar factura
abierta aún no vencida como morosidad ni promesa como pago.

Seguimiento: tipo de contacto, responsable, vencimiento, promesa, nota y estado
revisionado. Un registro de tipo correo es una nota manual, no un mensaje enviado.
La agenda interna prepara tareas D-3, D0, D+3 y D+7 con clave única por
factura/etapa. No es un cron ni garantiza recuperar etapas pasadas omitidas.
Las ejecuciones repetidas no duplican tareas; se conservan ejecuciones/auditoría.

Evidencia SaaS: `docs\manual\billing-evidence.json`, empresa ficticia
`GUIA-SAAS-20261110221018588`, captura 2026-11-11T04:10:19.569Z. Desde UI se
crearon cuenta, contrato Base 99, factura, ingreso parcial 25 y promesa
asignada; saldo actual 74. Tras eliminar membresía temporal, el mismo admin
de tenant recibe 403 para cartera global y conserva consulta propia.
Ocho pruebas de ruta/ancho en 320/390/768/1440, sin overflow ni errores.
No quedó ninguna membresía de plataforma de las cuentas GUIA de documentación.

La provisión local exige correo existente elegido explícitamente,
confirmación, cuenta activa y protege al último propietario; sus cambios se
serializan para evitar dos revocaciones simultáneas. Ninguna cuenta real se
promovió automáticamente.

Pendientes externos/contractuales: proveedor y país emisor, comprobantes fiscales,
pasarela y firma de webhooks, correo/outbox de entrega, medición por uso,
prorrateo automático, anticipos sin factura y política de restricciones
transversal. La consola no mueve dinero ni promete suspensión automática.
El siguiente paso es aprobar términos y medición shadow, NO activar cobros
con contadores aproximados o desde el frontend.

Para retomar el desarrollo, leer [pendientes de desarrollo](PENDIENTES_DESARROLLO.md):
incluye alcance real, decisiones externas, prioridades y pasos reproducibles.

## 7. Backlog priorizado para continuar

### Prioridad P0: consistencia y preparación productiva

| ID | Trabajo concreto | Prerrequisito / aceptación mínima |
|---|---|---|
| P0-01 | Ampliar compras después del núcleo por lotes entregado | Recepción parcial, devolución y recuperación recibida proveedor implementadas/probadas. Faltan devengo por entrega parcial, cierre de remanente, conciliación/devolución de históricos y compensación entre compras |
| P0-02 | Valoración y costo de ventas | Elegir FIFO/promedio por empresa, entradas/salidas históricas revisadas; asiento COGS/stock, reversión coherente por retorno; nunca inventar costo histórico |
| P0-03 | Créditos y retornos parciales de venta | Retorno TOTAL posterior ya implementado. Para parciales: vínculo a línea/despacho, acumulados, impuesto/redondeo exactos y reembolso separado |
| P0-04 | Conciliación bancaria real | Cuentas bancarias, extractos/importación, deduplicación, matches parciales y diferencias auditadas; cierre no cambia saldo por "marcar conciliado" |
| P0-05 | Estados financieros | Balance general/resultados/flujo con aperturas, COGS, fechas y moneda explícita; cruzar contra libro y cuentas |
| P0-06 | Política monetaria y documentos históricos | País/moneda base aprobados, UI administrativa restringida, prohibir cambios con operaciones incompatibles; migración histórica revisada, no backfill USD automático |
| P0-07 | Fiscal real y cancelación legal | Controles comerciales entregados: void no se transmite, accepted no se reenvía y crédito no borra trazas. Faltan proveedor real, país, solicitudes/rechazos de anulación y homologación |
| P0-08 | Identidad productiva | Email transaccional y entrega segura de enlaces, MFA, recuperación autoservicio sin enumeración, permisos finos y evaluación BFF/HttpOnly/CSRF |
| P0-09 | Despliegue/operación | Ledger de migraciones, backups/restauración probados, secretos gestionados, HTTPS/CSP frontend, rate limit distribuido, monitoreo y alertas |
| P0-10 | Dinero exacto transversal | Revisar cálculos JS Number heredados; decimal/unidades menores, monedas 0/2/3 decimales y redondeo acordado por país |

Las ampliaciones restantes de P0-01 a P0-06 siguen pendientes; no confundirlas
con el núcleo por lotes ya probado. Para P0-02/P0-06 se necesitan
decisiones contables e información histórica; no elegirlas silenciosamente.

### Prioridad P1: eCommerce completo y SaaS

| ID | Trabajo | Verificación requerida |
|---|---|---|
| P1-01 | Pago online, webhooks y reembolsos de pasarela | Proveedor/país/credenciales sandbox aprobados; firma raw-body, deduplicación, importe/moneda, expiración y conciliación; retorno del navegador no confirma pago |
| P1-02 | Cotización/compra de envíos | Zonas, tarifas, impuestos/flete, proveedor y plazos; snapshot de costo aceptado y seguimiento; no cobrar dirección como si ya fuese envío contratado |
| P1-03 | Cuenta de cliente e historial | Email verificado, login separado, relación customer autorizada y permisos por documento; no unir por email anónimo |
| P1-04 | Comunicación transaccional | Outbox, templates, retries, estado de entrega, double opt-in y baja persistente; no rotar claves innecesariamente ni almacenar secretos en logs |
| P1-05 | SEO y tienda avanzada | Metadatos canónicos por producto, sitemap/robots, datos estructurados verificables, páginas, promociones con vigencia/cupos y cálculo server-side |
| P1-06 | Medios/editor/versiones | Subida segura, límites MIME/bytes, almacenamiento aislado, revisión/publicación/rollback, navegación y dominios; no anunciar drag-and-drop/Wix antes de implementarlo |
| P1-07 | Reservas web y privacidad | Expiración, abandono, job idempotente y liberación segura; plazos de retención/anonimización de direcciones, clientes invitados y suscriptores |
| P1-08 | Medición SaaS y entitlements efectivos | Consola/contratos informativos entregados; faltan catálogo comercial aprobado, outbox de uso, medición shadow/reconciliación por dos períodos y política transversal |
| P1-09 | SaaS integrado | Control manual de documentos/ingresos/seguimiento entregado; faltan proveedor/país emisor, fiscal, prorrateos, pasarela/webhooks, correo real y gracia sin perder acceso a datos |
| P1-10 | Empresa/grupo empresarial | Membresías multiempresa, cambio autorizado de contexto y pagador compartido sin compartir datos |

### Prioridad P2: personas, UX y soporte

- RRHH: zona horaria laboral, turnos, feriados, saldos/devengo de vacaciones,
  corrección de fechas de ausencias (hoy cancelar y solicitar de nuevo), asistencias antiguas
  paginadas, y validación de jornadas conforme al país.
- Nómina: confirmar país, contratos, reglas legales, impuestos y proveedor;
  motor versionado, pruebas homologadas y autorización profesional antes de pagar.
- Un rol employee no debe consultar PII de todos los compañeros: diseñar vínculo
  cuenta/empleado y permisos read-only por expediente antes del autoservicio.
- Catálogos: filtros/paginación server-side, importación CSV validada, vista previa,
  lotes grandes, control de concurrencia en edición y auditoría de diferencias.
- UI: tests de escritura desde navegador para cada formulario nuevo, lectores
  de pantalla, zoom, contraste, focus/error summary y validación con operadores.
- Asistencia: mantener mock hasta autorización explícita de proveedor IA.
  Futuro gateway con manual versionado, herramientas read-only autorizadas,
  citas y minimización; nunca exportar DOM/credenciales ni usar al modelo como RBAC.
- Actualizaciones aisladas de tooling: resolver advisories sin saltos mayores
  automáticos; CI que vuelva a ejecutar build/tests/e2e/responsive.
- Mejorar listado/exportación de auditoría con filtros autorizados y retención;
  no exponer payloads indiscriminadamente al chat.

## 8. Orden sugerido de la siguiente ejecución

1. Comprobar migraciones 0013–0022 en cada entorno y respaldar antes de migrar.
2. Ejecutar regresión existente y conservar evidencia base.
3. Continuar P0-01: devengo por recepción, cierre autorizado de remanente,
   conciliación de históricos y compensación entre compras del crédito proveedor.
4. Acordar método de costo/moneda antes de P0-02; conciliar histórico.
5. Completar P0-03, P0-04 y reportes con criterios verificables.
6. Elegir proveedores/jurisdicción antes de fiscal, pagos, envío y nómina.
7. Trabajar P1-03/P1-04 antes de enlazar clientes reales o hacer campañas.
8. SaaS primero informativo/shadow, después cobro, nunca saltar directo a bloqueo.
9. Actualizar fuente del manual, capturas, Word y esta bitácora tras cada flujo.

Ante dudas funcionales puede consultarse la fuente autorizada local
`C:\angular\erp360\odoo-20.0.post20261110` para comprender procesos. Implementar
lógica propia compatible con ERP360; no requiere REA para fuente normal ni
autoriza copiar marcas, contenido protegido o secretos.

## 9. Documentación y control de cambios

- Manual: [Word actualizado](manual/MANUAL_ERP360_OPERACION_Y_CONFIGURACION.docx);
  fuente reproducible `docs\manual\generate_manual.py`.
- Arranque: [DESPLIEGUE_LOCAL.md](DESPLIEGUE_LOCAL.md).
- Diseño SaaS: [MODELO_COMERCIAL_SAAS.md](MODELO_COMERCIAL_SAAS.md).
- Revisión previa de arquitectura: [REVISION_UI_SEGURIDAD_IA.md](REVISION_UI_SEGURIDAD_IA.md).

El worktree contenía cambios anteriores y artefactos `api\dist` rastreados.
Los builds regeneran esos artefactos. No se revirtieron cambios existentes,
no se hicieron commits, no se borraron volúmenes y no se guardaron secretos.
Antes de versionar: revisar diff, separar lotes coherentes, verificar ausencia
de credenciales y decidir según la política del repositorio cómo tratar dist.
