import { TOWNS, FLAT_TYPES } from '../constants.js';

function sendJson(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  // Extract query parameters
  const host = req.headers?.host || 'localhost';
  const parsedUrl = new URL(req.url || '', `http://${host}`);
  const townParam = req.query?.town || parsedUrl.searchParams.get('town');
  const flatTypeParam = req.query?.flat_type || parsedUrl.searchParams.get('flat_type');

  // Strict validation against allowed lists BEFORE calling upstream
  if (!townParam || !TOWNS.includes(townParam)) {
    return sendJson(res, 400, {
      error: 'Invalid town parameter: must be one of the 26 allowed HDB towns.'
    });
  }

  if (!flatTypeParam || !FLAT_TYPES.includes(flatTypeParam)) {
    return sendJson(res, 400, {
      error: 'Invalid flat_type parameter: must be 2 ROOM, 3 ROOM, 4 ROOM, or MULTI-GENERATION.'
    });
  }

  // Construct upstream URL with encoded parameters
  const resourceId = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
  const filters = JSON.stringify({ town: townParam, flat_type: flatTypeParam });
  const searchParams = new URLSearchParams({
    resource_id: resourceId,
    filters: filters,
    sort: 'month desc',
    limit: '1000'
  });

  const upstreamUrl = `https://data.gov.sg/api/action/datastore_search?${searchParams.toString()}`;

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl);
  } catch (err) {
    return sendJson(res, 502, {
      error: 'Upstream unreachable: ' + (err?.message || 'Failed to reach data.gov.sg')
    });
  }

  // Check response.ok before reading body to prevent JSON parse crashes on empty/refused bodies
  if (!upstreamResponse.ok) {
    return sendJson(res, upstreamResponse.status, {
      error: `Upstream error: ${upstreamResponse.status} ${upstreamResponse.statusText || 'Request refused'}`
    });
  }

  let body;
  try {
    body = await upstreamResponse.json();
  } catch (err) {
    return sendJson(res, 502, {
      error: 'Failed to parse upstream response body as JSON.'
    });
  }

  const rawRecords = body?.result?.records || [];

  // Convert resale_price to Number and drop anything that is not finite
  const validRecords = [];
  for (const record of rawRecords) {
    const price = Number(record.resale_price);
    if (Number.isFinite(price) && record.month) {
      validRecords.push({
        month: String(record.month),
        price: price
      });
    }
  }

  // Set Cache-Control header for one day with stale-while-revalidate for two days
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');

  if (validRecords.length === 0) {
    return sendJson(res, 200, {
      town: townParam,
      flat_type: flatTypeParam,
      latest_month: null,
      transactions_used: 0,
      typical_price: null
    });
  }

  // Datastore returns oldest records first unless sort is honoured:
  // Check the month on the first record; if not newest, sort descending by month.
  const allMonths = validRecords.map(r => r.month);
  const maxMonth = allMonths.reduce((max, m) => (m > max ? m : max), allMonths[0]);
  if (validRecords[0].month !== maxMonth) {
    validRecords.sort((a, b) => b.month.localeCompare(a.month));
  } else {
    validRecords.sort((a, b) => b.month.localeCompare(a.month));
  }

  // Identify distinct months present in the result
  const distinctMonths = [];
  for (const record of validRecords) {
    if (!distinctMonths.includes(record.month)) {
      distinctMonths.push(record.month);
    }
  }

  const latest_month = distinctMonths[0] || null;
  // Take latest 3 months present in result
  const latest3Months = distinctMonths.slice(0, 3);
  const targetRecords = validRecords.filter(r => latest3Months.includes(r.month));

  const transactions_used = targetRecords.length;
  let typical_price = null;

  if (transactions_used > 0) {
    const prices = targetRecords.map(r => r.price).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    if (prices.length % 2 !== 0) {
      typical_price = prices[mid];
    } else {
      typical_price = Math.round((prices[mid - 1] + prices[mid]) / 2);
    }
  }

  // Return only the fields needed and nothing else
  return sendJson(res, 200, {
    town: townParam,
    flat_type: flatTypeParam,
    latest_month,
    transactions_used,
    typical_price
  });
}
