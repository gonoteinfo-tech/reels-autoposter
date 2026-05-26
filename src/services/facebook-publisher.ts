import axios, { AxiosError } from 'axios';

const BASE_URL = 'https://graph.facebook.com/v21.0';

/**
 * Retorna o token de acesso da página do Facebook.
 */
function getAccessToken(): string {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) {
    throw new Error('❌ FACEBOOK_PAGE_ACCESS_TOKEN não configurado nas variáveis de ambiente.');
  }
  return token;
}

/**
 * Retorna o ID da página do Facebook.
 */
function getPageId(): string {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!pageId) {
    throw new Error('❌ FACEBOOK_PAGE_ID não configurado nas variáveis de ambiente.');
  }
  return pageId;
}

/**
 * Utilitário para aguardar N milissegundos.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Publica um vídeo na página do Facebook.
 * Usa o endpoint /PAGE_ID/videos com upload via URL do vídeo.
 *
 * @param videoUrl URL pública do vídeo (acessível pela Meta)
 * @param title Título do vídeo
 * @param description Descrição/legenda do vídeo
 * @returns ID do post publicado
 */
export async function publishVideoToPage(
  videoUrl: string,
  title: string,
  description: string
): Promise<string> {
  console.log('📘 Publicando vídeo na página do Facebook...');

  const accessToken = getAccessToken();
  const pageId = getPageId();

  try {
    const response = await axios.post(
      `${BASE_URL}/${pageId}/videos`,
      null,
      {
        params: {
          file_url: videoUrl,
          title: title,
          description: description,
          access_token: accessToken,
          published: 'true',
        },
        timeout: 120000, // 2 minutos para upload
      }
    );

    const videoId = response.data.id;
    console.log(`📘 Vídeo publicado no Facebook! Video ID: ${videoId}`);
    return videoId;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    throw new Error(`❌ Falha ao publicar vídeo no Facebook: ${errorMsg}`);
  }
}

/**
 * Publica um vídeo como Reel na página do Facebook.
 * Usa o fluxo de Resumable Upload da Graph API.
 *
 * Fluxo:
 * 1. Iniciar sessão de upload (POST /PAGE_ID/video_reels - start)
 * 2. Informar URL do vídeo (POST /PAGE_ID/video_reels - transfer via file_url)
 * 3. Finalizar e publicar (POST /PAGE_ID/video_reels - finish)
 *
 * @param videoUrl URL pública do vídeo
 * @param description Descrição/legenda do reel
 * @returns ID do post publicado
 */
export async function publishReelToPage(
  videoUrl: string,
  description: string
): Promise<string> {
  console.log('📘 Publicando Reel na página do Facebook...');

  const accessToken = getAccessToken();
  const pageId = getPageId();

  try {
    // Passo 1: Iniciar sessão de upload
    console.log('📘 [1/3] Iniciando sessão de upload...');
    const startResponse = await axios.post(
      `${BASE_URL}/${pageId}/video_reels`,
      null,
      {
        params: {
          upload_phase: 'start',
          access_token: accessToken,
        },
        timeout: 30000,
      }
    );

    const videoId = startResponse.data.video_id;
    const uploadUrl = startResponse.data.upload_url || `https://rupload.facebook.com/video-upload/v21.0/${videoId}`;

    if (!videoId) {
      throw new Error('Resposta inválida: video_id não retornado na fase start');
    }
    console.log(`📘 Sessão de upload criada. Video ID: ${videoId}`);

    // Passo 2: Transferir vídeo via URL (usando rupload.facebook.com)
    console.log('📘 [2/3] Transferindo vídeo via URL para o RUpload...');
    await axios.post(
      uploadUrl,
      null,
      {
        headers: {
          'Authorization': `OAuth ${accessToken}`,
          'file_url': videoUrl,
        },
        timeout: 120000, // 2 minutos para transferência
      }
    );

    console.log('📘 Transferência concluída');

    // Pequena pausa para processamento
    await sleep(3000);

    // Passo 3: Finalizar e publicar
    console.log('📘 [3/3] Finalizando e publicando...');
    const finishResponse = await axios.post(
      `${BASE_URL}/${pageId}/video_reels`,
      null,
      {
        params: {
          upload_phase: 'finish',
          video_id: videoId,
          video_state: 'PUBLISHED',
          title: description.substring(0, 100), // Título limitado
          description: description,
          access_token: accessToken,
        },
        timeout: 30000,
      }
    );

    const postId = finishResponse.data.post_id || finishResponse.data.id || videoId;
    console.log(`📘 Reel publicado no Facebook! Post ID: ${postId}`);

    return postId;
  } catch (error) {
    // Se já extraímos como Error com mensagem formatada, re-throw
    if (error instanceof Error && error.message.startsWith('❌')) {
      throw error;
    }

    const errorMsg = extractErrorMessage(error);
    throw new Error(`❌ Falha ao publicar Reel no Facebook: ${errorMsg}`);
  }
}

/**
 * Verifica o status da página do Facebook e permissões de publicação.
 * Útil para validar configuração antes de tentar publicar.
 *
 * @returns Informações básicas da página
 */
export async function verifyPageAccess(): Promise<{
  id: string;
  name: string;
  canPublish: boolean;
}> {
  console.log('📘 Verificando acesso à página do Facebook...');

  const accessToken = getAccessToken();
  const pageId = getPageId();

  try {
    const response = await axios.get(`${BASE_URL}/${pageId}`, {
      params: {
        fields: 'id,name,access_token',
        access_token: accessToken,
      },
      timeout: 15000,
    });

    const result = {
      id: response.data.id,
      name: response.data.name,
      canPublish: true,
    };

    console.log(`📘 Página verificada: "${result.name}" (ID: ${result.id})`);
    return result;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);

    if (errorMsg.includes('190') || errorMsg.includes('expired')) {
      console.error('📘 Token de acesso expirado ou inválido');
      return { id: pageId, name: 'Unknown', canPublish: false };
    }

    throw new Error(`❌ Falha ao verificar acesso à página: ${errorMsg}`);
  }
}

/**
 * Obtém insights básicos de um post publicado.
 * @param postId ID do post no Facebook
 * @returns Métricas do post
 */
export async function getPostInsights(
  postId: string
): Promise<{
  views: number;
  likes: number;
  shares: number;
  comments: number;
}> {
  const accessToken = getAccessToken();

  try {
    const response = await axios.get(`${BASE_URL}/${postId}`, {
      params: {
        fields: 'views,likes.summary(true),shares,comments.summary(true)',
        access_token: accessToken,
      },
      timeout: 15000,
    });

    return {
      views: response.data.views || 0,
      likes: response.data.likes?.summary?.total_count || 0,
      shares: response.data.shares?.count || 0,
      comments: response.data.comments?.summary?.total_count || 0,
    };
  } catch {
    // Retornar zeros em caso de erro (post pode não ter insights ainda)
    return { views: 0, likes: 0, shares: 0, comments: 0 };
  }
}

/**
 * Extrai mensagem de erro de uma resposta do axios ou erro genérico.
 * @param error Erro capturado
 * @returns Mensagem de erro formatada
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data;

    if (data?.error) {
      const fbError = data.error;
      return `[${fbError.code || 'N/A'}] ${fbError.message || 'Erro desconhecido'} (type: ${fbError.type || 'N/A'})`;
    }

    if (error.response) {
      return `HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 300)}`;
    }

    if (error.code === 'ECONNABORTED') {
      return 'Timeout na requisição à API do Facebook';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
