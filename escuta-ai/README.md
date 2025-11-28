# Escuta AI 🎙️

Aplicação de transcrição de áudio usando a API Whisper da OpenAI.

## Funcionalidades

- ✅ Gravação de áudio diretamente no navegador (até 1 hora)
- ✅ Upload de arquivos de áudio (MP3, WAV, M4A, WEBM, etc.)
- ✅ Transcrição usando Whisper da OpenAI
- ✅ Histórico de transcrições
- ✅ Autenticação com email/senha
- ✅ Quota de 2 horas mensais por usuário
- ✅ Segmentos com timestamps

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Autenticação**: NextAuth v5 (Auth.js)
- **Banco de Dados**: PostgreSQL + Prisma ORM
- **Fila de Processamento**: BullMQ + Redis
- **Transcrição**: OpenAI Whisper API
- **Runtime**: Bun
- **Container**: Docker

## Estrutura do Projeto

\`\`\`
escuta-ai/
├── src/
│   ├── app/                    # App Router (páginas)
│   │   ├── api/                # API Routes
│   │   │   ├── auth/           # NextAuth endpoints
│   │   │   ├── transcription/  # Transcrição CRUD
│   │   │   ├── transcriptions/ # Listagem
│   │   │   └── quota/          # Quota do usuário
│   │   ├── dashboard/          # Área logada
│   │   ├── login/              # Página de login
│   │   └── register/           # Página de registro
│   ├── components/             # Componentes React
│   ├── lib/                    # Utilitários e configurações
│   ├── workers/                # Workers de background
│   ├── auth.ts                 # Configuração NextAuth
│   └── middleware.ts           # Middleware de autenticação
├── prisma/
│   └── schema.prisma           # Schema do banco de dados
├── docker-compose.yml
├── Dockerfile
└── package.json
\`\`\`

## Schema do Banco de Dados

| Tabela | Descrição |
|--------|-----------|
| \`users\` | Usuários do sistema |
| \`accounts\` | Contas OAuth (NextAuth) |
| \`sessions\` | Sessões ativas |
| \`transcriptions\` | Transcrições realizadas |
| \`transcription_segments\` | Segmentos com timestamps |
| \`usage_quotas\` | Controle de uso por usuário |

## Configuração

### 1. Variáveis de Ambiente

Copie o arquivo \`.env.example\` para \`.env\` e preencha:

\`\`\`bash
cp .env.example .env
\`\`\`

\`\`\`env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/escuta_ai"
REDIS_URL="redis://localhost:6379"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="sua-chave-secreta"
OPENAI_API_KEY="sk-sua-chave-openai"
\`\`\`

### 2. Rodar com Docker (Recomendado)

\`\`\`bash
# Iniciar todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Parar serviços
docker-compose down
\`\`\`

### 3. Desenvolvimento Local

\`\`\`bash
# Instalar dependências
bun install

# Iniciar banco de dados e Redis
docker-compose up -d db redis

# Gerar Prisma Client
bun run db:generate

# Aplicar schema no banco
bun run db:push

# Iniciar aplicação
bun run dev

# Em outro terminal, iniciar worker
bun run worker
\`\`\`

## Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| \`bun run dev\` | Inicia servidor de desenvolvimento |
| \`bun run build\` | Build de produção |
| \`bun run start\` | Inicia servidor de produção |
| \`bun run worker\` | Inicia worker de transcrição |
| \`bun run db:generate\` | Gera Prisma Client |
| \`bun run db:push\` | Aplica schema no banco |
| \`bun run db:migrate\` | Cria migration |
| \`bun run db:studio\` | Abre Prisma Studio |

## Limites da API Whisper

- **Tamanho máximo por requisição**: 25MB
- **Formatos suportados**: mp3, mp4, mpeg, mpga, m4a, wav, webm
- **Custo**: ~\$0.006 por minuto de áudio

## Roadmap

- [ ] Providers OAuth (Google, GitHub)
- [ ] Planos pagos com mais quota
- [ ] Exportação em múltiplos formatos (SRT, VTT, DOCX)
- [ ] Edição de transcrições
- [ ] Diarização (identificar falantes)
- [ ] Chunking para áudios > 25MB

## Licença

MIT
