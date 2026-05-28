export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'SILICONFLOW_API_KEY未配置' });

  const { prompt, scene_id } = req.body || {};
  if (!prompt) return res.status(400).json({ error: '请提供视频提示词' });

  try {
    const res2 = await fetch('https://api.siliconflow.cn/v1/video/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'Wan-AI/Wan2.1-T2V-01-480P',
        prompt: prompt,
        negative_prompt: 'blurry, low quality, distorted, ugly, bad anatomy',
        image_size: '480x832',
        seed: Math.floor(Math.random() * 9999999)
      })
    });

    const data = await res2.json();

    if (!res2.ok || !data.requestId) {
      return res.status(500).json({
        error: '提交视频任务失败',
        details: JSON.stringify(data)
      });
    }

    return res.status(200).json({
      success: true,
      requestId: data.requestId,
      scene_id: scene_id
    });

  } catch (err) {
    return res.status(500).json({ error: '提交失败', details: err.message });
  }
}
