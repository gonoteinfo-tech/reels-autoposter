import OpenAI from 'openai';

const getOpenAI = (): OpenAI | null => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
};

/**
 * Reescreve uma legenda para torná-la mais engajadora e viral no Reels do Instagram e Facebook.
 * 
 * @param originalCaption Legenda original do Reel
 * @returns Legenda reescrita pela IA ou a legenda original em caso de erro/indisponibilidade
 */
export async function rewriteCaption(originalCaption: string): Promise<string> {
  const openai = getOpenAI();
  if (!openai) {
    console.log('🤖 OpenAI API Key não configurada. Usando legenda original.');
    return originalCaption;
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemPrompt = `Você é um copywriter de elite especializado em engajamento para vídeos de Instagram Reels e TikTok em português do Brasil.
Seu objetivo é reescrever a legenda original de um vídeo curto para torná-la extremamente viral, persuasiva e atraente.

Regras da Legenda Reescrita:
1. Deve ser magnética e ter um gancho forte na primeira linha.
2. Use parágrafos curtos e espaçamento limpo para facilitar a leitura rápida.
3. Use emojis estratégicos e adequados ao conteúdo.
4. Adicione uma Chamada para Ação (CTA) clara no final (ex: "Compartilhe com um amigo que precisa ver isso!", "Siga para mais!", etc.).
5. Adicione hashtags relevantes ao final (entre 5 e 8 hashtags de nicho, sem excesso).
6. Mantenha o mesmo sentido e tom da mensagem original, mas muito mais polida e viral.

Responda apenas com o texto da nova legenda, sem explicações antes ou depois.`;

  try {
    console.log('🤖 Solicitando reescrita de legenda via OpenAI...');
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `LEGENDA ORIGINAL:\n\n${originalCaption || 'Sem legenda original.'}` }
      ],
      temperature: 0.8,
    });

    const content = response.choices[0].message.content?.trim();
    if (!content) throw new Error('OpenAI retornou uma resposta vazia.');

    console.log('🤖 Legenda reescrita com sucesso.');
    return content;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erro ao reescrever legenda com IA: ${msg}`);
    return originalCaption; // Retorna a original como fallback seguro
  }
}
