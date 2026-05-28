export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const ACCESS_KEY = process.env.KLING_ACCESS_KEY;
  const SECRET_KEY = process.env.KLING_SECRET_KEY;
  if (!ACCESS_KEY || !SECRET_KEY) {
    return res.status(500).json({ error: 'KLING密钥未配置' });
  }

  const { requestId, mode } = req.body || {};
  if (!requestId) return res.status(400).json({ error: '请提供requestId' });

  try {
    const token = await generateJWT(ACCESS_KEY, SECRET_KEY);
    const endpoint = mode === 'T2V'
      ? `https://api.klingai.com/v1/videos/text2video/${requestId}`
      : `https://api.klingai.com/v1/videos/image2video/${requestId}`;

    const resp = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await resp.json();
    const status = data.data?.task_status; // submitted | processing | succeed | failed

    let mappedStatus;
    if (status === 'succeed') mappedStatus = 'Succeed';
    else if (status === 'failed') mappedStatus = 'Failed';
    else mappedStatus = 'InProgress';

    const url = data.data?.task_result?.videos?.[0]?.url || null;

    return res.status(200).json({
      success: true,
      status: mappedStatus,
      url,
      raw: status
    });

  } catch (err) {
    return res.status(500).json({ error: '查询失败', details: err.message });
  }
}

async function generateJWT(accessKey, secretKey) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    iss: accessKey,
    exp: now + 1800,
    nbf: now - 5
  }));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${base64url(sig)}`;
}

function base64url(input) {
  let str;
  if (typeof input === 'string') {
    str = btoa(unescape(encodeURIComponent(input)));
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(input)));
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
