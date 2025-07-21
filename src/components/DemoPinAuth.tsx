
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Building2, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DemoPinAuthProps {
  onSuccess: () => void;
}

const DEMO_PIN = "1234";
const DEMO_EMAIL = "gianmatteo.costanza@gmail.com";
const DEMO_PASSWORD = "demo123456"; // This should match what's in your Supabase auth

export const DemoPinAuth = ({ onSuccess }: DemoPinAuthProps) => {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const MAX_ATTEMPTS = 3;

  const handlePinComplete = async (value: string) => {
    if (attempts >= MAX_ATTEMPTS) {
      setError("Maximum attempts exceeded. Please refresh the page.");
      return;
    }

    if (value !== DEMO_PIN) {
      setAttempts(prev => prev + 1);
      setError(`Incorrect PIN. ${MAX_ATTEMPTS - attempts - 1} attempts remaining.`);
      setPin("");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Authenticate with Supabase using the demo user's credentials
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });

      if (authError) {
        console.error('Demo authentication error:', authError);
        setError("Demo authentication failed. Please check if the demo user exists in Supabase.");
        toast({
          title: "Demo Authentication Failed",
          description: "Please ensure the demo user account is properly configured in Supabase.",
          variant: "destructive",
        });
        return;
      }

      if (data.user) {
        toast({
          title: "Demo Login Successful",
          description: "Welcome to the demo!",
        });
        onSuccess();
      }
    } catch (error) {
      console.error('Demo PIN authentication error:', error);
      setError("Authentication failed. Please try again.");
      toast({
        title: "Authentication Error",
        description: "Failed to authenticate with demo credentials.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (value: string) => {
    setPin(value);
    setError(null);
    
    if (value.length === 4) {
      handlePinComplete(value);
    }
  };

  if (attempts >= MAX_ATTEMPTS) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
          </div>
          <CardTitle className="text-xl text-destructive">Access Blocked</CardTitle>
          <CardDescription>
            Too many failed attempts. Please refresh the page to try again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full"
            variant="outline"
          >
            Refresh Page
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-xl">Demo Access</CardTitle>
        <CardDescription>
          Enter the 4-digit PIN to access the demo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <InputOTP
            maxLength={4}
            value={pin}
            onChange={handlePinChange}
            disabled={loading}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Authenticating...</span>
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            💡 Demo PIN: <span className="font-mono">1234</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Attempts: {attempts}/{MAX_ATTEMPTS}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
