import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AssistantContextService } from './core/assistant-context.service';

type Customer = { id: string; code: string; name: string; email: string | null; tax_id: string | null; is_active: boolean };
type Product = { id: string; sku: string; name: string; unit_price: string; description?: string; is_active: boolean };
type Supplier = { id: string; code: string; name: string; email: string | null; tax_id: string | null; is_active: boolean };
type TaxRate = { id: string; code: string; name: string; rate: string; tax_type: string; is_active: boolean };
type Quotation = { id: string; quotation_number: string; status: string; subtotal: string; grand_total: string; customer_id: string; valid_until: string | null; is_expired: boolean; revision: number };
type SalesOrder = { id: string; order_number: string; status: string; grand_total: string; customer_name: string };
type PurchaseRequest = {
  id: string; request_number: string; status: string; grand_total: string; supplier_id: string;
  supplier_name: string; purchase_order_id: string | null; purchase_order_number: string | null;
  purchase_order_status: string | null; inventory_received: boolean; is_posted: boolean;
  rejection_reason: string | null;
  approval_block_reason: 'self_approval' | 'unknown_creator' | null;
};
type PurchaseRequestDetails = {
  id: string; request_number: string; status: string; currency_code: string | null;
  supplier_name: string; subtotal: string; tax_total: string; grand_total: string;
  replenishment_location: string | null; replenishment_rule_revision: number | null; replenishment_reason: string | null;
  lines: Array<{ id: string; sku: string | null; product_name: string | null; quantity: string; unit_cost: string; line_total: string }>;
};
type Employee = { id: string; employee_code: string; full_name: string; email: string | null; job_title: string | null; status: string };
type Attendance = { id: string; employee_id: string; employee_code: string; full_name: string; check_in_at: string; check_out_at: string | null; status: string; total_minutes: number | null };
type LeaveRequest = { id: string; employee_id: string; employee_code: string; full_name: string; start_date: string; end_date: string; reason: string | null; status: string };
type Invoice = { id: string; invoice_number: string; status: string; sales_order_id: string; customer_name: string };
type FiscalDocument = { id: string; sales_invoice_id: string; country_code: string; control_number: string; status: string; external_uuid: string | null; updated_at: string };
type PortalToken = { id: string; customer_id: string; token_prefix: string; status: string; expires_at: string; last_used_at: string | null };
type TrialBalance = { rows: Array<{ account_code: string; account_name: string; debit: string; credit: string; balance: string }>; totals: { totalDebit: number; totalCredit: number; isBalanced: boolean } };
type CommerceLine = { productId: string; quantity: number; unitPrice: number | null };

@Component({
  selector: 'app-operations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page-shell">
      <header class="page-header">
        <p class="eyebrow">OPERACIÓN EMPRESARIAL</p>
        <h1>Centro de operaciones</h1>
        <p>Administra los procesos habilitados para la empresa de tu sesión. Las operaciones quedan auditadas por el ERP.</p>
      </header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      @if (issuedPortalToken) {
        <article class="surface-card token-notice" role="alert">
          <h2>Token de portal · se muestra una sola vez</h2>
          <code>{{ issuedPortalToken }}</code>
          <p>Entrégalo al cliente por un canal seguro y cópialo antes de cerrar esta página. El sistema solo conserva su hash.</p>
          <button type="button" class="btn btn-secondary" (click)="issuedPortalToken = ''">Ocultar token</button>
        </article>
      }
      @if (!isAdmin) {
        <p class="status status-error" role="alert">Este centro requiere una cuenta con rol administrador de la empresa.</p>
      } @else {
        <nav class="operations-nav" aria-label="Módulos de operación">
          @for (tab of tabs; track tab.id) {
            <button type="button" class="btn" [class.btn-primary]="activeTab === tab.id"
              [class.btn-secondary]="activeTab !== tab.id" (click)="activeTab = tab.id">{{ tab.label }}</button>
          }
        </nav>

        @if (activeTab === 'masters') {
          <a class="btn btn-secondary" routerLink="/catalogs">Editar, desactivar, importar o exportar catálogos</a>
          <div class="panel-grid">
            <article class="surface-card"><h2>Clientes</h2>
              <form class="form-grid" #customerForm="ngForm" (ngSubmit)="createMaster('customers', customer)">
                <label>Código<input name="customerCode" [(ngModel)]="customer.code" maxlength="64" required /></label>
                <label>Nombre<input name="customerName" [(ngModel)]="customer.name" maxlength="180" required /></label>
                <label>Correo<input name="customerEmail" type="email" email [(ngModel)]="customer.email" /></label>
                <label>Identificación fiscal<input name="customerTax" [(ngModel)]="customer.taxId" maxlength="64" /></label>
                <button class="btn btn-primary" type="submit" [disabled]="busy || customerForm.invalid">Crear cliente</button>
              </form>
            </article>
            <article class="surface-card"><h2>Productos</h2>
              <form class="form-grid" #productForm="ngForm" (ngSubmit)="createMaster('products', product)">
                <label>SKU<input name="sku" [(ngModel)]="product.sku" maxlength="64" required /></label>
                <label>Nombre<input name="productName" [(ngModel)]="product.name" maxlength="180" required /></label>
                <label>Descripción<input name="productDescription" [(ngModel)]="product.description" /></label>
                <label>Precio base<input name="unitPrice" type="number" min="0" step="0.0001" [(ngModel)]="product.unitPrice" required /></label>
                <button class="btn btn-primary" type="submit" [disabled]="busy || productForm.invalid">Crear producto</button>
              </form>
            </article>
            <article class="surface-card"><h2>Proveedores</h2>
              <form class="form-grid" #supplierForm="ngForm" (ngSubmit)="createMaster('suppliers', supplier)">
                <label>Código<input name="supplierCode" [(ngModel)]="supplier.code" maxlength="64" required /></label>
                <label>Nombre<input name="supplierName" [(ngModel)]="supplier.name" maxlength="180" required /></label>
                <label>Correo<input name="supplierEmail" type="email" email [(ngModel)]="supplier.email" /></label>
                <label>Identificación fiscal<input name="supplierTax" [(ngModel)]="supplier.taxId" maxlength="64" /></label>
                <button class="btn btn-primary" type="submit" [disabled]="busy || supplierForm.invalid">Crear proveedor</button>
              </form>
            </article>
            <article class="surface-card"><h2>Impuestos</h2>
              <form class="form-grid" #taxForm="ngForm" (ngSubmit)="createMaster('tax-rates', tax)">
                <label>Código<input name="taxCode" [(ngModel)]="tax.code" maxlength="32" required /></label>
                <label>Nombre<input name="taxName" [(ngModel)]="tax.name" maxlength="120" required /></label>
                <label>Porcentaje<input name="taxRate" type="number" min="0" max="100" step="0.0001" [(ngModel)]="tax.rate" required /></label>
                <label>Tipo<select name="taxType" [(ngModel)]="tax.taxType"><option value="vat">IVA</option><option value="withholding">Retención</option><option value="other">Otro</option></select></label>
                <button class="btn btn-primary" type="submit" [disabled]="busy || taxForm.invalid">Crear impuesto</button>
              </form>
            </article>
          </div>
          <article class="surface-card">
            <div class="header-with-action"><h2>Datos maestros de esta empresa</h2><button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="loading">Actualizar</button></div>
            <div class="panel-grid">
              <div><h3>Clientes · {{ customers.length }}</h3><div class="compact-list">@for (item of customers; track item.id) { <div><strong>{{ item.name }}</strong><span>{{ item.code }} · {{ item.email || 'Sin correo' }}</span></div> }</div></div>
              <div><h3>Productos · {{ products.length }}</h3><div class="compact-list">@for (item of products; track item.id) { <div><strong>{{ item.name }}</strong><span>{{ item.sku }} · {{ item.unit_price | number:'1.2-4' }}</span></div> }</div></div>
              <div><h3>Proveedores · {{ suppliers.length }}</h3><div class="compact-list">@for (item of suppliers; track item.id) { <div><strong>{{ item.name }}</strong><span>{{ item.code }}</span></div> }</div></div>
              <div><h3>Impuestos · {{ taxes.length }}</h3><div class="compact-list">@for (item of taxes; track item.id) { <div><strong>{{ item.name }}</strong><span>{{ item.code }} · {{ item.rate }}%</span></div> }</div></div>
            </div>
          </article>
        }

        @if (activeTab === 'sales') {
          <article class="surface-card">
            <h2>Nueva cotización de venta</h2>
            <form class="form-grid" #quotationForm="ngForm" (ngSubmit)="createQuotation()">
              <div class="toolbar-grid">
                <label>Número<input name="quotationNumber" [(ngModel)]="quotation.quotationNumber" maxlength="64" required /></label>
                <label>Cliente<select name="customerId" [(ngModel)]="quotation.customerId" required><option value="">Selecciona</option>@for (item of customers; track item.id) { <option [value]="item.id">{{ item.code }} · {{ item.name }}</option> }</select></label>
                <label>Impuesto<select name="quotationTax" [(ngModel)]="quotation.taxRateCode"><option value="">Sin impuesto</option>@for (item of taxes; track item.id) { <option [value]="item.code">{{ item.code }} · {{ item.rate }}%</option> }</select></label>
                <label>Válida hasta (UTC, opcional)<input name="quotationValidity" type="date" [(ngModel)]="quotation.validUntil" /></label>
              </div>
              <p>La vigencia incluye todo el día indicado en UTC. Sin fecha no caduca automáticamente. Revisa precios antes de renovar una oferta.</p>
              @for (line of salesLines; track $index; let i = $index) {
                <div class="toolbar-grid line-editor">
                  <label>Producto<select [name]="'sale-product-' + i" [(ngModel)]="line.productId" required><option value="">Selecciona</option>@for (item of products; track item.id) { <option [value]="item.id">{{ item.sku }} · {{ item.name }}</option> }</select></label>
                  <label>Cantidad<input [name]="'sale-qty-' + i" type="number" min="0.0001" step="0.0001" [(ngModel)]="line.quantity" required /></label>
                  <label>Precio unitario opcional<input [name]="'sale-price-' + i" type="number" min="0" step="0.0001" [(ngModel)]="line.unitPrice" /></label>
                  <button class="btn btn-secondary" type="button" (click)="removeLine(salesLines, i)" [disabled]="salesLines.length === 1">Quitar</button>
                </div>
              }
              <div class="quick-actions"><button class="btn btn-secondary" type="button" (click)="addLine(salesLines)">Agregar producto</button>
                <button class="btn btn-primary" type="submit" [disabled]="busy || quotationForm.invalid">Guardar cotización</button></div>
            </form>
          </article>
          <article class="surface-card"><div class="header-with-action"><h2>Cotizaciones y pedidos</h2><button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="loading">Actualizar</button></div>
            @if (quotations.length) { <div class="table-scroll"><table class="table-list"><caption>Cotizaciones de la empresa</caption>
              <thead><tr><th scope="col">Número</th><th scope="col">Estado</th><th scope="col">Vigencia UTC</th><th scope="col">Total</th><th scope="col">Acción</th></tr></thead>
              <tbody>@for (item of quotations; track item.id) { <tr><th scope="row">{{ item.quotation_number }}</th><td>{{ item.is_expired ? 'Vencida · requiere revisión' : item.status }}</td><td>{{ item.valid_until || 'Sin caducidad' }}</td><td>{{ item.grand_total | number:'1.2-4' }}</td><td>@if (item.status === 'draft' && !item.is_expired) { <div class="inline-action"><input [name]="'order-' + item.id" [(ngModel)]="orderNumbers[item.id]" aria-label="Número del pedido" placeholder="Número de pedido" /><button class="btn btn-secondary" type="button" (click)="confirmQuotation(item)" [disabled]="busy || !orderNumbers[item.id]">Confirmar</button></div> }</td></tr> }</tbody>
            </table></div> } @else { <p class="muted">Sin cotizaciones.</p> }
            <h3>Pedidos confirmados</h3>
            @if (salesOrders.length) { <div class="table-scroll"><table class="table-list"><caption>Pedidos de venta</caption><thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col">Estado</th><th scope="col">Total</th><th scope="col">Diagnóstico</th></tr></thead><tbody>@for (item of salesOrders; track item.id) { <tr><th scope="row">{{ item.order_number }}</th><td>{{ item.customer_name }}</td><td>{{ item.status }}</td><td>{{ item.grand_total | number:'1.2-4' }}</td><td><button class="btn btn-secondary" type="button" (click)="assistant.select({kind: 'sales-order', id: item.id, locationCode: 'MAIN'}, '/operations?tab=sales')">Analizar pedido en MAIN</button></td></tr> }</tbody></table></div> } @else { <p class="muted">Sin pedidos.</p> }
          </article>
          <article class="surface-card"><h2>Revisar vigencia de cotización</h2>
            <p>Solo borradores. Conserva precios y líneas; no recalcula importes ni cambia un pedido existente. Si cambió el precio, crea una nueva cotización.</p>
            <form class="form-grid" #validityForm="ngForm" (ngSubmit)="reviseValidity()">
              <label>Cotización a revisar<select name="validityQuotation" [(ngModel)]="validityQuotation" (ngModelChange)="prepareValidity()" required>
                <option [ngValue]="null">Selecciona</option>@for (item of draftQuotations; track item.id) {
                  <option [ngValue]="item">{{ item.quotation_number }} · {{ item.is_expired ? 'Vencida' : 'Borrador' }} · revisión {{ item.revision }}</option>
                }
              </select></label>
              <label><input name="validityUnlimited" type="checkbox" [(ngModel)]="validity.unlimited" /> Retirar fecha de caducidad</label>
              @if (!validity.unlimited) { <label>Nueva vigencia UTC<input name="newValidity" type="date" [(ngModel)]="validity.date" required /></label> }
              <label>Motivo de revisión de vigencia<input name="validityReason" [(ngModel)]="validity.reason" minlength="10" maxlength="1000" required /></label>
              <label><input name="validityReviewed" type="checkbox" [(ngModel)]="validity.reviewed" required /> Revisé precios y condiciones antes de cambiar la vigencia.</label>
              <button type="submit" class="btn btn-secondary" [disabled]="busy || validityBusy || validityForm.invalid">Guardar nueva vigencia</button>
            </form>
          </article>
        }

        @if (activeTab === 'purchases') {
          <article class="surface-card"><h2>Solicitud de compra</h2>
            <form class="form-grid" #purchaseForm="ngForm" (ngSubmit)="createPurchase()">
              <div class="toolbar-grid"><label>Número<input name="requestNumber" [(ngModel)]="purchase.requestNumber" required /></label>
                <label>Proveedor<select name="supplierId" [(ngModel)]="purchase.supplierId" required><option value="">Selecciona</option>@for (item of suppliers; track item.id) { <option [value]="item.id">{{ item.code }} · {{ item.name }}</option> }</select></label>
                <label>Impuesto<select name="purchaseTax" [(ngModel)]="purchase.taxRateCode"><option value="">Sin impuesto</option>@for (item of taxes; track item.id) { <option [value]="item.code">{{ item.code }} · {{ item.rate }}%</option> }</select></label>
              </div>
              @for (line of purchaseLines; track $index; let i = $index) {
                <div class="toolbar-grid line-editor"><label>Producto<select [name]="'purchase-product-' + i" [(ngModel)]="line.productId" required><option value="">Selecciona</option>@for (item of products; track item.id) { <option [value]="item.id">{{ item.sku }} · {{ item.name }}</option> }</select></label>
                  <label>Cantidad<input [name]="'purchase-qty-' + i" type="number" min="0.0001" step="0.0001" [(ngModel)]="line.quantity" required /></label>
                  <label>Costo unitario<input [name]="'purchase-cost-' + i" type="number" min="0" step="0.0001" [(ngModel)]="line.unitCost" /></label>
                  <button class="btn btn-secondary" type="button" (click)="removeLine(purchaseLines, i)" [disabled]="purchaseLines.length === 1">Quitar</button></div>
              }
              <div class="quick-actions"><button class="btn btn-secondary" type="button" (click)="addLine(purchaseLines)">Agregar producto</button><button class="btn btn-primary" type="submit" [disabled]="busy || purchaseForm.invalid">Crear solicitud</button></div>
            </form>
          </article>
          <article class="surface-card"><div class="header-with-action"><h2>Seguimiento de compras</h2><button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="loading || busy">Actualizar</button></div>
            @if (purchaseRequests.length) { <div class="table-scroll"><table class="table-list"><caption>Solicitudes, órdenes, recepción física y contabilidad</caption>
              <thead><tr><th scope="col">Solicitud / proveedor</th><th scope="col">Total</th><th scope="col">Estado solicitud</th><th scope="col">Orden</th><th scope="col">Acciones</th></tr></thead>
              <tbody>@for (item of purchaseRequests; track item.id) { <tr><th scope="row">{{ item.request_number }}<br><small>{{ item.supplier_name }}</small></th><td>{{ item.grand_total | number:'1.2-4' }}</td><td>{{ item.status }} @if (item.status === 'rejected' && item.rejection_reason) { <br><small>Motivo: {{ item.rejection_reason }}</small> }</td>
                <td>{{ item.purchase_order_number || '—' }}<br><small>{{ item.purchase_order_status || '' }}</small></td>
                <td><button class="btn btn-secondary" type="button" (click)="showPurchaseDetails(item)" [disabled]="busy || loading">Ver detalle de {{ item.request_number }}</button>
                  <button class="btn btn-secondary" type="button" (click)="assistant.select({kind: 'purchase-request', id: item.id}, '/operations?tab=purchases')">Analizar solicitud</button>
                  @if (!item.purchase_order_id && (item.status === 'draft' || item.status === 'submitted')) {
                    @if (item.approval_block_reason) {
                      <p class="muted">{{ purchaseApprovalMessage(item) }}</p>
                    } @else {
                      <div class="inline-action"><input [name]="'po-' + item.id" [(ngModel)]="orderNumbers[item.id]" aria-label="Número de orden de compra" placeholder="Orden de compra" /><button class="btn btn-secondary" type="button" (click)="approvePurchase(item)" [disabled]="busy || !orderNumbers[item.id]">Aprobar</button></div>
                    }
                    <label>Motivo de rechazo de {{ item.request_number }}<input [name]="'reject-' + item.id" [(ngModel)]="rejectionReasons[item.id]" minlength="10" maxlength="1000" [disabled]="busy" /></label>
                    <button class="btn btn-secondary" type="button" (click)="rejectPurchase(item)" [disabled]="busy || loading || (rejectionReasons[item.id] || '').trim().length < 10">Rechazar solicitud</button>
                  }
                  @else if (item.status === 'rejected') { <span>Solicitud rechazada; no genera orden.</span> }
                  @else if (item.purchase_order_status === 'ordered' || item.purchase_order_status === 'partially_received') { <a class="btn btn-secondary" routerLink="/receiving">Recibir por cantidades</a> }
                  @else if (item.purchase_order_status === 'received' && !item.inventory_received) { <div class="inline-action"><input [name]="'location-' + item.id" [(ngModel)]="locations[item.id]" aria-label="Ubicación de recepción" placeholder="MAIN" /><button class="btn btn-secondary" type="button" (click)="applyReceipt(item)" [disabled]="busy">Aplicar a inventario</button></div> }
                  @else if (item.purchase_order_status === 'received' && !item.is_posted) { <button class="btn btn-secondary" type="button" (click)="postPurchase(item)" [disabled]="busy">Contabilizar</button> }
                  @else { <span>Proceso completado</span> }</td></tr> }</tbody>
            </table></div> } @else { <p class="muted">Sin solicitudes de compra.</p> }
            @if (purchaseDetails) {
              <section aria-label="Detalle de solicitud de compra">
                <h3>Solicitud {{ purchaseDetails.request_number }} · {{ purchaseDetails.supplier_name }}</h3>
                <p>Estado al consultar: {{ purchaseDetails.status }}. Moneda: {{ purchaseDetails.currency_code || 'No registrada' }}.
                  Actualiza y vuelve a consultar antes de decidir; el estado puede cambiar.</p>
                @if (purchaseDetails.replenishment_location) {
                  <p>Origen: reposición {{ purchaseDetails.replenishment_location }}, revisión {{ purchaseDetails.replenishment_rule_revision }}.
                    Motivo: {{ purchaseDetails.replenishment_reason }}. La ubicación es informativa, no destino de la orden.</p>
                }
                @if (purchaseDetails.lines.length) {
                  <div class="table-scroll"><table class="table-list">
                    <thead><tr><th>Producto</th><th>Cantidad</th><th>Costo unitario</th><th>Importe</th></tr></thead>
                    <tbody>@for (line of purchaseDetails.lines; track line.id) {
                      <tr><th scope="row">{{ line.sku || 'Sin código' }} · {{ line.product_name || 'Producto no disponible' }}</th>
                        <td>{{ line.quantity }}</td><td>{{ line.unit_cost }}</td><td>{{ line.line_total }}</td></tr>
                    }</tbody>
                  </table></div>
                } @else { <p class="status status-error" role="alert">La solicitud no tiene líneas; revisa el documento antes de aprobar.</p> }
                <p>Subtotal {{ purchaseDetails.subtotal }} · Impuesto {{ purchaseDetails.tax_total }} · Total {{ purchaseDetails.grand_total }}</p>
              </section>
            }
            <p class="muted">Las recepciones nuevas por cantidades ingresan inventario en un solo paso. Contabiliza al completar la compra. Solo los documentos históricos conservan la aplicación física separada.</p>
          </article>
        }

        @if (activeTab === 'people') {
          <div class="panel-grid">
            <article class="surface-card"><h2>Alta de empleado</h2><form class="form-grid" #employeeForm="ngForm" (ngSubmit)="createEmployee()">
              <label>Código<input name="employeeCode" [(ngModel)]="employee.employeeCode" required /></label><label>Nombre<input name="fullName" [(ngModel)]="employee.fullName" required /></label>
              <label>Correo<input name="employeeEmail" type="email" email [(ngModel)]="employee.email" /></label><label>Puesto<input name="jobTitle" [(ngModel)]="employee.jobTitle" /></label>
              <label>Fecha de ingreso<input name="hireDate" type="date" [(ngModel)]="employee.hireDate" /></label>
              <button class="btn btn-primary" type="submit" [disabled]="busy || employeeForm.invalid">Crear empleado</button>
            </form></article>
            <article class="surface-card"><h2>Registrar asistencia</h2><form class="form-grid" #attendanceForm="ngForm" (ngSubmit)="checkIn()">
              <label>Empleado<select name="attendanceEmployee" [(ngModel)]="attendanceEmployeeId" required><option value="">Selecciona</option>@for (item of employees; track item.id) { <option [value]="item.id">{{ item.employee_code }} · {{ item.full_name }}</option> }</select></label>
              <button class="btn btn-primary" type="submit" [disabled]="busy || attendanceForm.invalid">Registrar entrada ahora</button>
            </form></article>
            <article class="surface-card"><h2>Solicitud de ausencia</h2><form class="form-grid" #leaveForm="ngForm" (ngSubmit)="createLeave()">
              <label>Empleado<select name="leaveEmployee" [(ngModel)]="leave.employeeId" required><option value="">Selecciona</option>@for (item of employees; track item.id) { <option [value]="item.id">{{ item.employee_code }} · {{ item.full_name }}</option> }</select></label>
              <label>Desde<input name="startDate" type="date" [(ngModel)]="leave.startDate" required /></label><label>Hasta<input name="endDate" type="date" [(ngModel)]="leave.endDate" required /></label>
              <label>Motivo<input name="reason" [(ngModel)]="leave.reason" /></label><button class="btn btn-primary" type="submit" [disabled]="busy || leaveForm.invalid">Solicitar ausencia</button>
            </form></article>
          </div>
          <article class="surface-card"><div class="header-with-action"><h2>Asistencia abierta</h2><button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="loading">Actualizar</button></div>
            @if (openAttendance.length) { <div class="table-scroll"><table class="table-list"><caption>Entradas pendientes de salida</caption><thead><tr><th scope="col">Empleado</th><th scope="col">Entrada</th><th scope="col">Acción</th></tr></thead><tbody>@for (item of openAttendance; track item.id) { <tr><th scope="row">{{ item.employee_code }} · {{ item.full_name }}</th><td>{{ item.check_in_at | date:'short' }}</td><td><button class="btn btn-secondary" type="button" (click)="checkOut(item)" [disabled]="busy">Registrar salida</button></td></tr> }</tbody></table></div> } @else { <p class="muted">Sin entradas abiertas.</p> }
          </article>
          <article class="surface-card"><h2>Solicitudes de ausencia</h2>
            @if (leaveRequests.length) { <div class="table-scroll"><table class="table-list"><caption>Solicitudes del tenant</caption><thead><tr><th scope="col">Empleado</th><th scope="col">Período</th><th scope="col">Motivo</th><th scope="col">Estado / acciones</th></tr></thead><tbody>@for (item of leaveRequests; track item.id) { <tr><th scope="row">{{ item.employee_code }} · {{ item.full_name }}</th><td>{{ item.start_date | date:'mediumDate' }}–{{ item.end_date | date:'mediumDate' }}</td><td>{{ item.reason || '—' }}</td><td>{{ item.status }} @if (item.status === 'requested') { <button class="btn btn-secondary" type="button" (click)="decideLeave(item, 'approve')" [disabled]="busy">Aprobar</button> <button class="btn btn-secondary" type="button" (click)="decideLeave(item, 'reject')" [disabled]="busy">Rechazar</button> }</td></tr> }</tbody></table></div> } @else { <p class="muted">Sin solicitudes.</p> }
            <p class="muted">RRHH no incluye cálculo de nómina, prestaciones ni reglas legales locales.</p>
          </article>
        }

        @if (activeTab === 'accounting') {
          <article class="surface-card"><div class="header-with-action"><div><h2>Plan contable base</h2><p>Inicializa las cuentas de sistema necesarias para postear documentos.</p></div><button class="btn btn-secondary" type="button" (click)="bootstrapAccounts()" [disabled]="busy">Inicializar cuentas</button></div>
            <div class="toolbar-grid"><label>Desde<input type="date" name="fromDate" [(ngModel)]="accounting.fromDate" /></label><label>Hasta<input type="date" name="toDate" [(ngModel)]="accounting.toDate" /></label>
              <button class="btn btn-primary" type="button" (click)="loadTrialBalance()" [disabled]="loading">Consultar balance de comprobación</button></div>
          </article>
          @if (trialBalance) { <article class="surface-card"><h2>Balance de comprobación</h2>
            <p [class.status-success]="trialBalance.totals.isBalanced" [class.status-error]="!trialBalance.totals.isBalanced">Débitos: {{ trialBalance.totals.totalDebit | number:'1.2-4' }} · Créditos: {{ trialBalance.totals.totalCredit | number:'1.2-4' }} · {{ trialBalance.totals.isBalanced ? 'Balanceado' : 'Descuadrado' }}</p>
            <div class="table-scroll"><table class="table-list"><caption>Sumas de asientos contabilizados</caption><thead><tr><th scope="col">Cuenta</th><th scope="col">Débito</th><th scope="col">Crédito</th><th scope="col">Saldo</th></tr></thead><tbody>@for (row of trialBalance.rows; track row.account_code) { <tr><th scope="row">{{ row.account_code }} · {{ row.account_name }}</th><td>{{ row.debit | number:'1.2-4' }}</td><td>{{ row.credit | number:'1.2-4' }}</td><td>{{ row.balance | number:'1.2-4' }}</td></tr> }</tbody></table></div>
          </article> }
          <article class="surface-card"><h2>Cierre de período</h2><p>Operación de control irreversible en el flujo actual. Coordina con el responsable contable y confirma el período antes de cerrar.</p>
            <form class="toolbar-grid" #closeForm="ngForm" (ngSubmit)="closePeriod()"><label>Año<input name="periodYear" type="number" min="2000" [(ngModel)]="accounting.year" required /></label>
              <label>Mes<select name="periodMonth" [(ngModel)]="accounting.month">@for (month of months; track month) { <option [ngValue]="month">{{ month }}</option> }</select></label>
              <button class="btn btn-secondary" type="submit" [disabled]="busy || closeForm.invalid || !trialBalance?.totals?.isBalanced">Cerrar período</button></form>
          </article>
        }

        @if (activeTab === 'fiscal') {
          <p class="status status-warning" role="note">Entorno sandbox/simulador. No hay proveedor certificado activo; no envíes documentos como comprobantes fiscales legales.</p>
          <div class="panel-grid">
            <article class="surface-card"><h2>Configurar adaptador de prueba</h2><form class="form-grid" #fiscalForm="ngForm" (ngSubmit)="saveFiscalConfig()">
              <label>País<select name="country" [(ngModel)]="fiscal.countryCode"><option value="GT">Guatemala</option><option value="SV">El Salvador</option><option value="DO">República Dominicana</option></select></label>
              <label>Proveedor sandbox<input name="provider" [(ngModel)]="fiscal.providerCode" required /></label>
              <label>Endpoint de prueba<input name="endpoint" type="url" [(ngModel)]="fiscal.endpointUrl" required /></label>
              <button class="btn btn-secondary" type="submit" [disabled]="busy || fiscalForm.invalid">Guardar configuración</button>
            </form></article>
            <article class="surface-card"><h2>Crear documento de prueba</h2><form class="form-grid" #fiscalDocForm="ngForm" (ngSubmit)="createFiscalDocument()">
              <label>Factura comercial<select name="invoiceId" [(ngModel)]="fiscal.invoiceId" required><option value="">Selecciona</option>@for (item of invoices; track item.id) { <option [value]="item.id">{{ item.invoice_number }} · {{ item.customer_name }} · {{ item.status }}</option> }</select></label>
              <label>País<select name="documentCountry" [(ngModel)]="fiscal.documentCountry"><option value="GT">GT</option><option value="SV">SV</option><option value="DO">DO</option></select></label>
              <button class="btn btn-primary" type="submit" [disabled]="busy || fiscalDocForm.invalid">Generar documento sandbox</button>
            </form></article>
          </div>
          <article class="surface-card"><div class="header-with-action"><h2>Documentos de prueba</h2><button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="loading">Actualizar</button></div>
            @if (fiscalDocuments.length) { <div class="table-scroll"><table class="table-list"><caption>Documentos y estado devuelto por adaptador sandbox</caption><thead><tr><th scope="col">Control</th><th scope="col">País</th><th scope="col">Estado</th><th scope="col">ID externo</th><th scope="col">Acción</th></tr></thead><tbody>@for (item of fiscalDocuments; track item.id) { <tr><th scope="row">{{ item.control_number }}</th><td>{{ item.country_code }}</td><td>{{ item.status }}</td><td>{{ item.external_uuid || '—' }}</td><td>@if (item.status === 'draft' || item.status === 'error') { <button class="btn btn-secondary" type="button" (click)="submitFiscalDocument(item)" [disabled]="busy">Enviar al simulador</button> }</td></tr> }</tbody></table></div> } @else { <p class="muted">Sin documentos.</p> }
          </article>
        }

        @if (activeTab === 'portal') {
          <div class="panel-grid">
            <article class="surface-card"><h2>Invitar a un cliente al portal</h2><form class="form-grid" #tokenForm="ngForm" (ngSubmit)="createPortalToken()">
              <label>Cliente<select name="portalCustomer" [(ngModel)]="portal.customerId" required><option value="">Selecciona</option>@for (item of customers; track item.id) { <option [value]="item.id">{{ item.code }} · {{ item.name }}</option> }</select></label>
              <label>Vigencia<input name="expiresInDays" type="number" min="1" max="365" [(ngModel)]="portal.expiresInDays" required /></label>
              <button class="btn btn-primary" type="submit" [disabled]="busy || tokenForm.invalid">Crear acceso temporal</button>
            </form></article>
            <article class="surface-card"><h2>Cómo acceder</h2><ol><li>Entrega el token al contacto del cliente mediante canal privado.</li><li>El cliente abre el portal e ingresa el token.</li><li>Puede consultar hasta 20 cotizaciones, pedidos y facturas recientes.</li><li>Revoca el acceso cuando termine o si se comparte por error.</li></ol><a class="btn btn-secondary" routerLink="/portal">Abrir consulta del cliente</a></article>
          </div>
          <article class="surface-card"><div class="header-with-action"><h2>Accesos temporales</h2><button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="loading">Actualizar</button></div>
            @if (portalTokens.length) { <div class="table-scroll"><table class="table-list"><caption>Tokens: la clave secreta no se puede recuperar desde esta lista</caption><thead><tr><th scope="col">Prefijo</th><th scope="col">Cliente</th><th scope="col">Estado</th><th scope="col">Vence</th><th scope="col">Último uso</th><th scope="col">Acción</th></tr></thead><tbody>@for (item of portalTokens; track item.id) { <tr><th scope="row">{{ item.token_prefix }}</th><td>{{ customerName(item.customer_id) }}</td><td>{{ item.status }}</td><td>{{ item.expires_at | date:'medium' }}</td><td>{{ item.last_used_at ? (item.last_used_at | date:'short') : 'No usado' }}</td><td>@if (item.status === 'active') { <button class="btn btn-secondary" type="button" (click)="revokeToken(item)" [disabled]="busy">Revocar</button> }</td></tr> }</tbody></table></div> } @else { <p class="muted">Sin tokens.</p> }
          </article>
        }

        @if (activeTab === 'overview') {
          <div class="panel-grid module-shortcuts">
            <a class="surface-card" routerLink="/users"><i class="bi bi-people" aria-hidden="true"></i><h2>Usuarios y permisos</h2><p>Invitaciones, cuentas, recuperación y revocación.</p></a>
            <a class="surface-card" routerLink="/catalogs"><i class="bi bi-collection" aria-hidden="true"></i><h2>Catálogos</h2><p>Edición, desactivación e intercambio de datos.</p></a>
            <a class="surface-card" routerLink="/inventory"><i class="bi bi-box-seam" aria-hidden="true"></i><h2>Inventario</h2><p>Saldos, kardex, reservas y despacho.</p></a>
            <a class="surface-card" routerLink="/invoicing"><i class="bi bi-receipt" aria-hidden="true"></i><h2>Facturación</h2><p>Emisión comercial, contabilización y pagos.</p></a>
            <a class="surface-card" routerLink="/ecommerce/admin"><i class="bi bi-shop-window" aria-hidden="true"></i><h2>Diseñador eCommerce</h2><p>Marca, portada, catálogo y audiencia.</p></a>
            <a class="surface-card" routerLink="/workspace"><i class="bi bi-speedometer2" aria-hidden="true"></i><h2>Dashboard</h2><p>Indicadores y actividad de empresa.</p></a>
          </div>
          <p class="muted">Áreas no disponibles en esta versión: gestión completa de usuarios/roles, nómina, conciliación bancaria, devoluciones, gestión fiscal certificada y pasarela de pago.</p>
        }
      }
    </section>
  `,
})
export class OperationsComponent implements OnInit {
  readonly assistant = inject(AssistantContextService);
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly api = API_BASE_URL;
  readonly tabs = [
    { id: 'overview', label: 'Resumen' }, { id: 'masters', label: 'Catálogos' },
    { id: 'sales', label: 'Ventas' }, { id: 'purchases', label: 'Compras' },
    { id: 'people', label: 'RRHH' }, { id: 'accounting', label: 'Contabilidad' },
    { id: 'fiscal', label: 'Fiscal' }, { id: 'portal', label: 'Portal cliente' },
  ];
  readonly months = Array.from({ length: 12 }, (_, index) => index + 1);
  activeTab = 'overview';
  customers: Customer[] = [];
  products: Product[] = [];
  suppliers: Supplier[] = [];
  taxes: TaxRate[] = [];
  quotations: Quotation[] = [];
  salesOrders: SalesOrder[] = [];
  purchaseRequests: PurchaseRequest[] = [];
  purchaseDetails: PurchaseRequestDetails | null = null;
  employees: Employee[] = [];
  attendance: Attendance[] = [];
  leaveRequests: LeaveRequest[] = [];
  invoices: Invoice[] = [];
  fiscalDocuments: FiscalDocument[] = [];
  portalTokens: PortalToken[] = [];
  trialBalance: TrialBalance | null = null;
  readonly orderNumbers: Record<string, string> = {};
  rejectionReasons: Record<string, string> = {};
  readonly receiptNumbers: Record<string, string> = {};
  readonly locations: Record<string, string> = {};
  issuedPortalToken = '';
  customer = { code: '', name: '', email: '', taxId: '' };
  product = { sku: '', name: '', description: '', unitPrice: 0 };
  supplier = { code: '', name: '', email: '', taxId: '' };
  tax = { code: '', name: '', rate: 0, taxType: 'vat' as 'vat' | 'withholding' | 'other' };
  quotation = { quotationNumber: '', customerId: '', taxRateCode: '', validUntil: '' };
  validityQuotation: Quotation | null = null;
  validityBusy = false;
  validity = { date: '', unlimited: false, reason: '', reviewed: false };
  get draftQuotations() { return this.quotations.filter(row => row.status === 'draft'); }
  prepareValidity() { this.validity = { date: this.validityQuotation?.valid_until ?? '', unlimited: false, reason: '', reviewed: false }; }
  salesLines: CommerceLine[] = [{ productId: '', quantity: 1, unitPrice: null }];
  purchase = { requestNumber: '', supplierId: '', taxRateCode: '' };
  purchaseLines: Array<{ productId: string; quantity: number; unitCost: number | null }> = [{ productId: '', quantity: 1, unitCost: null }];
  employee = { employeeCode: '', fullName: '', email: '', jobTitle: '', hireDate: '' };
  attendanceEmployeeId = '';
  leave = { employeeId: '', startDate: '', endDate: '', reason: '' };
  accounting = { fromDate: '', toDate: '', year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  fiscal = { countryCode: 'GT' as 'GT' | 'SV' | 'DO', providerCode: 'sandbox-demo', endpointUrl: 'https://sandbox.example.invalid/fiscal', invoiceId: '', documentCountry: 'GT' as 'GT' | 'SV' | 'DO' };
  portal = { customerId: '', expiresInDays: 30 };
  loading = false;
  busy = false;
  error = '';
  message = '';

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const tab = this.tabs.find(item => item.id === params.get('tab'));
      if (tab) this.activeTab = tab.id;
    });
    effect(() => {
      this.session.user();
      this.validityQuotation = null;
      this.prepareValidity();
      this.validityBusy = false;
      this.quotations = [];
      this.purchaseRequests = [];
      this.purchaseDetails = null;
      this.rejectionReasons = {};
      this.busy = false;
    });
  }

  ngOnInit() {
    if (this.isAdmin) void this.refresh();
  }

  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get openAttendance() { return this.attendance.filter(item => item.status === 'open'); }

  async refresh() {
    if (this.loading || !this.isAdmin) return;
    this.loading = true; this.error = ''; this.purchaseDetails = null;
    const identity = this.session.user();
    try {
      const [customers, products, suppliers, taxes, quotations, salesOrders, purchaseRequests,
        employees, attendance, leaveRequests, invoices, fiscalDocuments, portalTokens] = await Promise.all([
        this.get<Customer[]>('/masters/customers'), this.get<Product[]>('/masters/products'),
        this.get<Supplier[]>('/masters/suppliers'), this.get<TaxRate[]>('/masters/tax-rates'),
        this.get<Quotation[]>('/commerce/sales/quotations'), this.get<SalesOrder[]>('/commerce/sales/orders'),
        this.get<PurchaseRequest[]>('/commerce/purchases/requests'), this.get<Employee[]>('/hr/employees'),
        this.get<Attendance[]>('/hr/attendance?status=open'), this.get<LeaveRequest[]>('/hr/leave-requests'),
        this.get<Invoice[]>('/commerce/sales/invoices'), this.get<FiscalDocument[]>('/fiscal/documents'),
        this.get<PortalToken[]>('/portal/access-tokens'),
      ]);
      if (this.session.user() !== identity) return;
      this.customers = customers; this.products = products; this.suppliers = suppliers; this.taxes = taxes;
      this.quotations = quotations; this.salesOrders = salesOrders; this.purchaseRequests = purchaseRequests;
      this.employees = employees; this.attendance = attendance; this.leaveRequests = leaveRequests;
      this.invoices = invoices; this.fiscalDocuments = fiscalDocuments; this.portalTokens = portalTokens;
    } catch (error) {
      if (this.session.user() === identity) this.error = this.errorMessage(error, 'No se pudieron cargar los módulos de operación.');
    }
    finally { this.loading = false; }
  }

  addLine<T extends { productId: string }>(lines: T[]) {
    lines.push({ ...lines[0], productId: '' });
  }

  removeLine<T>(lines: T[], index: number) {
    if (lines.length > 1) lines.splice(index, 1);
  }

  async createMaster(kind: 'customers' | 'products' | 'suppliers' | 'tax-rates', input: Record<string, unknown>) {
    const payload = { ...input };
    if (kind === 'customers' || kind === 'suppliers') {
      payload['taxId'] = payload['taxId'] || undefined;
      payload['email'] = payload['email'] || undefined;
    }
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/masters/${kind}`, payload));
      if (kind === 'customers') this.customer = { code: '', name: '', email: '', taxId: '' };
      if (kind === 'products') this.product = { sku: '', name: '', description: '', unitPrice: 0 };
      if (kind === 'suppliers') this.supplier = { code: '', name: '', email: '', taxId: '' };
      if (kind === 'tax-rates') this.tax = { code: '', name: '', rate: 0, taxType: 'vat' };
      this.message = 'Registro creado.';
      await this.refresh();
    });
  }

  async createQuotation() {
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ id: string }>(`${this.api}/commerce/sales/quotations`, {
        ...this.quotation, taxRateCode: this.quotation.taxRateCode || undefined,
        validUntil: this.quotation.validUntil || undefined,
        lines: this.salesLines.map(line => ({ ...line, unitPrice: line.unitPrice ?? undefined })),
      }));
      this.orderNumbers[result.id] = this.autoNumber('SO');
      this.quotation = { quotationNumber: this.autoNumber('Q'), customerId: '', taxRateCode: '', validUntil: '' };
      this.salesLines = [{ productId: '', quantity: 1, unitPrice: null }];
      this.message = 'Cotización creada. Revísala antes de confirmarla.';
      await this.refresh();
    });
  }

  async confirmQuotation(item: Quotation) {
    if (item.is_expired) { this.error = 'La cotización venció. Revisa sus condiciones y vigencia antes de confirmar.'; return; }
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ orderNumber: string }>(
        `${this.api}/commerce/sales/quotations/${item.id}/confirm`, { orderNumber: this.orderNumbers[item.id].trim() },
      ));
      this.message = `Pedido ${result.orderNumber} confirmado.`;
      await this.refresh();
    });
  }

  async reviseValidity() {
    const quote = this.validityQuotation;
    if (!quote || !this.validity.reviewed || this.validity.reason.trim().length < 10 || (!this.validity.unlimited && !this.validity.date)) {
      this.error = 'Selecciona un borrador, revisa sus condiciones e indica vigencia y motivo.';
      return;
    }
    if (this.validityBusy || this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.validityBusy = true; this.error = ''; this.message = '';
    try {
      await firstValueFrom(this.http.patch(`${this.api}/commerce/sales/quotations/${quote.id}/validity`, {
        expectedRevision: quote.revision, validUntil: this.validity.unlimited ? null : this.validity.date,
        reason: this.validity.reason.trim(),
      }));
      if (this.session.user() !== identity) return;
      this.validityQuotation = null; this.prepareValidity();
      this.message = 'Vigencia actualizada con historial conservado. Los precios no cambiaron.';
      await this.refresh();
    } catch (error) {
      if (this.session.user() === identity) {
        this.error = error instanceof HttpErrorResponse && error.status === 409
          ? 'La cotización cambió o ya tiene esa vigencia. Actualiza y revisa su estado antes de continuar.'
          : this.errorMessage(error, 'No se pudo actualizar la vigencia.');
      }
    } finally { if (this.session.user() === identity) this.validityBusy = false; }
  }

  async createPurchase() {
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ id: string }>(`${this.api}/commerce/purchases/requests`, {
        ...this.purchase, taxRateCode: this.purchase.taxRateCode || undefined,
        lines: this.purchaseLines.map(line => ({ ...line, unitCost: line.unitCost ?? undefined })),
      }));
      this.orderNumbers[result.id] = this.autoNumber('PO');
      this.purchase = { requestNumber: this.autoNumber('PR'), supplierId: '', taxRateCode: '' };
      this.purchaseLines = [{ productId: '', quantity: 1, unitCost: null }];
      this.message = 'Solicitud de compra creada.';
      await this.refresh();
    });
  }

  async approvePurchase(item: PurchaseRequest) {
    if (item.approval_block_reason) {
      this.error = this.purchaseApprovalMessage(item);
      this.message = '';
      return;
    }
    const orderNumber = this.orderNumbers[item.id]?.trim();
    if (this.busy || this.loading || !this.isAdmin || !orderNumber) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = '';
    try {
      const result = await firstValueFrom(this.http.post<{ purchaseOrderId: string }>(
        `${this.api}/commerce/purchases/requests/${item.id}/approve`,
        { orderNumber },
      ));
      if (this.session.user() !== identity) return;
      if (!result.purchaseOrderId) throw new Error('Purchase order response is invalid.');
      this.receiptNumbers[item.id] = this.autoNumber('RCV');
      this.locations[item.id] = 'MAIN';
      await this.refresh();
      if (this.session.user() === identity && !this.error) this.message = `Orden ${orderNumber} creada.`;
    } catch (error) {
      if (this.session.user() === identity) {
        this.error = error instanceof HttpErrorResponse && error.status === 403
          ? 'Aprobación denegada: requiere administrador y, con la política activa, una persona distinta del creador. Actualiza la lista.'
          : error instanceof HttpErrorResponse && error.status === 409
            ? 'La solicitud requiere revisión o la referencia ya existe. Actualiza y consulta el detalle antes de aprobar.'
            : this.errorMessage(error, 'No se pudo aprobar la solicitud.');
      }
    } finally { if (this.session.user() === identity) this.busy = false; }
  }

  purchaseApprovalMessage(item: PurchaseRequest) {
    return item.approval_block_reason === 'unknown_creator'
      ? 'Aprobación bloqueada: solicitud antigua sin creador identificado. Revisa el documento con administración.'
      : 'Debe aprobar otro administrador: no puedes aprobar tu propia solicitud.';
  }

  async rejectPurchase(item: PurchaseRequest) {
    const reason = this.rejectionReasons[item.id]?.trim();
    if (this.busy || this.loading || !this.isAdmin || !reason || reason.length < 10 ||
        (item.status !== 'draft' && item.status !== 'submitted')) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = '';
    try {
      await firstValueFrom(this.http.post(`${this.api}/commerce/purchases/requests/${item.id}/reject`, { reason }));
      if (this.session.user() !== identity) return;
      delete this.rejectionReasons[item.id];
      await this.refresh();
      if (this.session.user() === identity && !this.error) this.message = 'Solicitud rechazada con motivo auditado. No se creó una orden.';
    } catch (error) {
      if (this.session.user() === identity) this.error = error instanceof HttpErrorResponse && error.status === 409
        ? 'La solicitud ya cambió. Actualiza antes de continuar.'
        : this.errorMessage(error, 'No se pudo rechazar la solicitud.');
    } finally { if (this.session.user() === identity) this.busy = false; }
  }

  async showPurchaseDetails(item: PurchaseRequest) {
    if (this.busy || this.loading || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = ''; this.purchaseDetails = null;
    try {
      const details = await firstValueFrom(this.http.get<PurchaseRequestDetails>(`${this.api}/commerce/purchases/requests/${item.id}`));
      if (this.session.user() === identity) this.purchaseDetails = details;
    } catch (error) {
      if (this.session.user() === identity) this.error = this.errorMessage(error, 'No se pudo cargar el detalle de la solicitud.');
    } finally { if (this.session.user() === identity) this.busy = false; }
  }

  async receivePurchase(item: PurchaseRequest) {
    if (!item.purchase_order_id) return;
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/commerce/purchases/orders/${item.purchase_order_id}/receive`,
        { receiptNumber: this.receiptNumbers[item.id].trim() }));
      this.message = 'Recepción comercial registrada. Aplica la entrada al inventario a continuación.';
      await this.refresh();
    });
  }

  async applyReceipt(item: PurchaseRequest) {
    if (!item.purchase_order_id) return;
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/inventory/purchases/orders/${item.purchase_order_id}/receive`,
        { locationCode: this.locations[item.id]?.trim() || 'MAIN' }));
      this.message = 'Existencias recibidas en la ubicación indicada.';
      await this.refresh();
    });
  }

  async postPurchase(item: PurchaseRequest) {
    if (!item.purchase_order_id) return;
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/accounting/bootstrap-accounts`, {}));
      await firstValueFrom(this.http.post(`${this.api}/accounting/purchase-orders/${item.purchase_order_id}/post`, {}));
      this.message = 'Compra contabilizada.';
      await this.refresh();
    });
  }

  async createEmployee() {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/hr/employees`, {
        ...this.employee, email: this.employee.email || undefined, jobTitle: this.employee.jobTitle || undefined,
        hireDate: this.employee.hireDate || undefined,
      }));
      this.employee = { employeeCode: '', fullName: '', email: '', jobTitle: '', hireDate: '' };
      this.message = 'Empleado agregado.';
      await this.refresh();
    });
  }

  async checkIn() {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/hr/attendance/check-in`, { employeeId: this.attendanceEmployeeId }));
      this.message = 'Entrada registrada.';
      await this.refresh();
    });
  }

  async checkOut(item: Attendance) {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/hr/attendance/check-out`, { attendanceId: item.id }));
      this.message = `Salida registrada · ${item.full_name}.`;
      await this.refresh();
    });
  }

  async createLeave() {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/hr/leave-requests`, { ...this.leave, reason: this.leave.reason || undefined }));
      this.leave = { employeeId: '', startDate: '', endDate: '', reason: '' };
      this.message = 'Solicitud de ausencia creada.';
      await this.refresh();
    });
  }

  async decideLeave(item: LeaveRequest, decision: 'approve' | 'reject') {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/hr/leave-requests/${item.id}/${decision}`, {}));
      this.message = `Solicitud ${decision === 'approve' ? 'aprobada' : 'rechazada'}.`;
      await this.refresh();
    });
  }

  async bootstrapAccounts() {
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ createdCount: number }>(`${this.api}/accounting/bootstrap-accounts`, {}));
      this.message = `${result.createdCount} cuentas nuevas; las existentes se conservaron.`;
      await this.loadTrialBalance();
    });
  }

  async loadTrialBalance() {
    this.loading = true; this.error = '';
    try {
      this.trialBalance = await this.get<TrialBalance>('/accounting/reports/trial-balance', {
        ...(this.accounting.fromDate ? { fromDate: this.accounting.fromDate } : {}),
        ...(this.accounting.toDate ? { toDate: this.accounting.toDate } : {}),
      });
    } catch (error) { this.error = this.errorMessage(error, 'No se pudo consultar el balance.'); }
    finally { this.loading = false; }
  }

  async closePeriod() {
    if (!this.trialBalance?.totals.isBalanced) { this.error = 'Consulta y valida que el balance esté cuadrado antes del cierre.'; return; }
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/accounting/periods/close`, {
        year: Number(this.accounting.year), month: Number(this.accounting.month),
      }));
      this.message = `Período ${this.accounting.year}-${String(this.accounting.month).padStart(2, '0')} cerrado.`;
    });
  }

  async saveFiscalConfig() {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/fiscal/providers/config`, {
        countryCode: this.fiscal.countryCode, providerCode: this.fiscal.providerCode.trim(),
        environment: 'sandbox', endpointUrl: this.fiscal.endpointUrl.trim(), credentials: {},
      }));
      this.message = 'Configuración de prueba guardada.';
    });
  }

  async createFiscalDocument() {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/fiscal/invoices/${this.fiscal.invoiceId}/documents`, {
        countryCode: this.fiscal.documentCountry, documentType: 'invoice',
      }));
      this.message = 'Documento sandbox generado.';
      await this.refresh();
    });
  }

  async submitFiscalDocument(item: FiscalDocument) {
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ status: string }>(`${this.api}/fiscal/documents/${item.id}/submit`, {}));
      this.message = `El simulador respondió: ${result.status}.`;
      await this.refresh();
    });
  }

  async createPortalToken() {
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ token: string }>(`${this.api}/portal/access-tokens`, this.portal));
      this.issuedPortalToken = result.token;
      this.message = 'Acceso creado. Copia el token ahora: no puede recuperarse después.';
      await this.refresh();
    });
  }

  async revokeToken(item: PortalToken) {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/portal/access-tokens/${item.id}/revoke`, {}));
      this.message = 'Acceso revocado.';
      await this.refresh();
    });
  }

  customerName(customerId: string) {
    const customer = this.customers.find(item => item.id === customerId);
    return customer ? `${customer.code} · ${customer.name}` : 'Cliente';
  }

  private autoNumber(prefix: string) {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  private async get<T>(path: string, params?: Record<string, string>) {
    return firstValueFrom(this.http.get<T>(`${this.api}${path}`, { params }));
  }

  private async perform(action: () => Promise<unknown>) {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.message = '';
    try { await action(); }
    catch (error) { this.error = this.errorMessage(error, 'La operación no pudo completarse. Actualiza el estado antes de reintentar.'); }
    finally { this.busy = false; }
  }

  private errorMessage(error: unknown, fallback: string) {
    if (error instanceof HttpErrorResponse && error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error instanceof HttpErrorResponse && error.status === 403) return 'El rol de esta cuenta no autoriza la operación.';
    if (error instanceof HttpErrorResponse && error.status === 400) return 'La operación fue rechazada por sus reglas de negocio. Revisa estado, período, referencias, saldos y campos.';
    if (error instanceof HttpErrorResponse && error.status === 409) return 'La referencia ya existe. Actualiza la lista y continúa desde el documento existente.';
    return fallback;
  }
}
