export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'SILICONFLOW_API_KEY未配置' });

  const { topic, style = '搞笑沙雕', scene_style = '现代都市' } = req.body || {};
  if (!topic) return res.status(400).json({ error: '请提供视频选题' });

  try {
    // ===== Agent 1: 脚本员 =====
    const scriptRaw = await callLLM(API_KEY, `
你是一个专业的短视频脚本写作专家，擅长${style}风格内容，深谙抖音/小红书爆款规律。

选题：${topic}
画面风格：${scene_style}

请创作一个5个分镜的短视频脚本，总时长15-30秒。要求：
1. 节奏紧凑，故事弧完整：铺垫→发展→高潮→反转→收尾
2. 对话简短有力，每句不超过15字
3. 画面描述具体，方便AI生图
4. 结尾要有互动引导（如：你们有没有遇到过这种情况？）

请只返回如下JSON：
{
  "title": "视频标题（吸引眼球，含emoji）",
  "total_duration": 预计秒数,
  "core_joke": "核心笑点一句话总结",
  "scenes": [
    {
      "id": 1,
      "duration": 秒数,
      "visual": "画面描述：具体描写画面中有什么人物、场景、动作、表情",
      "dialogue": "台词或旁白（简短）",
      "emotion": "情绪基调",
      "camera": "镜头描述"
    }
  ]
}
    `);

    let scriptData;
    try { scriptData = JSON.parse(scriptRaw); } catch {
      const m = scriptRaw.match(/\{[\s\S]*\}/);
      scriptData = m ? JSON.parse(m[0]) : null;
    }
    if (!scriptData?.scenes) throw new Error('脚本生成失败，请重试');

    // ===== Agent 2: 提示词员 =====
    const promptRaw = await callLLM(API_KEY, `
你是一个专业的AI绘图提示词专家，精通FLUX模型的英文提示词写法。

视频风格：${style}，画面基调：${scene_style}

以下是视频5个分镜的画面描述，请为每个分镜生成高质量英文FLUX提示词：

${scriptData.scenes.map(s => `分镜${s.id}（${s.emotion}）：${s.visual}`).join('\n')}

提示词要求：
1. 纯英文
2. 结构：[主体描述], [场景环境], [光线氛围], [画风], [质量标签]
3. 竖屏构图，适合手机短视频
4. 画风：${style === '搞笑沙雕' ? 'comic style, exaggerated expressions, vibrant colors, cartoon-like' : 'cinematic, photorealistic, detailed'}
5. 结尾必须加：vertical composition, 9:16 aspect ratio, high quality, 8k resolution

请只返回如下JSON：
{
  "prompts": [
    {
      "scene_id": 1,
      "prompt": "完整英文提示词",
      "zh_desc": "一句话中文说明这张图是什么"
    }
  ]
}
    `);

    let promptData;
    try { promptData = JSON.parse(promptRaw); } catch {
      const m = promptRaw.match(/\{[\s\S]*\}/);
      promptData = m ? JSON.parse(m[0]) : { prompts: [] };
    }

    // ===== Agent 3: 文案员 =====
    const captionRaw = await callLLM(API_KEY, `
你是一个短视频运营专家，精通抖音和小红书的流量密码。

视频标题：${scriptData.title}
核心笑点：${scriptData.core_joke}
视频风格：${style}

请分别生成抖音和小红书的发布文案，要突出"AI生成"这个亮点，打造科技感标签。

请只返回如下JSON：
{
  "douyin": {
    "caption": "抖音文案，前3行必须吸引眼球，含emoji，结尾引导互动",
    "hashtags": ["话题1", "话题2", "AI生成", "AI视频", "人工智能"]
  },
  "xiaohongshu": {
    "title": "小红书标题（含emoji，20字以内）",
    "caption": "小红书正文，种草风格，可以介绍AI生成过程，引发好奇心",
    "hashtags": ["标签1", "AI生成", "AI视频创作", "人工智能", "AIGC"]
  }
}
    `);

    let captionData;
    try { captionData = JSON.parse(captionRaw); } catch {
      const m = captionRaw.match(/\{[\s\S]*\}/);
      captionData = m ? JSON.parse(m[0]) : null;
    }

    return res.status(200).json({
      success: true,
      script: scriptData,
      prompts: promptData?.prompts || [],
      captions: captionData
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
      model: 'Qwen/Qwen2.5-72B-Instruct',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: 3000
    })
  });
  const data = await res.json();
  if (!data.choices) throw new Error('API返回异常: ' + JSON.stringify(data));
  return data.choices[0].message.content;
}
