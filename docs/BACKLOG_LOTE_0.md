# Backlog ejecutable — Lote 0 (Fundación técnica)

## Objetivo del lote

Levantar base técnica mínima (frontend + API + PostgreSQL + contenedores + observabilidad inicial) para comenzar migración funcional por módulos.

## Tareas

- [x] Crear workspace frontend Angular (strict, routing, SCSS).
- [x] Crear API NestJS con estructura modular base.
- [x] Definir esquema inicial PostgreSQL y estrategia de migraciones.
- [x] Configurar `docker-compose.yml` para entorno local reproducible.
- [x] Implementar health checks (`/health/live`, `/health/ready`) en API.
- [x] Implementar logging estructurado con `correlation_id`.
- [x] Crear `.env.example` con variables mínimas.
- [x] Configurar lint/test/build básicos en frontend y API (build validado).
- [x] Documentar comandos de arranque en `docs/DESPLIEGUE_LOCAL.md`.

## Criterio de salida del lote

- Frontend, API y DB levantan localmente en un solo flujo.
- API responde health checks.
- Logs estructurados activos en API.
- Documentación de ejecución local verificada.
