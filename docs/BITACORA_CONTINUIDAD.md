# Bitácora de implementación y continuidad de ERP360

Fecha de corte vigente: 2026-11-25 UTC y local UTC-6.
Proyecto: `C:\angular\erp360\erp360-modernizado`.

## Preparación operativa inicial — 25 de noviembre de 2026

- `/health/ready` dejó de devolver éxito incondicional: usa un pool dedicado,
  misma configuración de PostgreSQL, conexión/consulta acotadas y respuesta 503
  redactada. `/health/live` permanece independiente. Ninguno certifica datos.
- Compose prefiere loopback para publicaciones nuevas; no se recreó el
  contenedor existente y su exposición previa debe revisarse por separado.
- `.gitignore` protege archivos de entorno y respaldos futuros. Existe repositorio
  Git anidado con cambios preexistentes y 31038 archivos de dependencias ya
  rastreados; no se cambiaron índices ni se retiraron archivos rastreados.
- En un contenedor efímero distinto se aplicaron 38 migraciones y pasaron 13 e2e
  focalizados de salud/asistente. Una restauración con `pg_dump`/`pg_restore`
  comparó 94 tablas y un registro sintético; no se ejecutaron scripts de
  respaldo/restauración contra datos reales ni se midió RPO/RTO.
- Otras 39 pruebas e2e pasaron en siete suites de contabilidad, recepciones,
  inventario, identidad y seguridad. La primera ejecución mostró que el test
  inventario/facturación preparaba las cuentas después de un despacho que las
  requiere; se corrigió el fixture y se comprobó primero el rechazo por ausencia
  de cuentas. No se modificó la lógica de despacho.
- Pasaron 10 unitarias y build API. La primera ejecución del e2e del asistente
  agotó el timeout por defecto; con 45 segundos se completó correctamente.
  Un primer negativo de salud usó puerto 0, que el cliente puede convertir a
  5432, y pudo intentar autenticación sintética contra la base local; no consultó
  ni escribió datos. Se sustituyó por un servidor TCP aislado y volvió a pasar.
- Manual de usuario regenerado como edición 3.22. No se efectuaron migraciones
  ni escrituras en la base operativa y no se reiniciaron otros servicios.

## Continuación asistente — 25 de noviembre de 2026

Se mantuvieron cuotas en tokens, chat sin persistencia y selección explícita de
diagnósticos. El modelo no obtiene herramientas ni permisos nuevos.

- `purchase-order` agrega diagnóstico solo para administrador: líneas pendientes,
  sobrerrecepción, estado, fecha UTC y existencia de asiento publicado, dentro
  de la empresa autenticada. Si hay una recepción histórica sin líneas, los
  recuentos se presentan como desconocidos. Se accede desde Compras/Recepciones.
- `Comprobar conexión API` consulta liveness desde el navegador con timeout;
  no comprueba base, APIs adicionales ni proveedor IA.
- El adaptador DeepSeek se contrastó con su documentación oficial y se probó
  con respuestas sintéticas; no se enviaron claves ni datos reales a proveedores.
- Builds API/Angular correctos, 9 pruebas unitarias API y 39 Angular focalizadas
  correctas. La prueba e2e no se ejecutó en ese corte porque Docker y PostgreSQL
  no estaban disponibles; pasó posteriormente en la base aislada anterior.
- El typecheck global de pruebas encontró un error anterior en
  `test/core-management.e2e-spec.ts:219`; no se modificó ese archivo.
- No se aplicaron migraciones, cambiaron datos ni reiniciaron servicios.

## Continuación 0037 — cierre de contabilidad, inventario y compras

Trabajo validado sin modificar la base operativa. Se creó/actualizó la migración
`0037_operational_accounting_completion.sql` y se aplicó junto con `0001–0037`
solo a la base PostgreSQL aislada `erp360_validation2` en puerto 55432.

- Contabilidad: importación CSV genérica limitada, saldo inicial + créditos −
  débitos, tamaño/fila/referencias validadas, idempotencia SHA-256 y líneas
  pendientes. Conciliación manual empareja/reconcilia un pago de igual importe
  o conserva diferencia; las decisiones quedan auditadas. No crea pagos ni se
  conecta al banco.
- Ventas: créditos parciales por renglón con límites acumulados por factura,
  prorrateo de impuesto, reembolso separado de crédito y devolución física.
  Los retornos restauran costo de despacho y reversan COGS; historiales sin
  costo/línea trazable no se convierten en costo cero.
- Proveedores: devoluciones consumen una o varias capas que conservan el
  vínculo a recepción tras transferencias; pago y crédito siguen separados.
- Compras: destino/fecha por línea prevalecen sobre plan general, las líneas
  sin override siguen el plan general y el detalle muestra plan efectivo.
  Solicitudes abiertas con el mismo destino/fecha se cuentan como advertencia,
  nunca como bloqueo.
- Angular agrega controles para crédito por línea, bancos/estados operativos y
  planes de compras. Se corrigieron errores de compilación y mocks de pruebas;
  una prueba detectó también que el grupo de planificación no respetaba los
  cambios del plan general en líneas sin override.
- Verificación final completada: build API y Angular, seis suites API focalizadas
  (47 e2e) y batería Angular completa (99 pruebas). Manual fuente/Word 3.21 y
  estado/backlog actualizados; DOCX comprobado en su estructura, tablas y
  secciones de contabilidad, compras y costo.

La migración 0037 NO se ha aplicado al contenedor/base operativa. No se reinició
ni restauró el volumen ERP, no se cambió otra aplicación y no se hizo commit.
El worktree contiene artefactos no versionados: inspeccionar y separar por lote,
no agregarlo completo.

### Pendientes para la siguiente etapa

- Definir alcance contable y autorización antes de aplicar 0037 fuera de la
  base aislada; respaldar, ensayar rollback/restore y conciliar históricos.
- Completar devengo/cierre de remanentes parciales, aperturas oficiales,
  política monetaria transversal, matching automático o integración bancaria
  solo si el negocio lo autoriza. Los estados actuales no están certificados.
- Revisar permisos, accesibilidad y escritura de formularios con operadores;
  siguen fuera de alcance bancos reales, fiscal homologado y conexiones de pago.

## Tres bloques posteriores: planificación de compras y manual 3.19

Implementados el 17 de noviembre de 2026. A petición del usuario, documentación
consolidada al terminar los tres bloques; sin nueva migración.

### 1. Resumen exacto por destino y fecha

Nueva consulta `GET inventory/replenishment/:productId/purchase-planning`.
Reutiliza `purchaseCommitmentCtes` (pedido menos recibos documentados por línea,
excluyendo histórico sin detalle y sobre-recepción). Agrega cada orden/producto
una sola vez, muestra total empresarial y grupos por destino/fecha, incluyendo
planes desconocidos y contadores de exclusión. Órdenes agotadas/cerradas no cuentan.
Fecha superada usa comparación estricta con hoy UTC. No asigna destinos por regla
ni descuenta tránsito de la sugerencia.

Total, grupos y documentos se materializan en una sentencia SQL; la tabla de
reglas es otra lectura y puede ser anterior. Actualizar planificación relee el
detalle. API de compromisos anterior conservada sin cambiar su contrato.

### 2. Solicitudes abiertas visibles antes de volver a comprar

El mismo snapshot incluye draft/submitted sin orden, con cantidad exacta del
producto y origen manual/reposición. Se consultan todas las reglas, no solo
la ubicación seleccionada. Origen y destino son datos independientes.
No se mezclan cantidades no aprobadas y pendientes de órdenes.
Prueba concurrente de aprobación acepta solo snapshot anterior o posterior;
al aprobar desaparece solicitud y aparece orden, sin doble conteo.
Rechazar retira la solicitud. No es deduplicación automática ni bloqueo de necesidad.

### 3. CSV de planificación

GET con sufijo `.csv`, admin/empresa, no-store. Consulta nueva, no necesariamente
idéntica a la pantalla previa. Una fila por orden o solicitud del producto,
columnas separadas, anomalía con pendiente vacío y banderas. Solo encabezados
si no hay documentos, sin filas de totales. UTF-8 BOM, CSV con comillas/CRLF,
escape de fórmulas y normalización de saltos/tabuladores.
Extraído `common/csv.ts` del escape ya usado por SaaS; regresión SaaS incluida.
UI informa errores, conserva separación de cantidades y descarta exportaciones
tardías tras cambio de sesión. No es auditoría integral de todas las escrituras.

### Verificación y límites

- Builds API y Angular correctos.
- **42 e2e en tres suites**: partial-receipts, purchase-request-decision y SaaS.
  Dos pruebas nuevas de integración cubren agregaciones, parcial, desconocidos,
  exclusión, reprogramación, cancelación admisible, manuales/propuestas,
  aprobación concurrente, rechazo, precisión, CSV, permisos y aislamiento.
- **32 Angular en tres suites**: Operaciones, Reposición y Recepciones.
  Vista de grupos/solicitudes, CSV, error explícito y no descargar tras logout.
- El primer ensayo intentó cancelar una orden parcial y devolvió 400 según
  la regla vigente; se corrigió el fixture a una orden aún no recibida.
  No se cambió la política comercial para hacer pasar la prueba.
- Navegador real: **tres flujos, tres anchos 375/768/1280**, cero errores y
  overflow global. Cantidades 5.0001 pendientes/3.0002 solicitadas; aprobar
  manual cambia a 7.0002/1.0001. Descarga real con cinco documentos y columnas
  distintas. Usuario purchases real rechazado con 403.
- Dos 503 **sintéticos** (planificación y CSV) probaron mensajes/reintento.
  Se usó API real aislada en el resto. Evidencia
  `manual/purchase-planning-evidence.json`, captura 42 nueva visualmente revisada.
- No se ejecutó toda la batería histórica ni se certificó paginación completa
  del Word en el procesador instalado.

Fuente oficial local analizada: purchase_stock/models/product.py:164/190 y
stock.py:354. Concepto de documentos en proceso y ubicación; implementación
propia y más limitada. No se ejecutó Odoo/REA ni se copiaron recursos.

### Persistencia y documentación

Respaldo actual restaurado en `erp360_validation_planning_71fe43ec`. Pruebas y
fixtures exclusivamente allí; navegador `/api` redirigido a 3011, no proxy
operativo end-to-end. API temporal, base y dump temporal de contenedor retirados;
respaldo privado de sesión retenido. Se reinició solo API ERP en 3001, handle
`erp360-api-planning`; Angular conserva 4201. Health/proxy 200, bootstrap 403,
rutas nuevas sin sesión 401; no se reiniciaron otros proyectos.

Comparadas huellas exactas antes/después de seis conjuntos: solicitudes264,
órdenes241, recepciones210, movimientos1169, saldos320 y asientos893, sin cambios.
Manual **3.19**, 12.2–12.4, ayuda, README, estado, despliegue, adaptación y
pendientes actualizados al final. Próximos pendientes: política de deduplicación
transversal, almacenes autorizados y fechas por línea; no inferir devengos,
cierre de remanentes parciales o política monetaria sin responsable contable.

## Continuación UX: carga de Operaciones y manual de usuario 3.18

Implementación del 17 de noviembre de 2026, posterior al bloque 0034.
No ocupa el número de una migración: no cambia API ni esquema.

### Causa y corrección

`SessionService` restaura `/auth/me` asíncronamente desde sessionStorage.
Operaciones antes solo cargaba listados en `ngOnInit` si ya había admin;
su efecto de sesión limpiaba algunos campos pero no consultaba al restaurar.
Por eso el usuario debía pulsar Actualizar después de una recarga directa.

- Sustituida la carga puntual por el patrón `effect`/`untracked` ya usado en
  Catálogos/Workspace. Reacciona a la identidad, sin una segunda carga inicial.
- Conserva la pestaña de query params. Solo consulta listados con rol admin;
  no amplía permisos ni cambia el servicio/interceptor de autenticación.
- Limpia datos leídos, detalle, balance, token de portal mostrado y mensajes
  al cambiar la sesión. No implementa persistencia de borradores.
- La carga captura identidad y generación; descarta resultados/errores
  obsoletos y evita que su finally desactive el indicador de la nueva carga.
  También protege la consulta de balance porque comparte ese indicador.
- Aviso accesible Cargando datos de Operaciones; error explícito y reintento
  manual conservado. No hay polling ni reintentos ilimitados.
- No cambia reglas comerciales, acciones de escritura o duración de sesión;
  no es una revisión integral de todas las transacciones/interceptores.

### Verificación

Cuatro regresiones se ejecutaron contra el código previo y fallaron como se
esperaba: restauración tras inicializar, transición con carga pendiente,
retorno al mismo objeto de usuario y error/recuperación. Se añadió además
la carrera de balance pendiente frente a la carga de una identidad nueva.
Se usa `fakeAsync`/`flushMicrotasks` para vaciar determinísticamente la cadena
de promesas; un primer ensayo con `whenStable` no drenaba toda esa cadena.

Resultado final: **30 pruebas Angular en tres suites** (Operaciones,
Reposición y Recepciones), **build Angular correcto**. No se reejecutaron
API/e2e backend porque no hubo modificaciones allí.

Chrome real con frontend 4201 y `/api` redirigido a API/base aisladas:

1. `/auth/me` real retenido hasta montar Operaciones sin usuario; cero
   consultas privilegiadas antes de restaurar, y luego una por cada endpoint.
   Recargas directas de Compras, Ventas y Catálogos sin pulsar Actualizar.
2. Un GET de producto interceptado devuelve **503 sintético**; se ve el
   error y no se presenta como carga vacía exitosa. Actualizar recupera
   listados reales del backend aislado.
3. Login/restauración de usuario purchases sin controles administrativos
   ni consultas de listados de Operaciones.

**Tres flujos, nueve combinaciones de ruta/ancho (375/768/1280), cero errores
de página y cero overflow global**. Evidencia con contadores por endpoint:
`manual/operations-session-evidence.json`; captura nueva
`manual/images/41-operations-session.png`, solo datos ficticios.

La copia se restauró desde un dump actual en
`erp360_validation_session_71fe43ec`, sin aplicar SQL a la base operativa.
API temporal 3011, copia, dump de contenedor y runner se retiraron al cerrar.
No se reiniciaron API operativa, Angular ni contenedores de otros proyectos.
Se conservaron 264 solicitudes, 241 órdenes y 210 recepciones operativas.
Health/proxy 200; bootstrap sigue deshabilitado.

### Documentación de usuario y continuidad

Ayuda de Operaciones actualizada: carga automática, indicador, significado
del error y uso de Actualizar para reintentar o consultar cambios posteriores.
Word regenerado como **edición 3.18**, sección 4.1, nueva figura de
demostración y evidencia de este bloque separada de las históricas.
Salida: 26 capítulos principales, 55 figuras, 68 tablas y 161 endpoints.
Se valida estructura DOCX, imágenes, encabezado, instrucciones, conservación
de compras y ausencia de tokens reales; Pylance sin errores sintácticos.
No se afirma revisión visual completa de la paginación final en Word.

Referencias oficiales Angular: [effect](https://angular.dev/api/core/effect)
y [untracked](https://angular.dev/api/core/untracked). No se atribuye este
arreglo a Odoo ni al REA de login anterior.

**Siguiente bloque sugerido:** desglose informativo de compras pendientes por
destino/fecha, sin doble conteo ni descuento automático de tránsito; mantener
el total empresarial y actualizar el manual al cerrar ese bloque.

## Continuación 0034: reprogramación auditada y manual de usuario 3.17

Implementación del 17 de noviembre de 2026, posterior al corte 0033.

### Funcionalidad y límites

- Migración `0034_purchase_delivery_plan_revision.sql`: revisión del plan
  independiente en solicitudes y órdenes, cero por defecto y no negativa.
- GET/PATCH del plan en `commerce/purchases/requests/:id/delivery-plan`
  y `commerce/purchases/orders/:id/delivery-plan`. Lectura admin/purchases,
  edición admin; ambos limitados a la empresa autenticada.
- Reprogramación explícita: destino y fecha presentes (null los retira),
  `expectedRevision`, motivo 10–1000. Reutiliza normalizador de 0033 y
  validadores de revisión/motivo. Datos inválidos/omitidos: 400; sin cambio,
  revisión obsoleta o documento cerrado: 409.
- Bloqueo de fila coordina aprobación, recepción y cancelación. Solo
  solicitudes draft/submitted u órdenes ordered/partially_received.
  No cambia cantidades, costos, estado ni política de aprobación.
- Auditoría transaccional antes/después con actor, motivo y revisión.
  Plan e historial se leen en una consulta coherente; UI muestra las últimas
  50 reprogramaciones y avisa si hay anteriores, sin eliminarlas.
- Aprobar audita la revisión del plan copiada; la orden inicia su revisión
  independiente en cero. Solicitud y orden no se sincronizan retroactivamente.
- Recepciones nuevas auditan revisión y plan vigentes. El payload de replay
  no cambia: un lote idéntico sigue reproduciéndose después de reprogramar.
  No se reescriben lotes, auditorías de recepción, movimientos ni importes.
- UI exige motivo y confirmación del efecto de los campos vacíos; ante 409
  conserva formulario sin afirmar éxito y ofrece recarga explícita.
  Documentos cerrados conservan historial sin edición; cambio de sesión
  limpia el formulario y descarta respuestas tardías.

Fuentes: análisis directo de la fuente suministrada, método
`_update_date_planned_for_lines` de Odoo en `purchase_order.py:1361`, más
documentación oficial pública 19.0 como contraste conceptual. No se ejecutó
Odoo ni se atribuye al runtime REA de login evidencia de esta funcionalidad.
Ver [adaptación y diferencias](ADAPTACION_ODOO.md#reprogramación-auditada-de-compras-0034).

### Validación y despliegue

- Respaldo custom privado `erp360-before-0034.dump`, restaurado con
  `pg_restore --exit-on-error` en `erp360_validation_0034_71fe43ec`.
  Solo se aplicó allí la migración nueva; fixtures y UI no tocaron la base real.
- Builds API y Angular correctos. Cuatro suites e2e, **34 pruebas**;
  Angular Operations/Reposición/Recepciones, **25 pruebas**; cuatro suites
  unitarias relevantes de API, **9 pruebas**. Incluyen carreras entre
  revisiones, aprobación/edición, recepción final/edición, aislamiento,
  permisos, retiradas null, límite exacto de historial y replay sin doble stock.
- Navegador Chrome real: **4 flujos y 9 combinaciones de estado/ruta/ancho**
  375/768/1280 sin errores ni desbordamiento global. Solicitud y reprogramación
  desde formularios, aprobación, plan independiente de orden, recepción parcial
  real en otro sitio, retiro de plan e historial, conflicto obsoleto y consulta
  cerrada. La modificación concurrente y última entrega se hicieron por API
  de prueba, no se presentan como clics de usuario.
- Evidencia: `manual/purchase-rescheduling-evidence.json` y capturas 39/40,
  datos ficticios. El primer ensayo no terminó por selector exacto del texto
  de una celda; se corrigió el selector y la ejecución completa posterior pasó.
- Aplicada 0034 a la base operativa y reiniciada solo API ERP. Antes/después:
  mismas huellas de solicitudes, órdenes, recepciones, movimientos, saldos y
  asientos, excluyendo únicamente la nueva columna de revisión.
  Conservados **264 solicitudes, 241 órdenes, 210 recepciones, 1169 movimientos,
  320 saldos y 893 asientos**. Todas las revisiones de históricos inician cero.
- API 3001, Angular 4201 en loopback; health/live, health/ready y proxy 200;
  bootstrap público 403; nueva ruta GET del plan sin token 401.
  Otros contenedores Docker no se reiniciaron.
- API temporal 3011 detenida y base de validación retirada; respaldo privado
  retenido. No se crearon documentos de prueba en la base operativa.

### Documentación de usuario al cerrar el bloque

Actualizados generador y **manual Word edición 3.17**, incluyendo también
las brechas pendientes de Word para 0032/0033: vigencia empresarial, herencia
frente a fecha/null, plan opcional, propuesta con origen distinto del destino,
recepción física, reprogramación, conflictos, retiro e historial.
Dos capturas nuevas; 26 capítulos principales, 53 figuras, 68 tablas y
catálogo generado de 161 endpoints. Se verificaron ZIP/DOCX, imágenes,
encabezado/edición, texto vigente y las cuatro rutas nuevas con sus roles.
Pylance no encontró errores sintácticos. La paginación final depende de Word;
no se afirma revisión visual de todas las páginas impresas.

Ayuda contextual actualizada en Mi empresa, Compras, Inventario y Recepciones.
Para generar Word faltaba Pillow en Python; se instaló desde PyPI oficial
en venv de sesión con reutilización de python-docx existente, sin instalación
global. La validación por stdin en Windows requiere UTF-8 explícito para
no convertir los acentos a interrogaciones.

**Siguiente bloque:** carga inicial de Operaciones tras restauración de sesión,
con pruebas y documentación de usuario actualizada al completarlo. Después,
visibilidad por destino/fecha sin alterar el total empresarial. No ampliar
devengo parcial, COGS o políticas monetarias sin decisiones funcionales.

## Continuación 0033: destino previsto y fecha comprometida de compras

Implementación del 17 de noviembre de 2026, posterior al corte 0032.

### Alcance implementado

- Migración aditiva `0033_purchase_delivery_plan.sql`: columnas nullable
  `destination_location_code` y `expected_receipt_date` en solicitudes y
  órdenes. No hay relleno histórico ni cambio de importes o existencias.
- Creación manual y propuestas admiten `destinationLocationCode` y
  `expectedReceiptDate` opcionales. Omisión/null significan desconocido.
  Destino: texto no vacío, sin controles, normalizado a mayúsculas y máximo
  32 caracteres. Fecha: ISO real YYYY-MM-DD. Una fecha pasada se admite como
  compromiso declarado; no se interpreta como caducidad comercial.
- Aprobación copia ambos campos bajo el bloqueo existente de solicitud y
  registra el plan en auditoría. No cambia la política independiente de 0027.
- Lista/detalle de Compras, compromisos por producto y detalle de Recepciones
  muestran el plan. El aviso de fecha superada usa UTC y solo órdenes
  abiertas; hoy no se considera superado. Recibir completo o cancelar quita
  el aviso, sin borrar la fecha declarada.
- Recepciones propone el destino al seleccionar la compra. Si se registra
  otra ubicación, la UI avisa y el lote ingresa allí realmente; auditoría
  guarda plan y ubicación real. Recargar el detalle no pisa la elección.
  El flujo histórico de recepción mantiene sus reglas.
- La regla de reposición conserva su ubicación origen por separado. No se
  deduce destino de ella, ni se resta compra pendiente de la sugerencia,
  ni se filtra el total empresarial por destino/fecha.

Referencia estática suministrada: Odoo
`odoo/addons/purchase/models/purchase_order.py:136` (llegada esperada) y
`odoo/addons/purchase_stock/models/purchase_order.py:23,355` (operación de
entrada y resolución de destino). Implementación propia, sin copiar código ni
ejecutar Odoo/instalador. No se consultaron fuentes no oficiales externas.
Esta fase usa fuente completa, no decompilación REA. El bundle REA del corte
0032 solo demuestra aquel login y no se presenta como prueba de esta función.
Ver [diferencias](ADAPTACION_ODOO.md#planificación-de-entrega-de-compras-0033).

### Evidencia y despliegue

- Builds API y Angular correctos, sin instalar dependencias.
- 8 unitarias API (3 suites); 28 e2e (partial-receipts,
  purchase-request-decision, catalogs-commerce y quotation-validity), con
  `--runInBand --testTimeout=30000`. No se ejecutó la suite global.
- 22 pruebas Angular: Operations, Replenishment y PurchaseReceiving.
- Navegador real: solicitud/aprobación con plan, recepción parcial en otra
  ubicación y propuesta con destino diferente de su regla. Nueve medidas de
  ruta/ancho en 375/768/1280, sin overflow ni errores de página.
  [Resultado generado](manual/purchase-plan-evidence.json).
  Frontend 4201 con `/api` redirigido por el runner a API temporal 3011
  y copia restaurada; no confundirlo con prueba del proxy operativo.
- Respaldo previo:
  `C:\Users\herli\.copilot\session-state\71fe43ec-33c4-4a8f-a720-56015a9752c7\files\erp360-before-0033.dump`.
  Restauración completa y migración sin errores en
  `erp360_validation_0033_71fe43ec`. Pruebas exclusivamente allí.
  Al terminar se retiraron base/API temporales y dump del contenedor;
  se conserva el respaldo privado fuera del repositorio.
- Después se aplicó 0033 a ERP y se reinició solo su API en loopback 3001.
  Angular continúa en 4201. Readiness, frontend y proxy: HTTP 200.
  Bootstrap sin autenticación: HTTP 403. Otros contenedores intactos.
- Conteos operativos antes/después: 264 solicitudes, 241 órdenes,
  210 recepciones. Todos sus destinos/fechas nuevos siguen null.
  No se insertaron fixtures ni se modificaron históricos en esa base.

### Límites y continuación

La planificación es informativa e inmutable desde la aplicación en este corte:
no confirma que un proveedor haya aceptado el compromiso, no valida un almacén
contra un catálogo y no obliga el destino físico. No hay reprogramación,
fecha por línea/entrega, calendario laboral, penalización, provisión automática
ni devengo parcial. La auditoría ampliada cubre los nuevos lotes, no inventa
planes para recepciones históricas. El manual Word conserva su edición previa.

Siguiente bloque sugerido: reprogramación con revisión, motivo e historial sin
reescribir lotes. Sigue pendiente corregir la carga de Operaciones tras
restaurar sesión (puede requerir Actualizar), además de las políticas contables,
monetarias y fiscales y demás pendientes de producción.

## Continuación del 17 de noviembre: ambiente recuperado y migración 0032

Las secciones siguientes conservan registros históricos y sus métricas.
Para el estado actual prevalece esta entrada y
[el documento de pendientes](PENDIENTES_DESARROLLO.md).

### Entorno y preservación

- Docker ya había iniciado `erp360-db`; solo se iniciaron API y Angular ERP,
  en `127.0.0.1:3001` y `127.0.0.1:4201`, respectivamente, en segundo plano.
  API readiness, frontend y proxy `/api/health/live`: HTTP 200.
- Se conserva `.env`, `BOOTSTRAP_ENABLED=false`, volumen y otros proyectos
  Docker. No se crearon cuentas ni documentos de prueba en la base operativa.
- Respaldo custom privado previo a 0032:
  `C:\Users\herli\.copilot\session-state\71fe43ec-33c4-4a8f-a720-56015a9752c7\files\erp360-before-0032.dump`.
  Catálogo legible (582 líneas) y restauración completa sin errores en
  `erp360_validation_71fe43ec`. Pruebas y fixtures exclusivamente en esa copia.
  No es una política de retención/cifrado ni un ensayo productivo RPO/RTO.
- Migración aplicada primero en la copia y después en ERP. Al aplicarla,
  permanecieron 557 empresas y 402 cotizaciones; todas las empresas quedaron
  con 0 días. No se modificaron fechas ni importes históricos.

### Funcionalidad propia contrastada con fuente Odoo

Mi empresa configura vigencia predeterminada de 0 a 3650 días enteros. Cambios
con revisión esperada, bloqueo empresarial y auditoría antes/después/motivo.
Crear una cotización sin fecha hereda hoy UTC más esos días; null explícito
evita caducidad y una fecha explícita prevalece. La creación bloquea en modo
compartido la política para esperar cambios concurrentes confirmados.
Operaciones ofrece las tres opciones. No afecta ofertas previas, sus precios,
pedidos confirmados ni cotizaciones automáticas de checkout.

Referencia estática única: fuente local suministrada de Odoo,
`sale/models/res_company.py:30,44` y `sale/models/sale_order.py:551`
(bajo `odoo/addons`). No se ejecutó el instalador ni Odoo, ni se consultaron
fuentes de terceros. No se copió implementación. Cero inicial, máximo 3650,
UTC y semántica omitido/null son decisiones propias documentadas en
[adaptación](ADAPTACION_ODOO.md#vigencia-predeterminada-por-empresa-0032).
La procedencia del paquete local no fue autenticada criptográficamente.

### Verificación de este corte

- Builds API y Angular correctos, sin instalar dependencias nuevas.
- Unitarias API focalizadas: 7 pruebas, 3 suites.
- E2e focalizadas: 20 pruebas en 6 suites: quotation-validity,
  purchase-request-decision, ecommerce, store-controls, catalogs-commerce e
  inventory-billing. Base restaurada aislada; `--runInBand --testTimeout=30000`.
  El primer intento con timeout por defecto falló en un hook de 5 segundos;
  la repetición conjunta pasó. No se ejecutó la suite global.
- Angular ChromeHeadless: 15 pruebas de Company y Operations.
- Playwright Core ya disponible con REA: formularios reales de empresa y
  ventas (heredar, fecha y null), 6 combinaciones de ruta/ancho
  375/768/1280, sin overflow ni errores de página. Frontend real 4201,
  peticiones `/api` redirigidas por el runner a API temporal 3011 con copia de
  datos; no se presenta como una prueba end-to-end del proxy operativo.
  [Resultado generado](manual/quotation-default-evidence.json).
- REA abrió el login real 4201 y capturó DOM/accesibilidad:
  `ev_f6e89c2f38894a0f3e789292886eb0594dad65ea24433d9978d37ff7079df52e`.
  [Bundle persistente](rea-runtime-20261117-evidence.json).
  Solo demuestra ese recorrido público, no autenticación ni paridad Odoo.
  El navegador propiedad de REA se cerró correctamente.

Los proveedores IA, tipos de cambio, cuentas bancarias, reportes iniciales y
pagos multimoneda ya existían hasta 0031, aunque las notas antiguas no los
integraban. No se verificó su corrección financiera completa. Hay dos
migraciones con prefijo 0029; no renumerarlas después de aplicadas.

Próximo bloque propuesto: destino/fecha comprometida de compras. Luego,
definir políticas contables/monetarias antes de devengo parcial, COGS y crédito
parcial. Siguen pendientes ledger de migraciones, restauración productiva,
permisos finos, fiscal real y demás brechas del backlog. El manual Word
conserva su edición anterior; estas notas y la UI describen 0032.

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
| Identidad | Invitación/activación, recuperación administrativa, edición revisionada/auditada, bajas, revocación HTTP/RPC, último admin protegido | Sin MFA, email automático ni membresías multiempresa |
| Empresa | Perfil propio con revisión, motivo y auditoría; código/tenant inmutables | No modifica país, moneda, actividad o contrato ni valida identidad fiscal |
| Maestros | Altas normalizadas, edición, desactivación, exportación JSON e importación atómica de 1–200 altas | No CSV, upsert masivo, deduplicación ni historial visual de cambios |
| Inventario | Transferencias/conteos, disponible protegido, recepciones parciales y sugerencia exacta de reposición por ubicación | Sin COGS, valoración, series ni compra automática; sugerencia no descuenta tránsito |
| Tesorería | Saldos/pagos proveedores, recuperación de crédito con historial, cobros/reembolsos acotados, asientos por origen | Registra dinero ya movido; no conecta bancos ni compensa entre compras |
| Comercial | Cancelación antes de factura/despacho/recepción; liberación de reservas; folio opcional automático; moneda explícita nueva | No anulación fiscal ni numeración legal autorizada |
| Documentos | PDF real, snapshot de descripciones/cliente/empresa de facturas nuevas | PDF histórico sin snapshot usa descripciones actuales y lo advierte |
| Créditos | Un crédito TOTAL por factura, retorno inmediato o total posterior idempotente, reversión y saldo a reembolsar | Sin crédito ni retorno parcial de venta; ningún reembolso automático |
| Compras por lotes documentales | Recibido/pendiente por línea, snapshot costo, referencias repetibles y devolución proveedor con crédito proporcional | Devengo solo al completar; no devolución de históricos ni cierre de remanente |
| Contabilidad | Posteo/cierre protegidos, reapertura auditada y libro mayor con apertura/acumulado exactos antes de paginar | No suite financiera, conciliación bancaria ni protección contra cambios SQL de un DBA |
| Tienda | Checkout serializado/repetible, precio/publicación revalidados, stock MAIN coherente, cliente invitado separado | Sin pasarela, pago, cuenta autenticada de cliente ni multicurrency |
| Entregas | Recogida/envío solicitado, dirección/teléfono, preparación, guía y entrega manual | No cotiza flete, contrata transportista ni envía avisos |
| Suscriptores | Consentimiento explícito y baja pública por clave privada hash | No double opt-in ni plataforma de campañas |
| Personas | Edición/baja, jornadas únicas, correcciones y cancelación de ausencias con revisión/auditoría, solapamientos protegidos | No nómina, reglas laborales locales ni zona laboral configurable |
| Asistencia | Respuesta mock local identificada, sin petición externa ni escritura | No es un modelo de IA ni conoce documentos del usuario |
| SaaS | Consola de cartera, contratos por módulos, ingresos recibidos e historial de seguimiento | Contratos informativos; sin pasarela, envíos ni restricciones automáticas |

Actualización 2026-11-11: Operaciones consulta las jornadas abiertas con
`GET /hr/attendance?status=open`, sin el límite de 500 del historial y con
aislamiento por empresa. Ambas consultas requieren paginación para grandes
volúmenes; no se modificaron reglas laborales ni datos existentes.

Actualización 2026-11-11: las lecturas privadas de empleados, asistencias y
ausencias requieren administrador tanto en HTTP como en el RPC de empleados.
La corrección de jornadas en Personas conserva segundos y milisegundos en UTC;
las respuestas de edición de otra sesión se descartan. No existe aún el vínculo
usuario-empleado ni autoservicio de datos propios.

Actualización 2026-11-11: el portal persiste el estado vencido cuando rechaza
un token expirado y bloquea la fila durante la consulta para ordenar lecturas y
revocaciones. La expiración está cubierta por integración; queda pendiente una
prueba específica de concurrencia entre consulta y revocación.

Actualización 2026-11-11: las lecturas de clientes y ventas, PDF comercial,
pedidos de surtido y RPC de ventas requieren admin o sales; proveedores y
solicitudes de compra requieren admin o purchases. Balance y documentos
fiscales requieren admin. No hay filtro por vendedor ni roles contables o de
inventario independientes. El balance por fechas conserva cuentas sin
movimientos y valida el rango; no calcula saldos de apertura. El kardex vuelve
a la primera página al aplicar filtros. Sin cambios en saldos ni migraciones.

Actualización 2026-11-11: los cobros de facturas validan hasta cuatro decimales
y calculan saldo, sobrecobro y liquidación con NUMERIC en PostgreSQL bajo el
bloqueo de factura. Un saldo de 0,0001 no se marca pagado. No se modificaron
facturas históricas: revisar los registros anteriores que figuren pagados con
saldo positivo. No equivale a una política monetaria por divisa.

REA examinó estáticamente el instalador PE32 sin ejecutarlo; el inventario solo
cubre el archivo raíz y las importaciones PE. El análisis profundo no estuvo
disponible por falta de Ghidra configurado; recursos PE fallaron al interpretar
un grupo de iconos. No se comprobó equivalencia entre instalador y fuente. La
[evidencia REA](rea-odoo-installer-evidence.json) conserva las observaciones.

## 3. Cambios funcionales y procedimientos

### Actualización 0026: propuestas de reposición en borrador

Cada regla de producto activo permite preparar solicitud de compra con
proveedor, cantidad, costo y motivo explícitos. El importe se calcula con
NUMERIC y sin impuesto; no se crean órdenes, movimientos ni asientos al
proponer. Se guarda regla/revisión, ubicación de origen y auditoría.
Una sola propuesta abierta por regla; bloqueo transaccional serializa
creaciones simultáneas y rechaza revisión de regla obsoleta. La ubicación
no es destino. La decisión de aprobación o rechazo se realiza en Compras.
Al cerrar la solicitud se libera la regla: compras manuales, otras ubicaciones
y órdenes abiertas requieren revisión humana, no se deduplican globalmente.
No se garantiza que el saldo o compromiso no cambie tras su consulta.
Migración aditiva aplicada tras respaldo de PostgreSQL, sin alterar históricos.
Verificado: builds, 36 pruebas unitarias API, 78 e2e y 61 frontend; seis
flujos de navegador y 24 combinaciones ruta/ancho sin errores. Manual 3.12.

### Actualización 2026-11-11: revisión de solicitudes de compra

Seguimiento de compras permite consultar líneas, cantidades, costos y totales
de una solicitud antes de decidir. La API permite lectura a admin/purchases
de la empresa autenticada; Operaciones está limitada a admin. Una consulta no
bloquea la solicitud: debe actualizarse al decidir. No genera propuestas ni
crea órdenes y no requiere migración. La creación/aprobación segregada y
propuestas vinculadas a reposición siguen pendientes.
Builds correctos; 36 unitarias y 77 e2e API, 59 frontend, cinco flujos de
navegador y 20 combinaciones ruta/ancho sin errores. Manual 3.11.

### Actualización 2026-11-11: rechazo de solicitud de compra

Las solicitudes abiertas permiten rechazo administrativo con motivo de 10 a
1000 caracteres y auditoría transaccional. En la lista aparece el motivo; no
se habilita aprobación de solicitudes rechazadas. La decisión bloquea la misma
fila que la aprobación: si ambas compiten solo una gana y no se genera una
orden para una solicitud rechazada. Protegido por empresa y rol. Para una
orden ya aprobada se mantiene su propio proceso de cancelación/devolución.
Sin migración; no implementa propuesta automática ni separación de funciones.
La referencia estática a Odoo figura en [adaptación](ADAPTACION_ODOO.md).
Verificado: builds, 36 unitarias y 77 e2e API, 57 frontend; cinco flujos en
navegador y 20 combinaciones ruta/ancho sin errores. Manual 3.10; API
reiniciada con bootstrap deshabilitado y clave efímera, iniciar sesión de nuevo.

### Actualización 2026-11-11: desglose de compras pendientes

Reposición incorpora consulta por producto de órdenes abiertas con proveedor,
estado, cantidades ordenadas y recepciones documentadas. La misma definición
SQL alimenta resumen y detalle. Las órdenes con recibos legados o sobre-recepción
se identifican por motivo y muestran pendiente desconocido, no cero. Ambas
lecturas son independientes: pueden variar con operaciones concurrentes;
actualizar y volver a consultar antes de tomar decisiones. Es solo lectura,
para administradores de la empresa autenticada, sin migración ni propuestas.
No se ejecutó Odoo; contraste estático y diferencias en [adaptación](ADAPTACION_ODOO.md).

Verificación de esta actualización: builds API y frontend, 36 unitarias y
75 e2e API, 55 pruebas frontend, cuatro flujos reales y 16 rutas/anchos sin
errores. La captura verifica orden, proveedor y remanente 3.0001 tras recibir 2
de 5.0001 en otra ubicación. Manual 3.9. Se reinició la API local con
bootstrap deshabilitado y clave efímera; hay que iniciar sesión nuevamente.

### Actualización 2026-11-11: compromisos visibles para reposición

Se contrastó estáticamente la previsión de Odoo
`odoo/addons/stock/models/stock_orderpoint.py:409` y recepción de compra en
`odoo/addons/purchase_stock/models/purchase_order_line.py:57`.
Ver [adaptación y diferencias](ADAPTACION_ODOO.md). No se ejecutó Odoo ni
se copió su implementación.

`GET /inventory/replenishment` agrega, por producto y empresa,
`pending_purchase_quantity`, `pending_purchase_orders` y
`purchase_orders_requiring_review`. Suma el remanente NUMERIC de órdenes
ordenadas/parciales menos cantidades recibidas por línea, en una sola sentencia
con la consulta de inventario. Cancelación y recepción total quitan el
compromiso; las devoluciones no reabren órdenes. No hay migración ni escrituras
nuevas. Si una orden abierta contiene recibo legado sin detalle o una línea
del producto sobre-recibida, el producto en esa orden se excluye por completo
y se cuenta como pendiente de revisión; no se inventa el remanente.

La compra no registra destino/fecha futura. El total se repite por producto
en cada regla y no se debe sumar entre ubicaciones. No se descuenta de la
sugerencia por ubicación ni se crea propuesta/pedido; requiere revisión humana.
Se probaron recepción concurrente, repetición idempotente, parcial/final,
cancelación, múltiples líneas, empresa ajena y anomalías históricas.
Último cierre: API 36 unitarias y 75 e2e; frontend 52 pruebas; builds correctos.
Navegador cuatro flujos/16 anchos, cero errores: pendiente 5.0001 baja a
3.0001 al recibir 2 en otra ubicación, la sugerencia permanece 4.0001.
Manual 3.8 generado; métricas de capturas anteriores mantienen su fecha.
API 3001 reiniciada con bootstrap deshabilitado: iniciar sesión nuevamente.

Quedan pendientes multiempresa autorizada y permisos finos, destino/plazo de
compra y propuestas aprobables, devengo parcial, política monetaria/costos,
valoración/COGS, conciliación y estados financieros. No se infieren políticas.

### Actualización 0025: gestión administrativa y trazabilidad operativa

**Usuarios:** `GET /auth/users` expone `management_revision`.
`PATCH /auth/users/:id` exige ahora `expectedRevision` y `reason` además de
nombre/roles/estado. Este cambio de contrato es deliberado: sin revisión no
se admite una edición que pueda perder cambios de otro administrador.
Bloqueo de empresa y usuario, 409 para revisión obsoleta, auditoría
antes/después/actor/motivo y revocación de sesiones se confirman juntos.
La UI conserva la revisión del momento de Editar y descarta claves/resultados
de escrituras pendientes si cambia la identidad.

**Empresa:** `/company` y `PATCH /companies/current` actualizan solo nombre
(máximo 160) e identificación tributaria (máximo 64 o null explícito).
`profile_revision` y motivo obligatorios. El tenant procede del JWT;
código/actividad/país/moneda/contrato no se modifican. El encabezado se refresca.
Se comprobó que la instantánea de una factura emitida no cambia. Los PDF
legados sin instantánea conservan su advertencia y pueden usar el nombre actual;
no se inventan instantáneas de emisión histórica.

**Inventario:** `inventory_reorder_rules` modela mínimo/objetivo por producto
y ubicación sin crear saldos ni movimientos. Revisión cero para creación,
revisiones posteriores serializadas por clave; antes/después/motivo auditados.
Cantidades como cadenas decimales (máximo cuatro decimales). Disponible es
físico menos reservado; se alerta solo por debajo del mínimo positivo y se
sugiere objetivo menos disponible. Producto inactivo o mínimo cero no sugieren.
Incluye reglas sin stock. La sugerencia no tiene en cuenta compras en tránsito
ni emite compras/reservas/asientos; revisión humana obligatoria.

**Contabilidad:** `GET /accounting/accounts` lista el plan sin calcular todos
los asientos. `/accounting` consume
`GET /accounting/reports/general-ledger?accountCode=...&fromDate=...&toDate=...`.
Una sentencia SQL obtiene apertura anterior al inicio, movimientos publicados
del intervalo inclusivo, cierre y acumulado completo antes de paginar. Responde
importes como texto, sin conversión monetaria a Number. Fechas/tenant/cuenta y
páginas acotadas validadas; límite 100 líneas por página, defecto 25.
Orden estable por fecha/creación/IDs. Saldo es débito menos crédito incluso
para pasivo/ingreso. La UI presenta fechas ejecutadas y no confunde fallos con
saldo cero. No sustituye balance financiero legal ni conciliación.

**Verificación:** ocho e2e nuevas y diez pruebas frontend nuevas.
Suite completa: 36 unitarias API, 73 e2e (15 suites) y 52 ChromeHeadless;
builds correctos. E2e comprueba concurrencia 200/409, aislamiento, último admin,
revocación, snapshot, umbral inclusivo, reservado y cálculo exacto con
`10000000000000.0001` sin pérdida de fracciones de `0.0001` entre páginas.
Navegador real: cuatro flujos y 16 combinaciones en 320/390/768/1440, cero
errores/desbordamiento. Evidencia con fecha:
`docs/manual/management-evidence.json`; capturador
`docs/manual/capture_management.cjs`, capturas ficticias 25 a 28 sin claves.
Manual 3.7 generado/verificado: 26 capítulos/anexos, 41 figuras, 63 tablas y
135 endpoints. Las capturas anteriores mantienen su fecha original.

**Migración/operación:** `0025_core_management.sql` aplicada tras respaldo
custom `/tmp/erp360-before-0025.dump` en el contenedor y copia fuera del
repositorio en los archivos de sesión. Catálogo comprobado con `pg_restore -l`
(502 líneas); no constituye ensayo de restauración.
API recompilada/reiniciada en 3001 con bootstrap deshabilitado y clave efímera;
es necesario iniciar sesión de nuevo. Frontend 4201 y proxy responden.
Ningún dato real recibió umbrales, cambios de perfil ni apuntes de prueba.

**Para continuar:** ver prioridades en
[pendientes](PENDIENTES_DESARROLLO.md): permisos de escritura granulares,
MFA/correo/membresías, cambios legales y monetarios autorizados, reposición
con compromisos/fechas y propuestas aprobables, conciliación parcial y estados
financieros. No convertir estas pantallas en permisos globales o compras automáticas.

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
| 0024_quotation_validity | vigencia opcional, revisión auditada y bloqueo de confirmación vencida |
| 0025_core_management | revisiones de usuarios/empresa, reglas de reposición e índices de libro mayor |

Antes de 0020 se realizó respaldo PostgreSQL custom en la carpeta privada de
sesión. No se eliminó ni reinicializó el volumen. Este respaldo NO equivale a
una restauración probada ni reemplaza política de backups productivos.
También se respaldó antes de 0022; no se borraron volúmenes ni documentos.
Antes de 0023 se generó otro respaldo custom y se comprobó su catálogo con
`pg_restore -l`. Es respaldo legible, no una restauración ensayada.
Antes de 0024 se generó respaldo custom y se conservó fuera del repositorio;
`pg_restore -l` verificó su catálogo (502 líneas), sin ensayar restauración.
La migración solo añade columnas, sin modificar fechas o importes existentes.

No se infiere que estén aplicadas en otra máquina. No hay un ledger completo
de migraciones automatizado: respaldar, revisar versión real y ejecutar solo
las pendientes en orden. Si 0017 detecta jornadas duplicadas, conciliar con
autorización antes de volver a ejecutar; no borrar evidencia.

## 5. Verificación y evidencia reproducible

| Verificación | Comando / evidencia | Resultado |
|---|---|---|
| API build | `npm run build` en api | Correcto |
| API unitaria | `npm test -- --runInBand` | 36 pruebas, 17 suites |
| API e2e | `npm run test:e2e -- --runInBand` | 73 pruebas, 15 suites |
| Frontend build | `npm run build` en frontend | Correcto |
| Frontend Chrome | `npm test -- --watch=false --browsers=ChromeHeadless` | 52 pruebas |
| Navegador real | `docs\manual\capture_manual.cjs` y `capture_billing.cjs` | 7+4 flujos, 52+8 casos de ruta/ancho, 0 errores de página |
| Health | API 3001, frontend/proxy 4201 actualizados | HTTP 200 |
| Navegador gestión | `capture_management.cjs` | 4 flujos y 16 combinaciones ruta/ancho, cero errores |
| Manual | Generador Python + inspección de estructura DOCX | Edición 3.7: 26 capítulos/anexos, 41 figuras, 63 tablas y 135 endpoints |

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

#### Adaptación desde fuente Odoo: vigencia de cotizaciones

El 11 de noviembre se trazó el flujo de `validity_date`/`is_expired` y sus
consumidores de firma/pago de portal en el código local de Odoo. No se
decompiló con REA porque existe fuente completa ni se ejecutó Odoo.
Ver [análisis de adaptación](ADAPTACION_ODOO.md) para fuentes y diferencias.

ERP360 incorpora `validUntil` opcional, indicador derivado de vencimiento y
revisión con motivo/control optimista. Solo admin del mismo tenant puede
renovar borradores. La confirmación vencida devuelve 409 antes de crear pedido;
la renovación conserva precios y datos financieros.

UTC explícito; fecha inclusiva. No se configuró un plazo empresarial por
defecto, no se caducaron históricos sin fecha y no se añadió aceptación
pública/firma/cobro. El checkout conserva el comportamiento sin fecha.

Cinco e2e nuevas y tres UI nuevas. Suite completa actual: 36 unitarias API,
65 e2e y 42 frontend; builds correctos. La evidencia adicional
`docs\manual\quotation-evidence.json` verifica dos flujos reales y cuatro
anchos sin overflow ni errores: crear oferta, fixture ficticia vencida,
rechazo API, renovación por UI y confirmación con revisión 2.
La fixture no cambia reloj ni documentos de clientes reales.

El manual 3.6 explica el procedimiento y contiene captura 24. Las anteriores
evidencias ERP/SaaS mantienen sus fechas históricas y no se presentan como
una nueva ejecución en esta etapa.

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
