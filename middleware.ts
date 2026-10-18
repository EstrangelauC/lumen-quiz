import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, LOCALE_COOKIE } from './i18n/config';

// Áreas que exigem conta de anfitrião (e-mail + palavra-passe)
const HOST_AREAS = ['/dashboard', '/host'];

export async function middleware(request: NextRequest) {
  // Link/QR de um jogo (/j/<pin>?l=pt): guarda a língua do anfitrião e limpa o endereço
  const lang = request.nextUrl.searchParams.get('l');
  if (request.nextUrl.pathname.startsWith('/j/') && lang !== null) {
    const url = request.nextUrl.clone();
    url.searchParams.delete('l');
    const redirect = NextResponse.redirect(url);
    if (isLocale(lang)) redirect.cookies.set(LOCALE_COOKIE, lang, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return redirect;
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Renova a sessão em cada pedido
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAccount = HOST_AREAS.some((area) => path === area || path.startsWith(`${area}/`));

  if (needsAccount && (!user || user.is_anonymous)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
