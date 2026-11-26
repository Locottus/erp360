# Punto de continuación — 25 de noviembre de 2026

## Base aprobada

- La fuente principal es `erp360-modernizado`; `ERP360LIGHT` solo complementa
  requisitos y criterios.
- Mantener JWT Bearer en `sessionStorage`.
- Permisos granulares RBAC aprobados según menor privilegio y denegación por
  defecto.
- CI sigue pendiente por decisión explícita.

## Trabajo terminado hoy

- Creada la migración `0038_granular_permissions.sql`.
- El esquema contiene `permissions` y `role_permissions`.
- Insertados 38 permisos de recurso/acción.
- Compatibilidad inicial para `admin`, `sales`, `purchases` y `employee`.
- `admin` recibe el permiso comodín `*`.
- Los permisos se consultan desde PostgreSQL en cada petición; no se congelan
  en el JWT.
- Añadidos `@Permissions(...)` y precedencia respecto de `@Roles`.
- Protegidos identidad, empresa, maestros, compras/ventas, inventario,
  contabilidad, fiscal, RRHH, portal y eCommerce.
- Separada la planificación de compras con
  `inventory.replenishment.read`.
- Añadida prueba de revocación: el mismo JWT pierde acceso en la petición
  siguiente al retirar sus roles.
- Actualizada la documentación principal, evaluación y pendientes.

## Incremento adicional completado

- Añadida la migración `0039_company_permission_overrides.sql`.
- La empresa dispone de revisión RBAC propia y overrides `grant`/`deny`.
- Denegar tiene prioridad sobre los permisos heredados de roles.
- `/auth/rbac` expone catálogo, roles, revisión y overrides vigentes.
- `PATCH /auth/rbac/overrides` exige revisión esperada y motivo, audita el cambio
  y aplica los overrides en cada petición siguiente.
- La pantalla de Usuarios muestra el catálogo y permite configurar overrides
  empresariales sin convertir la UI en control de seguridad.
- El bloqueo del último administrador efectivo sigue aplicado en la edición de usuarios.

## Validación adicional — 25 de noviembre de 2026

- API: 20 suites unitarias y 51/51 pruebas aprobadas.
- E2e de seguridad RBAC: 7/7 pruebas aprobadas sobre base PostgreSQL aislada.
- Cubiertos: otorgamiento, denegación, revisión obsoleta, revocación por rol,
  protección del último administrador y aislamiento por empresa.
- Migradas las comprobaciones internas del dashboard, asistente y RPC legado
  a permisos efectivos consultados por la API.

## Navegación efectiva — 25 de noviembre de 2026

- El login y `/auth/me` incluyen permisos efectivos en el contexto de sesión.
- Angular valida permisos en el guard de rutas y oculta enlaces sin permiso.
- La navegación distingue permisos granulares en operaciones, inventario,
  facturación, contabilidad, personas, catálogos y administración.
- Backend y guardias HTTP continúan siendo la autoridad; la UI no sustituye
  los controles de acceso.

## Validación final

- API: 19 suites unitarias, 49/49 pruebas.
- API e2e: 21 suites, 118/118 pruebas.
- Build NestJS correcto.
- Imagen Docker de API correcta.
- Prettier de los archivos modificados correcto.
- Migración aislada completa: 39 migraciones y 38 permisos.
- Base temporal `erp360_rbac_20261125` eliminada.
- PostgreSQL `erp360-db` permanece saludable.

## Siguiente incremento

Completar la administración RBAC:

1. Diseñar overrides de permisos por empresa sin cambiar los defaults globales.
2. Crear endpoints auditados para consultar y modificar asignaciones.
3. Exigir `expectedRevision` y motivo para cambios.
4. Impedir que la empresa pierda su último administrador efectivo.
5. Añadir UI administrativa para roles y permisos efectivos.
6. Migrar los endpoints restantes que solo tienen `@Roles` o autorización
   interna.
7. Añadir pruebas de override, desautorización y último administrador.
8. Mantener la API y la UI compatibles durante la transición.

## Archivos clave del incremento

- `database/migrations/0038_granular_permissions.sql`
- `api/src/auth/permissions.decorator.ts`
- `api/src/auth/auth.guard.ts`
- `api/src/auth/auth.service.ts`
- `api/src/auth/auth.guard.spec.ts`
- `api/test/security-regression.e2e-spec.ts`
- `docs/ESTADO_PROYECTO.md`
- `docs/PENDIENTES_DESARROLLO.md`
- `docs/EVALUACION_ERP360LIGHT_20261125.md`

## Importante al retomar

No aplicar automáticamente la migración 0038 a una base existente sin respaldo
y revisión del `migration_ledger`. Antes de continuar, comprobar el esquema
activo, crear respaldo y ejecutar primero la migración sobre una copia aislada.

CI continúa pendiente; por ahora ejecutar manualmente:

```powershell
Set-Location C:\angular\erp360\erp360-modernizado
.\scripts\migrate.ps1 -Environment validation -Database <base_aislada>

Set-Location .\api
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```
