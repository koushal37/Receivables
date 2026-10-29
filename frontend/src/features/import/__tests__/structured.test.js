import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../parsers/spreadsheet.js';
import { parseJsonText } from '../parsers/json.js';
import { parseXmlText } from '../parsers/xml.js';
import { looksTabular } from '../extract/structured.js';
import { makeDraft, validateDraft, draftToRow, draftToPatch, emptyDraft, invoiceToDraft } from '../extract/draft.js';
import { validateFile, detectFormat } from '../fileTypes.js';

const toBuffer = (wb, bookType) => XLSX.write(wb, { type: 'array', bookType });

describe('spreadsheets', () => {
  it('reads a CSV export with Tally-style headers, one invoice per row', () => {
    const csv = 'Voucher No,Party Name,Mobile,Grand Total,Date,Due Date\nT-1,Acme,9876543210,"1,50,000",01/04/2026,30/04/2026\nT-2,Beta,,500,02/04/2026,02/05/2026\n';
    const res = parseWorkbook(new TextEncoder().encode(csv), { csv: true });
    expect(res).toHaveLength(2);
    const d = makeDraft(res[0].fields, {});
    expect(d).toMatchObject({ invoice_number: 'T-1', customer_name: 'Acme', amount: 150000, invoice_date: '2026-04-01', due_date: '2026-04-30' });
    expect(validateDraft(d)).toEqual({});
  });

  it('reads XLSX and legacy XLS with real date cells', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Invoice Number', 'Customer', 'Amount', 'Due Date'],
      ['X-9', 'Gamma Ltd', 1234.5, new Date(Date.UTC(2026, 9, 15))],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    for (const type of ['xlsx', 'biff8']) {
      const d = makeDraft(parseWorkbook(toBuffer(wb, type))[0].fields, {});
      expect(d).toMatchObject({ invoice_number: 'X-9', customer_name: 'Gamma Ltd', amount: 1234.5, due_date: '2026-10-15' });
    }
  });

  it('treats a sheet laid out as a single invoice document as text', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Invoice No:', 'Z-77'], ['Bill To:', 'Delta Corp'], ['Due Date:', '10/12/2026'], ['Grand Total', '9,999.00']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const d = makeDraft(parseWorkbook(toBuffer(wb, 'xlsx'))[0].fields, {});
    expect(d).toMatchObject({ invoice_number: 'Z-77', customer_name: 'Delta Corp', due_date: '2026-12-10', amount: 9999 });
  });

  it('rejects corrupt and empty workbooks with friendly errors', () => {
    expect(() => parseWorkbook(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9]))).toThrow(/damaged/);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Empty');
    expect(() => parseWorkbook(toBuffer(wb, 'xlsx'))).toThrow(/no data/);
  });

  it('detects tabular headers', () => {
    expect(looksTabular(['Invoice No', 'Customer', 'Total'])).toBe(true);
    expect(looksTabular(['Name', 'Address'])).toBe(false);
  });
});

describe('JSON', () => {
  it('reads arrays, wrapped lists and nested single invoices', () => {
    expect(parseJsonText('[{"invoice_number":"A","customer":"X","total":"10"}]')).toHaveLength(1);
    expect(parseJsonText('{"invoices":[{"invoiceNo":"A","amount":1},{"invoiceNo":"B","amount":2}]}')).toHaveLength(2);

    const single = parseJsonText(JSON.stringify({
      number: 'J-1',
      issue_date: '2026-10-01',
      due_date: '2026-10-31',
      customer: { name: 'Nested Co', email: 'a@b.co', phone: '+14155550100' },
      seller: { name: 'Me Ltd' },
      totals: { subtotal: 100, tax: 18, grand_total: 118 },
      currency: 'eur',
      items: [{ description: 'Thing', quantity: 1, unit_price: 100, amount: 100 }],
    }));
    const d = makeDraft(single[0].fields, {});
    expect(d).toMatchObject({
      invoice_number: 'J-1', customer_name: 'Nested Co', email: 'a@b.co', phone: '+14155550100', vendor_name: 'Me Ltd',
      subtotal: 100, tax: 18, amount: 118, currency: 'EUR', invoice_date: '2026-10-01', due_date: '2026-10-31',
    });
    expect(d.line_items).toHaveLength(1);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseJsonText('{oops')).toThrow(/isn’t valid JSON/);
  });
});

const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>UBL-2026-001</cbc:ID>
  <cbc:IssueDate>2026-10-01</cbc:IssueDate>
  <cbc:DueDate>2026-10-31</cbc:DueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Supplier GmbH</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer BV</cbc:RegistrationName></cac:PartyLegalEntity>
    <cac:Contact><cbc:ElectronicMail>ap@buyer.nl</cbc:ElectronicMail></cac:Contact>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">210.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">1000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">1000.00</cbc:TaxExclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">1210.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">4</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">1000.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Consulting day</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">250.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument><ram:ID>FX-77</ram:ID><ram:IssueDateTime><udt:DateTimeString format="102">20261001</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>Vendeur SARL</ram:Name></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>Acheteur SA</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261031</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>500.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">100.00</ram:TaxTotalAmount>
        <ram:DuePayableAmount>600.00</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

describe('XML e-invoices', () => {
  it('reads UBL 2.1 (Peppol) invoices', () => {
    const [res] = parseXmlText(UBL);
    const d = makeDraft(res.fields, {});
    expect(d).toMatchObject({
      invoice_number: 'UBL-2026-001', invoice_date: '2026-10-01', due_date: '2026-10-31', currency: 'EUR',
      customer_name: 'Buyer BV', email: 'ap@buyer.nl', vendor_name: 'Supplier GmbH', subtotal: 1000, tax: 210, amount: 1210,
    });
    expect(d.line_items).toEqual([{ description: 'Consulting day', quantity: 4, unit_price: 250, amount: 1000 }]);
    expect(validateDraft(d)).toEqual({});
  });

  it('reads CII (Factur-X / ZUGFeRD) invoices', () => {
    const d = makeDraft(parseXmlText(CII)[0].fields, {});
    expect(d).toMatchObject({ invoice_number: 'FX-77', invoice_date: '2026-10-01', due_date: '2026-10-31', customer_name: 'Acheteur SA', vendor_name: 'Vendeur SARL', amount: 600, tax: 100 });
  });

  it('maps unknown XML by tag name and rejects malformed XML', () => {
    const [res] = parseXmlText('<invoice><invoice_no>G-1</invoice_no><customer>Gen Co</customer><total>42</total><due_date>01/12/2026</due_date></invoice>');
    expect(makeDraft(res.fields, {})).toMatchObject({ invoice_number: 'G-1', customer_name: 'Gen Co', amount: 42, due_date: '2026-12-01' });
    expect(() => parseXmlText('<invoice><open></invoice>')).toThrow(/malformed/);
  });
});

describe('file validation', () => {
  const file = (name, size = 10, type = '') => ({ name, size, type });
  it('accepts every supported format and rejects others with a friendly message', () => {
    for (const n of ['a.pdf', 'b.JPG', 'c.png', 'd.webp', 'e.heic', 'f.xlsx', 'g.xls', 'h.csv', 'i.docx', 'j.json', 'k.xml']) {
      expect(validateFile(file(n)).format).toBeTruthy();
    }
    expect(validateFile(file('x.exe')).error).toMatch(/\.exe files aren’t supported/);
    expect(validateFile(file('a.pdf', 0)).error).toMatch(/empty/);
    expect(validateFile(file('a.pdf', 30 * 1024 * 1024)).error).toMatch(/limit is 20 MB/);
    expect(detectFormat(file('noext', 1, 'application/pdf'))).toBe('pdf');
  });
});

describe('draftToRow', () => {
  it('produces the payload shape the API validates', () => {
    const d = makeDraft({ invoice_number: 'A', customer_name: 'B', amount: '10', due_date: '2026-12-01' }, {});
    expect(draftToRow(d, 3)).toMatchObject({ row: 3, invoice_number: 'A', customer_name: 'B', amount: 10, due_date: '2026-12-01', currency: 'INR' });
  });
});

describe('manual entry and editing', () => {
  it('a blank manual draft asks for the required fields only', () => {
    expect(validateDraft(emptyDraft())).toEqual({ invoice_number: 'Required', customer_name: 'Required', amount: 'Enter a total above 0', due_date: 'Required' });
  });

  it('validates the amount already paid and the promise date', () => {
    const d = { ...emptyDraft(), invoice_number: 'M-1', customer_name: 'Acme', amount: '1,000', invoice_date: '2026-11-01', due_date: '2026-11-30' };
    expect(validateDraft({ ...d, paid_amount: '1,500' }).paid_amount).toBe('More than the total');
    expect(validateDraft({ ...d, paid_amount: 'abc' }).paid_amount).toBe('Enter a valid amount');
    expect(validateDraft({ ...d, promise_date: '2026-10-01' }).promise_date).toBe('Before invoice date');
    expect(validateDraft({ ...d, paid_amount: '250', promise_date: '2026-12-05' })).toEqual({});
    expect(draftToRow({ ...d, paid_amount: '250', promise_date: '2026-12-05' }, 1)).toMatchObject({ paid_amount: '250', promise_date: '2026-12-05' });
  });

  it('loads a saved invoice for editing and never lets the total drop below what was paid', () => {
    const d = invoiceToDraft({
      id: 'inv-1', invoice_number: 'A-1', invoice_date: '2026-10-01', due_date: '2026-10-31', original_amount: '1000.00',
      currency_code: 'INR', total_paid: '400', customers: { name: 'Acme', phone: '+919876543210', email: null },
      line_items: [{ description: 'Widget', quantity: 2, unit_price: 500, amount: 1000 }],
    });
    expect(d).toMatchObject({ id: 'inv-1', invoice_number: 'A-1', customer_name: 'Acme', phone: '+919876543210', amount: 1000, total_paid: 400, warnings: [] });
    expect(validateDraft({ ...d, amount: '300' }).amount).toMatch(/400 already paid/);
    const patch = draftToPatch({ ...d, due_date: '2026-11-15' });
    expect(patch).toMatchObject({ invoice_number: 'A-1', due_date: '2026-11-15', amount: 1000 });
    expect(patch).not.toHaveProperty('paid_amount');
    expect(patch).not.toHaveProperty('row');
  });
});

