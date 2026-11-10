# Estrategia de migraciones (fundación)

## Convención

- Migraciones SQL versionadas en `database/migrations/`.
- Formato sugerido: `NNNN_descripcion.sql`.
- Cada archivo debe ser idempotente cuando sea posible y seguro.

## Orden de ejecución

1. `0001_foundation.sql`
2. siguientes migraciones en orden ascendente

## Objetivo del esquema inicial

Proveer base para Lote 1:

- multiempresa básica,
- usuarios y roles,
- auditoría mínima.
