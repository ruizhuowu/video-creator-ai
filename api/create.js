export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'SILICONFLOW_API_KEY未配置' });

  const { topic, style = '搞笑沙雕', scene_style = '现代都市', core_conflict = '' } = req.body || {};
  if (!topic) return res.status(400).json({ error: '请提供视频选题' });

  try {
    const raw = await callLLM(API_KEY, `你是短视频内容策划专家。请根据以下信息一次性生成完整内容包。

选题：${topic}，风格：${style}，画面：${scene_style}，矛盾：${core_conflict || '自行设计'}

要求：3个分镜脚本 + 每个分镜的绘图提示词 + 三平台文案，只返回JSON：
{
  "script": {
    "title": "标题含emoji20字内",
    "total_duration": 秒数,
    "hook": "开头钩子一句话",
    "core_joke": "核心爆点一句话",
    "scenes": [
      {"id":1,"duration":秒数,"visual":"画面描述50字","dialogue":"台词不超12字","caption":"字幕","emotion":"情绪","camera":"镜头"}
    ]
  },
  "prompts": [
    {"scene_id":1,"mj_prompt":"英文MJ提示词 --ar 9:16 --v 6.1","cn_prompt":"中文提示词竖屏超高清","style_note":"视觉重点"}
  ],
  "captions": {
    "xiaohongshu": {"title":"标题含emoji","body":"正文80字种草风格","hashtags":["AI创作","AIGC","人工智能"]},
    "douyin": {"hook":"开场白一句话","caption":"文案80字","hashtags":["AI生成","科技"]},
    "bilibili": {"title":"B站标题","description":"简介80字","tags":["AI","AIGC","人工智能"],"partition":"分区"}
  }
}`);

    let data;
    try { data = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      data = m ? JSON.parse(m[0]) : null;
    }
    if (!data?.script?.scenes) throw new Error('内容生成失败，请重试');

    return res.status(200).json({
      success: true,
      script: data.script,
      prompts: data.prompts || [],
      captions: data.captions
    });

  } catch (err) {
    console.error('创作错误:', err);
    return res.status(500).json({ error: '创作失败', details: err.message });
  }
}

async function callLLM(apiKey, prompt) {
  const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-ai/DeepSeek-V3',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: 1800
    })
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error('API返回非JSON: ' + text.slice(0, 300));
  }
  if (!data.choices) {
    throw new Error('API调用失败: ' + (data.message || data.error?.message || JSON.stringify(data)));
  }
  return data.choices[0].message.content;
}
