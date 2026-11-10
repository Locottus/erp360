# Plan de lotes de migración (propuesta inicial)

## Objetivo

Reducir riesgo y habilitar entregas verificables por dominio funcional, preservando paridad y trazabilidad.

## Lote 0 — Fundación técnica

- Estructura repositorio (frontend/api/database/infra/docs).
- Base de API (NestJS), frontend (Angular), DB (PostgreSQL), docker local.
- Observabilidad y seguridad base (logs con correlation_id, health checks, auth base).

**Salida:** plataforma ejecutable para migrar funcionalidad.

## Lote 1 — Seguridad y contexto de operación

- Usuarios, autenticación, roles/permisos.
- Empresas y contexto multiempresa mínimo.
- Auditoría base de operaciones sensibles.

**Dependencia:** lote 0.

## Lote 2 — Maestros y catálogo base

- Clientes, proveedores, productos, unidades, impuestos base.
- Reglas de validación y consistencia de catálogos.

**Dependencia:** lotes 0 y 1.

## Lote 3 — Ciclo comercial núcleo

- Ventas: cotización, pedido, facturación.
- Compras: solicitud/orden y recepción.

**Dependencia:** lotes 1 y 2.

## Lote 4 — Inventario y logística

- Movimientos, reservas, ajustes, trazabilidad por lote/serie según aplique.
- Integración de inventario con ventas/compras.

**Dependencia:** lote 3.

## Lote 5 — Contabilidad y cierre

- Asientos, conciliación, reportes financieros críticos.
- Integración de flujo comercial hacia contabilidad.

**Dependencia:** lotes 3 y 4.

## Lote 6 — Facturación electrónica regional (homologable)

- Adaptadores GT FEL / SV DTE / DO e-CF.
- Evidencias de certificación técnica y trazabilidad.

**Dependencia:** lotes 3 y 5.

## Lote 7 — Portal, UX avanzada y endurecimiento

- Portal cliente/proveedor prioritario.
- Optimización de rendimiento y accesibilidad.
- Pruebas de carga, seguridad y operación.

**Dependencia:** lotes anteriores según alcance.

## Criterio de cierre por lote

1. Implementación funcional completa del lote.
2. Pruebas unit/integration/E2E críticas pasando.
3. Matriz de paridad actualizada.
4. Riesgos residuales documentados.
5. KPI/SLI del lote reportados.
