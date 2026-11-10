# Backlog ejecutable — Lote 3 (Ventas y Compras núcleo)

## Objetivo del lote

Implementar flujo comercial mínimo multiempresa para ventas y compras con trazabilidad y estados de negocio.

## Tareas

- [x] Definir esquema SQL núcleo comercial (`0004_commerce_core.sql`).
- [x] Implementar flujo de ventas: cotización → pedido → facturación.
- [x] Implementar flujo de compras: solicitud → orden → recepción.
- [x] Aplicar control de acceso por rol admin en transiciones de estado.
- [x] Registrar auditoría en operaciones comerciales sensibles.
- [x] Integrar cálculo de totales e impuestos base desde catálogo.
- [x] Agregar pruebas e2e para validar lotes 2 y 3 contra PostgreSQL.

## Criterio de salida del lote

1. Flujo mínimo de ventas operativo y probado.
2. Flujo mínimo de compras operativo y probado.
3. Trazabilidad por auditoría para eventos de negocio clave.
4. Pruebas automatizadas pasando con evidencia ejecutable local.
