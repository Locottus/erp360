# Evaluación de ERP360 Modernizado frente a ERP360LIGHT

Fecha de corte: 25 de noviembre de 2026.

## 1. Resumen ejecutivo

ERP360 Modernizado está **sustancialmente más avanzado** que ERP360LIGHT como
aplicación ejecutable. Light no contiene un servidor ni pruebas HTTP; reúne
evidencia parcial de 14 áreas y 18 pantallas, reglas propias pendientes y ocho
OpenAPI propuestos. Modernizado sí dispone de API NestJS, frontend Angular,
migraciones PostgreSQL, pruebas unitarias/e2e y flujos operativos amplios.

El estado correcto es **ERP en ejecución técnica con cobertura funcional amplia,
no producto certificado ni listo para operación comercial plena**. No debe
presentarse como paridad completa con Claro ni Odoo. Los contratos de Light son
una referencia para comparar capacidades y controles, no una base para
reemplazar automáticamente rutas o comportamiento existentes.

## 2. Evidencia y límites de ERP360LIGHT

La carpeta `ERP360LIGHT/docs/rea` aporta:

- observación autorizada de 14 áreas de menú y estructura parcial de 18 pantallas;
- propuestas funcionales propias, estados, reglas y criterios de prueba;
- ocho OpenAPI con 103 operaciones propuestas;
- 125 casos estructurales sintéticos de solicitudes y respuestas;
- bloqueos explícitos para emisión fiscal, nómina real y respaldos remotos.

No aporta:

- pruebas de permisos o transacciones;
- comportamiento comprobado de altas o cálculos;
- contratos privados del sistema original;
- certificación fiscal, contable, laboral o de seguridad;
- una demostración de paridad completa.

## 3. Estado actual de Modernizado

### Implementado y verificable

- Identidad, empresas, roles, revocación de sesiones, MFA TOTP y auditoría.
- Catálogos de clientes, productos, proveedores e impuestos.
- Ventas: cotización, pedido, factura, crédito, reembolso y validación de vigencia.
- Compras: solicitud, aprobación independiente, orden, recepción parcial,
  devolución, plan de entrega y reprogramación auditada.
- Inventario: almacenes, movimientos, reservas, despacho, ajustes, transferencias,
  conteo, costo promedio/FIFO y trazabilidad.
- Contabilidad: posteo, pagos, COGS, conciliación de bancos, importación de
  extractos, libro mayor, balance y cierre/reapertura.
- Portal, eCommerce, suscripciones, consola SaaS y servicio de asistencia.
- RRHH base: personas, asistencia, ausencias y vínculo con usuarios.
- Fiscal regional en sandbox; producción rechazada mientras no exista proveedor
  homologado.
- Frontend responsive, modo claro/oscuro, navegación por áreas y estados de carga,
  vacío y error.

### Verificación reproducida en esta evaluación

- 38 migraciones aplicadas desde cero en PostgreSQL 16 aislado: 93 tablas.
- Segunda ejecución del migrador: idempotente.
- API: 19 suites unitarias, 49 pruebas; build correcto.
- Frontend: 103 pruebas; build correcto.
- E2E: 21 suites y 118 pruebas contra una base aislada, incluida revocación
  efectiva con el mismo JWT.
- Compose construyó API y frontend; smoke test con 200 en API, proxy Nginx y HTML.
- `npm audit --omit=dev`: 0 vulnerabilidades conocidas en API y frontend.

## 4. Matriz de cobertura frente a Light

| Área propuesta por Light | Estado en Modernizado | Evaluación |
|---|---|---|
| Identidad, empresa y sesión | Implementado con JWT Bearer en `sessionStorage` | Decisión aprobada para continuar: conservar JWT en `sessionStorage`. Mantener revocación server-side, expiración, rotación y controles XSS/CSP. |
| Artículos | Implementado como productos con SKU, precio y catálogos | Cobertura superior; no existe compatibilidad nominal con `/articles`. No renombrar sin consumidor aprobado. |
| Almacenes y existencias | Implementado | Cobertura superior, incluidos reservas, transferencias y política de costo. |
| Movimientos y documentos | Implementado | Flujos propios más amplios; las claves de idempotencia deben verificarse módulo por módulo antes de adoptar el contrato Light. |
| Clientes y proveedores | Implementados como catálogos separados | Cubre el dominio, aunque no el recurso unificado `partners` propuesto por Light. |
| Compras y cuentas por pagar | Implementado y extendido | Incluye recepción parcial, aprobación, pagos, devoluciones y plan de entrega. |
| Ventas y cuentas por cobrar | Implementado y extendido | Incluye cotización, pedido, factura, cobros, crédito y devolución. |
| Contabilidad y finanzas | Implementado | Mayor alcance que el contrato de ensayo de Light; reportes siguen operativos/no certificados. |
| Bancos | Implementado | Extracto, deduplicación, estados, conciliación y vínculo a pagos. Falta automatización y homologación operativa final. |
| Caja chica | No se identificó módulo equivalente completo | Brecha frente a Light. Debe priorizarse según uso real y separar fondos, desembolso, reposición y autorización. |
| Activos fijos | No se identificó módulo operativo completo | Brecha frente a Light. Requiere método, política contable y validación antes de contabilizar. |
| E-NCF / fiscal | Sandbox regional y trazabilidad | Alineado con el bloqueo de Light; no habilitar producción sin certificación. |
| RRHH | Núcleo de empleados, asistencia y ausencias | Cubre expedientes básicos; nómina real permanece bloqueada. |
| Alertas | Parcial | Faltan contratos y motor de alertas con origen, destinatario, estado y errores de evaluación. |
| Roles y seguridad administrativa | Implementado parcialmente con roles actuales | Falta modelo granular de permisos por acción comparable al de Light; no asumir equivalencia por nombre de rol. |
| Respaldo/restauración | Scripts y pruebas aisladas disponibles | Falta automatización controlada, cifrado, retención, RPO/RTO y restauración periódica operativa. |

## 5. Hallazgos prioritarios

### P0 — antes de ampliar alcance

1. **Mantener bloqueados fiscal real, nómina real, pagos externos y
   restauraciones sobre datos reales.** Validación externa y aprobación competente.
2. **Conservar la arquitectura de sesión vigente.** Mantener JWT Bearer en
   `sessionStorage`, revocación por `session_version`, expiración de ocho horas,
   rotación de claves y límites de configuración. No introducir cookies o CSRF
   en esta iteración. El riesgo XSS continúa mitigándose con autorización en
   servidor, CSP, sanitización Angular y minimización de datos.
3. **No ejecutar migraciones contra bases existentes sin ledger verificado.**
   El script endurecido falla ante un esquema legacy sin historial, y compara el
   SHA-256 de migraciones aplicadas.
4. **Configurar secretos de producción.** JWT fuerte, claves MFA/IA y webhooks
   deben provenir de un gestor externo. El fallback conocido se rechaza en
   producción; todos los secretos deben tener al menos 32 caracteres.
5. **Proteger respaldos y automatizar restauraciones de prueba.** Los archivos
   no están cifrados por los scripts actuales.

### P1 — siguientes cambios recomendados

1. Implementar caja chica con permisos, saldo proyectado, idempotencia,
   movimientos autorizados y auditoría.
2. Implementar activos fijos únicamente con política contable aprobada,
   depreciación de ensayo y asientos separados/revisables.
3. Añadir permisos granulares por empresa y acción, con RBAC compatible con los
   roles existentes. Seguir el estándar de menor privilegio, denegación por
   defecto, separación de lectura/escritura/confirmación/administración y
   auditoría de cambios de privilegio.
4. Completar alertas basadas en datos sintéticos, distinguiendo error de ausencia.
5. Reducir progresivamente la deuda de lint. La configuración actual informa
   errores masivos de formato y tipo; no ejecutar un `--fix` global sin revisión.
6. CI automatizado: **pendiente por decisión explícita**. Cuando se habilite,
   ejecutará pruebas e2e completas con una base PostgreSQL vacía y migrada.
7. Añadir pruebas contractuales solo para consumidores o capacidades que
   realmente necesiten rutas compatibles con Light.

### P2 — endurecimiento y operación

1. Rate limit distribuido, inventario de proxies y configuración confiable de IP.
2. Métricas, trazas, alertas de fallo y registro de migraciones/respaldos.
3. Políticas de retención, privacidad y separación de datos por país.
4. Pruebas de recuperación con RPO/RTO medibles.
5. Homologación de flujos legales, fiscales, contables y laborales.

## 6. Plan de implementación

| Fase | Resultado verificable | Dependencias |
|---|---|---|
| 0. Línea base | Builds, pruebas, migraciones desde cero, Docker y matriz de brechas | Completada en esta evaluación |
| 1. Seguridad | Secretos fuertes, JWT Bearer aprobado y permisos RBAC granulares | Aprobación completada |
| 2. Paridad esencial | Caja chica, activos, alertas y contratos faltantes | Fase 1 |
| 3. Integridad operativa | Lint incremental, backup/restore periódicos y métricas; CI queda pendiente | Fases 0–1 |
| 4. Compatibilidad | Adaptadores o rutas para consumidores aprobados de Light; sin reemplazar API existente por defecto | Inventario real de clientes/integraciones |
| 5. Homologación | Fiscal, pagos, nómina y estados certificados por especialistas | Proveedor, normativa y ambiente de prueba |
| 6. Producción | HTTPS, proxy, observabilidad, RPO/RTO, privacidad y aceptación de negocio | Fases 1–5 |

### Estándar para permisos granulares

Implementar permisos como combinación de **recurso + acción** (`sales.read`,
`sales.create`, `sales.confirm`, `accounting.close`, etc.), agrupados por roles
compatibles. Las decisiones de autorización se calculan siempre en el servidor
para la empresa activa:

- denegación por defecto;
- `admin` conserva compatibilidad, sin convertir la interfaz en la barrera de
  seguridad;
- permisos separados para leer, crear, editar, confirmar, revertir y administrar;
- asignación de permisos auditable por empresa;
- revocación efectiva en la siguiente solicitud;
- ningún permiso se infiere del JWT sin consultar pertenencias y estado actuales;
- migración inicial que mapea los cuatro roles vigentes a permisos explícitos;
- pruebas directas para rol insuficiente, recurso de otra empresa y revocación.

El primer incremento aprobado es la fundación RBAC; su persistencia, guard
reutilizable, mapeo de endpoints existentes y pruebas preceden a caja chica o
activos.

**Estado 25 de noviembre:** la fundación está implementada en la migración
`0038_granular_permissions.sql`, con 38 permisos, resolución viva por usuario
y empresa, compatibilidad con `@Roles` y precedencia de `@Permissions` en
identidad, empresa, maestros, comercio, inventario, contabilidad, fiscal,
portal, RRHH y eCommerce. Quedan pendientes los overrides administrables por
empresa, su UI auditada y los endpoints aún basados únicamente en roles o
controles internos.

## 7. Mejoras aplicadas durante la evaluación

- Corregida la incompatibilidad de `migrate.ps1` con Windows PowerShell 5.
- El migrador crea ledger solo en bases vacías, rechaza esquemas existentes sin
  ledger, falla si cambia el hash y respalda la base objetivo indicada.
- JWT de producción rechaza secretos débiles, el secreto de desarrollo conocido
  y `kid` duplicados; se añadieron pruebas específicas.
- Perfiles Docker opcionales para API y frontend, dejando `db` como flujo
  predeterminado. El frontend sirve `/api` mediante Nginx hacia la API.
- Se actualizaron fixtures e2e que no inicializaban las cuentas 1200/5100 antes
  del despacho y una expectativa SaaS obsoleta.
- La fundación RBAC resolvió permisos desde PostgreSQL en cada petición,
  conservando JWT sin lista congelada de privilegios.
- Se mantuvieron los bloqueos de emisión fiscal, pagos, nómina y otras
  operaciones externas.

## 8. Criterio de cierre

El proyecto puede declararse listo para la siguiente iteración cuando las
pruebas completas pasen desde una base vacía, los contenedores construyan y
responda el proxy, las migraciones conserven su hash y todos los hallazgos P0
tengan dueño y criterio de aceptación. “Listo para producción” requiere además
completar la fase de homologación, recuperación y seguridad.
