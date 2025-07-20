import { useState } from "react";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { Dashboard } from "@/components/Dashboard";

interface User {
  name: string;
  email: string;
}

const Index = () => {
  const [user, setUser] = useState<User | null>(null);

  const handleOnboardingComplete = (userData: User) => {
    setUser(userData);
  };

  const handleSignOut = () => {
    setUser(null);
  };

  if (!user) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return <Dashboard user={user} onSignOut={handleSignOut} />;
};

export default Index;
