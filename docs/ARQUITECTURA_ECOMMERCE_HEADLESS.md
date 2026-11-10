# Arquitectura eCommerce headless aplicada (PF-011)

## Referencias de modelo exitoso

Para este módulo se adoptó un patrón **headless commerce API-first**, alineado con prácticas ampliamente usadas:

- Shopify (headless): separación storefront/backoffice con APIs para catálogo, carrito y checkout.
- BigCommerce (headless): flujo estándar `products -> cart -> checkout -> order`.
- Saleor docs: enfoque API-first para storefront desacoplado.

## Principios implementados

1. **Separación de capas**:
   - Administración (catálogo, categorías, publicación, configuración) en endpoints autenticados.
   - Storefront público (catálogo, carrito, checkout) desacoplado y consumible por UI web.
2. **Integración ERP nativa**:
   - Catálogo reutiliza `products` y `tax_rates`.
   - Checkout genera `sales_quotations` y `sales_orders`.
   - Reserva de stock integrada con inventario (`inventory_*`).
3. **Configurabilidad por empresa**:
   - Settings por tenant (`store_name`, `store_slug`, `currency`, `default_tax_rate_code`, tema).
4. **Mantenibilidad y actualización**:
   - Diseño por módulo (`ecommerce`) con contratos claros.
   - Storefront Angular independiente de lógica de negocio backend.
5. **UX/UI funcional actual**:
   - Vista de tienda con listado de productos, stock visible, carrito y checkout guiado.

## Resultado

El módulo cumple la paridad PF-011 con enfoque moderno y extensible para crecimiento futuro (promociones, cupones, pasarelas, CMS).
