# Pendientes de implementación P0 (ERP360)

## Estado de avance actual
- **P0-06 (multimoneda):** base operativa implementada en empresa, tasas y pagos contables (cliente/proveedor) con monto documental + monto base.
- **P0-01 (despliegue de migraciones):** respaldada la base operativa y
  validadas las migraciones 0037–0039 sobre copia restaurada. Aplicadas y
  registradas en el ledger de `erp360`.
- **P0-02 (valoración/costo):** base de costo implementada con política de
  empresa, snapshots por despacho y asiento COGS balanceado. Falta completar
  lotes FIFO consumidos y pruebas contables masivas. Los ajustes manuales de
  salida consumen las capas y publican COGS balanceado una sola vez por movimiento.
  Los ajustes manuales de entrada conservan costo explícito y crean capa; no crean
  asiento automático adicional hasta aprobar una cuenta oficial de diferencias.
  Añadido reporte de
  integridad de snapshots, cantidades y lotes negativos.
- **P0-04 (bancos):** existe conciliación de líneas, vínculo a pago y diferencias
  auditadas e importación CSV. Añadido matching semiautomático por importe,
  referencia y contraparte. Añadida reversión controlada con motivo, auditoría
  y restauración del pago a `registered` cuando no queda otra línea vinculada.
  **P0-05 (estados financieros):** activos, pasivos, patrimonio, resultados y
  comparativo inmediato del resultado están disponibles como reporte operativo.
- **P0-03 (créditos y retornos parciales):** implementado. La devolución física
  repone existencias a las capas de costo del despacho original (costo histórico),
  admite devoluciones parciales por línea de nota de crédito, publica el asiento
  de reversión de costo de ventas y limita los reembolsos al saldo. Cubierto por
  e2e `operational-controls` y `accounting-completion`.
- **P0-05 (estados financieros):** además de los totales, el balance incluye
  detalle por cuenta (activo, pasivo, patrimonio) y comparativo al cierre del
  período anterior equivalente; el estado de resultados conserva su comparativo.
  Sigue siendo reporte operativo (`basis: operational_unreviewed`), no certificado;
  no incluye flujo de efectivo ni clasificación corriente/no corriente.
- **Identidad:** MFA TOTP implementado en API y campo de código en login.
  Alta, verificación y baja MFA disponibles visualmente en `/workspace`.
  Administradores pueden restablecer MFA desde Usuarios con revisión/motivo
  auditado y revocación de sesión. Falta recuperación autoservicio robusta.

## Pendientes inmediatos
1. **P0-02 · Costo de ventas definitivo**
   - Definir política oficial por empresa (FIFO o promedio) y versionarla.
   - Persistir costo unitario en cada `sale_dispatch` (no solo estimación por reporte).
   - Registrar asiento automático de COGS contra inventario en el momento definido por política.
   - Cubrir ajustes de inventario (`adjustment_in/out`) con costo explícito y trazabilidad.

2. **P0-03 · Créditos y retornos parciales** — cerrado (ver estado de avance).

3. **P0-04 · Conciliación bancaria real**
   - Importación de extractos (archivo/API) y matching semiautomático.
   - Estados de conciliación por movimiento (pendiente, conciliado, diferencia).
   - Evidencia de conciliación y reversión controlada.

4. **P0-05 · Estados financieros** (parcial: detalle y comparativo del balance hechos)
   - Falta clasificación corriente/no corriente y flujo de efectivo (requieren decisión del plan de cuentas).
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
