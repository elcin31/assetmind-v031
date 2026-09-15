import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from './AuthContext';
import type { AuthContextValue, SignUpResult } from './AuthContext';
import { supabase, supabaseConfigurationError } from './supabase';

function friendlyAuthError(error: unknown, fallback: string): string {
  const value = error as { code?: string; message?: string } | null;
  const code = value?.code?.toLowerCase() ?? '';
  const message = value?.message?.toLowerCase() ?? '';

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Confirm your email before signing in.';
  }
  if (code === 'user_already_exists' || code === 'user_already_registered' || message.includes('already registered')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (code === 'weak_password' || message.includes('password should be') || message.includes('weak password')) {
    return 'Choose a stronger password with at least 8 characters.';
  }
  if (code.includes('rate_limit') || message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (code === 'same_password' || message.includes('same password')) {
    return 'Choose a password different from your current password.';
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('failed to connect')) {
    return 'Authentication service is unavailable. Check your connection and try again.';
  }
  return fallback;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigurationError ?? 'Authentication is not configured.');
  }
  return supabase;
}

function authHashParams(): URLSearchParams {
  if (typeof window === 'undefined' || !window.location.hash) return new URLSearchParams();
  return new URLSearchParams(window.location.hash.slice(1));
}

function recoveryWasRequested(): boolean {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  const hash = authHashParams();
  return query.get('mode') === 'recovery' || query.has('error_code') || hash.get('type') === 'recovery' || hash.has('error_code');
}

function recoveryLinkHasError(): boolean {
  if (typeof window === 'undefined') return false;
  const query = new URLSearchParams(window.location.search);
  const hash = authHashParams();
  return query.has('error') || query.has('error_code') || hash.has('error') || hash.has('error_code');
}

function cleanAuthUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const authParams = ['mode', 'error', 'error_code', 'error_description'];
  let changed = false;
  for (const param of authParams) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  }
  if (url.hash) {
    url.hash = '';
    changed = true;
  }
  if (changed) window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => supabase !== null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const recoveryRequested = recoveryWasRequested();
    const recoveryErrored = recoveryLinkHasError();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setStartupError(null);
      } else if (event === 'SIGNED_OUT') {
        setRecoveryMode(false);
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setSession(null);
        setStartupError(friendlyAuthError(error, 'Could not restore your session. Please sign in again.'));
      } else {
        setSession(data.session);
        if (recoveryErrored || (recoveryRequested && !data.session)) {
          setRecoveryMode(false);
          setStartupError('This password recovery link is invalid or expired. Request a new one.');
        } else if (recoveryRequested && data.session) {
          // Handles both implicit-token and PKCE recovery callbacks, including the case
          // where Supabase restored the session before this component subscribed.
          setRecoveryMode(true);
          setStartupError(null);
        }
      }
      cleanAuthUrl();
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setSession(null);
      setStartupError('Authentication service is unavailable. Check your connection and try again.');
      cleanAuthUrl();
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyAuthError(error, 'Could not sign in. Please try again.'));
    setStartupError(null);
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    const client = requireSupabase();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) throw new Error(friendlyAuthError(error, 'Could not create the account. Please try again.'));
    if (!data.session && data.user?.identities?.length === 0) {
      throw new Error('An account with this email already exists. Sign in instead.');
    }
    setStartupError(null);
    return { requiresEmailConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const client = requireSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw new Error(friendlyAuthError(error, 'Could not sign out. Please try again.'));
    setRecoveryMode(false);
    setStartupError(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?mode=recovery`,
    });
    if (error) throw new Error(friendlyAuthError(error, 'Could not send the recovery email. Please try again.'));
    setStartupError(null);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      throw new Error(friendlyAuthError(error, 'Could not update your password. The recovery link may have expired.'));
    }
    setRecoveryMode(false);
    setStartupError(null);
    cleanAuthUrl();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    recoveryMode,
    configurationError: supabaseConfigurationError,
    startupError,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
  }), [loading, recoveryMode, session, signIn, signOut, signUp, startupError, resetPassword, updatePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
