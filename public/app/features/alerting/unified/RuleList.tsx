import React from 'react';
import { Disable, Enable } from 'react-enable';

import { withErrorBoundary } from '@grafana/ui';
const RuleListViewV1 = SafeDynamicImport(() => import('./components/rule-list/RuleListView.v1'));
const RuleListViewV2 = SafeDynamicImport(() => import('./components/rule-list/RuleListView.v2'));
import { SafeDynamicImport } from 'app/core/components/DynamicImports/SafeDynamicImport';
import { GrafanaRouteComponentProps } from 'app/core/navigation/types';

import { AlertingPageWrapper } from './components/AlertingPageWrapper';
import { AlertingFeature } from './features';

const RuleList = (props: GrafanaRouteComponentProps): JSX.Element => (
  <AlertingPageWrapper pageId="alert-list" isLoading={false}>
    <RuleListViewV2 {...props} />
  </AlertingPageWrapper>
);

export default withErrorBoundary(RuleList, { style: 'page' });
