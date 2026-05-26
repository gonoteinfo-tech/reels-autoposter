import { NextResponse } from 'next/server';
import {
  initDatabase,
  getReelById,
  updateReel,
  updateReelStage,
} from '@/services/database';
import type { ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * Publica um reel no Instagram via Graph API (Container workflow de 3 etapas).
 *
 * @param videoUrl - URL pública do vídeo (R2)
 * @param caption - Legenda do reel
 * @returns ID do post publicado
 */
async function publishToInstagram(videoUrl: string, caption: string): Promise<string> {
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !igAccountId) {
    throw new Error('Credenciais do Instagram não configuradas (FACEBOOK_PAGE_ACCESS_TOKEN e INSTAGRAM_BUSINESS_ACCOUNT_ID)');
  }

  // Etapa 1: Criar container de mídia
  const containerResponse = await fetch(
    `https://graph.facebook.com/v21.0/${igAccountId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        access_token: accessToken,
      }),
    }
  );

  const containerData = await containerResponse.json();
  if (containerData.error) {
    throw new Error(`Instagram Container Error: ${containerData.error.message}`);
  }

  const containerId = containerData.id;
  console.log(`📸 Container criado no Instagram: ${containerId}`);

  // Etapa 2: Aguardar processamento do container (polling)
  let status = 'IN_PROGRESS';
  let attempts = 0;
  const maxAttempts = 30; // Máximo 5 minutos (10s * 30)

  while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Aguardar 10s
    attempts++;

    const statusResponse = await fetch(
      `https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );
    const statusData = await statusResponse.json();

    if (statusData.error) {
      throw new Error(`Instagram Status Error: ${statusData.error.message}`);
    }

    status = statusData.status_code || 'IN_PROGRESS';
    console.log(`📸 Status do container ${containerId}: ${status} (tentativa ${attempts}/${maxAttempts})`);

    if (status === 'ERROR') {
      throw new Error(`Instagram processamento falhou: ${statusData.status || 'Erro desconhecido'}`);
    }
  }

  if (status !== 'FINISHED') {
    throw new Error('Instagram: Timeout aguardando processamento do vídeo');
  }

  // Etapa 3: Publicar o container
  const publishResponse = await fetch(
    `https://graph.facebook.com/v21.0/${igAccountId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );

  const publishData = await publishResponse.json();
  if (publishData.error) {
    throw new Error(`Instagram Publish Error: ${publishData.error.message}`);
  }

  console.log(`📸 Reel publicado no Instagram: ${publishData.id}`);
  return publishData.id;
}

/**
 * Publica um vídeo no Facebook via Graph API (Resumable Upload).
 *
 * @param videoUrl - URL pública do vídeo (R2)
 * @param caption - Descrição do vídeo
 * @returns ID do post publicado
 */
async function publishToFacebook(videoUrl: string, caption: string): Promise<string> {
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (!accessToken || !pageId) {
    throw new Error('Credenciais do Facebook não configuradas (FACEBOOK_PAGE_ACCESS_TOKEN e FACEBOOK_PAGE_ID)');
  }

  // Publicar vídeo na página via URL
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/videos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_url: videoUrl,
        description: caption,
        access_token: accessToken,
      }),
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(`Facebook Publish Error: ${data.error.message}`);
  }

  console.log(`📘 Vídeo publicado no Facebook: ${data.id}`);
  return data.id;
}

/**
 * POST /api/publish
 * Publica um reel específico no Instagram e/ou Facebook.
 *
 * @param request - Request com body: { reelId: number, targets: ('instagram' | 'facebook')[] }
 * @returns IDs dos posts publicados
 */
export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const body = await request.json();
    const { reelId, targets } = body as {
      reelId?: number;
      targets?: ('instagram' | 'facebook')[];
    };

    // Validações
    if (!reelId || typeof reelId !== 'number') {
      return NextResponse.json(
        { success: false, error: 'O campo "reelId" é obrigatório e deve ser um número' },
        { status: 400 }
      );
    }

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json(
        { success: false, error: 'O campo "targets" é obrigatório e deve conter pelo menos um destino' },
        { status: 400 }
      );
    }

    const validTargets = ['instagram', 'facebook'];
    for (const target of targets) {
      if (!validTargets.includes(target)) {
        return NextResponse.json(
          { success: false, error: `Target inválido: "${target}". Use "instagram" ou "facebook"` },
          { status: 400 }
        );
      }
    }

    // Buscar o reel
    const reel = getReelById(reelId);
    if (!reel) {
      return NextResponse.json(
        { success: false, error: `Reel com ID ${reelId} não encontrado` },
        { status: 404 }
      );
    }

    // Verificar se o reel tem URL pública (foi feito upload para R2)
    if (!reel.r2_url) {
      return NextResponse.json(
        {
          success: false,
          error: 'O reel ainda não possui uma URL pública. Execute o pipeline de upload primeiro',
        },
        { status: 422 }
      );
    }

    // Atualizar estágio para "publishing"
    updateReelStage(reelId, 'publishing');

    const result: { igPostId?: string; fbPostId?: string } = {};
    const updateData: Record<string, unknown> = {};

    // Publicar no Instagram
    if (targets.includes('instagram')) {
      try {
        const igPostId = await publishToInstagram(reel.r2_url, reel.caption || reel.original_caption);
        result.igPostId = igPostId;
        updateData.ig_post_id = igPostId;
        console.log(`✅ Reel #${reelId} publicado no Instagram: ${igPostId}`);
      } catch (igError) {
        console.error(`❌ Erro ao publicar no Instagram:`, igError);
        // Continuar mesmo se o Instagram falhar, tentar Facebook
        if (!targets.includes('facebook')) {
          updateReelStage(reelId, 'error', igError instanceof Error ? igError.message : 'Erro no Instagram');
          return NextResponse.json(
            { success: false, error: igError instanceof Error ? igError.message : 'Erro ao publicar no Instagram' },
            { status: 500 }
          );
        }
      }
    }

    // Publicar no Facebook
    if (targets.includes('facebook')) {
      try {
        const fbPostId = await publishToFacebook(reel.r2_url, reel.caption || reel.original_caption);
        result.fbPostId = fbPostId;
        updateData.fb_post_id = fbPostId;
        console.log(`✅ Reel #${reelId} publicado no Facebook: ${fbPostId}`);
      } catch (fbError) {
        console.error(`❌ Erro ao publicar no Facebook:`, fbError);
        if (!result.igPostId) {
          updateReelStage(reelId, 'error', fbError instanceof Error ? fbError.message : 'Erro no Facebook');
          return NextResponse.json(
            { success: false, error: fbError instanceof Error ? fbError.message : 'Erro ao publicar no Facebook' },
            { status: 500 }
          );
        }
      }
    }

    // Atualizar reel com os IDs de publicação
    if (result.igPostId || result.fbPostId) {
      updateReel(reelId, {
        ...updateData,
        stage: 'published',
        published_at: new Date().toISOString(),
      } as Parameters<typeof updateReel>[1]);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('❌ Erro ao publicar reel:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
