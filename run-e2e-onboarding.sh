#!/bin/bash

# E2E Complete Onboarding Test Runner
# This script ensures the backend is running and executes the complete onboarding test

set -e

echo "🚀 E2E Complete Onboarding Test"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend is running
check_backend() {
    echo "🔍 Checking if backend is running..."
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is running${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Backend is not running${NC}"
        return 1
    fi
}

# Start backend if needed
start_backend() {
    echo "🚀 Starting backend server..."
    npm run dev > backend.log 2>&1 &
    BACKEND_PID=$!
    echo "Backend started with PID: $BACKEND_PID"
    
    # Wait for backend to be ready
    echo "⏳ Waiting for backend to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:3001/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Backend is ready!${NC}"
            return 0
        fi
        sleep 1
        echo -n "."
    done
    
    echo -e "${RED}❌ Backend failed to start${NC}"
    cat backend.log | tail -20
    return 1
}

# Main execution
main() {
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        exit 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Not in the backend directory${NC}"
        echo "Please run this from: /Users/gianmatteo/Documents/Arcana-Prototype/biz-buddy-backend"
        exit 1
    fi
    
    # Check/install dependencies
    if [ ! -d "node_modules/@supabase/supabase-js" ]; then
        echo "📦 Installing dependencies..."
        npm install @supabase/supabase-js axios --save-dev
    fi
    
    # Check or start backend
    if ! check_backend; then
        start_backend || exit 1
    fi
    
    echo ""
    echo "🎬 Running E2E Complete Onboarding Test"
    echo "========================================"
    echo ""
    
    # Set test email if provided as argument
    if [ ! -z "$1" ]; then
        export TEST_EMAIL="$1"
        echo "Using custom test email: $TEST_EMAIL"
    fi
    
    # Run the test
    node e2e-complete-onboarding-story.js
    TEST_RESULT=$?
    
    # Show results
    echo ""
    if [ $TEST_RESULT -eq 0 ]; then
        echo -e "${GREEN}✅ E2E Test Passed Successfully!${NC}"
        echo ""
        echo "The complete onboarding flow executed successfully:"
        echo "  1. Deleted existing test user"
        echo "  2. Created new test user" 
        echo "  3. Authenticated successfully"
        echo "  4. Created onboarding task"
        echo "  5. Monitored orchestration progress"
        echo "  6. Traced all events to completion"
        echo ""
        echo "Check backend.log for detailed orchestration logs."
    else
        echo -e "${RED}❌ E2E Test Failed${NC}"
        echo ""
        echo "The test did not complete successfully."
        echo "Check the output above for details."
        echo ""
        echo "Backend logs (last 20 lines):"
        tail -20 backend.log
    fi
    
    # Optionally stop backend if we started it
    if [ ! -z "$BACKEND_PID" ]; then
        echo ""
        read -p "Stop backend server? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Stopping backend (PID: $BACKEND_PID)..."
            kill $BACKEND_PID 2>/dev/null || true
            echo "Backend stopped"
        fi
    fi
    
    exit $TEST_RESULT
}

# Trap to cleanup on exit
cleanup() {
    if [ ! -z "$BACKEND_PID" ]; then
        echo ""
        echo "Cleaning up..."
        kill $BACKEND_PID 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

# Run main function
main "$@"