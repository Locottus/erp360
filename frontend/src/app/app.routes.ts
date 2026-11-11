import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Inicio · ERP360', loadComponent: () => import('./home.component').then(m => m.HomeComponent) },
  { path: 'login', title: 'Acceso · ERP360', loadComponent: () => import('./auth-console.component').then(m => m.AuthConsoleComponent) },
  { path: 'workspace', title: 'Dashboard · ERP360', loadComponent: () => import('./workspace.component').then(m => m.WorkspaceComponent) },
  { path: 'store', title: 'Tienda · ERP360', loadComponent: () => import('./ecommerce-storefront.component').then(m => m.EcommerceStorefrontComponent) },
  { path: 'shop/:storeSlug', title: 'Tienda online · ERP360', loadComponent: () => import('./ecommerce-storefront.component').then(m => m.EcommerceStorefrontComponent) },
  { path: 'ecommerce/admin', title: 'Diseñador de tienda · ERP360', loadComponent: () => import('./ecommerce-studio.component').then(m => m.EcommerceStudioComponent) },
  { path: 'portal', title: 'Portal · ERP360', loadComponent: () => import('./portal-lookup.component').then(m => m.PortalLookupComponent) },
  { path: 'operations', title: 'Operaciones · ERP360', loadComponent: () => import('./operations.component').then(m => m.OperationsComponent) },
  { path: 'inventory', title: 'Inventario · ERP360', loadComponent: () => import('./inventory.component').then(m => m.InventoryComponent) },
  { path: 'invoicing', title: 'Facturación · ERP360', loadComponent: () => import('./invoicing.component').then(m => m.InvoicingComponent) },
  { path: 'processes', title: 'Procesos · ERP360', loadComponent: () => import('./processes.component').then(m => m.ProcessesComponent) },
  { path: '**', redirectTo: '' },
];
