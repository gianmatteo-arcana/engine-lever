import { useState, useEffect } from "react";
import { Building2, MapPin, Calendar, Users, AlertCircle, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BusinessProfileSetup } from "./BusinessProfileSetup";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BusinessProfileCardProps {
  isExpanded: boolean;
  onToggle: () => void;
}

interface Task {
  id: string;
  title: string;
  description: string;
  task_type: string;
  status: string;
  priority: number;
  created_at: string;
}

interface BusinessProfile {
  business_name: string;
  business_type: string;
  business_address: string;
  phone_number: string;
}

export const BusinessProfileCard = ({ isExpanded, onToggle }: BusinessProfileCardProps) => {
  const [businessProfileTask, setBusinessProfileTask] = useState<Task | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchBusinessData();
  }, []);

  const fetchBusinessData = async () => {
    try {
      const user = await supabase.auth.getUser();
      const userId = user.data.user?.id;
      
      // In development mode with service role key, we can query without user restrictions
      if (!userId && !import.meta.env.DEV) return;

      // Check for existing business profile
      let profileQuery = supabase
        .from('profiles')
        .select('business_name, business_type, business_address, phone_number');
      
      if (userId) {
        profileQuery = profileQuery.eq('user_id', userId);
      }
      
      const { data: profile } = await profileQuery.maybeSingle();

      if (profile?.business_name) {
        setBusinessProfile(profile);
      } else {
        // Check for existing pending task
        let taskQuery = supabase
          .from('tasks')
          .select('*')
          .eq('task_type', 'business_profile')
          .eq('status', 'pending');
        
        if (userId) {
          taskQuery = taskQuery.eq('user_id', userId);
        }
        
        const { data: task } = await taskQuery.maybeSingle();

        if (!task) {
          // Create the task if it doesn't exist
          await createBusinessProfileTask(userId);
        } else {
          setBusinessProfileTask(task);
        }
      }
    } catch (error) {
      console.error('Error fetching business data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createBusinessProfileTask = async (userId?: string) => {
    try {
      const user = await supabase.auth.getUser();
      const targetUserId = userId || user.data.user?.id;
      
      // In development mode with service role key, we can create tasks without user restrictions
      if (!targetUserId && !import.meta.env.DEV) return;

      const taskData: any = {
        title: 'Set Up Business Profile',
        description: 'Complete your business information to get personalized compliance guidance',
        task_type: 'business_profile',
        status: 'pending',
        priority: 1
      };

      if (targetUserId) {
        taskData.user_id = targetUserId;
      }

      const { data: newTask, error } = await supabase
        .from('tasks')
        .insert(taskData)
        .select()
        .single();

      if (error) throw error;
      if (newTask) setBusinessProfileTask(newTask);
    } catch (error) {
      console.error('Error creating business profile task:', error);
      toast({
        title: "Error",
        description: "Failed to create business profile task.",
        variant: "destructive",
      });
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    fetchBusinessData(); // Refresh to show completed profile
    toast({
      title: "Success!",
      description: "Your business profile has been completed.",
    });
  };

  if (loading) {
    return (
      <Card className={`transition-all duration-300 ${isExpanded ? 'col-span-full' : ''}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Business Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // Show completed profile
  if (businessProfile) {
    return (
      <>
        <Card className={`transition-all duration-300 ${isExpanded ? 'col-span-full' : ''}`}>
          <CardHeader className="cursor-pointer" onClick={onToggle}>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Business Profile
              <Badge variant="secondary" className="ml-auto">Complete</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-muted rounded-full">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Business Name</p>
                  <p className="text-sm text-muted-foreground">{businessProfile.business_name}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="p-2 bg-muted rounded-full">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Entity Type</p>
                  <p className="text-sm text-muted-foreground">{businessProfile.business_type || "Not specified"}</p>
                </div>
              </div>

              {businessProfile.business_address && (
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-muted rounded-full">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Address</p>
                    <p className="text-sm text-muted-foreground">{businessProfile.business_address}</p>
                  </div>
                </div>
              )}

              {businessProfile.phone_number && (
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-muted rounded-full">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Phone</p>
                    <p className="text-sm text-muted-foreground">{businessProfile.phone_number}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // Show pending task
  return (
    <>
      <Card className={`transition-all duration-300 border-orange-200 bg-orange-50/50 ${isExpanded ? 'col-span-full' : ''}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            Action Required: Set Up Business Profile
            <Badge variant="outline" className="ml-auto border-orange-200 text-orange-700">
              Pending
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Complete your business information to get personalized compliance guidance and stay on top of your filing requirements.
          </p>
          
          {businessProfileTask && (
            <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-full">
                  <Building2 className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="font-medium">{businessProfileTask.title}</p>
                  <p className="text-sm text-muted-foreground">{businessProfileTask.description}</p>
                </div>
              </div>
              <Button 
                onClick={() => setShowSetup(true)}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Get Started
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <BusinessProfileSetup
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        onComplete={handleSetupComplete}
        taskId={businessProfileTask?.id || ''}
      />
    </>
  );
};