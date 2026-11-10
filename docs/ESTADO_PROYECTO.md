# Estado del proyecto ERP360 modernizado

## Fecha de inicio de ejecución

- 2026-11-10

## Etapa actual

- **Etapa 2 — Ejecución técnica (Lotes 0, 1, 2, 3, 4, 5, 6 y 7 cerrados)**

## Avance completado

1. Creación de estructura base del proyecto modernizado.
2. Diagnóstico técnico inicial del sistema legacy.
3. Matriz de paridad funcional inicial.
4. Línea base KPI/SLI (definición y plan de medición).
5. Registro de riesgos y dependencias.
6. Propuesta de plan por lotes de migración.
7. Scaffolding inicial de frontend (Angular) y API (NestJS).
8. Base de despliegue local con PostgreSQL en `docker-compose.yml`.
9. Health checks y logging con `correlation_id` en API.
10. Validación técnica inicial ejecutada (build frontend/api + health endpoints + docker compose config).
11. Definición y aplicación de migración inicial PostgreSQL (`0001_foundation.sql`).
12. Inicio de Lote 1 con API de autenticación sobre PostgreSQL (`/auth/bootstrap-admin`, `/auth/login`, `/auth/me`).
13. Control de acceso por rol (guard + `@Roles`) y endpoint protegido `/auth/admin-check`.
14. Auditoría automática inicial en `audit_log` para bootstrap de admin y login exitoso.
15. Control de acceso por recurso multiempresa en endpoints `companies` (`/companies/current`, `/companies/:id`).
16. Pruebas unitarias ampliadas para guard de auth y control multiempresa.
17. Rotación de JWT por ambiente implementada (`JWT_SECRETS_JSON` + `JWT_ACTIVE_KID`).
18. Auditoría de acceso por recurso en módulo companies (`company.read.*`).
19. Inicio de Lote 2: migración y endpoints de catálogos maestros para clientes y productos.
20. Lote 2 ampliado con catálogos de proveedores e impuestos base (migración + endpoints + validaciones).
21. Cierre de Lote 2 con pruebas e2e de integración de catálogos contra PostgreSQL.
22. Implementación de Lote 3 con migración `0004_commerce_core.sql` para ventas/compras núcleo.
23. Flujo de ventas implementado: cotización → pedido → facturación (`commerce/sales/*`).
24. Flujo de compras implementado: solicitud → orden → recepción (`commerce/purchases/*`).
25. Pruebas e2e de Lote 3 ejecutadas sobre API + PostgreSQL.
26. Implementación de Lote 4 con migración `0005_inventory_core.sql`.
27. Núcleo de inventario implementado: recepción de compra, reserva de venta, despacho de venta y ajustes.
28. Trazabilidad de inventario por saldos/movimientos y auditoría de eventos críticos.
29. Pruebas e2e ampliadas para validar integración de inventario con compras/ventas.
30. Implementación de Lote 5 con migración `0006_accounting_core.sql`.
31. Módulo de contabilidad implementado: plan de cuentas, diario contable, pagos y conciliaciones.
32. Integración contable de ventas/compras e inventario operativo.
33. Reporte `trial balance` y cierre de período implementados.
34. Pruebas e2e ampliadas con flujo contable completo.
35. Implementación de Lote 6 con migración `0007_fiscal_regional_core.sql`.
36. Módulo fiscal regional implementado con adaptadores desacoplados GT/SV/DO.
37. Flujo sandbox fiscal implementado: configuración proveedor → documento fiscal → envío → trazabilidad.
38. Implementación de Lote 7 con migración `0008_portal_hardening_core.sql`.
39. Portal de cliente implementado con tokens temporales, hash, expiración y revocación.
40. Hardening API aplicado: CORS explícito, cabeceras de seguridad y rate limit de portal público.
41. UI frontend mínima de portal publicada en ruta `/portal`.
42. Cierre de brecha PF-002: compatibilidad XML-RPC legado implementada.
43. Cierre de brecha PF-012: núcleo RRHH implementado (empleados/asistencia/ausencias).
44. Cierre de brecha PF-011: módulo eCommerce headless integrado a catálogo/inventario/ventas.
45. Storefront Angular publicado en ruta `/store` con carrito y checkout.
46. Suscripción eCommerce por empresa implementada (alta pública + gestión administrativa).

## Entregables generados

- `docs/ANALISIS_SISTEMA_ORIGINAL.md`
- `docs/MATRIZ_PARIDAD_FUNCIONAL.md`
- `docs/LINEA_BASE_KPIS.md`
- `docs/RIESGOS_Y_DEPENDENCIAS.md`
- `docs/PLAN_LOTES_MIGRACION.md`
- `docs/BACKLOG_LOTE_0.md`
- `docs/DESPLIEGUE_LOCAL.md`
- `docs/BACKLOG_LOTE_1.md`
- `docs/BACKLOG_LOTE_2.md`
- `docs/BACKLOG_LOTE_3.md`
- `docs/BACKLOG_LOTE_4.md`
- `docs/BACKLOG_LOTE_5.md`
- `docs/BACKLOG_LOTE_6.md`
- `docs/BACKLOG_LOTE_7.md`
- `docs/BACKLOG_COMPLEMENTARIO_RPC_RRHH.md`
- `docs/BACKLOG_COMPLEMENTARIO_ECOMMERCE.md`
- `docs/ARQUITECTURA_ECOMMERCE_HEADLESS.md`

## Próximo paso

- Consolidar certificación oficial de conectores fiscales reales por país y preparar despliegue.

## Validaciones ejecutadas

- `frontend`: `npm install` y `npm run build` exitoso.
- `api`: `npm install` y `npm run build` exitoso.
- API en ejecución local temporal:
  - `GET /health/live` => 200
  - `GET /health/ready` => 200
- `docker compose config` válido para servicio PostgreSQL.
- `docker compose up -d db` y aplicación de `database/migrations/0001_foundation.sql` ejecutados con éxito.
- Validación auth contra DB:
  - `POST /auth/bootstrap-admin` => 201
  - `POST /auth/login` => 201
  - `GET /auth/me` => 200
- Validación de rol:
  - `GET /auth/admin-check` con token admin => 200
  - `GET /auth/admin-check` sin token => 401
- Validación de recurso multiempresa:
  - `GET /companies/current` con token válido => 200
  - `GET /companies/:id` con token de otra empresa (no admin) => 403
- Validación de auditoría:
  - eventos `user.bootstrap_admin` y `user.login_success` registrados en `audit_log`.
  - eventos `company.read.current` registrados al consultar empresa actual.
- Validación de catálogos maestros:
  - `POST /masters/customers` => 201
  - `GET /masters/customers` => 200
  - `POST /masters/products` => 201
  - `GET /masters/products` => 200
  - `POST /masters/suppliers` => 201
  - `GET /masters/suppliers` => 200
  - `POST /masters/tax-rates` => 201
  - `GET /masters/tax-rates` => 200
- Validación comercial (Lote 3):
  - `POST /commerce/sales/quotations` => 201
  - `POST /commerce/sales/quotations/:id/confirm` => 201
  - `POST /commerce/sales/orders/:id/invoice` => 201
  - `POST /commerce/purchases/requests` => 201
  - `POST /commerce/purchases/requests/:id/approve` => 201
  - `POST /commerce/purchases/orders/:id/receive` => 201
- Validación inventario (Lote 4):
  - `POST /inventory/purchases/orders/:id/receive` => 201
  - `POST /inventory/sales/orders/:id/reserve` => 201
  - `POST /inventory/sales/orders/:id/dispatch` => 201
  - `GET /inventory/stock?locationCode=MAIN` => 200
- Validación contabilidad (Lote 5):
  - `POST /accounting/bootstrap-accounts` => 201
  - `POST /accounting/sales-invoices/:id/post` => 201
  - `POST /accounting/purchase-orders/:id/post` => 201
  - `POST /accounting/sales-invoices/:id/payments` => 201
  - `GET /accounting/reports/trial-balance` => 200 (balanceado)
  - `POST /accounting/periods/close` => 201
- Validación fiscal regional (Lote 6):
  - `POST /fiscal/providers/config` => 201
  - `POST /fiscal/invoices/:id/documents` => 201
  - `POST /fiscal/documents/:id/submit` => 201
  - `GET /fiscal/documents?countryCode=GT` => 200
- Validación portal y hardening (Lote 7):
  - `POST /portal/access-tokens` => 201
  - `GET /portal/public/:token/summary` => 200
  - `POST /portal/access-tokens/:id/revoke` => 201
  - `GET /portal/public/:token/summary` (token revocado) => 401
- Validación RPC legado (PF-002):
  - `POST /rpc/xmlrpc` método `common.authenticate` => 200
  - `POST /rpc/xmlrpc` método `object.execute_kw` (`hr.employee.search_read`) => 200
- Validación RRHH (PF-012):
  - `POST /hr/employees` => 201
  - `POST /hr/attendance/check-in` => 201
  - `POST /hr/attendance/check-out` => 201
  - `POST /hr/leave-requests` => 201
  - `POST /hr/leave-requests/:id/approve` => 201
  - `GET /hr/leave-requests` => 200
- Validación eCommerce (PF-011):
  - `POST /ecommerce/admin/settings` => 201
  - `POST /ecommerce/admin/categories` => 201
  - `POST /ecommerce/admin/listings` => 201
  - `GET /ecommerce/storefront/:companyCode` => 200
  - `POST /ecommerce/storefront/:companyCode/carts` => 201
  - `POST /ecommerce/storefront/:companyCode/carts/:cartId/items` => 201
  - `POST /ecommerce/storefront/:companyCode/carts/:cartId/checkout` => 201
  - `POST /ecommerce/storefront/:companyCode/subscribe` => 201
  - `GET /ecommerce/admin/subscribers` => 200
- Pruebas automatizadas:
  - `npm test -- --runInBand` => 13 suites / 25 tests OK.
  - `npm run test:e2e -- --runInBand` => 4 suites / 6 tests OK.
