// Vercel 서버리스 함수 — GDACS 프록시 (프로덕션용)
//
// GDACS는 CORS를 허용하지 않고, WAF가 Origin/Referer 붙은 요청을 거부한다.
// 브라우저가 /gdacs/* 를 호출하면 vercel.json rewrite가 /api/gdacs/* 로 보내고,
// 이 함수가 깨끗한 헤더로 GDACS에 대신 요청해 결과를 돌려준다.
// (개발 서버에서는 vite.config.ts의 proxy가 같은 역할을 한다.)

interface Req {
  url?: string;
}
interface Res {
  status: (code: number) => Res;
  setHeader: (k: string, v: string) => void;
  send: (body: string) => void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  const url = req.url ?? '';
  // '/api/gdacs/' 뒤의 경로+쿼리를 그대로 GDACS 경로로 사용
  const marker = '/api/gdacs/';
  const idx = url.indexOf(marker);
  const rest = idx >= 0 ? url.slice(idx + marker.length) : '';
  const target = `https://www.gdacs.org/gdacsapi/${rest}`;

  try {
    const r = await fetch(target, {
      headers: { 'user-agent': 'curl/8.0', accept: 'application/json' },
    });
    const body = await r.text();
    res.setHeader('content-type', r.headers.get('content-type') ?? 'application/json');
    res.setHeader('cache-control', 's-maxage=600, stale-while-revalidate=1800');
    res.setHeader('access-control-allow-origin', '*');
    res.status(r.status).send(body);
  } catch {
    res.setHeader('content-type', 'application/json');
    res.status(502).send(JSON.stringify({ error: 'GDACS 프록시 실패' }));
  }
}
