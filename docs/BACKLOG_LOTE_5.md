# Backlog ejecutable — Lote 5 (Contabilidad y cierre)

## Objetivo del lote

Implementar base contable integrada con ventas, compras e inventario para posteo, conciliación básica y cierre de período.

## Tareas

- [x] Definir esquema SQL de contabilidad (`0006_accounting_core.sql`).
- [x] Implementar plan de cuentas base multiempresa (`bootstrap-accounts`).
- [x] Integrar posteo de factura de venta a diario contable.
- [x] Integrar registro de pago de factura con conciliación básica.
- [x] Integrar posteo de compra recibida (inventario + cuenta por pagar).
- [x] Implementar reporte de balance de comprobación (trial balance).
- [x] Implementar cierre de período con validación de asientos balanceados.
- [x] Registrar auditoría de eventos contables críticos.
- [x] Agregar validación e2e del flujo contable sobre PostgreSQL.

## Criterio de salida del lote

1. Documentos comerciales se reflejan en asientos contables.
2. Pagos afectan cuentas por cobrar y estado de factura.
3. Reporte de balance de comprobación disponible y balanceado.
4. Cierre de período funcional y trazable.
