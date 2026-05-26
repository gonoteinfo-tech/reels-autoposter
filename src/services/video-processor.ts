import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';
import fs from 'fs';

// Configurar caminhos dos binários FFmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

/** Posições suportadas para overlay da logo */
export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

/**
 * Calcula a expressão de overlay do FFmpeg para a posição desejada.
 * @param position Posição da logo no vídeo
 * @param padding Padding em pixels das bordas
 * @returns Expressão de overlay para o FFmpeg
 */
function getOverlayPosition(position: LogoPosition, padding: number = 30): string {
  switch (position) {
    case 'top-left':
      return `${padding}:${padding}`;
    case 'top-right':
      return `main_w-overlay_w-${padding}:${padding}`;
    case 'bottom-left':
      return `${padding}:main_h-overlay_h-${padding}`;
    case 'bottom-right':
      return `main_w-overlay_w-${padding}:main_h-overlay_h-${padding}`;
    case 'center':
      return '(main_w-overlay_w)/2:(main_h-overlay_h)/2';
    default:
      return `main_w-overlay_w-${padding}:main_h-overlay_h-${padding}`;
  }
}

/**
 * Obtém informações de um arquivo de vídeo via ffprobe.
 * @param filePath Caminho do arquivo de vídeo
 * @returns Metadados do vídeo (duração, dimensões, codecs)
 */
export function getVideoInfo(
  filePath: string
): Promise<{
  duration: number;
  width: number;
  height: number;
  codec: string;
  bitrate: number;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`❌ Falha ao obter info do vídeo: ${err.message}`));
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('❌ Nenhum stream de vídeo encontrado'));
        return;
      }

      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        codec: videoStream.codec_name || 'unknown',
        bitrate: Number(metadata.format.bit_rate) || 0,
      });
    });
  });
}

/**
 * Adiciona uma logo/marca d'água a um vídeo.
 * O vídeo é redimensionado para 1080x1920 (9:16) e codificado com H.264 + AAC.
 * A logo é escalada para a largura especificada mantendo proporção.
 *
 * @param inputPath Caminho do vídeo original
 * @param logoPath Caminho do arquivo de logo (PNG com transparência recomendado)
 * @param outputPath Caminho de saída do vídeo processado
 * @param position Posição da logo no vídeo
 * @param scale Largura da logo em pixels (altura auto-calculada)
 * @returns Caminho do vídeo processado
 */
export function addLogoToVideo(
  inputPath: string,
  logoPath: string,
  outputPath: string,
  position: string = 'bottom-right',
  scale: number = 80
): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`🎬 Processando vídeo: ${path.basename(inputPath)}`);
    console.log(`🎬 Logo: ${path.basename(logoPath)} | Posição: ${position} | Escala: ${scale}px`);

    // Validar arquivos de entrada
    if (!fs.existsSync(inputPath)) {
      reject(new Error(`❌ Vídeo não encontrado: ${inputPath}`));
      return;
    }

    if (!fs.existsSync(logoPath)) {
      reject(new Error(`❌ Logo não encontrada: ${logoPath}`));
      return;
    }

    // Garantir que o diretório de saída existe
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const overlayPos = getOverlayPosition(position as LogoPosition);

    // Construir o filtro complexo:
    // 1. Escalar vídeo para 1080x1920 com padding (letterbox/pillarbox)
    // 2. Escalar logo para largura desejada
    // 3. Fazer overlay da logo no vídeo
    const filterComplex = [
      // Escalar o vídeo para caber em 1080x1920 mantendo aspect ratio, depois adicionar padding preto
      `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[video]`,
      // Escalar a logo para a largura especificada, mantendo proporção
      `[1:v]scale=${scale}:-1[logo]`,
      // Overlay da logo no vídeo
      `[video][logo]overlay=${overlayPos}[out]`,
    ].join(';');

    const startTime = Date.now();

    ffmpeg()
      .input(inputPath)
      .input(logoPath)
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[out]',       // Usar output do filtro de vídeo
        '-map', '0:a?',        // Copiar áudio do input original (se existir)
        '-c:v', 'libx264',    // Codec de vídeo H.264
        '-preset', 'superfast', // Preset rápido de qualidade/velocidade
        '-crf', '23',          // Qualidade (menor = melhor, 18-28 range)
        '-c:a', 'aac',        // Codec de áudio AAC
        '-b:a', '128k',       // Bitrate do áudio
        '-ar', '44100',       // Sample rate
        '-movflags', '+faststart', // Otimizar para streaming web
        '-y',                  // Sobrescrever arquivo de saída
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log(`🎬 FFmpeg comando: ${commandLine.substring(0, 200)}...`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          const percent = Math.round(progress.percent);
          if (percent % 25 === 0) {
            console.log(`🎬 Progresso: ${percent}%`);
          }
        }
      })
      .on('end', () => {
        const durationMs = Date.now() - startTime;
        const stats = fs.statSync(outputPath);
        console.log(
          `🎬 Processamento concluído em ${(durationMs / 1000).toFixed(1)}s ` +
            `(${(stats.size / 1024 / 1024).toFixed(2)} MB)`
        );
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`❌ Erro no FFmpeg: ${err.message}`);
        // Limpar arquivo parcial se existir
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch {
            // Ignorar erro de limpeza
          }
        }
        reject(new Error(`❌ Falha no processamento de vídeo: ${err.message}`));
      })
      .run();
  });
}

/**
 * Processa um vídeo sem adicionar logo, apenas redimensionando para 9:16.
 * Útil quando não há logo configurada.
 *
 * @param inputPath Caminho do vídeo original
 * @param outputPath Caminho de saída
 * @returns Caminho do vídeo processado
 */
export function resizeVideo(inputPath: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`🎬 Redimensionando vídeo: ${path.basename(inputPath)}`);

    if (!fs.existsSync(inputPath)) {
      reject(new Error(`❌ Vídeo não encontrado: ${inputPath}`));
      return;
    }

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const startTime = Date.now();

    ffmpeg()
      .input(inputPath)
      .videoFilters([
        'scale=1080:1920:force_original_aspect_ratio=decrease',
        'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
      ])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'superfast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-movflags', '+faststart',
        '-y',
      ])
      .output(outputPath)
      .on('end', () => {
        const durationMs = Date.now() - startTime;
        console.log(`🎬 Redimensionamento concluído em ${(durationMs / 1000).toFixed(1)}s`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch {
            // Ignorar
          }
        }
        reject(new Error(`❌ Falha ao redimensionar vídeo: ${err.message}`));
      })
      .run();
  });
}

/**
 * Gera uma thumbnail de um vídeo.
 * @param inputPath Caminho do vídeo
 * @param outputPath Caminho da imagem de saída
 * @param timestamp Tempo do frame em segundos (padrão: 1s)
 * @returns Caminho da thumbnail gerada
 */
export function generateThumbnail(
  inputPath: string,
  outputPath: string,
  timestamp: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    ffmpeg()
      .input(inputPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: outputDir,
        size: '1080x1920',
      })
      .on('end', () => {
        console.log(`🎬 Thumbnail gerada: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(new Error(`❌ Falha ao gerar thumbnail: ${err.message}`));
      });
  });
}
