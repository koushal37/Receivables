// Header aliases from Tally / Excel / accounting exports, matched case- and punctuation-insensitively.
export const FIELD_ALIASES = {
  invoice_number: ['invoice_number', 'invoice_no', 'invoice', 'inv_no', 'voucher_no', 'bill_no', 'bill_number', 'number'],
  customer_name: ['customer_name', 'customer', 'party_name', 'party', 'client', 'client_name', 'buyer', 'bill_to', 'name'],
  phone: ['phone', 'mobile', 'phone_number', 'mobile_number', 'contact', 'whatsapp'],
  email: ['email', 'customer_email', 'email_address'],
  amount: ['amount', 'total', 'invoice_amount', 'grand_total', 'total_amount', 'amount_due', 'net_amount'],
  subtotal: ['subtotal', 'sub_total', 'taxable_value', 'taxable_amount'],
  tax: ['tax', 'tax_amount', 'gst', 'gst_amount', 'vat', 'total_tax'],
  invoice_date: ['invoice_date', 'date', 'bill_date', 'voucher_date', 'issue_date'],
  due_date: ['due_date', 'duedate', 'payment_due', 'due_on', 'due'],
  currency: ['currency', 'currency_code', 'ccy'],
  vendor_name: ['vendor_name', 'vendor', 'seller', 'supplier'],
};

// "Invoice No." -> "invoice_no", "invoiceNo" -> "invoice_no"
export const headerKey = (header) => String(header).trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Returns the canonical field name for a header, or null.
export function fieldForHeader(header) {
  const key = headerKey(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) if (aliases.includes(key)) return field;
  return null;
}
