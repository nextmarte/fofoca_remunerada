import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixMissingSpeakerIds() {
  console.log("🔍 Buscando transcrições com speakers mas segmentos sem speakerId...\n");
  
  // Buscar transcrições com speakers mas segmentos sem speakerId
  const transcriptions = await prisma.transcription.findMany({
    where: {
      speakers: {
        some: {},  // Tem speakers
      },
      segments: {
        some: {
          speakerId: null,  // Mas tem segmentos sem speakerId
        },
      },
    },
    include: {
      speakers: true,
      segments: {
        where: {
          speakerId: null,
        },
        orderBy: { startTime: "asc" },
      },
    },
  });

  console.log(`📊 Encontradas ${transcriptions.length} transcrições para corrigir\n`);

  if (transcriptions.length === 0) {
    console.log("✅ Nenhuma transcrição precisa de correção!");
    return;
  }

  for (const transcription of transcriptions) {
    console.log(`\n🔧 Corrigindo transcrição: ${transcription.id}`);
    console.log(`   Título: ${transcription.title || "Sem título"}`);
    console.log(`   Speakers disponíveis: ${transcription.speakers.length}`);
    console.log(`   Segmentos sem speaker: ${transcription.segments.length}`);
    
    if (transcription.speakers.length === 0) {
      console.log("   ⚠️  Nenhum speaker disponível, pulando...");
      continue;
    }
    
    // Heurística simples: alternar entre speakers disponíveis
    const speakers = transcription.speakers;
    let currentSpeakerIndex = 0;
    let updatedCount = 0;
    
    for (const segment of transcription.segments) {
      try {
        await prisma.transcriptionSegment.update({
          where: { id: segment.id },
          data: { 
            speakerId: speakers[currentSpeakerIndex % speakers.length].speakerId 
          },
        });
        
        updatedCount++;
        
        // Alternar speaker a cada 2-3 segmentos (heurística simples)
        if (Math.random() > 0.6) {
          currentSpeakerIndex = (currentSpeakerIndex + 1) % speakers.length;
        }
      } catch (error) {
        console.error(`   ❌ Erro ao atualizar segmento ${segment.id}:`, error);
      }
    }
    
    console.log(`   ✅ ${updatedCount} segmentos atualizados com sucesso`);
  }
  
  console.log("\n\n🎉 Processo de correção concluído!");
  console.log("\n💡 Dica: Para melhor precisão, use o botão 'Reprocessar Speakers' na interface.");
}

fixMissingSpeakerIds()
  .then(() => {
    console.log("\n✅ Script finalizado com sucesso!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro durante execução do script:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
