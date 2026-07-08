import yaml from "js-yaml";
import type { AdminPage } from "@/types/config";

export function buildViewExportData(view: AdminPage): Record<string, unknown> {
  return {
    id:                view.id,
    title:             view.title,
    slug:              view.slug,
    ...(view.icon              !== undefined ? { icon:              view.icon }              : {}),
    widgets:           view.widgets,
    ...(view.dataSourceId      !== undefined ? { dataSourceId:      view.dataSourceId }      : {}),
    ...(view.formInstanceId    !== undefined ? { formInstanceId:    view.formInstanceId }    : {}),
    ...(view.refreshInterval   !== undefined ? { refreshInterval:   view.refreshInterval }   : {}),
    ...(view.interactiveFilter !== undefined ? { interactiveFilter: view.interactiveFilter } : {}),
    ...(view.showCompletionFunnel !== undefined ? { showCompletionFunnel: view.showCompletionFunnel } : {}),
    ...(view.flattenRepeater   !== undefined ? { flattenRepeater:   view.flattenRepeater }   : {}),
    ...(view.folderId          !== undefined ? { folderId:          view.folderId }          : {}),
  };
}

export function serializeViewToYaml(view: AdminPage): string {
  return yaml.dump(buildViewExportData(view), { lineWidth: 120, noRefs: true, indent: 2 });
}
