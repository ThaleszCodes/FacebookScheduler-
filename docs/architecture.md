# Arquitetura e contratos

## Fluxo principal

Grupo + post → campanha → revisão → agendamentos → publicador assistido → abrir Facebook → confirmação manual → histórico/relatórios.

O planejador distribui horários determinísticos dentro da janela diária, alterna grupos e posts, respeita intervalo por grupo e o limite total entre campanhas. Um horário passado ou em conflito é omitido com aviso na revisão; o usuário aprova uma quantidade concreta. A revisão precisa continuar válida no momento de salvar.

## Responsabilidades

- `lib/model.ts`: esquemas Zod, tipos e datas em America/Sao_Paulo.
- `lib/scheduler.ts`: planejamento/reagendamento sem I/O, com relógio injetável nos testes.
- `lib/transport.ts`: payload versionado e imagens deduplicadas.
- `lib/use-workspace.ts`: estado, persistência local ou API autenticada, compare-and-swap e mensagens de conflito.
- `components/scheduler-app.tsx`: superfícies dos módulos e ações. Design consistente de listas, calendário, editor, fila e relatórios; navegação móvel fixa e menu lateral para funções secundárias.
- `app/api/state`: validação de entrada, autenticação server-side e RPC atômica.
- `app/api/push`: gestão de assinaturas por usuário.
- `app/api/cron`: envio VAPID no servidor, validação do segredo e rechecagem de elegibilidade.
- Supabase: auth, workspace JSONB privado, assinaturas privadas e fila de lembretes interna.
- `public/sw.js`: cache apenas do fallback offline, push e abertura da fila. Não armazena respostas API nem documentos com dados de outros usuários.

## Modelo e integridade

Cada conta possui um workspace. Grupos, posts e campanhas têm IDs UUID. Jobs referenciam esses IDs e guardam snapshots do texto, imagem e grupo. Editar a biblioteca não modifica posts agendados. Ao editar horários de campanha, os horários restantes anteriores são cancelados e os novos são aprovados na revisão; resultados já registrados são preservados.

Estados de job: scheduled, published, pending, failed, skipped, cancelled. Abrir o Facebook e copiar conteúdo não mudam o status. Apenas ação manual explícita cria resultado. Pendentes ou recusados podem receber um resultado atualizado. O app não consulta o Facebook para comprovar informações.

Todos os estados, exceto skipped/cancelled, consomem a cota do dia agendado. Pausar não libera os horários reservados. Mínimo global de 15 minutos; intervalo por grupo configurável entre 1 e 720 horas. O usuário é avisado de horários vencidos e pode reagendá-los.

## Concorrência

O cliente envia revisão esperada com o payload. O RPC trava o workspace/primeira criação e incrementa a revisão em uma transação. Um dispositivo com revisão antiga recebe HTTP 409. No modo local, Web Locks serializa a escrita entre abas e o evento storage recarrega alterações externas. Erros de quota não alteram o estado confirmado na interface.

## Design

Superfície clara e verde profundo para navegação/ação. Dashboard com fila diária e próximo post; grupos em linhas, biblioteca em prévias de conteúdo, calendário mensal e publicador com conteúdo + três ações. Os números vêm exclusivamente do estado real; primeiro uso inicia vazio. Sem métricas fictícias, painéis decorativos ou acesso não solicitado ao Facebook.

## Evolução

Esta versão é para um workspace pessoal por conta. JSONB permite commit atômico simples, com limites explícitos e validação. Para maior escala: normalizar coleções e histórico, mover assets para Storage com RLS, paginação server-side e workers dedicados para notificações. Não foi introduzida estrutura multiusuário de equipes sem requisito do produto.
