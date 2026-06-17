export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'SILICONFLOW_API_KEY未配置' });

  const { mode, ...params } = req.body || {};

  try {
    if (mode === 'inquiry') {
      return await handleInquiry(req, res, API_KEY, params);
    } else if (mode === 'outreach') {
      return await handleOutreach(req, res, API_KEY, params);
    } else if (mode === 'translate') {
      return await handleTranslate(req, res, API_KEY, params);
    } else {
      return res.status(400).json({ error: '未知mode，支持: inquiry / outreach / translate' });
    }
  } catch (err) {
    return res.status(500).json({ error: '处理失败', details: err.message });
  }
}

// ── 询盘处理 ────────────────────────────────────────────────────────────────
async function handleInquiry(req, res, apiKey, params) {
  const { email_content, product_category, customer_country, company_config } = params;
  if (!email_content) return res.status(400).json({ error: '请提供询盘邮件内容' });

  const configBlock = company_config
    ? `\n## 我方公司配置信息（请严格按照以下信息来起草回复）\n${company_config}`
    : '\n## 我方公司信息\n供职于一家专注家居百货出口的大型贸易公司（主营收纳、厨房、清洁、户外等家居产品，主要出口美国、欧洲、中东市场）。';

  const prompt = `你是一位有10年经验的外贸业务经理。${configBlock}

## 客户询盘邮件
${email_content.slice(0, 2000)}

## 补充信息
- 产品类别：${product_category || '家居百货'}
- 客户来源：${customer_country || '未知'}

请你以老练的外贸业务员视角，对这封询盘邮件进行深度分析并起草专业回复。

只返回如下JSON，不要有任何解释：
{
  "customer_analysis": {
    "summary": "客户画像摘要（50字以内，描述这是什么类型的客户）",
    "key_requirements": ["核心需求1", "核心需求2", "核心需求3"],
    "quantity_signal": "采购规模判断（大/中/小单，及依据）",
    "price_sensitivity": "价格敏感度（高/中/低，及依据）",
    "urgency": "紧迫程度（高/中/低，及依据）",
    "red_flags": ["需注意的风险点1（如有）", "需注意的风险点2（如有）"]
  },
  "email_reply": {
    "subject": "回复邮件主题（英文，专业）",
    "greeting": "Dear [Name],"或具体称呼（英文）",
    "body": "回复正文（英文，分段，专业有礼，300-400词）",
    "closing": "结尾（英文，如 Best regards,\\nSales Team | YaHu Import & Export Co., Ltd）"
  },
  "followup_advice": {
    "next_step": "下一步最重要的行动（30字以内）",
    "timeline": "建议跟进时间节点",
    "negotiation_tip": "谈判/跟进小技巧（50字以内，针对这个客户特点）",
    "template_actions": ["建议附上XXX", "建议主动提供XXX", "建议询问XXX"]
  }
}`;

  const raw = await callLLM(apiKey, prompt, 2000);
  const data = parseJSON(raw);
  if (!data?.customer_analysis) throw new Error('解析失败，原始内容: ' + raw.slice(0, 200));
  return res.status(200).json({ success: true, mode: 'inquiry', ...data });
}

// ── 开发信生成 ──────────────────────────────────────────────────────────────
async function handleOutreach(req, res, apiKey, params) {
  const { target_country, product, customer_type, special_note, company_config } = params;
  if (!target_country || !product) return res.status(400).json({ error: '请提供目标市场和产品信息' });

  const companyContext = company_config
    ? `## 我方公司信息\n${company_config}`
    : '## 我方公司信息\n宁波亚虎进出口有限公司，HOME-DOLLAR品牌，年出口额7.1亿美元，主营家居百货出口。';

  const prompt = `你是一位顶尖的外贸BD（商务拓展）专家，擅长撰写高转化率的英文开发信。
${companyContext}

## 目标客户信息
- 目标市场/国家：${target_country}
- 推广产品：${product}
- 客户类型：${customer_type || '零售商/批发商'}
- 特殊说明：${special_note || '无'}

请撰写一封高质量的英文开发信，要求：
1. 开头3句话抓住眼球，不要套话
2. 突出公司实力和产品差异化（可提及：年出口7.1亿美元、HOME-DOLLAR品牌、工厂直供）
3. 有明确的Call to Action
4. 语气专业但不死板，有温度
5. 控制在250字以内，适合忙碌采购商快速阅读

只返回如下JSON：
{
  "subject": "邮件主题（英文，吸引眼球，避免spam词）",
  "preview_text": "预览文字（英文，40字以内，邮件列表中显示在主题下方）",
  "body": "邮件正文（英文，分段清晰，包含问候、自我介绍、价值主张、CTA、签名）",
  "subject_alternatives": ["备选主题1（英文）", "备选主题2（英文）"],
  "localization_tips": "针对${target_country}市场的本地化注意点（中文，50字以内）"
}`;

  const raw = await callLLM(apiKey, prompt, 1500);
  const data = parseJSON(raw);
  if (!data?.body) throw new Error('解析失败，原始内容: ' + raw.slice(0, 200));
  return res.status(200).json({ success: true, mode: 'outreach', ...data });
}

// ── 工具函数 ────────────────────────────────────────────────────────────────
async function callLLM(apiKey, prompt, maxTokens = 2000) {
  const resp = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-ai/DeepSeek-V3',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: maxTokens
    })
  });
  const text = await resp.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    throw new Error('API返回非JSON: ' + text.slice(0, 300));
  }
  if (!parsed.choices) {
    throw new Error('API调用失败: ' + (parsed.message || parsed.error?.message || JSON.stringify(parsed).slice(0, 200)));
  }
  return parsed.choices[0].message.content;
}

// ── 翻译校对 ────────────────────────────────────────────────────────────────
async function handleTranslate(req, res, apiKey, params) {
  const { text, direction } = params;
  if (!text) return res.status(400).json({ error: '请提供需要翻译的文本' });

  const isEnToZh = direction !== 'zh-en';
  const srcLang = isEnToZh ? '英文' : '中文';
  const tgtLang = isEnToZh ? '中文' : '英文';

  const prompt = `你是一位精通外贸领域的专业翻译，熟悉商务邮件、报价单、合同等外贸文书的表达方式。

请将以下${srcLang}外贸文本翻译成${tgtLang}，并对原文进行简要点评。

## 原文（${srcLang}）
${text.slice(0, 3000)}

要求：
- 翻译要准确、自然，保留商务邮件的正式语气
- 专业术语（如FOB、MOQ、L/C等）保留英文缩写并在括号内注明中文
- 点评部分指出原文的亮点和可改进之处（如果是AI生成的，重点找出不自然、过于套路化的表达）

只返回如下JSON：
{
  "translation": "完整翻译文本（保留原文段落结构）",
  "highlights": ["亮点1", "亮点2"],
  "suggestions": [
    { "original": "原文中某句话（英文）", "issue": "问题描述", "fix": "建议修改方向" }
  ],
  "tone_assessment": "整体语气评价（20字以内，如：专业正式、略显生硬、友好自然等）",
  "overall": "一句话总评（30字以内）"
}`;

  const raw = await callLLM(apiKey, prompt, 2000);
  const data = parseJSON(raw);
  if (!data?.translation) throw new Error('翻译解析失败');
  return res.status(200).json({ success: true, mode: 'translate', ...data });
}

function parseJSON(raw) {
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
    return null;
  }
}
