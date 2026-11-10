# Backlog ejecutable — Lote 1 (Auth, roles, empresas)

## Objetivo del lote

Habilitar acceso seguro inicial y base de multiempresa para módulos de negocio.

## Tareas

- [x] Crear esquema base `companies`, `roles`, `users`, `user_roles`, `audit_log`.
- [x] Implementar bootstrap de administrador inicial.
- [x] Implementar login con JWT.
- [x] Implementar endpoint autenticado `/auth/me`.
- [x] Implementar guardias por rol/recurso en endpoints de dominio.
- [x] Implementar auditoría automática de operaciones sensibles.
- [x] Implementar rotación/gestión de secretos de JWT por ambiente.
- [x] Pruebas automatizadas unitarias para auth/control de acceso.
- [x] Endurecer auditoría de operaciones de seguridad y acceso por recurso.

## Criterio de salida del lote

1. Autenticación funcional validada.
2. Control de acceso base por rol implementado.
3. Auditoría mínima operativa.
4. Pruebas de auth/control de acceso pasando en CI local.
