import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CircleNotch } from '@phosphor-icons/react';
import { getDashboardForRole } from '@/lib/role-routes';
import { useEffect, useState } from 'react';


export function ProtectedRoute({ children, allowedRoles }) {
    const { user, profile, loading, isSigningOut } = useAuth();
    const location = useLocation();
    // Track how long we've been waiting for profile with a timeout
    const [profileTimeout, setProfileTimeout] = useState(false);

    // If user exists but profile doesn't load after 5 seconds, redirect
    useEffect(() => {
        if (user && !profile && !loading) {
            const timer = setTimeout(() => {
                setProfileTimeout(true);
            }, 5000);
            return () => clearTimeout(timer);
        }
        // Reset timeout when profile loads
        if (profile) {
            setProfileTimeout(false);
        }
    }, [user, profile, loading]);

    // During sign-out transition, render nothing (navigation already happening)
    if (isSigningOut) {
        return null;
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <CircleNotch className="w-12 h-12 animate-spin mx-auto mb-4 text-green-400" />
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        // Not logged in - redirect to role selection
        return <Navigate to="/select-role" replace />;
    }

    // Check role-based access
    if (allowedRoles && profile) {
        // Check if user's role is in allowed roles
        const userRole = profile.role || 'public';
        if (!allowedRoles.includes(userRole)) {
            // Redirect to the user's correct dashboard instead of select-role
            const correctDashboard = getDashboardForRole(userRole);
            return <Navigate to={correctDashboard} replace />;
        }
    }

    // If profile is missing but user exists, wait briefly then redirect
    if (!profile) {
        if (profileTimeout) {
            // Profile didn't load after timeout — redirect to login
            return <Navigate to="/select-role" replace />;
        }

        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <CircleNotch className="w-12 h-12 animate-spin mx-auto mb-4 text-green-400" />
                    <p className="text-muted-foreground">Loading profile...</p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
