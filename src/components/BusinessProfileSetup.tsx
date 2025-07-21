import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Building2, MapPin, Phone, Mail, FileText, CheckCircle, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BusinessProfileSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  taskId: string;
}

interface BusinessEntity {
  entity_name: string;
  entity_number: string;
  entity_type: string;
  entity_status: string;
  principal_address?: string;
  agent_name?: string;
  file_date?: string;
}

interface BusinessProfileData {
  businessName: string;
  businessType: string;
  entityType: string;
  entityNumber: string;
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

type SetupStep = 'business-search' | 'entity-selection' | 'profile-details';

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
  const [currentStep, setCurrentStep] = useState<SetupStep>('business-search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BusinessEntity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<BusinessEntity | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [formData, setFormData] = useState<BusinessProfileData>({
    businessName: "",
    businessType: "",
    entityType: "",
    entityNumber: "",
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

  const searchBusinessEntities = async (query: string) => {
    if (query.trim().length < 2) return;
    
    console.log('🔍 Frontend: Starting business search for:', query);
    setIsSearching(true);
    try {
      console.log('📡 Frontend: Calling business-lookup function...');
      const { data, error } = await supabase.functions.invoke('business-lookup', {
        body: { query: query.trim() }
      });

      console.log('📊 Frontend: Business lookup response:', { data, error });

      if (error) {
        console.error('❌ Frontend: Business lookup error:', error);
        throw error;
      }

      const results = data.results || [];
      console.log(`📋 Frontend: Found ${results.length} business entities:`, results);
      setSearchResults(results);
      
      if (results.length === 0) {
        console.log('⚠️ Frontend: No results found, proceeding to manual entry');
        // No results found, proceed to manual entry
        setFormData(prev => ({ ...prev, businessName: query }));
        setCurrentStep('profile-details');
        toast({
          title: "No businesses found",
          description: "We couldn't find any businesses matching your search. Please enter your business information manually.",
          variant: "default",
        });
      } else if (results.length === 1) {
        console.log('✅ Frontend: Single result found, auto-selecting:', results[0]);
        // Single result, auto-select and proceed
        const entity = results[0];
        selectEntity(entity);
      } else {
        console.log(`📝 Frontend: Multiple results (${results.length}) found, showing selection screen`);
        // Multiple results, show selection
        setCurrentStep('entity-selection');
      }
    } catch (error) {
      console.error('💥 Frontend: Error searching business entities:', error);
      toast({
        title: "Search Error",
        description: "Failed to search for businesses. Please try again.",
        variant: "destructive",
      });
      // On error, allow manual entry
      setFormData(prev => ({ ...prev, businessName: query }));
      setCurrentStep('profile-details');
    } finally {
      setIsSearching(false);
    }
  };

  const selectEntity = (entity: BusinessEntity) => {
    setSelectedEntity(entity);
    
    // Pre-populate form data from entity
    const addressParts = entity.principal_address?.split(', ') || [];
    const city = addressParts[addressParts.length - 3] || '';
    const stateZip = addressParts[addressParts.length - 2]?.split(' ') || [];
    const state = stateZip[0] || 'CA';
    const zipCode = stateZip[1] || '';
    const address = addressParts.slice(0, -2).join(', ') || '';

    setFormData(prev => ({
      ...prev,
      businessName: entity.entity_name,
      entityType: mapEntityType(entity.entity_type),
      entityNumber: entity.entity_number,
      address,
      city,
      state,
      zipCode
    }));
    
    setCurrentStep('profile-details');
  };

  const mapEntityType = (caEntityType: string): string => {
    switch (caEntityType.toUpperCase()) {
      case 'CORPORATION':
        return 'Corporation (C-Corp)';
      case 'LIMITED LIABILITY COMPANY':
        return 'Limited Liability Company (LLC)';
      default:
        return 'Other';
    }
  };

  const handleInputChange = (field: keyof BusinessProfileData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleManualEntry = () => {
    setFormData(prev => ({ ...prev, businessName: searchQuery }));
    setCurrentStep('profile-details');
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

          {/* Content based on current step */}
          {currentStep === 'business-search' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Find Your Business
                </CardTitle>
                <p className="text-muted-foreground">
                  Let's start by finding your business in California's registry
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="businessSearch">Business Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="businessSearch"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Enter your business name..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          searchBusinessEntities(searchQuery);
                        }
                      }}
                    />
                    <Button 
                      type="button"
                      onClick={() => searchBusinessEntities(searchQuery)}
                      disabled={isSearching || searchQuery.trim().length < 2}
                    >
                      {isSearching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    We'll search California's business registry for your company
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === 'entity-selection' && (
            <Card>
              <CardHeader>
                <CardTitle>Select Your Business</CardTitle>
                <p className="text-muted-foreground">
                  We found multiple businesses matching "{searchQuery}". Please select yours:
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {searchResults.map((entity, index) => (
                  <div
                    key={index}
                    className="p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => selectEntity(entity)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">{entity.entity_name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {entity.entity_type} • #{entity.entity_number}
                        </p>
                        {entity.principal_address && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {entity.principal_address}
                          </p>
                        )}
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        entity.entity_status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {entity.entity_status}
                      </span>
                    </div>
                  </div>
                ))}
                
                <div className="pt-4 border-t">
                  <Button 
                    variant="outline" 
                    onClick={handleManualEntry}
                    className="w-full"
                  >
                    None of these match - Enter manually
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === 'profile-details' && (
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
          )}
        </div>
      </div>
    </div>
  );
};