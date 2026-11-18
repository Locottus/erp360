# ERP360: continuidad del desarrollo

Fecha de corte: 17 de noviembre de 2026. Repositorio de trabajo:
`C:\angular\erp360\erp360-modernizado`.

Este documento permite retomar el desarrollo. No afirma que el ERP esté
completo, homologado fiscalmente ni preparado para producción.
Ver también [bitácora detallada](BITACORA_CONTINUIDAD.md),
[modelo comercial SaaS](MODELO_COMERCIAL_SAAS.md) y
[manual ilustrado](manual/MANUAL_ERP360_OPERACION_Y_CONFIGURACION.docx).

## 1. Punto de partida

Angular, NestJS y PostgreSQL 16. API local `http://127.0.0.1:3001`,
frontend `http://127.0.0.1:4201`, proxy frontend `/api`.
Contenedor de datos `erp360-db`: conservar su volumen.

Migraciones incrementales disponibles hasta `0034_purchase_delivery_plan_revision.sql`.
Respaldar antes de migrar; no volver a inicializar datos existentes.
El directorio padre contiene Odoo como referencia de lógica, no es la aplicación
que se está ejecutando.

### Última continuación: tres bloques de planificación de compras

1. **Resumen por destino/fecha:** Ver órdenes muestra total empresarial, grupos
   mutuamente excluyentes, fecha/hora UTC y órdenes excluidas para revisión.
   Reutiliza el cálculo existente de pedido menos recepción documentada por línea,
   con cantidades exactas. No asigna destino/fecha a históricos.
2. **Solicitudes abiertas:** incluye borradores/enviadas sin orden, manuales y
   propuestas de todas las reglas del producto. Cantidad no aprobada separada del
   pendiente de órdenes; origen de regla y destino declarados independientes.
   Aprobar traslada la visibilidad a la orden; rechazar retira la solicitud.
3. **CSV autenticado:** nueva consulta del producto, una fila por documento,
   columnas separadas para pendiente verificable y solicitud no aprobada, sin
   filas de totales. Anomalías con pendiente vacío y banderas; textos neutralizados
   frente a fórmulas. Importar cantidades como texto.

GET `inventory/replenishment/:productId/purchase-planning` y sufijo `.csv`,
solo admin de la empresa; no se amplía purchases. Resumen/grupos/documentos de
la pantalla comparten una instantánea SQL. Reglas y exportación son consultas
independientes y pueden diferir; Actualizar planificación renueva el detalle.
No se descuenta tránsito/solicitudes de la sugerencia ni se bloquean duplicados
manuales o entre reglas. No hay fechas por línea ni confirmación del proveedor.

Builds API/Angular, **42 e2e en tres suites** y **32 pruebas Angular en tres suites**
correctos. Navegador: tres flujos, tres anchos 375/768/1280, sin overflow global
ni errores; descarga CSV real, aprobación y permisos. Errores 503 de planificación
y CSV fueron sintéticos; recuperación con API real aislada. Ver
[evidencia](manual/purchase-planning-evidence.json).

Sin migración: se reinició solo la API ERP; frontend sigue en 4201 y proxy/health
200, bootstrap 403. Conservadas huellas de seis conjuntos operativos:
264 solicitudes, 241 órdenes, 210 recepciones, 1169 movimientos, 320 saldos,
893 asientos. Copia/API temporales retiradas, respaldo privado conservado.
Ayuda, manual Word **3.19** (12.2–12.4) y notas actualizados al final de los tres bloques.

**Pendiente siguiente:** deduplicación transversal de necesidades (definir qué
solicitudes satisfacen la misma necesidad antes de bloquear), catálogo autorizado
de almacenes y fechas por línea. Cierre de remanentes parciales, devengos y
políticas monetarias requieren definición contable: no se habilitaron por inferencia.

### Continuación anterior: carga automática de Operaciones al restaurar sesión

Corregido el pendiente UX documentado en 0032–0034. Operaciones ahora reacciona
a la restauración de la sesión administradora, en lugar de consultar solo
en `ngOnInit`. Carga inicial única; `Actualizar` sigue sirviendo para reintentar
errores o consultar cambios posteriores. Muestra un indicador de carga y
mantiene la pestaña solicitada en la URL.

Al cambiar la identidad se limpian listados/detalles, balance y token de
portal mostrado. Las lecturas de listas y balance conservan identidad y
generación: una respuesta anterior no sobrescribe el estado local ni termina
el indicador de la nueva carga. No cambia roles, duración de sesión,
interceptores globales ni reglas de escritura.

Validación: las cuatro regresiones iniciales fallaron antes de corregirlo;
después, **30 pruebas Angular en tres suites**, incluidas cinco regresiones
de sesión/balance. Build Angular correcto. Navegador real: **tres flujos,
nueve combinaciones de ruta/ancho**, 375/768/1280, sin errores ni overflow.
Identidad retenida hasta montar la pantalla, restauración real, una lectura
por endpoint/entrada en Compras, Ventas y Catálogos; error 503 sintético
visible y recuperación real con Actualizar; usuario purchases sin lecturas
administrativas. Ver [evidencia](manual/operations-session-evidence.json).

Sin migración nueva ni cambios en la API; no se reiniciaron servicios u
otros proyectos. Los datos de prueba se crearon en una copia restaurada
aislada y se retiraron al cerrar. API 3001 y Angular 4201 siguen disponibles;
264 solicitudes, 241 órdenes y 210 recepciones operativas conservadas.

**Documentación de usuario:** ayuda contextual y manual Word **3.18**, sección
4.1 sobre recarga, indicador, errores y permisos; captura nueva de demostración.
El manual conserva los procedimientos 0032–0034 de la edición anterior.

El desglose por destino/fecha sugerido en este corte se completó después en los
tres bloques superiores. Siguen sin inferirse destino de reglas, fechas por línea,
confirmaciones del proveedor o políticas contables.

### Continuación anterior: reprogramación auditada de compras (0034)

En **Operaciones → Compras**, **Plan e historial de solicitud** permite
reprogramar borradores/enviadas; tras aprobar se usa **Plan e historial de orden**
para órdenes abiertas/parciales. Revisión propia por documento, motivo
10–1000 caracteres y confirmación explícita de los campos vacíos: retirarlos
no es omitir una modificación. Los documentos cerrados conservan consulta.

Auditoría antes/después con actor, fecha y revisión; vista de las 50 más
recientes con aviso de anteriores. Conflictos 409 no sobrescriben: recargar,
revisar y reenviar. Bloqueos compartidos con aprobación, cancelación y
recepción impiden instantáneas inconsistentes. El plan de solicitud y orden
son independientes; no se reescriben importes, stock, lotes recibidos ni su
auditoría. El mismo lote sigue admitiendo replay idéntico tras reprogramar.

Verificación: builds API/Angular, 34 e2e en cuatro suites, 25 pruebas Angular
y 9 unitarias API en cuatro suites relevantes. Navegador real: cuatro
flujos, nueve combinaciones de estado/ruta/ancho 375/768/1280, sin errores
ni overflow; contra API/base aisladas, no datos operativos.
Aplicada 0034, API reiniciada en 3001 y Angular en 4201: health/proxy 200,
bootstrap 403 y nueva ruta sin autenticación 401. Huellas de documentos,
movimientos, saldos y asientos conservadas; 264 solicitudes, 241 órdenes
y 210 recepciones sin alteración. Copia temporal retirada, respaldo privado retenido.

**Documentación de usuario actualizada por bloque:** manual Word regenerado,
edición **3.17**, capítulos 3.7, 10.5, 11.5–11.6 y reposición, con dos capturas
nuevas y contratos actuales. Incluye también los cambios 0032/0033 que aún
no estaban en Word. Ayuda contextual de las pantallas puesta al día.
Ver [manual](manual/MANUAL_ERP360_OPERACION_Y_CONFIGURACION.docx),
[evidencia](manual/purchase-rescheduling-evidence.json) y
[adaptación](ADAPTACION_ODOO.md#reprogramación-auditada-de-compras-0034).

La carga inicial de Operaciones sugerida en ese corte se corrigió en la
continuación UX superior. Sigue pendiente el desglose informativo de compras pendientes
por destino/fecha, manteniendo el total empresarial sin doble conteo ni
descuento automático de tránsito. Siguen pendientes fechas por línea,
calendarios, catálogo de almacenes y confirmación real del proveedor.
Políticas contables/monetarias deben acordarse antes de ampliar devengos o COGS.

### Continuación anterior: planificación de recepción de compras (0033)

Destino previsto y fecha comprometida opcionales desde solicitudes manuales
y propuestas de reposición. Se copian a la orden aprobada, con auditoría,
y se consultan en Compras, Ver órdenes de reposición y Recepciones.
Históricos permanecen sin estos datos, no se asignó MAIN ni fecha ficticia.
La ubicación origen de una regla no implica destino.

Recepciones sugiere el destino previsto al seleccionar la orden. El operador
confirma la ubicación física real y puede cambiarla; la UI avisa si difiere.
Una actualización del detalle no pisa esa ubicación real. El lote y la
auditoría conservan lo recibido; la orden mantiene su planificación.
Una fecha pasada es admisible y no impide aprobar/recibir; el aviso de fecha
superada aplica solo a órdenes abiertas y se calcula con fecha UTC inclusiva.
No se descuenta tránsito del mínimo/objetivo ni se cambian devengos o costos.

Validación: builds API/Angular, 8 unitarias API, 28 e2e en cuatro suites,
22 pruebas Angular; navegador real, tres flujos y nueve combinaciones
375/768/1280 sin errores ni overflow. Todo dato de prueba se creó en copia
restaurada aislada; API temporal y copia retiradas. Aplicada 0033 a la base
operativa, API reiniciada, health/proxy 200 y bootstrap 403.
Se conservaron 264 solicitudes, 241 órdenes y 210 recepciones.
Ver [adaptación](ADAPTACION_ODOO.md#planificación-de-entrega-de-compras-0033)
y [evidencia de navegador](manual/purchase-plan-evidence.json).

La reprogramación sugerida en ese corte se completó después en **0034**
(sección superior). No incluye fechas por línea, calendario laboral,
confirmación del proveedor, catálogo de almacenes ni previsión por destino/plazo.
Mantener el total empresarial sin doble conteo.
Después, definir con responsable contable devengo parcial, política monetaria,
COGS y reglas de créditos parciales; no inferir esas políticas desde Odoo.

### Continuación anterior: recuperación del ambiente y vigencia empresarial (0032)

API y frontend reiniciados en los puertos indicados, con escucha loopback y
bootstrap deshabilitado. Base y otros proyectos Docker conservados.

Mi empresa permite guardar **0 a 3650 días enteros** como vigencia predeterminada,
con revisión, motivo y auditoría. Cero conserva el comportamiento anterior.
Cotizaciones nuevas sin `validUntil` usan hoy UTC más esos días; null explícito
significa sin caducidad y una fecha explícita tiene prioridad. La UI distingue
las tres opciones. No se recalculan ofertas históricas ni checkout.
El límite de días es propio de ERP360, no una regla atribuida a Odoo.

Builds API/Angular correctos; 7 unitarias API, 20 e2e en seis suites y
15 pruebas Angular. El primer intento e2e excedió los 5 segundos del hook;
la repetición completa con `--testTimeout=30000` pasó. No se alteró el timeout
global del proyecto. UI real contra API/base aisladas: dos flujos,
seis anchos/rutas y cero errores. Ver
[adaptación](ADAPTACION_ODOO.md#vigencia-predeterminada-por-empresa-0032).

La inspección encontró avances previos de IA externa (0028/0029), tipos de
cambio (otro archivo 0029), cuentas bancarias/reportes (0030) y pagos
multimoneda (0031). Algunas notas anteriores describen aún solo el mock.
No se invocaron proveedores externos ni se configuraron claves. Estos avances
no convierten bancos, multimoneda o estados financieros en procesos certificados.
No renumerar migraciones ya usadas: hay dos prefijos 0029; registrar nombres
completos/checksums en un futuro ledger de migraciones.

El destino y fecha propuestos en ese corte se incorporaron después en 0033
(sección superior). No se descuenta tránsito automáticamente.
El pendiente UX observado en ese corte (catálogos sin cargar si la sesión se
restauraba después de `ngOnInit`) quedó corregido en la continuación UX
superior, documentada en el manual 3.18.

### Avance actual: aprobación independiente de compras (0027)

Mi empresa permite exigir otro administrador para aprobar solicitudes.
La opción inicia desactivada y su cambio requiere motivo/revisión con
auditoría. Activada, impide la autoaprobación, incluidas propuestas de
reposición. Solicitudes sin creador conocido requieren revisión y no se
aprueban mientras esté activa; no se asignó autor a históricos.
Lista y detalle exponen el motivo del bloqueo; la API vuelve a comprobarlo
en transacción, coordinada con cambios de política empresarial.
No cambia órdenes aprobadas ni los permisos existentes.

Antes de activar, provisionar otro administrador activo. Sigue pendiente
un rol granular de aprobación, umbrales, delegaciones y restringir quién
puede desactivar la política. Admin conserva esa posibilidad con auditoría;
este paso no declara Compras preparado para producción.
Referencia y diferencias: [adaptación Odoo](ADAPTACION_ODOO.md).
Verificación focalizada: builds API/Angular, 11 unitarias API, 18 e2e API
y 12 pruebas UI. Navegador: política guardada con auditoría, autoaprobación
oculta, rechazo disponible y texto de bloqueo visible a 375/768/1280 px.
La concurrencia comprueba el bloqueo real en PostgreSQL y la política
confirmada antes de aprobar. El type-check del alcance cambiado pasa;
el chequeo global de tests sigue bloqueado por el tipo previo de parámetros
del libro mayor en `api/test/core-management.e2e-spec.ts:219`.

### Avance actual: compromisos de compra visibles

Actualización 0026: desde una regla se crea una solicitud de compra en
borrador con proveedor, cantidad y costo explícitos, sin impuesto y con motivo.
Se impide más de una propuesta abierta por regla, incluyendo solicitudes
concurrentes. Al aprobar/rechazar se libera la regla. No detecta solicitudes
manuales u otras ubicaciones; revisar compromisos antes de proponer y aprobar.
La ubicación describe el origen, no obliga el destino. No hay segregación de
creador y aprobador ni política automática de impuestos o costos.
Verificado: builds, 36 unitarias y 78 e2e API, 61 frontend; seis flujos de
navegador y 24 combinaciones ruta/ancho sin errores. Manual 3.12.

Se añadió consulta de líneas y totales de solicitudes antes de decidir.
Es una lectura informativa y no bloquea la solicitud ni garantiza que no
cambie después. Sigue pendiente segregar creación de aprobación y ampliar la
protección de duplicados a compras manuales y otras ubicaciones. La separación
opt-in de creador/aprobador se incorporó después en 0027.
Manual 3.11; 36 unitarias API, 77 e2e, 59 frontend; cinco flujos reales y
20 combinaciones ruta/ancho sin errores.

En el cierre anterior: en Operaciones → Compras se puede rechazar una
solicitud abierta con motivo auditado; aprobación y rechazo concurrentes se
serializan. El rechazo no anula una orden ya aprobada. No implementa todavía
propuestas generadas desde reposición ni segregación de quien crea y aprueba.
Verificado: 36 unitarias API, 77 e2e y 57 frontend; cinco flujos reales y
20 combinaciones ruta/ancho sin errores. Manual 3.10; sin migración.

Actualización posterior: el botón **Ver órdenes** desglosa proveedor, estado,
pedido, recepción documentada y pendiente verificable o motivo de exclusión.
El resumen y el detalle se consultan por separado y pueden diferir si hay
movimientos entre ambas consultas; actualiza antes de decidir. La lectura
requiere administrador y está aislada por empresa. Verificado: builds,
36 unitarias y 75 e2e API, 55 frontend; cuatro flujos reales, 16 anchos,
sin errores. Manual 3.9. No hubo migración ni se crearon propuestas aprobables.

Reposición muestra por producto el total empresarial pendiente de órdenes
aprobadas menos recepciones parciales, con total de órdenes. Una cancelación
deja de contarse; devoluciones no reabren órdenes. Recibos históricos sin
líneas y sobre-recepciones se señalan y excluyen del total. No se asigna
destino ni fecha inexistentes; el total se repite por ubicación y no debe
sumarse. La sugerencia por ubicación no se recalcula descontándolo.
En ese cierre no se había creado propuesta aprobable ni se modificó contabilidad, política de costos,
permisos o membresías multiempresa. Referencia y diferencias:
[adaptación Odoo](ADAPTACION_ODOO.md).
En el cierre anterior: API 36 unitarias y 75 e2e, frontend 52; cuatro flujos
de navegador y 16 combinaciones ruta/ancho sin errores. Manual 3.8.

### Usuarios, empresas, inventario y contabilidad: avance 0025

- Usuarios: edición con `management_revision`, motivo y auditoría antes/después;
  conflicto 409 al intentar sobrescribir otra edición. Se conserva la protección
  del último administrador y la revocación de sesiones.
- Mi empresa (`/company`): perfil con revisión, nombre e identificación tributaria
  de la empresa autenticada. Código, actividad, moneda y contrato no se editan.
  Facturas con snapshot conservan emisor; PDF legados sin snapshot siguen
  mostrando datos descriptivos actuales con aviso.
- Inventario: mínimo/objetivo por producto y ubicación, sugerencia exacta sobre
  físico menos reservado. Mínimo cero desactiva; producto inactivo no sugiere.
  Incluye reglas sin saldo; no crea compras ni resta mercancía en tránsito.
- Contabilidad (`/accounting`): plan consultable sin recalcular el balance y
  libro mayor publicado con apertura, movimientos, cierre y acumulado previo
  a paginación. Cálculo monetario SQL exacto, respuesta como cadenas decimales.
- Cierre verificado: builds, 36 unitarias API, 73 e2e y 52 frontend.
  Navegador real: cuatro flujos y 16 combinaciones ruta/ancho, cero errores.
  Evidencia `docs/manual/management-evidence.json`; manual actualizado a 3.7.

Siguientes puntos concretos:

1. Identidad: permisos de escritura granulares, MFA, correo seguro y
   recuperación autoservicio, antes de delegar finanzas o inventario sin admin.
2. Empresa: membresías autorizadas multiempresa, política monetaria/zonas y
   cambios legales de razón social; no ampliar este perfil como selector global.
3. Reposición: destino/fecha opcionales entregados en 0033; pendientes
   plazos por línea y deduplicación frente a
   solicitudes manuales y otras ubicaciones; no crear pedidos automáticamente.
4. Finanzas: conciliación parcial, estados por moneda/base aprobada,
   apertura histórica autorizada y ajustes/asientos manuales con segregación.
   El libro mayor actual no certifica el estado financiero ni añade COGS.

### Adaptación desde fuente Odoo: vigencia de ofertas

Implementada en esta etapa: fecha opcional, indicador de vencimiento, rechazo
de confirmación vencida y revisión con motivo/revisión esperada. UI en
Operaciones → Ventas. Históricos sin fecha siguen sin caducidad; no hay firma
electrónica ni aceptación pública. Se usa UTC explícitamente.
Ver [evidencia y diferencias con Odoo](ADAPTACION_ODOO.md).

Vigencia predeterminada configurable entregada en 0032 (sección superior).
Pendiente: política de zona horaria, revisión comercial de precios en una nueva oferta y eventual flujo
de aceptación/firma autorizado. No asumir que revisar vigencia cambia precios.

### Entrega SaaS de esta etapa

- Consola `/platform/billing`, distinta del administrador de empresa.
- Miembros de plataforma explícitos: propietario, cobranza y consulta.
- Cuenta pagadora, empresa y contrato separados; compartir pagador no
  autoriza acceder a documentos operativos de otros tenants.
- Contratos por módulos y revisiones con precios exactos a cuatro decimales.
  Base obligatoria; Tienda requiere Ventas e Inventario.
- Facturas internas con snapshot de líneas, ingresos parciales aplicados a una
  factura, créditos y reversión de ingreso sin borrar el documento original.
- Cartera por fecha de corte, antigüedad y exportación CSV.
- Seguimiento con responsable, vencimiento, promesa, nota y revisión.
- Preparación asistida e idempotente de tareas de cobranza; no envía mensajes.
- `/subscription`: contrato, módulos, saldo y conteo de usuarios únicamente de
  la empresa autenticada; no muestra detalle de documentos ni permite cambios.

Los contratos son **informativos**: no hay bloqueo comercial de endpoints.
Los ingresos se registran después de recibir dinero fuera del sistema.
Las facturas SaaS no son comprobantes fiscales ni crean asientos en la
contabilidad operativa del cliente. USD es la única moneda SaaS habilitada.

### Límites que deben mantenerse visibles

- No hay pasarela, tarjetas, webhooks de cobro ni correo transaccional activo.
- No hay renovación/cargo recurrente programado: emitir períodos manualmente.
- No hay medición ni facturación de excedentes de usuarios, operaciones o GB.
- No hay prorrateo automático, anticipo sin factura, cobro independiente por
  módulo, reembolso bancario ni conciliación de extractos SaaS.
- No hay suspensión/cancelación contractual autoservicio, política de gracia
  efectiva ni restricción de módulos. No usar `companies.is_active` para ello.
- Las revisiones de contrato aplican a nuevas emisiones manuales; no existe
  agenda de cambios futuros ni reconstrucción contractual bitemporal.
- La fecha de corte reconstruye saldos monetarios por fecha efectiva. No
  interpreta el estado actual de módulos/tareas como su estado histórico.
- Emisión manual exige revisión humana de período y referencia: aún falta una
  política de ciclos que impida duplicar o solapar períodos cobrados.
- No hay MFA ni identidad de plataforma con sesión/proveedor independiente:
  se usa sesión existente más membresía separada validada en base.
- La guía/diagnóstico local convive con adaptadores IA externos opt-in
  incorporados después de esta entrega SaaS; requieren proveedor, servicio,
  cuota y consentimiento. No se invocaron ni certificaron en el corte 0032.

## 2. Próxima iteración recomendada: consolidar SaaS

| Orden | Pendiente | Dependencia / aceptación |
|---|---|---|
| 1 | Política comercial definitiva | País del emisor, moneda, impuestos, contrato, precios, ciclo, gracia, cancelación y devoluciones aprobados; no asumirlos desde ejemplos |
| 2 | Calendario contractual y emisión segura | Intervalos definidos, unicidad/solapamiento por suscripción, fecha efectiva de revisiones, borrador/previsualización; replay no duplica documentos |
| 3 | Cancelación/suspensión de contrato | Motivo/revisión/fecha efectiva; fin de período pagado; conservar datos, saldos y cierre correctivo; historial íntegro |
| 4 | Créditos, anticipos y devoluciones ampliados | Ledger/aplicaciones explícitas; anticipos sin factura; compensaciones auditadas; no confundir crédito con dinero enviado |
| 5 | Reportes históricos ampliados | Versionar también membresías contractuales/tareas; separar fecha efectiva y fecha de registro; definir tratamiento de correcciones retroactivas |
| 6 | Cobranza configurable | Niveles, plantillas, pausas con vencimiento, acuerdos y escalamiento; recordar de forma reproducible etapas omitidas por inactividad del job |
| 7 | Correo real | Proveedor/credenciales, outbox, reintentos, deduplicación, entrega/rebote; revisar saldo/pausa antes de enviar |
| 8 | Pago hospedado | Proveedor admitido en país, sandbox, webhook firmado sobre cuerpo crudo, idempotencia, cuenta/importe/moneda y conciliación; retorno web no confirma pago |
| 9 | Conciliación de SaaS | Extractos y referencias únicas por cuenta receptora, matches parciales, diferencias y reversión; no marcar pagado manualmente sin movimiento |
| 10 | Medición shadow | Outbox en misma transacción operativa, ledger único por origen/versión, dos períodos reconciliados; no cobrar estimaciones |
| 11 | Entitlements efectivos | Política contractual aprobada, dependencias, guards en HTTP/RPC/jobs y checkout atómico; lectura/exportación/cierre siguen disponibles |
| 12 | Operación de plataforma | MFA, segregación de funciones, límites de acceso, auditoría de lecturas, aprobación de ajustes sensibles, paginación y límites de volumen |

No habilitar procesos masivos en producción hasta medir consultas y bloquear
correctamente movimientos concurrentes. La preparación de tareas actual es
manual; su ejecución no implica que alguien contactó al cliente.

## 3. Pendientes del núcleo ERP

| Prioridad | Pendiente | Criterio mínimo |
|---|---|---|
| P0 | Valoración y costo de ventas | Elegir FIFO/promedio por empresa con responsable contable; costos históricos revisados y asientos/reversiones coherentes |
| P0 | Compras por lotes avanzadas | Devengo por entrega parcial, cierre de remanente, conciliación/devolución de históricos y compensación de crédito entre compras |
| P0 | Crédito/retorno parcial de venta | Vínculos a línea/despacho, acumulados, impuesto/redondeo exactos y dinero separado de mercancía |
| P0 | Bancos y estados financieros | Extractos deduplicados, matches parciales, balances/flujo con aperturas y fechas; cruzar contra libro |
| P0 | Política monetaria transversal | Moneda base/país y migración histórica autorizados, decimal exacto, monedas 0/2/3 decimales; no completar históricos con USD ficticio |
| P0 | Fiscal real | País/proveedor y homologación; transmisión/anulación legal auditada, créditos comerciales separados |
| P0 | Identidad y seguridad productiva | MFA, correo seguro, recuperación autoservicio, permisos finos, HTTPS/CSP, secretos y rate limit distribuido |
| P0 | Operación y restauración | Ledger de migraciones, backups cifrados/retención, restauración probada y monitoreo |

### Avance operativo 0035

- Completado: política `weighted_average`/`fifo`, snapshot de costo por
  despacho, asiento COGS en 1200/5100 y protección contra asiento duplicado.
- Completado: conciliación bancaria con estados, pago vinculado y diferencia
  auditada. Importación bancaria masiva y matching automático siguen pendientes.
- Completado: MFA TOTP cifrado en API y código MFA en el login.
  Falta el flujo visual completo de alta, recuperación y revocación de factor.
- Completado: gateway de pagos de entrada con firma HMAC e idempotencia por
  evento. Falta credencial y proceso de proveedor real, conversión contable
  automática y conciliación externa.
- Completado: bloqueo de producción fiscal sin certificación externa y
  orientación del asistente por módulo.
- Pendiente externo: homologación fiscal por país, pasarela/banco real,
  credenciales, sandbox/producción, certificados y monitoreo.

### Avance operativo 0036

- Completado: ledger de migraciones, respaldo/restauración operativa y tablas
  de entitlements/outbox SaaS.
- Completado: catálogo de almacenes autorizados y bloqueo transversal básico
  de solicitudes abiertas por producto/proveedor.
- Completado: expiración de reserva de tienda a 30 minutos, cuenta cliente
  verificable y estado de cotización de envío.
- Completado: paginación opcional en empleados, asistencia y ausencias, más
  vínculo/desvínculo auditado empleado/cuenta.
- Pendiente externo: restore probado sobre servidor limpio, RPO/RTO real,
  monitoreo/alertas y CI de migraciones.
- Pendiente comercial: calendario SaaS efectivo, suspensión real, cobro recurrente,
  correo, pasarela y enforcement en HTTP/RPC/jobs.
- Pendiente tienda: verificación real de correo, cotizador de flete, proveedor
  de pago, reembolso y SEO seguro.

Los cobros nuevos de venta no liquidan residuos de 0,0001; revisar facturas
anteriores que figuren pagadas con saldo positivo. La corrección no altera el
histórico ni sustituye una política monetaria aprobada.

## 4. eCommerce, RRHH y asistencia

- **eCommerce:** pasarela y reembolso real; fletes/tarifas; cuenta de cliente con
  email verificado; comunicaciones; SEO por producto; medios seguros y
  publicación/versiones; expiración de reservas; privacidad/retención.
  El editor actual no equivale a Wix ni ofrece constructor libre drag-and-drop.
- **RRHH:** zona laboral, turnos, feriados, saldos/devengo de vacaciones,
  corrección de fechas con historial y datos antiguos paginados. Hoy se puede
  cancelar una ausencia y solicitar otra. Nómina exige jurisdicción y homologación.
- **Jornadas abiertas:** Operaciones consulta todas las entradas abiertas de la
  empresa, independientemente del límite de 500 registros del historial. Esa
  consulta aún no está paginada; la consulta histórica tampoco ofrece paginación.
- **Permisos de personas:** vínculo cuenta/empleado antes de autoservicio;
  no exponer expedientes de compañeros. Las lecturas HTTP de empleados,
  asistencias y ausencias y `hr.employee.search_read` por RPC requieren admin;
  esto no implementa acceso a datos propios ni roles específicos de RRHH.
- **IA futura:** mantener mock hasta aprobar proveedor, privacidad y retención;
  herramientas allowlist, lectura tenant-scoped, redacción, consentimiento y
  aprobación humana en escrituras. Nunca dar a una IA secretos ni acceso SQL libre.
- **Accesibilidad:** lectores de pantalla, zoom, contraste, teclado y pruebas con
  usuarios. Pruebas de ancho no son certificación WCAG.

## 4.1 Revisión de módulos y prioridades

Revisión inicial de rutas, controles y bitácora; no es una auditoría exhaustiva
de la lógica ni una certificación de paridad con Odoo.

| Área | Siguiente trabajo |
|---|---|
| Identidad y empresa | MFA, recuperación segura y permisos por recurso; mantener aislamiento tenant y revocación en HTTP/RPC. |
| Maestros y ventas | Lecturas de clientes/ventas/PDF/RPC para admin o sales y proveedores/compras para admin o purchases; falta alcance por vendedor y créditos/retornos parciales. |
| Compras e inventario | Recepción parcial con devengo, remanentes, valoración aprobada y trazabilidad histórica. |
| Contabilidad y fiscal | Balance y documentos fiscales requieren admin; falta rol contable independiente, conciliación, estados financieros y homologación externa. |
| Portal y tienda | Permisos y privacidad, expiración de reservas, cuenta verificada, pagos y envíos reales. |
| Personas | Roles RRHH, acceso a datos propios vinculado a cuenta, paginación y zona laboral aprobada. |
| Dashboard y SaaS | Armonizar visibilidad de métricas y APIs; política comercial, MFA y facturación segura. |

Productos, impuestos, saldos y movimientos de inventario siguen disponibles a
usuarios autenticados de la empresa. No existe alcance por documento o vendedor,
ni rol contable o de inventario independiente. Completar y aprobar la matriz de
permisos antes de habilitar datos sensibles a usuarios de producción.

## 5. Cómo retomar

1. Leer este documento y la bitácora; inspeccionar cambios locales antes de editar.
   No revertir trabajo previo ni ejecutar limpiezas destructivas.
2. Verificar base `erp360-db`, respaldar y confirmar migraciones sin reinicializar.
3. Seguir [despliegue local](DESPLIEGUE_LOCAL.md). Compilar antes de iniciar la API.
4. No guardar claves JWT ni contraseñas en documentación. Reiniciar con una clave
   efímera nueva invalida sesiones anteriores y obliga a iniciar sesión nuevamente.
5. Para operador SaaS, usar el comando explícito de provisión con una cuenta
   real elegida por el responsable. No promover automáticamente administradores.
6. Elegir un pendiente acotado y sus criterios de aceptación; preservar
   tenant/RBAC y las relaciones de módulos. No resolver decisiones fiscales
   o contables silenciosamente.
7. Probar concurrencia, replay, rollback, permisos y cambio de identidad en UI.
8. Actualizar manual, evidencia y esta lista al cerrar la iteración.

### Validación reproducible

En `api`:

```powershell
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

En `frontend`:

```powershell
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

Las e2e necesitan PostgreSQL y generan tenants ficticios. El capturador
`docs\manual\capture_billing.cjs` exige credenciales ficticias efímeras y código
`GUIA-...` nuevo. Crea una membresía temporal y la elimina al finalizar,
incluso si falla; no asigna privilegios a cuentas reales. No almacenar
contraseñas/tokens en evidencia. La demostración no es una restauración de backup.

## 6. Decisiones externas para habilitar cobros reales

El responsable comercial debe proporcionar: identidad fiscal/país del emisor,
moneda, proveedor y cuenta de pagos, credenciales sandbox mediante canal seguro,
proveedor de correo/dominio verificado, términos aceptados y reglas de
cancelación/gracia/reembolso. Hasta entonces, mostrar integraciones como
**sin configurar**, no como operaciones exitosas simuladas.

## 7. Evidencia de cierre de esta etapa

Último cierre, gestión 0025 (11 de noviembre): 36 unitarias API, 73 e2e
(15 suites) y 52 frontend; builds correctos. Cuatro flujos reales en 16
combinaciones ruta/ancho sin errores. Manual 3.7: 26 capítulos/anexos,
41 figuras, 63 tablas y 135 endpoints. Respaldo previo legible; no se ensayó
restauración. Los cierres siguientes son antecedentes, no pruebas repetidas.

Actualización por adaptación Odoo (11 de noviembre): migración 0024 aplicada
tras respaldo; builds correctos, 36 unitarias API, 65 e2e y 42 frontend.
Prueba real de vigencia: dos flujos, cuatro anchos, cero errores.
Manual 3.6: 26 capítulos/anexos, 36 figuras, 63 tablas y 130 endpoints.
Las métricas SaaS de la entrega anterior que siguen debajo conservan su fecha
y no representan una repetición de ese navegador en esta actualización.

- API build correcto, 36 unitarias y 57 e2e aprobadas.
- Frontend build correcto, 34 pruebas ChromeHeadless aprobadas.
- Navegador ERP: 7 flujos y 52 comprobaciones responsive, sin errores.
- Navegador SaaS: 4 flujos y 8 comprobaciones responsive, sin errores.
  Creación por formulario de pagador/contrato/factura, ingreso parcial real de
  demostración, promesa asignada y rechazo 403 tras retirar membresía temporal.
- Manual edición 3.3: 26 capítulos/anexos, 35 figuras, 63 tablas y 129 endpoints.
- Migración 0023 aplicada localmente después de respaldo. No asumir que está
  aplicada en otros entornos ni presentar el respaldo como restauración probada.

La evidencia usa empresas ficticias y conserva sus documentos para el manual.
Las membresías temporales de plataforma se eliminaron. Los resultados son
de esta instalación y de los escenarios ejecutados, no garantía general de
producción ni certificación fiscal, bancaria o de accesibilidad.
