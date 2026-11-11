# ERP360: continuidad del desarrollo

Fecha de corte: 11 de noviembre de 2026. Repositorio de trabajo:
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

Migraciones incrementales hasta `0026_replenishment_proposals.sql`.
Respaldar antes de migrar; no volver a inicializar datos existentes.
El directorio padre contiene Odoo como referencia de lógica, no es la aplicación
que se está ejecutando.

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
protección de duplicados a compras manuales y otras ubicaciones.
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
3. Reposición: destino y fecha comprometidos, plazos y deduplicación frente a
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

Pendiente: vigencia predeterminada configurable por empresa, política de zona
horaria, revisión comercial de precios en una nueva oferta y eventual flujo
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
- La asistencia sigue siendo mock local, sin IA externa.

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
