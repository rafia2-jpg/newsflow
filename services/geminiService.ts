import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { NewsItem, GeneratedContent, AspectRatio, VideoDuration } from "../types";

const API_KEY = 'AIzaSyC8vsi5SP0BQgAk38i0amVM83cB2FC0fd8';

// Helper to ensure fresh instance
const getAI = async (requiresPaidKey: boolean = false) => {
  return new GoogleGenAI({ apiKey: API_KEY });
};

// Global cooldown tracker to prevent rapid-fire requests
let lastRequestTime = 0;
const MIN_REQUEST_SPACING = 2000; // 2 seconds between any request

async function enforceSpacing() {
  const now = Date.now();
  const diff = now - lastRequestTime;
  if (diff < MIN_REQUEST_SPACING) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_SPACING - diff));
  }
  lastRequestTime = Date.now();
}

// Retry Helper - Extreme robustness for Free Tier Quota (429)
async function callWithRetry<T>(fn: () => Promise<T>, retries: number = 3, delay: number = 5000): Promise<T> {
  await enforceSpacing();
  try {
    return await fn();
  } catch (error: any) {
    const msg = error?.message || '';
    const status = error?.status || error?.code;
    
    const isRateLimit = status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    const isServerOverload = status === 503 || status === 500;
    const isNetworkError = msg.includes('xhr error') || msg.includes('error code: 6') || msg.includes('Failed to fetch');
    
    if (retries > 0 && (isRateLimit || isServerOverload || isNetworkError)) {
      // For rate limits, we need a significant wait (at least 15s for free tier images)
      const waitTime = isRateLimit ? Math.max(delay, 15000) : delay;
      console.warn(`Gemini API: ${isRateLimit ? 'QUOTA EXCEEDED' : 'Error'}. Waiting ${waitTime/1000}s before retry ${4-retries}/3...`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return callWithRetry(fn, retries - 1, waitTime * 1.5);
    }
    throw error;
  }
}

// Robust JSON Extractor
function extractJSON(text: string): any {
  if (!text) return [];
  if (text.match(/^(I apologize|I cannot|I am unable|As an AI|My capabilities)/i)) {
      throw new Error("Model refused request: " + text.substring(0, 100));
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1]); } catch (e2) {}
    }
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(text.substring(start, end + 1)); } catch (e3) {}
    }
    throw new Error("Invalid JSON response from model");
  }
}

const COMMON_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

export const fetchBreakingNews = async (searchQuery?: string): Promise<NewsItem[]> => {
  const ai = await getAI();
  const currentDate = new Date().toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  let searchContext = "absolute latest breaking news stories in the USA";
  if (searchQuery) {
    searchContext = `absolute latest breaking news stories about "${searchQuery}" in the USA`;
  }

  const prompt = `Using the Google Search tool, find the top 5 ${searchContext} as of today, ${currentDate}. Return the result strictly as a valid JSON array. Each object in the array must have the following keys: 'headline', 'summary', 'sourceName', and 'publishedTime'. Do not include markdown formatting.`;

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      safetySettings: COMMON_SAFETY_SETTINGS
    },
  }));

  try {
    const items = extractJSON(response.text || "[]");
    return items.map((item: any, index: number) => ({
      ...item,
      id: `news-${Date.now()}-${index}`,
    }));
  } catch (e) {
    return [];
  }
};

export const fetchTrends = async (type: string, searchQuery?: string): Promise<NewsItem[]> => {
  const ai = await getAI();
  const currentDate = new Date().toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  let prompt = "";
  const baseInstruction = `Using the Google Search tool, find the top 5`;
  const jsonInstruction = `Return the result strictly as a valid JSON array with keys: 'headline', 'summary', 'sourceName', 'publishedTime'. Do not include markdown formatting.`;
  const spanishInstruction = `IMPORTANT: Provide the 'headline' and 'summary' strictly in Spanish (Español). This is mandatory for regional consistency.`;
  const searchMod = searchQuery ? `specifically regarding "${searchQuery}"` : "";

  if (type === 'daily') {
    prompt = `${baseInstruction} Daily Search Trends in the USA ${searchMod} for today, ${currentDate}. ${jsonInstruction}`;
  } else if (type === 'weekly') {
    prompt = `${baseInstruction} trending search topics in the USA ${searchMod} over the past 7 days (ending ${currentDate}). ${jsonInstruction}`;
  } else if (type === 'youtube') {
    prompt = `${baseInstruction} trending videos on YouTube in the USA ${searchMod} right now (${currentDate}). ${jsonInstruction}`;
  } else if (type === 'celebrity') {
    prompt = `${baseInstruction} latest breaking celebrity and pop culture news stories ${searchMod} in the USA right now (${currentDate}). ${jsonInstruction}`;
  } else if (type === 'politics') {
    prompt = `${baseInstruction} latest breaking political news stories ${searchMod} in the USA right now (${currentDate}). ${jsonInstruction}`;
  } else if (type === 'global') {
    prompt = `${baseInstruction} major global news stories ${searchMod} trending worldwide right now (${currentDate}). ${jsonInstruction}`;
  } else if (type === 'hollywood') {
    prompt = `${baseInstruction} latest breaking news stories strictly about Hollywood movies and actors ${searchMod} as of ${currentDate}. ${jsonInstruction}`;
  } else if (type === 'usa_footballers') {
    prompt = `${baseInstruction} latest trending news stories in the USA about famous footballers like Cristiano Ronaldo, Lionel Messi (Inter Miami), Neymar, and other soccer stars ${searchMod}. ${jsonInstruction}`;
  } else if (type === 'spain') {
    prompt = `${baseInstruction} latest breaking news stories in Spain (España) ${searchMod} right now (${currentDate}). ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'spain_celebrity') {
    prompt = `${baseInstruction} latest celebrity, pop culture, and gossip news in Spain (España) ${searchMod} right now (${currentDate}). ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'spain_politics') {
    prompt = `${baseInstruction} latest political news stories in Spain (España) ${searchMod} right now (${currentDate}). ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'spain_politics_fights') {
    prompt = `${baseInstruction} most viral and aggressive latest political fighting news (broncas, choques, y peleas políticas) in Spain (España) right now (${currentDate}). Focus on intense personal clashes between high-profile figures (like Pedro Sánchez, Núñez Feijóo, Santiago Abascal, or Isabel Díaz Ayuso), parliamentary insults, and heated controversies. ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'spain_movies') {
    prompt = `${baseInstruction} latest news about Spanish cinema (Cine español) ${searchMod} right now (${currentDate}). ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'spain_youtube') {
    prompt = `Using the Google Search tool, find the top 5 trending videos and topics on YouTube Spain (España) ${searchMod} right now (${currentDate}). ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'spain_viral') {
    prompt = `Using the Google Search tool, find the top 5 viral trends, hashtags, and topics in Spain (España) ${searchMod} right now (${currentDate}). ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'spain_sports') {
    prompt = `Using the Google Search tool, find the top 5 latest news stories regarding football (La Liga), tennis, etc. in Spain (España) ${searchMod} right now (${currentDate}). ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'spain_ronaldo_messi') {
    prompt = `Using the Google Search tool, find the top 5 latest news stories specifically about Cristiano Ronaldo and Lionel Messi ${searchMod} relevant to Spain (España) right now (${currentDate}). ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'spain_footballers') {
    prompt = `Using the Google Search tool, find the top 5 latest celebrity stories about famous footballers (Ronaldo, Messi, Mbappe, etc.) ${searchMod} trending in Spain (España) right now (${currentDate}). ${spanishInstruction} ${jsonInstruction}`;
  } else if (type === 'germany') {
    prompt = `${baseInstruction} latest breaking news stories in Germany (Deutschland) ${searchMod} right now (${currentDate}). ${jsonInstruction}`;
  } else if (type === 'pakistan') {
    prompt = `${baseInstruction} latest breaking news stories in Pakistan ${searchMod} right now (${currentDate}). ${jsonInstruction}`;
  } else if (type === 'india') {
    prompt = `${baseInstruction} latest breaking news stories in India ${searchMod} right now (${currentDate}). ${jsonInstruction}`;
  }

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      safetySettings: COMMON_SAFETY_SETTINGS
    },
  }));

  try {
    const items = extractJSON(response.text || "[]");
    return items.map((item: any, index: number) => ({
      ...item,
      id: `${type}-${Date.now()}-${index}`,
    }));
  } catch (e) {
    return [];
  }
};

export const fetchNewsByTopic = async (topic: string): Promise<NewsItem[]> => {
  const ai = await getAI();
  const currentDate = new Date().toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `Using the Google Search tool, find the top 5 latest news stories regarding "${topic}" as of ${currentDate}. Return the result strictly as a valid JSON array.`;

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      safetySettings: COMMON_SAFETY_SETTINGS
    },
  }));

  try {
    const items = extractJSON(response.text || "[]");
    return items.map((item: any, index: number) => ({
      ...item,
      id: `topic-${Date.now()}-${index}`,
    }));
  } catch (e) {
    return [];
  }
};

export const generateScript = async (newsItem: NewsItem, duration: VideoDuration = '3m', language: 'en' | 'es' = 'en'): Promise<string> => {
  const ai = await getAI();
  let wordCount = 450;
  switch(duration) {
      case '30s': wordCount = 80; break;
      case '1m': wordCount = 160; break;
      case '2m': wordCount = 300; break;
      case '3m': wordCount = 450; break;
      case '5m': wordCount = 750; break;
  }

  // Mandatory CTAs
  const introCTA = language === 'es' 
    ? "¡Hola a todos! Bienvenidos de nuevo. Antes de revelar esta impactante noticia que está sacudiendo al país, por favor asegúrate de suscribirte a nuestro canal para no perderte ni un solo vídeo interesante como este. ¡Vamos allá!"
    : "Welcome back everyone! Before we dive into this massive developing story that everyone is talking about, please make sure to subscribe to our channel right now for more interesting videos just like this one. Let's get right into it!";
    
  const middleCTA = language === 'es'
    ? "La situación se está volviendo cada vez más increíble, pero antes de contarte lo que pasó después, recuerda suscribirte si te gusta este tipo de contenido. Ahora, sigamos con los detalles."
    : "This situation is getting even more unbelievable, but before I reveal what happened next, please remember to subscribe if you enjoy these deep dives. Now, back to the details.";

  const outroCTA = language === 'es'
    ? "Gracias por quedarte hasta el final de este vídeo. Si quieres seguir viendo historias así de interesantes, suscríbete ahora y activa todas las notificaciones. ¡Nos vemos en el próximo vídeo!"
    : "Thank you so much for watching the full video. If you want to keep seeing more interesting stories like this one, subscribe right now and hit that notification bell. See you in the next one!";

  let stylePrompt = "";
  if (language === 'es') {
    stylePrompt = `Actúa como un presentador de noticias viral con millones de seguidores. Tu misión es escribir un guión ÚNICO, ADICTIVO y ALTAMENTE ENGANCHADOR en Español para la noticia: "${newsItem.headline}". 
    
    ESTRUCTURA OBLIGATORIA DEL GUIÓN:
    1. INICIO: Comienza con el texto exacto: "${introCTA}". Inmediatamente después, lanza un gancho (hook) intrigante sobre la noticia para que nadie se vaya.
    2. DESARROLLO (MITAD): A mitad del relato, inserta de forma fluida el siguiente recordatorio: "${middleCTA}". Sigue manteniendo el misterio.
    3. FINAL: Concluye con el texto exacto: "${outroCTA}".
    
    REGLAS DE ORO:
    - El tono debe ser profesional pero extremadamente emocionante, como un vídeo de tendencia.
    - Crea "Curiosity Gaps" (huecos de curiosidad) constantemente para que el espectador necesite ver el vídeo completo.
    - El cuerpo total debe tener aproximadamente ${wordCount} palabras. 
    - No uses direcciones de cámara, solo el texto que se dirá en voz alta. 
    - IMPORTANTE: Todo el texto debe estar en Español de España.`;
  } else {
    stylePrompt = `Act as a world-class viral news anchor. Your mission is to write a UNIQUE, ADDICTIVE, and HIGHLY ENGAGING script for: "${newsItem.headline}". 
    
    MANDATORY SCRIPT STRUCTURE:
    1. START: Begin with this exact text: "${introCTA}". Follow it immediately with a massive curiosity hook about the news.
    2. MIDDLE: At the halfway point, seamlessly weave in this reminder: "${middleCTA}". Keep the tension high.
    3. END: Conclude with this exact text: "${outroCTA}".
    
    GOLDEN RULES:
    - Tone: Professional yet high-energy and exciting (YouTube viral style).
    - Use "Curiosity Gaps" throughout the script to ensure the viewer watches until the very last second.
    - The total script should be around ${wordCount} words. 
    - No camera directions or actor names, just spoken text.`;
  }

  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: stylePrompt,
    config: { safetySettings: COMMON_SAFETY_SETTINGS }
  }));
  
  return response.text || "Failed to generate script.";
};

export const generateVoiceover = async (script: string): Promise<string> => {
  const ai = await getAI();
  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: script }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
      safetySettings: COMMON_SAFETY_SETTINGS
    },
  }));
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
  const wavBytes = addWavHeader(bytes, 24000, 1);
  const wavBlob = new Blob([wavBytes], { type: "audio/wav" });
  return URL.createObjectURL(wavBlob);
};

function addWavHeader(samples: Uint8Array, sampleRate: number, numChannels: number) {
  const buffer = new ArrayBuffer(44 + samples.length);
  const view = new DataView(buffer);
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) { view.setUint8(offset + i, string.charCodeAt(i)); }
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); 
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length, true);
  new Uint8Array(buffer, 44).set(samples);
  return buffer;
}

export const generateNewsImages = async (prompt: string, count: number = 4, aspectRatio: AspectRatio = '16:9', onImageGenerated?: (url: string) => void): Promise<string[]> => {
  const ai = await getAI(false);
  const results: string[] = [];
  
  for (let i = 0; i < count; i++) {
    try {
      const fullPrompt = `TV News broadcast image: ${prompt}. Photorealistic, professional journalism style. Image ${i+1}.`;
      // We use callWithRetry here which now has a 15s wait for 429 errors
      const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: fullPrompt }] },
        config: { imageConfig: { aspectRatio }, safetySettings: COMMON_SAFETY_SETTINGS }
      }));
      
      let b64: string | undefined;
      for (const part of response.candidates?.[0]?.content?.parts || []) { if (part.inlineData) { b64 = part.inlineData.data; break; } }
      if (b64) {
        const url = `data:image/jpeg;base64,${b64}`;
        if (onImageGenerated) onImageGenerated(url);
        results.push(url);
      }
      
      // Increased delay between SUCCESSFUL image requests to respect Free Tier RPM
      if (i < count - 1) await new Promise(r => setTimeout(r, 12000)); 
    } catch (e: any) {
      console.error(`Image generation error for index ${i}:`, e);
      // If a retry in callWithRetry still fails, wait even longer before trying next image in the loop
      await new Promise(r => setTimeout(r, 20000));
    }
  }
  return results;
};

export const generateThumbnail = async (prompt: string, aspectRatio: AspectRatio = '16:9', language: 'en' | 'es' = 'en'): Promise<string | undefined> => {
  const ai = await getAI(false);
  const styleInstruction = `YouTube Thumbnail style: high contrast, vibrant colors, bold yellow text overlay at bottom. Shocking or reaction face.`;
  let finalPrompt = `Viral news thumbnail for: "${prompt}". ${styleInstruction}`;
  if (language === 'es') finalPrompt += ` Text overlay in Spanish.`;

  try {
      const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: finalPrompt }] },
        config: { imageConfig: { aspectRatio }, safetySettings: COMMON_SAFETY_SETTINGS }
      }));
      let b64: string | undefined;
      for (const part of response.candidates?.[0]?.content?.parts || []) { if (part.inlineData) { b64 = part.inlineData.data; break; } }
      if (b64) return `data:image/jpeg;base64,${b64}`;
  } catch (e) { }
  return undefined;
};

export const generateVeoVideo = async (prompt: string, aspectRatio: AspectRatio = '16:9'): Promise<string> => {
  const ai = await getAI(true);
  let operation = await callWithRetry<any>(() => ai.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt: `Cinematic news B-roll: ${prompt}.`,
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
  }));
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 8000));
    operation = await callWithRetry<any>(() => ai.operations.getVideosOperation({ operation: operation }));
  }
  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("No video URI");
  const response = await fetch(`${videoUri}&key=${API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export const generateYouTubeMetadata = async (script: string, headline: string, language: 'en' | 'es' = 'en'): Promise<GeneratedContent['metadata']> => {
  const ai = await getAI();
  const prompt = `Generate YouTube title, description, and tags for: "${headline}" in ${language}. Return JSON.`;
  const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["title", "description", "tags"]
      },
      safetySettings: COMMON_SAFETY_SETTINGS
    }
  }));
  return JSON.parse(response.text || "{}");
};