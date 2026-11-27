import { Routes } from '@angular/router';
import { permissionGuard } from './core/permission.guard';

export const routes: Routes = [
  { path: '', title: 'Inicio · ERP360', loadComponent: () => import('./home.component').then(m => m.HomeComponent) },
  { path: 'login', title: 'Acceso · ERP360', loadComponent: () => import('./auth-console.component').then(m => m.AuthConsoleComponent) },
  { path: 'users', title: 'Usuarios · ERP360', canActivate: [permissionGuard], data: { permissions: ['identity.users.read'] }, loadComponent: () => import('./users.component').then(m => m.UsersComponent) },
  { path: 'company', title: 'Mi empresa · ERP360', canActivate: [permissionGuard], data: { permissions: ['company.read'] }, loadComponent: () => import('./company.component').then(m => m.CompanyComponent) },
  { path: 'accounting', title: 'Contabilidad · ERP360', canActivate: [permissionGuard], data: { permissions: ['accounting.read'] }, loadComponent: () => import('./accounting.component').then(m => m.AccountingComponent) },
  { path: 'petty-cash', title: 'Caja chica · ERP360', canActivate: [permissionGuard], data: { permissions: ['petty_cash.read'] }, loadComponent: () => import('./petty-cash.component').then(m => m.PettyCashComponent) },
  { path: 'fixed-assets', title: 'Activos fijos · ERP360', canActivate: [permissionGuard], data: { permissions: ['fixed_assets.read'] }, loadComponent: () => import('./fixed-assets.component').then(m => m.FixedAssetsComponent) },
  { path: 'catalogs', title: 'Catálogos · ERP360', canActivate: [permissionGuard], data: { permissions: ['masters.customers.read', 'masters.products.read', 'masters.suppliers.read', 'masters.tax-rates.read'] }, loadComponent: () => import('./catalogs.component').then(m => m.CatalogsComponent) },
  { path: 'controls', title: 'Control operativo · ERP360', canActivate: [permissionGuard], data: { permissions: ['inventory.write', 'inventory.confirm'] }, loadComponent: () => import('./operational-controls.component').then(m => m.OperationalControlsComponent) },
  { path: 'receiving', title: 'Recepciones y devoluciones · ERP360', canActivate: [permissionGuard], data: { permissions: ['purchases.confirm', 'purchases.read'] }, loadComponent: () => import('./purchase-receiving.component').then(m => m.PurchaseReceivingComponent) },
  { path: 'people', title: 'Personas · ERP360', canActivate: [permissionGuard], data: { permissions: ['hr.read', 'hr.manage'] }, loadComponent: () => import('./people.component').then(m => m.PeopleComponent) },
  { path: 'workspace', title: 'Dashboard · ERP360', canActivate: [permissionGuard], data: { permissions: ['inventory.read', 'sales.read', 'purchases.read'] }, loadComponent: () => import('./workspace.component').then(m => m.WorkspaceComponent) },
  { path: 'store', title: 'Tienda · ERP360', loadComponent: () => import('./ecommerce-storefront.component').then(m => m.EcommerceStorefrontComponent) },
  { path: 'shop/:storeSlug', title: 'Tienda online · ERP360', loadComponent: () => import('./ecommerce-storefront.component').then(m => m.EcommerceStorefrontComponent) },
  { path: 'ecommerce/admin', title: 'Diseñador de tienda · ERP360', canActivate: [permissionGuard], data: { permissions: ['ecommerce.manage'] }, loadComponent: () => import('./ecommerce-studio.component').then(m => m.EcommerceStudioComponent) },
  { path: 'portal', title: 'Portal · ERP360', canActivate: [permissionGuard], data: { permissions: ['portal.manage'] }, loadComponent: () => import('./portal-lookup.component').then(m => m.PortalLookupComponent) },
  { path: 'operations', title: 'Operaciones · ERP360', canActivate: [permissionGuard], data: { permissions: ['sales.read', 'purchases.read', 'inventory.read'] }, loadComponent: () => import('./operations.component').then(m => m.OperationsComponent) },
  { path: 'inventory', title: 'Inventario · ERP360', canActivate: [permissionGuard], data: { permissions: ['inventory.read'] }, loadComponent: () => import('./inventory.component').then(m => m.InventoryComponent) },
  { path: 'invoicing', title: 'Facturación · ERP360', canActivate: [permissionGuard], data: { permissions: ['sales.read', 'accounting.read'] }, loadComponent: () => import('./invoicing.component').then(m => m.InvoicingComponent) },
  { path: 'subscription', title: 'Mi suscripción · ERP360', loadComponent: () => import('./subscription.component').then(m => m.SubscriptionComponent) },
  { path: 'platform/billing', title: 'Administración SaaS · ERP360', loadComponent: () => import('./saas-billing.component').then(m => m.SaasBillingComponent) },
  { path: 'processes', title: 'Procesos · ERP360', loadComponent: () => import('./processes.component').then(m => m.ProcessesComponent) },
  { path: '**', redirectTo: '' },
];
