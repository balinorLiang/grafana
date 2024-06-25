import { css } from '@emotion/css';
import { defaults, groupBy, isArray, sumBy, uniqueId, upperFirst } from 'lodash';
import pluralize from 'pluralize';
import { FC, Fragment, ReactNode, useState } from 'react';
import * as React from 'react';
import { useToggle } from 'react-use';

import { GrafanaTheme2 } from '@grafana/data';
import { config } from '@grafana/runtime';
import {
  Badge,
  Button,
  Dropdown,
  Icon,
  IconButton,
  Menu,
  Stack,
  Text,
  TextLink,
  Tooltip,
  getTagColorsFromName,
  useStyles2,
} from '@grafana/ui';
import ConditionalWrap from 'app/features/alerting/unified/components/ConditionalWrap';
import {
  AlertmanagerGroup,
  MatcherOperator,
  ObjectMatcher,
  Receiver,
  RouteWithID,
} from 'app/plugins/datasource/alertmanager/types';
import { ReceiversState } from 'app/types';

import { RoutesMatchingFilters } from '../../NotificationPolicies';
import { AlertmanagerAction, useAlertmanagerAbilities, useAlertmanagerAbility } from '../../hooks/useAbilities';
import { INTEGRATION_ICONS } from '../../types/contact-points';
import { getAmMatcherFormatter } from '../../utils/alertmanager';
import { MatcherFormatter, normalizeMatchers } from '../../utils/matchers';
import { createContactPointLink, createMuteTimingLink } from '../../utils/misc';
import { InheritableProperties, getInheritedProperties } from '../../utils/notification-policies';
import { InsertPosition } from '../../utils/routeTree';
import { Authorize } from '../Authorize';
import { HoverCard } from '../HoverCard';
import { Label } from '../Label';
import { MetaText } from '../MetaText';
import { ProvisioningBadge } from '../Provisioning';
import { Spacer } from '../Spacer';
import { GrafanaPoliciesExporter } from '../export/GrafanaPoliciesExporter';

import { Matchers } from './Matchers';
import { TIMING_OPTIONS_DEFAULTS, TimingOptions } from './timingOptions';

interface PolicyComponentProps {
  receivers?: Receiver[];
  alertGroups?: AlertmanagerGroup[];
  contactPointsState?: ReceiversState;
  readOnly?: boolean;
  provisioned?: boolean;
  inheritedProperties?: Partial<InheritableProperties>;
  routesMatchingFilters?: RoutesMatchingFilters;

  matchingInstancesPreview?: {
    groupsMap?: Map<string, AlertmanagerGroup[]>;
    enabled: boolean;
  };

  routeTree: RouteWithID;
  currentRoute: RouteWithID;
  alertManagerSourceName: string;
  onEditPolicy: (route: RouteWithID, isDefault?: boolean, isAutogenerated?: boolean) => void;
  onAddPolicy: (route: RouteWithID, position: InsertPosition) => void;
  onDeletePolicy: (route: RouteWithID) => void;
  onShowAlertInstances: (
    alertGroups: AlertmanagerGroup[],
    matchers?: ObjectMatcher[],
    formatter?: MatcherFormatter
  ) => void;
  isAutoGenerated?: boolean;
}

const Policy = (props: PolicyComponentProps) => {
  const {
    receivers = [],
    contactPointsState,
    readOnly = false,
    provisioned = false,
    alertGroups = [],
    alertManagerSourceName,
    currentRoute,
    routeTree,
    inheritedProperties,
    routesMatchingFilters = {
      filtersApplied: false,
      matchedRoutesWithPath: new Map<RouteWithID, RouteWithID[]>(),
    },
    matchingInstancesPreview = { enabled: false },
    onEditPolicy,
    onAddPolicy,
    onDeletePolicy,
    onShowAlertInstances,
    isAutoGenerated = false,
  } = props;

  const styles = useStyles2(getStyles);

  const isDefaultPolicy = currentRoute === routeTree;

  const contactPoint = currentRoute.receiver;
  const continueMatching = currentRoute.continue ?? false;

  const matchers = normalizeMatchers(currentRoute);
  const hasMatchers = Boolean(matchers && matchers.length);

  const { filtersApplied, matchedRoutesWithPath } = routesMatchingFilters;
  const matchedRoutes = Array.from(matchedRoutesWithPath.keys());

  // check if this route matches the filters
  const hasFocus = filtersApplied && matchedRoutes.some((route) => route.id === currentRoute.id);

  // check if this route belongs to a path that matches the filters
  const routesPath = Array.from(matchedRoutesWithPath.values()).flat();
  const belongsToMatchPath = routesPath.some((route: RouteWithID) => route.id === currentRoute.id);

  // gather errors here
  const errors: ReactNode[] = [];

  // if the route has no matchers, is not the default policy (that one has none) and it does not continue
  // then we should warn the user that it's a suspicious setup
  const showMatchesAllLabelsWarning = !hasMatchers && !isDefaultPolicy && !continueMatching;

  // if the receiver / contact point has any errors show it on the policy
  const actualContactPoint = contactPoint ?? inheritedProperties?.receiver ?? '';
  const contactPointErrors = contactPointsState ? getContactPointErrors(actualContactPoint, contactPointsState) : [];

  const allChildPolicies = currentRoute.routes ?? [];

  // filter child policies that match
  const childPolicies = filtersApplied
    ? // filter by the ones that belong to the path that matches the filters
      allChildPolicies.filter((policy) => routesPath.some((route: RouteWithID) => route.id === policy.id))
    : allChildPolicies;

  const hasChildPolicies = childPolicies.length > 0;

  const [showExportDrawer, toggleShowExportDrawer] = useToggle(false);
  const matchingAlertGroups = matchingInstancesPreview?.groupsMap?.get(currentRoute.id);

  // sum all alert instances for all groups we're handling
  const numberOfAlertInstances = matchingAlertGroups
    ? sumBy(matchingAlertGroups, (group) => group.alerts.length)
    : undefined;

  // simplified routing permissions
  const [isSupportedToSeeAutogeneratedChunk, isAllowedToSeeAutogeneratedChunk] = useAlertmanagerAbility(
    AlertmanagerAction.ViewAutogeneratedPolicyTree
  );

  // we collapse the auto-generated policies by default
  const isAutogeneratedPolicyRoot = isAutoGeneratedRootAndSimplifiedEnabled(currentRoute);
  const [showPolicyChildren, togglePolicyChildren] = useToggle(isAutogeneratedPolicyRoot ? false : true);

  const groupBy = currentRoute.group_by;
  const muteTimings = currentRoute.mute_time_intervals ?? [];

  const timingOptions: TimingOptions = {
    group_wait: currentRoute.group_wait,
    group_interval: currentRoute.group_interval,
    repeat_interval: currentRoute.repeat_interval,
  };

  contactPointErrors.forEach((error) => {
    errors.push(error);
  });

  const POLICIES_PER_PAGE = 20;

  const [visibleChildPolicies, setVisibleChildPolicies] = useState(POLICIES_PER_PAGE);

  // build the menu actions for our policy
  const dropdownMenuActions: JSX.Element[] = useCreateDropdownMenuActions(
    isAutoGenerated,
    isDefaultPolicy,
    provisioned,
    onEditPolicy,
    currentRoute,
    toggleShowExportDrawer,
    onDeletePolicy
  );

  // check if this policy should be visible. If it's autogenerated and the user is not allowed to see autogenerated
  // policies then we should not show it. Same if the user is not supported to see autogenerated policies.
  const hideCurrentPolicy =
    isAutoGenerated && (!isAllowedToSeeAutogeneratedChunk || !isSupportedToSeeAutogeneratedChunk);
  const hideCurrentPolicyForFilters = filtersApplied && !belongsToMatchPath;

  if (hideCurrentPolicy || hideCurrentPolicyForFilters) {
    return null;
  }

  const isImmutablePolicy = isDefaultPolicy || isAutogeneratedPolicyRoot;
  // TODO dead branch detection, warnings for all sort of configs that won't work or will never be activated

  const childPoliciesBelongingToMatchPath = childPolicies.filter((child) =>
    routesPath.some((route: RouteWithID) => route.id === child.id)
  );

  // child policies to render are the ones that belong to the path that matches the filters
  const childPoliciesToRender = filtersApplied ? childPoliciesBelongingToMatchPath : childPolicies;
  const pageOfChildren = childPoliciesToRender.slice(0, visibleChildPolicies);

  const moreCount = childPoliciesToRender.length - pageOfChildren.length;
  const showMore = moreCount > 0;

  return (
    <>
      <Stack direction="column" gap={1.5}>
        <div
          className={styles.policyWrapper(hasFocus)}
          data-testid={isDefaultPolicy ? 'am-root-route-container' : 'am-route-container'}
        >
          {/* continueMatching and showMatchesAllLabelsWarning are mutually exclusive so the icons can't overlap */}
          {continueMatching && <ContinueMatchingIndicator />}
          {showMatchesAllLabelsWarning && <AllMatchesIndicator />}

          <div className={styles.policyItemWrapper}>
            <Stack direction="column" gap={1}>
              {/* Matchers and actions */}
              <div>
                <Stack direction="row" alignItems="center" gap={1}>
                  {hasChildPolicies ? (
                    <IconButton
                      name={showPolicyChildren ? 'angle-down' : 'angle-right'}
                      onClick={togglePolicyChildren}
                      aria-label={showPolicyChildren ? 'Collapse' : 'Expand'}
                    />
                  ) : null}
                  {isImmutablePolicy ? (
                    isAutogeneratedPolicyRoot ? (
                      <AutogeneratedRootIndicator />
                    ) : (
                      <DefaultPolicyIndicator />
                    )
                  ) : hasMatchers ? (
                    <Matchers matchers={matchers ?? []} formatter={getAmMatcherFormatter(alertManagerSourceName)} />
                  ) : (
                    <span className={styles.metadata}>No matchers</span>
                  )}
                  <Spacer />
                  {/* TODO maybe we should move errors to the gutter instead? */}
                  {errors.length > 0 && <Errors errors={errors} />}
                  {provisioned && <ProvisioningBadge />}
                  <Stack direction="row" gap={0.5}>
                    {!isAutoGenerated && !readOnly && (
                      <Authorize actions={[AlertmanagerAction.CreateNotificationPolicy]}>
                        <ConditionalWrap shouldWrap={provisioned} wrap={ProvisionedTooltip}>
                          {isDefaultPolicy ? (
                            <Button
                              variant="secondary"
                              icon="plus"
                              size="sm"
                              disabled={provisioned}
                              type="button"
                              onClick={() => onAddPolicy(currentRoute, 'child')}
                            >
                              New child policy
                            </Button>
                          ) : (
                            <Dropdown
                              overlay={
                                <Menu>
                                  <Menu.Item
                                    label="New sibling above"
                                    icon="arrow-up"
                                    onClick={() => onAddPolicy(currentRoute, 'above')}
                                  />
                                  <Menu.Item
                                    label="New sibling below"
                                    icon="arrow-down"
                                    onClick={() => onAddPolicy(currentRoute, 'below')}
                                  />
                                  <Menu.Divider />
                                  <Menu.Item
                                    label="New child policy"
                                    icon="plus"
                                    onClick={() => onAddPolicy(currentRoute, 'child')}
                                  />
                                </Menu>
                              }
                            >
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={provisioned}
                                icon="angle-down"
                                type="button"
                              >
                                Add new policy
                              </Button>
                            </Dropdown>
                          )}
                        </ConditionalWrap>
                      </Authorize>
                    )}
                    {dropdownMenuActions.length > 0 && (
                      <Dropdown overlay={<Menu>{dropdownMenuActions}</Menu>}>
                        <Button
                          icon="ellipsis-h"
                          variant="secondary"
                          size="sm"
                          type="button"
                          aria-label="more-actions"
                          data-testid="more-actions"
                        />
                      </Dropdown>
                    )}
                  </Stack>
                </Stack>
              </div>

              {/* Metadata row */}
              <MetadataRow
                matchingInstancesPreview={matchingInstancesPreview}
                numberOfAlertInstances={numberOfAlertInstances}
                contactPoint={contactPoint ?? undefined}
                groupBy={groupBy}
                muteTimings={muteTimings}
                timingOptions={timingOptions}
                inheritedProperties={inheritedProperties}
                alertManagerSourceName={alertManagerSourceName}
                receivers={receivers}
                matchingAlertGroups={matchingAlertGroups}
                matchers={matchers}
                isDefaultPolicy={isDefaultPolicy}
                onShowAlertInstances={onShowAlertInstances}
              />
            </Stack>
          </div>
        </div>
        <div className={styles.childPolicies}>
          {showPolicyChildren && (
            <>
              {pageOfChildren.map((child) => {
                const childInheritedProperties = getInheritedProperties(currentRoute, child, inheritedProperties);
                // This child is autogenerated if it's the autogenerated root or if it's a child of an autogenerated policy.
                const isThisChildAutoGenerated = isAutoGeneratedRootAndSimplifiedEnabled(child) || isAutoGenerated;
                /* pass the "readOnly" prop from the parent, because for any child policy , if its parent it's not editable,
                then the child policy should not be editable either */
                const isThisChildReadOnly = readOnly || provisioned || isAutoGenerated;

                return (
                  <Policy
                    key={child.id}
                    routeTree={routeTree}
                    currentRoute={child}
                    receivers={receivers}
                    contactPointsState={contactPointsState}
                    readOnly={isThisChildReadOnly}
                    inheritedProperties={childInheritedProperties}
                    onAddPolicy={onAddPolicy}
                    onEditPolicy={onEditPolicy}
                    onDeletePolicy={onDeletePolicy}
                    onShowAlertInstances={onShowAlertInstances}
                    alertManagerSourceName={alertManagerSourceName}
                    alertGroups={alertGroups}
                    routesMatchingFilters={routesMatchingFilters}
                    matchingInstancesPreview={matchingInstancesPreview}
                    isAutoGenerated={isThisChildAutoGenerated}
                    provisioned={provisioned}
                  />
                );
              })}
              {showMore && (
                <Button
                  size="sm"
                  icon="angle-down"
                  variant="secondary"
                  className={styles.moreButtons}
                  onClick={() => setVisibleChildPolicies(visibleChildPolicies + POLICIES_PER_PAGE)}
                >
                  {moreCount} additional {pluralize('policy', moreCount)}
                </Button>
              )}
            </>
          )}
        </div>
        {showExportDrawer && <GrafanaPoliciesExporter onClose={toggleShowExportDrawer} />}
      </Stack>
    </>
  );
};

interface MetadataRowProps {
  matchingInstancesPreview: { groupsMap?: Map<string, AlertmanagerGroup[]>; enabled: boolean };
  numberOfAlertInstances?: number;
  contactPoint?: string;
  groupBy?: string[];
  muteTimings?: string[];
  timingOptions?: TimingOptions;
  inheritedProperties?: Partial<InheritableProperties>;
  alertManagerSourceName: string;
  receivers: Receiver[];
  matchingAlertGroups?: AlertmanagerGroup[];
  matchers?: ObjectMatcher[];
  isDefaultPolicy: boolean;
  onShowAlertInstances: (
    alertGroups: AlertmanagerGroup[],
    matchers?: ObjectMatcher[],
    formatter?: MatcherFormatter
  ) => void;
}

function MetadataRow({
  numberOfAlertInstances,
  isDefaultPolicy,
  timingOptions,
  groupBy,
  muteTimings = [],
  matchingInstancesPreview,
  inheritedProperties,
  matchingAlertGroups,
  onShowAlertInstances,
  matchers,
  contactPoint,
  alertManagerSourceName,
  receivers,
}: MetadataRowProps) {
  const styles = useStyles2(getStyles);

  const inheritedGrouping = inheritedProperties && inheritedProperties.group_by;
  const hasInheritedProperties = inheritedProperties && Object.keys(inheritedProperties).length > 0;

  const noGrouping = isArray(groupBy) && groupBy[0] === '...';
  const customGrouping = !noGrouping && isArray(groupBy) && groupBy.length > 0;
  const singleGroup = isDefaultPolicy && isArray(groupBy) && groupBy.length === 0;

  const hasMuteTimings = Boolean(muteTimings.length);

  return (
    <div className={styles.metadataRow}>
      <Stack direction="row" alignItems="center" gap={1}>
        {matchingInstancesPreview.enabled && (
          <MetaText
            icon="layers-alt"
            onClick={() => {
              matchingAlertGroups &&
                onShowAlertInstances(matchingAlertGroups, matchers, getAmMatcherFormatter(alertManagerSourceName));
            }}
            data-testid="matching-instances"
          >
            <Text color="primary">{numberOfAlertInstances ?? '-'}</Text>
            <span>{pluralize('instance', numberOfAlertInstances)}</span>
          </MetaText>
        )}
        {contactPoint && (
          <MetaText icon="at" data-testid="contact-point">
            <span>Delivered to</span>
            <ContactPointsHoverDetails
              alertManagerSourceName={alertManagerSourceName}
              receivers={receivers}
              contactPoint={contactPoint}
            />
          </MetaText>
        )}
        {!inheritedGrouping && (
          <>
            {customGrouping && (
              <MetaText icon="layer-group" data-testid="grouping">
                <span>Grouped by</span>
                <Text color="primary">{groupBy.join(', ')}</Text>
              </MetaText>
            )}
            {singleGroup && (
              <MetaText icon="layer-group">
                <span>Single group</span>
              </MetaText>
            )}
            {noGrouping && (
              <MetaText icon="layer-group">
                <span>Not grouping</span>
              </MetaText>
            )}
          </>
        )}
        {hasMuteTimings && (
          <MetaText icon="calendar-slash" data-testid="mute-timings">
            <span>Muted when</span>
            <MuteTimings timings={muteTimings} alertManagerSourceName={alertManagerSourceName} />
          </MetaText>
        )}
        {timingOptions && (
          // for the default policy we will also merge the default timings, that way a user can observe what the timing options would be
          <TimingOptionsMeta
            timingOptions={isDefaultPolicy ? defaults(timingOptions, TIMING_OPTIONS_DEFAULTS) : timingOptions}
          />
        )}
        {hasInheritedProperties && (
          <>
            <MetaText icon="corner-down-right-alt" data-testid="inherited-properties">
              <span>Inherited</span>
              <InheritedProperties properties={inheritedProperties} />
            </MetaText>
          </>
        )}
      </Stack>
    </div>
  );
}

export const useCreateDropdownMenuActions = (
  isAutoGenerated: boolean,
  isDefaultPolicy: boolean,
  provisioned: boolean,
  onEditPolicy: (route: RouteWithID, isDefault?: boolean, readOnly?: boolean) => void,
  currentRoute: RouteWithID,
  toggleShowExportDrawer: (nextValue?: any) => void,
  onDeletePolicy: (route: RouteWithID) => void
) => {
  const [
    [updatePoliciesSupported, updatePoliciesAllowed],
    [deletePolicySupported, deletePolicyAllowed],
    [exportPoliciesSupported, exportPoliciesAllowed],
  ] = useAlertmanagerAbilities([
    AlertmanagerAction.UpdateNotificationPolicyTree,
    AlertmanagerAction.DeleteNotificationPolicy,
    AlertmanagerAction.ExportNotificationPolicies,
  ]);
  const dropdownMenuActions = [];
  const showExportAction = exportPoliciesAllowed && exportPoliciesSupported && isDefaultPolicy && !isAutoGenerated;
  const showEditAction = updatePoliciesSupported && updatePoliciesAllowed;
  const showDeleteAction = deletePolicySupported && deletePolicyAllowed && !isDefaultPolicy && !isAutoGenerated;

  if (showEditAction) {
    dropdownMenuActions.push(
      <Fragment key="edit-policy">
        <ConditionalWrap shouldWrap={provisioned} wrap={ProvisionedTooltip}>
          <Menu.Item
            icon="edit"
            disabled={provisioned || isAutoGenerated}
            label="Edit"
            onClick={() => onEditPolicy(currentRoute, isDefaultPolicy)}
          />
        </ConditionalWrap>
      </Fragment>
    );
  }

  if (showExportAction) {
    dropdownMenuActions.push(
      <Menu.Item key="export-policy" icon="download-alt" label="Export" onClick={toggleShowExportDrawer} />
    );
  }

  if (showDeleteAction) {
    dropdownMenuActions.push(
      <Fragment key="delete-policy">
        <Menu.Divider />
        <ConditionalWrap shouldWrap={provisioned} wrap={ProvisionedTooltip}>
          <Menu.Item
            destructive
            icon="trash-alt"
            disabled={provisioned || isAutoGenerated}
            label="Delete"
            onClick={() => onDeletePolicy(currentRoute)}
          />
        </ConditionalWrap>
      </Fragment>
    );
  }
  return dropdownMenuActions;
};

export const AUTOGENERATED_ROOT_LABEL_NAME = '__grafana_autogenerated__';

export function isAutoGeneratedRootAndSimplifiedEnabled(route: RouteWithID) {
  const simplifiedRoutingToggleEnabled = config.featureToggles.alertingSimplifiedRouting ?? false;
  if (!simplifiedRoutingToggleEnabled) {
    return false;
  }
  if (!route.object_matchers) {
    return false;
  }
  return (
    route.object_matchers.some((objectMatcher) => {
      return (
        objectMatcher[0] === AUTOGENERATED_ROOT_LABEL_NAME &&
        objectMatcher[1] === MatcherOperator.equal &&
        objectMatcher[2] === 'true'
      );
    }) ?? false
  );
  // return simplifiedRoutingToggleEnabled && route.receiver === 'contact_point_5';
}

const ProvisionedTooltip = (children: ReactNode) => (
  <Tooltip content="Provisioned items cannot be edited in the UI" placement="top">
    <span>{children}</span>
  </Tooltip>
);

const Errors: FC<{ errors: React.ReactNode[] }> = ({ errors }) => (
  <HoverCard
    arrow
    placement="top"
    content={
      <Stack direction="column" gap={0.5}>
        {errors.map((error) => (
          <Fragment key={uniqueId()}>{error}</Fragment>
        ))}
      </Stack>
    }
  >
    <span>
      <Badge icon="exclamation-circle" color="red" text={pluralize('error', errors.length, true)} />
    </span>
  </HoverCard>
);

const ContinueMatchingIndicator: FC = () => {
  const styles = useStyles2(getStyles);
  return (
    <Tooltip placement="top" content="This route will continue matching other policies">
      <div className={styles.gutterIcon} data-testid="continue-matching">
        <Icon name="arrow-down" />
      </div>
    </Tooltip>
  );
};

const AllMatchesIndicator: FC = () => {
  const styles = useStyles2(getStyles);
  return (
    <Tooltip placement="top" content="This policy matches all labels">
      <div className={styles.gutterIcon} data-testid="matches-all">
        <Icon name="exclamation-triangle" />
      </div>
    </Tooltip>
  );
};

function DefaultPolicyIndicator() {
  const styles = useStyles2(getStyles);
  return (
    <>
      <Text element="h2" variant="body" weight="medium">
        Default policy
      </Text>
      <span className={styles.metadata}>
        All alert instances will be handled by the default policy if no other matching policies are found.
      </span>
    </>
  );
}

function AutogeneratedRootIndicator() {
  return (
    <Text element="h3" variant="body" weight="medium">
      Auto-generated policies
    </Text>
  );
}

const InheritedProperties: FC<{ properties: InheritableProperties }> = ({ properties }) => (
  <HoverCard
    arrow
    placement="top"
    content={
      <Stack direction="row" gap={0.5}>
        {Object.entries(properties).map(([key, value]) => {
          if (!value) {
            return null;
          }

          return <Label key={key} label={routePropertyToLabel(key)} value={routePropertyToValue(key, value)} />;
        })}
      </Stack>
    }
  >
    <div>
      <Text color="primary">{pluralize('property', Object.keys(properties).length, true)}</Text>
    </div>
  </HoverCard>
);

const MuteTimings: FC<{ timings: string[]; alertManagerSourceName: string }> = ({
  timings,
  alertManagerSourceName,
}) => {
  /* TODO make a better mute timing overview, allow combining multiple in to one overview */
  /*
    <HoverCard
      arrow
      placement="top"
      header={<MetaText icon="calendar-slash">Mute Timings</MetaText>}
      content={
        // TODO show a combined view of all mute timings here, combining the weekdays, years, months, etc
        <Stack direction="row" gap={0.5}>
          <Label label="Weekdays" value="Saturday and Sunday" />
        </Stack>
      }
    >
      <div>
        <Strong>{muteTimings.join(', ')}</Strong>
      </div>
    </HoverCard>
  */
  return (
    <div>
      {timings.map((timing) => (
        <TextLink
          key={timing}
          href={createMuteTimingLink(timing, alertManagerSourceName)}
          color="primary"
          variant="bodySmall"
          inline={false}
        >
          {timing}
        </TextLink>
      ))}
    </div>
  );
};

const TimingOptionsMeta: FC<{ timingOptions: TimingOptions }> = ({ timingOptions }) => {
  const groupWait = timingOptions.group_wait;
  const groupInterval = timingOptions.group_interval;

  // we don't have any timing options to show – we're inheriting everything from the parent
  // and those show up in a separate "inherited properties" component
  if (!groupWait && !groupInterval) {
    return null;
  }

  return (
    <MetaText icon="hourglass" data-testid="timing-options">
      <span>Wait</span>
      {groupWait && (
        <Tooltip
          placement="top"
          content="How long to initially wait to send a notification for a group of alert instances."
        >
          <span>
            <Text color="primary">{groupWait}</Text> to group instances
            {groupWait && groupInterval && ','}
          </span>
        </Tooltip>
      )}
      {groupInterval && (
        <Tooltip
          placement="top"
          content="How long to wait before sending a notification about new alerts that are added to a group of alerts for which an initial notification has already been sent."
        >
          <span>
            <Text color="primary">{groupInterval}</Text> before sending updates
          </span>
        </Tooltip>
      )}
    </MetaText>
  );
};

interface ContactPointDetailsProps {
  alertManagerSourceName: string;
  contactPoint: string;
  receivers: Receiver[];
}

// @TODO make this work for cloud AMs too
const ContactPointsHoverDetails: FC<ContactPointDetailsProps> = ({
  alertManagerSourceName,
  contactPoint,
  receivers,
}) => {
  const details = receivers.find((receiver) => receiver.name === contactPoint);
  if (!details) {
    return (
      <TextLink
        href={createContactPointLink(contactPoint, alertManagerSourceName)}
        color="primary"
        variant="bodySmall"
        inline={false}
      >
        {contactPoint}
      </TextLink>
    );
  }

  const integrations = details.grafana_managed_receiver_configs;
  if (!integrations) {
    return (
      <TextLink
        href={createContactPointLink(contactPoint, alertManagerSourceName)}
        color="primary"
        variant="bodySmall"
        inline={false}
      >
        {contactPoint}
      </TextLink>
    );
  }

  const groupedIntegrations = groupBy(details.grafana_managed_receiver_configs, (config) => config.type);

  return (
    <HoverCard
      arrow
      placement="top"
      header={
        <MetaText icon="at">
          <div>Contact Point</div>
          <Text color="primary">{contactPoint}</Text>
        </MetaText>
      }
      key={uniqueId()}
      content={
        <Stack direction="row" gap={0.5}>
          {/* use "label" to indicate how many of that type we have in the contact point */}
          {Object.entries(groupedIntegrations).map(([type, integrations]) => (
            <Label
              key={uniqueId()}
              label={integrations.length > 1 ? integrations.length : undefined}
              icon={INTEGRATION_ICONS[type]}
              value={upperFirst(type)}
            />
          ))}
        </Stack>
      }
    >
      <TextLink
        href={createContactPointLink(contactPoint, alertManagerSourceName)}
        color="primary"
        variant="bodySmall"
        inline={false}
      >
        {contactPoint}
      </TextLink>
    </HoverCard>
  );
};

function getContactPointErrors(contactPoint: string, contactPointsState: ReceiversState): JSX.Element[] {
  const notifierStates = Object.entries(contactPointsState[contactPoint]?.notifiers ?? []);
  const contactPointErrors = notifierStates.reduce((acc: JSX.Element[] = [], [_, notifierStatuses]) => {
    const notifierErrors = notifierStatuses
      .filter((status) => status.lastNotifyAttemptError)
      .map((status) => (
        <Label
          icon="at"
          key={uniqueId()}
          label={`Contact Point › ${status.name}`}
          value={status.lastNotifyAttemptError}
        />
      ));

    return acc.concat(notifierErrors);
  }, []);

  return contactPointErrors;
}

const routePropertyToLabel = (key: keyof InheritableProperties | string): string => {
  switch (key) {
    case 'receiver':
      return 'Contact Point';
    case 'group_by':
      return 'Group by';
    case 'group_interval':
      return 'Group interval';
    case 'group_wait':
      return 'Group wait';
    case 'repeat_interval':
      return 'Repeat interval';
    default:
      return key;
  }
};

const routePropertyToValue = (
  key: keyof InheritableProperties | string,
  value: string | string[]
): NonNullable<ReactNode> => {
  const isNotGrouping = key === 'group_by' && Array.isArray(value) && value[0] === '...';
  const isSingleGroup = key === 'group_by' && Array.isArray(value) && value.length === 0;

  if (isNotGrouping) {
    return (
      <Text variant="bodySmall" color="secondary">
        Not grouping
      </Text>
    );
  }

  if (isSingleGroup) {
    return (
      <Text variant="bodySmall" color="secondary">
        Single group
      </Text>
    );
  }

  return Array.isArray(value) ? value.join(', ') : value;
};

const getStyles = (theme: GrafanaTheme2) => ({
  matcher: (label: string) => {
    const { color, borderColor } = getTagColorsFromName(label);

    return {
      wrapper: css({
        color: '#fff',
        background: color,
        padding: `${theme.spacing(0.33)} ${theme.spacing(0.66)}`,
        fontSize: theme.typography.bodySmall.fontSize,
        border: `solid 1px ${borderColor}`,
        borderRadius: theme.shape.radius.default,
      }),
    };
  },
  childPolicies: css({
    marginLeft: theme.spacing(4),
    position: 'relative',
    '&:before': {
      content: '""',
      position: 'absolute',
      height: 'calc(100% - 10px)',
      borderLeft: `solid 1px ${theme.colors.border.weak}`,
      marginTop: 0,
      marginLeft: '-20px',
    },
  }),
  policyItemWrapper: css({
    padding: theme.spacing(1.5),
  }),
  metadataRow: css({
    borderBottomLeftRadius: theme.shape.borderRadius(2),
    borderBottomRightRadius: theme.shape.borderRadius(2),
  }),
  policyWrapper: (hasFocus = false) =>
    css({
      flex: 1,
      position: 'relative',
      background: theme.colors.background.secondary,
      borderRadius: theme.shape.radius.default,
      border: `solid 1px ${theme.colors.border.weak}`,
      ...(hasFocus && {
        borderColor: theme.colors.primary.border,
        background: theme.colors.primary.transparent,
      }),
    }),
  metadata: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    fontWeight: theme.typography.bodySmall.fontWeight,
  }),
  break: css({
    width: '100%',
    height: 0,
    marginBottom: theme.spacing(2),
  }),
  gutterIcon: css({
    position: 'absolute',
    top: 0,
    transform: 'translateY(50%)',
    left: `-${theme.spacing(4)}`,
    color: theme.colors.text.secondary,
    background: theme.colors.background.primary,
    width: '25px',
    height: '25px',
    textAlign: 'center',
    border: `solid 1px ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: 0,
  }),
  moreButtons: css({
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(1.5),
  }),
});

export { Policy };
