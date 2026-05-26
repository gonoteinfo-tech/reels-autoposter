import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { ApiResponse } from '@/types';

/** Tipos MIME permitidos para o logo */
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Tamanho máximo do arquivo: 5MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * POST /api/upload-logo
 * Faz upload de um arquivo de logo.
 * Aceita FormData com campo "logo" contendo o arquivo.
 *
 * @param request - Request com FormData contendo o arquivo do logo
 * @returns Caminho público do logo salvo
 */
export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { success: false, error: 'Content-Type deve ser multipart/form-data' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('logo') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'O campo "logo" é obrigatório. Envie um arquivo de imagem.' },
        { status: 400 }
      );
    }

    // Validar tipo do arquivo
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo de arquivo não suportado: ${file.type}. Use PNG, JPEG ou WebP.`,
        },
        { status: 400 }
      );
    }

    // Validar tamanho do arquivo
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo permitido: 5MB.`,
        },
        { status: 400 }
      );
    }

    // Criar diretório de logos se não existir
    const logosDir = path.join(process.cwd(), 'public', 'logos');
    if (!fs.existsSync(logosDir)) {
      fs.mkdirSync(logosDir, { recursive: true });
      console.log('📁 Diretório public/logos/ criado');
    }

    // Converter o File para Buffer e salvar
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const logoPath = path.join(logosDir, 'logo.png');

    fs.writeFileSync(logoPath, buffer);
    console.log(`🎨 Logo salvo em: ${logoPath} (${(file.size / 1024).toFixed(1)}KB)`);

    return NextResponse.json({
      success: true,
      data: { path: '/logos/logo.png' },
    });
  } catch (error) {
    console.error('❌ Erro ao fazer upload do logo:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
