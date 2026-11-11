# Matriz de paridad funcional (inicial)

> Estado inicial de Etapa 1. Esta matriz se irá refinando por subproceso y caso de uso.
> `Probado` indica únicamente el flujo básico descrito, no paridad completa,
> autorización fina ni certificación fiscal o bancaria. Para límites y pendientes
> actuales, consultar `PENDIENTES_DESARROLLO.md`.

| ID | Módulo | Funcionalidad original | Evidencia | Regla de negocio a preservar | Datos involucrados | Componente destino | Prueba prevista | Estado | Observaciones |
|---|---|---|---|---|---|---|---|---|---|
| PF-001 | Auth/Web | Autenticación de sesión | `odoo/addons/web/controllers/session.py` | Login válido crea sesión y devuelve contexto de usuario | usuarios, sesión, empresa actual | API `auth` + frontend login | E2E login/logout + token/session | probado | Implementado bootstrap admin, login y `/auth/me` con JWT |
| PF-002 | RPC Compat | Exposición XML-RPC legado | `odoo/addons/rpc/controllers/xmlrpc.py` | Mantener compatibilidad en transición o proveer plan de deprecación | servicios RPC, credenciales | API gateway / adapter legacy | Pruebas de contrato RPC | probado | Endpoint `/rpc/xmlrpc` habilitado con `common.authenticate` y `object.execute_kw` |
| PF-003 | Account | Facturación y pagos | `odoo/addons/account/__manifest__.py` | Emisión, registro y trazabilidad contable consistente | asientos, facturas, pagos | API `accounting` + frontend `invoicing` | Unit + integration + E2E facturación | probado | Posteo contable, pagos, conciliación básica, trial balance y cierre de período |
| PF-004 | Sales | Gestión de ventas | `odoo/addons/sale/__manifest__.py` | Flujo cotización→pedido→facturación | clientes, pedidos, líneas, impuestos | API `sales` + frontend `sales` | E2E ciclo comercial | probado | Flujo base implementado en `commerce/sales/*` |
| PF-005 | Inventory | Inventario y logística | `odoo/addons/stock/__manifest__.py` | Movimientos de stock, trazabilidad y reservas | productos, ubicaciones, lotes, movimientos | API `inventory` + frontend `inventory` | E2E recepción/entrega/ajuste | probado | Implementado núcleo con saldos, movimientos, reservas y despacho |
| PF-006 | Purchase | Compras | `odoo/addons/purchase/__manifest__.py` | Orden de compra y recepción integrada | proveedores, OC, recepciones | API `purchases` + frontend `purchases` | E2E compra→recepción | probado | Flujo base implementado en `commerce/purchases/*` |
| PF-007 | Portal | Portal de cliente (órdenes/cotizaciones) | `odoo/addons/sale/controllers/portal.py` | Cliente solo ve su información autorizada | partner, pedidos, permisos portal | Frontend portal + API portal | E2E permisos y visibilidad | probado | Portal con token temporal, expiración y revocación |
| PF-008 | Multiempresa | Contexto empresa en operación | `odoo/addons/base/models/res_users.py` (contexto/seguridad) | Aislamiento por empresa en consultas y acciones | usuarios, compañías, roles | API `companies` + policy layer | Pruebas de aislamiento tenant | probado | Endpoints `/companies/current` y `/companies/:id` con control de acceso por recurso (403 cross-company) |
| PF-009 | Localización fiscal | Reglas país y cumplimiento | familias `l10n*` en `odoo/addons/` | Cumplimiento fiscal por país sin romper core | impuestos, documentos fiscales | adapters fiscales + módulo impuestos | Pruebas por país prioritario | probado | Adaptadores GT/SV/DO y bitácora de transmisiones fiscal |
| PF-010 | Pagos | Integraciones de pago | familias `payment*` en `odoo/addons/` | Registro confiable de transacción y conciliación | transacciones, métodos, estados | API `payments` + webhooks | Pruebas de idempotencia | probado | Registro de pago interno y conciliación contable básica implementada |
| PF-011 | Website/eCommerce | Funcionalidad web comercial | familias `website*` en `odoo/addons/` | Navegación y compra coherente con catálogo | productos, carrito, pedidos, suscriptores | Frontend web + API comercial | E2E checkout básico | probado | eCommerce headless API-first con storefront Angular, checkout integrado y suscripción por empresa |
| PF-012 | RRHH | Módulos de RRHH | familias `hr*` en `odoo/addons/` | Gestión de personal según alcance | empleados, asistencia, ausencias | API `hr` + frontend `hr` | Pruebas por submódulo | probado | Núcleo RRHH implementado: empleados, asistencia y ausencias |
| PF-013 | Maestros | Catálogo de clientes | referencia funcional general en módulos `sale/account` | Clientes por empresa con unicidad de código y datos fiscales base | customers, company_id | API `masters/customers` | Pruebas API create/list + aislamiento | probado | Endpoints implementados y validados |
| PF-014 | Maestros | Catálogo de productos | referencia funcional general en módulos `product/sale/stock` | Productos por empresa con SKU único y precio base | products, company_id | API `masters/products` | Pruebas API create/list + validación precio | probado | Endpoints implementados y validados |
| PF-015 | Maestros | Catálogo de proveedores | referencia funcional general en módulos `purchase/account` | Proveedores por empresa con unicidad de código y datos fiscales base | suppliers, company_id | API `masters/suppliers` | Pruebas API create/list + aislamiento | probado | Endpoints implementados y validados |
| PF-016 | Maestros | Catálogo de impuestos base | referencia funcional general en módulos `account/sale/purchase` | Impuestos por empresa con tasa válida y tipo de impuesto controlado | tax_rates, company_id | API `masters/tax-rates` | Pruebas API create/list + validación tasa 0..100 | probado | Endpoints implementados y validados |

## Convención de estado

- `pendiente`: identificado, sin análisis detallado todavía.
- `analizado`: evidencia funcional ubicada.
- `migrado`: implementación nueva completada.
- `probado`: pruebas ejecutadas con éxito.
- `aceptado`: validado por negocio.
