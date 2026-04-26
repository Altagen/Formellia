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
  customLinks?: SidebarCustomLink[];
  categories?:  SidebarCategory[];
}
