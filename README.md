# ERP360 Modernizado

Este directorio concentra la migración del nuevo ERP basada en el requerimiento de [Prompt_Maestro_ERP360_Modernizacion_v3.md](C:/angular/erp360/Prompt_Maestro_ERP360_Modernizacion_v3.md).

## Estructura inicial

- `frontend/` — aplicación Angular.
- `api/` — backend Node.js/NestJS.
- `database/` — migraciones, seeds y artefactos SQL.
- `infra/` — docker y despliegue (AWS).
- `docs/` — análisis, paridad funcional, riesgos, plan de lotes y evidencias.
- `scripts/` — scripts de soporte para desarrollo/migración.

## Estado

Fase actual: **Etapa 2 — Ejecución técnica**.

## Estado por lotes

- **Lote 0**: base técnica (frontend, API, PostgreSQL local, health checks) — completado.
- **Lote 1**: auth, roles, multiempresa y auditoría — completado.
- **Lote 2**: catálogos maestros (clientes, productos, proveedores, impuestos) — completado.
- **Lote 3**: ciclo comercial núcleo:
  - ventas: cotización → pedido → factura.
  - compras: solicitud → orden → recepción.
  - completado.
- **Lote 4**: inventario y logística núcleo:
  - recepción de compra a inventario.
  - reserva y despacho de venta.
  - ajustes manuales de stock.
  - completado.
- **Lote 5**: contabilidad y cierre:
  - plan de cuentas base y posteo contable integrado.
  - registro de pagos y conciliación básica del estado interno (no conciliación bancaria).
  - reporte de balance de comprobación y cierre de período.
  - completado.
- **Lote 6**: facturación electrónica regional homologable:
  - adaptadores fiscales simulados sandbox para GT FEL, SV DTE y DO e-CF (sin certificación productiva).
  - trazabilidad de documentos e intentos de transmisión.
  - completado.
- **Lote 7**: portal, UX y endurecimiento:
  - portal de cliente con token temporal y revocación.
  - hardening de API (security headers, CORS, rate limit en portal público).
  - vista frontend de consulta de portal.
  - completado.

## Cierre de brechas históricas de paridad

- **PF-002 RPC legado**: compatibilidad XML-RPC implementada en `/rpc/xmlrpc`.
- **PF-012 RRHH**: núcleo de RRHH implementado (empleados, asistencia y ausencias).
- **PF-011 eCommerce**: módulo headless API-first con storefront Angular (`/store`), carrito, checkout integrado y suscripción por empresa.

Ver detalle operativo en `docs/ESTADO_PROYECTO.md`.

## Frontend UX/UI (actualizado)

La interfaz Angular fue rediseñada con navegación lateral, layout responsive, iconografía y flujo de acceso visible.

Rutas principales:

- `/` — inicio con guía de uso y modelo multiempresa.
- `/login` — acceso y alta de empresa nueva solo cuando el servidor la habilita temporalmente.
- `/workspace` — contexto de sesión (usuario, roles, empresa asociada).
- `/store` — tienda eCommerce por empresa con carrito, checkout y suscripción.
- `/portal` — consulta de cliente por token.
- `/processes` — guía operativa y límites reales por módulo.
- `/users` — invitación, activación, roles, recuperación y revocación por empresa.
- `/catalogs` — edición, desactivación e importación atómica de maestros.
- `/controls` — transferencias, conteos, pagos a proveedores, cancelaciones,
  créditos totales, reembolsos, recuperación de crédito del proveedor con historial,
  seguimiento de entregas y reapertura contable.
- `/people` — edición/baja de empleados, corrección auditada de jornadas cerradas
  y cancelación de ausencias pendientes/aprobadas conservando decisiones.
- `/receiving` — recepciones parciales con ingreso físico inmediato, costos
  snapshot, cantidades pendientes y devoluciones a proveedor con crédito contable.

Mejoras UX adicionales:

- modo claro/oscuro persistente;
- filtros, orden y paginación de catálogo eCommerce;
- token de portal protegido y no persistido; documentos en tablas y limpieza explícita;
- dashboard de workspace con métricas en vivo desde API y actualización manual;
- skeleton loaders y microinteracciones visuales;
- transiciones de ruta y estados vacíos reutilizables (empty state);
- dashboard ejecutivo visual con barras comparativas;
- componentes visuales reutilizables (cards, métricas, tablas y estados).

La navegación está agrupada por áreas y conserva las rutas/permisos existentes.
Desde 1280 px CSS usa una barra lateral con desplazamiento propio; en ventanas
más pequeñas usa un panel superpuesto con cierre por Escape, foco de teclado
contenido y fondo sin interacción. El zoom puede activar el diseño compacto.
Tarjetas, formularios y tablas comparten mayor espaciado y jerarquía visual.
Ver instrucciones y capturas en el
[manual de usuario](docs/manual/MANUAL_ERP360_OPERACION_Y_CONFIGURACION.docx).

La API contiene los módulos operativos; no todos disponen aún de formularios
administrativos en Angular. El checkout crea pedido y reserva inventario, sin
pasarela de pago. La fiscalidad es simulación sandbox, no emisión legal.
La sesión JWT está en `sessionStorage` (no elimina el riesgo XSS). El botón
flotante Asistente ofrece una guía local gratuita y, con consentimiento explícito,
consultas mediante adaptadores OpenAI, DeepSeek o Claude. El proveedor y modelo
activos se eligen por empresa en **Administración SaaS → Servicio de IA y proveedores**.
Solo `owner` puede configurar claves/modelos; `owner` y `billing` asignan el
servicio por usuario y registran ampliaciones realmente pagadas.
La consulta externa envía solo la pregunta actual y contexto allowlisted
(pantalla sin query y último estado HTTP/referencia), no documentos completos ni historial.
**Analizar pantalla** ofrece apoyo en todas las áreas del ERP: resúmenes
autorizados y reglas operativas con evidencia. **Analizar** junto a solicitudes
de compra, pedidos y saldos investiga además aprobación independiente,
reservas, ubicación y disponibilidad. Las consultas son estáticas, acotadas,
en transacción PostgreSQL `READ ONLY`, con aislamiento por empresa y roles de
las APIs operativas. No hay SQL libre ni herramientas elegidas por el modelo.
El diagnóstico interno funciona sin proveedor o servicio IA y no consume tokens.
En **IA y privacidad**, compartir sus hechos mínimos exige consentimiento
adicional; el backend vuelve a consultarlos y añade ese contexto al cómputo
normal de la pregunta. No envía nombres, IDs, documentos, importes ni valores
de formularios. Los informes distinguen evidencia, recomendaciones y límites.
Sugiere enlaces autorizados y navega ante órdenes explícitas como «abre Inventario»
o «abre Compras»; las consultas normales no navegan automáticamente.
Minimizar conserva la conversación; Limpiar chat, cerrar sesión o cambiar de
usuario/empresa elimina el historial. No modifica datos ni cambia roles, y no
demuestra causas fuera de las comprobaciones realizadas. No introducir secretos
ni datos personales.
Ayuda conserva los pasos de cada pantalla y permite abrir el chat.
La cuota mensual UTC de empresa suma las bolsas de usuarios con servicios activos
y las compras del mes. Se reservan tokens antes de contactar al proveedor,
serializando por empresa; se contabilizan entrada, caché y salida reportadas.
Saldo insuficiente devuelve 429 sin invocar IA. Cambiar proveedor no reinicia
consumo; las reservas inciertas quedan retenidas para conciliación `owner`.
No hay fallback a otro proveedor ni reintentos automáticos de consultas fallidas.
Las claves se guardan cifradas en `assistant_provider_configs`; el secreto
`ASSISTANT_CREDENTIAL_KEY` permanece fuera de PostgreSQL. No se asignan servicios
ni claves automáticamente. Ver [configuración de IA](docs/DESPLIEGUE_LOCAL.md#proveedores-de-ia-y-límites-mensuales).

### Ampliación operativa

Migraciones nuevas `0013` a `0029`: identidad, controles de inventario/tesorería,
moneda explícita en documentos nuevos, PDF y folios comerciales automáticos,
créditos totales con devolución física opcional, reembolsos confirmados,
revisiones de RRHH, entrega manual, clave privada de baja y snapshot de factura.
`0020` agrega recepciones parciales y devoluciones por lote documental;
`0021` permite registrar el retorno físico total posterior a un crédito de venta.
`0022` agrega ingresos recibidos por crédito proveedor y cancelación auditada
de ausencias con control de revisión. Recuperar crédito es registrar dinero
ya recibido (no conectarse a bancos); cancelar ausencia no recalcula nómina.
`0023` agrega la consola de cartera SaaS independiente y sus operadores,
contratos, documentos internos, historial financiero y seguimiento.
`0024` agrega vigencia opcional de cotizaciones y revisión auditada; las ofertas
vencidas no se confirman hasta revisar sus condiciones. Históricos sin fecha
conservan su comportamiento. Ver [adaptación de procesos Odoo](docs/ADAPTACION_ODOO.md).
`0026` añade propuestas de reposición como solicitudes en borrador, con
proveedor, cantidad y costo elegidos, sin impuesto y con aprobación separada.
La deduplicación cubre solo propuestas abiertas de la misma regla; revisar
compras manuales y otras ubicaciones antes de proponer.
`0027` permite exigir otro administrador para aprobar compras, desde Mi empresa
con revisión y motivo auditados. Inicia desactivado. Con la política activa,
no se permite autoaprobar ni aprobar históricos sin creador conocido.
También cubre propuestas de reposición; no cambia órdenes aprobadas.
`0025` añade revisiones administrativas de usuarios/empresa y reglas de
reposición por producto/ubicación. Usuarios exige motivo y revisión original al
editar; Mi empresa permite actualizar nombre e identificación sin cambiar tenant.
Inventario sugiere cantidades exactas, sin crear órdenes ni descontar tránsito.
La pantalla muestra además compras aprobadas pendientes por producto para toda
la empresa; no indica destino, no debe sumarse entre ubicaciones y advierte
recepciones históricas o inconsistentes excluidas del total.
Contabilidad incorpora libro mayor con apertura y acumulado antes de paginar;
no asigna moneda a históricos ni sustituye conciliación o estados certificados.
El contrato `PATCH /auth/users/:id` exige ahora `expectedRevision` y `reason`;
los consumidores deben leer `management_revision` desde `GET /auth/users`.
Los lotes nuevos ya ingresan inventario: no aplicar también una recepción total
histórica. La devolución a proveedor exige compra completa/contabilizada y
stock disponible en la ubicación original; registra crédito, no reembolso bancario.
La devolución no reabre la orden. El devengo de cada recepción parcial, el
crédito parcial de venta y la devolución de compras históricas siguen pendientes.
La moneda inicial empresarial es USD; los documentos históricos permanecen
sin moneda si no la tenían. No hay conversión multimoneda ni configuración
monetaria administrativa completa. La tienda debe usar la moneda de la empresa.

El checkout se serializa por carrito, verifica publicación/precio y reserva
solo en MAIN; repetirlo devuelve el mismo pedido sin duplicar la reserva.
Los clientes invitados no se vinculan a cuentas existentes por un correo/código
no verificado. El costo de envío requiere cotización externa y no se incluye
automáticamente. Ninguna pantalla mueve dinero real.

### Administración SaaS y cobranza

- `/platform/billing`: consola de plataforma con cartera por fecha/moneda,
  contratos y módulos por empresa, documentos internos, historial de ingresos,
  créditos/reversiones y tareas de seguimiento.
- `/subscription`: consulta del contrato de la empresa autenticada.
- La membresía de plataforma se concede explícitamente desde el servidor;
  ser `admin` de empresa no permite consultar la cartera global.
- Los ingresos registran dinero ya recibido; no hay cargos de tarjeta,
  correo automático ni bloqueo comercial de módulos. No confundir contratos
  informativos con derechos de acceso ya exigidos por cada endpoint.
- La facturación SaaS está separada de las facturas operativas de los clientes.
  Los precios de ejemplo, uso medido y prorrateos son propuestas, no cobros activos.

Consultar [modelo de cobro SaaS y límites](docs/MODELO_COMERCIAL_SAAS.md) y
[bitácora y continuación](docs/BITACORA_CONTINUIDAD.md).
Para retomar el desarrollo en otra sesión:
[pendientes priorizados y decisiones necesarias](docs/PENDIENTES_DESARROLLO.md).

Arranque actualizado: [despliegue local](docs/DESPLIEGUE_LOCAL.md).
Entregables: [manual ilustrado](docs/manual/MANUAL_ERP360_OPERACION_Y_CONFIGURACION.docx)
y [revisión y arquitectura de asistencia](docs/REVISION_UI_SEGURIDAD_IA.md).

### Dashboard temporal por empresa

`/workspace` consulta `GET /dashboard/overview?period=day|week|month`.
El endpoint obtiene la empresa exclusivamente del JWT; no acepta un selector
de tenant. Los indicadores son totales históricos, mientras que el gráfico
cuenta pedidos de venta y órdenes de compra creados, excluyendo cancelados,
en 14 días, 12 semanas o 12 meses (incluyendo el período actual parcial).
La zona horaria es UTC y las semanas comienzan el lunes. Los períodos sin
operaciones se devuelven con cero; un fallo de carga se muestra como error,
nunca como una métrica cero.

Visibilidad del nuevo dashboard:

- `admin`: todos los widgets y ambas series.
- `sales`: clientes, cotizaciones, inventario y serie de pedidos de venta.
- `purchases`: proveedores, solicitudes, inventario y serie de órdenes de compra.
- otros roles: productos y saldos de inventario, sin series comerciales.

Los códigos `sales` y `purchases` deben estar asignados a la cuenta mediante
el mecanismo de roles existente; esta pantalla no crea usuarios ni asigna
permisos. La visibilidad se aplica en el servidor, no solo en el frontend, y
no modifica los permisos preexistentes de otros módulos.
La tabla desplegable ofrece los valores exactos del gráfico. El dashboard
se recarga tras restaurar la sesión y descarta respuestas de sesiones anteriores.
No se presentan importes financieros ni se asume una moneda común.
