import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { ENV } from "@/lib/env";
import { sanitizeRole } from "@/lib/role-routes";

const AuthContext = createContext(undefined);

// DEMO ACCOUNTS - Always available in DEV mode
// No env flag needed — they only work with exact email+password match
const DEMO_ACCOUNTS = {
    'admin@skinthelp.com': {
        password: 'admin123',
        profile: {
            id: 'demo-admin-001',
            email: 'admin@skinthelp.com',
            name: 'Admin User',
            role: 'admin',
        }
    },
    'restaurant@skinthelp.com': {
        password: 'rest123',
        profile: {
            id: 'demo-rest-001',
            email: 'restaurant@skinthelp.com',
            name: 'Restaurant Owner',
            role: 'restaurant',
            restaurant_id: 'restaurant-001',
        }
    },
    'worker@skinthelp.com': {
        password: 'worker123',
        profile: {
            id: 'demo-worker-001',
            email: 'worker@skinthelp.com',
            name: 'Collection Worker',
            role: 'worker',
            center_id: 'center-001',
        }
    },
    'public@skinthelp.com': {
        password: 'public123',
        profile: {
            id: 'demo-public-001',
            email: 'public@skinthelp.com',
            name: 'Public User',
            role: 'public',
        }
    },
};

// Valid roles for OAuth/OTP role assignment
const VALID_ROLES = ['admin', 'restaurant', 'worker', 'public'];

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [emailConfirmed, setEmailConfirmed] = useState(true);
    // Track if we're in demo mode to prevent Supabase from overriding
    const [isDemoMode, setIsDemoMode] = useState(false);
    // Track sign-out in progress to prevent layouts from rendering stale state
    const [isSigningOut, setIsSigningOut] = useState(false);
    // Track if initial session check is complete
    const [isSessionChecked, setIsSessionChecked] = useState(false);

    useEffect(() => {
        const abortController = new AbortController();
        let isDemo = false;

        const initializeAuth = async () => {
            try {
                // Check for demo mode session on mount
                const demoMode = localStorage.getItem('demo_mode');
                const demoProfile = localStorage.getItem('demo_profile');

                if (demoMode === 'true' && demoProfile) {
                    try {
                        const parsed = JSON.parse(demoProfile);
                        setProfile(parsed);
                        setUser({
                            id: parsed.id,
                            email: parsed.email,
                            user_metadata: { role: parsed.role }
                        });
                        setIsDemoMode(true);
                        isDemo = true;
                        setLoading(false);
                        setIsSessionChecked(true);
                        return;
                    } catch (e) {
                        logger.error('Failed to restore demo session:', e);
                        localStorage.removeItem('demo_mode');
                        localStorage.removeItem('demo_profile');
                    }
                }

                // Check for existing Supabase session
                try {
                    const { data: { session: existingSession }, error } = await supabase.auth.getSession();
                    if (error) {
                        logger.error('Failed to fetch session:', error);
                    }
                    if (existingSession?.user) {
                        setSession(existingSession);
                        setUser(existingSession.user);
                        await fetchProfile(existingSession.user);
                        // fetchProfile now calls setLoading(false) internally,
                        // but call it here too as a safety net
                        setLoading(false);
                    } else {
                        setLoading(false);
                    }
                } catch (err) {
                    logger.error('Session check error:', err);
                    setLoading(false);
                }
                setIsSessionChecked(true);
            } catch (error) {
                logger.error('Auth initialization error:', error);
                setLoading(false);
                setIsSessionChecked(true);
            }
        };

        initializeAuth();

        // Register Supabase auth listener for ongoing changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
            if (abortController.signal.aborted) return;

            // CRITICAL: If we're in demo mode, ignore Supabase auth changes
            // This prevents the existing Supabase session from overriding the demo profile
            if (isDemo) {
                logger.debug('Demo mode active, ignoring Supabase auth event:', event);
                return;
            }

            // If signing out, handle the SIGNED_OUT event but ignore others
            if (event === 'SIGNED_OUT') {
                setProfile(null);
                setUser(null);
                setSession(null);
                setEmailConfirmed(true);
                setLoading(false);
                return;
            }

            logger.debug('Auth state changed:', event, currentSession?.user?.email);

            setSession(currentSession);
            setUser(currentSession?.user ?? null);

            if (currentSession?.user) {
                const isConfirmed = currentSession.user.email_confirmed_at !== null;
                setEmailConfirmed(isConfirmed);
                await fetchProfile(currentSession.user);
                // Safety net: ensure loading is cleared even if fetchProfile
                // had an early return that didn't explicitly call setLoading(false)
                setLoading(false);
            } else {
                setProfile(null);
                setEmailConfirmed(true);
                setLoading(false);
            }
        });

        return () => {
            abortController.abort();
            subscription.unsubscribe();
        };
    }, []);

    const fetchProfile = async (currentUser, retryCount = 0) => {
        try {
            // First try to get from user_metadata (most reliable for simple role storage)
            const metaRole = currentUser.user_metadata?.role;
            const metaName = currentUser.user_metadata?.name;

            logger.debug('Fetching profile for user:', currentUser.email, 'Role:', metaRole);

            if (metaRole) {
                const userProfile = {
                    id: currentUser.id,
                    email: currentUser.email,
                    name: metaName || currentUser.email?.split('@')[0],
                    role: sanitizeRole(metaRole),
                };
                setProfile(userProfile);
                // Store role in localStorage for persistence
                localStorage.setItem('userRole', metaRole);
                logger.debug('Profile set:', userProfile);
                // ✅ FIXED: clear loading so routes/layouts stop spinning
                setLoading(false);
                return;
            }

            // If no role in metadata and this is a new user, retry a few times
            if (retryCount < 3) {
                logger.debug(`No role found, retrying... (${retryCount + 1}/3)`);
                await new Promise(resolve => setTimeout(resolve, 500));
                const { data: { user: refreshedUser } } = await supabase.auth.getUser();
                if (refreshedUser) {
                    await fetchProfile(refreshedUser, retryCount + 1);
                    return;
                }
            }

            // If still no role after retries, check localStorage for pending role
            const pendingRole = localStorage.getItem('selectedRole') || localStorage.getItem('pendingRole') || localStorage.getItem('userRole');
            const finalRole = sanitizeRole(pendingRole || 'public');

            logger.debug('No role found after retries, using:', finalRole);
            const defaultProfile = {
                id: currentUser.id,
                email: currentUser.email,
                name: currentUser.email?.split('@')[0],
                role: finalRole,
            };
            setProfile(defaultProfile);
            // Store role in localStorage for persistence
            localStorage.setItem('userRole', finalRole);

            // Also update the user metadata so it persists
            try {
                await supabase.auth.updateUser({ data: { role: finalRole } });
            } catch (e) {
                logger.error('Failed to persist role to user metadata:', e);
            }

            // ✅ FIXED: ensure loading is cleared after fallback profile is set
            setLoading(false);

        } catch (error) {
            console.error("Error fetching profile:", error);
            const defaultRole = localStorage.getItem('userRole') || 'public';
            setProfile({
                id: currentUser.id,
                email: currentUser.email,
                name: currentUser.email?.split('@')[0] || '',
                role: defaultRole,
            });
            // ✅ FIXED: ensure loading clears even on error so UI doesn't hang
            setLoading(false);
        }
    };

    const signIn = async (email, password) => {
        setLoading(true);
        try {
            // Check for demo accounts FIRST (always in DEV mode)
            if (import.meta.env.DEV) {
                const demoAccount = DEMO_ACCOUNTS[email.toLowerCase()];
                if (demoAccount && demoAccount.password === password) {
                    const mockProfile = { ...demoAccount.profile };
                    setProfile(mockProfile);
                    setUser({
                        id: mockProfile.id,
                        email: mockProfile.email,
                        user_metadata: { role: mockProfile.role }
                    });
                    setIsDemoMode(true);
                    localStorage.setItem('demo_mode', 'true');
                    localStorage.setItem('demo_profile', JSON.stringify(mockProfile));
                    setLoading(false);
                    return;
                }
            }

            // Normal Supabase Login
            // First, get the selected role from localStorage (set during portal selection)
            const selectedRole = localStorage.getItem('selectedRole');

            const { error, data } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            // If login succeeded and we have a selected role, update user metadata
            // This ensures the Supabase session reflects the portal the user chose
            if (selectedRole && data?.user) {
                const currentRole = data.user.user_metadata?.role;
                if (currentRole !== selectedRole) {
                    logger.debug('Updating user role from', currentRole, 'to', selectedRole);
                    await supabase.auth.updateUser({
                        data: { role: selectedRole }
                    });
                }
                // Also store the role in localStorage for persistence
                localStorage.setItem('userRole', selectedRole);
            }

            // NOTE: Do NOT set loading=false here for Supabase login!
            // The onAuthStateChange handler will set loading=false AFTER fetchProfile completes.
            // Setting it here causes a race condition where the layout sees loading=false
            // but profile is still null, causing an unwanted redirect.

        } catch (error) {
            // Only set loading=false on error — success is handled by onAuthStateChange
            setLoading(false);
            console.error('Sign in error:', error);
            throw new Error(error.message || 'Failed to sign in');
        }
    };

    const signUp = async (email, password, userData) => {
        setLoading(true);
        try {
            const { error, data } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        role: userData?.role || 'public',
                        name: userData?.name || email.split('@')[0],
                        ...userData
                    },
                    emailRedirectTo: `${window.location.origin}/auth/callback`
                }
            });

            if (error) throw error;

            if (data.user && !data.session) {
                setEmailConfirmed(false);
                const error = new Error('Please check your email to confirm your account before signing in.');
                error.code = 'EMAIL_CONFIRMATION_REQUIRED';
                throw error;
            }

            if (data.user && data.session) {
                setEmailConfirmed(true);
            }

        } catch (error) {
            setLoading(false);
            console.error('Sign up error:', error);
            throw new Error(error.message || 'Failed to create account');
        }
    };

    const signOut = async () => {
        // Set signing-out flag FIRST so layouts know not to render stale UI
        setIsSigningOut(true);

        try {
            // Clear demo mode first
            setIsDemoMode(false);

            // Clear state synchronously BEFORE async Supabase call
            // This ensures React re-renders with null state immediately
            setProfile(null);
            setUser(null);
            setSession(null);
            setLoading(false);

            // Sign out from Supabase (ignore errors if no real session)
            try {
                await supabase.auth.signOut();
            } catch (e) {
                logger.debug('Supabase signOut (may be expected in demo mode):', e);
            }

            // Clear all auth-related storage
            localStorage.removeItem('demo_mode');
            localStorage.removeItem('demo_profile');
            localStorage.removeItem('selectedRole');
            localStorage.removeItem('pendingRole');
            localStorage.removeItem('userRole');

            // Also clear any supabase-related keys from localStorage
            const supabaseKeys = Object.keys(localStorage).filter(
                key => key.startsWith('sb-') || key.startsWith('supabase.')
            );
            supabaseKeys.forEach(key => localStorage.removeItem(key));

        } catch (error) {
            console.error('Sign out error:', error);
            // Still clear state even on error so the user isn't stuck
            setProfile(null);
            setUser(null);
            setSession(null);
            setLoading(false);
            throw new Error('Failed to sign out');
        } finally {
            setIsSigningOut(false);
        }
    };

    const signInWithGoogle = async () => {
        try {
            const selectedRole = localStorage.getItem('selectedRole') || 'public';
            const validatedRole = VALID_ROLES.includes(selectedRole) ? selectedRole : 'public';

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                },
            });

            if (error) throw error;

            localStorage.setItem('pendingRole', validatedRole);
        } catch (error) {
            console.error('Google sign in error:', error);
            throw new Error(error.message || 'Failed to sign in with Google');
        }
    };

    const signInWithPhone = async (phone) => {
        try {
            const { error } = await supabase.auth.signInWithOtp({ phone });
            if (error) throw error;
            toast.success('OTP sent to your phone!');
        } catch (error) {
            console.error('Phone sign in error:', error);
            throw new Error(error.message || 'Failed to send OTP');
        }
    };

    const verifyOTP = async (phone, otp) => {
        try {
            const selectedRole = localStorage.getItem('selectedRole') || 'public';
            const validatedRole = VALID_ROLES.includes(selectedRole) ? selectedRole : 'public';

            const { error: verifyError } = await supabase.auth.verifyOtp({
                phone, token: otp, type: 'sms',
            });

            if (verifyError) throw verifyError;

            const { error: updateError } = await supabase.auth.updateUser({
                data: { role: validatedRole }
            });

            if (updateError) {
                console.error('Failed to update user role:', updateError);
                toast.error('Verification succeeded but role assignment failed');
            } else {
                toast.success('Phone verified successfully!');
            }
        } catch (error) {
            console.error('OTP verification error:', error);
            throw new Error(error.message || 'Failed to verify OTP');
        }
    };

    const updateProfile = async (data) => {
        if (!user) throw new Error('No user logged in');

        try {
            const { error } = await supabase.auth.updateUser({ data });
            if (error) throw error;

            if (profile) {
                setProfile({ ...profile, ...data });
            }
        } catch (error) {
            console.error('Update profile error:', error);
            throw new Error('Failed to update profile');
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            profile,
            session,
            loading,
            emailConfirmed,
            isDemoMode,
            isSigningOut,
            isSessionChecked,
            signIn,
            signUp,
            signInWithGoogle,
            signInWithPhone,
            verifyOTP,
            signOut,
            updateProfile
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// Re-export for backward compatibility
export { DEMO_ACCOUNTS };
