import https from 'node:https';

async function check() {
  try {
    const res = await fetch('https://jobfound.org/', {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });
    const text = await res.text();
    console.log('Status:', res.status);
    const title = text.match(/<title>([^<]+)<\/title>/i);
    console.log('Title:', title ? title[1] : 'none');

    // Check for next data or script content
    const nextData = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextData) {
      console.log('Found __NEXT_DATA__!');
      try {
        const json = JSON.parse(nextData[1]);
        console.log('Keys in next data:', Object.keys(json));
        if (json.props) {
          console.log('Props keys:', Object.keys(json.props));
          console.log('pageProps keys:', Object.keys(json.props.pageProps || {}));
        }
      } catch (e) {
        console.log('JSON parse error in __NEXT_DATA__');
      }
    } else {
      console.log('No __NEXT_DATA__ found (App router?)');
    }

    // Check for common routes like /api/jobs, /jobs, /sitemap.xml
    for (const endpoint of ['/api/jobs', '/jobs', '/api/search', '/sitemap.xml']) {
      try {
        const r = await fetch('https://jobfound.org' + endpoint, { headers: { 'user-agent': 'Mozilla/5.0' } });
        console.log(endpoint, '-> status:', r.status, 'content-type:', r.headers.get('content-type'));
      } catch (err) {
        console.log(endpoint, '-> error:', err.message);
      }
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

check();
