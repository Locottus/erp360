import { Routes } from '@angular/router';
import { HomeComponent } from './home.component';
import { PortalLookupComponent } from './portal-lookup.component';
import { EcommerceStorefrontComponent } from './ecommerce-storefront.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'store', component: EcommerceStorefrontComponent },
  { path: 'portal', component: PortalLookupComponent },
];
