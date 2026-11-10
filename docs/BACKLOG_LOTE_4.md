# Backlog ejecutable — Lote 4 (Inventario y logística)

## Objetivo del lote

Implementar inventario operativo integrado con compras/ventas para soportar recepción, reserva, despacho y ajustes con trazabilidad.

## Tareas

- [x] Definir esquema SQL de inventario (`0005_inventory_core.sql`).
- [x] Implementar saldos de inventario por producto y ubicación (`on_hand`, `reserved`, `available`).
- [x] Implementar movimientos de inventario con referencia transaccional (compra/venta/ajustes).
- [x] Integrar recepción de compra con incremento de stock.
- [x] Integrar reserva de venta con validación de disponibilidad.
- [x] Integrar despacho de venta con reducción de stock y cierre de reserva.
- [x] Implementar ajuste manual de stock (entrada/salida) con validaciones.
- [x] Registrar auditoría de operaciones de inventario.
- [x] Agregar pruebas e2e de flujo inventario conectado a lotes 2 y 3.

## Criterio de salida del lote

1. Recepciones de compra impactan stock de forma consistente.
2. Reservas/Despachos de venta garantizan control de disponibilidad.
3. Movimientos y auditoría permiten trazabilidad operativa.
4. Pruebas automatizadas pasan en local con PostgreSQL.
