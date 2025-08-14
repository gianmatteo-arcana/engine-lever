import { LegalComplianceAgent } from '../legal-compliance';
import { AgentRole, TaskContext, AgentMessage, TaskPriority } from '../base/types';
import { jest } from '@jest/globals';
import { logger } from '../../utils/logger';

describe('LegalComplianceAgent', () => {
  let agent: LegalComplianceAgent;
  let mockContext: TaskContext;

  beforeEach(() => {
    agent = new LegalComplianceAgent();
    
    mockContext = {
      taskId: 'test-task-123',
      userId: 'user-123',
      businessId: 'business-123',
      priority: TaskPriority.MEDIUM,
      metadata: {
        businessType: 'LLC',
        businessName: 'Test Company LLC',
        businessState: 'CA',
        ein: '12-3456789',
        incorporationDate: '2023-03-15'
      },
      auditTrail: []
    };
  });

  describe('constructor', () => {
    it('should initialize with correct role and capabilities', () => {
      expect(agent.getRole()).toBe(AgentRole.LEGAL_COMPLIANCE);
      const persona = agent.getPersona();
      expect(persona.name).toBe('Legal Compliance Specialist');
      expect(persona.expertise).toContain('Business regulatory compliance');
      const capabilities = agent.getCapabilities();
      expect(capabilities.canInitiateTasks).toBe(false);
    });
  });

  describe('makeDecision', () => {
    it('should make decision to validate requirements', async () => {
      const decision = await (agent as any).makeDecision(mockContext);
      
      expect(decision.action).toBe('validate_and_prepare');
      expect(decision.confidence).toBeGreaterThan(0.7);
      expect(decision.reasoning).toContain('Business requires');
    });

    it('should handle missing business type gracefully', async () => {
      delete mockContext.metadata.businessType;
      
      const decision = await (agent as any).makeDecision(mockContext);
      
      expect(decision.action).toBe('validate_and_prepare');
      expect(decision.reasoning).toContain('LLC-12'); // defaults to LLC
    });
  });

  describe('getSOIRequirements', () => {
    it('should correctly identify SOI requirements for LLC entity', async () => {
      const requirements = await (agent as any).getSOIRequirements(mockContext);
      
      expect(requirements.isRequired).toBe(true);
      expect(requirements.formNumber).toBe('LLC-12');
      expect(requirements.fee).toBe(20);
      expect(requirements.requiredDocuments).toContain('Current business address');
    });

    it('should calculate correct due date based on incorporation month', async () => {
      const requirements = await (agent as any).getSOIRequirements(mockContext);
      const currentYear = new Date().getFullYear();
      
      expect(requirements.dueDate.getFullYear()).toBe(currentYear);
      expect(requirements.dueDate.getMonth()).toBe(2); // March (0-indexed, so 2 = March)
    });
  });

  describe('execute', () => {
    it('should execute requirements validation task', async () => {
      const task: AgentMessage = {
        id: 'msg-123',
        from: AgentRole.ORCHESTRATOR,
        to: AgentRole.LEGAL_COMPLIANCE,
        type: 'request',
        payload: {
          action: 'validate_soi_requirements',
          context: mockContext
        },
        priority: TaskPriority.MEDIUM,
        timestamp: new Date()
      };

      // Mock the sendMessage method to capture the response
      const sendMessageSpy = jest.spyOn(agent as any, 'sendMessage').mockImplementation(() => {});
      
      await agent.processMessage(task);
      
      expect(sendMessageSpy).toHaveBeenCalledWith(
        AgentRole.ORCHESTRATOR,
        expect.objectContaining({
          taskId: mockContext.taskId,
          status: 'completed',
          result: expect.objectContaining({
            valid: true,
            requirements: expect.objectContaining({
              isRequired: true,
              formNumber: 'LLC-12'
            })
          })
        }),
        'response'
      );
    });

    it('should handle form preparation task', async () => {
      const task: AgentMessage = {
        id: 'msg-124',
        from: AgentRole.ORCHESTRATOR,
        to: AgentRole.LEGAL_COMPLIANCE,
        type: 'request',
        payload: {
          action: 'prepare_form',
          context: mockContext
        },
        priority: TaskPriority.MEDIUM,
        timestamp: new Date()
      };

      // Mock the sendMessage method to capture the response
      const sendMessageSpy = jest.spyOn(agent as any, 'sendMessage').mockImplementation(() => {});
      
      await agent.processMessage(task);
      
      expect(sendMessageSpy).toHaveBeenCalledWith(
        AgentRole.ORCHESTRATOR,
        expect.objectContaining({
          taskId: mockContext.taskId,
          status: 'completed',
          result: expect.objectContaining({
            formTemplate: expect.objectContaining({
              formType: 'LLC Statement of Information'
            })
          })
        }),
        'response'
      );
    });

    it('should handle invalid actions gracefully', async () => {
      const task: AgentMessage = {
        id: 'msg-125',
        from: AgentRole.ORCHESTRATOR,
        to: AgentRole.LEGAL_COMPLIANCE,
        type: 'request',
        payload: {
          action: 'invalid_action',
          context: mockContext
        },
        priority: TaskPriority.MEDIUM,
        timestamp: new Date()
      };

      // The agent should handle unknown actions gracefully
      // It should not throw an error
      await expect(agent.processMessage(task)).resolves.not.toThrow();
    });
  });
});