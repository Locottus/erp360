# Backlog ejecutable — Lote 2 (Catálogos maestros)

## Objetivo del lote

Implementar base multiempresa de catálogos maestros (clientes, proveedores, productos, impuestos) para soportar lotes comerciales.

## Tareas

- [x] Definir esquema SQL para clientes y productos (`0002_master_catalogs.sql`).
- [x] Implementar endpoints API multiempresa para clientes y productos.
- [x] Aplicar control de acceso por rol admin para creación.
- [x] Registrar auditoría de operaciones de lectura/creación.
- [x] Implementar catálogos de proveedores.
- [x] Implementar catálogos de impuestos base y reglas de validación.
- [x] Agregar pruebas de integración de catálogos contra PostgreSQL.

## Criterio de salida del lote

1. CRUD mínimo de catálogos núcleo operativo.
2. Aislamiento multiempresa verificado.
3. Auditoría de eventos de catálogo activa.
4. Pruebas automatizadas suficientes para regresión de catálogos.
