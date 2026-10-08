# Validação da entrega

Executado em 08/10/2026.

- TypeScript: sem erros.
- Next.js production build: aprovado.
- 12 testes unitários/integração PostgreSQL aprovados: limite combinado, rotação, cooldown, horários passados, fuso, reagendamento, snapshots, deduplicação, links, limpeza de histórico sem remover pendências e proteção de destino push; migração executável, RLS entre dois usuários, conflitos de versão e leases da fila.
- 12 testes de navegador aprovados, Chromium, Android Pixel 7 emulado e desktop 1440px: cadastro completo, publicação manual, persistência, reagendamento, links inválidos e endpoints bloqueados.
- Axe: sem violações automáticas WCAG A/AA nas nove telas, Android e desktop.
- PWA: manifest, service worker, tela sem conexão e recuperação aprovados.
- CSV e backup: exportação e importação validada aprovadas.
- Revisão visual por screenshots mobile/desktop realizada.
- Deploy não realizado: Vercel retornou HTTP 403 para deploy no escopo thaleszcodes-projects. Projeto de destino criado, mas a conexão atual não autoriza a operação de deploy.

Teste emulado não equivale a instalar em aparelho físico. Testes PostgreSQL usam PGlite com auth.uid e roles equivalentes; não substituem advisors e verificação no projeto Supabase definitivo.

Em 08/10/2026, a migração foi aplicada ao FacebookScheduler (`mpxbbembbzxtwekwwrvw`). As três tabelas têm RLS ativo. Testes transacionais no banco real passaram para gravação, conflito de revisão e isolamento entre dois usuários; os dados de teste foram revertidos. O advisor retornou apenas a informação de ausência de política na fila interna, que não concede acesso a clientes. O build com a conexão pública passou, e a API rejeitou requisições anônimas com HTTP 401. O login autenticado em produção ainda não foi verificado.

Pendente por dependência externa: configuração Auth/SMTP, armazenamento autorizado das chaves privadas na Vercel, serviço de cron ativo, envio push real com app fechado e promoção de produção após smoke test autenticado.
