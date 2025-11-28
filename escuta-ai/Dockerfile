FROM oven/bun:1 AS base

WORKDIR /app

# Instalar dependências do sistema (FFmpeg para processamento de áudio)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copiar arquivos de dependências
COPY package.json bun.lock* ./

# Instalar dependências
RUN bun install --frozen-lockfile

# Copiar código fonte
COPY . .

# Gerar Prisma Client
RUN bunx prisma generate

# Build da aplicação
RUN bun run build

# Expor porta
EXPOSE 3000

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

# Comando padrão
CMD ["bun", "run", "start"]
