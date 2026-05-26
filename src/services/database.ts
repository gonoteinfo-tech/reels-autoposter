import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { SourceProfile, Reel, ReelStage, AppSettings } from '@/types';

/** Representação do perfil-fonte no SQLite (onde is_active é armazenado como número) */
interface DbSourceProfile extends Omit<SourceProfile, 'is_active'> {
  is_active: number;
}

/** Instância singleton do banco de dados */
let db: Database.Database | null = null;

/**
 * Retorna a instância do banco de dados SQLite.
 * Cria o diretório data/ e o arquivo reels.db se não existirem.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('💾 Diretório data/ criado');
  }

  const dbPath = path.join(dataDir, 'reels.db');
  db = new Database(dbPath);

  // Habilitar WAL mode para melhor performance de concorrência
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  console.log(`💾 Banco de dados conectado: ${dbPath}`);
  return db;
}

/**
 * Inicializa o banco de dados criando as tabelas necessárias.
 * Seguro para chamar múltiplas vezes (usa IF NOT EXISTS).
 */
export function initDatabase(): void {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS source_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      profile_pic_url TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_checked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER REFERENCES source_profiles(id) ON DELETE SET NULL,
      source_username TEXT NOT NULL DEFAULT '',
      instagram_url TEXT UNIQUE NOT NULL,
      instagram_id TEXT UNIQUE,
      caption TEXT NOT NULL DEFAULT '',
      original_caption TEXT NOT NULL DEFAULT '',
      hashtags TEXT NOT NULL DEFAULT '',
      duration_seconds REAL NOT NULL DEFAULT 0,
      local_path TEXT,
      processed_path TEXT,
      r2_url TEXT,
      stage TEXT NOT NULL DEFAULT 'discovered',
      error_message TEXT,
      ig_post_id TEXT,
      fb_post_id TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reels_stage ON reels(stage);
    CREATE INDEX IF NOT EXISTS idx_reels_source_id ON reels(source_id);
    CREATE INDEX IF NOT EXISTS idx_reels_source_username ON reels(source_username);
    CREATE INDEX IF NOT EXISTS idx_reels_created_at ON reels(created_at);
  `);

  // Inserir configurações padrão se não existirem
  const defaultSettings: Record<string, string> = {
    logo_position: process.env.LOGO_POSITION || 'bottom-right',
    logo_scale: String(process.env.LOGO_SCALE || '80'),
    cron_schedule: process.env.CRON_SCHEDULE || '*/30 * * * *',
    max_reels_per_run: String(process.env.MAX_REELS_PER_RUN || '5'),
    auto_publish: 'true',
    custom_caption_template: '',
    instagram_enabled: 'true',
    facebook_enabled: 'true',
  };

  const insertSetting = database.prepare(
    `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`
  );

  const insertMany = database.transaction(() => {
    for (const [key, value] of Object.entries(defaultSettings)) {
      insertSetting.run(key, value);
    }
  });
  insertMany();

  console.log('💾 Banco de dados inicializado com sucesso');
}

// ─────────────────────────────────────────────
//  CRUD - Source Profiles
// ─────────────────────────────────────────────

/**
 * Retorna todos os perfis-fonte cadastrados.
 */
export function getAllSources(): SourceProfile[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT sp.*, 
      (SELECT COUNT(*) FROM reels WHERE source_id = sp.id) as reels_count
    FROM source_profiles sp
    ORDER BY sp.created_at DESC
  `).all() as DbSourceProfile[];

  return rows.map((row) => ({
    ...row,
    is_active: Boolean(row.is_active),
  }));
}

/**
 * Retorna apenas os perfis-fonte ativos.
 */
export function getActiveSources(): SourceProfile[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT sp.*, 
      (SELECT COUNT(*) FROM reels WHERE source_id = sp.id) as reels_count
    FROM source_profiles sp
    WHERE sp.is_active = 1
    ORDER BY sp.created_at DESC
  `).all() as DbSourceProfile[];

  return rows.map((row) => ({
    ...row,
    is_active: Boolean(row.is_active),
  }));
}

/**
 * Busca um perfil-fonte pelo ID.
 */
export function getSourceById(id: number): SourceProfile | null {
  const database = getDb();
  const row = database.prepare(`
    SELECT sp.*, 
      (SELECT COUNT(*) FROM reels WHERE source_id = sp.id) as reels_count
    FROM source_profiles sp
    WHERE sp.id = ?
  `).get(id) as DbSourceProfile | undefined;

  if (!row) return null;
  return { ...row, is_active: Boolean(row.is_active) };
}

/**
 * Busca um perfil-fonte pelo username.
 */
export function getSourceByUsername(username: string): SourceProfile | null {
  const database = getDb();
  const row = database.prepare(`
    SELECT sp.*, 
      (SELECT COUNT(*) FROM reels WHERE source_id = sp.id) as reels_count
    FROM source_profiles sp
    WHERE sp.username = ?
  `).get(username) as DbSourceProfile | undefined;

  if (!row) return null;
  return { ...row, is_active: Boolean(row.is_active) };
}

/**
 * Cria um novo perfil-fonte.
 */
export function createSource(data: {
  username: string;
  display_name?: string;
  profile_pic_url?: string;
}): SourceProfile {
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO source_profiles (username, display_name, profile_pic_url)
    VALUES (?, ?, ?)
  `).run(data.username, data.display_name || '', data.profile_pic_url || '');

  console.log(`💾 Perfil-fonte criado: @${data.username} (ID: ${result.lastInsertRowid})`);
  return getSourceById(Number(result.lastInsertRowid))!;
}

/**
 * Atualiza um perfil-fonte existente.
 */
export function updateSource(
  id: number,
  data: Partial<Pick<SourceProfile, 'username' | 'display_name' | 'profile_pic_url' | 'is_active'>>
): SourceProfile | null {
  const database = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.username !== undefined) {
    fields.push('username = ?');
    values.push(data.username);
  }
  if (data.display_name !== undefined) {
    fields.push('display_name = ?');
    values.push(data.display_name);
  }
  if (data.profile_pic_url !== undefined) {
    fields.push('profile_pic_url = ?');
    values.push(data.profile_pic_url);
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(data.is_active ? 1 : 0);
  }

  if (fields.length === 0) return getSourceById(id);

  values.push(id);
  database.prepare(`UPDATE source_profiles SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  console.log(`💾 Perfil-fonte atualizado: ID ${id}`);
  return getSourceById(id);
}

/**
 * Atualiza o timestamp de última verificação de um perfil-fonte.
 */
export function updateSourceLastChecked(id: number): void {
  const database = getDb();
  database.prepare(`
    UPDATE source_profiles SET last_checked_at = datetime('now') WHERE id = ?
  `).run(id);
}

/**
 * Remove um perfil-fonte pelo ID.
 */
export function deleteSource(id: number): boolean {
  const database = getDb();
  const result = database.prepare('DELETE FROM source_profiles WHERE id = ?').run(id);
  console.log(`💾 Perfil-fonte removido: ID ${id}`);
  return result.changes > 0;
}

// ─────────────────────────────────────────────
//  CRUD - Reels
// ─────────────────────────────────────────────

/**
 * Retorna todos os reels, opcionalmente filtrados por stage.
 */
export function getAllReels(stage?: ReelStage, limit?: number): Reel[] {
  const database = getDb();
  let query = 'SELECT * FROM reels';
  const params: unknown[] = [];

  if (stage) {
    query += ' WHERE stage = ?';
    params.push(stage);
  }

  query += ' ORDER BY created_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  return database.prepare(query).all(...params) as Reel[];
}

/**
 * Busca um reel pelo ID.
 */
export function getReelById(id: number): Reel | null {
  const database = getDb();
  return (database.prepare('SELECT * FROM reels WHERE id = ?').get(id) as Reel) || null;
}

/**
 * Busca um reel pela URL do Instagram.
 */
export function getReelByUrl(url: string): Reel | null {
  const database = getDb();
  return (database.prepare('SELECT * FROM reels WHERE instagram_url = ?').get(url) as Reel) || null;
}

/**
 * Busca um reel pelo instagram_id.
 */
export function getReelByInstagramId(instagramId: string): Reel | null {
  const database = getDb();
  return (
    (database.prepare('SELECT * FROM reels WHERE instagram_id = ?').get(instagramId) as Reel) ||
    null
  );
}

/**
 * Cria um novo reel no banco de dados.
 */
export function createReel(data: {
  source_id: number;
  source_username: string;
  instagram_url: string;
  instagram_id?: string;
  caption?: string;
  original_caption?: string;
  hashtags?: string;
}): Reel {
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO reels (source_id, source_username, instagram_url, instagram_id, caption, original_caption, hashtags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.source_id,
    data.source_username,
    data.instagram_url,
    data.instagram_id || null,
    data.caption || '',
    data.original_caption || '',
    data.hashtags || ''
  );

  console.log(`💾 Reel criado: ${data.instagram_url} (ID: ${result.lastInsertRowid})`);
  return getReelById(Number(result.lastInsertRowid))!;
}

/**
 * Atualiza o estágio de um reel no pipeline.
 */
export function updateReelStage(id: number, stage: ReelStage, errorMessage?: string): void {
  const database = getDb();
  database.prepare(`
    UPDATE reels 
    SET stage = ?, error_message = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(stage, errorMessage || null, id);

  console.log(`💾 Reel #${id} → stage: ${stage}${errorMessage ? ` (erro: ${errorMessage})` : ''}`);
}

/**
 * Atualiza campos específicos de um reel.
 */
export function updateReel(
  id: number,
  data: Partial<
    Pick<
      Reel,
      | 'caption'
      | 'original_caption'
      | 'hashtags'
      | 'duration_seconds'
      | 'local_path'
      | 'processed_path'
      | 'r2_url'
      | 'stage'
      | 'error_message'
      | 'ig_post_id'
      | 'fb_post_id'
      | 'published_at'
    >
  >
): Reel | null {
  const database = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  const entries = Object.entries(data) as [string, unknown][];
  for (const [key, value] of entries) {
    fields.push(`${key} = ?`);
    values.push(value ?? null);
  }

  if (fields.length === 0) return getReelById(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  database.prepare(`UPDATE reels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getReelById(id);
}

/**
 * Remove um reel pelo ID.
 */
export function deleteReel(id: number): boolean {
  const database = getDb();
  const result = database.prepare('DELETE FROM reels WHERE id = ?').run(id);
  console.log(`💾 Reel removido: ID ${id}`);
  return result.changes > 0;
}

/**
 * Retorna reels em um estágio específico, limitados por quantidade.
 */
export function getReelsByStage(stage: ReelStage, limit?: number): Reel[] {
  const database = getDb();
  let query = 'SELECT * FROM reels WHERE stage = ? ORDER BY created_at ASC';
  const params: unknown[] = [stage];

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  return database.prepare(query).all(...params) as Reel[];
}

/**
 * Conta reels publicados hoje.
 */
export function getPublishedTodayCount(): number {
  const database = getDb();
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM reels 
    WHERE stage = 'published' 
    AND date(published_at) = date('now')
  `).get() as { count: number };

  return row.count;
}

/**
 * Conta erros de hoje.
 */
export function getErrorsTodayCount(): number {
  const database = getDb();
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM reels 
    WHERE stage = 'error' 
    AND date(updated_at) = date('now')
  `).get() as { count: number };

  return row.count;
}

/**
 * Retorna o número de reels na fila do pipeline (não publicados e sem erro).
 */
export function getPipelineQueueCount(): number {
  const database = getDb();
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM reels 
    WHERE stage NOT IN ('published', 'error')
  `).get() as { count: number };

  return row.count;
}

// ─────────────────────────────────────────────
//  CRUD - App Settings
// ─────────────────────────────────────────────

/**
 * Retorna todas as configurações do app.
 */
export function getAppSettings(): AppSettings {
  const database = getDb();
  const rows = database.prepare('SELECT key, value FROM app_settings').all() as {
    key: string;
    value: string;
  }[];

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return {
    logo_position: (settings.logo_position || 'bottom-right') as AppSettings['logo_position'],
    logo_scale: Number(settings.logo_scale) || 80,
    cron_schedule: settings.cron_schedule || '*/30 * * * *',
    max_reels_per_run: Number(settings.max_reels_per_run) || 5,
    auto_publish: settings.auto_publish !== 'false',
    custom_caption_template: settings.custom_caption_template || '',
    instagram_enabled: settings.instagram_enabled !== 'false',
    facebook_enabled: settings.facebook_enabled !== 'false',
  };
}

/**
 * Atualiza uma configuração do app.
 */
export function updateSetting(key: string, value: string): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO app_settings (key, value) 
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);

  console.log(`💾 Configuração atualizada: ${key} = ${value}`);
}

/**
 * Atualiza múltiplas configurações de uma vez.
 */
export function updateSettings(settings: Partial<AppSettings>): void {
  const database = getDb();
  const update = database.prepare(`
    INSERT INTO app_settings (key, value) 
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const updateMany = database.transaction(() => {
    const entries = Object.entries(settings) as [string, unknown][];
    for (const [key, value] of entries) {
      update.run(key, String(value));
    }
  });

  updateMany();
  console.log('💾 Configurações atualizadas em lote');
}

/**
 * Retorna estatísticas para o dashboard.
 */
export function getDashboardStats(): {
  total_sources: number;
  active_sources: number;
  total_reels: number;
  published_today: number;
  published_total: number;
  errors_today: number;
  pipeline_queue: number;
} {
  const database = getDb();

  const sourcesRow = database.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
    FROM source_profiles
  `).get() as { total: number; active: number };

  const reelsRow = database.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN stage = 'published' THEN 1 ELSE 0 END) as published_total,
      SUM(CASE WHEN stage = 'published' AND date(published_at) = date('now') THEN 1 ELSE 0 END) as published_today,
      SUM(CASE WHEN stage = 'error' AND date(updated_at) = date('now') THEN 1 ELSE 0 END) as errors_today,
      SUM(CASE WHEN stage NOT IN ('published', 'error') THEN 1 ELSE 0 END) as pipeline_queue
    FROM reels
  `).get() as {
    total: number;
    published_total: number;
    published_today: number;
    errors_today: number;
    pipeline_queue: number;
  };

  return {
    total_sources: sourcesRow.total || 0,
    active_sources: sourcesRow.active || 0,
    total_reels: reelsRow.total || 0,
    published_today: reelsRow.published_today || 0,
    published_total: reelsRow.published_total || 0,
    errors_today: reelsRow.errors_today || 0,
    pipeline_queue: reelsRow.pipeline_queue || 0,
  };
}
