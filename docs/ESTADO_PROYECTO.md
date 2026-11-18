# Estado del proyecto ERP360 modernizado

## Corte verificado: 17 de noviembre de 2026

### Continuación operativa 0035 — base productiva inicial

- Migración `0035_operational_readiness.sql` aplicada sobre la base operativa
  después de una copia restaurada y respaldo custom previo.
- Política empresarial de costo disponible para promedio ponderado o FIFO,
  con revisión auditada. Los despachos pueden conservar costo unitario, costo
  total, política y origen en el movimiento.
- COGS se publica como asiento en las cuentas `1200` Inventario y `5100`
  Costo de ventas cuando existe costo calculable. Un despacho duplicado no
  genera un segundo asiento para el mismo pedido.
- Conciliación bancaria tiene estados pendiente/emparejado/reconciliado/diferencia,
  vínculo opcional a pago de cliente y razón auditada.
- MFA TOTP disponible por usuario, con secreto cifrado y rechazo de códigos ya
  usados. Requiere configurar `MFA_CREDENTIAL_KEY` o reutilizar de forma segura
  `ASSISTANT_CREDENTIAL_KEY`.
- Endpoints de webhook de pagos con firma HMAC por proveedor, idempotencia por
  evento y retención sin aplicar. Todavía no hay proveedor bancario configurado.
- Fiscal en producción rechaza transmisiones mientras no exista certificación
  externa registrada. Sandbox continúa siendo la única capacidad demostrada.
- Chat ampliado con orientación explícita de inventario, contabilidad, bancos,
  fiscal, seguridad/MFA y navegación allowlisted.
- Builds API/Angular correctos, 9 pruebas API focalizadas y 98 pruebas Angular
  correctas después de la implementación. API 3001 y Angular 4201 disponibles
  al finalizar.

### Continuación 0036 — operación, SaaS, compras y personas

- Ledger de migraciones creado y respaldos custom registrados para 0035/0036.
- Scripts `scripts/backup.ps1` y `scripts/restore.ps1` disponibles para
  respaldo/restauración de PostgreSQL sin recrear el volumen.
- Entitlements SaaS persistidos por empresa/módulo con estado, vigencia, gracia,
  revisión y outbox de eventos. HTTP aún no bloquea ni suspende módulos: la
  integración de enforcement efectiva requiere política aprobada.
- Catálogo de almacenes autorizados disponible por empresa y códigos normalizados.
- Compras nuevas bloquean solicitudes abiertas del mismo producto/proveedor,
  además de deduplicar otra propuesta abierta de la misma regla.
- Checkout crea cuenta cliente con estado de verificación pendiente, sin validar
  propiedad del correo todavía. Reserva expresa de 30 minutos y estado de
  cotización de envío registrado; no cotiza ni cobra transportistas reales.
- RRHH admite paginación opcional de empleados, asistencias y ausencias, y
  vínculo/desvínculo auditado de empleado con usuario activo.
- Migraciones 0035/0036 validadas en copias aisladas antes de aplicar a producción
  local. Builds correctos; 9 pruebas API focalizadas y 98 Angular pasan.
- Manual de usuario regenerado como edición 3.20 y comprobado en estructura DOCX;
  contiene 0035/0036, MFA TOTP, conciliación inicial, almacenes, entitlements y límites.

El ERP sigue en desarrollo; los cierres de lotes de abajo describen el núcleo,
no paridad completa con Odoo ni preparación para producción.

- PostgreSQL `erp360-db` saludable, volumen existente conservado.
- Tres bloques de planificación completados sin migración: resumen exacto de
  compras por destino/fecha, solicitudes abiertas separadas de órdenes y CSV
  autenticado. Disponible en Inventario → Reposición → Ver órdenes.
  Total, grupos y documentos se leen en una misma instantánea; el CSV vuelve a
  consultar. No se descuentan compromisos de la sugerencia ni se deduplican
  automáticamente necesidades de distintas reglas/solicitudes.
- Verificación nueva: builds API/Angular, 42 e2e en tres suites (incluida regresión
  de CSV SaaS compartido), 32 Angular en tres suites; navegador real, tres flujos,
  tres anchos, descarga real, errores 503 sintéticos y recuperación real.
  Fixtures solo en copia restaurada aislada; copia/API temporales retiradas.
- Manual vigente **3.19**, capítulos 12.2–12.4, captura nueva 42 y ayuda contextual.
  Documentación consolidada al terminar los tres bloques. API ERP reiniciada;
  huellas de seis conjuntos operativos preservadas (264/241/210 documentos,
  1169 movimientos, 320 saldos, 893 asientos); otros proyectos sin cambios.
- API `http://127.0.0.1:3001` y Angular `http://127.0.0.1:4201` iniciados
  en segundo plano, restringidos a loopback. Readiness y proxy devuelven 200.
  Bootstrap público deshabilitado. No se reiniciaron otros proyectos Docker.
- Continuación UX: Operaciones carga catálogos y listados al restaurar la
  sesión administradora, sin requerir Actualizar. Una generación de lectura
  impide que cargas anteriores de listas/balance sobrescriban el estado local
  o terminen la carga actual. Indicador y recuperación explícita ante error.
  No modifica API, esquema, roles ni reglas de escritura.
- Verificación UX: build Angular y 30 pruebas en tres suites, incluidas cinco
  regresiones de sesión/balance; navegador real, tres flujos y nueve casos
  responsive sin errores. Se reprodujo la restauración tardía y se comprobó
  una consulta por endpoint/entrada. Fallo 503 sintético para probar el
  reintento real. Fixtures solo en copia restaurada aislada.
- Nueva migración `0032_quotation_default_validity.sql`: vigencia configurable
  en Mi empresa, motivo/revisión/auditoría, 0 días inicialmente. Ventas permite
  heredar la regla, elegir fecha o dejar una oferta explícitamente sin caducidad.
  No se cambian ofertas existentes ni checkout.
- Continuación `0033_purchase_delivery_plan.sql`: destino previsto y fecha
  comprometida opcionales en solicitudes manuales y propuestas de reposición.
  Se copian al aprobar, se muestran en compromisos y Recepciones, con aviso de
  fecha superada para órdenes abiertas. La ubicación física real puede diferir
  y se conserva junto con el plan en la auditoría del lote recibido.
- Ya existían código y esquema de asistentes externos, tipos de cambio,
  cuentas bancarias, reportes iniciales y pagos multimoneda hasta 0031.
  No se consideran certificados ni completamente probados en este corte.
- Continuación `0034_purchase_delivery_plan_revision.sql`: revisión independiente
  del plan por solicitud/orden. Cambio explícito con motivo, antes/después y
  actor, con historial de hasta 50 revisiones recientes y aviso de anteriores.
  Solo documentos abiertos; coordina aprobación/recepción/cancelación sin
  reescribir importes, existencias ni auditoría de lotes anteriores.
- Verificación de 0034: builds, 34 e2e, 25 Angular y 9 unitarias API relevantes;
  cuatro flujos reales y nueve combinaciones de estado/ruta/ancho sin errores.
  Migración aplicada y health/proxy 200, bootstrap 403. Comparación de huellas
  conserva 264 solicitudes, 241 órdenes, 210 recepciones, 1169 movimientos,
  320 saldos y 893 asientos. Todas las revisiones históricas inician en cero.
- Manual de usuario regenerado como edición 3.18: conserva procedimientos
  0032–0034 y añade sección 4.1 sobre restauración, carga y errores, con
  captura nueva de demostración. Ayuda contextual actualizada. DOCX verificado
  en estructura, imágenes y contenido; sin revisión de toda la paginación en Word.
- Verificación focalizada de 0033: builds API/Angular, 8 unitarias API, 28 e2e
  en cuatro suites y 22 pruebas Angular. Navegador: tres flujos, nueve
  combinaciones de ruta/ancho (375/768/1280), cero errores de página.
  Las métricas anteriores de 0032 se conservan en la bitácora.
- Respaldo custom previo a 0033 restaurado en una base separada; migración,
  integración y UI probadas allí. La base temporal se retira al terminar.
  No equivale a un simulacro productivo de recuperación con RPO/RTO.

Continuidad vigente: [pendientes](PENDIENTES_DESARROLLO.md) y
[bitácora](BITACORA_CONTINUIDAD.md). La visibilidad por destino/fecha y solicitudes
ya está entregada; no confundirla con deduplicación transversal automática.
Siguen pendientes definir esa política, almacenes autorizados y fechas por línea.
La carga inicial de Operaciones ya se corrigió. Las políticas contables,
monetarias y fiscales requieren definición antes de ampliar su efecto.

## Registro histórico inicial (10 y 11 de noviembre)

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

## Próximo paso propuesto en el cierre inicial (histórico)

- Se propuso certificar conectores fiscales. Sigue siendo una dependencia
  externa; no sustituye los pendientes productivos del corte vigente.

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
