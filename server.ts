import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(express.json({ limit: '50mb' }));

// In-memory database
const sessions = new Map<string, any>();

app.post('/api/parse-menu', async (req, res) => {
  try {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: '缺少圖片資料' });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType || 'image/jpeg',
          },
        },
        {
          text: 'Parse this menu into a structured JSON format.\n1. "items": Extract EVERY SINGLE DRINK OR FOOD ITEM on the menu. These are the main products being sold. Extract their base prices. If the menu items have both Chinese and English names, you MUST include BOTH languages in the name field (e.g., "茉莉綠茶 Jasmine Green Tea").\n2. "globalCategories": Extract common customization options (like Sugar level, Ice level, Temperature) here. For EACH category, you MUST extract ALL available choices (e.g., "Regular Sugar", "Half Sugar", "No Sugar") into the "options" array. DO NOT put sugar levels, ice levels, or toppings as main items in the "items" array.\n3. "customCategories": Only put item-specific options (like Size if prices vary per item, or specific add-ons) here for that specific item, and include all available choices for it in its "options" array.',
        },
      ],
    },
    config: {
      systemInstruction: 'You are an expert data extraction assistant. Your job is to meticulously extract every single main menu item (drinks, food) from the provided image into the "items" array. CRITICAL: Customization options like "Sugar Level" (無糖, 微糖, etc.), "Ice Level" (正常冰, 少冰, etc.), or "Toppings" MUST NOT be placed in the "items" array. They MUST be placed in the "globalCategories" array or the item specific "customCategories" array. For every category you find, you MUST populate its "options" array with all the available choices. If an item has a name in multiple languages (e.g., Chinese and English), you MUST extract and combine BOTH into the name field.',
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: 'A unique ID for the item (e.g., item-1)' },
                name: { type: Type.STRING, description: 'The name of the item' },
                price: { type: Type.NUMBER, description: 'The base price of the item' },
                customCategories: {
                  type: Type.ARRAY,
                  description: 'Categories specific ONLY to this item (e.g., Size, specific toppings).',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING, description: 'Category name (e.g., Size)' },
                      required: { type: Type.BOOLEAN, description: 'Is this category required?' },
                      multiple: { type: Type.BOOLEAN, description: 'Can multiple options be selected?' },
                      options: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING, description: 'Option name (e.g., Large)' },
                            price: { type: Type.NUMBER, description: 'Additional price (0 if none)' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          globalCategories: {
            type: Type.ARRAY,
            description: 'Categories that apply to most items, like Sugar or Ice levels.',
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'Category name (e.g., Sugar, Ice)' },
                required: { type: Type.BOOLEAN, description: 'Is this category required?' },
                multiple: { type: Type.BOOLEAN, description: 'Can multiple options be selected?' },
                options: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING, description: 'Option name (e.g., Regular, Less)' },
                      price: { type: Type.NUMBER, description: 'Additional price (0 if none)' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  let parsedData: any = {};
  let rawText = response.text || '';
  rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    parsedData = JSON.parse(rawText || '{}');
  } catch {
    const lastValidIndex = Math.max(rawText.lastIndexOf('}'), rawText.lastIndexOf(']'));
    if (lastValidIndex !== -1) {
      let fixedText = rawText.substring(0, lastValidIndex + 1);
      const stack: string[] = [];
      let inString = false;
      let escape = false;
      for (let i = 0; i < fixedText.length; i++) {
        const char = fixedText[i];
        if (inString) {
          if (escape) escape = false;
          else if (char === '\\') escape = true;
          else if (char === '"') inString = false;
        } else {
          if (char === '"') inString = true;
          else if (char === '{' || char === '[') stack.push(char);
          else if (char === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
          else if (char === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
        }
      }
      if (inString) fixedText += '"';
      while (stack.length > 0) {
        fixedText += stack.pop() === '{' ? '}' : ']';
      }
      try {
        parsedData = JSON.parse(fixedText);
      } catch {
        return res.status(422).json({ error: '菜單解析不完整，請嘗試拍攝局部菜單或重新上傳。' });
      }
    } else {
      return res.status(422).json({ error: '菜單解析失敗，請確保圖片清晰可見。' });
    }
  }

  const globalCategories = parsedData.globalCategories || [];
  let itemsArray: any[] = [];
  if (Array.isArray(parsedData)) {
    itemsArray = parsedData;
  } else if (parsedData.items && Array.isArray(parsedData.items)) {
    itemsArray = parsedData.items;
  }
  if (itemsArray.length === 0 && typeof parsedData === 'object' && parsedData !== null) {
    for (const key in parsedData) {
      if (key !== 'globalCategories' && Array.isArray(parsedData[key]) && parsedData[key].length > 0) {
        const firstItem = parsedData[key][0];
        if (firstItem && typeof firstItem === 'object' && ('name' in firstItem || 'title' in firstItem)) {
          itemsArray = parsedData[key];
          break;
        }
      }
    }
  }

  const menu = itemsArray
    .filter((item: any) => item && (item.name || item.title) && typeof (item.name || item.title) === 'string' && (item.name || item.title).trim() !== '')
    .map((item: any) => ({
      id: item.id || Math.random().toString(36).substring(7),
      name: (item.name || item.title).trim(),
      price: typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0),
      categories: [...globalCategories, ...(item.customCategories || [])],
    }));

  if (menu.length === 0) {
    return res.status(422).json({ error: '無法從圖片中辨識出任何有效的菜單項目，請確保圖片清晰可見。' });
  }

  const sessionId = uuidv4();
  const ownerId = uuidv4();
  sessions.set(sessionId, {
    id: sessionId,
    ownerId,
    menu,
    items: [],
    status: 'open',
    createdAt: Date.now(),
  });

  res.json({ sessionId, ownerId });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({ error: '目前系統使用人數較多，已達到 AI 服務的用量上限 (Quota Exceeded)。請稍後再試，或檢查您的 API 配額。' });
    }
    return res.status(500).json({ error: '伺服器發生錯誤，請稍後再試。' });
  }
});

app.post('/api/sessions', (req, res) => {
  const { menu } = req.body;
  const sessionId = uuidv4();
  const ownerId = uuidv4();

  const newSession = {
    id: sessionId,
    ownerId,
    menu,
    items: [],
    status: 'open',
    createdAt: Date.now(),
  };

  sessions.set(sessionId, newSession);
  res.json({ sessionId, ownerId });
});

app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  // Don't send ownerId to everyone
  const { ownerId, ...publicSession } = session;
  res.json(publicSession);
});

app.get('/api/sessions/:id/owner/:ownerId', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (session.ownerId !== req.params.ownerId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  res.json(session);
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
  socket.on('join_session', (sessionId) => {
    socket.join(sessionId);
  });

  socket.on('add_item', ({ sessionId, item }) => {
    const session = sessions.get(sessionId);
    if (session && session.status === 'open') {
      const newItem = { ...item, id: uuidv4() };
      session.items.push(newItem);
      io.to(sessionId).emit('session_updated', session);
    }
  });

  socket.on('remove_item', ({ sessionId, itemId, ownerId }) => {
    const session = sessions.get(sessionId);
    if (session) {
      // Only owner or the person who added it should remove it, but for simplicity we just check if session exists
      // In a real app, we'd verify identity
      session.items = session.items.filter((i: any) => i.id !== itemId);
      io.to(sessionId).emit('session_updated', session);
    }
  });

  socket.on('close_session', ({ sessionId, ownerId }) => {
    const session = sessions.get(sessionId);
    if (session && session.ownerId === ownerId) {
      session.status = 'closed';
      io.to(sessionId).emit('session_updated', session);
    }
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
