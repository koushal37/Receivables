import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth, requireBusiness, requireRole, audit } from '../middleware/auth.js';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore, getISTDateString } from '../demoStore.js';

const router = Router();

export function parseIndianAmount(raw) {
  if (typeof raw === 'number') return raw > 0 ? raw : null;
  if (!raw || typeof raw !== 'string') return null;

  const sanitized = raw.replace(/[₹\s,INR]/gi, '');
  const parsed = Number(sanitized);
  return !isNaN(parsed) && parsed > 0 ? parsed : null;
}

export function parseDateExplicit(raw) {
  if (!raw) return null;

  if (typeof raw === 'number' || (!isNaN(raw) && !raw.toString().includes('/') && !raw.toString().includes('-'))) {
    const serial = Number(raw);
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return isNaN(date_info.getTime()) ? null : date_info.toISOString().split('T')[0];
  }

  const str = String(raw).trim();
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
      return date.toISOString().split('T')[0];
    }
    return null;
  }

  const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
      return date.toISOString().split('T')[0];
    }
  }

  return null;
}

// POST /api/import/preview
router.post('/preview', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'Payload must contain rows array' });
    }

    const valid = [];
    const errors = [];
    const duplicates = [];

    let existingInvoices = [];
    if (req.isDemoMode || !isSupabaseConfigured) {
      existingInvoices = demoStore.invoices.filter((i) => i.business_id === req.businessId);
    } else {
      const { data } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('business_id', req.businessId);
      existingInvoices = data || [];
    }

    const existingSet = new Set(existingInvoices.map((i) => String(i.invoice_number).trim().toLowerCase()));
    const seenInFile = new Set();

    rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      // Flexible column headers support
      const rawInv = row.invoice_number ?? row['Invoice Number'] ?? row['Invoice No'] ?? row['Voucher No'] ?? row['Bill No'];
      const rawCust = row.customer_name ?? row['Customer Name'] ?? row['Party Name'] ?? row['Customer'] ?? row.name;
      const rawAmt = row.amount ?? row['Amount'] ?? row['Invoice Amount'] ?? row['Total'];
      const rawDue = row.due_date ?? row['Due Date'] ?? row['DueDate'];
      const rawPhone = row.phone ?? row['Phone'] ?? row['Mobile'] ?? '';

      const invNum = rawInv ? String(rawInv).trim() : null;
      const custName = rawCust ? String(rawCust).trim() : null;
      const parsedAmt = parseIndianAmount(rawAmt);
      const parsedDate = parseDateExplicit(rawDue);

      if (!invNum) {
        errors.push({ row: rowNum, reason: 'Missing Invoice Number', data: row });
        return;
      }
      if (!custName) {
        errors.push({ row: rowNum, reason: 'Missing Customer Name', data: row });
        return;
      }
      if (parsedAmt === null) {
        errors.push({ row: rowNum, reason: `Invalid amount: "${rawAmt}"`, data: row });
        return;
      }
      if (parsedDate === null) {
        errors.push({ row: rowNum, reason: `Invalid date format: "${rawDue}". Use DD/MM/YYYY or YYYY-MM-DD`, data: row });
        return;
      }

      const lowerInv = invNum.toLowerCase();
      if (seenInFile.has(lowerInv)) {
        duplicates.push({ row: rowNum, reason: 'Duplicate invoice number within file', data: { ...row, invoice_number: invNum } });
        return;
      }
      seenInFile.add(lowerInv);

      if (existingSet.has(lowerInv)) {
        duplicates.push({ row: rowNum, reason: 'Invoice number already exists in business database', data: { ...row, invoice_number: invNum } });
        return;
      }

      valid.push({
        row: rowNum,
        name: custName,
        phone: rawPhone ? String(rawPhone).trim() : null,
        invoice_number: invNum,
        amount: parsedAmt,
        due_date: parsedDate,
      });
    });

    res.json({ valid, duplicates, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/commit
router.post('/commit', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided for commit' });
    }

    if (req.isDemoMode || !isSupabaseConfigured) {
      let inserted = 0;
      for (const r of rows) {
        let cust = demoStore.customers.find(
          (c) =>
            c.business_id === req.businessId &&
            ((r.phone && c.phone === r.phone) || c.name.toLowerCase() === r.name.toLowerCase())
        );
        if (!cust) {
          cust = {
            id: crypto.randomUUID(),
            business_id: req.businessId,
            name: r.name,
            phone: r.phone || null,
            email: null,
            preferred_channel: 'whatsapp',
            communication_permission_status: 'granted',
            opt_out: false,
            created_at: new Date().toISOString(),
          };
          demoStore.customers.push(cust);
        }
        demoStore.invoices.unshift({
          id: crypto.randomUUID(),
          business_id: req.businessId,
          customer_id: cust.id,
          invoice_number: r.invoice_number,
          invoice_date: getISTDateString(0),
          due_date: r.due_date,
          original_amount: Number(r.amount),
          amount: Number(r.amount),
          record_status: 'active',
          status: 'unpaid',
          created_at: new Date().toISOString(),
        });
        inserted++;
      }

      await audit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'IMPORT_COMMITTED',
        entity: 'invoices',
        afterState: { count: inserted },
      });

      return res.json({ success: true, count: inserted });
    }

    const { data, error } = await supabase.rpc('commit_import_batch', {
      p_business_id: req.businessId,
      p_rows: rows,
    });

    if (error) throw error;

    await audit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'IMPORT_COMMITTED',
      entity: 'invoices',
      afterState: { count: data.count },
    });

    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
