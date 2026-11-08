import { useEffect, useState } from 'react';
import { Alert, Spinner } from './ui';

export function useData({ get, revision }, specs) {
  const encoded = JSON.stringify(specs);
  const [state, setState] = useState({ data: null, error: '', pending: true });

  useEffect(() => {
    let active = true;
    setState(previous => ({ ...previous, pending: true, error: '' }));

    Promise.all(
      Object.entries(JSON.parse(encoded)).map(async ([name, spec]) => {
        const [route, params] = Array.isArray(spec) ? spec : [spec, {}];
        return [name, await get(route, params)];
      })
    )
      .then(result => {
        if (active) {
          setState({ data: Object.fromEntries(result), error: '', pending: false });
        }
      })
      .catch(error => {
        if (active) {
          setState(previous => ({ ...previous, error: error.message, pending: false }));
        }
      });

    return () => {
      active = false;
    };
  }, [get, revision, encoded]);

  return state;
}

export function DataView({ state, children }) {
  if (!state.data) {
    return state.error ? <Alert>{state.error}</Alert> : <Spinner />;
  }

  return (
    <>
      <Alert>{state.error}</Alert>
      {children(state.data)}
    </>
  );
}
