const apiPath = new URL('api/index.php', document.baseURI).pathname;

export function requestKey() {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function apiClient(route, { query = {}, data, csrf, key, background = false } = {}) {
  const params = new URLSearchParams({ route, ...query });
  let response;

  try {
    response = await fetch(
      apiPath + '?' + params,
      data
        ? {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrf || '',
              'Idempotency-Key': key || '',
              ...(background ? { 'X-Zeedat-Background': '1' } : {}),
            },
            body: JSON.stringify(data),
          }
        : {}
    );
  } catch {
    throw new Error('Connection unavailable. Check the server and try again.');
  }

  const result = await response
    .json()
    .catch(() => ({ error: 'The PHP API is unavailable. Check that the server is running.' }));

  if (!response.ok || result.error) {
    throw Object.assign(new Error(result.error || 'Request failed.'), {
      status: response.status,
    });
  }

  if (data && typeof window !== 'undefined') {
    const skipAutoSyncRoutes = new Set(['login', 'logout', 'sync.auto', 'sync.push', 'sync.pull']);
    if (!skipAutoSyncRoutes.has(route)) {
      window.dispatchEvent(new Event('zeedat-local-write'));
    }
  }

  return result;
}
