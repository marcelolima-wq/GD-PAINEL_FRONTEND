(function () {
  let csrfToken = '';
  const section = document.getElementById('googleLoginSection');
  const button = document.getElementById('googleLoginButton');
  const error = document.getElementById('loginError');

  function loadLibrary() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client?hl=pt-BR';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o acesso pelo Google.'));
      document.head.appendChild(script);
    });
  }

  async function handleCredential(response) {
    error.textContent = 'Validando sua conta Google...';
    try {
      const request = await fetch('/api/auth/google/login', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ credential: response.credential, csrfToken })
      });
      const data = await request.json();
      if (!request.ok) throw new Error(data.error || 'Não foi possível entrar com o Google.');
      error.textContent = '';
      await window.setAuthenticatedView();
    } catch (failure) {
      error.textContent = failure.message || 'Login com Google cancelado ou indisponível.';
    }
  }

  async function initialize() {
    try {
      const request = await fetch('/api/auth/google/config', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });
      const config = await request.json();
      if (!request.ok || !config.enabled) return;
      csrfToken = config.csrfToken;
      await loadLibrary();
      window.google.accounts.id.initialize({ client_id: config.clientId, callback: handleCredential, hd: config.allowedDomain, ux_mode: 'popup', auto_select: false });
      section.hidden = false;
      const width = Math.max(200, Math.floor(button.getBoundingClientRect().width || 390));
      window.google.accounts.id.renderButton(button, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'left', width, locale: 'pt-BR' });
    } catch (failure) {
      console.warn('Login com Google indisponível.', failure);
    }
  }

  window.disableGoogleAutoSelect = () => window.google?.accounts?.id?.disableAutoSelect();
  window.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
