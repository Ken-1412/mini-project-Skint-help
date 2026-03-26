import { Link, useLocation, Navigate } from "react-router-dom";
import { Buildings, SignOut, SquaresFour, Users, Storefront, ChartBar } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSignOut } from "@/hooks/useSignOut";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useState } from "react";
import { usePresence } from "@/hooks/usePresence";
import { AnimatedOutlet } from "@/components/AnimatedOutlet";

export function AdminLayout() {
    const { user, profile, loading, isSigningOut } = useAuth();
    const location = useLocation();
    const handleSignOut = useSignOut();
    const [showSignOutDialog, setShowSignOutDialog] = useState(false);

    // Track presence (online/offline status)
    usePresence();

    // During sign-out, show nothing — navigation is already in progress
    if (isSigningOut) {
        return null;
    }

    // Still loading auth — show spinner
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    // Not authenticated at all — redirect to select-role
    if (!user) {
        return <Navigate to="/select-role" replace />;
    }

    // User exists but profile still loading — show spinner (don't redirect!)
    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading profile...</p>
                </div>
            </div>
        );
    }

    const sidebarLinks = [
        { icon: SquaresFour, label: "Overview", path: "/admin/dashboard" },
        { icon: Storefront, label: "Restaurants", path: "/admin/restaurants" },
        { icon: Users, label: "Workers", path: "/admin/workers" },
        { icon: ChartBar, label: "Analytics", path: "/admin/analytics" },
    ];

    return (
        <div className="min-h-screen flex">
            {/* Sidebar with glassmorphism */}
            <aside className="w-64 glass-card border-r border-white/10 fixed h-full z-10 backdrop-blur-xl">
                {/* Header */}
                <div className="p-6 border-b border-white/10">
                    <Link to="/" className="flex items-center gap-2 group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center neon-glow transition-all group-hover:scale-110">
                            <Buildings className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-lg gradient-text">Admin Portal</span>
                    </Link>
                </div>

                {/* User Info */}
                <div className="p-4 border-b border-white/10">
                    <div className="glass-card p-3 rounded-xl">
                        <p className="text-xs text-muted-foreground mb-1">Logged in as</p>
                        <p className="font-semibold text-sm truncate">{profile?.name || 'Admin'}</p>
                        <p className="text-xs text-green-400 mt-1">● Admin</p>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-2">
                    {sidebarLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = location.pathname === link.path;

                        return (
                            <Link
                                key={link.path}
                                to={link.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${isActive
                                    ? "glass-card bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 font-medium neon-glow"
                                    : "text-muted-foreground hover:glass-card hover:text-foreground"
                                    }`}
                            >
                                <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? 'text-green-400' : ''}`} />
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* Sign Out Button */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
                    <Button
                        onClick={() => setShowSignOutDialog(true)}
                        variant="outline"
                        size="sm"
                        className="glass-card border-white/20 hover:bg-white/10 w-full justify-start"
                    >
                        <SignOut className="w-4 h-4 mr-2" />
                        Sign Out
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 min-h-screen">
                <AnimatedOutlet />
            </main>

            {/* Sign Out Confirmation Dialog */}
            <ConfirmDialog
                open={showSignOutDialog}
                onOpenChange={setShowSignOutDialog}
                onConfirm={handleSignOut}
                title="Sign Out?"
                description="Are you sure you want to sign out of your account?"
                confirmText="Sign Out"
                cancelText="Cancel"
                variant="destructive"
                icon={<SignOut className="w-8 h-8" />}
            />
        </div>
    );
}
