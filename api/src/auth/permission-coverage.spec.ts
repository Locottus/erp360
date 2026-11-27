import 'reflect-metadata';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccountingController } from '../accounting/accounting.controller';
import { AssistantController, AssistantOperatorController } from '../assistant/assistant.controller';
import { CommerceController } from '../commerce/commerce.controller';
import { CompaniesController } from '../companies/companies.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
import { EcommerceAdminController } from '../ecommerce/ecommerce.admin.controller';
import { FiscalController } from '../fiscal/fiscal.controller';
import { FixedAssetsController } from '../fixed-assets/fixed-assets.controller';
import { HrController } from '../hr/hr.controller';
import { InventoryController } from '../inventory/inventory.controller';
import { MastersController } from '../masters/masters.controller';
import { PettyCashController } from '../petty-cash/petty-cash.controller';
import { PortalAdminController } from '../portal/portal.admin.controller';
import { AuthGuard } from './auth.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';

const GUARDS_KEY = '__guards__';
const METHOD_KEY = 'method';

const protectedControllers = [
  AccountingController, AssistantController, AssistantOperatorController, CommerceController,
  CompaniesController, DashboardController, EcommerceAdminController, FiscalController,
  FixedAssetsController, HrController, InventoryController, MastersController,
  PettyCashController, PortalAdminController,
];

describe('permission coverage', () => {
  const migrations = readdirSync(join(__dirname, '../../../database/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(join(__dirname, '../../../database/migrations', file), 'utf8'))
    .join('\n');

  it.each(protectedControllers.map((controller) => [controller.name, controller] as const))(
    '%s only references permissions seeded by migrations',
    (_name, controller) => {
      const codes = new Set<string>(Reflect.getMetadata(PERMISSIONS_KEY, controller) ?? []);
      for (const key of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[key] as object;
        if (typeof handler === 'function') {
          for (const code of (Reflect.getMetadata(PERMISSIONS_KEY, handler) ?? []) as string[]) codes.add(code);
        }
      }
      const missing = [...codes].filter((code) => !migrations.includes(`('${code}',`));
      expect(missing).toEqual([]);
    },
  );

  it.each(protectedControllers.map((controller) => [controller.name, controller] as const))(
    '%s requires an explicit permission on every authenticated route',
    (_name, controller) => {
      const classGuards: unknown[] = Reflect.getMetadata(GUARDS_KEY, controller) ?? [];
      const uncovered: string[] = [];
      for (const key of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[key] as object;
        if (key === 'constructor' || typeof handler !== 'function' ||
            Reflect.getMetadata(METHOD_KEY, handler) === undefined) continue;
        const guards: unknown[] = [...classGuards, ...(Reflect.getMetadata(GUARDS_KEY, handler) ?? [])];
        if (!guards.includes(AuthGuard)) continue;
        const permissions: string[] | undefined =
          Reflect.getMetadata(PERMISSIONS_KEY, handler) ?? Reflect.getMetadata(PERMISSIONS_KEY, controller);
        if (!permissions?.length) uncovered.push(key);
      }
      expect(uncovered).toEqual([]);
    },
  );
});
