import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  initDatabase,
  getDashboardStats,
  getDb,
} from '@/services/database';
import type { DashboardStats, ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * Calcula o espaço de armazenamento utilizado em MB.
 * Verifica os diretórios de vídeos baixados e processados.
 *
 * @returns Tamanho total em megabytes
 */
function calculateStorageUsedMb(): number {
  let totalBytes = 0;
  const dirs = [
    path.join(process.cwd(), 'data', 'downloads'),
    path.join(process.cwd(), 'data', 'processed'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            totalBytes += stat.size;
          }
        } catch {
          // Ignorar arquivos que não podem ser lidos
        }
      }
    } catch {
      // Ignorar diretórios que não podem ser lidos
    }
  }

  return Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
}

/**
 * GET /api/stats
 * Retorna estatísticas para o dashboard.
 *
 * @returns Estatísticas agregadas do sistema
 */
export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();

    const dbStats = getDashboardStats();
    const storageUsedMb = calculateStorageUsedMb();

    const stats: DashboardStats = {
      ...dbStats,
      storage_used_mb: storageUsedMb,
    };

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
