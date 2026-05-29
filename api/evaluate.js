export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'SILICONFLOW_API_KEY未配置' });

  const { task, content, dimensions } = req.body || {};
  if (!task || !content || !dimensions?.length) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const dimList = dimensions.slice(0, 8).join('、');

  try {
    const raw = await callLLM(API_KEY, `你是一位严格、客观、专业的AI输出质量评审专家。

【任务背景】
${task}

【待评估的AI输出内容】
${content.slice(0, 3000)}

【评估维度】
${dimList}

请对以上AI输出内容进行严格评审，从每个维度进行深度分析。评分标准：
- 9-10分：优秀，几乎无可挑剔
- 7-8分：良好，有小瑕疵
- 5-6分：一般，有明显不足
- 1-4分：较差，需大幅改进

请只返回如下JSON：
{
  "overall_score": 综合评分数字（1-10，可有小数）,
  "verdict": "一句话总体评价（10字以内）",
  "summary": "总体分析（80字以内，指出最突出的优点和最明显的问题）",
  "dimensions": [
    {
      "name": "维度名称",
      "score": 该维度评分（1-10整数）,
      "analysis": "该维度详细分析（60-100字，要具体，引用内容中的例子）",
      "suggestion": "具体改进建议（30-60字，要可操作）"
    }
  ],
  "final_advice": "综合改进建议（100字以内，按优先级列出最重要的2-3条改进方向）"
}`);

    let data;
    try { data = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      data = m ? JSON.parse(m[0]) : null;
    }
    if (!data?.dimensions) throw new Error('评估结果解析失败');

    return res.status(200).json({ success: true, ...data });

  } catch (err) {
    return res.status(500).json({ error: '评估失败', details: err.message });
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
      temperature: 0.3,
      max_tokens: 2000
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
