# 🎯 Feature Development SOP - GitHub Issues Based

## NEW WORKFLOW: No More .md File Proliferation

**EFFECTIVE IMMEDIATELY**: All feature requests go through GitHub Issues as PRDs

## 📋 STANDARDIZED WORKFLOW

### Phase 1: Requirements Definition
```bash
1. CREATE GitHub Issue with PRD Template
   - Use descriptive title: "PRD: [Feature Name]"
   - Apply labels: priority/high, component/backend, type/feature
   - Fill PRD template sections completely
   - Assign to developer

2. VALIDATE Requirements
   - Review with stakeholders in issue comments  
   - Iterate on requirements in issue thread
   - Get approval before implementation

3. NO MORE standalone PRD.md files!
```

### Phase 2: Implementation Planning  
```bash
1. READ ARCHITECTURE_GUIDELINES.md (MANDATORY)
   - Follow Universal Agent Architecture patterns
   - Ensure context threading compliance
   - Use generic type mappings
   - Implement graceful database failures

2. CREATE Feature Branch
   - Name: feature/issue-{number}-{short-description}
   - Example: feature/issue-45-user-onboarding

3. CHECK for Existing Implementations
   - Run assessment protocol from ARCHITECTURE_GUIDELINES.md
   - Ensure no duplicate patterns
```

### Phase 3: Development
```bash
1. IMPLEMENT Following Architecture Guidelines
   - All agents must receive TaskContext parameter
   - Use Task Template metadata for configuration  
   - Implement graceful database failure patterns
   - NO hardcoded business logic

2. WRITE TESTS (Test-Driven Architecture)
   - Let failing tests guide architecture discovery
   - Use comprehensive Task Template metadata in tests
   - Test both success and graceful degradation paths
   - 100% pass rate required

3. FOLLOW Schema Change Workflow (if needed)
   - See DEVELOPMENT_WORKFLOW.md for complete process
   - Frontend repo owns all schema changes
   - Backend implements and tests business logic
```

### Phase 4: Review & Merge
```bash
1. CREATE Pull Request
   - Reference GitHub issue: "Closes #45"
   - Include implementation summary
   - Link to relevant tests

2. ENSURE Compliance
   - All tests passing
   - ARCHITECTURE_GUIDELINES.md compliance verified
   - No documentation proliferation (no new .md files)

3. MERGE and Close Issue
   - Squash commits for clean history
   - Close related GitHub issue
   - Archive any temporary documentation
```

## 🚫 WHAT NOT TO CREATE

### NO MORE of These Files:
- `FEATURE_NAME_PRD.md` → Use GitHub Issues
- `IMPLEMENTATION_SUMMARY.md` → PR description  
- `FEATURE_ARCHITECTURE.md` → Update ARCHITECTURE_GUIDELINES.md
- `TEST_RESULTS.md` → CI/CD handles this
- `STATUS_UPDATE.md` → Use issue comments

### Documentation Updates ONLY For:
- **Architecture Changes**: Update ARCHITECTURE_GUIDELINES.md
- **New Patterns**: Add to ARCHITECTURE_GUIDELINES.md
- **Session Workflow**: Update CLAUDE.md  
- **Security**: Update SECURITY.md
- **Schema Process**: Update DEVELOPMENT_WORKFLOW.md

## 📝 GITHUB ISSUE PRD TEMPLATE

```markdown
## PRD: [Feature Name]

### Problem Statement
- What problem are we solving?
- Why is this important now?

### Success Criteria  
- [ ] Functional requirement 1
- [ ] Functional requirement 2  
- [ ] Performance requirement
- [ ] Security requirement

### Technical Requirements
- Agent architecture patterns required
- Database changes needed (if any)
- Integration points
- Task Template configuration needed

### Implementation Approach
- Which agents will be involved?
- What Task Template metadata is needed?
- Any new architectural patterns?

### Testing Strategy
- Unit test requirements
- Integration test scenarios
- E2E testing approach

### Definition of Done
- [ ] All tests passing
- [ ] ARCHITECTURE_GUIDELINES.md compliance
- [ ] No new .md files created
- [ ] PR merged and issue closed

### Related Issues
- Links to dependent or related issues

### Timeline
- Target completion date
- Key milestones
```

## 🔍 ENFORCEMENT

### Pre-Commit Hooks Check For:
```bash
# Detect new .md file creation (except approved locations)
git diff --name-status | grep "^A.*\.md$" | grep -v "ARCHITECTURE_GUIDELINES\|CLAUDE\|README\|SECURITY"

# Detect architecture guideline violations
grep -r "if.*entityType.*===.*LLC" src/ --include="*.ts"
grep -rn "private.*(): " src/agents/ --include="*.ts"
```

### Code Review Requirements:
- [ ] GitHub issue properly references implementation
- [ ] No new .md files created
- [ ] ARCHITECTURE_GUIDELINES.md patterns followed
- [ ] Comprehensive test coverage
- [ ] Universal Agent Architecture compliance

## 📊 SUCCESS METRICS

### Documentation Health:
- **Target**: <10 active .md files per repo
- **Current**: ~150+ files (needs consolidation)
- **Measurement**: Weekly .md file count

### Feature Delivery:
- **Requirements**: All in GitHub Issues
- **Implementation**: Following ARCHITECTURE_GUIDELINES.md
- **Testing**: 100% pass rate maintained
- **Documentation**: No new .md proliferation

## 🎯 QUICK REFERENCE

### For New Features:
1. GitHub Issue with PRD template
2. Feature branch from issue number  
3. Follow ARCHITECTURE_GUIDELINES.md
4. PR closes GitHub issue
5. NO new .md files

### For Architecture Changes:
1. Update ARCHITECTURE_GUIDELINES.md only
2. Get architectural review
3. Update patterns across codebase
4. Update CLAUDE.md if session-specific

### For Bug Fixes:
1. GitHub Issue describing bug
2. Fix with tests proving resolution
3. PR closes GitHub issue
4. NO new documentation files

This SOP eliminates documentation proliferation while ensuring feature requirements are properly captured and tracked in GitHub Issues.