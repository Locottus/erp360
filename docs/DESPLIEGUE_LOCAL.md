# Despliegue local (Lote 0)

## Prerrequisitos

- Node.js 24.x
- npm 11+
- Docker Desktop

## 1) Variables de entorno

Copiar `.env.example` a `.env` y ajustar valores:

```powershell
Copy-Item .env.example .env
```

Para rotación de JWT por ambiente (recomendado en staging/prod), definir en `.env`:

```text
JWT_SECRETS_JSON=[{"kid":"2026-q4","secret":"secret-v1"},{"kid":"2027-q1","secret":"secret-v2"}]
JWT_ACTIVE_KID=2027-q1
```

El sistema firma con `JWT_ACTIVE_KID` y acepta verificación con claves anteriores del conjunto.

Parámetros recomendados de endurecimiento:

```text
CORS_ORIGIN=http://localhost:4200
PORTAL_RATE_LIMIT_PER_MINUTE=60
```

## 2) Levantar base de datos

Desde `C:\angular\erp360\erp360-modernizado`:

```powershell
docker compose up -d db
```

Verificar estado:

```powershell
docker compose ps
```

## 2.1) Aplicar migraciones

```powershell
Get-Content .\database\migrations\0001_foundation.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0002_master_catalogs.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0003_suppliers_tax_rates.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0004_commerce_core.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0005_inventory_core.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0006_accounting_core.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0007_fiscal_regional_core.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0008_portal_hardening_core.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0009_rpc_hr_core.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0010_ecommerce_core.sql | docker exec -i erp360-db psql -U erp360 -d erp360
Get-Content .\database\migrations\0011_ecommerce_subscriptions.sql | docker exec -i erp360-db psql -U erp360 -d erp360
```

## 3) Instalar dependencias

```powershell
cd frontend
npm install
cd ..\api
npm install
cd ..
```

## 4) Ejecutar API y frontend

API:

```powershell
cd api
$env:PORT=3000
npm run start:dev
```

Frontend (nueva terminal):

```powershell
cd frontend
npm start
```

## 5) Verificación mínima

- API health liveness: `http://localhost:3000/health/live`
- API health readiness: `http://localhost:3000/health/ready`
- Frontend: `http://localhost:4200`

## 5.1) Bootstrap de usuario administrador (API)

```powershell
$body = @{
  companyCode = "MAIN"
  companyName = "ERP360 Main Company"
  email = "admin@erp360.local"
  password = "ChangeMe123!"
  fullName = "ERP360 Admin"
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri "http://localhost:3000/auth/bootstrap-admin" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

Login:

```powershell
$login = @{
  email = "admin@erp360.local"
  password = "ChangeMe123!"
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri "http://localhost:3000/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $login
```

Prueba de endpoint protegido por rol admin:

```powershell
$token = (Invoke-WebRequest `
  -Uri "http://localhost:3000/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $login).Content | ConvertFrom-Json

Invoke-WebRequest `
  -Uri "http://localhost:3000/auth/admin-check" `
  -Headers @{ Authorization = "Bearer $($token.access_token)" }
```

Prueba de recurso multiempresa:

```powershell
# devuelve la compañía del usuario autenticado
Invoke-WebRequest `
  -Uri "http://localhost:3000/companies/current" `
  -Headers @{ Authorization = "Bearer $($token.access_token)" }
```

## 6) Apagar recursos

```powershell
docker compose down
```
