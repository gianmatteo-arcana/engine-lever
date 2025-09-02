# California Business Search Tool - Improvement Notes

## Issue: Multiple Search Results Handling

### Current Behavior
- `CaliforniaBusinessSearchTool.searchByName()` returns ALL matches as an array
- Fetches detailed information for EVERY result (potentially slow)
- `ToolChain.searchBusinessEntity()` only uses the FIRST result
- Wastes resources fetching unused details

### Recommended Improvements

#### Option 1: Best Match Selection (Recommended)
Add intelligent selection logic to pick the most relevant result:

```typescript
// In ToolChain.searchBusinessEntity()
const bestMatch = this.selectBestMatch(results, businessName);

private selectBestMatch(results: CaliforniaBusinessDetails[], searchTerm: string) {
  // Prioritize:
  // 1. Exact name matches
  // 2. Active status over Dissolved/Suspended
  // 3. Corporations/LLCs over other entity types
  // 4. Most recent registration date
  
  return results.sort((a, b) => {
    // Exact match scores highest
    const aExact = a.entityName.toLowerCase() === searchTerm.toLowerCase() ? 1000 : 0;
    const bExact = b.entityName.toLowerCase() === searchTerm.toLowerCase() ? 1000 : 0;
    
    // Active status scores higher
    const aActive = a.status === 'Active' ? 100 : 0;
    const bActive = b.status === 'Active' ? 100 : 0;
    
    // Prefer certain entity types
    const aTypeScore = this.getEntityTypeScore(a.entityType);
    const bTypeScore = this.getEntityTypeScore(b.entityType);
    
    return (bExact + bActive + bTypeScore) - (aExact + aActive + aTypeScore);
  })[0];
}
```

#### Option 2: Return Multiple Results
Change the interface to support multiple results:

```typescript
export interface BusinessEntitySearchResult {
  matches: BusinessEntity[];
  exactMatch?: BusinessEntity;
  totalFound: number;
}
```

#### Option 3: Lazy Detail Fetching
Only fetch details for the selected result:

```typescript
// In CaliforniaBusinessSearchTool
async searchByName(businessName: string, fetchDetails = false) {
  // ... perform search ...
  
  if (!fetchDetails) {
    return searchResults; // Return without clicking through
  }
  
  // Only fetch details if requested
  for (const result of searchResults) {
    // ... fetch details ...
  }
}
```

#### Option 4: Add Search Limits
Limit the number of results processed:

```typescript
async searchByName(businessName: string, maxResults = 5) {
  // ... perform search ...
  
  const resultsToProcess = searchResults.slice(0, maxResults);
  // Only fetch details for top N results
}
```

## Recommended Implementation Priority

1. **Immediate**: Add result limit (Option 4) to prevent performance issues
2. **Short-term**: Implement best match selection (Option 1) 
3. **Long-term**: Support multiple results for agents that need them (Option 2)

## Usage Considerations

### For Agents
- Agents should be aware that multiple matches might exist
- Consider asking for clarification when multiple active businesses match
- Use entity number for precise lookups when available

### For Users
- More specific searches yield better results
- Include entity type in search (e.g., "Apple Inc" vs just "Apple")
- Use entity numbers when known for exact matches