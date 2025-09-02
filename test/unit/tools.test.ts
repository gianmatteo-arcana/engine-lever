import { businessAnalyzer, documentProcessor, complianceChecker, allTools } from '../../src/tools';

describe('Business Tools', () => {
  describe('businessAnalyzer', () => {
    it('should have correct metadata', () => {
      expect(businessAnalyzer.name).toBe('business_analyzer');
      expect(businessAnalyzer.description).toContain('business data');
    });

    describe('analyze method', () => {
      it('should analyze financial data', async () => {
        const data = { revenue: 100000, expenses: 75000 };
        const result = await businessAnalyzer.analyze(data, 'financial');

        expect(result).toBeDefined();
        expect(result.revenue).toBe(100000);
        expect(result.expenses).toBe(75000);
        expect(result.profit).toBe(25000);
        expect(result.margins).toBeDefined();
        expect(result.recommendations).toBeInstanceOf(Array);
      });

      it('should analyze market data', async () => {
        const data = { industry: 'tech' };
        const result = await businessAnalyzer.analyze(data, 'market');

        expect(result).toBeDefined();
        expect(result.marketSize).toBeDefined();
        expect(result.competition).toBeDefined();
        expect(result.opportunities).toBeInstanceOf(Array);
        expect(result.threats).toBeInstanceOf(Array);
      });

      it('should analyze operations data', async () => {
        const data = { processes: ['order_fulfillment'] };
        const result = await businessAnalyzer.analyze(data, 'operations');

        expect(result).toBeDefined();
        expect(result.efficiency).toBeDefined();
        expect(result.bottlenecks).toBeInstanceOf(Array);
        expect(result.improvements).toBeInstanceOf(Array);
      });

      it('should throw error for unknown analysis type', async () => {
        const data = {};
        
        await expect(
          businessAnalyzer.analyze(data, 'unknown_type')
        ).rejects.toThrow('Unknown analysis type: unknown_type');
      });
    });

    describe('individual analysis methods', () => {
      it('should handle financial analysis with missing data', async () => {
        const result = await businessAnalyzer.analyzeFinancials({});

        expect(result.revenue).toBe(0);
        expect(result.expenses).toBe(0);
        expect(result.profit).toBe(0);
        expect(result.margins).toBeDefined();
        expect(result.recommendations).toBeInstanceOf(Array);
      });

      it('should provide market analysis', async () => {
        const result = await businessAnalyzer.analyzeMarket({});

        expect(result.marketSize).toBeDefined();
        expect(result.competition).toBeDefined();
        expect(result.opportunities).toBeInstanceOf(Array);
        expect(result.threats).toBeInstanceOf(Array);
      });

      it('should provide operations analysis', async () => {
        const result = await businessAnalyzer.analyzeOperations({});

        expect(result.efficiency).toBeDefined();
        expect(result.bottlenecks).toBeInstanceOf(Array);
        expect(result.improvements).toBeInstanceOf(Array);
      });
    });
  });

  describe('documentProcessor', () => {
    it('should have correct metadata', () => {
      expect(documentProcessor.name).toBe('document_processor');
      expect(documentProcessor.description).toContain('document');
    });

    describe('process method', () => {
      it('should process financial documents', async () => {
        const documentUrl = 'https://example.com/financial-report.pdf';
        const result = await documentProcessor.process(documentUrl, 'financial');

        expect(result).toBeDefined();
        expect(result.documentType).toBe('financial');
        expect(result.extractedData).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });

      it('should process legal documents', async () => {
        const documentUrl = 'https://example.com/contract.pdf';
        const result = await documentProcessor.process(documentUrl, 'legal');

        expect(result).toBeDefined();
        expect(result.documentType).toBe('legal');
        expect(result.extractedData).toBeDefined();
        expect(result.extractedData.contractType).toBeDefined();
      });

      it('should process compliance documents', async () => {
        const documentUrl = 'https://example.com/compliance.pdf';
        const result = await documentProcessor.process(documentUrl, 'compliance');

        expect(result).toBeDefined();
        expect(result.documentType).toBe('compliance');
        expect(result.extractedData).toBeDefined();
        expect(result.extractedData.requirements).toBeInstanceOf(Array);
      });

      it('should throw error for unknown process type', async () => {
        const documentUrl = 'https://example.com/doc.pdf';
        
        await expect(
          documentProcessor.process(documentUrl, 'unknown_type')
        ).rejects.toThrow('Unknown process type: unknown_type');
      });
    });

    describe('individual processing methods', () => {
      it('should process financial document with confidence score', async () => {
        const result = await documentProcessor.processFinancialDocument('test-url');

        expect(result.documentType).toBe('financial');
        expect(result.extractedData.revenue).toBeDefined();
        expect(result.extractedData.expenses).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should process legal document with contract details', async () => {
        const result = await documentProcessor.processLegalDocument('test-url');

        expect(result.documentType).toBe('legal');
        expect(result.extractedData.contractType).toBeDefined();
        expect(result.extractedData.parties).toBeInstanceOf(Array);
        expect(result.extractedData.keyProvisions).toBeInstanceOf(Array);
      });

      it('should process compliance document with requirements', async () => {
        const result = await documentProcessor.processComplianceDocument('test-url');

        expect(result.documentType).toBe('compliance');
        expect(result.extractedData.requirements).toBeInstanceOf(Array);
        expect(result.extractedData.deadlines).toBeInstanceOf(Array);
        expect(result.confidence).toBeGreaterThan(0.9);
      });
    });
  });

  describe('complianceChecker', () => {
    it('should have correct metadata', () => {
      expect(complianceChecker.name).toBe('compliance_checker');
      expect(complianceChecker.description).toContain('compliance');
    });

    describe('check method', () => {
      it('should check restaurant compliance', async () => {
        const result = await complianceChecker.check('restaurant', 'California');

        expect(result).toBeDefined();
        expect(result.businessType).toBe('restaurant');
        expect(result.location).toBe('California');
        expect(result.requirements).toBeDefined();
        expect(result.requirements.licenses).toBeInstanceOf(Array);
        expect(result.complianceScore).toBeGreaterThan(0);
      });

      it('should check retail compliance', async () => {
        const result = await complianceChecker.check('retail', 'New York');

        expect(result).toBeDefined();
        expect(result.businessType).toBe('retail');
        expect(result.requirements.licenses).toContain('Business License');
        expect(result.recommendations).toBeInstanceOf(Array);
      });

      it('should check professional services compliance', async () => {
        const result = await complianceChecker.check('professional_services', 'Texas');

        expect(result).toBeDefined();
        expect(result.requirements.licenses).toContain('Professional License');
        expect(result.complianceScore).toBeDefined();
      });

      it('should default to professional services for unknown business type', async () => {
        const result = await complianceChecker.check('unknown_business', 'Florida');

        expect(result).toBeDefined();
        expect(result.businessType).toBe('unknown_business');
        expect(result.requirements.licenses).toContain('Professional License');
      });
    });

    describe('getComplianceRequirements method', () => {
      it('should return restaurant requirements', async () => {
        const result = await complianceChecker.getComplianceRequirements('restaurant', 'CA');

        expect(result.requirements.licenses).toContain('Food Service License');
        expect(result.requirements.licenses).toContain('Liquor License');
        expect(result.requirements.regulations).toContain('Health Department');
      });

      it('should return retail requirements', async () => {
        const result = await complianceChecker.getComplianceRequirements('retail', 'NY');

        expect(result.requirements.licenses).toContain('Sales Tax Permit');
        expect(result.requirements.regulations).toContain('Consumer Protection');
      });

      it('should return professional services requirements', async () => {
        const result = await complianceChecker.getComplianceRequirements('professional_services', 'TX');

        expect(result.requirements.licenses).toContain('Professional License');
        expect(result.requirements.regulations).toContain('Professional Standards');
      });
    });
  });

  describe('allTools export', () => {
    it('should export all tools', () => {
      expect(allTools).toBeDefined();
      expect(allTools.businessAnalyzer).toBe(businessAnalyzer);
      expect(allTools.documentProcessor).toBe(documentProcessor);
      expect(allTools.complianceChecker).toBe(complianceChecker);
    });

    it('should have all expected tools', () => {
      const toolNames = Object.keys(allTools);
      expect(toolNames).toContain('businessAnalyzer');
      expect(toolNames).toContain('documentProcessor');
      expect(toolNames).toContain('complianceChecker');
      expect(toolNames).toContain('californiaBusinessSearch');
      expect(toolNames).toHaveLength(4);
    });
  });

  describe('Error handling', () => {
    it('should handle null/undefined data in business analyzer', async () => {
      const result = await businessAnalyzer.analyzeFinancials(null as any);
      expect(result.revenue).toBe(0);
      expect(result.expenses).toBe(0);
    });

    it('should handle empty strings in document processor', async () => {
      const result = await documentProcessor.processFinancialDocument('');
      expect(result.documentType).toBe('financial');
      expect(result.extractedData).toBeDefined();
    });

    it('should handle empty business type in compliance checker', async () => {
      const result = await complianceChecker.check('', 'California');
      expect(result.businessType).toBe('');
      expect(result.requirements).toBeDefined();
    });
  });
});