import { useState, useEffect } from "react";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { Dashboard } from "@/components/Dashboard";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

interface UserProfile {
  name: string;
  email: string;
  createdAt?: Date;
}

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    console.log('Setting up auth...');
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Create profile from user metadata
          const profile: UserProfile = {
            name: session.user.user_metadata?.full_name || 
                  session.user.user_metadata?.name || 
                  session.user.email?.split('@')[0] || 
                  "User",
            email: session.user.email || "",
            createdAt: new Date(session.user.created_at)
          };
          
          console.log('Setting profile:', profile);
          setUserProfile(profile);
        } else {
          setUserProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session check:', !!session);
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const profile: UserProfile = {
          name: session.user.user_metadata?.full_name || 
                session.user.user_metadata?.name || 
                session.user.email?.split('@')[0] || 
                "User",
          email: session.user.email || "",
          createdAt: new Date(session.user.created_at)
        };
        
        setUserProfile(profile);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleOnboardingComplete = (userData: UserProfile) => {
    console.log('Onboarding complete for:', userData);
    // For demo mode, set the profile directly without Supabase auth
    if (import.meta.env.DEV && userData.email === "dev@smallbizally.com") {
      setDemoMode(true);
      setUserProfile(userData);
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    console.log('Signing out...');
    if (demoMode) {
      // Demo mode sign out - just reset state
      setDemoMode(false);
      setUserProfile(null);
      setUser(null);
      setSession(null);
    } else {
      // Real Supabase sign out
      await supabase.auth.signOut();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Show onboarding if no user and not in demo mode
  if (!user && !demoMode) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  // For demo mode, use the demo profile
  if (demoMode && userProfile) {
    return <Dashboard user={userProfile} onSignOut={handleSignOut} />;
  }

  return <Dashboard user={userProfile} onSignOut={handleSignOut} />;
};

export default Index;