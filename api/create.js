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
    // ===== Agent 1: 脚本员 =====
    const scriptRaw = await callLLM(API_KEY, `你是顶级短视频脚本写作专家，擅长${style}风格，深谙抖音/小红书/B站爆款规律。

选题：${topic}
画面风格：${scene_style}
核心矛盾：${core_conflict || '未指定，请自行设计'}

创作一个5个分镜的短视频脚本，总时长15-30秒。要求：
1. 节奏极度紧凑，每一帧都有信息量
2. 开头3秒必须有强烈钩子（反常、悬念、反转）
3. 对话简短有力，每句不超过12字，要有金句
4. 结尾要有"意料之外情理之中"的反转
5. 画面描述要极其具体：人物外貌、服装、表情、动作、背景细节全部写出来

请只返回如下JSON：
{
  "title": "视频标题（含emoji，20字以内，要让人一眼想点）",
  "total_duration": 预计秒数,
  "hook": "开头3秒钩子（一句话描述）",
  "core_joke": "核心笑点/爆点一句话",
  "scenes": [
    {
      "id": 1,
      "duration": 秒数,
      "visual": "极其详细的画面描述：人物（外貌/服装/表情/动作）+ 环境（具体场景/道具/光线）+ 构图（镜头角度）",
      "dialogue": "台词（简短有力）",
      "caption": "画面字幕文字（适合短视频的关键词式字幕）",
      "emotion": "情绪基调",
      "camera": "镜头描述"
    }
  ]
}`);

    let scriptData;
    try { scriptData = JSON.parse(scriptRaw); } catch {
      const m = scriptRaw.match(/\{[\s\S]*\}/);
      scriptData = m ? JSON.parse(m[0]) : null;
    }
    if (!scriptData?.scenes) throw new Error('脚本生成失败');

    // ===== Agent 2: 提示词员（Midjourney专业版）=====
    const promptRaw = await callLLM(API_KEY, `你是专业的AI绘图提示词专家，精通Midjourney v6的提示词写法，能生成高质量、可直接使用的提示词。

视频风格：${style}，画面基调：${scene_style}
视频标题：${scriptData.title}

以下是5个分镜的详细画面描述，请为每个分镜生成专业的Midjourney提示词：

${scriptData.scenes.map(s => `分镜${s.id}（${s.emotion}情绪，${s.camera}）：${s.visual}`).join('\n\n')}

Midjourney提示词要求：
1. 纯英文，结构：[主体人物详细描述], [动作/表情], [场景环境细节], [光线效果], [画面氛围], [艺术风格], [构图], [质量标签] --ar 9:16 --v 6.1
2. 人物描述要具体：年龄/外貌/服装/发型/表情
3. 场景要有深度：前景/中景/背景都要描述
4. 光线要具体：natural light/studio lighting/neon glow等
5. 风格根据${style}选择：搞笑沙雕用comic style/cartoon exaggeration，温情治愈用warm cinematic，悬疑反转用dramatic dark等
6. 结尾必须加：portrait orientation, ultra detailed, 8K, masterpiece, best quality --ar 9:16 --v 6.1

同时提供中文版提示词（适合即梦/可灵/豆包使用）：
结构：[主体描述]，[动作表情]，[场景环境]，[光线氛围]，[画面风格]，[构图]，竖屏9:16，超高清，精细渲染

请只返回如下JSON：
{
  "prompts": [
    {
      "scene_id": 1,
      "mj_prompt": "完整Midjourney英文提示词（含--ar 9:16 --v 6.1）",
      "cn_prompt": "完整中文提示词（适合即梦/可灵）",
      "style_note": "这个分镜的视觉重点是什么"
    }
  ]
}`);

    let promptData;
    try { promptData = JSON.parse(promptRaw); } catch {
      const m = promptRaw.match(/\{[\s\S]*\}/);
      promptData = m ? JSON.parse(m[0]) : { prompts: [] };
    }

    // ===== Agent 3: 多平台文案员 =====
    const captionRaw = await callLLM(API_KEY, `你是顶级短视频运营专家，精通小红书、抖音、B站三个平台的流量算法和内容风格差异。

视频标题：${scriptData.title}
核心爆点：${scriptData.core_joke}
开头钩子：${scriptData.hook}
视频风格：${style}
场景：${scene_style}

请为这个视频分别生成三个平台的发布内容，要突出"AI生成"这个科技亮点。

注意各平台风格差异：
- 小红书：种草笔记风格，真实感强，emoji丰富，像朋友在分享
- 抖音：节奏感强，开头要有冲击力，话题标签要蹭热点
- B站：更有深度，可以介绍技术原理，UP主风格，弹幕互动感

请只返回如下JSON：
{
  "xiaohongshu": {
    "title": "小红书标题（含2-3个emoji，25字以内，要让人想点进来）",
    "body": "正文（200-300字，种草风格，可以讲创作过程，引发好奇，分段排版，emoji点缀）",
    "hashtags": ["话题1", "话题2", "AI创作", "AI绘画", "人工智能", "AIGC", "创意视频"]
  },
  "douyin": {
    "hook": "开场白（前3秒文案，一句话，必须让人停下来）",
    "caption": "完整文案（100-150字，节奏感强，有转折，引导互动）",
    "hashtags": ["话题1", "话题2", "AI生成", "AI视频", "人工智能", "科技"]
  },
  "bilibili": {
    "title": "B站标题（30字以内，可以有数字/教程感/UP主语气）",
    "description": "视频简介（150-200字，可介绍AI生成过程，技术看点，引导三连）",
    "tags": ["AI", "AIGC", "人工智能", "视频创作", "标签4", "标签5"],
    "partition": "投稿分区建议（如：科技/生活/娱乐）"
  }
}`);

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
