# Línea base KPI/SLI (Etapa 1)

## 1. Objetivo

Definir métricas iniciales para comparar el ERP modernizado contra el sistema origen.

## 2. Estado actual de medición

- Ambiente legacy ejecutado para benchmark: **pendiente**
- Resultados de rendimiento medidos en origen: **pendiente**
- Resultados de UX medidos en origen: **pendiente**

> En esta primera iteración se define la estructura y método de medición. La captura numérica se completa al levantar entorno reproducible de benchmark.

## 3. KPIs objetivo (según requerimiento v3)

### 3.1 Rendimiento

- API p95 CRUD críticos <= 400 ms
- API p99 CRUD críticos <= 900 ms
- LCP pantallas críticas <= 2.5 s
- Reportes frecuentes p95 <= 3 s

### 3.2 Calidad

- Tasa de error funcional crítica < 1%
- Defectos críticos en release: 0
- Cobertura backend >= 75% (núcleo)
- Cobertura frontend >= 65% (núcleo)

### 3.3 Operación

- MTTR P1 < 60 min
- Correlation ID en requests API: 100%
- Alertas críticas sin dueño: 0

### 3.4 Seguridad

- Hallazgos críticos OWASP: 0
- Secretos en repositorio: 0
- Endpoints críticos sin autorización: 0

## 4. SLI/SLO iniciales

- SLO disponibilidad API inicial: 99.5% mensual
- RPO objetivo: <= 15 min
- RTO objetivo: <= 60 min
- Error budget mensual: pendiente de formalización operativa

## 5. Plan de obtención de baseline (próxima iteración)

1. Definir dataset de prueba por dominio (ventas, compras, inventario, facturación).
2. Ejecutar flujos críticos en legacy y medir:
   - latencia por operación;
   - tiempo total por tarea;
   - tasa de error.
3. Registrar resultados en tabla comparativa legacy vs nuevo ERP.
