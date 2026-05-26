/** Perfil-fonte do Instagram para monitoramento */
export interface SourceProfile {
  id: number;
  username: string;
  display_name: string;
  profile_pic_url: string;
  is_active: boolean;
  created_at: string;
  last_checked_at: string | null;
  reels_count: number;
}

/** Estágio do pipeline de processamento */
export type ReelStage =
  | 'discovered'    // Reel encontrado, não baixado
  | 'downloading'   // Download em andamento
  | 'downloaded'    // Download concluído
  | 'processing'    // FFmpeg processando (adicionando logo)
  | 'processed'     // Vídeo com logo pronto
  | 'uploading'     // Upload para R2
  | 'uploaded'      // URL pública gerada
  | 'publishing'    // Publicando no Instagram/Facebook
  | 'published'     // Publicação concluída
  | 'error';        // Erro em alguma etapa

/** Um Reel coletado e rastreado no sistema */
export interface Reel {
  id: number;
  source_id: number;
  source_username: string;
  instagram_url: string;
  instagram_id: string;
  caption: string;
  original_caption: string;
  hashtags: string;
  duration_seconds: number;
  local_path: string | null;
  processed_path: string | null;
  r2_url: string | null;
  stage: ReelStage;
  error_message: string | null;
  ig_post_id: string | null;
  fb_post_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Configurações globais do sistema */
export interface AppSettings {
  logo_position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  logo_scale: number;
  cron_schedule: string;
  max_reels_per_run: number;
  auto_publish: boolean;
  custom_caption_template: string;
  instagram_enabled: boolean;
  facebook_enabled: boolean;
}

/** Status do scheduler */
export interface SchedulerStatus {
  is_running: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  current_task: string | null;
  reels_processed_today: number;
  errors_today: number;
}

/** Stats para o dashboard */
export interface DashboardStats {
  total_sources: number;
  active_sources: number;
  total_reels: number;
  published_today: number;
  published_total: number;
  errors_today: number;
  pipeline_queue: number;
  storage_used_mb: number;
}

/** Resposta padrão da API */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Resultado de uma etapa do pipeline */
export interface PipelineResult {
  reel_id: number;
  stage: ReelStage;
  success: boolean;
  message: string;
  duration_ms: number;
}
