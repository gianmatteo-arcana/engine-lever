/**
 * Payment Agent
 * Migrated from EventEmitter to Consolidated BaseAgent Pattern
 * 
 * Specialized agent that processes secure payments for government fees and regulatory filings.
 * Handles cost calculation, payment method verification, and transaction management.
 */

import { BaseAgent } from './base/BaseAgent';
import { 
  TaskContext, 
  ContextEntry, 
  AgentRequest, 
  AgentResponse,
  UIRequest,
  UITemplateType
} from '../types/engine-types';
import { DatabaseService } from '../services/database';

interface PaymentMethod {
  type: 'ach' | 'credit_card' | 'business_account';
  id: string;
  name: string;
  lastFour?: string;
  isDefault: boolean;
  isVerified: boolean;
  routingNumber?: string;
  accountType?: 'checking' | 'savings';
}

interface PaymentBreakdown {
  governmentFee: number;
  serviceFee: number;
  processingFee: number;
  total: number;
  currency: string;
  breakdown: {
    itemName: string;
    amount: number;
    description: string;
  }[];
}

interface PaymentAuthorization {
  authorizationId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  recipient: {
    name: string;
    type: 'government' | 'service';
    account: string;
  };
  description: string;
  requiresApproval: boolean;
  expiresAt: string;
}

interface TransactionResult {
  transactionId: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  paymentMethod: PaymentMethod;
  processedAt: string;
  confirmationNumber?: string;
  failureReason?: string;
  auditTrail: {
    action: string;
    timestamp: string;
    details: any;
  }[];
}

/**
 * Payment Agent - Consolidated BaseAgent Implementation
 */
export class PaymentAgent extends BaseAgent {
  constructor(businessId: string, userId?: string) {
    super('payment_agent.yaml', businessId, userId);
  }

  /**
   * Main processing method - handles payment operations
   */
  async processRequest(request: AgentRequest, context: TaskContext): Promise<AgentResponse> {
    const requestId = `pa_${Date.now()}`;
    
    try {
      // Record payment operation initiation
      await this.recordContextEntry(context, {
        operation: 'payment_operation_initiated',
        data: { 
          operationType: request.instruction,
          requestId 
        },
        reasoning: 'Starting secure payment processing operation'
      });

      // Route based on instruction
      switch (request.instruction) {
        case 'calculate_costs':
          return await this.calculateCosts(request, context);
        
        case 'verify_payment_method':
          return await this.verifyPaymentMethod(request, context);
        
        case 'process_payment':
          return await this.processPayment(request, context);
        
        case 'authorize_payment':
          return await this.authorizePayment(request, context);
        
        case 'get_payment_status':
          return await this.getPaymentStatus(request, context);
        
        default:
          await this.recordContextEntry(context, {
            operation: 'unknown_payment_instruction',
            data: { instruction: request.instruction, requestId },
            reasoning: 'Received unrecognized instruction for payment processing'
          });

          return {
            status: 'error',
            data: { error: `Unknown payment instruction: ${request.instruction}` },
            reasoning: 'Payment agent cannot process unrecognized payment instruction type'
          };
      }

    } catch (error: any) {
      await this.recordContextEntry(context, {
        operation: 'payment_operation_error',
        data: { error: error.message, requestId },
        reasoning: 'Payment operation failed due to technical error'
      });

      return {
        status: 'error',
        data: { error: error.message },
        reasoning: 'Technical error during payment processing'
      };
    }
  }

  /**
   * Calculate payment costs and fees
   */
  private async calculateCosts(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const filingType = request.data?.filingType || 'soi';
    const entityType = this.extractEntityType(context);
    const jurisdiction = this.extractJurisdiction(context);
    
    // Calculate government and service fees
    const breakdown = this.computePaymentBreakdown(filingType, entityType, jurisdiction);
    
    await this.recordContextEntry(context, {
      operation: 'costs_calculated',
      data: { 
        breakdown,
        filingType,
        entityType,
        jurisdiction,
        totalAmount: breakdown.total
      },
      reasoning: `Calculated payment breakdown: $${breakdown.total} total for ${filingType} filing in ${jurisdiction}`
    });

    // Generate cost breakdown UI
    const uiRequest = this.createCostBreakdownUI(breakdown, filingType);

    return {
      status: 'needs_input',
      data: { 
        breakdown,
        filingType,
        entityType,
        jurisdiction,
        recommendations: {
          preferredMethod: 'ach',
          reason: 'Lower processing fees for ACH payments',
          estimatedProcessingTime: '1-3 business days'
        }
      },
      uiRequests: [uiRequest],
      reasoning: 'Payment cost calculation completed, awaiting payment method selection',
      nextAgent: 'payment'
    };
  }

  /**
   * Verify payment method
   */
  private async verifyPaymentMethod(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const paymentMethodId = request.data?.paymentMethodId;
    if (!paymentMethodId) {
      return {
        status: 'error',
        data: { error: 'Payment method ID required for verification' },
        reasoning: 'Cannot verify payment method without method identifier'
      };
    }

    // Mock payment method verification (would integrate with Plaid/Stripe in production)
    const paymentMethod = await this.mockVerifyPaymentMethod(paymentMethodId);
    
    await this.recordContextEntry(context, {
      operation: 'payment_method_verified',
      data: { 
        paymentMethod,
        verificationStatus: paymentMethod.isVerified,
        methodType: paymentMethod.type
      },
      reasoning: `Payment method ${paymentMethodId} verification completed: ${paymentMethod.isVerified ? 'verified' : 'failed'}`
    });

    return {
      status: 'completed',
      data: { 
        paymentMethod,
        isVerified: paymentMethod.isVerified,
        canProcessPayments: paymentMethod.isVerified,
        verificationDetails: {
          accountType: paymentMethod.accountType,
          lastFour: paymentMethod.lastFour,
          verifiedAt: new Date().toISOString()
        }
      },
      reasoning: paymentMethod.isVerified 
        ? 'Payment method verified successfully, ready for transactions'
        : 'Payment method verification failed, alternative method required'
    };
  }

  /**
   * Process payment transaction
   */
  private async processPayment(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { authorizationId, paymentMethodId, amount } = request.data || {};
    
    if (!authorizationId || !paymentMethodId || !amount) {
      return {
        status: 'error',
        data: { error: 'Payment authorization, method, and amount required' },
        reasoning: 'Cannot process payment without complete payment information'
      };
    }

    // Process the payment (mock implementation)
    const transactionResult = await this.mockProcessPayment(authorizationId, paymentMethodId, amount);
    
    await this.recordContextEntry(context, {
      operation: 'payment_processed',
      data: { 
        transactionResult,
        amount,
        status: transactionResult.status,
        transactionId: transactionResult.transactionId
      },
      reasoning: `Payment processing ${transactionResult.status}: $${amount} transaction ${transactionResult.transactionId}`
    });

    // Generate payment confirmation UI
    const uiRequest = this.createPaymentConfirmationUI(transactionResult);

    return {
      status: transactionResult.status === 'completed' ? 'completed' : 'needs_input',
      data: { 
        transactionResult,
        nextSteps: transactionResult.status === 'completed' 
          ? ['Payment confirmed', 'Filing will be submitted', 'Confirmation sent via email']
          : ['Payment failed', 'Please try alternative payment method', 'Contact support if issue persists']
      },
      uiRequests: [uiRequest],
      reasoning: transactionResult.status === 'completed' 
        ? 'Payment successfully processed and confirmed'
        : 'Payment processing encountered an issue, user action required',
      nextAgent: transactionResult.status === 'completed' ? 'agency_interaction' : 'payment'
    };
  }

  /**
   * Authorize payment for government fees
   */
  private async authorizePayment(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { amount, paymentMethodId, description, recipient } = request.data || {};
    
    const authorization = await this.createPaymentAuthorization(
      amount, 
      paymentMethodId, 
      description, 
      recipient
    );
    
    await this.recordContextEntry(context, {
      operation: 'payment_authorized',
      data: { 
        authorization,
        amount,
        requiresApproval: authorization.requiresApproval
      },
      reasoning: `Payment authorization created: $${amount} for ${description}, approval ${authorization.requiresApproval ? 'required' : 'not required'}`
    });

    // Generate authorization UI
    const uiRequest = this.createAuthorizationUI(authorization);

    return {
      status: 'needs_input',
      data: { 
        authorization,
        requiresUserApproval: authorization.requiresApproval,
        expiresIn: this.calculateTimeUntilExpiry(authorization.expiresAt)
      },
      uiRequests: [uiRequest],
      reasoning: authorization.requiresApproval 
        ? 'Payment authorization created, awaiting user approval'
        : 'Payment pre-authorized, ready for processing',
      nextAgent: 'payment'
    };
  }

  /**
   * Get payment status
   */
  private async getPaymentStatus(
    request: AgentRequest, 
    context: TaskContext
  ): Promise<AgentResponse> {
    
    const { transactionId } = request.data || {};
    
    if (!transactionId) {
      return {
        status: 'error',
        data: { error: 'Transaction ID required for status check' },
        reasoning: 'Cannot check payment status without transaction identifier'
      };
    }

    // Mock status check (would query payment processor in production)
    const status = await this.mockGetPaymentStatus(transactionId);
    
    await this.recordContextEntry(context, {
      operation: 'payment_status_checked',
      data: { 
        transactionId,
        status: status.status,
        lastUpdated: status.lastUpdated
      },
      reasoning: `Payment status checked for transaction ${transactionId}: ${status.status}`
    });

    return {
      status: 'completed',
      data: status,
      reasoning: `Payment status retrieved for transaction ${transactionId}`
    };
  }

  // Helper methods for payment processing
  private extractEntityType(context: TaskContext): string {
    return context.currentState.data.business?.entityType || 'LLC';
  }

  private extractJurisdiction(context: TaskContext): string {
    return context.currentState.data.business?.state || 'CA';
  }

  private computePaymentBreakdown(filingType: string, entityType: string, jurisdiction: string): PaymentBreakdown {
    // Government fees by filing type and jurisdiction
    const governmentFees: Record<string, Record<string, number>> = {
      'soi': {
        'CA': entityType === 'Corporation' ? 25 : 20
      },
      'franchise_tax': {
        'CA': 800
      }
    };

    const governmentFee = governmentFees[filingType]?.[jurisdiction] || 50;
    const serviceFee = Math.round(governmentFee * 0.1); // 10% service fee
    const processingFee = 2.99; // Fixed processing fee
    const total = governmentFee + serviceFee + processingFee;

    return {
      governmentFee,
      serviceFee,
      processingFee,
      total: Math.round(total * 100) / 100,
      currency: 'USD',
      breakdown: [
        { itemName: `${filingType.toUpperCase()} Filing Fee`, amount: governmentFee, description: `${jurisdiction} government fee` },
        { itemName: 'Service Fee', amount: serviceFee, description: 'SmallBizAlly processing service' },
        { itemName: 'Processing Fee', amount: processingFee, description: 'Payment processing fee' }
      ]
    };
  }

  private async mockVerifyPaymentMethod(paymentMethodId: string): Promise<PaymentMethod> {
    // Mock verification - would integrate with Plaid/Stripe
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      type: 'business_account',
      id: paymentMethodId,
      name: 'Business Checking',
      lastFour: '1234',
      isDefault: true,
      isVerified: true,
      routingNumber: '123456789',
      accountType: 'checking'
    };
  }

  private async mockProcessPayment(authorizationId: string, paymentMethodId: string, amount: number): Promise<TransactionResult> {
    // Mock payment processing - would integrate with payment processor
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const success = Math.random() > 0.1; // 90% success rate
    
    return {
      transactionId: `txn_${Date.now()}`,
      status: success ? 'completed' : 'failed',
      amount,
      paymentMethod: await this.mockVerifyPaymentMethod(paymentMethodId),
      processedAt: new Date().toISOString(),
      confirmationNumber: success ? `CONF_${Date.now()}` : undefined,
      failureReason: success ? undefined : 'Insufficient funds',
      auditTrail: [
        {
          action: 'payment_initiated',
          timestamp: new Date().toISOString(),
          details: { authorizationId, paymentMethodId, amount }
        },
        {
          action: success ? 'payment_completed' : 'payment_failed',
          timestamp: new Date().toISOString(),
          details: { success, amount }
        }
      ]
    };
  }

  private async createPaymentAuthorization(
    amount: number, 
    paymentMethodId: string, 
    description: string, 
    recipient?: any
  ): Promise<PaymentAuthorization> {
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minute expiry
    
    return {
      authorizationId: `auth_${Date.now()}`,
      amount,
      paymentMethod: await this.mockVerifyPaymentMethod(paymentMethodId),
      recipient: recipient || {
        name: 'California Secretary of State',
        type: 'government',
        account: 'gov_ca_sos'
      },
      description: description || 'Government filing fee',
      requiresApproval: amount > 100, // Require approval for amounts over $100
      expiresAt: expiresAt.toISOString()
    };
  }

  private async mockGetPaymentStatus(transactionId: string): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return {
      transactionId,
      status: 'completed',
      amount: 25.00,
      lastUpdated: new Date().toISOString(),
      confirmationNumber: 'CONF_123456'
    };
  }

  private calculateTimeUntilExpiry(expiresAt: string): number {
    return Math.max(0, new Date(expiresAt).getTime() - new Date().getTime());
  }

  private createCostBreakdownUI(breakdown: PaymentBreakdown, filingType: string): UIRequest {
    return {
      requestId: `cost_breakdown_${Date.now()}`,
      templateType: UITemplateType.DataSummary,
      semanticData: {
        agentRole: 'payment_agent',
        title: 'Payment Breakdown',
        description: `Total cost for ${filingType.toUpperCase()} filing`,
        breakdown,
        totalAmount: breakdown.total,
        currency: breakdown.currency,
        actions: {
          proceed: {
            type: 'submit',
            label: `Pay $${breakdown.total}`,
            primary: true,
            handler: () => ({ action: 'proceed_to_payment', breakdown })
          },
          change_method: {
            type: 'custom',
            label: 'Change Payment Method',
            handler: () => ({ action: 'select_payment_method' })
          }
        }
      },
      context: {
        userProgress: 80,
        deviceType: 'desktop',
        urgency: 'medium'
      }
    } as any;
  }

  private createPaymentConfirmationUI(result: TransactionResult): UIRequest {
    return {
      requestId: `payment_confirmation_${Date.now()}`,
      templateType: result.status === 'completed' ? UITemplateType.SuccessScreen : UITemplateType.ErrorDisplay,
      semanticData: {
        agentRole: 'payment_agent',
        title: result.status === 'completed' ? 'Payment Successful' : 'Payment Failed',
        description: result.status === 'completed' 
          ? `Your payment of $${result.amount} has been processed successfully`
          : `Payment failed: ${result.failureReason}`,
        transactionResult: result,
        actions: result.status === 'completed' ? {
          continue: {
            type: 'submit',
            label: 'Continue',
            primary: true,
            handler: () => ({ action: 'continue_filing' })
          }
        } : {
          retry: {
            type: 'submit',
            label: 'Try Again',
            primary: true,
            handler: () => ({ action: 'retry_payment' })
          },
          change_method: {
            type: 'custom',
            label: 'Use Different Method',
            handler: () => ({ action: 'select_payment_method' })
          }
        }
      },
      context: {
        userProgress: result.status === 'completed' ? 90 : 75,
        deviceType: 'desktop',
        urgency: result.status === 'completed' ? 'low' : 'high'
      }
    } as any;
  }

  private createAuthorizationUI(authorization: PaymentAuthorization): UIRequest {
    return {
      requestId: `payment_auth_${Date.now()}`,
      templateType: UITemplateType.ApprovalRequest,
      semanticData: {
        agentRole: 'payment_agent',
        title: 'Payment Authorization Required',
        description: `Authorize payment of $${authorization.amount} to ${authorization.recipient.name}`,
        authorization,
        expiresIn: this.calculateTimeUntilExpiry(authorization.expiresAt),
        actions: {
          approve: {
            type: 'submit',
            label: 'Authorize Payment',
            primary: true,
            handler: () => ({ action: 'approve_payment', authorizationId: authorization.authorizationId })
          },
          cancel: {
            type: 'cancel',
            label: 'Cancel',
            handler: () => ({ action: 'cancel_payment' })
          }
        }
      },
      context: {
        userProgress: 70,
        deviceType: 'desktop',
        urgency: 'high'
      }
    } as any;
  }

  /**
   * Record context entry with proper reasoning
   */
  private async recordContextEntry(context: TaskContext, entry: Partial<ContextEntry>): Promise<void> {
    const contextEntry: ContextEntry = {
      entryId: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      sequenceNumber: (context.history?.length || 0) + 1,
      actor: {
        type: 'agent',
        id: 'payment_agent',
        version: (this as any).specializedTemplate?.agent?.version || '1.0.0'
      },
      operation: entry.operation || 'unknown',
      data: entry.data || {},
      reasoning: entry.reasoning || 'Payment processing action',
      trigger: entry.trigger || {
        type: 'agent_request',
        source: 'payment',
        details: {}
      }
    };

    if (!context.history) {
      context.history = [];
    }
    context.history.push(contextEntry);

    // Also persist to database if context has an ID
    if (context.contextId) {
      try {
        const db = DatabaseService.getInstance();
        await db.createContextHistoryEntry(context.contextId, contextEntry);
      } catch (error) {
        console.error('Failed to persist context entry to database:', error);
        // Continue even if database write fails
      }
    }
  }
}