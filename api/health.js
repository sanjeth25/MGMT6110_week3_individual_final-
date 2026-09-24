function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  const keyConfigured = 'not required';
  let upstreamAnswered = false;
  let upstreamStatus = null;

  try {
    const upstreamRes = await fetch(
      'https://data.gov.sg/api/action/datastore_search?resource_id=d_8b84c4ee58e3cfc0ece0d773c8ca6abc&limit=1',
      { method: 'GET' }
    );
    upstreamAnswered = true;
    upstreamStatus = upstreamRes.status;
  } catch (err) {
    upstreamAnswered = false;
    upstreamStatus = null;
  }

  return sendJson(res, 200, {
    keyConfigured,
    upstreamAnswered,
    upstreamStatus
  });
}
