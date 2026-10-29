// Reads e-invoice XML: OASIS UBL 2.x (Peppol, XRechnung-UBL) and UN/CEFACT CII
// (Factur-X / ZUGFeRD / XRechnung-CII). Falls back to generic leaf mapping.
import { mapRecord } from './structured.js';

const local = (el) => el.localName || el.nodeName.replace(/^.*:/, '');

function children(el, name) {
  return el ? [...el.children].filter((c) => local(c) === name) : [];
}

// Follows a path of local names, e.g. path(doc, 'AccountingCustomerParty/Party/PartyName/Name')
function path(el, p) {
  let nodes = [el];
  for (const part of p.split('/')) nodes = nodes.flatMap((n) => children(n, part));
  return nodes[0] ?? null;
}

const textAt = (el, ...paths) => {
  for (const p of paths) {
    const node = path(el, p);
    const v = node?.textContent?.trim();
    if (v) return v;
  }
  return '';
};

// CII dates are often format 102: YYYYMMDD
const ciiDate = (s) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s);

function parseUbl(root) {
  const party = (role) => path(root, `${role}/Party`);
  const customer = party('AccountingCustomerParty');
  const supplier = party('AccountingSupplierParty');
  const partyName = (p) => textAt(p, 'PartyLegalEntity/RegistrationName', 'PartyName/Name');
  const lineTag = local(root) === 'CreditNote' ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyTag = local(root) === 'CreditNote' ? 'CreditedQuantity' : 'InvoicedQuantity';

  return {
    invoice_number: textAt(root, 'ID'),
    invoice_date: textAt(root, 'IssueDate'),
    due_date: textAt(root, 'DueDate', 'PaymentMeans/PaymentDueDate'),
    currency: textAt(root, 'DocumentCurrencyCode'),
    customer_name: partyName(customer),
    email: textAt(customer, 'Contact/ElectronicMail'),
    phone: textAt(customer, 'Contact/Telephone'),
    vendor_name: partyName(supplier),
    subtotal: textAt(root, 'LegalMonetaryTotal/TaxExclusiveAmount', 'LegalMonetaryTotal/LineExtensionAmount'),
    tax: textAt(root, 'TaxTotal/TaxAmount'),
    amount: textAt(root, 'LegalMonetaryTotal/PayableAmount', 'LegalMonetaryTotal/TaxInclusiveAmount'),
    line_items: children(root, lineTag).map((line) => ({
      description: textAt(line, 'Item/Name', 'Item/Description', 'Note'),
      quantity: textAt(line, qtyTag),
      unit_price: textAt(line, 'Price/PriceAmount'),
      amount: textAt(line, 'LineExtensionAmount'),
    })),
  };
}

function parseCii(root) {
  const tx = path(root, 'SupplyChainTradeTransaction');
  const agreement = path(tx, 'ApplicableHeaderTradeAgreement');
  const settlement = path(tx, 'ApplicableHeaderTradeSettlement');
  const sums = path(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  const buyer = path(agreement, 'BuyerTradeParty');

  return {
    invoice_number: textAt(root, 'ExchangedDocument/ID'),
    invoice_date: ciiDate(textAt(root, 'ExchangedDocument/IssueDateTime/DateTimeString')),
    due_date: ciiDate(textAt(settlement, 'SpecifiedTradePaymentTerms/DueDateDateTime/DateTimeString')),
    currency: textAt(settlement, 'InvoiceCurrencyCode'),
    customer_name: textAt(buyer, 'Name'),
    email: textAt(buyer, 'URIUniversalCommunication/URIID', 'DefinedTradeContact/EmailURIUniversalCommunication/URIID'),
    phone: textAt(buyer, 'DefinedTradeContact/TelephoneUniversalCommunication/CompleteNumber'),
    vendor_name: textAt(agreement, 'SellerTradeParty/Name'),
    subtotal: textAt(sums, 'TaxBasisTotalAmount', 'LineTotalAmount'),
    tax: textAt(sums, 'TaxTotalAmount'),
    amount: textAt(sums, 'DuePayableAmount', 'GrandTotalAmount'),
    line_items: children(tx, 'IncludedSupplyChainTradeLineItem').map((line) => ({
      description: textAt(line, 'SpecifiedTradeProduct/Name'),
      quantity: textAt(line, 'SpecifiedLineTradeDelivery/BilledQuantity'),
      unit_price: textAt(line, 'SpecifiedLineTradeAgreement/NetPriceProductTradePrice/ChargeAmount'),
      amount: textAt(line, 'SpecifiedLineTradeSettlement/SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount'),
    })),
  };
}

// Flattens leaf elements to { tagName: text } for unknown XML schemas.
function genericRecord(el) {
  const out = {};
  const items = [];
  for (const child of el.children) {
    if (child.children.length === 0) out[local(child)] ??= child.textContent.trim();
    else if (/^(item|line|lineitem|invoiceline|product)$/i.test(local(child))) items.push(genericRecord(child));
    else if (/^(items|lines|lineitems|invoicelines|products)$/i.test(local(child))) items.push(...[...child.children].map(genericRecord));
    else out[local(child)] = genericRecord(child);
  }
  if (items.length) out.line_items = items;
  return out;
}

// Returns { kind: 'ubl'|'cii'|'generic', records: [...] }
export function parseInvoiceXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This XML file is malformed and can’t be read.');
  const root = doc.documentElement;
  const name = local(root);

  if (name === 'Invoice' || name === 'CreditNote') return { kind: 'ubl', records: [parseUbl(root)] };
  if (name === 'CrossIndustryInvoice') return { kind: 'cii', records: [parseCii(root)] };

  // Wrapper with several invoices, e.g. <Invoices><Invoice>...</Invoice></Invoices>
  const nested = [...root.children].filter((c) => ['Invoice', 'CrossIndustryInvoice'].includes(local(c)));
  if (nested.length && nested.every((c) => path(c, 'ID') || path(c, 'ExchangedDocument'))) {
    return { kind: 'ubl', records: nested.map((c) => (local(c) === 'Invoice' ? parseUbl(c) : parseCii(c))) };
  }

  const repeated = [...root.children];
  const sameTag = repeated.length > 1 && repeated.every((c) => local(c) === local(repeated[0]));
  const records = (sameTag ? repeated : [root]).map((el) => mapRecord(genericRecord(el)));
  return { kind: 'generic', records };
}
