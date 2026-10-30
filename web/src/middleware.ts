import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, sessaoValida } from '@/lib/sessao';

const PUBLICAS = ['/login', '/setup', '/recuperar', '/api/sair', '/api/robo/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`))) {
    return NextResponse.next();
  }

  if (await sessaoValida(req.cookies.get(COOKIE_SESSAO)?.value)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ erro: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
