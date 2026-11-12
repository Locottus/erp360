# Adaptación de procesos Odoo a ERP360

Fecha: 11 de noviembre de 2026.

## Alcance y método

Referencia autorizada: `C:\angular\erp360\odoo-20.0.post20261110`.
Contiene fuente Python completa. Siguiendo el flujo acordado, se hizo análisis
directo del código, no decompilación ni ejecución de binarios con REA.
No se ejecutó Odoo ni se realizó una auditoría exhaustiva de sus módulos.
La distribución declara LGPLv3 en su archivo `LICENSE`; no se copiaron
implementaciones, recursos, interfaz ni marcas a ERP360.

Las adaptaciones cubren vigencia/revisión de cotizaciones y visibilidad de
compras pendientes para reposición, además de aprobación independiente
configurable. No significa que todo Odoo se haya portado.

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
