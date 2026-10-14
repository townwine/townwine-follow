# Sold-out procurement notices

The minute worker checks only products linked to `QuoteDraftRequest`, not other store products.

Send conditions:
- Product is ACTIVE; every variant tracks inventory, denies overselling, and has no remaining inventory.
- Non-test, non-cancelled PAID or PARTIALLY_REFUNDED orders have at least the registered bottle quantity, after removed/refunded line quantities.
- Both orders and line items are paginated. API errors fail closed.

The approval operator must enable inventory tracking and set the registered bottle count as Shopify inventory before publishing. Draft registration does not choose a fulfillment location or initialize location inventory.

Recipients are `ted1990@gmail.com` and `info@town.wine` (updated 2026-10-14). Currently only US registrations send procurement notices, based on the immutable quote country. GB and HK remain disabled until explicitly opened; other countries and unknown countries do not send, even with a previously prepared notice. Storefront country availability is unchanged by this mail-only restriction.

Each recipient receives one procurement notice per registration. Successful recipients are persisted independently; failed recipients retry with the same provider idempotency key and message snapshot. A restock does not start a new procurement cycle. The existing `Info@town.wine` provider key is preserved and sent-recipient comparison is case-insensitive, so capitalization cleanup does not resend notices.

The notice includes the original merchant URL, registered bottle count, registered unit price, and registered unit price multiplied by the registered count, in store currency. It is not discounted order revenue. New registrations snapshot the actual submitted variant price; older registrations use the immutable quote and existing store-currency pricing rule. If the store currency has changed since an older registration, review its snapshot before sending.

A manually entered wine without an original merchant URL is explicitly marked as missing that URL in the email. No source URL is invented. The email requests a human purchase; it never places an order.

An enabled live email provider and `read_orders`/`read_products` access are required. Log-only or test-override mode is not marked delivered. No real test purchases, stock changes, or test recipient emails are made by the unit tests.

Shopify's ordinary order scope only exposes 60 days. A synchronization gap or registration older than 59 days is held for manual order/refund verification rather than risking incomplete counts. Order quantities are persisted without customer names, addresses, or payment data. Check `procurementError`, `procurementState`, and `procurementSentAt` for delivery diagnostics.
