# Riesgos y dependencias (Etapa 1)

## 1. Riesgos principales

## R1 — Alcance funcional masivo

- Evidencia: 701 addons y 702 manifiestos en origen.
- Riesgo: intentar migración total en bloque produce retrasos y defectos.
- Mitigación: migración por lotes funcionales con criterios de cierre por módulo.

## R2 — Complejidad fiscal/localizaciones

- Evidencia: 234 módulos `l10n*`.
- Riesgo: incumplimiento regulatorio o regresión fiscal.
- Mitigación: priorización por países objetivo y adapters fiscales versionados.

## R3 — Dependencias cruzadas entre dominios

- Evidencia: `sale` depende de `account_payment` y otros; `stock` depende de `product` y dominios asociados.
- Riesgo: bloqueos entre equipos/módulos.
- Mitigación: contratos API claros, eventos de dominio y lotes con secuencia explícita.

## R4 — Compatibilidad de integraciones externas

- Evidencia: presencia de capa RPC (`xmlrpc`) y múltiples módulos `payment*`.
- Riesgo: ruptura con integradores existentes en transición.
- Mitigación: estrategia de coexistencia temporal y pruebas de contrato.

## R5 — Riesgo de seguridad por migración

- Evidencia: sistema con múltiples entradas HTTP/RPC y reglas de acceso por módulo.
- Riesgo: brechas de autorización en nueva API.
- Mitigación: RBAC/ABAC desde inicio, pruebas de autorización y auditoría obligatoria.

## 2. Dependencias críticas de plataforma

- Python origen: 3.12–3.14 (legacy Odoo)
- PostgreSQL origen: >=16
- Dependencias de negocio críticas: account, sale, stock, purchase, users/roles

## 3. Dependencias de ejecución del proyecto modernizado

1. Definición de módulos MVP por negocio.
2. Definición de estrategia de migración de datos.
3. Definición de criterios de homologación fiscal (GT/SV/DO) por fase.
4. Entorno de pruebas reproducible para benchmark y regresión.

## 4. Riesgos de cronograma (prioridad)

- Alto: fiscal/localizaciones, contabilidad, inventario.
- Medio: portal/eCommerce y módulos satélite.
- Bajo: mejoras UX no críticas (si no afectan flujo núcleo).
