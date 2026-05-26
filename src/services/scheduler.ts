import cron, { ScheduledTask } from 'node-cron';
import type { SchedulerStatus } from '@/types';
import { runPipeline } from './pipeline';
import { getPublishedTodayCount, getErrorsTodayCount } from './database';

/** Instância singleton do cron job */
let cronTask: ScheduledTask | null = null;

/** Flag de trava para prevenir execuções concorrentes */
let isRunning = false;

/** Timestamp da última execução */
let lastRunAt: string | null = null;

/** Tarefa atualmente sendo executada */
let currentTask: string | null = null;

/** Contadores de estatísticas do dia */
let reelsProcessedToday = 0;
let errorsToday = 0;
let lastResetDate: string | null = null;

/**
 * Reseta os contadores diários se o dia mudou.
 */
function resetDailyCountersIfNeeded(): void {
  const today = new Date().toISOString().split('T')[0];
  if (lastResetDate !== today) {
    reelsProcessedToday = 0;
    errorsToday = 0;
    lastResetDate = today;
    console.log('⏰ Contadores diários resetados');
  }
}

/**
 * Calcula o próximo horário de execução a partir da expressão cron.
 * @param cronExpression Expressão cron (5 campos)
 * @returns Data/hora da próxima execução ou null
 */
function calculateNextRun(cronExpression: string): string | null {
  try {
    // Cálculo simples baseado no intervalo do cron
    // Para expressões como "*/30 * * * *", calcular próxima execução
    const now = new Date();
    const parts = cronExpression.split(' ');

    if (parts.length !== 5) return null;

    const minutePart = parts[0];

    // Caso mais comum: */N minutos
    if (minutePart.startsWith('*/')) {
      const interval = parseInt(minutePart.slice(2), 10);
      if (isNaN(interval) || interval <= 0) return null;

      const currentMinute = now.getMinutes();
      const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;

      const nextRun = new Date(now);
      if (nextMinute >= 60) {
        nextRun.setHours(nextRun.getHours() + 1);
        nextRun.setMinutes(nextMinute - 60);
      } else {
        nextRun.setMinutes(nextMinute);
      }
      nextRun.setSeconds(0);
      nextRun.setMilliseconds(0);

      return nextRun.toISOString();
    }

    // Para outros padrões, retornar estimativa simples
    return null;
  } catch {
    return null;
  }
}

/**
 * Executa o pipeline de forma segura, com proteção contra execução concorrente.
 */
async function safeRunPipeline(): Promise<void> {
  if (isRunning) {
    console.log('⏰ Pipeline já está em execução, pulando esta rodada');
    return;
  }

  resetDailyCountersIfNeeded();

  isRunning = true;
  currentTask = 'Executando pipeline completo';

  try {
    console.log('⏰ Scheduler disparando pipeline...');
    const startTime = Date.now();

    await runPipeline();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏰ Pipeline concluído em ${duration}s`);

    // Atualizar contadores a partir do banco de dados
    try {
      reelsProcessedToday = getPublishedTodayCount();
      errorsToday = getErrorsTodayCount();
    } catch {
      // Ignorar erro ao ler contadores
    }
  } catch (error) {
    errorsToday++;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erro no pipeline agendado: ${msg}`);
  } finally {
    isRunning = false;
    currentTask = null;
    lastRunAt = new Date().toISOString();
  }
}

/**
 * Inicia o scheduler com cron job.
 * Usa a expressão cron de CRON_SCHEDULE (padrão: a cada 30 minutos).
 */
export function startScheduler(): void {
  const cronSchedule = process.env.CRON_SCHEDULE || '*/30 * * * *';

  // Validar expressão cron
  if (!cron.validate(cronSchedule)) {
    console.error(`❌ Expressão cron inválida: ${cronSchedule}`);
    throw new Error(`Expressão cron inválida: ${cronSchedule}`);
  }

  // Parar scheduler existente se houver
  if (cronTask) {
    stopScheduler();
  }

  console.log(`⏰ Iniciando scheduler com cron: ${cronSchedule}`);

  cronTask = cron.schedule(cronSchedule, () => {
    safeRunPipeline().catch((error) => {
      console.error('❌ Erro não capturado no scheduler:', error);
    });
  });

  const nextRun = calculateNextRun(cronSchedule);
  console.log(`⏰ Scheduler ativo. Próxima execução: ${nextRun || 'calculando...'}`);
}

/**
 * Para o scheduler e cancela o cron job.
 */
export function stopScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log('⏰ Scheduler parado');
  } else {
    console.log('⏰ Scheduler já estava parado');
  }
}

/**
 * Retorna o status atual do scheduler.
 * @returns Objeto com informações detalhadas do scheduler
 */
export function getSchedulerStatus(): SchedulerStatus {
  resetDailyCountersIfNeeded();

  const cronSchedule = process.env.CRON_SCHEDULE || '*/30 * * * *';

  return {
    is_running: isRunning,
    last_run_at: lastRunAt,
    next_run_at: cronTask ? calculateNextRun(cronSchedule) : null,
    current_task: currentTask,
    reels_processed_today: reelsProcessedToday,
    errors_today: errorsToday,
  };
}

/**
 * Dispara uma execução imediata do pipeline.
 * Não bloqueia o scheduler; respeita a trava de concorrência.
 */
export async function runNow(): Promise<void> {
  console.log('⏰ Execução manual disparada');
  await safeRunPipeline();
}
