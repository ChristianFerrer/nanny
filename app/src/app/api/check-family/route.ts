import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ hasFamily: false }, { status: 500 });
    }

    // Extract authenticated user from request cookies
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ hasFamily: false, authenticated: false });
    }

    // Use admin client to bypass RLS
    const admin = getSupabaseAdmin();
    const { data: parent, error } = await admin
      .from('parents')
      .select('family_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('check-family: parent lookup error:', error);
      return NextResponse.json({ hasFamily: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      hasFamily: !!parent,
      familyId: parent?.family_id || null,
    });
  } catch (e) {
    console.error('check-family: unexpected error:', e);
    return NextResponse.json({ hasFamily: false }, { status: 500 });
  }
}
