# Análisis del sistema original (Etapa 1)

## 1. Alcance analizado

- Ruta analizada (solo lectura): `C:\angular\erp360\odoo-20.0.post20261110`
- Tipo de sistema origen: **Odoo 20** (monolito ERP/CRM en Python con frontend web integrado).

## 2. Evidencia técnica principal

- Versión base detectada: `20.0.0` + sufijo `-20261110` en `odoo/release.py`.
- Rango runtime Python: `MIN_PY_VERSION=(3,12)` y `MAX_PY_VERSION=(3,14)` en `odoo/release.py`.
- Versión mínima PostgreSQL: `MIN_PG_VERSION=16` en `odoo/release.py`.
- Dependencia PostgreSQL en Python: `psycopg2` en `requirements.txt` y `setup.py`.
- Módulos ERP por addons en `odoo/addons/` con `__manifest__.py` por módulo.

## 3. Inventario cuantitativo (línea base de descubrimiento)

- Archivos totales: **55,291**
- Directorios totales: **9,349**
- Addons detectados: **701**
- Manifiestos `__manifest__.py`: **702**
- Archivos Python: **9,687**
- Archivos XML: **6,348**
- Archivos JavaScript: **6,847**
- Archivos de pruebas con patrón test: **2,151**
- Archivos Python bajo `models/` o `wizard/`: **4,109**
- Declaraciones `_name` detectadas (modelos): **4,604**

## 4. Arquitectura heredada identificada

### 4.1 Backend / dominio

- Núcleo en Python con ORM propio de Odoo (modelos declarativos, reglas y seguridad).
- Lógica funcional distribuida en módulos (`account`, `sale`, `stock`, `purchase`, `hr`, etc.).
- Jobs y automatizaciones por datos XML y cron (`ir_cron`, data files en manifiestos).

### 4.2 Capa HTTP/RPC

- Controladores HTTP/JSON-RPC y endpoints web en `addons/*/controllers/*.py`.
- Rutas de sesión y autenticación JSON-RPC en `odoo/addons/web/controllers/session.py`.
- RPC legado XML-RPC activo en `odoo/addons/rpc/controllers/xmlrpc.py`.

### 4.3 Frontend

- Frontend web integrado al monolito (assets JS/SCSS/XML por módulo en manifiestos).
- Gran presencia de assets en módulos funcionales (`sale`, `account`, `stock`, `website`, etc.).

### 4.4 Persistencia

- Persistencia relacional orientada a PostgreSQL (>=16).
- Uso predominante del ORM; presencia de SQL complementario en scripts/data puntuales.

## 5. Mapa funcional macro (por dominios)

Dominios de alto impacto detectados:

- Finanzas/contabilidad (`account*`, `payment*`)
- Ventas/comercial (`sale*`, `crm*`)
- Compras (`purchase*`)
- Inventario/logística (`stock*`, `mrp*`)
- RRHH (`hr*`)
- Portal/sitio/eCommerce (`website*`, `portal`)
- Localización fiscal (`l10n*`)

Conteos de familias relevantes:

- `payment*`: 24 módulos
- `l10n*`: 234 módulos
- `website*`: 52 módulos
- `hr*`: 24 módulos
- `stock*` + `mrp*`: 20 módulos
- `sale*`: 30 módulos
- `purchase*`: 11 módulos

## 6. Integraciones y puntos críticos

- Integración API heredada por XML-RPC/JSON-RPC (compatibilidad a evaluar en migración).
- Alta complejidad fiscal por localizaciones (`l10n*`) y reglas país.
- Alto volumen funcional: no viable migración “big bang”; requiere lotes por dominio.

## 7. Decisión técnica inicial para modernización

Se mantiene el plan objetivo del requerimiento v3:

1. Frontend Angular (TypeScript strict)
2. API Node.js/NestJS
3. PostgreSQL

Con enfoque de transición:

- **Primero paridad funcional por módulos críticos**.
- **Después optimización y expansión**.

## 8. Brechas y dudas abiertas (a resolver en siguientes iteraciones de Etapa 1)

1. Confirmar flujos críticos exactos por negocio para definir “top 5” de KPI funcional.
2. Definir primer subconjunto de módulos de salida MVP (auth, empresas, maestros, ventas/compras).
3. Confirmar política de multiempresa objetivo y alcance de localizaciones fiscales prioritarias.
4. Levantar estrategia de migración de datos (qué se migra en primera ola y qué se posterga).

## 9. Estado

- Etapa 1 iniciada.
- Diagnóstico técnico inicial completado con evidencia estática.
- Pendiente: ampliar matriz de paridad a nivel de subproceso por módulo.
