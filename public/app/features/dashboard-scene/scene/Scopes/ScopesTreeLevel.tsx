import { css } from '@emotion/css';

import { GrafanaTheme2 } from '@grafana/data';
import { Checkbox, IconButton, RadioButtonDot, useStyles2 } from '@grafana/ui';
import { t } from 'app/core/internationalization';

import { ScopesTree } from './ScopesTree';
import { Node, TreeScope } from './types';

export interface ScopesTreeLevelProps {
  anyChildExpanded: boolean;
  anyChildSelected: boolean;
  isNodeLoading: boolean;
  loadingNodeName: string | undefined;
  node: Node;
  nodePath: string[];
  nodes: Node[];
  scopeNames: string[];
  scopes: TreeScope[];
  onNodeUpdate: (path: string[], isExpanded: boolean, query: string) => void;
  onNodeSelectToggle: (path: string[]) => void;
}

export function ScopesTreeLevel({
  anyChildExpanded,
  anyChildSelected,
  loadingNodeName,
  node,
  nodePath,
  nodes,
  scopeNames,
  scopes,
  onNodeSelectToggle,
  onNodeUpdate,
}: ScopesTreeLevelProps) {
  const styles = useStyles2(getStyles);

  return (
    <div role="tree">
      {nodes.map((childNode) => {
        const isSelected = childNode.isSelectable && scopeNames.includes(childNode.linkId!);

        if (anyChildExpanded && !childNode.isExpanded && !isSelected) {
          return null;
        }

        const childNodePath = [...nodePath, childNode.name];

        const radioName = childNodePath.join('.');

        return (
          <div key={childNode.name} role="treeitem" aria-selected={childNode.isExpanded}>
            <div className={styles.itemTitle}>
              {childNode.isSelectable && !childNode.isExpanded ? (
                node.disableMultiSelect ? (
                  <RadioButtonDot
                    id={radioName}
                    name={radioName}
                    checked={isSelected}
                    label=""
                    data-testid={`scopes-tree-${childNode.name}-radio`}
                    onClick={() => {
                      onNodeSelectToggle(childNodePath);
                    }}
                  />
                ) : (
                  <Checkbox
                    checked={isSelected}
                    data-testid={`scopes-tree-${childNode.name}-checkbox`}
                    onChange={() => {
                      onNodeSelectToggle(childNodePath);
                    }}
                  />
                )
              ) : null}

              {childNode.isExpandable && (
                <IconButton
                  disabled={anyChildSelected && !childNode.isExpanded}
                  name={!childNode.isExpanded ? 'angle-right' : 'angle-down'}
                  aria-label={
                    childNode.isExpanded ? t('scopes.tree.collapse', 'Collapse') : t('scopes.tree.expand', 'Expand')
                  }
                  data-testid={`scopes-tree-${childNode.name}-expand`}
                  onClick={() => {
                    onNodeUpdate(childNodePath, !childNode.isExpanded, childNode.query);
                  }}
                />
              )}
              <span data-testid={`scopes-tree-${childNode.name}-title`}>{childNode.title}</span>
            </div>

            <div className={styles.itemChildren}>
              {childNode.isExpanded && (
                <ScopesTree
                  nodes={node.nodes}
                  nodePath={childNodePath}
                  loadingNodeName={loadingNodeName}
                  scopes={scopes}
                  onNodeUpdate={onNodeUpdate}
                  onNodeSelectToggle={onNodeSelectToggle}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => {
  return {
    itemTitle: css({
      alignItems: 'center',
      display: 'flex',
      gap: theme.spacing(1),
      fontSize: theme.typography.pxToRem(14),
      lineHeight: theme.typography.pxToRem(22),
      padding: theme.spacing(0.5, 0),

      '& > label': css({
        gap: 0,
      }),
    }),
    itemChildren: css({
      paddingLeft: theme.spacing(4),
    }),
  };
};
