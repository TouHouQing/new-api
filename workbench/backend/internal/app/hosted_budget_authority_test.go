package app

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHostedWorkbenchTreatsEveryLocalCreditBudgetAsNonBinding(t *testing.T) {
	svc := &Service{host: &testWorkbenchHost{}}
	require.True(t, svc.WorkbenchHosted())
	require.False(t, svc.localCreditBudgetEnforced())
	require.Zero(t, svc.localCreditBudgetMicrocredits(200))
	require.Zero(t, svc.localCreditBudgetMicrocredits(0))
}

func TestStandaloneWorkbenchKeepsExplicitLegacyBudget(t *testing.T) {
	svc := &Service{}
	require.False(t, svc.WorkbenchHosted())
	require.True(t, svc.localCreditBudgetEnforced())
	require.EqualValues(t, 200*CreditScale, svc.localCreditBudgetMicrocredits(200))
}
