import { useCallback, useEffect, useState } from 'react';
import { syncSystemLogoFromSettings } from '../utils/imageCompress';

export function useData(ctx, specs) {
  const get = ctx?.get;
  const revision = ctx?.revision;
  const encoded = JSON.stringify(specs);
  const [localRev, setLocalRev] = useState(0);
  const [state, setState] = useState({ data: null, error: '', pending: true });

  const refresh = useCallback(() => {
    setLocalRev(v => v + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setState(previous => ({ ...previous, pending: true, error: '' }));

    if (!get) return;

    Promise.all(
      Object.entries(JSON.parse(encoded)).map(async ([name, spec]) => {
        const [route, params] = Array.isArray(spec) ? spec : [spec, {}];
        return [name, await get(route, params)];
      })
    )
      .then(result => {
        if (active) {
          const obj = Object.fromEntries(result);
          if (obj.settings) {
            syncSystemLogoFromSettings(obj.settings);
          }
          setState({ data: obj, error: '', pending: false });
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
  }, [get, revision, localRev, encoded]);

  return { ...state, refresh };
}
