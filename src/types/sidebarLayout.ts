export interface SidebarCustomLink {
  id: string;
  label: string;
  href: string;
  icon?: string;
}

export interface SidebarCategory {
  id: string;
  name: string;
  emoji: string;
  formIds: string[];
  linkIds?: string[];
  pageIds?: string[];
  itemOrder?: string[]; // ordered prefixed IDs: "page:id" | "form:id" | "link:id"
}

export interface SidebarLayout {
  favorites?:   string[];
  formOrder?:   string[];
  pinnedForms?: string[];
  /** Page ids the user has explicitly hidden from the sidebar. Opt-out model:
   *  a page is shown unless its id is listed here. New views are appended on
   *  creation so the sidebar stays clean until the user pins them. */
  hiddenPages?: string[];
  customLinks?: SidebarCustomLink[];
  categories?:  SidebarCategory[];
}
