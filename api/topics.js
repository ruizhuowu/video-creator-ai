export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'SILICONFLOW_API_KEY未配置' });

  const { style = '搞笑沙雕' } = req.body || {};

  // ===== Step 1: 抓取实时热点 =====
  let trendContext = '';
  try {
    const [weiboRes, zhihuRes, douyinRes] = await Promise.allSettled([
      fetch('https://api.vvhan.com/api/hotlist/weiboHot', { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
      fetch('https://api.vvhan.com/api/hotlist/zhihuHot', { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
      fetch('https://api.vvhan.com/api/hotlist/douyinHot', { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
    ]);

    const trends = [];
    if (weiboRes.status === 'fulfilled' && weiboRes.value?.data?.length) {
      weiboRes.value.data.slice(0, 8).forEach(item => {
        if (item.title) trends.push(`[微博热搜] ${item.title}`);
      });
    }
    if (zhihuRes.status === 'fulfilled' && zhihuRes.value?.data?.length) {
      zhihuRes.value.data.slice(0, 6).forEach(item => {
        if (item.title) trends.push(`[知乎热榜] ${item.title}`);
      });
    }
    if (douyinRes.status === 'fulfilled' && douyinRes.value?.data?.length) {
      douyinRes.value.data.slice(0, 6).forEach(item => {
        if (item.title) trends.push(`[抖音热点] ${item.title}`);
      });
    }

    if (trends.length > 0) {
      trendContext = `\n\n【今日实时热点数据】\n${trends.join('\n')}`;
    }
  } catch (e) {
    // 热点抓取失败不影响后续流程
  }

  // ===== Step 2: DeepSeek-V3 生成内容选题 =====
  try {
    const raw = await callLLM(API_KEY, `你是一个顶级短视频内容策划师，深度研究抖音、小红书、B站的算法与爆款规律。${trendContext}

请结合以上实时热点（如果有），生成8个最有爆款潜力的短视频内容选题，风格偏向${style}。

要求：
1. 必须结合当下真实热点或社会情绪，不要编造过时的话题
2. 每个选题要有清晰的"核心冲突"或"情绪爆点"
3. 画面感强，适合用AI工具生成图片或视频
4. 要有具体的"梗"或"场景"，不能泛泛而谈
5. 考虑三个平台（小红书/抖音/B站）的不同受众

请只返回如下JSON，不要有其他内容：
{
  "trends_used": ["用到的热点1", "用到的热点2"],
  "topics": [
    {
      "id": 1,
      "title": "选题标题（15字以内，吸引眼球）",
      "hook": "核心爆点/梗（30字以内，说清楚为什么会火）",
      "scene_style": "适合的画面风格（如：赛博朋克办公室、古风街道、现代极简公寓等）",
      "core_conflict": "核心矛盾或情绪点（一句话）",
      "best_platform": "最适合平台（小红书/抖音/B站/三平台）",
      "viral_score": 评分1到10的数字
    }
  ]
}`);

    let data;
    try { data = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      data = m ? JSON.parse(m[0]) : { topics: [] };
    }

    return res.status(200).json({
      success: true,
      topics: data.topics || [],
      trends_used: data.trends_used || [],
      has_realtime: trendContext.length > 0
    });
  } catch (err) {
    return res.status(500).json({ error: '选题生成失败', details: err.message });
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
      max_tokens: 3000
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
