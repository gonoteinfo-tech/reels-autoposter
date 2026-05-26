import { NextResponse } from 'next/server';
import { getReelById } from '@/services/database';
import fs from 'fs';
import { Readable } from 'stream';

/**
 * GET /api/videos
 * Stream de vídeo local para permitir a visualização no dashboard.
 * Suporta Range Requests para permitir seek/scrubbing nos players HTML5.
 *
 * Query params:
 *   - id: ID do Reel
 *   - type: 'local' (vídeo original baixado) ou 'processed' (vídeo com logo)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'O ID do reel é obrigatório' },
        { status: 400 }
      );
    }

    const reel = getReelById(Number(id));
    if (!reel) {
      return NextResponse.json(
        { success: false, error: 'Reel não encontrado no banco de dados' },
        { status: 404 }
      );
    }

    // Decidir qual caminho de arquivo usar
    let filePath = '';
    if (type === 'processed') {
      filePath = reel.processed_path || '';
    } else if (type === 'local') {
      filePath = reel.local_path || '';
    } else {
      // Priorizar o vídeo processado, depois o local
      filePath = reel.processed_path || reel.local_path || '';
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'Arquivo de vídeo não encontrado no servidor' },
        { status: 404 }
      );
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = request.headers.get('range');

    if (range) {
      // Processar requisição parcial (HTTP 206 Partial Content)
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new NextResponse('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` }
        });
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(fileStream);

      return new NextResponse(webStream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': 'video/mp4',
        }
      });
    } else {
      // Processar stream completo (HTTP 200)
      const fileStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(fileStream);

      return new NextResponse(webStream as any, {
        headers: {
          'Content-Length': String(fileSize),
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
        }
      });
    }
  } catch (error) {
    console.error('❌ Erro ao servir stream de vídeo:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao servir stream de vídeo' },
      { status: 500 }
    );
  }
}
