const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const token = localStorage.getItem('voting_auth_token');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    const error = new Error('Unable to reach the PHP backend. Start the PHP server and try again.');
    error.code = 'network_error';
    throw error;
  }

  const responseText = await response.text();
  let payload;
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    const error = new Error(
      'The PHP backend returned an invalid response. Make sure it is running at http://127.0.0.1:8000.'
    );
    error.code = 'invalid_api_response';
    error.status = response.status;
    throw error;
  }
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || 'The request could not be completed.');
    error.code = payload.code || 'request_failed';
    error.status = response.status;
    throw error;
  }

  return payload;
}
