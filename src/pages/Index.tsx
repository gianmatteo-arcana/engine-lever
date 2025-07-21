import { useState, useEffect } from "react";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { Dashboard } from "@/components/Dashboard";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { useDemoMode } from "@/context/DemoContext";

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
  const { isDemoMode, exitDemoMode } = useDemoMode();

  useEffect(() => {
    console.log('=== SETTING UP AUTH ===');
    console.log('Window location:', window.location.href);
    console.log('Has hash:', !!window.location.hash);
    console.log('Hash content:', window.location.hash);
    
    let mounted = true;
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('=== AUTH STATE CHANGED ===');
        console.log('Event:', event);
        console.log('Has session:', !!session);
        console.log('User email:', session?.user?.email);
        console.log('Access token present:', !!session?.access_token);
        
        if (!mounted) return;
        
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
        
        // Set loading to false for any definitive auth event
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          console.log('Setting loading false due to event:', event);
          setLoading(false);
        } else if (event === 'INITIAL_SESSION') {
          // For initial session, only set loading false if we have a session or after a delay
          if (session) {
            console.log('Setting loading false - initial session with user');
            setLoading(false);
          }
        }
      }
    );

    // Check for existing session with retry logic
    const checkSession = async (retryCount = 0) => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        console.log('Session check attempt:', retryCount + 1, !!session, error);
        
        if (session?.user) {
          console.log('Found valid session for user:', session.user.email);
          setSession(session);
          setUser(session.user);
          
          const profile: UserProfile = {
            name: session.user.user_metadata?.full_name || 
                  session.user.user_metadata?.name || 
                  session.user.email?.split('@')[0] || 
                  "User",
            email: session.user.email || "",
            createdAt: new Date(session.user.created_at)
          };
          
          setUserProfile(profile);
          setLoading(false);
        } else if (retryCount < 3) {
          // Retry up to 3 times with increasing delays for OAuth redirects
          setTimeout(() => checkSession(retryCount + 1), (retryCount + 1) * 1000);
        } else {
          console.log('No session found after retries');
          setSession(null);
          setUser(null);
          setUserProfile(null);
          setLoading(false);
        }
      } catch (error) {
        console.error('Session check error:', error);
        if (mounted && retryCount >= 3) {
          setLoading(false);
        }
      }
    };

    checkSession();

    // Handle OAuth redirect hash fragments
    if (window.location.hash) {
      console.log('OAuth hash detected:', window.location.hash);
      // Let Supabase handle the OAuth callback
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session && mounted) {
          console.log('Session found after OAuth redirect');
          setSession(session);
          setUser(session.user);
          setLoading(false);
          // Clear the hash to clean up URL
          window.history.replaceState(null, '', window.location.pathname);
        }
      });
    }

    // Failsafe: ensure loading is set to false after 5 seconds
    const failsafe = setTimeout(() => {
      if (mounted) {
        console.log('Failsafe: setting loading to false');
        setLoading(false);
      }
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(failsafe);
    };
  }, []);

  const handleOnboardingComplete = async (userData: UserProfile) => {
    console.log('Onboarding complete for:', userData);
    setUserProfile(userData);
    setLoading(false);
  };

  const handleSignOut = async () => {
    console.log('Signing out...');
    if (isDemoMode) {
      // Demo mode sign out - just reset state
      exitDemoMode();
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
  if (!user && !isDemoMode) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return <Dashboard user={userProfile} onSignOut={handleSignOut} />;
};

export default Index;