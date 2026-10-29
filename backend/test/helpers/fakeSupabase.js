// Minimal in-memory stand-in for the Supabase client: supports the
// chainable filters the app uses (eq/in/lt/lte/gt/like/not/order/limit/range).
export function createFakeSupabase(seed = {}) {
  const tables = structuredClone(seed);
  const users = new Map(); // token -> user
  const rpcCalls = [];

  function builder(table) {
    const filters = [];
    let op = 'select';
    let payload = null;
    let single = null;
    let limitN = null;

    const rows = () => (tables[table] ||= []);
    const match = (r) => filters.every((f) => f(r));

    const api = {
      select() { return api; },
      insert(p) { op = 'insert'; payload = p; return api; },
      upsert(p) { op = 'insert'; payload = p; return api; },
      update(p) { op = 'update'; payload = p; return api; },
      delete() { op = 'delete'; return api; },
      eq(c, v) { filters.push((r) => r[c] === v); return api; },
      neq(c, v) { filters.push((r) => r[c] !== v); return api; },
      in(c, vs) { filters.push((r) => vs.includes(r[c])); return api; },
      lt(c, v) { filters.push((r) => r[c] < v); return api; },
      lte(c, v) { filters.push((r) => r[c] <= v); return api; },
      gt(c, v) { filters.push((r) => r[c] > v); return api; },
      gte(c, v) { filters.push((r) => r[c] >= v); return api; },
      ilike(c, v) { const want = v.replace(/\\([%_])/g, '$1').toLowerCase(); filters.push((r) => String(r[c] ?? '').toLowerCase() === want); return api; },
      like(c, v) { const end = v.replace(/^%/, ''); filters.push((r) => String(r[c] ?? '').endsWith(end)); return api; },
      not(c, _op, list) { const vs = list.replace(/[()]/g, '').split(','); filters.push((r) => !vs.includes(r[c])); return api; },
      or() { return api; },
      order() { return api; },
      limit(n) { limitN = n; return api; },
      range(from, to) { limitN = to - from + 1; return api; },
      single() { single = 'single'; return api; },
      maybeSingle() { single = 'maybe'; return api; },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };

    function run() {
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: crypto.randomUUID(), ...p }));
        rows().push(...list);
        return { data: single ? list[0] : list, error: null };
      }
      let found = rows().filter(match);
      if (op === 'update') found.forEach((r) => Object.assign(r, payload));
      if (op === 'delete') tables[table] = rows().filter((r) => !match(r));
      if (limitN !== null) found = found.slice(0, limitN);
      if (single === 'single') return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { message: 'not found' } };
      if (single === 'maybe') return { data: found[0] ?? null, error: null };
      return { data: found, error: null };
    }
    return api;
  }

  return {
    tables,
    users,
    rpcCalls,
    from: (t) => builder(t),
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'commit_import_batch') {
        (tables.invoices ||= []).push(...args.p_rows.map((r) => ({
          id: crypto.randomUUID(), business_id: args.p_business_id, customer_id: 'cust-new',
          invoice_number: r.invoice_number, original_amount: r.amount, due_date: r.due_date, record_status: 'active',
        })));
      }
      return { data: { success: true, count: args.p_rows?.length ?? 0, payment_id: 'p1' }, error: null };
    },
    auth: {
      getUser: async (token) => (users.has(token)
        ? { data: { user: users.get(token) }, error: null }
        : { data: { user: null }, error: { message: 'bad token' } }),
      admin: {
        createUser: async () => ({ data: { user: { id: 'new-user' } }, error: null }),
        deleteUser: async () => ({}),
      },
    },
  };
}
