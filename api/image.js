export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'SILICONFLOW_API_KEY未配置' });

  const { prompts = [] } = req.body || {};
  if (!prompts.length) return res.status(400).json({ error: '请提供图片提示词' });

  // 顺序生成，避免并发限流
  const images = [];
  for (const p of prompts) {
    try {
      const url = await generateImage(API_KEY, p.prompt, p.scene_id);
      images.push({ scene_id: p.scene_id, url, success: true });
    } catch (e) {
      images.push({ scene_id: p.scene_id, url: null, success: false, error: e.message });
    }
  }

  return res.status(200).json({ success: true, images });
}

async function generateImage(apiKey, prompt, sceneId) {
  const body = {
    model: 'Kwai-Kolors/Kolors',
    prompt: prompt,
    image_size: '720x1280',
    num_inference_steps: 4
  };

  const res = await fetch('https://api.siliconflow.cn/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  // 返回详细错误帮助排查
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  if (!data.images?.[0]?.url) {
    throw new Error(`无图片URL: ${JSON.stringify(data)}`);
  }
  return data.images[0].url;
}
