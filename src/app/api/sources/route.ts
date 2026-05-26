import { NextResponse } from 'next/server';
import {
  initDatabase,
  getAllSources,
  getSourceByUsername,
  getSourceById,
  createSource,
  deleteSource,
} from '@/services/database';
import type { ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * GET /api/sources
 * Lista todos os perfis-fonte cadastrados.
 *
 * @returns Lista de perfis-fonte
 */
export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const sources = getAllSources();

    return NextResponse.json({
      success: true,
      data: { sources },
    });
  } catch (error) {
    console.error('❌ Erro ao listar sources:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sources
 * Adiciona um novo perfil-fonte para monitoramento.
 *
 * @param request - Request com body: { username: string }
 * @returns O perfil-fonte criado
 */
export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const body = await request.json();
    const { username } = body as { username?: string };

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { success: false, error: 'O campo "username" é obrigatório e deve ser uma string válida' },
        { status: 400 }
      );
    }

    // Limpar o username: remover @ e espaços
    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();

    if (!cleanUsername || cleanUsername.length < 1) {
      return NextResponse.json(
        { success: false, error: 'Username inválido' },
        { status: 400 }
      );
    }

    // Validar formato do username do Instagram
    const usernamePattern = /^[a-zA-Z0-9._]{1,30}$/;
    if (!usernamePattern.test(cleanUsername)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username inválido. Use apenas letras, números, pontos e underscores (máx. 30 caracteres)',
        },
        { status: 400 }
      );
    }

    // Verificar se já existe
    const existing = getSourceByUsername(cleanUsername);
    if (existing) {
      return NextResponse.json(
        { success: false, error: `O perfil @${cleanUsername} já está cadastrado` },
        { status: 409 }
      );
    }

    const source = createSource({
      username: cleanUsername,
      display_name: `@${cleanUsername}`,
    });

    return NextResponse.json(
      { success: true, data: { source } },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ Erro ao criar source:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sources
 * Remove um perfil-fonte pelo ID.
 *
 * @param request - Request com body: { id: number }
 * @returns Mensagem de confirmação
 */
export async function DELETE(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const body = await request.json();
    const { id } = body as { id?: number };

    if (!id || typeof id !== 'number') {
      return NextResponse.json(
        { success: false, error: 'O campo "id" é obrigatório e deve ser um número' },
        { status: 400 }
      );
    }

    // Verificar se existe
    const source = getSourceById(id);
    if (!source) {
      return NextResponse.json(
        { success: false, error: `Perfil-fonte com ID ${id} não encontrado` },
        { status: 404 }
      );
    }

    const deleted = deleteSource(id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Não foi possível remover o perfil-fonte' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Perfil @${source.username} removido com sucesso`,
    });
  } catch (error) {
    console.error('❌ Erro ao remover source:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
