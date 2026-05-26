import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

/** Metadados extraídos de um reel baixado */
export interface ReelMetadata {
  title: string;
  description: string;
  duration: number;
  uploader: string;
  uploaderId: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  webpage_url: string;
  id: string;
}

/**
 * Verifica se o yt-dlp está disponível no sistema.
 * @returns Caminho do executável ou null se não encontrado
 */
async function findYtDlp(): Promise<string> {
  const candidates = ['yt-dlp', 'yt-dlp.exe'];

  // Buscar em caminhos comuns do Python no Windows se não estiver no PATH
  if (process.platform === 'win32' && process.env.APPDATA) {
    const pythonDir = path.join(process.env.APPDATA, 'Python');
    if (fs.existsSync(pythonDir)) {
      try {
        const subdirs = fs.readdirSync(pythonDir);
        for (const subdir of subdirs) {
          const localPath = path.join(pythonDir, subdir, 'Scripts', 'yt-dlp.exe');
          candidates.push(localPath);
        }
      } catch {
        // Ignorar
      }
    }
  }

  for (const candidate of candidates) {
    try {
      // Verificar se o executável funciona
      await execFileAsync(candidate, ['--version']);
      return candidate;
    } catch {
      // Candidato não encontrado ou falhou, tentar próximo
    }
  }

  throw new Error(
    '❌ yt-dlp não encontrado. Instale com: pip install yt-dlp ou baixe de https://github.com/yt-dlp/yt-dlp'
  );
}

/**
 * Verifica se o gallery-dl está disponível no sistema.
 * @returns Caminho do executável ou null se não encontrado
 */
async function findGalleryDl(): Promise<string> {
  const candidates = ['gallery-dl', 'gallery-dl.exe'];

  if (process.platform === 'win32' && process.env.APPDATA) {
    const pythonDir = path.join(process.env.APPDATA, 'Python');
    if (fs.existsSync(pythonDir)) {
      try {
        const subdirs = fs.readdirSync(pythonDir);
        for (const subdir of subdirs) {
          const localPath = path.join(pythonDir, subdir, 'Scripts', 'gallery-dl.exe');
          candidates.push(localPath);
        }
      } catch {
        // Ignorar
      }
    }
  }

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ['--version']);
      return candidate;
    } catch {
      // Candidato não encontrado ou falhou, tentar próximo
    }
  }

  throw new Error(
    '❌ gallery-dl não encontrado. Instale com: pip install gallery-dl'
  );
}

/**
 * Executa o yt-dlp de forma resiliente.
 * Tenta com cookies do navegador primeiro, e se falhar (ex: navegador não encontrado ou bloqueado),
 * tenta novamente sem usar cookies.
 */
async function execYtDlpResilient(
  ytdlp: string,
  args: string[],
  options: { maxBuffer: number; timeout: number }
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync(ytdlp, args, options);
  } catch (error: any) {
    const hasCookiesFromBrowser = args.includes('--cookies-from-browser');
    const hasCookiesFile = args.includes('--cookies');
    
    if (hasCookiesFromBrowser || hasCookiesFile) {
      console.log('⚠️ Falha ao usar cookies (navegador ou arquivo) ou post bloqueado. Tentando sem cookies...');
      
      const cleanedArgs: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cookies-from-browser' || args[i] === '--cookies') {
          i++; // Pular o próximo argumento (nome do navegador ou caminho do arquivo)
          continue;
        }
        cleanedArgs.push(args[i]);
      }
      
      try {
        return await execFileAsync(ytdlp, cleanedArgs, options);
      } catch (retryError: any) {
        throw retryError;
      }
    }
    
    throw error;
  }
}

/**
 * Obtém os argumentos de cookies para o yt-dlp.
 * Prioriza COOKIES_FILE ou cookies.txt local, e depois COOKIES_BROWSER.
 */
function getCookiesArgs(): string[] {
  // 1. Verificar se COOKIES_FILE está definido no env
  if (process.env.COOKIES_FILE) {
    const envPath = path.isAbsolute(process.env.COOKIES_FILE)
      ? process.env.COOKIES_FILE
      : path.join(process.cwd(), process.env.COOKIES_FILE);
    if (fs.existsSync(envPath)) {
      console.log(`🔑 Usando arquivo de cookies do env: ${envPath}`);
      return ['--cookies', envPath];
    } else {
      console.log(`⚠️ Arquivo de cookies do env não encontrado: ${envPath}`);
    }
  }

  // 2. Verificar cookies.txt na raiz do projeto
  const rootCookies = path.join(process.cwd(), 'cookies.txt');
  if (fs.existsSync(rootCookies)) {
    console.log(`🔑 Usando arquivo de cookies padrão (raiz): ${rootCookies}`);
    return ['--cookies', rootCookies];
  }

  // 3. Verificar data/cookies.txt
  const dataCookies = path.join(process.cwd(), 'data', 'cookies.txt');
  if (fs.existsSync(dataCookies)) {
    console.log(`🔑 Usando arquivo de cookies padrão (data): ${dataCookies}`);
    return ['--cookies', dataCookies];
  }

  // 4. Fallback para cookies do navegador
  const cookiesBrowser = process.env.COOKIES_BROWSER || 'chrome';
  if (cookiesBrowser && cookiesBrowser !== 'none') {
    return ['--cookies-from-browser', cookiesBrowser];
  }

  return [];
}

/**
 * Baixa um Reel do Instagram via yt-dlp.
 * @param url URL do reel no Instagram
 * @param outputDir Diretório onde salvar o arquivo
 * @returns Caminho do arquivo baixado e metadados extraídos
 */
export async function downloadReel(
  url: string,
  outputDir: string
): Promise<{ filePath: string; metadata: ReelMetadata }> {
  console.log(`📥 Iniciando download: ${url}`);

  // Garantir que o diretório de saída existe
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ytdlp = await findYtDlp();

  // Extrair metadados primeiro (JSON)
  const metadataArgs = [
    '--no-check-certificates',
    '--dump-json',
    '--no-download',
    ...getCookiesArgs(),
    url,
  ];

  let metadata: ReelMetadata;

  try {
    const { stdout: metaJson } = await execYtDlpResilient(ytdlp, metadataArgs, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 60000, // 60s timeout
    });

    const rawMeta = JSON.parse(metaJson);
    metadata = {
      title: rawMeta.title || '',
      description: rawMeta.description || '',
      duration: rawMeta.duration || 0,
      uploader: rawMeta.uploader || rawMeta.channel || '',
      uploaderId: rawMeta.uploader_id || rawMeta.channel_id || '',
      thumbnailUrl: rawMeta.thumbnail || '',
      viewCount: rawMeta.view_count || 0,
      likeCount: rawMeta.like_count || 0,
      webpage_url: rawMeta.webpage_url || url,
      id: rawMeta.id || '',
    };

    console.log(`📥 Metadados extraídos: "${metadata.title}" (${metadata.duration}s)`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`❌ Falha ao extrair metadados do reel: ${msg}`);
  }

  // Template do nome do arquivo de saída
  const outputTemplate = path.join(outputDir, '%(id)s.%(ext)s');

  // Baixar o vídeo em mp4
  const downloadArgs = [
    '--no-check-certificates',
    '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--output', outputTemplate,
    '--no-playlist',
    '--no-overwrites',
    '--retries', '3',
    '--fragment-retries', '3',
    '--concurrent-fragments', '4',
    ...getCookiesArgs(),
    url,
  ];

  try {
    const { stdout, stderr } = await execYtDlpResilient(ytdlp, downloadArgs, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000, // 5 minutos para download
    });

    if (stderr && !stderr.includes('WARNING')) {
      console.log(`📥 yt-dlp stderr: ${stderr.substring(0, 200)}`);
    }

    // Encontrar o arquivo baixado
    const expectedFile = path.join(outputDir, `${metadata.id}.mp4`);

    if (fs.existsSync(expectedFile)) {
      const stats = fs.statSync(expectedFile);
      console.log(
        `📥 Download concluído: ${expectedFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
      );
      return { filePath: expectedFile, metadata };
    }

    // Se o arquivo esperado não existe, tentar encontrar pelo padrão de nome
    const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.mp4'));
    const sortedFiles = files
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(outputDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);

    if (sortedFiles.length > 0) {
      const filePath = path.join(outputDir, sortedFiles[0].name);
      console.log(`📥 Download concluído (nome alternativo): ${filePath}`);
      return { filePath, metadata };
    }

    // Log do stdout para debug
    console.log(`📥 yt-dlp stdout: ${stdout.substring(0, 500)}`);
    throw new Error('Arquivo de vídeo não encontrado após download');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Arquivo de vídeo não encontrado')) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`❌ Falha no download do reel: ${msg}`);
  }
}

/**
 * Descobre URLs de reels de um perfil do Instagram usando gallery-dl.
 * Se falhar, cai para o fallback do yt-dlp.
 * @param username Username do Instagram (sem @)
 * @param limit Número máximo de reels para descobrir
 * @returns Lista de URLs dos reels encontrados
 */
export async function discoverReels(username: string, limit: number = 10): Promise<string[]> {
  console.log(`📥 Descobrindo reels de @${username} usando gallery-dl (limite: ${limit})`);

  try {
    const gallerydl = await findGalleryDl();
    const profileUrl = `https://www.instagram.com/${username}/`;

    const args = [
      '--range', `1-${limit}`,
      '--filter', 'video_url',
      '--print', '{shortcode}',
    ];

    // Inserir os argumentos de cookies
    const cookiesArgs = getCookiesArgs();
    if (cookiesArgs.length > 0) {
      args.push(...cookiesArgs);
    }
    
    args.push(profileUrl);

    console.log(`📥 Executando gallery-dl para varrer perfil de @${username}...`);
    const { stdout } = await execFileAsync(gallerydl, args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 60000, // 60s timeout
    });

    if (!stdout.trim()) {
      console.log(`📥 Nenhum reel retornado pelo gallery-dl para @${username}`);
      return [];
    }

    const shortcodes = stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
    const urls = shortcodes.map(code => `https://www.instagram.com/reel/${code}/`);

    console.log(`📥 ${urls.length} reels descobertos via gallery-dl para @${username}`);
    return urls;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Falha no gallery-dl ao descobrir reels de @${username}: ${msg}`);
    console.log('🔄 Utilizando fallback de descoberta via yt-dlp...');
    return discoverReelsYtDlp(username, limit);
  }
}

/**
 * Descobre URLs de reels de um perfil do Instagram usando yt-dlp --flat-playlist (Fallback).
 */
async function discoverReelsYtDlp(username: string, limit: number = 10): Promise<string[]> {
  console.log(`📥 Descobrindo reels de @${username} via yt-dlp (limite: ${limit})`);

  const ytdlp = await findYtDlp();
  const profileUrl = `https://www.instagram.com/${username}/`;

  const args = [
    '--no-check-certificates',
    '--flat-playlist',
    '--dump-json',
    '--playlist-items', `1:${limit}`,
    '--no-warnings',
    ...getCookiesArgs(),
    profileUrl,
  ];

  try {
    const { stdout } = await execYtDlpResilient(ytdlp, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 120000,
    });

    if (!stdout.trim()) {
      console.log(`📥 Nenhum reel encontrado para @${username}`);
      return [];
    }

    const lines = stdout.trim().split('\n');
    const urls: string[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const url = entry.url || entry.webpage_url || entry.original_url;

        if (url) {
          const normalizedUrl = normalizeInstagramUrl(url);
          if (normalizedUrl) {
            urls.push(normalizedUrl);
          }
        }
      } catch {
        continue;
      }
    }

    console.log(`📥 ${urls.length} reels descobertos via yt-dlp para @${username}`);
    return urls;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes('Private') || msg.includes('login')) {
      console.log(`📥 Perfil @${username} é privado ou requer login`);
      return [];
    }

    if (msg.includes('404') || msg.includes('not found')) {
      console.log(`📥 Perfil @${username} não encontrado`);
      return [];
    }

    throw new Error(`❌ Falha no fallback ao descobrir reels de @${username}: ${msg}`);
  }
}

/**
 * Normaliza uma URL do Instagram para o formato padrão.
 * @param url URL bruta que pode vir em vários formatos
 * @returns URL normalizada ou null se inválida
 */
function normalizeInstagramUrl(url: string): string | null {
  try {
    // Se já é uma URL completa do Instagram
    if (url.includes('instagram.com')) {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      // /reel/XXXXX/ ou /p/XXXXX/
      if (pathParts.length >= 2 && (pathParts[0] === 'reel' || pathParts[0] === 'p')) {
        return `https://www.instagram.com/${pathParts[0]}/${pathParts[1]}/`;
      }
    }

    // Se é apenas um shortcode/ID
    if (/^[A-Za-z0-9_-]+$/.test(url)) {
      return `https://www.instagram.com/reel/${url}/`;
    }

    return url;
  } catch {
    return null;
  }
}

/**
 * Extrai o shortcode/ID de uma URL do Instagram.
 * @param url URL do Instagram
 * @returns Shortcode extraído ou null
 */
export function extractInstagramId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2 && (pathParts[0] === 'reel' || pathParts[0] === 'p')) {
      return pathParts[1];
    }

    return null;
  } catch {
    return null;
  }
}
