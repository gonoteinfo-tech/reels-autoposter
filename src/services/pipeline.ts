import path from 'path';
import fs from 'fs';
import type { PipelineResult, ReelStage } from '@/types';
import {
  initDatabase,
  getActiveSources,
  getReelByUrl,
  createReel,
  updateReelStage,
  updateReel,
  updateSourceLastChecked,
  getReelsByStage,
  getReelById,
  getAppSettings,
} from './database';
import { discoverReels, downloadReel, extractInstagramId } from './instagram-downloader';
import { addLogoToVideo } from './video-processor';
import { uploadVideo, generateR2Key } from './storage';
import { publishReel as publishToInstagram } from './instagram-publisher';
import { publishReelToPage } from './facebook-publisher';
import { rewriteCaption } from './ai-caption';

/** Diretórios de trabalho do pipeline */
const DOWNLOADS_DIR = path.join(process.cwd(), 'data', 'downloads');
const PROCESSED_DIR = path.join(process.cwd(), 'data', 'processed');
const LOGO_PATH = path.join(process.cwd(), 'public', 'logos', 'logo.png');

/**
 * Garante que os diretórios de trabalho existem.
 */
function ensureDirectories(): void {
  for (const dir of [DOWNLOADS_DIR, PROCESSED_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Mede o tempo de execução de uma etapa e retorna um PipelineResult.
 */
async function measureStage(
  reelId: number,
  stage: ReelStage,
  fn: () => Promise<string>
): Promise<PipelineResult> {
  const start = Date.now();
  try {
    const message = await fn();
    return {
      reel_id: reelId,
      stage,
      success: true,
      message,
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      reel_id: reelId,
      stage,
      success: false,
      message: errorMsg,
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Processa um reel individual por todas as etapas do pipeline.
 * Cada etapa atualiza o estágio no banco de dados.
 *
 * Pipeline: download → process (add logo) → upload to R2 → publish to IG + FB
 *
 * @param reelId ID do reel no banco de dados
 * @returns Array de resultados para cada etapa executada
 */
export async function processReel(reelId: number): Promise<PipelineResult[]> {
  console.log(`\n🔄 ===== Processando Reel #${reelId} =====`);
  const results: PipelineResult[] = [];
  const settings = getAppSettings();

  ensureDirectories();

  let reel = getReelById(reelId);
  if (!reel) {
    const result: PipelineResult = {
      reel_id: reelId,
      stage: 'error',
      success: false,
      message: `Reel #${reelId} não encontrado no banco de dados`,
      duration_ms: 0,
    };
    results.push(result);
    return results;
  }

  // ── Etapa 1: Download ──
  if (reel.stage === 'discovered' || reel.stage === 'downloading') {
    const downloadResult = await measureStage(reelId, 'downloading', async () => {
      updateReelStage(reelId, 'downloading');

      const { filePath, metadata } = await downloadReel(reel!.instagram_url, DOWNLOADS_DIR);

      const originalCaption = metadata.description || metadata.title || '';
      
      // Reescrever a legenda original se nenhuma legenda customizada existir
      let finalCaption = reel!.caption;
      if (!finalCaption) {
        finalCaption = await rewriteCaption(originalCaption);
      }

      updateReel(reelId, {
        local_path: filePath,
        duration_seconds: metadata.duration || 0,
        original_caption: originalCaption,
        caption: finalCaption,
        stage: 'downloaded',
      });

      return `Download concluído: ${path.basename(filePath)} (${metadata.duration}s)`;
    });

    results.push(downloadResult);

    if (!downloadResult.success) {
      updateReelStage(reelId, 'error', downloadResult.message);
      console.log(`❌ Reel #${reelId} falhou no download: ${downloadResult.message}`);
      return results;
    }

    // Recarregar reel atualizado
    reel = getReelById(reelId)!;
  }

  // ── Etapa 2: Processamento (adicionar logo) ──
  if (reel.stage === 'downloaded' || reel.stage === 'processing') {
    const processResult = await measureStage(reelId, 'processing', async () => {
      updateReelStage(reelId, 'processing');

      const outputFilename = `processed_${reelId}_${Date.now()}.mp4`;
      const outputPath = path.join(PROCESSED_DIR, outputFilename);

      // Verificar se a logo existe
      if (fs.existsSync(LOGO_PATH)) {
        await addLogoToVideo(
          reel!.local_path!,
          LOGO_PATH,
          outputPath,
          settings.logo_position,
          settings.logo_scale
        );
      } else {
        console.log('🎬 Logo não encontrada, copiando vídeo sem processamento');
        fs.copyFileSync(reel!.local_path!, outputPath);
      }

      updateReel(reelId, {
        processed_path: outputPath,
        stage: 'processed',
      });

      return `Processamento concluído: ${outputFilename}`;
    });

    results.push(processResult);

    if (!processResult.success) {
      updateReelStage(reelId, 'error', processResult.message);
      console.log(`❌ Reel #${reelId} falhou no processamento: ${processResult.message}`);
      return results;
    }

    reel = getReelById(reelId)!;
  }

  // ── Etapa 3: Upload para R2 ──
  if (reel.stage === 'processed' || reel.stage === 'uploading') {
    const uploadResult = await measureStage(reelId, 'uploading', async () => {
      updateReelStage(reelId, 'uploading');

      const r2Key = generateR2Key(reelId, reel!.source_username);
      const r2Url = await uploadVideo(reel!.processed_path!, r2Key);

      updateReel(reelId, {
        r2_url: r2Url,
        stage: 'uploaded',
      });

      return `Upload concluído: ${r2Url}`;
    });

    results.push(uploadResult);

    if (!uploadResult.success) {
      updateReelStage(reelId, 'error', uploadResult.message);
      console.log(`❌ Reel #${reelId} falhou no upload: ${uploadResult.message}`);
      return results;
    }

    reel = getReelById(reelId)!;
  }

  // ── Etapa 4: Publicação no Instagram + Facebook ──
  if (reel.stage === 'uploaded' || reel.stage === 'publishing') {
    const publishResult = await measureStage(reelId, 'publishing', async () => {
      updateReelStage(reelId, 'publishing');

      const caption = buildCaption(reel!.caption, reel!.hashtags, settings.custom_caption_template);
      const publishMessages: string[] = [];

      // Publicar no Instagram
      if (settings.instagram_enabled) {
        try {
          const { mediaId } = await publishToInstagram(reel!.r2_url!, caption);
          updateReel(reelId, { ig_post_id: mediaId });
          publishMessages.push(`IG: ${mediaId}`);
        } catch (igError) {
          const igMsg = igError instanceof Error ? igError.message : String(igError);
          console.error(`❌ Falha na publicação IG do Reel #${reelId}: ${igMsg}`);
          publishMessages.push(`IG: FALHA - ${igMsg}`);
        }
      }

      // Publicar no Facebook
      if (settings.facebook_enabled) {
        try {
          const fbPostId = await publishReelToPage(reel!.r2_url!, caption);
          updateReel(reelId, { fb_post_id: fbPostId });
          publishMessages.push(`FB: ${fbPostId}`);
        } catch (fbError) {
          const fbMsg = fbError instanceof Error ? fbError.message : String(fbError);
          console.error(`❌ Falha na publicação FB do Reel #${reelId}: ${fbMsg}`);
          publishMessages.push(`FB: FALHA - ${fbMsg}`);
        }
      }

      // Verificar se pelo menos uma publicação teve sucesso
      const reelUpdated = getReelById(reelId)!;
      if (reelUpdated.ig_post_id || reelUpdated.fb_post_id) {
        updateReel(reelId, {
          stage: 'published',
          published_at: new Date().toISOString(),
        });
        return `Publicação concluída: ${publishMessages.join(' | ')}`;
      } else {
        throw new Error(`Nenhuma plataforma publicou com sucesso: ${publishMessages.join(' | ')}`);
      }
    });

    results.push(publishResult);

    if (!publishResult.success) {
      updateReelStage(reelId, 'error', publishResult.message);
      console.log(`❌ Reel #${reelId} falhou na publicação: ${publishResult.message}`);
      return results;
    }
  }

  console.log(`✅ Reel #${reelId} processado com sucesso!`);
  return results;
}

/**
 * Executa o pipeline completo:
 * 1. Descobre novos reels de todos os perfis-fonte ativos
 * 2. Processa cada reel pelo pipeline
 *
 * Respeita o limite MAX_REELS_PER_RUN.
 */
export async function runPipeline(): Promise<void> {
  console.log('\n🚀 ===== Iniciando Pipeline =====');
  console.log(`⏰ ${new Date().toISOString()}`);
  const startTime = Date.now();

  try {
    // Inicializar banco de dados
    initDatabase();
    ensureDirectories();

    const settings = getAppSettings();
    const maxReels = settings.max_reels_per_run;

    // Fase 1: Descobrir novos reels
    console.log('\n📥 ── Fase de Descoberta ──');
    const activeSources = getActiveSources();

    if (activeSources.length === 0) {
      console.log('📥 Nenhum perfil-fonte ativo. Encerrando pipeline.');
      return;
    }

    console.log(`📥 ${activeSources.length} perfis-fonte ativos`);

    let totalDiscovered = 0;

    for (const source of activeSources) {
      if (source.username === 'manual') continue;
      try {
        console.log(`\n📥 Descobrindo reels de @${source.username}...`);
        const urls = await discoverReels(source.username, maxReels);

        let newCount = 0;
        for (const url of urls) {
          // Verificar se já existe no banco
          const existing = getReelByUrl(url);
          if (existing) {
            continue;
          }

          // Extrair ID do Instagram
          const instagramId = extractInstagramId(url);

          // Criar registro no banco
          createReel({
            source_id: source.id,
            source_username: source.username,
            instagram_url: url,
            instagram_id: instagramId || undefined,
          });

          newCount++;
          totalDiscovered++;
        }

        updateSourceLastChecked(source.id);
        console.log(`📥 @${source.username}: ${newCount} novos reels (${urls.length} total encontrados)`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Erro ao descobrir reels de @${source.username}: ${msg}`);
      }
    }

    console.log(`\n📥 Total de novos reels descobertos: ${totalDiscovered}`);

    // Fase 2: Processar reels pendentes
    console.log('\n🔄 ── Fase de Processamento ──');

    // Buscar reels em estágios que precisam de processamento
    const pendingStages: ReelStage[] = [
      'discovered',
      'downloading',
      'downloaded',
      'processing',
      'processed',
      'uploading',
      'uploaded',
      'publishing',
    ];

    const pendingReels: { id: number; stage: ReelStage }[] = [];
    for (const stage of pendingStages) {
      const reels = getReelsByStage(stage, maxReels - pendingReels.length);
      for (const reel of reels) {
        if (pendingReels.length >= maxReels) break;
        pendingReels.push({ id: reel.id, stage: reel.stage });
      }
      if (pendingReels.length >= maxReels) break;
    }

    if (pendingReels.length === 0) {
      console.log('🔄 Nenhum reel pendente para processar.');
    } else {
      console.log(`🔄 ${pendingReels.length} reels para processar (limite: ${maxReels})`);

      let successCount = 0;
      let errorCount = 0;

      for (const pending of pendingReels) {
        try {
          const results = await processReel(pending.id);
          const hasError = results.some((r) => !r.success);

          if (hasError) {
            errorCount++;
          } else {
            successCount++;
          }

          // Log detalhado dos resultados
          for (const result of results) {
            const icon = result.success ? '✅' : '❌';
            console.log(
              `  ${icon} Reel #${result.reel_id} [${result.stage}]: ` +
                `${result.message} (${result.duration_ms}ms)`
            );
          }
        } catch (error) {
          errorCount++;
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`❌ Erro inesperado ao processar Reel #${pending.id}: ${msg}`);
          updateReelStage(pending.id, 'error', msg);
        }
      }

      console.log(`\n🔄 Processamento concluído: ${successCount} sucesso, ${errorCount} erros`);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🚀 ===== Pipeline Concluído em ${totalTime}s =====\n`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erro fatal no pipeline: ${msg}`);
    throw error;
  }
}

/**
 * Monta a legenda final para publicação a partir do template e dados do reel.
 *
 * @param caption Legenda original ou editada do reel
 * @param hashtags Hashtags do reel (separadas por espaço)
 * @param template Template customizado (usa {caption} e {hashtags} como placeholders)
 * @returns Legenda formatada
 */
function buildCaption(caption: string, hashtags: string, template: string): string {
  if (template) {
    return template
      .replace('{caption}', caption || '')
      .replace('{hashtags}', hashtags || '')
      .trim();
  }

  const parts: string[] = [];
  if (caption) parts.push(caption);
  if (hashtags) parts.push(hashtags);

  return parts.join('\n\n');
}
