import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Building2, MapPin, Phone, Mail, FileText, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BusinessProfileSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  taskId: string;
}

interface BusinessProfileData {
  businessName: string;
  businessType: string;
  entityType: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber: string;
  email: string;
  website: string;
  description: string;
  ein: string;
  foundedDate: string;
}

const entityTypes = [
  "Sole Proprietorship",
  "Partnership", 
  "Limited Liability Company (LLC)",
  "Corporation (C-Corp)",
  "S Corporation (S-Corp)",
  "Non-Profit Organization",
  "Other"
];

const businessTypes = [
  "Retail",
  "Restaurant/Food Service",
  "Professional Services",
  "Technology/Software",
  "Healthcare",
  "Real Estate",
  "Construction",
  "Manufacturing",
  "Transportation",
  "Other"
];

export const BusinessProfileSetup = ({ isOpen, onClose, onComplete, taskId }: BusinessProfileSetupProps) => {
  const [formData, setFormData] = useState<BusinessProfileData>({
    businessName: "",
    businessType: "",
    entityType: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phoneNumber: "",
    email: "",
    website: "",
    description: "",
    ein: "",
    foundedDate: ""
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (field: keyof BusinessProfileData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error("User not authenticated");
      }

      // Update or create business profile in profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          business_name: formData.businessName,
          business_type: formData.entityType,
          business_address: `${formData.address}, ${formData.city}, ${formData.state} ${formData.zipCode}`,
          phone_number: formData.phoneNumber,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.data.user.id);

      if (profileError) {
        throw profileError;
      }

      // Mark the task as completed
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          data: formData as any // JSONB data
        })
        .eq('id', taskId);

      if (taskError) {
        throw taskError;
      }

      toast({
        title: "Business Profile Completed!",
        description: "Your business information has been saved successfully.",
      });

      onComplete();
    } catch (error) {
      console.error('Error saving business profile:', error);
      toast({
        title: "Error",
        description: "Failed to save business profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background z-50 overflow-y-auto">
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <Building2 className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Set Up Your Business Profile</h1>
                <p className="text-muted-foreground">Complete your business information to get started</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="businessName">Business Name *</Label>
                    <Input
                      id="businessName"
                      value={formData.businessName}
                      onChange={(e) => handleInputChange('businessName', e.target.value)}
                      placeholder="Enter your business name"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="entityType">Entity Type *</Label>
                    <Select
                      value={formData.entityType}
                      onValueChange={(value) => handleInputChange('entityType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select entity type" />
                      </SelectTrigger>
                      <SelectContent>
                        {entityTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="businessType">Business Type</Label>
                    <Select
                      value={formData.businessType}
                      onValueChange={(value) => handleInputChange('businessType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select business type" />
                      </SelectTrigger>
                      <SelectContent>
                        {businessTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="foundedDate">Founded Date</Label>
                    <Input
                      id="foundedDate"
                      type="date"
                      value={formData.foundedDate}
                      onChange={(e) => handleInputChange('foundedDate', e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="ein">EIN (Tax ID)</Label>
                    <Input
                      id="ein"
                      value={formData.ein}
                      onChange={(e) => handleInputChange('ein', e.target.value)}
                      placeholder="XX-XXXXXXX"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Address & Contact */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Address & Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="address">Street Address *</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      placeholder="123 Main Street"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="San Francisco"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State *</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        placeholder="CA"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="zipCode">ZIP Code *</Label>
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                      placeholder="94105"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="phoneNumber">Phone Number</Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">Business Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="contact@yourbusiness.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      type="url"
                      value={formData.website}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                      placeholder="https://yourbusiness.com"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Business Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <Label htmlFor="description">What does your business do?</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Briefly describe your business activities, services, or products..."
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Save as Draft
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  "Saving..."
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete Setup
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};