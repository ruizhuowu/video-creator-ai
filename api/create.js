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
    const raw = await callLLM(API_KEY, `你是顶级短视频内容策划专家，精通脚本创作、AI绘图提示词和多平台运营。

选题：${topic}
风格：${style}
画面基调：${scene_style}
核心矛盾：${core_conflict || '请自行设计'}

请完成以下三部分创作，全部一次返回：

【第一部分：5个分镜脚本】
节奏紧凑，开头3秒强钩子，台词每句不超过12字，结尾要有反转。

【第二部分：每个分镜的AI绘图提示词】
英文Midjourney提示词（含--ar 9:16 --v 6.1）+ 中文提示词（适合即梦/可灵）。

【第三部分：三平台发布文案】
小红书（种草风格）、抖音（冲击力强）、B站（有深度）各一份，突出AI生成科技感。

请只返回如下JSON：
{
  "script": {
    "title": "视频标题（含emoji，20字以内）",
    "total_duration": 预计秒数,
    "hook": "开头3秒钩子",
    "core_joke": "核心爆点一句话",
    "scenes": [
      {
        "id": 1,
        "duration": 秒数,
        "visual": "详细画面描述：人物外貌/服装/表情/动作 + 场景环境/道具/光线 + 构图镜头",
        "dialogue": "台词（简短有力，不超12字）",
        "caption": "画面字幕文字",
        "emotion": "情绪基调",
        "camera": "镜头描述"
      }
    ]
  },
  "prompts": [
    {
      "scene_id": 1,
      "mj_prompt": "完整Midjourney英文提示词 --ar 9:16 --v 6.1",
      "cn_prompt": "完整中文提示词，竖屏9:16，超高清",
      "style_note": "视觉重点"
    }
  ],
  "captions": {
    "xiaohongshu": {
      "title": "小红书标题（含emoji，25字以内）",
      "body": "正文（150-200字，种草风格，分段，emoji点缀）",
      "hashtags": ["话题1", "话题2", "AI创作", "AIGC", "人工智能"]
    },
    "douyin": {
      "hook": "开场白（一句话，让人停下来）",
      "caption": "完整文案（80-120字，节奏感强）",
      "hashtags": ["话题1", "话题2", "AI生成", "AI视频", "科技"]
    },
    "bilibili": {
      "title": "B站标题（30字以内）",
      "description": "视频简介（100-150字，介绍AI生成过程，引导三连）",
      "tags": ["AI", "AIGC", "人工智能", "视频创作", "短视频"],
      "partition": "投稿分区建议"
    }
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
      max_tokens: 4000
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
