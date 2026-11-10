# Backlog ejecutable — Lote 7 (Portal, UX avanzada y endurecimiento)

## Objetivo del lote

Implementar portal de cliente con acceso seguro por token, mejoras de UX iniciales y endurecimiento operativo del API.

## Tareas

- [x] Definir esquema SQL de portal y optimizaciones de índices (`0008_portal_hardening_core.sql`).
- [x] Implementar emisión segura de tokens de portal (hash + expiración + revocación).
- [x] Implementar endpoint público de resumen de cliente por token.
- [x] Implementar endpoints administrativos de gestión de tokens.
- [x] Endurecer API con cabeceras de seguridad y CORS explícito.
- [x] Implementar rate limit para endpoints públicos del portal.
- [x] Publicar vista frontend para consulta de portal por token.
- [x] Integrar validación e2e de flujo completo de portal (crear, consumir, revocar).

## Criterio de salida del lote

1. Cliente accede solo a sus datos usando token temporal.
2. Tokens son revocables, expiran y no se almacenan en texto plano.
3. Endpoints públicos cuentan con control básico de abuso.
4. Existe interfaz frontend mínima para operación del portal.
