// Code generated - EDITING IS FUTILE. DO NOT EDIT.
//
// Generated by:
//     kinds/gen.go
// Using jennies:
//     GoResourceTypes
//
// Run 'make gen-cue' from repository root to regenerate.

package preferences

// QueryHistoryPreference defines model for QueryHistoryPreference.
type QueryHistoryPreference struct {
	// HomeTab one of: '' | 'query' | 'starred';
	HomeTab *string `json:"homeTab,omitempty"`
}

// Spec defines model for Spec.
type Spec struct {
	// UID for the home dashboard
	HomeDashboardUID *string `json:"homeDashboardUID,omitempty"`

	// Selected language (beta)
	Language     *string                 `json:"language,omitempty"`
	QueryHistory *QueryHistoryPreference `json:"queryHistory,omitempty"`

	// Theme light, dark, empty is default
	Theme *string `json:"theme,omitempty"`

	// The timezone selection
	// TODO: this should use the timezone defined in common
	Timezone *string `json:"timezone,omitempty"`

	// WeekStart day of the week (sunday, monday, etc)
	WeekStart *string `json:"weekStart,omitempty"`
}
