// <<<<<<< HEAD
// module.exports = (req, res) => {
//   res.setHeader('Content-Type','text/plain');
//   res.setHeader('Access-Control-Allow-Origin','*');
//   res.statusCode = 200;
//   res.end('proxy-audio: OK');
// =======
// api/proxy-audio.js
// Vercel serverless proxy for audio files.
// - Forwards Range header (seeking)
// - Follows redirects
// - Streams binary to client
// - Basic host whitelist and optional token protection

const ALLOWED_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  'drive.usercontent.google.com', // google's content host after redirect
  'raw.githubusercontent.com',
  // add S3 or other hosts you trust, e.g. 'your-bucket.s3.amazonaws.com'
];

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // set to your site origin in prod
const REQUIRE_TOKEN = !!process.env.PROXY_TOKEN; // if set, require ?t=<token>

function isAllowedHost(url) {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.some(h => u.hostname.includes(h));
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  try {
    // optional token check to avoid public abuse
    if (REQUIRE_TOKEN) {
      const token = req.query.t || (new URL(req.url, `http://${req.headers.host}`)).searchParams.get('t');
      if (!token || token !== process.env.PROXY_TOKEN) {
        res.statusCode = 401;
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
        return res.end('unauthorized');
      }
    }

    // read url param
    const rawUrl = req.query.url || (new URL(req.url, `http://${req.headers.host}`)).searchParams.get('url');
    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
      return res.end('missing url');
    }

    if (!isAllowedHost(rawUrl)) {
      res.statusCode = 403;
      res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
      return res.end('host not allowed');
    }

    // forward Range header if provided (important for seeking)
    const forwardHeaders = {};
    if (req.headers.range) forwardHeaders['Range'] = req.headers.range;
    // some hosts require a UA
    forwardHeaders['User-Agent'] = 'vipassana-proxy/1.0 (+https://example.com)';

    // fetch upstream (follow redirects)
    const upstream = await fetch(rawUrl, { headers: forwardHeaders, redirect: 'follow' });

    if (!upstream.ok && upstream.status !== 206) {
      // surface status
      console.error('upstream fetch failed', upstream.status, rawUrl);
      res.statusCode = 502;
      res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
      return res.end(`upstream ${upstream.status}`);
    }

    // copy relevant headers/status
    res.statusCode = upstream.status;
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    // CORS and caching
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Cache-Control', 'public, max-age=300');

    // stream readable stream to Node response
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error('proxy error', err);
    if (!res.headersSent) res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.statusCode = 500;
    res.end('proxy error');
  }
// abaab32 (add proxy)
};
