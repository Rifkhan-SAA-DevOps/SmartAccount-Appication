export function apiBaseUrl() {
  return import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
}

export function authHeaders() {
  const token = localStorage.getItem('smartledger_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function openAuthenticatedPrint(path) {
  const url = `${apiBaseUrl()}${path}`;
  const win = window.open('', '_blank', 'width=420,height=720');
  if (!win) {
    alert('Popup blocked. Please allow popups for this site.');
    return;
  }
  win.document.write('<p style="font-family:Arial;padding:20px">Preparing print preview...</p>');
  fetch(url, { headers: authHeaders() })
    .then(async (res) => {
      const text = await res.text();
      if (!res.ok) throw new Error(text || 'Failed to open print preview');
      win.document.open();
      win.document.write(text);
      win.document.close();
    })
    .catch((error) => {
      win.document.open();
      win.document.write(`<pre style="font-family:Arial;padding:20px;color:#b91c1c;white-space:pre-wrap">${error.message}</pre>`);
      win.document.close();
    });
}
