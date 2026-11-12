# Pendientes de implementación P0 (ERP360)

## Estado de avance actual
- **P0-06 (multimoneda):** base operativa implementada en empresa, tasas y pagos contables (cliente/proveedor) con monto documental + monto base.
- **P0-02 (valoración/costo):** base preliminar implementada con reporte `GET /inventory/reports/valuation-cogs` (promedio ponderado provisional).

## Pendientes inmediatos
1. **P0-02 · Costo de ventas definitivo**
   - Definir política oficial por empresa (FIFO o promedio) y versionarla.
   - Persistir costo unitario en cada `sale_dispatch` (no solo estimación por reporte).
   - Registrar asiento automático de COGS contra inventario en el momento definido por política.
   - Cubrir ajustes de inventario (`adjustment_in/out`) con costo explícito y trazabilidad.

2. **P0-03 · Créditos y retornos parciales**
   - Aplicar costo histórico del despacho original en devoluciones de cliente.
   - Integrar ajustes de costo en nota de crédito parcial y su asiento contable.
   - Homologar reglas para devoluciones parciales combinadas con pagos/reembolsos.

3. **P0-04 · Conciliación bancaria real**
   - Importación de extractos (archivo/API) y matching semiautomático.
   - Estados de conciliación por movimiento (pendiente, conciliado, diferencia).
   - Evidencia de conciliación y reversión controlada.

4. **P0-05 · Estados financieros**
   - Definir estructura final de estados (clasificación, periodos, comparativos).
   - Consolidar criterios de cierre y reapertura con validaciones de integridad.
   - Diferenciar reportes operativos vs reportes legales/certificados.

5. **Fiscal real y pagos reales**
   - Integración con proveedor fiscal productivo (más allá de sandbox).
   - Integración de cobro/pago real (pasarela/banco) y confirmación externa.
   - Trazabilidad de punta a punta: documento comercial → fiscal → pago → conciliación.

## Criterios de “listo” para cerrar P0-02
- Costo unitario persistido por salida de inventario.
- Asiento de COGS automático y balanceado.
- Pruebas e2e para compra → recepción → venta → despacho → COGS → devolución parcial.
- Reportes consistentes entre inventario, libro mayor y estado de resultados.
