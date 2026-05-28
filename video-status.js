export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'SILICONFLOW_API_KEY未配置' });

  const { requestId } = req.body || {};
  if (!requestId) return res.status(400).json({ error: '请提供requestId' });

  try {
    const res2 = await fetch(`https://api.siliconflow.cn/v1/video/query/${requestId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    const data = await res2.json();

    // status: InQueue | InProgress | Succeed | Failed
    return res.status(200).json({
      success: true,
      status: data.status,
      url: data.results?.videos?.[0]?.url || null,
      details: data.status === 'Failed' ? JSON.stringify(data) : null
    });

  } catch (err) {
    return res.status(500).json({ error: '查询失败', details: err.message });
  }
}
