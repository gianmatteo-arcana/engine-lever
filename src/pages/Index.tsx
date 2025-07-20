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

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Fetch user profile data including creation date
          const { data: profile } = await supabase
            .from('profiles')
            .select('created_at, full_name, email')
            .eq('user_id', session.user.id)
            .maybeSingle();

          const profileData: UserProfile = {
            name: profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email || "User",
            email: profile?.email || session.user.email || "",
            createdAt: profile?.created_at ? new Date(profile.created_at) : undefined
          };
          
          setUserProfile(profileData);
        } else {
          setUserProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Fetch user profile data including creation date
        const { data: profile } = await supabase
          .from('profiles')
          .select('created_at, full_name, email')
          .eq('user_id', session.user.id)
          .maybeSingle();

        const profileData: UserProfile = {
          name: profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email || "User",
          email: profile?.email || session.user.email || "",
          createdAt: profile?.created_at ? new Date(profile.created_at) : undefined
        };
        
        setUserProfile(profileData);
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleOnboardingComplete = (userData: UserProfile) => {
    // This is handled by the auth state change now
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  // Create a fallback profile if none exists (for dev mode/anonymous users)
  const finalProfile = userProfile || {
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Dev User",
    email: user.email || "dev@example.com",
    createdAt: undefined
  };

  return <Dashboard user={finalProfile} onSignOut={handleSignOut} />;
};

export default Index;
