BEGIN;

-- Separacion de funciones: la baja y la reversa de depreciacion requieren permisos propios.
INSERT INTO permissions(code, resource, action, description)
VALUES
  ('fixed_assets.dispose', 'fixed_assets', 'dispose', 'Dar de baja activos fijos'),
  ('fixed_assets.reverse', 'fixed_assets', 'reverse', 'Revertir depreciacion contabilizada con contraasiento')
ON CONFLICT(code) DO UPDATE
SET resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    description = EXCLUDED.description;

-- Contabilidad registra y opera; aprobar, arquear, cerrar, dar de baja y revertir quedan para administracion (permiso '*').
INSERT INTO role_permissions(role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN (VALUES
  ('petty_cash.read'),
  ('petty_cash.disburse'),
  ('fixed_assets.read'),
  ('fixed_assets.manage'),
  ('fixed_assets.depreciate')
) AS p(code)
WHERE r.code = 'accountant'
ON CONFLICT DO NOTHING;

COMMIT;
