import { NextResponse } from 'next/server';
import {
  initDatabase,
  getAppSettings,
  getPublishedTodayCount,
  getErrorsTodayCount,
} from '@/services/database';
import type { SchedulerStatus, ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * Estado global do scheduler (mantido em memória do processo Node.js).
 * Em produção, isso é adequado para um único processo Next.js.
 */
interface SchedulerState {
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  currentTask: string | null;
  cronJob: ReturnType<typeof import('node-cron').schedule> | null;
}

// Singleton global para persistir entre requests
const globalForScheduler = globalThis as typeof globalThis & {
  __schedulerState?: SchedulerState;
};

function getSchedulerState(): SchedulerState {
  if (!globalForScheduler.__schedulerState) {
    globalForScheduler.__schedulerState = {
      isRunning: false,
      lastRunAt: null,
      nextRunAt: null,
      currentTask: null,
      cronJob: null,
    };
  }
  return globalForScheduler.__schedulerState;
}

/**
 * Calcula o próximo horário de execução baseado no cron schedule.
 * Retorna uma estimativa simples (30 minutos à frente).
 */
function calculateNextRun(cronSchedule: string): string {
  // Extrair intervalo em minutos do cron (ex: */30 -> 30 minutos)
  const match = cronSchedule.match(/^\*\/(\d+)/);
  const intervalMinutes = match ? parseInt(match[1], 10) : 30;
  const nextRun = new Date(Date.now() + intervalMinutes * 60 * 1000);
  return nextRun.toISOString();
}

/**
 * Executa o pipeline de processamento de reels.
 * Esta é a função principal chamada pelo scheduler.
 */
async function runPipeline(): Promise<void> {
  const state = getSchedulerState();
  if (state.currentTask) {
    console.log('⏳ Pipeline já está em execução, ignorando...');
    return;
  }

  state.currentTask = 'Processando pipeline de reels...';
  console.log('🚀 Iniciando pipeline de reels...');

  try {
    // Tentar importar e executar o pipeline service, se existir
    try {
      const pipeline = await import('@/services/pipeline');
      if (pipeline && typeof pipeline.runPipeline === 'function') {
        await pipeline.runPipeline();
      } else {
        console.log('⚠️ Pipeline service não possui função runPipeline exportada');
      }
    } catch {
      console.log('⚠️ Pipeline service ainda não implementado (src/services/pipeline.ts)');
    }

    state.lastRunAt = new Date().toISOString();
    console.log('✅ Pipeline concluído');
  } catch (error) {
    console.error('❌ Erro no pipeline:', error);
  } finally {
    state.currentTask = null;
    const settings = getAppSettings();
    state.nextRunAt = calculateNextRun(settings.cron_schedule);
  }
}

/**
 * GET /api/scheduler
 * Retorna o status atual do scheduler.
 *
 * @returns Status do scheduler
 */
export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const state = getSchedulerState();

    // Auto-iniciar scheduler se não estiver rodando
    if (!state.isRunning && !state.cronJob) {
      const settings = getAppSettings();
      try {
        const cron = await import('node-cron');
        state.cronJob = cron.schedule(settings.cron_schedule, () => {
          runPipeline().catch(console.error);
        });
        state.isRunning = true;
        state.nextRunAt = calculateNextRun(settings.cron_schedule);
        console.log(`⏰ Scheduler auto-iniciado com schedule: ${settings.cron_schedule}`);
      } catch (cronError) {
        console.error('❌ Falha ao auto-iniciar o scheduler:', cronError);
      }
    }

    const status: SchedulerStatus = {
      is_running: state.isRunning,
      last_run_at: state.lastRunAt,
      next_run_at: state.nextRunAt,
      current_task: state.currentTask,
      reels_processed_today: getPublishedTodayCount(),
      errors_today: getErrorsTodayCount(),
    };

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('❌ Erro ao buscar status do scheduler:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scheduler
 * Controla o scheduler: iniciar, parar ou executar imediatamente.
 *
 * @param request - Request com body: { action: 'start' | 'stop' | 'run-now' }
 * @returns Mensagem de confirmação
 */
export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const body = await request.json();
    const { action } = body as { action?: string };

    if (!action || !['start', 'stop', 'run-now'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'O campo "action" deve ser "start", "stop" ou "run-now"' },
        { status: 400 }
      );
    }

    const state = getSchedulerState();
    const settings = getAppSettings();

    switch (action) {
      case 'start': {
        if (state.isRunning) {
          return NextResponse.json({
            success: true,
            message: 'O scheduler já está em execução',
          });
        }

        try {
          const cron = await import('node-cron');

          // Parar job anterior se existir
          if (state.cronJob) {
            state.cronJob.stop();
          }

          // Criar novo cron job
          state.cronJob = cron.schedule(settings.cron_schedule, () => {
            runPipeline().catch(console.error);
          });

          state.isRunning = true;
          state.nextRunAt = calculateNextRun(settings.cron_schedule);

          console.log(`⏰ Scheduler iniciado com schedule: ${settings.cron_schedule}`);

          return NextResponse.json({
            success: true,
            message: `Scheduler iniciado com schedule: ${settings.cron_schedule}`,
          });
        } catch (cronError) {
          console.error('❌ Erro ao iniciar scheduler:', cronError);
          return NextResponse.json(
            { success: false, error: 'Erro ao iniciar o scheduler. Verifique se node-cron está instalado.' },
            { status: 500 }
          );
        }
      }

      case 'stop': {
        if (!state.isRunning) {
          return NextResponse.json({
            success: true,
            message: 'O scheduler já está parado',
          });
        }

        if (state.cronJob) {
          state.cronJob.stop();
          state.cronJob = null;
        }

        state.isRunning = false;
        state.nextRunAt = null;

        console.log('⏰ Scheduler parado');

        return NextResponse.json({
          success: true,
          message: 'Scheduler parado com sucesso',
        });
      }

      case 'run-now': {
        if (state.currentTask) {
          return NextResponse.json(
            { success: false, error: 'Uma execução já está em andamento' },
            { status: 409 }
          );
        }

        // Executar pipeline de forma assíncrona (não bloquear a resposta)
        runPipeline().catch(console.error);

        return NextResponse.json({
          success: true,
          message: 'Execução do pipeline iniciada',
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Ação desconhecida' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ Erro ao controlar scheduler:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
