# Facebook Group Scheduler

Aplicação pessoal mobile-first para campanhas distribuídas entre grupos do Facebook. Stack: Next.js 16, React 19, Tailwind CSS 4, Supabase, Vercel, PWA e Web Push. O Facebook não é autenticado pelo app. A publicação acontece manualmente no Facebook; o usuário informa o resultado aqui.

## Executar

```bash
npm ci
npm run dev
```

Sem configuração Supabase, o app funciona no modo **neste dispositivo**, explicitamente indicado na interface. Os dados são persistidos no navegador com versão, backup e proteção contra conflito entre abas. Não use esse modo como backup único: limpar o navegador ou trocar o domínio muda o acesso aos dados.

## Entregas

- P0: grupos, posts com imagem/link, campanhas, revisão dos horários, limite global de 10/dia, calendário, fila assistida e confirmação manual.
- P1: edição, duplicação/arquivamento de posts, pausa de grupos e campanhas, edição de horários de campanha preservando os resultados, cancelamento de horários restantes, reagendamento, resultados pendentes/recusados e histórico.
- P2: relatórios com dados informados, CSV, backup JSON/importação validada, limpeza confirmada do histórico encerrado há mais de 90 dias, ícones/manifest PWA, instalação Android, fallback offline e infraestrutura Web Push com fila de lembretes, leases e retries.

## Conectar o Supabase

1. Projeto conectado: **FacebookScheduler**, organização **thaleszcodes' projects**, referência `mpxbbembbzxtwekwwrvw`. A migração inicial foi aplicada em 08/10/2026; gravação, conflito de versão e isolamento entre usuários foram verificados no banco real com rollback dos dados de teste.
2. Para reproduzir em outro projeto, aplique `supabase/migrations/20261008134008_initial_scheduler.sql` pelo fluxo de migração do Supabase ou SQL Editor. Não reaplique no projeto conectado.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` na Vercel e em `.env.local` para desenvolvimento. A chave publicável pertence ao navegador; `SUPABASE_SECRET_KEY` é exclusivamente servidor e só é necessária para lembretes.
4. Supabase Auth: habilite e-mail/senha, mantenha confirmação de e-mail e configure o Site URL do domínio definitivo. Adicione a origem e `/reset` às URLs de redirecionamento permitidas. Configure um SMTP de produção para o volume de e-mail necessário.
5. Faça o redeploy para que as variáveis públicas sejam incorporadas ao build.
6. Teste criação de conta, confirmação, entrada, recuperação, gravação e conflito em dois dispositivos. Importe o backup do modo local pela tela Configurações se quiser migrar seus dados.

As tabelas possuem RLS por `auth.uid()`; a fila interna não é acessível ao navegador. `scheduler_save` é uma operação compare-and-swap protegida por lock para impedir sobrescritas silenciosas. O banco também verifica limite diário e integridade de referências.

## Web Push e lembretes

Execute `npm run vapid` **em um terminal privado**. Guarde `VAPID_PRIVATE_KEY` e `CRON_SECRET` como segredos nas configurações da Vercel. Nunca cole esses valores em source control, relatórios ou logs públicos. Configure:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`: uma URL HTTPS de contato do projeto ou mailto válido
- `CRON_SECRET`: valor aleatório forte
- `SUPABASE_SECRET_KEY`: chave de servidor do projeto correto

A configuração automática dessas chaves foi bloqueada pela revisão de autorização; não estão configuradas no deploy.

Use apenas uma origem do cron:

- Vercel Pro: use o conteúdo de `vercel.pro.example.json` em `vercel.json`.
- Vercel Hobby: o cron nativo só executa uma vez ao dia. Para lembretes frequentes, `supabase/cron-setup.example.sql` oferece uma alternativa com Supabase Cron, pg_net e Vault. Configure os segredos no Vault pela interface; o script não contém valores privados. O endpoint `/api/cron` recebe GET autenticado com Bearer CRON_SECRET.

A fila envia lembretes desde 5 minutos antes até 30 minutos após o horário, em lotes de 10. Pausas, cancelamentos e reagendamentos são rechecados antes do envio. As assinaturas têm destino HTTP limitado aos provedores suportados; endpoints expirados são removidos. Locks/leases reduzem duplicação, mas uma falha entre envio e persistência pode causar reenvio: a tag da notificação mantém uma única notificação exibida.

Após configurar, ative notificações no Chrome Android e confirme uma entrega com o app fechado. Esse teste real depende das credenciais e não foi executado nesta entrega.

## Deploy

Projeto Vercel criado: `facebook-group-scheduler`.

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

A configuração padrão é compatível com Hobby e não ativa um cron pago. O primeiro deploy de revisão pode usar modo neste dispositivo. Para colocar em produção, conecte o banco e verifique autenticação e push antes de promover a versão. Use um domínio estável: os dados locais são vinculados à origem.

## Limites desta versão

Espaço individual de até 200 grupos, 200 posts, 100 campanhas, 5.000 horários e 10.000 registros; payload compacto de até 3,8 MB. Imagens são redimensionadas para até 1.400 pixels, convertidas em JPEG e deduplicadas no transporte/backup. Trata-se de uma primeira versão pessoal; um acervo grande deve migrar as imagens para Supabase Storage e as coleções para tabelas normalizadas. O app avisa quando o limite de armazenamento é atingido e não descarta dados silenciosamente.

O relatório mede somente resultados informados. Nenhum alcance, clique, engajamento ou confirmação automática é atribuído ao Facebook. A PWA mostra uma tela de recuperação ao abrir sem conexão; novas edições e confirmação com sincronização requerem conexão.

## Segurança e operação

Nenhum cookie, senha ou token do Facebook é solicitado. Nenhuma API não oficial, robô de postagem ou mecanismo de contorno de bloqueio está implementado. A meta de 10/dia é uma regra de organização; regras de cada grupo e restrições da plataforma precisam ser respeitadas pelo operador. Grupos são pausáveis, as regras aparecem antes da publicação e resultados aguardando aprovação ficam separados de publicados.

Fontes consultadas: documentação Next.js PWA, Supabase Auth/RLS/changelog e Vercel Cron. Arquitetura e validação estão em `docs/architecture.md` e `docs/validation.md`.
