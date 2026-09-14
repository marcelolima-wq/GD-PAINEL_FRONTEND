(function () {
  window.uploadPanelMedia = async function (file, onProgress) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let config;
    try {
      const auth = await fetch('/api/media/sign', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: file.type, size: file.size }), signal: controller.signal
      });
      config = await auth.json();
      if (!auth.ok) throw new Error(config.error || 'Não foi possível autorizar o envio.');
    } finally { clearTimeout(timer); }
    const body = new FormData();
    Object.entries(config.parameters).forEach(([key, value]) => body.append(key, String(value)));
    body.append('file', file);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', config.url);
      xhr.timeout = 10 * 60 * 1000;
      xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total * 100); };
      xhr.onerror = () => reject(new Error('Conexão interrompida durante o envio.'));
      xhr.ontimeout = () => reject(new Error('O envio excedeu o tempo limite. Tente um arquivo menor.'));
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status < 200 || xhr.status >= 300) throw new Error(data.error?.message || 'Falha no armazenamento.');
          const url = new URL(data.secure_url);
          if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || data.public_id !== config.parameters.public_id || data.resource_type !== config.resourceType || !url.pathname.startsWith(`/${config.cloudName}/`)) throw new Error('Resposta de upload inválida.');
          resolve({ url: url.toString(), source: 'cloudinary' });
        } catch (error) { reject(error); }
      };
      xhr.send(body);
    });
  };
})();
