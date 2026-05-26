import { NextResponse } from 'next/server';
import {
  initDatabase,
  getAppSettings,
  updateSettings,
} from '@/services/database';
import type { AppSettings, ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/** Chaves válidas de configuração e seus tipos esperados */
const VALID_SETTING_KEYS: Record<keyof AppSettings, 'string' | 'number' | 'boolean'> = {
  logo_position: 'string',
  logo_scale: 'number',
  cron_schedule: 'string',
  max_reels_per_run: 'number',
  auto_publish: 'boolean',
  custom_caption_template: 'string',
  instagram_enabled: 'boolean',
  facebook_enabled: 'boolean',
};

/** Posições válidas para o logo */
const VALID_LOGO_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];

/**
 * GET /api/settings
 * Retorna todas as configurações atuais do sistema.
 *
 * @returns Configurações do app
 */
export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const settings = getAppSettings();

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('❌ Erro ao buscar configurações:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Atualiza configurações do sistema.
 * Aceita atualizações parciais (Partial<AppSettings>).
 *
 * @param request - Request com body: Partial<AppSettings>
 * @returns Configurações atualizadas
 */
export async function PUT(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const body = await request.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'O corpo da requisição deve ser um objeto JSON' },
        { status: 400 }
      );
    }

    // Validar chaves e valores
    const validatedSettings: Partial<AppSettings> = {};
    const errors: string[] = [];

    for (const [key, value] of Object.entries(body)) {
      if (!(key in VALID_SETTING_KEYS)) {
        errors.push(`Chave desconhecida: "${key}"`);
        continue;
      }

      const settingKey = key as keyof AppSettings;
      const expectedType = VALID_SETTING_KEYS[settingKey];

      // Validar tipo
      if (typeof value !== expectedType) {
        errors.push(`"${key}" deve ser do tipo ${expectedType}, recebido: ${typeof value}`);
        continue;
      }

      // Validações específicas por campo
      switch (settingKey) {
        case 'logo_position':
          if (!VALID_LOGO_POSITIONS.includes(value as string)) {
            errors.push(
              `"logo_position" deve ser um dos valores: ${VALID_LOGO_POSITIONS.join(', ')}`
            );
            continue;
          }
          break;

        case 'logo_scale':
          if ((value as number) < 10 || (value as number) > 500) {
            errors.push('"logo_scale" deve estar entre 10 e 500');
            continue;
          }
          break;

        case 'max_reels_per_run':
          if ((value as number) < 1 || (value as number) > 50) {
            errors.push('"max_reels_per_run" deve estar entre 1 e 50');
            continue;
          }
          break;

        case 'cron_schedule':
          // Validação básica do formato cron (5 campos)
          const cronParts = (value as string).trim().split(/\s+/);
          if (cronParts.length !== 5) {
            errors.push('"cron_schedule" deve ter 5 campos (ex: */30 * * * *)');
            continue;
          }
          break;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (validatedSettings as any)[settingKey] = value;
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: `Erros de validação: ${errors.join('; ')}` },
        { status: 400 }
      );
    }

    if (Object.keys(validatedSettings).length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma configuração válida fornecida para atualizar' },
        { status: 400 }
      );
    }

    // Atualizar no banco
    updateSettings(validatedSettings);

    // Retornar as configurações atualizadas
    const updatedSettings = getAppSettings();

    return NextResponse.json({
      success: true,
      data: updatedSettings,
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar configurações:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
