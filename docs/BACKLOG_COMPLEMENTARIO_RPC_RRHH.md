# Backlog complementario — PF-002 y PF-012

## Objetivo

Cerrar brechas funcionales históricas marcadas en matriz de paridad para RPC legado y núcleo RRHH.

## PF-002 RPC Compat

- [x] Implementar endpoint XML-RPC (`/rpc/xmlrpc`) con parser/serializer mínimo.
- [x] Implementar método `common.authenticate` para emisión de token.
- [x] Implementar método `object.execute_kw` para modelos prioritarios de transición.
- [x] Cubrir compatibilidad sobre `res.company`, `sale.order` y `hr.employee`.
- [x] Agregar prueba e2e de autenticación y lectura vía XML-RPC.

## PF-012 RRHH

- [x] Definir esquema SQL de RRHH (`0009_rpc_hr_core.sql`).
- [x] Implementar empleados (alta/listado).
- [x] Implementar asistencia (check-in/check-out con cálculo de minutos).
- [x] Implementar ausencias (solicitud + aprobación/rechazo).
- [x] Agregar pruebas e2e y unitarias de núcleo RRHH.

## Resultado

- PF-002 actualizado a `probado`.
- PF-012 actualizado a `probado`.
