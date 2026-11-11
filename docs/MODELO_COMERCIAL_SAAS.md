# Propuesta comercial SaaS para ERP360

## 1. Decisión recomendada y estado

Cobrar **por empresa contratada + módulos habilitados + consumo extraordinario**.
Ofrecer paquetes como simplificación comercial, conservando el detalle por módulo.
La empresa es el tenant operativo y de aislamiento, no un permiso que el usuario
pueda seleccionar libremente.

**Este documento combina el diseño comercial y sus límites de implementación.**
La consola SaaS permite gestionar contratos informativos por módulos, documentos
internos de cobro, ingresos recibidos e historial de seguimiento. No carga tarjetas,
envía correos ni restringe módulos por falta de pago. La factura comercial de un
cliente del ERP no es el documento que el proveedor SaaS emite a esa empresa.
Los importes siguientes son ilustrativos, en USD, antes de impuestos; requieren
aprobación comercial y fiscal. Medición por uso, prorrateo automático, integración
fiscal/pasarela y restricciones de acceso siguen siendo diseño, no capacidades
activas de la consola.

## 2. Qué se vende

| Concepto | Propuesta inicial | Incluye |
|---|---:|---|
| Base por empresa/mes | USD 29 | Identidad, empresa, auditoría operativa, maestros, ayuda mock y exportación básica |
| Ventas | USD 15/mes | Cotizaciones, pedidos, factura comercial, PDF y créditos implementados |
| Compras | USD 15/mes | Solicitudes, órdenes, recepción total y seguimiento de proveedores |
| Inventario | USD 15/mes | Ubicaciones, reservas, despacho, kardex, transferencias y conteos |
| Contabilidad | USD 25/mes | Posteo, cobros, pagos, reembolsos, balance y cierres implementados |
| Tienda online | USD 25/mes | Catálogo, diseñador, carrito, checkout y seguimiento manual |
| Personas | USD 10/mes | Expedientes, asistencia y ausencias; NO nómina legal |
| Usuarios activos | 5 incluidos; USD 4/usuario adicional/mes | Cuentas humanas activas, no tokens/sesiones |
| Operaciones comerciales | 1.000 incluidas/mes; USD 0,02 por excedente | Eventos definidos en la sección 5, sin duplicados |
| Almacenamiento | 5 GB medios incluidos; USD 1/GB excedente/mes | Solo al existir almacenamiento de archivos medido |

No cobrar consultas de pantalla, intentos fallidos, login, cierres de sesión,
conteos, ajustes correctivos, llamadas de ayuda mock ni reintentos técnicos.
No anunciar módulos aún no disponibles, pagos online, IA real, nómina, fiscal
certificado o constructor de sitios equivalente a Wix como parte implementada.

### Paquetes para facilitar la contratación

- **Operación:** base + ventas + compras + inventario: USD 74/mes.
- **Administración:** Operación + contabilidad: USD 99/mes.
- **Comercio:** Administración + tienda: USD 124/mes.
- Personas: complemento independiente de USD 10/mes.

No acumular descuentos automáticos entre paquete, anualidad y promoción:
el contrato debe especificar cuál prevalece. Un descuento nunca modifica el
historial de precios ya aceptados.

## 3. Dependencias y continuidad operativa

La selección comercial no debe romper relaciones entre módulos:

- Tienda exige ventas e inventario; contabilidad es un complemento si se
  contabilizan las operaciones dentro del ERP.
- Compras puede registrar documentos sin inventario; aplicar recepción física
  exige inventario.
- Contabilidad exige la función de origen que se desea contabilizar.
- Deshabilitar un módulo no borra tablas ni deja referencias huérfanas.
- Con reservas, entregas o saldos abiertos, el módulo pasa a **solo cierre**:
  no se crean nuevas operaciones, pero se permite concluir/cancelar documentos,
  liberar reservas, registrar pagos reales, créditos, reembolsos y exportar.
- No confundir bloqueo de nuevas ventas con denegación del acceso a los datos.

Estas reglas se aplicarán en servidor y en UI. Ocultar un menú no impide una
llamada HTTP, RPC o un job. El guard comercial debe cubrir esos canales sin
reemplazar las comprobaciones tenant/RBAC existentes.

## 4. Empresa operativa, cliente pagador y permisos

Separar tres entidades:

1. **Empresa ERP:** datos operativos propios, usuarios y permisos.
2. **Cuenta de facturación:** razón social pagadora, impuestos, contactos y
   método de pago del contrato SaaS. Puede pagar varias empresas autorizadas.
3. **Suscripción:** contrato entre cuenta pagadora y una empresa; versión de
   precios, moneda, módulos, cupos, fechas y estado.

El administrador de empresa puede consultar su contrato y solicitar cambios,
pero NO adjudicarse módulos gratuitos, marcar facturas SaaS como pagadas ni
crear eventos de consumo desde el navegador. La gestión de la plataforma
requiere una identidad de operador separada, mínimo privilegio y auditoría.

Actualmente cada cuenta de usuario pertenece a una empresa y su correo es
globalmente único. Un grupo empresarial con varias empresas requiere diseñar
membresías, selección explícita de contexto y autorización por empresa antes
de ofrecer acceso unificado. Compartir pagador no autoriza compartir documentos.

## 5. Definición verificable del consumo

### Operaciones comerciales

Una unidad cuando ocurre por primera vez uno de estos hechos:

- `sales_order.fulfilled`: salida física completa confirmada de un pedido.
- `purchase_order.stock_received`: recepción física completa aplicada.

El pedido de tienda y su pedido ERP son el mismo origen: **una unidad**, no dos.
La mera reserva, confirmación comercial, factura o posteo no vuelve a contar.
Una cancelación antes de la salida no consume unidad. Devolver mercancía después
de una entrega no borra el hecho de servicio ya consumido; un ajuste comercial
del consumo exige un evento compensatorio autorizado y trazable.

Clave de idempotencia:
`company_id + metric_code + source_type + source_id + event_version`.
Cantidad decimal exacta, fecha de ocurrencia UTC, fecha de recepción, origen y
versión del contrato. No incluir nombre, correo, dirección, tokens ni contenido
de documentos en el evento.

El alta del evento debe persistir en la MISMA transacción que el hecho operativo,
mediante outbox. El publicador puede repetir entregas; la restricción UNIQUE
del ledger evita doble cobro. No prometer "exactly once" del transporte.

### Usuarios y almacenamiento

- Usuarios: promedio diario de cuentas activas, excluyendo cuentas técnicas
  expresamente autorizadas; no contar invitaciones aún no activadas.
- Archivos: promedio de bytes almacenados por día, convertido a GB decimales
  de 1.000.000.000 bytes. No medir varias veces copias internas del mismo recurso.
- La UI muestra unidades, período, incluidos, excedente, fecha de actualización
  y estimación monetaria. Nunca presentar una estimación como factura cerrada.

Las métricas de almacenamiento y usuarios aún NO se recolectan. Solo deben
empezar a cobrarse cuando exista medición reproducible y aceptada por contrato.

## 6. Cálculo y ejemplo

```text
Subtotal del período =
  base por empresa prorrateada
  + suma de módulos prorrateados
  + usuarios adicionales medidos
  + max(0, operaciones medidas - operaciones incluidas) * tarifa
  + almacenamiento extraordinario medido
  - descuentos aprobados

Total a pagar = subtotal + impuestos aplicables del proveedor SaaS
```

Ejemplo sin cambios dentro del mes:

- Comercio: USD 124.
- 7 usuarios activos medios: 2 adicionales x USD 4 = USD 8.
- 1.300 operaciones: 300 extraordinarias x USD 0,02 = USD 6.
- Hasta 5 GB y sin otros extras: USD 0.
- **Subtotal USD 138**, más impuestos aplicables.

Persistir dinero en unidades menores de moneda o NUMERIC exacto. No usar
float binario para cerrar facturas. Redondear según la moneda y reglas fiscales
del emisor, una vez en la etapa contractual definida.

## 7. Ciclo de vida y cambios

Estados: `trialing`, `active`, `past_due`, `grace`, `restricted`, `cancelled`.
Un estado comercial no debe cambiar `companies.is_active` ni bloquear el acceso
a los datos indiscriminadamente.

- Prueba propuesta: 14 días, sin cargo, con límites visibles.
- Renovación mensual por aniversario contractual en UTC, no por 30 días fijos.
- Nueva capacidad: efectiva al aceptar, con prorrateo por segundos del período
  y vista previa antes de confirmar.
- Reducción: siguiente renovación; documentos pendientes siguen en modo cierre.
- Cupos de uso: asignación proporcional al período con una política explícita;
  no reducir retrospectivamente unidades ya consumidas.
- Avisos: 80%, 100% y estimación de sobreconsumo; topes duros solo opt-in.
- No cortar checkout de forma imprevisible: comprobar cupo antes de confirmar;
  si falla, no reservar stock ni crear medio pedido.
- Falta de pago: avisos, gracia propuesta de 7 días y luego restricción de nuevas
  operaciones, manteniendo consulta/exportación/cierre correctivo.
- Baja: fin del período pagado; exportación y retención conforme a contrato y ley.
  La eliminación exige procedimiento separado, respaldo, autorización y plazo.

Definir zona, fecha efectiva, impuestos, reglas de redondeo, devolución y
reintentos en términos del servicio. No inventar reglas legales de un país.

## 8. Modelo de datos objetivo

| Entidad | Responsabilidad e invariantes |
|---|---|
| `billing_accounts` | Pagador y referencias al proveedor; PII protegida, nunca PAN/CVV |
| `billing_company_links` | Relación autorizada pagador/empresa; no concede acceso ERP |
| `billing_price_versions` | Inmutable: moneda, vigencia, tarifa y contrato aceptado |
| `billing_subscriptions` | Una suscripción vigente por empresa, revisión y estado |
| `billing_entitlements` | Módulos/cupos efectivos, vigencia, modo cierre |
| `billing_outbox` | Eventos pendientes escritos junto al hecho ERP |
| `billing_usage_events` | Ledger append-only, UNIQUE de idempotencia y compensaciones |
| `billing_periods` | Intervalos UTC no solapados; abierto, finalizando, cerrado |
| `billing_invoice_lines` | Snapshot de precios, unidades, impuestos y prorrateos |
| `billing_provider_events` | ID de webhook único, firma verificada y estado procesado |
| `billing_adjustments` | Corrección autorizada con motivo; no editar consumo histórico |

Cerrar período mediante lock y reconciliación entre outbox, ledger y agregados.
Esperar una ventana de eventos tardíos documentada; correcciones posteriores
generan ajuste en el período siguiente, no mutación silenciosa de la factura.

La pasarela usa checkout hospedado/tokenización y secretos de servidor.
Verificar firma de webhook sobre el cuerpo crudo, rechazar eventos expirados,
deduplicar ID y validar cuenta, importe, moneda y estado esperado. El regreso
del navegador NO prueba el pago. No implementar cargos reales hasta elegir
proveedor, país del emisor, términos y cuenta habilitada.

## 9. Superficies implementadas y extensiones

Implementadas: `/platform/billing`, con autorización de plataforma separada,
y `/subscription`, consulta de módulos, saldo y usuarios de la empresa autenticada
(no detalle documental). La primera muestra
cartera y antigüedad a fecha de corte, contratos por empresa, facturas internas,
pagos aplicados a una factura, créditos, reversiones y seguimiento. Son registros
de control SaaS; no generan asientos en la empresa operativa del cliente.

Los precios por módulo se aceptan al crear/revisar un contrato; las líneas
emitidas conservan su snapshot. Cada ingreso exige una factura identificada
y no puede exceder su saldo. No hay anticipos sin factura ni asignación
arbitraria de pagos a módulos. El cupo y consumo ilustrativos de este documento
no se facturan hasta implementar su medición verificable.

Extensiones pendientes del diseño original:

- Empresa / Suscripción: añadir consumo medido, límites efectivos y solicitud
  autoservicio de cambios al contrato informativo ya consultable.
- Vista previa de cambio con precio efectivo y consentimiento verificable.
- API tenant-scoped: medición de consumo y checkout de proveedor; la consulta
  del contrato ya existe.
- Catálogo público versionado y política de descuentos por contrato; actualmente
  se aceptan importes explícitos en cada contrato, no se cargan tarifas por uso.
- Endpoint webhook dedicado: autenticación criptográfica, no JWT de usuario.

## 10. Criterios de aceptación antes de cobrar

1. Dos empresas y un mismo pagador mantienen datos aislados.
2. Repetir 100 veces el mismo evento o webhook no cambia el importe.
3. Fallar la transacción ERP tampoco crea consumo facturable.
4. Pedido web y pedido ERP no cuentan dos veces.
5. Se puede reconstruir el total desde ledger + precio versionado.
6. Cambios a mitad de mes, bisiesto y moneda de cero/tres decimales son exactos.
7. Usuario sin permiso no cambia contrato ni consulta otra empresa.
8. Empresa restringida exporta datos, libera reservas y registra correcciones.
9. Pago incorrecto, firma inválida o regreso falso del navegador no activa módulos.
10. Restaurar respaldo y reprocesar outbox no duplica cargos.
11. Retención/borrado y cancelación cumplen términos y jurisdicción elegida.

La entrega actual mantiene el contrato en modo informativo y registra pagos
realizados fuera del sistema. Siguiente paso: medición **shadow** sin cobro por
uso. Comparar dos períodos completos con operaciones reales antes de activar
facturación de consumo y bloqueos.

## 11. Referencias y criterio de cartera SaaS

Se contrastaron fuentes oficiales el 10 de noviembre de 2026:

- [Odoo: seguimiento de facturas](https://www.odoo.com/documentation/19.0/applications/finance/accounting/payments/follow_up.html):
  niveles por días vencidos, responsable, próxima acción e historial.
  Recomienda conciliar antes de reclamar para no contactar a quien ya pagó.
- [Zoho Billing: dunning](https://www.zoho.com/us/billing/help/settings/subscriptions/dunning-management.html):
  separar cobranza automática de manual, avisos y acciones finales.
- [Stripe: entitlements](https://docs.stripe.com/billing/entitlements):
  separar el producto/precio contratado del derecho de acceso a funciones.
- [Stripe: ciclo de suscripciones](https://docs.stripe.com/billing/subscriptions/overview):
  una suscripción activa con facturación a crédito no prueba que la factura
  esté pagada. No derivar la salud de cartera solo del estado de suscripción.
- [Stripe: reintentos](https://docs.stripe.com/billing/revenue-recovery/smart-retries):
  distinguir un fallo recuperable de un rechazo que exige intervención;
  no reintentar indiscriminadamente.

La adaptación propia combina cartera contable, contratos por empresa y tareas
CRM. No copia interfaces ni código propietario. La investigación no equivale
a elegir Stripe como proveedor contratado ni certifica disponibilidad por país.

### Regla de interpretación

- **Al día:** no hay saldo positivo vencido a la fecha de corte. Puede haber
  facturas abiertas aún no vencidas.
- **Sin contrato:** no equivale a cliente que pagó. Mostrarlo aparte.
- **Pago parcial:** no equivale a factura saldada ni a asignación automática de
  módulos individuales.
- **Promesa de pago:** compromiso de seguimiento, no efectivo recibido.
- **Disputa/pausa:** no borra ni reduce deuda; requiere motivo y revisión.
- **Módulo contratado:** línea con precio y vigencia; no significa que cada
  usuario haya comprado un módulo ni que su permiso RBAC deba cambiar.
- **Cliente pagador compartido:** permite agrupar cartera, no acceder a los
  documentos operativos de las empresas relacionadas.

La primera política es cobrar por suscripción de empresa y aplicar cada abono
a una factura identificada. Una cobertura parcial de esa factura no se
distribuye arbitrariamente para apagar módulos. El cobro independiente por
módulo necesitaría contratos o reglas expresamente aceptadas.

### Reportes y seguimiento

La cartera debe mostrar moneda, fecha de corte, saldo abierto, saldo vencido y
antigüedad 1-30, 31-60, 61-90 y más de 90 días. No sumar monedas distintas.
Una factura con vencimiento en la fecha de corte no está vencida hasta el día
siguiente. Los reportes históricos deben excluir ingresos, créditos y
reversiones posteriores a ese corte según las fechas efectivas documentadas.

Cada acción de seguimiento debe tener cliente, tipo, nota, responsable y fecha;
las promesas, fecha prometida. Registrar un contacto de tipo correo no
demuestra que se envió un correo. Debe distinguirse registro manual de entrega
confirmada por un proveedor real.

Las reglas de aviso sugeridas (D-3, D0, D+3 y D+7) son una propuesta comercial
configurable, no una obligación legal. Antes de activar cualquier envío,
comprobar nuevamente saldo, destinatario y pausas, deduplicar la ejecución y
persistir su resultado. Una restricción de servicio necesita política
contractual aprobada y cobertura de todos los canales, no solo ocultar menús.
