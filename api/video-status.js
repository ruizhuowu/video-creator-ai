export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const API_KEY = process.env.SILICONFLOW_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'SILICONFLOW_API_KEY 未配置' });
  }

  const { requestId } = req.body || {};
  if (!requestId) return res.status(400).json({ error: '请提供requestId' });

  try {
    const resp = await fetch('https://api.siliconflow.cn/v1/video/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({ requestId })
    });

    const data = await resp.json();
    // status: InQueue | Preparing | Running | Succeed | Failed
    const status = data.status;

    let mappedStatus;
    if (status === 'Succeed') mappedStatus = 'Succeed';
    else if (status === 'Failed') mappedStatus = 'Failed';
    else mappedStatus = 'InProgress';

    const url = data.results?.videos?.[0]?.url || null;

    return res.status(200).json({
      success: true,
      status: mappedStatus,
      url,
      raw: status,
      reason: data.reason || null
    });

  } catch (err) {
    return res.status(500).json({ error: '查询失败', details: err.message });
  }
}
