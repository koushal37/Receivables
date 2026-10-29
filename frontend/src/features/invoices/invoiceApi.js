import { api } from '../../lib/api';
import { draftToRow, draftToPatch } from '../import/extract/draft';

// Saves one manually entered invoice through the same validated, atomic path as imports.
export async function createInvoice(draft) {
  try {
    return await api('/import/commit', { method: 'POST', body: { rows: [draftToRow(draft, 1)], fileName: 'Manual entry' } });
  } catch (err) {
    const reason = err.body?.errors?.[0]?.reason || err.body?.duplicates?.[0]?.reason;
    throw new Error(reason || err.message, { cause: err });
  }
}

export async function loadInvoice(id) {
  return (await api(`/invoices/${id}`)).invoice;
}

export async function updateInvoice(draft) {
  return (await api(`/invoices/${draft.id}`, { method: 'PATCH', body: draftToPatch(draft) })).invoice;
}
