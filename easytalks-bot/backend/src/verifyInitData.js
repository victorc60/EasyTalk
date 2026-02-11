import crypto from 'crypto';

const MAX_AGE_SECONDS = 3600; // optional freshness window to limit replay in dev/prod

const parseUser = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
};

export function verifyInitData(initData, botToken) {
  if (!initData) {
    return { ok: false, error: 'initData is required' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');

  if (!hash) {
    return { ok: false, error: 'hash is missing' };
  }

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const signature = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (signature !== hash) {
    return { ok: false, error: 'invalid signature' };
  }

  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);

  if (!authDate || now - authDate > MAX_AGE_SECONDS) {
    return { ok: false, error: 'auth_date is expired or invalid' };
  }

  const user = parseUser(params.get('user'));

  return {
    ok: true,
    user,
  };
}
