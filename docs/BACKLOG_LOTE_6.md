# Backlog ejecutable — Lote 6 (Facturación electrónica regional homologable)

## Objetivo del lote

Implementar base homologable de facturación electrónica para Guatemala, El Salvador y República Dominicana mediante adaptadores desacoplados por país.

## Tareas

- [x] Definir esquema SQL fiscal regional (`0007_fiscal_regional_core.sql`).
- [x] Implementar configuración por país/proveedor/ambiente (`sandbox|production`).
- [x] Implementar generación de documento fiscal desde factura de venta.
- [x] Implementar envío de documento a adaptador por país (GT/SV/DO).
- [x] Implementar bitácora de transmisiones y estado de documento fiscal.
- [x] Exponer endpoints de consulta/listado para trazabilidad de homologación.
- [x] Registrar auditoría de operaciones fiscales críticas.
- [x] Integrar validación e2e de configuración, creación y envío en sandbox.

## Criterio de salida del lote

1. Existe abstracción por país/proveedor sin acoplar core comercial.
2. Documento fiscal queda trazable por intentos y estado.
3. Flujo sandbox de homologación es verificable por API.
4. Preparado para sustituir adaptadores mock por conectores certificados.
