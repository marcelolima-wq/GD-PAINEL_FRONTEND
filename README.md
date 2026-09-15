# GD-PAINEL_FRONTEND

Interface web do GD Painel para login, biblioteca, playlists e reprodução nas TVs.

## Estrutura

```text
index.html
css/styles.css
js/app.js
```

## Execução

1. Instale Node.js 20 ou superior.
2. Execute `npm install` dentro de `frontend/`.
3. Execute `npm run dev`.

O login depende das rotas `/api/auth/login`, `/api/auth/session` e `/api/auth/logout` fornecidas pelo backend.

O acesso pelo Google usa a biblioteca oficial Google Identity Services. A tela consulta `/api/auth/google/config`, recebe somente o client ID público e troca o ID token em `/api/auth/google/login`; a validação, a restrição ao domínio corporativo e a criação da sessão acontecem no backend.

## Vercel

Crie outro projeto Vercel usando o mesmo repositório e configure **Root Directory** como `frontend`.

O arquivo `vercel.json` encaminha `/api/*` para `https://gd-painel-backend.vercel.app`, mantendo o cookie JWT no mesmo domínio usado pelo navegador.

## Persistência atual

Playlists e mídias ainda usam `localStorage` e `IndexedDB`. Para sincronizar aparelhos diferentes, será necessário migrar esses dados para banco e armazenamento compartilhados.
