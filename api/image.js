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

  try {
    // 并发生成所有分镜图片
    const results = await Promise.allSettled(
      prompts.map(p => generateImage(API_KEY, p.prompt, p.scene_id))
    );

    const images = results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return { scene_id: prompts[i].scene_id, url: r.value, success: true };
      } else {
        return { scene_id: prompts[i].scene_id, url: null, success: false, error: r.reason?.message };
      }
    });

    return res.status(200).json({ success: true, images });
  } catch (err) {
    return res.status(500).json({ error: '图片生成失败', details: err.message });
  }
}

async function generateImage(apiKey, prompt, sceneId) {
  const res = await fetch('https://api.siliconflow.cn/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt: prompt,
      image_size: '576x1024',
      num_inference_steps: 4,
      batch_size: 1
    })
  });

  const data = await res.json();
  if (!data.images || !data.images[0]?.url) {
    throw new Error(`分镜${sceneId}生图失败: ` + JSON.stringify(data));
  }
  return data.images[0].url;
}
