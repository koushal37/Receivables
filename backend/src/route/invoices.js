import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';  

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// 1. GET ALL INVOICES (From deterministic ledger view)
router.get('/', requireAuth, async (req, res) => {
  try {
    const businessId = req.businessId; // Provided by auth middleware
    const { status, search } = req.query;

    let query = supabase
      .from('invoice_ledger_view')
      .select('*')
      .eq('business_id', businessId)
      .order('due_date', { ascending: true });

    if (status && status !== 'all') {
      query = query.eq('payment_status', status);
    }
    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,invoice_number.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ invoices: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. PARSE & PREVIEW UPLOADED SPREADSHEET
router.post('/import-preview', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const businessId = req.businessId;
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file is empty.' });
    }

    // Fetch existing invoice numbers to flag duplicates
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('business_id', businessId);

    const existingSet = new Set((existingInvoices || []).map(i => String(i.invoice_number).trim().toLowerCase()));

    const validRows = [];
    const invalidRows = [];
    const duplicateRows = [];

    rawRows.forEach((row, index) => {
      // Flexible field mapping matching standard Tally / Excel exports
      const invoiceNumber = String(row['Invoice Number'] || row['Invoice No'] || row['Voucher No'] || row['Bill No'] || '').trim();
      const customerName = String(row['Customer Name'] || row['Party Name'] || row['Customer'] || '').trim();
      const phone = String(row['Phone'] || row['Mobile'] || '').replace(/[^0-9]/g, '');
      const amount = parseFloat(row['Amount'] || row['Total'] || row['Invoice Amount'] || 0);
      const invoiceDate = row['Invoice Date'] || row['Date'] || new Date().toISOString().split('T')[0];
      const dueDate = row['Due Date'] || row['DueDate'] || invoiceDate;

      const record = {
        rowNumber: index + 2,
        invoiceNumber,
        customerName,
        phone: phone ? (phone.startsWith('91') && phone.length === 12 ? `+${phone}` : `+91${phone.slice(-10)}`) : null,
        originalAmount: amount,
        invoiceDate: new Date(invoiceDate).toISOString().split('T')[0],
        dueDate: new Date(dueDate).toISOString().split('T')[0],
      };

      if (!invoiceNumber || !customerName || isNaN(amount) || amount <= 0) {
        invalidRows.push({ ...record, reason: 'Missing invoice number, customer name, or valid positive amount.' });
      } else if (existingSet.has(invoiceNumber.toLowerCase())) {
        duplicateRows.push({ ...record, reason: 'Invoice number already exists in your records.' });
      } else {
        validRows.push(record);
      }
    });

    res.json({
      summary: {
        totalRows: rawRows.length,
        validCount: validRows.length,
        duplicateCount: duplicateRows.length,
        invalidCount: invalidRows.length,
      },
      validRows,
      duplicateRows,
      invalidRows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. COMMIT VALID IMPORT ROWS
router.post('/import-commit', requireAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided for import.' });
    }

    let insertedCount = 0;

    for (const item of rows) {
      // Step A: Upsert Customer
      let customerId;
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('business_id', businessId)
        .eq('name', item.customerName)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({
            business_id: businessId,
            name: item.customerName,
            phone: item.phone || null,
          })
          .select('id')
          .single();

        if (custErr) throw custErr;
        customerId = newCustomer.id;
      }

      // Step B: Insert Invoice
      const { error: invErr } = await supabase
        .from('invoices')
        .insert({
          business_id: businessId,
          customer_id: customerId,
          invoice_number: item.invoiceNumber,
          invoice_date: item.invoiceDate,
          due_date: item.dueDate,
          original_amount: item.originalAmount,
        });

      if (!invErr) insertedCount++;
    }

    res.json({ success: true, count: insertedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. RECORD PAYMENT WITH ALLOCATION
router.post('/record-payment', requireAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { invoiceId, customerId, receivedAmount, paymentMethod, paymentReference, receivedAt } = req.body;

    if (!invoiceId || !receivedAmount || receivedAmount <= 0) {
      return res.status(400).json({ error: 'Invoice and positive amount are required.' });
    }

    // Insert Payment Record
    const { data: payment, error: pError } = await supabase
      .from('payments')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        received_amount: receivedAmount,
        payment_method: paymentMethod || 'bank_transfer',
        payment_reference: paymentReference || null,
        received_at: receivedAt || new Date().toISOString().split('T')[0],
        recorded_by: req.user.id,
        confirmation_status: 'confirmed'
      })
      .select('id')
      .single();

    if (pError) throw pError;

    // Allocate to Invoice
    const { error: aError } = await supabase
      .from('payment_allocations')
      .insert({
        business_id: businessId,
        payment_id: payment.id,
        invoice_id: invoiceId,
        allocated_amount: receivedAmount
      });

    if (aError) throw aError;

    res.json({ success: true, paymentId: payment.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;