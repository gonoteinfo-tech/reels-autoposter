import { NextResponse } from 'next/server';
import {
  initDatabase,
  getSourceById,
  getReelByUrl,
  createReel,
  updateSourceLastChecked,
  getAppSettings,
} from '@/services/database';
import { discoverReels, extractInstagramId } from '@/services/instagram-downloader';
import { processReel } from '@/services/pipeline';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * POST /api/sources/import
 * Varre e importa manualmente novos reels de um perfil-fonte específico.
 * Dispara o processamento em background para os novos itens.
 */
export async function POST(request: Request) {
  try {
    ensureDb();
    const body = await request.json();
    const { sourceId } = body as { sourceId?: number };

    if (!sourceId) {
      return NextResponse.json(
        { success: false, error: 'O ID do perfil-fonte (sourceId) é obrigatório' },
        { status: 400 }
      );
    }

    const source = getSourceById(Number(sourceId));
    if (!source) {
      return NextResponse.json(
        { success: false, error: 'Perfil-fonte não encontrado no banco' },
        { status: 404 }
      );
    }

    if (source.username === 'manual') {
      return NextResponse.json(
        { success: false, error: 'Não é possível varrer a fonte manual' },
        { status: 400 }
      );
    }

    const settings = getAppSettings();
    const maxReels = settings.max_reels_per_run;

    console.log(`📥 [Importar Manual] Varrendo @${source.username} (limite: ${maxReels})...`);

    // Varredura síncrona dos Reels para saber quantos foram descobertos
    const urls = await discoverReels(source.username, maxReels);
    
    let newCount = 0;
    const newReelIds: number[] = [];

    for (const url of urls) {
      const existing = getReelByUrl(url);
      if (existing) continue;

      const instagramId = extractInstagramId(url);
      const newReel = createReel({
        source_id: source.id,
        source_username: source.username,
        instagram_url: url,
        instagram_id: instagramId || undefined,
      });

      newReelIds.push(newReel.id);
      newCount++;
    }

    // Atualizar data da última verificação
    updateSourceLastChecked(source.id);

    // Se existirem novos Reels, disparar o pipeline em background
    if (newReelIds.length > 0) {
      console.log(`📥 [Importar Manual] Disparando pipeline em background para ${newReelIds.length} novos reels...`);
      for (const reelId of newReelIds) {
        processReel(reelId).catch((err) => {
          console.error(`❌ Erro em background ao processar Reel #${reelId}:`, err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Varredura concluída. ${newCount} novos reels foram importados de @${source.username}.`,
      data: {
        newReelsCount: newCount,
      }
    });
  } catch (error) {
    console.error('❌ Erro no endpoint de importação manual:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
