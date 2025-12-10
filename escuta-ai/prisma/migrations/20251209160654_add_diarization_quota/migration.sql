-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "password" TEXT NOT NULL,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT,
    "language" TEXT,
    "duration" INTEGER,
    "word_count" INTEGER,
    "status" "TranscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "job_id" TEXT,
    "error_message" TEXT,
    "processing_time" INTEGER,
    "cost" DECIMAL(10,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "transcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speakers" (
    "id" TEXT NOT NULL,
    "transcription_id" TEXT NOT NULL,
    "speaker_id" TEXT NOT NULL,
    "name" TEXT,
    "characteristics" TEXT,
    "confidence" DOUBLE PRECISION,
    "first_segment_id" TEXT,
    "last_segment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcription_segments" (
    "id" TEXT NOT NULL,
    "transcription_id" TEXT NOT NULL,
    "speaker_id" TEXT,
    "start_time" DOUBLE PRECISION NOT NULL,
    "end_time" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "transcription_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_quotas" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "monthly_minutes_limit" INTEGER NOT NULL DEFAULT 120,
    "used_minutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_transcriptions" INTEGER NOT NULL DEFAULT 0,
    "diarization_minutes_limit" INTEGER NOT NULL DEFAULT 90,
    "used_diarization_minutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_reset_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "transcriptions_user_id_idx" ON "transcriptions"("user_id");

-- CreateIndex
CREATE INDEX "transcriptions_status_idx" ON "transcriptions"("status");

-- CreateIndex
CREATE INDEX "transcriptions_created_at_idx" ON "transcriptions"("created_at");

-- CreateIndex
CREATE INDEX "speakers_transcription_id_idx" ON "speakers"("transcription_id");

-- CreateIndex
CREATE UNIQUE INDEX "speakers_transcription_id_speaker_id_key" ON "speakers"("transcription_id", "speaker_id");

-- CreateIndex
CREATE INDEX "transcription_segments_transcription_id_idx" ON "transcription_segments"("transcription_id");

-- CreateIndex
CREATE INDEX "transcription_segments_speaker_id_idx" ON "transcription_segments"("speaker_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_quotas_user_id_key" ON "usage_quotas"("user_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcriptions" ADD CONSTRAINT "transcriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_transcription_id_fkey" FOREIGN KEY ("transcription_id") REFERENCES "transcriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcription_segments" ADD CONSTRAINT "transcription_segments_transcription_id_fkey" FOREIGN KEY ("transcription_id") REFERENCES "transcriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_quotas" ADD CONSTRAINT "usage_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
