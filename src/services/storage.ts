import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

/**
 * Cria o cliente S3 configurado para Cloudflare R2.
 * Usa as variáveis de ambiente R2_ACCOUNT_ID, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.
 */
function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      '❌ Variáveis de ambiente R2 não configuradas. Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.'
    );
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Retorna o nome do bucket R2 a partir das variáveis de ambiente.
 */
function getBucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error('❌ R2_BUCKET_NAME não configurado nas variáveis de ambiente.');
  }
  return bucket;
}

/**
 * Retorna a URL pública base do R2.
 */
function getPublicUrl(): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) {
    throw new Error('❌ R2_PUBLIC_URL não configurado nas variáveis de ambiente.');
  }
  // Remover trailing slash
  return publicUrl.replace(/\/+$/, '');
}

/**
 * Faz upload de um arquivo de vídeo para o Cloudflare R2.
 * @param filePath Caminho local do arquivo para upload
 * @param key Chave (path) do objeto no bucket R2
 * @returns URL pública do arquivo enviado
 */
export async function uploadVideo(filePath: string, key: string): Promise<string> {
  console.log(`☁️ Iniciando upload para R2: ${key}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`❌ Arquivo não encontrado para upload: ${filePath}`);
  }

  const client = getR2Client();
  const bucket = getBucketName();
  const publicUrl = getPublicUrl();

  const fileContent = fs.readFileSync(filePath);
  const contentType = getMimeType(filePath);
  const stats = fs.statSync(filePath);

  console.log(`☁️ Tamanho do arquivo: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  const startTime = Date.now();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        ContentLength: stats.size,
        Metadata: {
          'uploaded-at': new Date().toISOString(),
          'original-name': path.basename(filePath),
        },
      })
    );

    const durationMs = Date.now() - startTime;
    const url = `${publicUrl}/${key}`;

    console.log(`☁️ Upload concluído em ${(durationMs / 1000).toFixed(1)}s: ${url}`);
    return url;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`❌ Falha no upload para R2: ${msg}`);
  }
}

/**
 * Remove um arquivo do Cloudflare R2.
 * @param key Chave do objeto a ser removido
 */
export async function deleteVideo(key: string): Promise<void> {
  console.log(`☁️ Removendo do R2: ${key}`);

  const client = getR2Client();
  const bucket = getBucketName();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    console.log(`☁️ Arquivo removido: ${key}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`❌ Falha ao remover do R2: ${msg}`);
  }
}

/**
 * Lista todas as chaves (paths) de objetos no bucket R2.
 * @returns Lista de chaves dos objetos
 */
export async function listVideos(): Promise<string[]> {
  console.log('☁️ Listando vídeos no R2...');

  const client = getR2Client();
  const bucket = getBucketName();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  try {
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            keys.push(obj.Key);
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`☁️ ${keys.length} vídeos encontrados no R2`);
    return keys;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`❌ Falha ao listar vídeos no R2: ${msg}`);
  }
}

/**
 * Remove vídeos mais antigos que N dias do R2.
 * Útil para gerenciar custos de armazenamento.
 * @param daysOld Idade mínima em dias para remoção
 * @returns Número de arquivos removidos
 */
export async function cleanupOldVideos(daysOld: number): Promise<number> {
  console.log(`☁️ Limpando vídeos com mais de ${daysOld} dias...`);

  const client = getR2Client();
  const bucket = getBucketName();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  let deletedCount = 0;
  let continuationToken: string | undefined;

  try {
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key && obj.LastModified && obj.LastModified < cutoffDate) {
            try {
              await client.send(
                new DeleteObjectCommand({
                  Bucket: bucket,
                  Key: obj.Key,
                })
              );
              deletedCount++;
              console.log(`☁️ Removido (antigo): ${obj.Key}`);
            } catch (deleteError) {
              console.error(
                `❌ Falha ao remover ${obj.Key}: ${
                  deleteError instanceof Error ? deleteError.message : String(deleteError)
                }`
              );
            }
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`☁️ Limpeza concluída: ${deletedCount} vídeos removidos`);
    return deletedCount;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`❌ Falha na limpeza de vídeos antigos: ${msg}`);
  }
}

/**
 * Verifica se um arquivo existe no R2.
 * @param key Chave do objeto
 * @returns true se o objeto existe
 */
export async function videoExists(key: string): Promise<boolean> {
  const client = getR2Client();
  const bucket = getBucketName();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Gera uma chave única para o R2 baseada no reel.
 * @param reelId ID do reel no banco de dados
 * @param sourceUsername Username do perfil-fonte
 * @param ext Extensão do arquivo (padrão: mp4)
 * @returns Chave formatada para o R2
 */
export function generateR2Key(
  reelId: number,
  sourceUsername: string,
  ext: string = 'mp4'
): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `reels/${sourceUsername}/${date}/reel_${reelId}.${ext}`;
}

/**
 * Determina o MIME type de um arquivo pela extensão.
 * @param filePath Caminho do arquivo
 * @returns MIME type string
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  // mime-types pode não estar disponível, usar mapeamento manual
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };

  return mimeMap[ext] || 'application/octet-stream';
}
