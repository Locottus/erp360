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
  - registro de pagos y conciliación básica.
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

Mejoras UX adicionales:

- modo claro/oscuro persistente;
- filtros, orden y paginación de catálogo eCommerce;
- token de portal protegido y no persistido; documentos en tablas y limpieza explícita;
- dashboard de workspace con métricas en vivo desde API y actualización manual;
- skeleton loaders y microinteracciones visuales;
- transiciones de ruta y estados vacíos reutilizables (empty state);
- dashboard ejecutivo visual con barras comparativas;
- componentes visuales reutilizables (cards, métricas, tablas y estados).

La API contiene los módulos operativos; no todos disponen aún de formularios
administrativos en Angular. El checkout crea pedido y reserva inventario, sin
pasarela de pago. La fiscalidad es simulación sandbox, no emisión legal.
La sesión JWT está en `sessionStorage` (no elimina el riesgo XSS); el chat IA
todavía no está conectado. Ayuda permite preparar un contexto mínimo sin PII.

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
