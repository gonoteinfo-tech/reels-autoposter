import { NextResponse } from 'next/server';
import { getReelById, updateReel } from '@/services/database';
import { processReel } from '@/services/pipeline';
import fs from 'fs';

/**
 * POST /api/reels/reprocess
 * Reprocessa um reel com erro resetando para a etapa adequada e rodando em background.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { reelId } = body as { reelId?: number };

    if (!reelId) {
      return NextResponse.json(
        { success: false, error: 'O campo "reelId" é obrigatório' },
        { status: 400 }
      );
    }

    const reel = getReelById(Number(reelId));
    if (!reel) {
      return NextResponse.json(
        { success: false, error: 'Reel não encontrado' },
        { status: 404 }
      );
    }

    // Determinar o estágio para redefinir com base nos arquivos locais existentes
    let targetStage: 'discovered' | 'downloaded' | 'processed' | 'uploaded' = 'discovered';
    
    if (reel.r2_url) {
      targetStage = 'uploaded'; // Tem R2 url, pode tentar apenas publicar de novo
    } else if (reel.processed_path && fs.existsSync(reel.processed_path)) {
      targetStage = 'processed'; // Tem vídeo processado localmente, pula download e processamento
    } else if (reel.local_path && fs.existsSync(reel.local_path)) {
      targetStage = 'downloaded'; // Tem vídeo original baixado localmente, pula download
    }

    // Atualizar estágio e limpar mensagem de erro no banco
    updateReel(reel.id, {
      stage: targetStage,
      error_message: null,
    });

    console.log(`🔄 [Reprocessar] Reel #${reel.id} redefinido para o estágio "${targetStage}". Iniciando pipeline em background...`);

    // Disparar o pipeline em background sem dar await para retornar resposta rápida para a UI
    processReel(reel.id).catch((err) => {
      console.error(`❌ [Reprocessar] Erro em background ao reprocessar Reel #${reel.id}:`, err);
    });

    return NextResponse.json({
      success: true,
      message: `Reprocessamento iniciado a partir do estágio: ${targetStage}`,
      data: {
        stage: targetStage
      }
    });
  } catch (error) {
    console.error('❌ Erro no endpoint de reprocessamento:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
