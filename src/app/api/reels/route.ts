import { NextResponse } from 'next/server';
import {
  initDatabase,
  getAllSources,
  getSourceByUsername,
  createSource,
  createReel,
  getReelByUrl,
  getDb,
  getReelById,
  deleteReel,
} from '@/services/database';
import fs from 'fs';
import type { Reel, ReelStage, ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * GET /api/reels
 * Lista todos os reels com paginação e filtros opcionais.
 *
 * @param request - Request com query params: page, limit, stage, source_id
 * @returns Lista paginada de reels
 */
export async function GET(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
    const stage = searchParams.get('stage') as ReelStage | null;
    const sourceId = searchParams.get('source_id');

    const database = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (stage) {
      conditions.push('stage = ?');
      params.push(stage);
    }

    if (sourceId) {
      conditions.push('source_id = ?');
      params.push(Number(sourceId));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Contar total de registros
    const countRow = database
      .prepare(`SELECT COUNT(*) as count FROM reels ${whereClause}`)
      .get(...params) as { count: number };
    const total = countRow.count;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Buscar reels com paginação
    const reels = database
      .prepare(
        `SELECT * FROM reels ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Reel[];

    return NextResponse.json({
      success: true,
      data: {
        reels,
        total,
        page,
        totalPages,
      },
    });
  } catch (error) {
    console.error('❌ Erro ao listar reels:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reels
 * Adiciona um reel manualmente pela URL do Instagram.
 *
 * @param request - Request com body: { url: string, caption?: string }
 * @returns O reel criado
 */
export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const body = await request.json();
    const { url, caption } = body as { url?: string; caption?: string };

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'O campo "url" é obrigatório e deve ser uma string válida' },
        { status: 400 }
      );
    }

    // Validar formato da URL do Instagram
    const urlPattern = /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p)\//i;
    if (!urlPattern.test(url)) {
      return NextResponse.json(
        { success: false, error: 'URL inválida. Deve ser uma URL de reel do Instagram' },
        { status: 400 }
      );
    }

    // Verificar se o reel já existe
    const existingReel = getReelByUrl(url);
    if (existingReel) {
      return NextResponse.json(
        { success: false, error: 'Este reel já foi adicionado anteriormente' },
        { status: 409 }
      );
    }

    // Extrair username da URL ou usar "manual"
    let sourceUsername = 'manual';
    let sourceId = 0;

    // Tentar extrair o shortcode da URL para usar como instagram_id
    const shortcodeMatch = url.match(/\/(reel|reels|p)\/([A-Za-z0-9_-]+)/);
    const instagramId = shortcodeMatch ? shortcodeMatch[2] : undefined;

    // Verificar se existe uma source "manual" ou criar uma
    const manualSource = getSourceByUsername('manual');
    if (manualSource) {
      sourceId = manualSource.id;
      sourceUsername = manualSource.username;
    } else {
      const newSource = createSource({
        username: 'manual',
        display_name: 'Adicionados manualmente',
      });
      sourceId = newSource.id;
      sourceUsername = newSource.username;
    }

    const reel = createReel({
      source_id: sourceId,
      source_username: sourceUsername,
      instagram_url: url.trim(),
      instagram_id: instagramId,
      caption: caption || '',
      original_caption: caption || '',
    });

    return NextResponse.json(
      { success: true, data: { reel } },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ Erro ao criar reel:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reels
 * Exclui um reel específico pelo ID e remove seus arquivos locais se existirem.
 */
export async function DELETE(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'O ID do reel é obrigatório' },
        { status: 400 }
      );
    }

    const reelId = Number(id);
    const reel = getReelById(reelId);
    
    if (!reel) {
      return NextResponse.json(
        { success: false, error: 'Reel não encontrado' },
        { status: 404 }
      );
    }

    // Remover os arquivos locais associados
    if (reel.local_path && fs.existsSync(reel.local_path)) {
      try {
        fs.unlinkSync(reel.local_path);
      } catch (err) {
        console.error(`Erro ao apagar arquivo local de Reel #${reelId}:`, err);
      }
    }

    if (reel.processed_path && fs.existsSync(reel.processed_path)) {
      try {
        fs.unlinkSync(reel.processed_path);
      } catch (err) {
        console.error(`Erro ao apagar arquivo processado de Reel #${reelId}:`, err);
      }
    }

    // Deletar do banco de dados
    const success = deleteReel(reelId);

    if (success) {
      return NextResponse.json({ success: true, message: 'Reel excluído com sucesso' });
    } else {
      return NextResponse.json(
        { success: false, error: 'Não foi possível excluir o Reel do banco de dados' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('❌ Erro ao excluir reel:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
