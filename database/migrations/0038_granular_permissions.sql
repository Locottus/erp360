BEGIN;

CREATE TABLE IF NOT EXISTS permissions (
  code VARCHAR(96) PRIMARY KEY,
  resource VARCHAR(48) NOT NULL,
  action VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(resource, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code VARCHAR(96) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(role_id, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission
  ON role_permissions(permission_code);

INSERT INTO roles(code, name, description)
VALUES ('admin', 'Administrator', 'Full access role')
ON CONFLICT(code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO permissions(code, resource, action, description)
VALUES
  ('*', 'all', 'all', 'Acceso administrativo completo de compatibilidad'),
  ('identity.users.read', 'identity', 'users.read', 'Consultar usuarios de la empresa'),
  ('identity.users.manage', 'identity', 'users.manage', 'Crear, editar y revocar usuarios'),
  ('identity.sessions.revoke', 'identity', 'sessions.revoke', 'Revocar sesiones'),
  ('company.read', 'company', 'read', 'Consultar la empresa actual'),
  ('company.update', 'company', 'update', 'Actualizar configuración empresarial'),
  ('masters.customers.read', 'masters.customers', 'read', 'Consultar clientes'),
  ('masters.customers.create', 'masters.customers', 'create', 'Crear clientes'),
  ('masters.products.read', 'masters.products', 'read', 'Consultar productos'),
  ('masters.products.create', 'masters.products', 'create', 'Crear productos'),
  ('masters.suppliers.read', 'masters.suppliers', 'read', 'Consultar proveedores'),
  ('masters.suppliers.create', 'masters.suppliers', 'create', 'Crear proveedores'),
  ('masters.tax-rates.read', 'masters.tax-rates', 'read', 'Consultar impuestos'),
  ('masters.tax-rates.create', 'masters.tax-rates', 'create', 'Crear impuestos'),
  ('masters.update', 'masters', 'update', 'Editar catálogos maestros'),
  ('masters.import', 'masters', 'import', 'Importar catálogos maestros'),
  ('sales.read', 'sales', 'read', 'Consultar documentos de venta'),
  ('sales.create', 'sales', 'create', 'Crear documentos de venta'),
  ('sales.confirm', 'sales', 'confirm', 'Confirmar, facturar o cancelar ventas'),
  ('purchases.read', 'purchases', 'read', 'Consultar documentos de compra'),
  ('purchases.create', 'purchases', 'create', 'Crear solicitudes de compra'),
  ('purchases.confirm', 'purchases', 'confirm', 'Aprobar, recibir o cancelar compras'),
  ('inventory.read', 'inventory', 'read', 'Consultar inventario'),
  ('inventory.replenishment.read', 'inventory', 'replenishment.read', 'Consultar reposición y planificación de compras'),
  ('inventory.write', 'inventory', 'write', 'Crear ajustes, conteos y traslados'),
  ('inventory.confirm', 'inventory', 'confirm', 'Reservar, recibir y despachar inventario'),
  ('accounting.read', 'accounting', 'read', 'Consultar contabilidad y reportes'),
  ('accounting.post', 'accounting', 'post', 'Registrar asientos y pagos'),
  ('accounting.reconcile', 'accounting', 'reconcile', 'Conciliar operaciones bancarias'),
  ('accounting.period.manage', 'accounting', 'period.manage', 'Cerrar y reabrir períodos'),
  ('fiscal.read', 'fiscal', 'read', 'Consultar documentos fiscales'),
  ('fiscal.manage', 'fiscal', 'manage', 'Configurar y transmitir documentos fiscales'),
  ('portal.manage', 'portal', 'manage', 'Administrar accesos del portal'),
  ('ecommerce.manage', 'ecommerce', 'manage', 'Administrar comercio electrónico'),
  ('hr.read', 'hr', 'read', 'Consultar expedientes, asistencia y ausencias'),
  ('hr.manage', 'hr', 'manage', 'Administrar personas y ausencias'),
  ('assistant.use', 'assistant', 'use', 'Usar diagnóstico y asistente'),
  ('assistant.manage', 'assistant', 'manage', 'Administrar proveedores y servicios IA')
ON CONFLICT(code) DO UPDATE
SET resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    description = EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code = '*'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_code)
SELECT r.id, p.code
FROM roles r
JOIN permissions p ON p.code IN (
  'masters.customers.read',
  'masters.products.read',
  'masters.tax-rates.read',
  'sales.read',
  'inventory.read'
)
WHERE r.code = 'sales'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_code)
SELECT r.id, p.code
FROM roles r
JOIN permissions p ON p.code IN (
  'masters.suppliers.read',
  'masters.products.read',
  'masters.tax-rates.read',
  'purchases.read',
  'inventory.read'
)
WHERE r.code = 'purchases'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_code)
SELECT r.id, p.code
FROM roles r
JOIN permissions p ON p.code IN (
  'company.read',
  'masters.products.read',
  'masters.tax-rates.read',
  'inventory.read',
  'assistant.use'
)
WHERE r.code = 'employee'
ON CONFLICT DO NOTHING;

COMMIT;
