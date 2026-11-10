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
  - adaptadores fiscales para GT FEL, SV DTE y DO e-CF.
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
