export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持POST请求' });

  const ACCESS_KEY = process.env.KLING_ACCESS_KEY;
  const SECRET_KEY = process.env.KLING_SECRET_KEY;
  if (!ACCESS_KEY || !SECRET_KEY) {
    return res.status(500).json({ error: 'KLING_ACCESS_KEY 或 KLING_SECRET_KEY 未配置' });
  }

  const { prompt, scene_id, image_url } = req.body || {};
  if (!prompt) return res.status(400).json({ error: '请提供视频提示词' });

  try {
    const token = await generateJWT(ACCESS_KEY, SECRET_KEY);

    let endpoint, body;

    if (image_url) {
      // 图生视频 I2V
      endpoint = 'https://api.klingai.com/v1/videos/image2video';
      body = {
        model_name: 'kling-v1',
        image: image_url,
        prompt: prompt,
        negative_prompt: 'blurry, low quality, distorted, static',
        cfg_scale: 0.5,
        mode: 'std',
        duration: '5'
      };
    } else {
      // 文生视频 T2V
      endpoint = 'https://api.klingai.com/v1/videos/text2video';
      body = {
        model_name: 'kling-v1',
        prompt: prompt,
        negative_prompt: 'blurry, low quality, distorted',
        cfg_scale: 0.5,
        mode: 'std',
        duration: '5',
        aspect_ratio: '9:16'
      };
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const data = await resp.json();

    if (data.code !== 0 || !data.data?.task_id) {
      return res.status(500).json({
        error: '提交可灵任务失败',
        details: JSON.stringify(data)
      });
    }

    return res.status(200).json({
      success: true,
      requestId: data.data.task_id,
      scene_id,
      mode: image_url ? 'I2V' : 'T2V'
    });

  } catch (err) {
    return res.status(500).json({ error: '提交失败', details: err.message });
  }
}

// 生成可灵 JWT token（无需第三方库）
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
  const sigB64 = base64url(sig);
  return `${data}.${sigB64}`;
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
