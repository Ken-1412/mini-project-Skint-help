import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useCallback, useRef } from 'react';

/**
 * Shared hook for handling sign-out across all portals.
 * ALWAYS navigates to /select-role, even if signOut throws.
 * Uses a ref guard to prevent double sign-out calls.
 */
export function useSignOut() {
    const navigate = useNavigate();
    const { signOut } = useAuth();
    const isSigningOut = useRef(false);

    const handleSignOut = useCallback(async () => {
        // Guard: prevent multiple simultaneous sign-out attempts
        if (isSigningOut.current) return;
        isSigningOut.current = true;

        try {
            // Navigate FIRST to prevent the layout from re-rendering with null state
            // This avoids the blank screen caused by layout guards seeing null profile
            navigate('/select-role', { replace: true });

            // Then clear auth state
            await signOut();
            toast.success('You have been signed out successfully.');
        } catch (error) {
            console.error('Sign out error:', error);
            toast.error('Failed to sign out cleanly, but you have been logged out.');
            // Ensure we're still on the right page
            navigate('/select-role', { replace: true });
        } finally {
            isSigningOut.current = false;
        }
    }, [navigate, signOut]);

    return handleSignOut;
}
