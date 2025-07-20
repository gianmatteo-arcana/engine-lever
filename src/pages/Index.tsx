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
    console.log('Setting up auth state listener...');
    let initialCheckComplete = false;
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          try {
            console.log('Fetching profile for user:', session.user.id);
            // Fetch user profile data including creation date
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('created_at, full_name, email')
              .eq('user_id', session.user.id)
              .maybeSingle();

            if (error) {
              console.error('Profile fetch error:', error);
            } else {
              console.log('Profile data:', profile);
            }

            const profileData: UserProfile = {
              name: profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email || "User",
              email: profile?.email || session.user.email || "",
              createdAt: profile?.created_at ? new Date(profile.created_at) : undefined
            };
            
            console.log('Setting profile data:', profileData);
            setUserProfile(profileData);
          } catch (error) {
            console.error('Error in profile fetch:', error);
          }
        } else {
          console.log('No session, clearing profile');
          setUserProfile(null);
        }
        
        // Only set loading to false if this is not the initial check
        if (initialCheckComplete) {
          console.log('Setting loading to false from auth state change');
          setLoading(false);
        }
      }
    );

    // Check for existing session
    console.log('Checking for existing session...');
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      console.log('Got existing session:', session?.user?.id, error);
      
      if (error) {
        console.error('Error getting session:', error);
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        try {
          console.log('Fetching profile for existing session user:', session.user.id);
          // Fetch user profile data including creation date
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('created_at, full_name, email')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (profileError) {
            console.error('Existing session profile fetch error:', profileError);
          } else {
            console.log('Existing session profile data:', profile);
          }

          const profileData: UserProfile = {
            name: profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email || "User",
            email: profile?.email || session.user.email || "",
            createdAt: profile?.created_at ? new Date(profile.created_at) : undefined
          };
          
          console.log('Setting existing session profile data:', profileData);
          setUserProfile(profileData);
        } catch (error) {
          console.error('Error in existing session profile fetch:', error);
        }
      } else {
        console.log('No existing session');
        setUserProfile(null);
      }
      
      initialCheckComplete = true;
      console.log('Setting loading to false from getSession');
      setLoading(false);
    }).catch(error => {
      console.error('Error getting session:', error);
      initialCheckComplete = true;
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
