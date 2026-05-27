export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'SILICONFLOW_API_KEY未配置' });

  const { style = '搞笑沙雕' } = req.body || {};

  try {
    const raw = await callLLM(API_KEY, `
你是一个专业的短视频爆款选题策划师，深度研究抖音、小红书的流量规律。

请生成8个当下最有爆款潜力的AI生成视频选题，主要风格是${style}。

要求：
1. 贴近当下年轻人的共鸣点（职场、恋爱、家庭、搞笑日常等）
2. 画面感强，适合AI生图（场景清晰，有视觉冲击）
3. 有强烈的情绪钩子（笑点、反转、共鸣）
4. 每个选题要有明确的"梗"或"核心笑点"
5. 突出"AI生成"这个特点，让观众感受到科技感

请只返回如下JSON，不要有其他内容：
{
  "topics": [
    {
      "id": 1,
      "title": "选题标题（10字以内）",
      "hook": "核心笑点或梗（20字以内）",
      "scene_style": "适合的画面风格（如：办公室、古风、赛博朋克、卡通等）",
      "platform": "最适合平台（抖音/小红书/两者都适合）",
      "viral_score": 评分1到10的数字
    }
  ]
}
    `);

    let data;
    try { data = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      data = m ? JSON.parse(m[0]) : { topics: [] };
    }

    return res.status(200).json({ success: true, topics: data.topics || [] });
  } catch (err) {
    return res.status(500).json({ error: '选题生成失败', details: err.message });
  }
}

async function callLLM(apiKey, prompt) {
  const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'Qwen/Qwen2.5-72B-Instruct',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
      max_tokens: 2000
    })
  });
  const data = await res.json();
  if (!data.choices) throw new Error('API返回异常: ' + JSON.stringify(data));
  return data.choices[0].message.content;
}
