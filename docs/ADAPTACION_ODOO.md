# Adaptación de procesos Odoo a ERP360

Fecha: 17 de noviembre de 2026.

## Alcance y método

Referencia autorizada: `C:\angular\erp360\odoo-20.0.post20261110`.
Contiene fuente Python completa. Siguiendo el flujo acordado, se hizo análisis
directo del código, no decompilación ni ejecución de binarios con REA.
No se ejecutó Odoo ni se realizó una auditoría exhaustiva de sus módulos.
La distribución declara LGPLv3 en su archivo `LICENSE`; no se copiaron
implementaciones, recursos, interfaz ni marcas a ERP360.

Las adaptaciones cubren vigencia/revisión de cotizaciones y visibilidad de
compras pendientes para reposición, además de aprobación independiente
configurable, planificación opcional de entrega y reprogramación auditada. No significa que todo Odoo
se haya portado.

## Tres bloques: planificación, solicitudes abiertas y CSV

Evidencia estática adicional en el paquete suministrado:

- `odoo/addons/purchase_stock/models/product.py:164`,
  `_get_quantity_in_progress`, agrupa compras por producto, unidad, origen de
  reposición y ubicación prevista. `:190`, `_get_lines_domain`, contempla
  RFQ draft/sent/to approve y filtros de ubicación/almacén.
- `odoo/addons/purchase_stock/models/stock.py:354`,
  `_quantity_in_progress`, relaciona la cantidad en proceso con las reglas.

Se observó la separación entre documentos abiertos, su origen y su destino;
no se copió la implementación ni se ejecutó Odoo. ERP360 conserva una diferencia
deliberada: no incorpora RFQ/solicitudes ni tránsito a la sugerencia de reposición.
No se infiere que el origen sea destino ni se incorporan almacenes, unidades,
previsiones o plazos que el modelo propio no implementa.

Implementación propia:

1. `purchase-planning` reutiliza los CTE de compromisos existentes. Total exacto,
   grupos destino/fecha y documentos en una sola sentencia SQL. Cada orden/producto
   se agrega una vez; anomalías conocidas se excluyen y se explican. Destino/fecha
   nulos permanecen desconocidos. Fecha superada usa hoy UTC inclusivo.
2. Solicitudes draft/submitted sin orden: cantidades agregadas por producto y
   documento, manuales/propuestas de todas las reglas, origen independiente.
   Cantidad no aprobada separada; no se suma a órdenes. Aprobación concurrente
   ve una instantánea anterior o posterior, no ambas representaciones.
3. CSV por producto autenticado, una fila por documento y columnas separadas.
   Consulta nueva; no contiene filas de totales. Reutiliza el escape CSV extraído
   del mecanismo ya existente de SaaS, sin cambiar su resultado. Exportación
   propia de ERP360: no se atribuye a un comportamiento observado en Odoo.

Sin migración o cambio contable. Permisos admin y empresa autenticada en JSON/CSV.
42 e2e/32 Angular, builds y tres flujos reales en base aislada; evidencia
[propia](manual/purchase-planning-evidence.json), captura y manual 3.19.
Las dos respuestas 503 de recuperación fueron sintéticas, no fallos reales de Odoo
ni del backend aislado. No se usaron fuentes de terceros.

## Continuación UX: restauración de Operaciones

Este bloque corrige el ciclo de carga del frontend propio; no añade una
función de Odoo ni deriva requisitos nuevos de su código. La consulta en
`ngOnInit` ocurría antes de recibir la identidad restaurada, por lo que faltaba
una reacción posterior al cambio de sesión.

Se reutilizó el patrón local de `effect`/`untracked` de Catálogos/Workspace,
más generación de lectura e identidad para listas/balance. Referencias
oficiales consultadas: [Angular effect](https://angular.dev/api/core/effect)
y [Angular untracked](https://angular.dev/api/core/untracked).
No se introdujo una biblioteca nueva ni se ejecutó Odoo/REA para este arreglo
de código fuente completo.

Prueba anterior al arreglo: cuatro regresiones fallaban. Validación final:
30 pruebas Angular en tres suites, build y tres flujos de navegador aislado,
incluyendo restauración retenida hasta montar la pantalla, ausencia de
consultas duplicadas, error 503 sintético con reintento real y acceso denegado
a rol no administrador. Manual Word 3.18 y ayuda contextual actualizados.
Ver [evidencia propia](manual/operations-session-evidence.json).

## Reprogramación auditada de compras (0034)

Evidencia estática: en la fuente suministrada,
`odoo/addons/purchase/models/purchase_order.py:1361`
(`_update_date_planned_for_lines`) actualiza fechas por línea y crea/actualiza
una actividad. En `:1377` (`_create_update_date_activity`) conserva una nota
del cambio de fecha. Se observó el concepto, no se ejecutó ni copió el código.

Como contraste oficial público se consultó la
[documentación de Odoo 19.0 sobre solicitudes de cotización](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/rfq.html)
el 17 de noviembre de 2026: distingue llegada prevista, operación de recepción
y comunicaciones/actividades de la compra. Esa página es de **19.0**, no prueba
la procedencia del paquete local ni equivalencia con la versión suministrada.
No se usaron blogs, fuentes de terceros ni recursos gráficos/textos de Odoo.

Implementación propia, más acotada:

- Migración `0034_purchase_delivery_plan_revision.sql`: revisión cero por
  solicitud y orden; independiente de otras revisiones/políticas.
- GET/PATCH `commerce/purchases/requests/:id/delivery-plan` y
  `commerce/purchases/orders/:id/delivery-plan`. Lectura admin/purchases;
  edición solo admin, siempre por empresa autenticada.
- PATCH exige ambos campos del plan explícitos (null permite retirarlos),
  `expectedRevision` y `reason` validado de 10 a 1000 caracteres.
  Reutiliza normalización de 0033 y validadores comunes. Omisiones/invalidación
  son 400; versión obsoleta, sin cambios o estado cerrado son 409.
- Bloquea la misma fila que aprobación, cancelación y recepción. Solo solicitudes
  draft/submitted y órdenes ordered/partially_received. Actualiza plan/revisión
  y registra antes/después, actor y motivo en la misma transacción.
- Aprobar copia el plan vigente y audita la revisión de solicitud usada;
  la orden comienza su propia revisión cero. Editar luego la orden no cambia
  solicitud ni condiciones económicas.
- GET obtiene plan e historial en una instantánea SQL. Devuelve las últimas
  50 reprogramaciones ordenadas por revisión, y `history_has_more` explícito.
  El límite de pantalla no borra el registro completo.
- La auditoría de recepciones nuevas conserva la revisión del plan usada.
  No se cambió su payload idempotente `{orderId,locationCode,lines}` ni los
  lotes/auditorías anteriores. El lugar real sigue siendo decisión física.
- UI y manual 3.17 explican retiro explícito, aprobación separada, historial,
  conflictos y estados de consulta.

No implementa fecha por línea, actividades/correos al proveedor, calendario,
rutas ni reprogramación automática de movimientos de Odoo. No certifica
equivalencia. Builds y pruebas: 34 e2e, 25 Angular y 9 unitarias relevantes;
cuatro flujos de navegador aislado, nueve comprobaciones responsive.
Ver [evidencia propia](manual/purchase-rescheduling-evidence.json).

## Planificación de entrega de compras (0033)

Observación estática de la fuente suministrada:
`odoo/addons/purchase/models/purchase_order.py:136` declara `date_planned`
como llegada esperada y en `:259` deriva la fecha a partir de líneas.
`odoo/addons/purchase_stock/models/purchase_order.py:23` vincula la entrega
con un tipo de operación; en `:355` resuelve la ubicación destino desde esa
operación o la dirección dropship. No se ejecutó Odoo ni se autenticó la
procedencia del paquete local; no se copió su implementación.

ERP360 incorpora un plan más acotado y propio:

- Migración `0033_purchase_delivery_plan.sql` con campos opcionales en la
  cabecera de solicitud y orden, sin modificar históricos.
- `POST /commerce/purchases/requests` y
  `POST /inventory/replenishment/:productId/proposals` aceptan
  `destinationLocationCode` y `expectedReceiptDate`. Omitir o null permite
  plan incompleto. Texto vacío/controles, destino normalizado superior a 32
  caracteres y fecha inválida se rechazan con 400.
- La fecha es DATE ISO, sin hora, referida a UTC para el indicador. Se admiten
  fechas pasadas; no son caducidad ni impiden aprobar o recibir.
- Aprobar copia el plan bajo bloqueo de la solicitud, junto con importes y
  líneas, y registra los valores aprobados. No cambia roles ni segregación.
- Las lecturas de solicitudes y el detalle de recepción exponen
  `destination_location_code` y `expected_receipt_date` como texto/null.
  La lista también distingue `order_destination_location_code` y
  `order_expected_receipt_date` de la solicitud. `is_receipt_overdue` es
  derivado: fecha anterior a hoy UTC y orden ordered/partially_received.
- Compromisos por producto muestran destino, fecha y aviso por orden abierta,
  sin cambiar las cantidades exactas ni los criterios de exclusión históricos.
- La ubicación de la regla sigue siendo origen informativo, no destino.
  Recepciones sugiere el destino declarado, admite otro lugar real con aviso,
  y registra plan/real en la auditoría del lote; la orden no se reescribe.

No hay equivalencia con rutas/almacenes, dropship, plazos del proveedor,
fechas por línea, calendarios ni reprogramación Odoo. No se infiere confirmación
del proveedor. Los códigos de ubicación son lógicos, no un catálogo validado.
No se asignan existencias por escribir un plan ni se descuenta tránsito de
reposición. No se amplía contabilidad.

Verificación focalizada: fechas estrictas/inclusivas, normalización, null,
rechazo sin escrituras, permisos/tenant, copia de propuestas y separación del
origen, auditoría, replay concurrente de lote recibido en destino diferente,
estados parcial/completo/cancelado, conservación histórica y formularios.
Ver [bitácora](BITACORA_CONTINUIDAD.md) y
[evidencia visual](manual/purchase-plan-evidence.json).

## Vigencia predeterminada por empresa (0032)

Observación estática de la fuente suministrada:
`odoo/addons/sale/models/res_company.py:30` impide días negativos y en
`:44` declara `quotation_validity_days`, con 30 por defecto y 0 para
desactivar. `odoo/addons/sale/models/sale_order.py:551` calcula la fecha
contextual actual más esos días si son positivos. No se ejecutó Odoo ni se
verificó criptográficamente la procedencia de esta copia; no se copió código.

Implementación independiente en ERP360:

- Migración aditiva `0032_quotation_default_validity.sql` añade días enteros
  0–3650. Se inicia en **0**, no en 30, para no imponer vigencia a clientes
  existentes. El máximo es un límite propio, no una regla observada en Odoo.
- `GET /companies/current` y la lectura por ID propio exponen
  `quotation_validity_days`. `PATCH /companies/current` permite
  `quotationValidityDays` opcional con los campos y permisos administrativos
  existentes. Omitir conserva; null, texto, fracciones o fuera de rango
  devuelven 400. Mantiene motivo, revisión y auditoría antes/después.
- `POST /commerce/sales/quotations`: omitir `validUntil` aplica hoy **UTC**
  más los días, o null con 0; null explícito siempre deja sin fecha.
  Una fecha explícita conserva validación estricta y prioridad.
  La fecha es inclusiva, como en la adaptación previa.
- Mi empresa configura los días y Operaciones distingue heredar sin fecha,
  fecha específica y casilla **Sin caducidad para esta oferta**.
- La política se lee bajo bloqueo compartido en la transacción creadora.
  Un cambio empresarial concurrente bloqueado se observa al confirmarse;
  no se calcula el valor en el navegador ni mediante un reloj distinto.
- El valor queda guardado en cada cotización y su auditoría. Cambiar la
  política no reescribe ofertas ni precios; revisar una oferta sigue usando
  su endpoint revisionado. Checkout tiene su flujo directo sin esta vigencia.

Comprobaciones focalizadas: entradas inválidas y límites, omisión/null/fecha,
tenant/rol, cambios concurrentes, auditoría, conservación de históricos,
compatibilidad de edición empresarial sin el campo y checkout con 30 días
activados. UI automatizada y navegador real contra copia aislada restaurada.
REA captura solo el login público del ambiente, no el comportamiento de Odoo;
ver [bitácora de este corte](BITACORA_CONTINUIDAD.md).

## Compras: aprobación independiente configurable

Observación estática: `odoo/addons/purchase/models/res_company.py:33` define
aprobación en uno o dos pasos por empresa, inicialmente en un paso.
`odoo/addons/purchase/models/purchase_order.py:1332` determina autorización
mediante esa política, importe y grupo de responsables de compras.
No se ejecutó Odoo ni se copió su implementación.

ERP360 adopta una regla propia, no equivalente al doble nivel de Odoo:
`0027_purchase_approval_policy.sql` añade
`companies.require_independent_purchase_approver`, inicialmente false.
Mi empresa permite cambiarla con motivo y revisión esperada. Con la política
activa, otro administrador de la misma empresa debe aprobar la solicitud:
el creador no tiene excepción por ser admin. También cubre propuestas de
reposición, que conservan `created_by`.

La aprobación toma un bloqueo compartido de empresa antes del bloqueo de
solicitud; editar la política toma bloqueo exclusivo. Una aprobación no puede
evaluar una política antigua mientras un cambio autorizado queda confirmado.
La misma función calcula el motivo de bloqueo para lista, detalle y aprobación.
La auditoría de aprobación guarda creador, actor y política aplicada.

Los documentos históricos sin creador conocido se bloquean con 409 cuando la
política está activa, sin inventar autor. El creador identificado se bloquea
con 403. Rechazar solicitudes sigue permitido; las órdenes aprobadas no cambian.
Omitir la nueva propiedad al editar el perfil conserva la política actual;
desactivarla exige un false explícito y queda auditado.

Antes de activarla, disponer de otra cuenta administradora activa y revisar
solicitudes antiguas. No implementa umbral monetario, delegaciones ni rol
especializado de aprobador. Administradores siguen pudiendo cambiar la política
con auditoría: no equivale a una política inmutable ni a segregación completa
de funciones para producción.

## Compras pendientes y reposición: segunda adaptación

Descripción del corte 0026; 0033 incorpora posteriormente destino/fecha
opcionales, sin cambiar el cálculo empresarial aquí descrito.

Observación estática: `odoo/addons/stock/models/stock_orderpoint.py:409`
calcula cantidad pronosticada con disponibilidad virtual y cantidad en progreso,
con contexto de producto y ubicación; `odoo/addons/purchase_stock/models/purchase_order_line.py:57`
deriva cantidades recibidas de movimientos, con reglas específicas de devolución.
No se ejecutó Odoo ni se afirma equivalencia funcional.

ERP360 muestra informativamente por producto el remanente de órdenes `ordered`
o `partially_received`, calculado con NUMERIC a partir de líneas y recepciones
documentadas. No se asigna a una ubicación: el destino se elige al recibir y no
está en la orden. Tampoco se descuenta automáticamente del objetivo por
ubicación. Órdenes abiertas con recibos históricos sin líneas o sobre-recepción
se señalan y se excluyen del total verificable. Cancelar quita el compromiso;
una devolución a proveedor no reabre la orden bajo las reglas actuales.
No se copió código de Odoo ni se modificaron inventarios/asientos.

En `odoo/addons/purchase/models/purchase_order.py:723` Odoo impide cancelar
órdenes bloqueadas o con facturas activas y conserva el estado cancelado.
ERP360 distingue solicitud previa de orden: permite rechazar una solicitud
abierta con motivo auditado, pero no usa ese rechazo para anular órdenes
aprobadas o recibidas. El rechazo y aprobación compiten por el mismo bloqueo.
El detalle de solicitud en ERP360 permite revisar líneas y totales antes de
decidir; no reserva ni bloquea el documento, y puede quedar desactualizado.
La acción manual de reabastecimiento observada en `stock_orderpoint.py:380`
desencadena aprovisionamiento. ERP360 adopta un paso diferente y explícito:
crea solo un borrador de compra con proveedor/costo elegidos por la persona,
sin impuestos, y requiere aprobación posterior. No es equivalencia con Odoo.

El detalle de compromisos identifica las órdenes abiertas, proveedor y
recepción documentada. Utiliza el mismo cálculo que el resumen, pero es una
consulta independiente: los valores pueden variar si se recibe o cancela
entre consultas. Para una orden excluida el pendiente es desconocido, no cero.

## Evidencia observada

Rutas relativas al directorio de Odoo:

| Fuente | Evidencia |
|---|---|
| `odoo/addons/sale/models/sale_order.py:169` | Fecha opcional de expiración de oferta |
| `odoo/addons/sale/models/sale_order.py:551` | La vigencia puede depender de configuración de empresa |
| `odoo/addons/sale/models/sale_order.py:1110` | El vencimiento se calcula para ofertas aún no confirmadas; la fecha límite es inclusiva |
| `odoo/addons/sale/models/sale_order.py:2397` | La firma del cliente exige oferta vigente |
| `odoo/addons/sale/models/sale_order.py:2420` | El pago del portal depende de vigencia y otras condiciones |
| `odoo/addons/sale/controllers/portal.py:358` | La acción del portal verifica el estado admisible para firma |

La regla observada no prueba que toda confirmación administrativa de Odoo
esté bloqueada por vencimiento. ERP360 adopta intencionalmente un control más
estricto para su endpoint administrativo de confirmación.

## Implementación propia en ERP360

- Migración aditiva `0024_quotation_validity.sql`: `valid_until` opcional y
  `revision`, sin cambiar fechas históricas ni inventar vencimientos.
- `POST /commerce/sales/quotations` acepta `validUntil` opcional.
  Fecha ISO real, hoy o posterior en UTC. Omitirla o enviar null conserva
  comportamiento sin caducidad; una cadena vacía o fecha inexistente se rechaza.
- `GET /commerce/sales/quotations` expone `valid_until`, `revision` e
  `is_expired`. Es un indicador derivado, no un estado que un job deba
  mantener. Una oferta válida hasta hoy sigue siendo confirmable hoy.
- Confirmar una oferta vencida devuelve 409 antes de crear pedido o líneas.
  El bloqueo de la oferta serializa confirmaciones y revisiones.
- `PATCH /commerce/sales/quotations/:id/validity` requiere admin, misma
  empresa, borrador, revisión esperada, nueva fecha o null y motivo.
  Cambios simultáneos producen un éxito y un conflicto; no se pierde evidencia.
- Se guarda antes/después, actor y motivo en auditoría.
- Renovar no cambia precio, impuesto, cantidad ni total. Si las condiciones
  económicas cambian, emitir una nueva oferta y conservar la anterior.
- Operaciones → Ventas permite seleccionar vigencia, consultar vencidas,
  revisar condiciones y renovar o retirar la fecha explícitamente.
- Históricos sin fecha y checkout automático conservan su comportamiento.
  Los pedidos ya aprobados no vuelven a caducar.

## Diferencias deliberadas

ERP360 utiliza UTC, no la zona contextual del usuario de Odoo, porque aún
no hay una política empresarial de zonas horarias. No impone un número de
días predeterminado ni configura una vigencia universal sin decisión comercial.
No implementa firma electrónica, enlace público de aceptación ni cobro
de cotizaciones. El portal actual no obtiene permisos nuevos.

## Verificación y límites

Cinco e2e nuevas: fechas estrictas, compatibilidad sin fecha, límite inclusivo,
rechazo de vencidas sin pedido, revisión concurrente, auditoría, conservación
de importes, retiro explícito, tenant y permisos. Tres pruebas UI nuevas:
confirmación/revisión, conflicto y descarte tras pérdida de identidad.

Builds API/Angular correctos; suite actual 36 unitarias API, 65 e2e y
42 frontend. El capturador `docs/manual/capture_quotation.cjs` utiliza datos
ficticios: simula el paso del día únicamente cambiando la fecha de esa oferta
en la fixture, no el reloj del servidor ni documentos reales. Verifica
creación/renovación/confirmación por UI, rechazo HTTP 409 y cuatro anchos.
La evidencia conserva fecha de ejecución y no contraseñas ni tokens.

## Siguientes procesos a contrastar

No implementados en esta adaptación:

1. Compras: devengo por entregas, cierre de remanentes y retorno histórico.
2. Inventario: valoración/COGS, tras decidir FIFO o promedio y costos históricos.
3. Ventas: créditos y retornos parciales vinculados a líneas/despachos.
4. Bancos: conciliación parcial, diferencias y reversión.
5. SaaS: ciclos no solapados, cancelación contractual y precios efectivos.
   No se presupone que los módulos Enterprise de suscripciones estén incluidos
   o licenciados en esta distribución.

Ver [pendientes priorizados](PENDIENTES_DESARROLLO.md) para dependencias,
condiciones externas y aceptación antes de abordar esas fases.
