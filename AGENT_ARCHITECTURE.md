# 🏛️ **Agent Architecture Guidelines**

## **UNIVERSAL PRINCIPLES - MANDATORY FOR ALL AGENTS**

This document defines the architectural patterns that ALL agents MUST follow. These principles ensure agents are generic, reusable, and work with any Task Template configuration.

---

## 1. 🚫 **FORBIDDEN PATTERNS - NEVER VIOLATE THESE**

### ❌ **NO Hardcoded Entity Types**
```typescript
// ❌ FORBIDDEN
if (entityType === 'LLC') { ... }
if (profile.entityType === 'Corporation') { ... }
entityType: 'LLC' | 'Corporation' | 'Partnership'

// ✅ CORRECT
entityType: string // Generic - Task Templates define valid types
const entityRules = context.metadata?.entityRules?.[profile.entityType] || {};
```

### ❌ **NO Geographic Assumptions**
```typescript
// ❌ FORBIDDEN
if (state === 'California') { ... }
if (jurisdiction === 'CA') { ... }
'CA': 'California Secretary of State'

// ✅ CORRECT  
location?: string // Generic - Task Templates define format
const locationRules = context.metadata?.jurisdictionRules?.[location] || {};
```

### ❌ **NO Task-Specific Business Logic**
```typescript
// ❌ FORBIDDEN
if (taskType === 'soi_filing') { ... }
if (filingType === 'statement_of_information') { ... }

// ✅ CORRECT
const filingType = request.data?.filingType || 'general';
const templateRequirements = request.data?.requirements || {};
```

### ❌ **NO Jurisdiction-Specific Code**
```typescript
// ❌ FORBIDDEN
switch (state) {
  case 'CA': fee = entityType === 'Corporation' ? 25 : 20; break;
  case 'DE': fee = 300; break;
}

// ✅ CORRECT
const feeStructure = context.metadata?.feeStructure || {};
const fee = feeStructure[location]?.[entityType] || feeStructure.default;
```

---

## 2. ✅ **MANDATORY PATTERNS - ALWAYS FOLLOW THESE**

### ✅ **Agents Focus on ROLES and Expertise**

Each agent has ONE clear mission:
- **ProfileCollectorAgent**: User profile and business info collection
- **LegalComplianceAgent**: Regulatory requirement analysis  
- **PaymentAgent**: Payment processing and fee calculation
- **AgencyInteractionAgent**: External portal navigation and submission
- **DataCollectionAgent**: Multi-source data gathering and validation

### ✅ **Task Templates Provide Context**

All specific logic comes from YAML configuration:
```typescript
// Agent provides generic capability
private analyzeRequirements(profile: BusinessProfile): ComplianceRequirement[] {
  // Get rules from Task Template
  const entityRules = this.taskContext?.metadata?.entityRules?.[profile.entityType] || {};
  
  // Apply template-defined logic
  return this.generateRequirements(entityRules, profile);
}
```

### ✅ **Generic and Reusable Interfaces**

```typescript
interface BusinessProfile {
  name: string;
  entityType: string; // Generic - Task Templates define valid types
  location?: string; // Generic location - Task Templates define format
  attributes?: Record<string, any>; // Task Template specific attributes
}
```

### ✅ **Toolchain Integration Pattern**

All external tool access goes through ToolChain:
```typescript
async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
  // TODO: Access ToolChain for [agent-specific capability]
  // const toolName = await this.toolChain.getTool('tool_name');
  // const result = await toolName.performAction(parameters);
  //
  // Examples of tools this agent would ideally access:
  // - Web automation tools (Puppeteer, Playwright, Selenium)
  // - API connectors and data validation services
  // - Document generators and parsers
}
```

### ✅ **Complete Traceability**

Every agent action MUST be recorded:
```typescript
await this.recordContextEntry(context, {
  operation: 'descriptive_operation_name',
  data: { relevant: 'data' },
  reasoning: 'Clear explanation of why this action was taken'
});
```

---

## 3. 🏗️ **ARCHITECTURAL PATTERN: "Built Generically, Grounded in Examples"**

### **Agent Code (TypeScript) Provides:**
- Generic algorithms and business logic
- Universal data structures and interfaces  
- Tool access patterns and error handling
- Context recording and state management

### **Task Templates (YAML) Define:**
- Jurisdiction-specific rules and requirements
- Entity type definitions and mappings
- Tool configurations and data sources
- Workflow steps and UI templates

### **Example Split:**

**Agent Code:**
```typescript
// Generic requirement evaluation
private evaluateRequirements(profile: BusinessProfile): RequirementItem[] {
  const entityRules = this.taskContext?.metadata?.entityRules?.[profile.entityType] || {};
  
  if (entityRules.governanceRequirements) {
    return entityRules.governanceRequirements.map(req => 
      this.createRequirementFromTemplate(req, profile)
    );
  }
  
  return [];
}
```

**Task Template (YAML):**
```yaml
metadata:
  entityRules:
    llc:
      governanceRequirements:
        - id: operating_agreement
          name: Operating Agreement
          priority: high
          daysToComplete: 30
    corporation:
      governanceRequirements:
        - id: corporate_bylaws  
          name: Corporate Bylaws
          priority: critical
          daysToComplete: 15
```

---

## 4. 🔧 **TOOLCHAIN INTEGRATION EXAMPLES**

### **DataCollectionAgent Tools:**
```typescript
// TODO: Access ToolChain for public records search
// const publicRecordsSearch = await this.toolChain.getTool('public_records_search');
// const businessRegistryLookup = await this.toolChain.getTool('business_registry_lookup');
// const entityTypeClassifier = await this.toolChain.getTool('entity_type_classifier');
```

### **LegalComplianceAgent Tools:**
```typescript
// TODO: Access ToolChain for legal research and analysis  
// const legalResearchEngine = await this.toolChain.getTool('legal_research_engine');
// const regulatoryDatabase = await this.toolChain.getTool('regulatory_database');
// const riskAnalyzer = await this.toolChain.getTool('regulatory_risk_analyzer');
```

### **AgencyInteractionAgent Tools:**
```typescript
// TODO: Access ToolChain for external portal interactions
// const portalNavigator = await this.toolChain.getTool('portal_navigation_service');
// const formSubmissionService = await this.toolChain.getTool('form_submission_service');
// const captchaSolver = await this.toolChain.getTool('captcha_solver_service');
```

---

## 5. ⚠️ **ENFORCEMENT AND CODE REVIEW**

### **Automated Checks:**
```bash
# Search for violations
grep -r "LLC\|Corporation\|Partnership\|Sole Proprietorship" src/agents/
grep -r "California\|SOI\|Secretary of State" src/agents/  
```

### **Code Review Rejection Criteria:**
- Any hardcoded entity types found
- Any geographic assumptions in agent code
- Task-specific logic not driven by Task Templates
- Missing Toolchain integration TODOs
- Agent code that won't work with different jurisdictions

### **Required Test Coverage:**
- Generic entity type handling
- Task Template metadata integration
- Error handling for missing configuration
- Toolchain integration patterns

---

## 6. 🎯 **AGENT MISSION EXAMPLES**

### **ProfileCollectorAgent Mission:**
"Collect user profile and business information through intelligent, low-friction onboarding flows. Excel at minimizing user input through smart defaults and progressive disclosure."

### **LegalComplianceAgent Mission:**  
"Analyze regulatory requirements and translate complex regulations into actionable steps. Identify deadlines, assess risks, and provide clear guidance for regulatory obligations."

### **PaymentAgent Mission:**
"Handle payment processing, fee calculation, and transaction management. Provide transparent pricing and secure payment workflows."

---

## 7. 📚 **REMEMBER THE CORE PRINCIPLE**

**Agents provide CAPABILITIES, Task Templates define WORKFLOWS**

- ✅ Agent: "I can analyze regulatory requirements"
- ✅ Task Template: "Here are the specific CA LLC requirements to analyze"

- ❌ Agent: "I analyze CA LLC requirements specifically" 
- ❌ Task Template: "Just run the analysis"

---

This architecture ensures all agents are:
- **Universal**: Work with any jurisdiction/entity type
- **Maintainable**: Changes happen in YAML, not code
- **Testable**: Generic code with configurable behavior
- **Scalable**: Add new jurisdictions via Task Templates only