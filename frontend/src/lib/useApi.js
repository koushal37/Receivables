import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// GET an endpoint; re-fetches when `endpoint` changes or reload() is called.
export function useApi(endpoint) {
  const [state, setState] = useState({ data: null, error: null, loading: true, key: endpoint });
  const [version, setVersion] = useState(0);

  // Show the loading state immediately when the endpoint changes (derived during render)
  if (state.key !== endpoint) setState({ data: state.data, error: null, loading: true, key: endpoint });

  useEffect(() => {
    let cancelled = false;
    api(endpoint).then(
      (data) => !cancelled && setState({ data, error: null, loading: false, key: endpoint }),
      (error) => !cancelled && setState((s) => ({ ...s, error, loading: false, key: endpoint })),
    );
    return () => { cancelled = true; };
  }, [endpoint, version]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    setVersion((v) => v + 1);
  }, []);

  return { ...state, reload };
}
