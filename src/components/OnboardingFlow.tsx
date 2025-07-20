import { useState } from "react";
import { GoogleAuthButton } from "./GoogleAuthButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Building2, Search, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingFlowProps {
  onComplete: (user: { name: string; email: string }) => void;
}

interface CompanyOption {
  name: string;
  address: string;
  entityType: string;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const [step, setStep] = useState<"auth" | "company-search" | "company-select" | "manual-entry" | "confirmation">("auth");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [searchingCompany, setSearchingCompany] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [manualCompanyName, setManualCompanyName] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption | null>(null);
  const isDevMode = import.meta.env.DEV;

  const handleGoogleSuccess = (userData: { name: string; email: string }) => {
    console.log("Google auth success:", userData);
    // Auth is now handled by Supabase auth state changes
    // This component will be unmounted when user is authenticated
  };

  const handleDemoLogin = async () => {
    console.log("Demo login triggered");
    
    try {
      // Fetch the real user profile from database
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', '04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412')
        .single();

      if (error) {
        console.error('Error fetching demo user profile:', error);
        // Fallback to basic demo user
        const demoUser = {
          name: "Demo User",
          email: "dev@smallbizally.com"
        };
        onComplete(demoUser);
        return;
      }

      // Use the real profile data
      const demoUser = {
        name: profile.full_name || "Dev User",
        email: profile.email || "dev@smallbizally.com",
        createdAt: profile.created_at ? new Date(profile.created_at) : undefined
      };
      
      console.log("Demo login with real profile:", demoUser);
      onComplete(demoUser);
    } catch (error) {
      console.error('Demo login error:', error);
      // Fallback to basic demo user
      const demoUser = {
        name: "Demo User", 
        email: "dev@smallbizally.com"
      };
      onComplete(demoUser);
    }
  };

  const handleCompanySelect = (company: CompanyOption) => {
    setSelectedCompany(company);
    setStep("confirmation");
  };

  const handleManualEntry = () => {
    setStep("manual-entry");
  };

  const handleManualSubmit = () => {
    if (manualCompanyName.trim()) {
      const manualCompany: CompanyOption = {
        name: manualCompanyName.trim(),
        address: "Address to be verified",
        entityType: "To be determined"
      };
      setSelectedCompany(manualCompany);
      setStep("confirmation");
    }
  };

  const handleComplete = () => {
    if (user) {
      onComplete(user);
    }
  };

  if (step === "auth") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-primary">Welcome to SmallBizAlly</CardTitle>
            <CardDescription className="text-base">
              Your AI Compliance Assistant is here to help keep your business requirements stress-free and up-to-date.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isDevMode && (
              <>
                <Button
                  onClick={handleDemoLogin}
                  variant="outline"
                  className="w-full flex items-center gap-2"
                >
                  <User className="h-4 w-4" />
                  Demo Login (Dev Only)
                </Button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>
              </>
            )}
            
            <GoogleAuthButton onSuccess={handleGoogleSuccess} />
            <p className="text-xs text-muted-foreground text-center">
              💡 For the best experience, use your business email address if you have one
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "company-search") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Finding your business...</CardTitle>
            <CardDescription>
              We're searching for your company using your name: {user?.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              This usually takes just a moment...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "company-select") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              We found your business!
            </CardTitle>
            <CardDescription>
              Please confirm which company is yours:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {companyOptions.map((company, index) => (
              <Button
                key={index}
                variant="outline"
                className="w-full h-auto p-4 justify-start"
                onClick={() => handleCompanySelect(company)}
              >
                <div className="text-left">
                  <div className="font-semibold">{company.name}</div>
                  <div className="text-sm text-muted-foreground">{company.entityType}</div>
                  <div className="text-xs text-muted-foreground">{company.address}</div>
                </div>
              </Button>
            ))}
            
            <div className="pt-4 border-t">
              <Button
                variant="ghost"
                className="w-full"
                onClick={handleManualEntry}
              >
                My company isn't listed
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "manual-entry") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Enter your company name</CardTitle>
            <CardDescription>
              We'll help you set up your business profile
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                placeholder="Your Company Name"
                value={manualCompanyName}
                onChange={(e) => setManualCompanyName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleManualSubmit()}
              />
            </div>
            <Button 
              onClick={handleManualSubmit} 
              className="w-full"
              disabled={!manualCompanyName.trim()}
            >
              Continue
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setStep("company-select")}
            >
              Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "confirmation") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <CheckCircle className="h-16 w-16 text-success mx-auto" />
            </div>
            <CardTitle className="text-xl">Welcome to SmallBizAlly!</CardTitle>
            <CardDescription>
              Your company has been successfully added
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedCompany && (
              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-semibold text-lg">{selectedCompany.name}</h3>
                <p className="text-sm text-muted-foreground">{selectedCompany.entityType}</p>
                <p className="text-sm text-muted-foreground">{selectedCompany.address}</p>
              </div>
            )}
            <Button onClick={handleComplete} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
};